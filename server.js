const express = require("express");
const path = require("path");
const dgram = require("dgram");
const coapPacket = require("coap-packet");
const fs = require("fs");

const app = express();

const HTTP_PORT = 3000;
let ESP_IP = "192.168.1.50";
let ESP_SECRET = "SUNTRAC123";
const ESP_COAP_PORT = 5683;
const ESP_COAP_TIMEOUT_MS = 4000;

const CONFIG_FILE = path.join(__dirname, "config.json");

// Load persisted config if exists
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const cfg = JSON.parse(raw || "{}");
    ESP_IP = cfg.ip || ESP_IP;
    ESP_SECRET = cfg.secret || ESP_SECRET;
    console.log(`[${new Date().toLocaleTimeString()}] Loaded config from ${CONFIG_FILE}`);
  }
} catch (err) {
  console.log(`[${new Date().toLocaleTimeString()}] ERROR loading config: ${err.message}`);
}

function saveConfig() {
  try {
    const data = { ip: ESP_IP, secret: ESP_SECRET };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf8");
    console.log(`[${new Date().toLocaleTimeString()}] Saved config to ${CONFIG_FILE}`);
    return true;
  } catch (err) {
    console.log(`[${new Date().toLocaleTimeString()}] ERROR saving config: ${err.message}`);
    return false;
  }
}

app.use(express.json());
app.use(express.static("./public"));

function now() {
  return new Date().toLocaleTimeString("vi-VN");
}

function getCoapPayload(payload) {
  if (ESP_SECRET) {
    return `${ESP_SECRET}:${payload || ""}`;
  }
  return payload || "";
}

function logPayload(payload) {
  if (!ESP_SECRET) return payload || "<empty>";
  return payload.replace(ESP_SECRET, "***");
}

function normalizeState(state) {
  return {
    ...state,

    ldr1: Number(state.ldr1 ?? state.lt ?? 0),
    ldr2: Number(state.ldr2 ?? state.rt ?? 0),
    ldr3: Number(state.ldr3 ?? state.ld ?? 0),
    ldr4: Number(state.ldr4 ?? state.rd ?? 0),

    servo1: Number(state.servo1 ?? state.vertical ?? state.v ?? 90),
    servo2: Number(state.servo2 ?? state.horizontal ?? state.h ?? 90),

    mode:
      state.mode ||
      (state.m === "M"
        ? "MANUAL"
        : "AUTO"),

    app_state: state.app_state || "RUNNING",
    system_state: state.system_state || "RUNNING",
  };
}
function sendCoap(pathname, payload, onResponse, onError) {
  const body = getCoapPayload(payload);
  const messageId = Math.floor(Math.random() * 65535);
  const socket = dgram.createSocket("udp4");
  let done = false;

  console.log(`[${now()}] BE -> ESP: POST ${pathname}`);
  console.log(`[${now()}] BE -> ESP MID: ${messageId}`);
  console.log(`[${now()}] BE -> ESP MSG: ${logPayload(body)}`);

  const reqPacket = coapPacket.generate({
    confirmable: true,
    messageId,
    token: Buffer.alloc(0),
    code: "POST",
    options: [
      {
        name: "Uri-Path",
        value: Buffer.from(pathname),
      },
    ],
    payload: Buffer.from(body),
  });

  const timeout = setTimeout(() => {
    if (done) return;
    done = true;
    socket.close();
    const err = new Error(`CoAP timeout after ${ESP_COAP_TIMEOUT_MS}ms`);
    console.log(`[${now()}] ERROR: POST ${pathname} ${err.message}`);
    onError(err);
  }, ESP_COAP_TIMEOUT_MS);

  socket.on("message", (msg, rinfo) => {
    if (done) return;

    let packet;
    try {
      packet = coapPacket.parse(msg);
    } catch (err) {
      console.log(`[${now()}] ERROR: CoAP response parse failed ${err.message}`);
      return;
    }

    if (packet.messageId !== messageId) {
      console.log(`[${now()}] ESP -> BE: ignored MID=${packet.messageId}, expected MID=${messageId}`);
      return;
    }

    done = true;
    clearTimeout(timeout);
    socket.close();

    const responseText = packet.payload ? packet.payload.toString() : "";

    console.log(`[${now()}] ESP -> BE: ${rinfo.address}:${rinfo.port} code=${packet.code} ack=${!!packet.ack} ${pathname}`);
    console.log(`[${now()}] ESP -> BE MID: ${packet.messageId}`);
    console.log(`[${now()}] ESP -> BE TOKEN LEN: ${packet.token ? packet.token.length : 0}`);
    console.log(`[${now()}] ESP -> BE MSG END: ${responseText || "<empty>"}`);

    onResponse(responseText, packet);
  });

  socket.on("error", (err) => {
    if (done) return;
    done = true;
    clearTimeout(timeout);
    socket.close();
    console.log(`[${now()}] ERROR: POST ${pathname} ${err.message}`);
    onError(err);
  });

  socket.bind(() => {
    const address = socket.address();
    console.log(`[${now()}] BE UDP LOCAL: ${address.address}:${address.port}`);

    socket.send(reqPacket, 0, reqPacket.length, ESP_COAP_PORT, ESP_IP, (err) => {
      if (err) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        socket.close();
        console.log(`[${now()}] ERROR: POST ${pathname} ${err.message}`);
        onError(err);
        return;
      }

      console.log(`[${now()}] BE -> ESP BYTES: ${reqPacket.length}`);
    });
  });
}

