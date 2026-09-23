// BedLog ward matron display — ESP32 + 2 chained HUB75 RGB matrix panels.
//
// Polls the small Node bridge (esp-bridge/server.js) running on the same
// Raspberry Pi as BedLog. Mediboard has no endpoint that returns aggregate
// activity counts (admit/discharge/deceased/lama/abscond) for a ward — only
// per-action endpoints (admit one patient, discharge one, etc.) and a
// bed-status /stats endpoint — so this reads from the bridge instead, which
// computes all 8 numbers from BedLog's own live patient/bed data. BedLog
// already pushes to the bridge on every bed/patient change while online
// (not just once a day), so this stays close to real-time.
//
// Libraries needed (install via Arduino Library Manager):
//   - "ESP32 HUB75 LED MATRIX PANEL DMA Display" by mrfaptastic
//   - "ArduinoJson" by Benoit Blanchon (v6.x)
// Board: any ESP32 dev board (Arduino core for ESP32 installed).

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

// ── EDIT THESE ──────────────────────────────────────────────────────────
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with the Raspberry Pi's actual address and the bridge's port
// (matches PORT in esp-bridge/server.js, default 4001).
const char *BRIDGE_URL = "http://pi.local:4001/display";

// Two 64x32 panels chained side by side = 128x32 total. If yours are
// wired differently, adjust these three.
#define PANEL_RES_X 64
#define PANEL_RES_Y 32
#define PANEL_CHAIN 2

// The bridge only has fresh numbers as often as BedLog syncs (on every
// bed/patient change while online), so polling faster than this mostly
// just re-fetches the same values — 3s keeps the display feeling live
// without hammering the Pi.
const unsigned long REFRESH_MS = 3000;
// ─────────────────────────────────────────────────────────────────────────

#define DISPLAY_WIDTH (PANEL_RES_X * PANEL_CHAIN)

MatrixPanel_I2S_DMA *display = nullptr;

struct WardData {
  String ward = "Connecting...";
  int totalBeds = 0;
  int occupied = 0;
  int available = 0;
  int admit = 0;
  int discharge = 0;
  int deceased = 0;
  int lama = 0;
  int abscond = 0;
  bool valid = false;
};

WardData data;
int scrollX = 0;
unsigned long lastFetch = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected, IP: ");
  Serial.println(WiFi.localIP());
}

bool fetchDisplayData(WardData &out) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(BRIDGE_URL);
  http.setTimeout(4000);
  int code = http.GET();

  if (code != 200) {
    Serial.printf("Bridge GET failed, HTTP %d\n", code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  // Sized generously for the small, flat JSON object /display returns.
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print("JSON parse failed: ");
    Serial.println(err.c_str());
    return false;
  }

  out.ward = doc["ward"] | "Unknown";
  out.totalBeds = doc["totalBeds"] | 0;
  out.occupied = doc["occupied"] | 0;
  out.available = doc["available"] | 0;
  out.admit = doc["admit"] | 0;
  out.discharge = doc["discharge"] | 0;
  out.deceased = doc["deceased"] | 0;
  out.lama = doc["lama"] | 0;
  out.abscond = doc["abscond"] | 0;
  out.valid = true;
  return true;
}

// Draws one "LABEL num" pair at (x, y) in the given color.
void drawStat(int x, int y, const char *label, int value, uint16_t color) {
  display->setTextColor(color);
  display->setCursor(x, y);
  display->print(label);
  display->print(value);
}

void render() {
  display->clearScreen();

  // Ward name header — scrolls if it doesn't fit the panel width.
  display->setTextSize(1);
  display->setTextColor(display->color565(255, 255, 255));
  int nameWidth = data.ward.length() * 6; // default font is 6px/char
  if (nameWidth > DISPLAY_WIDTH) {
    display->setCursor(-scrollX, 0);
    display->print(data.ward);
    scrollX++;
    if (scrollX > nameWidth) scrollX = 0;
  } else {
    display->setCursor((DISPLAY_WIDTH - nameWidth) / 2, 0);
    display->print(data.ward);
  }

  // Three-column grid, 3 rows (9 cells for 8 stats — last cell left
  // blank). Labels are kept to 3-4 chars with no space before the number
  // so "LAMA12" still fits a ~42px-wide column at the default 6px font.
  int colX[3] = {0, DISPLAY_WIDTH / 3, (DISPLAY_WIDTH * 2) / 3};
  int rowY[3] = {9, 16, 23};

  drawStat(colX[0], rowY[0], "ADM", data.admit, display->color565(80, 180, 255));
  drawStat(colX[1], rowY[0], "DIS", data.discharge, display->color565(120, 120, 255));
  drawStat(colX[2], rowY[0], "DEC", data.deceased, display->color565(255, 60, 60));

  drawStat(colX[0], rowY[1], "LAMA", data.lama, display->color565(255, 200, 0));
  drawStat(colX[1], rowY[1], "ABS", data.abscond, display->color565(200, 100, 255));
  drawStat(colX[2], rowY[1], "TOT", data.totalBeds, display->color565(255, 255, 255));

  drawStat(colX[0], rowY[2], "OCC", data.occupied, display->color565(255, 120, 0));
  drawStat(colX[1], rowY[2], "AVL", data.available, display->color565(0, 200, 120));
}

void setup() {
  Serial.begin(115200);
  connectWiFi();

  HUB75_I2S_CFG mxconfig(PANEL_RES_X, PANEL_RES_Y, PANEL_CHAIN);
  display = new MatrixPanel_I2S_DMA(mxconfig);
  display->begin();
  display->setBrightness8(90); // 0-255; lower if it's too bright/hot
  display->clearScreen();
}

void loop() {
  unsigned long now = millis();
  if (now - lastFetch >= REFRESH_MS || lastFetch == 0) {
    lastFetch = now;
    WardData fresh;
    if (fetchDisplayData(fresh)) {
      data = fresh;
    } else if (!data.valid) {
      data.ward = "No data";
    }
  }
  render();
  delay(60); // paced for smooth scrolling without flooding the bridge
}
