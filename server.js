const express = require("express");
const path = require("path");
const coap = require("coap");

const app = express();

const HTTP_PORT = 3000;
let ESP_IP = "192.168.1.50";
let ESP_SECRET = "SUNTRAC123";
const ESP_COAP_PORT = 5683;

app.use(express.json());
app.use(express.static("./public"));

function now() {
  return new Date().toLocaleTimeString("vi-VN");
}

function getCoapPayload(payload) {
  if (ESP_SECRET) {
    return payload ? `${ESP_SECRET}:${payload}` : ESP_SECRET;
  }
  return payload || "";
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
    res.json({ ok: true, ip: ESP_IP, secret: ESP_SECRET });
  } else {
    res.status(400).json({ error: "INVALID_CONFIG", message: "Config không hợp lệ" });
  }
});

// Đọc toàn bộ trạng thái từ ESP
app.get("/api/state", (req, res) => {
  console.log(`[${now()}] FE -> BE: GET /api/state`);
  console.log(`[${now()}] BE -> ESP: GET /state`);

  const coapReq = coap.request({
    hostname: ESP_IP,
    port: ESP_COAP_PORT,
    pathname: "/state",
    method: "GET",
  });

  let responseText = "";
  let responded = false;
  
  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      console.log(`[${now()}] WARN: TIMEOUT GET /state`);
      res.status(504).json({ error: "TIMEOUT", message: "ESP không phản hồi sau 5s" });
    }
  }, 5000);

  coapReq.on("response", (coapRes) => {
    if (responded) return;
    clearTimeout(timer);

    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
      if (responded) return;
      responded = true;
      console.log(`[${now()}] ESP -> BE: /state ${responseText}`);

      try {
        res.json(JSON.parse(responseText));
      } catch (err) {
        console.log(`[${now()}] ERROR: ESP JSON sai`);
        if (!res.headersSent) {
          res.status(500).json({
            error: "INVALID_JSON_FROM_ESP",
            message: "ESP trả dữ liệu không đúng JSON",
          });
        }
      }
    });
  });

  coapReq.on("error", (err) => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    console.log(`[${now()}] ERROR: GET /state ${err.message}`);

    if (!res.headersSent) {
      res.status(500).json({
        error: "ESP_OFFLINE",
        message: "Không đọc được dữ liệu từ ESP",
      });
    }
  });

  const payload = getCoapPayload("");
  if (payload) coapReq.write(payload);
  coapReq.end();
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

  console.log(`[${now()}] BE -> ESP: PUT /servo1 angle=${angle}`);

  const coapReq = coap.request({
    hostname: ESP_IP,
    port: ESP_COAP_PORT,
    pathname: "/servo1",
    method: "PUT",
  });

  let responseText = "";
  let responded = false;
  
  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      console.log(`[${now()}] WARN: TIMEOUT PUT /servo1`);
      res.status(504).json({ error: "TIMEOUT", message: "ESP không phản hồi sau 5s" });
    }
  }, 5000);

  coapReq.on("response", (coapRes) => {
    if (responded) return;
    clearTimeout(timer);

    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
      if (responded) return;
      responded = true;
      console.log(`[${now()}] ESP -> BE: /servo1 ${responseText}`);

      res.json({
        ok: true,
        servo: "vertical",
        angle,
        result: responseText,
      });
    });
  });

  coapReq.on("error", (err) => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    console.log(`[${now()}] ERROR: PUT /servo1 ${err.message}`);

    if (!res.headersSent) {
      res.status(500).json({
        error: "SERVO1_FAILED",
        message: "Không gửi được lệnh servo dọc xuống ESP",
      });
    }
  });

  coapReq.write(getCoapPayload(String(angle)));
  coapReq.end();
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

  console.log(`[${now()}] BE -> ESP: PUT /servo2 angle=${angle}`);

  const coapReq = coap.request({
    hostname: ESP_IP,
    port: ESP_COAP_PORT,
    pathname: "/servo2",
    method: "PUT",
  });

  let responseText = "";
  let responded = false;
  
  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      console.log(`[${now()}] WARN: TIMEOUT PUT /servo2`);
      res.status(504).json({ error: "TIMEOUT", message: "ESP không phản hồi sau 5s" });
    }
  }, 5000);

  coapReq.on("response", (coapRes) => {
    if (responded) return;
    clearTimeout(timer);

    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
      if (responded) return;
      responded = true;
      console.log(`[${now()}] ESP -> BE: /servo2 ${responseText}`);

      res.json({
        ok: true,
        servo: "horizontal",
        angle,
        result: responseText,
      });
    });
  });

  coapReq.on("error", (err) => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    console.log(`[${now()}] ERROR: PUT /servo2 ${err.message}`);

    if (!res.headersSent) {
      res.status(500).json({
        error: "SERVO2_FAILED",
        message: "Không gửi được lệnh servo ngang xuống ESP",
      });
    }
  });

  coapReq.write(getCoapPayload(String(angle)));
  coapReq.end();
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

  console.log(`[${now()}] BE -> ESP: PUT /mode mode=${mode}`);

  const coapReq = coap.request({
    hostname: ESP_IP,
    port: ESP_COAP_PORT,
    pathname: "/mode",
    method: "PUT",
  });

  let responseText = "";
  let responded = false;
  
  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      console.log(`[${now()}] WARN: TIMEOUT PUT /mode`);
      res.status(504).json({ error: "TIMEOUT", message: "ESP không phản hồi sau 5s" });
    }
  }, 5000);

  coapReq.on("response", (coapRes) => {
    if (responded) return;
    clearTimeout(timer);

    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
      if (responded) return;
      responded = true;
      console.log(`[${now()}] ESP -> BE: /mode ${responseText}`);

      res.json({
        ok: true,
        mode,
        result: responseText,
      });
    });
  });

  coapReq.on("error", (err) => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    console.log(`[${now()}] ERROR: PUT /mode ${err.message}`);

    if (!res.headersSent) {
      res.status(500).json({
        error: "MODE_FAILED",
        message: "Không gửi được lệnh đổi mode xuống ESP",
      });
    }
  });

  coapReq.write(getCoapPayload(mode));
  coapReq.end();
});

app.listen(HTTP_PORT, () => {
  console.log(`Web server: http://localhost:${HTTP_PORT}`);
  console.log(`ESP CoAP: coap://${ESP_IP}:${ESP_COAP_PORT}`);
});