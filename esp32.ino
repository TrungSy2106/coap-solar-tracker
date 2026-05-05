#include <WiFi.h>
#include <WiFiUdp.h>
#include <coap-simple.h>
#include <ESP32Servo.h>

const char* WIFI_SSID = "TEN_WIFI";
const char* WIFI_PASS = "MAT_KHAU_WIFI";
const char* COAP_SECRET = "SUNTRAC123";

#define LDR1_PIN 34
#define LDR2_PIN 35
#define LDR3_PIN 32
#define LDR4_PIN 33

#define SERVO1_PIN 18
#define SERVO2_PIN 19

WiFiUDP udp;
Coap coap(udp);

Servo servo1;
Servo servo2;

int servo1Angle = 90;
int servo2Angle = 90;

String mode = "AUTO";
String appState = "NORMAL";
String systemState = "BOOTING";

int readLuxLike(int pin) {
  int raw = analogRead(pin);
  return map(raw, 0, 4095, 0, 1000);
}

void writeServo1(int angle) {
  servo1Angle = constrain(angle, 0, 180);
  servo1.write(servo1Angle);
}

void writeServo2(int angle) {
  servo2Angle = constrain(angle, 0, 180);
  servo2.write(servo2Angle);
}

void autoControlByLdr(int ldr1, int ldr2, int ldr3, int ldr4) {
  if (mode != "AUTO") return;

  int leftAvg = (ldr1 + ldr3) / 2;
  int rightAvg = (ldr2 + ldr4) / 2;
  int topAvg = (ldr1 + ldr2) / 2;
  int bottomAvg = (ldr3 + ldr4) / 2;

  int threshold = 40;

  if (abs(leftAvg - rightAvg) > threshold) {
    if (leftAvg > rightAvg) writeServo2(servo2Angle - 2);
    else writeServo2(servo2Angle + 2);
  }

  if (abs(topAvg - bottomAvg) > threshold) {
    if (topAvg > bottomAvg) writeServo1(servo1Angle + 2);
    else writeServo1(servo1Angle - 2);
  }
}

String buildStateJson() {
  int ldr1 = readLuxLike(LDR1_PIN);
  int ldr2 = readLuxLike(LDR2_PIN);
  int ldr3 = readLuxLike(LDR3_PIN);
  int ldr4 = readLuxLike(LDR4_PIN);

  autoControlByLdr(ldr1, ldr2, ldr3, ldr4);

  appState = "NORMAL";
  systemState = WiFi.status() == WL_CONNECTED ? "RUNNING" : "WIFI_LOST";

  String json = "{";
  json += "\"ldr1\":" + String(ldr1) + ",";
  json += "\"ldr2\":" + String(ldr2) + ",";
  json += "\"ldr3\":" + String(ldr3) + ",";
  json += "\"ldr4\":" + String(ldr4) + ",";
  json += "\"servo1\":" + String(servo1Angle) + ",";
  json += "\"servo2\":" + String(servo2Angle) + ",";
  json += "\"mode\":\"" + mode + "\",";
  json += "\"app_state\":\"" + appState + "\",";
  json += "\"system_state\":\"" + systemState + "\"";
  json += "}";

  return json;
}

String getPayload(CoapPacket &packet) {
  String payload = "";

  for (int i = 0; i < packet.payloadlen; i++) {
    payload += (char)packet.payload[i];
  }

  payload.trim();
  return payload;
}

bool coapAuth(CoapPacket &packet, IPAddress ip, int port, String &outData) {
  String payload = getPayload(packet);
  String secret(COAP_SECRET);

  if (payload == secret) {
    outData = "";
    return true;
  }
  if (payload.startsWith(secret + ":")) {
    outData = payload.substring(secret.length() + 1);
    return true;
  }

  coap.sendResponse(ip, port, packet.messageid, "ERR_UNAUTHORIZED");
  return false;
}

void callbackState(CoapPacket &packet, IPAddress ip, int port) {
  String data;
  if (!coapAuth(packet, ip, port, data)) return;

  String response = buildStateJson();
  coap.sendResponse(ip, port, packet.messageid, response.c_str());
}

void callbackServo1(CoapPacket &packet, IPAddress ip, int port) {
  String data;
  if (!coapAuth(packet, ip, port, data)) return;

  int angle = data.toInt();

  if (mode != "MANUAL") {
    coap.sendResponse(ip, port, packet.messageid, "ERR_AUTO_MODE");
    return;
  }

  writeServo1(angle);
  coap.sendResponse(ip, port, packet.messageid, "OK");
}

void callbackServo2(CoapPacket &packet, IPAddress ip, int port) {
  String data;
  if (!coapAuth(packet, ip, port, data)) return;

  int angle = data.toInt();

  if (mode != "MANUAL") {
    coap.sendResponse(ip, port, packet.messageid, "ERR_AUTO_MODE");
    return;
  }

  writeServo2(angle);
  coap.sendResponse(ip, port, packet.messageid, "OK");
}

void callbackMode(CoapPacket &packet, IPAddress ip, int port) {
  String data;
  if (!coapAuth(packet, ip, port, data)) return;

  data.toUpperCase();

  if (data == "AUTO" || data == "MANUAL") {
    mode = data;
    coap.sendResponse(ip, port, packet.messageid, "OK");
  } else {
    coap.sendResponse(ip, port, packet.messageid, "ERR_INVALID_MODE");
  }
}

void setup() {
  Serial.begin(115200);

  servo1.attach(SERVO1_PIN);
  servo2.attach(SERVO2_PIN);

  writeServo1(servo1Angle);
  writeServo2(servo2Angle);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("ESP IP: ");
  Serial.println(WiFi.localIP());

  coap.server(callbackState, "state");
  coap.server(callbackServo1, "servo1");
  coap.server(callbackServo2, "servo2");
  coap.server(callbackMode, "mode");

  coap.start();

  systemState = "RUNNING";
  Serial.println("CoAP server started");
}

void loop() {
  coap.loop();
}