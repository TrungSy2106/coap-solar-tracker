const express = require("express");
const path = require("path");
const coap = require("coap");

const app = express();

const HTTP_PORT = 3000;
const ESP_IP = "192.168.1.50";
const ESP_COAP_PORT = 5683;

app.use(express.json());
app.use(express.static("./public"));

function now() {
  return new Date().toLocaleTimeString("vi-VN");
}

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

  coapReq.on("response", (coapRes) => {
    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
      console.log(`[${now()}] ESP -> BE: /state ${responseText}`);

      try {
        res.json(JSON.parse(responseText));
      } catch (err) {
        console.log(`[${now()}] ERROR: ESP JSON sai`);

        res.status(500).json({
          error: "INVALID_JSON_FROM_ESP",
          message: "ESP trả dữ liệu không đúng JSON",
        });
      }
    });
  });

  coapReq.on("error", (err) => {
    console.log(`[${now()}] ERROR: GET /state ${err.message}`);

    res.status(500).json({
      error: "ESP_OFFLINE",
      message: "Không đọc được dữ liệu từ ESP",
    });
  });

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

  coapReq.on("response", (coapRes) => {
    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
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
    console.log(`[${now()}] ERROR: PUT /servo1 ${err.message}`);

    res.status(500).json({
      error: "SERVO1_FAILED",
      message: "Không gửi được lệnh servo dọc xuống ESP",
    });
  });

  coapReq.write(JSON.stringify({ angle }));
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

  coapReq.on("response", (coapRes) => {
    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
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
    console.log(`[${now()}] ERROR: PUT /servo2 ${err.message}`);

    res.status(500).json({
      error: "SERVO2_FAILED",
      message: "Không gửi được lệnh servo ngang xuống ESP",
    });
  });

  coapReq.write(JSON.stringify({ angle }));
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

  coapReq.on("response", (coapRes) => {
    coapRes.on("data", (chunk) => {
      responseText += chunk.toString();
    });

    coapRes.on("end", () => {
      console.log(`[${now()}] ESP -> BE: /mode ${responseText}`);

      res.json({
        ok: true,
        mode,
        result: responseText,
      });
    });
  });

  coapReq.on("error", (err) => {
    console.log(`[${now()}] ERROR: PUT /mode ${err.message}`);

    res.status(500).json({
      error: "MODE_FAILED",
      message: "Không gửi được lệnh đổi mode xuống ESP",
    });
  });

  coapReq.write(JSON.stringify({ mode }));
  coapReq.end();
});

app.listen(HTTP_PORT, () => {
  console.log(`Web server: http://localhost:${HTTP_PORT}`);
  console.log(`ESP CoAP: coap://${ESP_IP}:${ESP_COAP_PORT}`);
});