// Đọc / Cập nhật Cấu hình (IP & Secret)
app.get("/api/config", (req, res) => {
  res.json({ ip: ESP_IP, secret: ESP_SECRET });
});

app.post("/api/config", (req, res) => {
  const { ip, secret } = req.body;
  let updated = false;

  if (ip && typeof ip === "string" && ip.trim() !== "") {
    ESP_IP = ip.trim();
    updated = true;
  }
  if (secret !== undefined && typeof secret === "string") {
    ESP_SECRET = secret.trim();
    updated = true;
  }

  if (updated) {
    console.log(`[${now()}] BE: Cập nhật Config: IP = ${ESP_IP}, Secret = ${ESP_SECRET ? "***" : "none"}`);
    const saved = saveConfig();
    if (!saved) {
      return res.status(500).json({ ok: false, error: "SAVE_FAILED", message: "Không lưu được cấu hình" });
    }
    res.json({ ok: true, ip: ESP_IP, secret: ESP_SECRET });
  } else {
    res.status(400).json({ error: "INVALID_CONFIG", message: "Config không hợp lệ" });
  }
});

// Đọc toàn bộ trạng thái từ ESP
app.get("/api/state", (req, res) => {
  console.log(`[${now()}] FE -> BE: GET /api/state`);

  sendCoap(
    "state",
    "",
    (responseText) => {
      try {
        res.json(normalizeState(JSON.parse(responseText)));
      } catch (err) {
        console.log(`[${now()}] ERROR: ESP JSON sai`);

        res.status(500).json({
          error: "INVALID_JSON_FROM_ESP",
          message: "ESP trả dữ liệu không đúng JSON",
        });
      }
    },
    () => {
      res.status(500).json({
        error: "ESP_OFFLINE",
        message: "Không đọc được dữ liệu từ ESP",
      });
    }
  );
});

// Điều khiển servo dọc
app.post("/api/servo/vertical", (req, res) => {
  console.log(`[${now()}] FE -> BE: POST /api/servo/vertical`, req.body);

  const angle = Number(req.body.angle);

  if (!Number.isInteger(angle) || angle < 0 || angle > 180) {
    console.log(`[${now()}] ERROR: góc servo dọc sai`);

    return res.status(400).json({
      error: "INVALID_ANGLE",
      message: "Góc servo phải từ 0 đến 180",
    });
  }

  sendCoap(
    "servo1",
    String(angle),
    (responseText) => {
      res.json({
        ok: true,
        servo: "vertical",
        angle,
        result: responseText,
      });
    },
    () => {
      res.status(500).json({
        error: "SERVO1_FAILED",
        message: "Không gửi được lệnh servo dọc xuống ESP",
      });
    }
  );
});

// Điều khiển servo ngang
app.post("/api/servo/horizontal", (req, res) => {
  console.log(`[${now()}] FE -> BE: POST /api/servo/horizontal`, req.body);

  const angle = Number(req.body.angle);

  if (!Number.isInteger(angle) || angle < 0 || angle > 180) {
    console.log(`[${now()}] ERROR: góc servo ngang sai`);

    return res.status(400).json({
      error: "INVALID_ANGLE",
      message: "Góc servo phải từ 0 đến 180",
    });
  }

  sendCoap(
    "servo2",
    String(angle),
    (responseText) => {
      res.json({
        ok: true,
        servo: "horizontal",
        angle,
        result: responseText,
      });
    },
    () => {
      res.status(500).json({
        error: "SERVO2_FAILED",
        message: "Không gửi được lệnh servo ngang xuống ESP",
      });
    }
  );
});

// Đổi chế độ AUTO / MANUAL
app.post("/api/mode", (req, res) => {
  console.log(`[${now()}] FE -> BE: POST /api/mode`, req.body);

  const mode = String(req.body.mode || "").toUpperCase();

  if (!["AUTO", "MANUAL"].includes(mode)) {
    console.log(`[${now()}] ERROR: mode sai`);

    return res.status(400).json({
      error: "INVALID_MODE",
      message: "Mode chỉ được là AUTO hoặc MANUAL",
    });
  }

  sendCoap(
    "mode",
    mode,
    (responseText) => {
      res.json({
        ok: true,
        mode,
        result: responseText,
      });
    },
    () => {
      res.status(500).json({
        error: "MODE_FAILED",
        message: "Không gửi được lệnh đổi mode xuống ESP",
      });
    }
  );
});

app.listen(HTTP_PORT, () => {
  console.log(`Web server: http://localhost:${HTTP_PORT}`);
  console.log(`ESP CoAP: coap://${ESP_IP}:${ESP_COAP_PORT}`);
});
