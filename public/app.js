const MAX_POINTS = 16;

let mode = "AUTO";
let verticalAngle = 90;
let horizontalAngle = 90;
let sensorData = [];

const topLeftValue = document.getElementById("topLeftValue");
const topRightValue = document.getElementById("topRightValue");
const bottomLeftValue = document.getElementById("bottomLeftValue");
const bottomRightValue = document.getElementById("bottomRightValue");

const onlineBadge = document.getElementById("onlineBadge");
const onlineText = document.getElementById("onlineText");
const espStatusValue = document.getElementById("espStatusValue");
const appStateValue = document.getElementById("appStateValue");
const espIcon = document.getElementById("espIcon");

const modeText = document.getElementById("modeText");
const modeToggle = document.getElementById("modeToggle");

const verticalValue = document.getElementById("verticalValue");
const horizontalValue = document.getElementById("horizontalValue");
const verticalCard = document.getElementById("verticalCard");
const horizontalCard = document.getElementById("horizontalCard");

const verticalSvg = document.getElementById("verticalSvg");
const horizontalSvg = document.getElementById("horizontalSvg");

const verticalActiveLine = document.getElementById("verticalActiveLine");
const verticalDotOuter = document.getElementById("verticalDotOuter");
const verticalDotInner = document.getElementById("verticalDotInner");

const horizontalFullArc = document.getElementById("horizontalFullArc");
const horizontalActiveArc = document.getElementById("horizontalActiveArc");
const horizontalCenterOuter = document.getElementById("horizontalCenterOuter");
const horizontalCenterInner = document.getElementById("horizontalCenterInner");
const horizontalArcDotOuter = document.getElementById("horizontalArcDotOuter");
const horizontalArcDotInner = document.getElementById("horizontalArcDotInner");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle, sweepFlag = 1) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

function renderVerticalAxis(value) {
  const minY = 145;
  const maxY = 35;
  const y = minY - (value / 180) * (minY - maxY);

  if (document.activeElement !== verticalValue) {
    verticalValue.value = value.toFixed(0);
  }

  verticalActiveLine.setAttribute("x1", "150");
  verticalActiveLine.setAttribute("y1", String(minY));
  verticalActiveLine.setAttribute("x2", "150");
  verticalActiveLine.setAttribute("y2", String(y));

  verticalDotOuter.setAttribute("cx", "150");
  verticalDotOuter.setAttribute("cy", String(y));
  verticalDotInner.setAttribute("cx", "150");
  verticalDotInner.setAttribute("cy", String(y));
}

function renderHorizontalAxis(value) {
  const center = { x: 150, y: 126 };
  const radius = 66;
  const visualAngle = 180 - value;
  const dot = polarToCartesian(center.x, center.y, radius, visualAngle);

  if (document.activeElement !== horizontalValue) {
    horizontalValue.value = value.toFixed(0);
  }

  horizontalFullArc.setAttribute(
    "d",
    describeArc(center.x, center.y, radius, 180, 0, 1)
  );

  horizontalActiveArc.setAttribute(
    "d",
    describeArc(center.x, center.y, radius, 180, visualAngle, 1)
  );

  horizontalCenterOuter.setAttribute("cx", String(center.x));
  horizontalCenterOuter.setAttribute("cy", String(center.y));
  horizontalCenterInner.setAttribute("cx", String(center.x));
  horizontalCenterInner.setAttribute("cy", String(center.y));

  horizontalArcDotOuter.setAttribute("cx", String(dot.x));
  horizontalArcDotOuter.setAttribute("cy", String(dot.y));
  horizontalArcDotInner.setAttribute("cx", String(dot.x));
  horizontalArcDotInner.setAttribute("cy", String(dot.y));
}

function setModeUI(nextMode) {
  mode = nextMode;

  const isAuto = mode === "AUTO";

  modeText.textContent = mode;
  modeToggle.classList.toggle("active", isAuto);
  verticalCard.classList.toggle("disabled", isAuto);
  horizontalCard.classList.toggle("disabled", isAuto);
}

async function sendMode(nextMode) {
  await fetch("/api/mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: nextMode }),
  });
}

async function sendServo(axis, angle) {
  const url =
    axis === "vertical"
      ? "/api/servo/vertical"
      : "/api/servo/horizontal";

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ angle }),
  });
}

function updateVerticalFromPointer(clientY) {
  if (mode !== "MANUAL") return;

  const rect = verticalSvg.getBoundingClientRect();
  const y = ((clientY - rect.top) / rect.height) * 178;

  const minY = 145;
  const maxY = 35;

  verticalAngle = Math.round(
    clamp(((minY - y) / (minY - maxY)) * 180, 0, 180)
  );

  renderVerticalAxis(verticalAngle);
}

function updateHorizontalFromPointer(clientX, clientY) {
  if (mode !== "MANUAL") return;

  const rect = horizontalSvg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 300;
  const y = ((clientY - rect.top) / rect.height) * 178;

  const center = { x: 150, y: 126 };
  const dx = x - center.x;
  const dy = center.y - y;

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  angle = clamp(angle, 0, 180);

  horizontalAngle = Math.round(clamp(180 - angle, 0, 180));

  renderHorizontalAxis(horizontalAngle);
}

verticalSvg.addEventListener("pointerdown", (event) => {
  updateVerticalFromPointer(event.clientY);
  verticalSvg.setPointerCapture(event.pointerId);
});

verticalSvg.addEventListener("pointermove", (event) => {
  if (event.buttons !== 1) return;
  updateVerticalFromPointer(event.clientY);
});

verticalSvg.addEventListener("pointerup", async () => {
  if (mode === "MANUAL") {
    await sendServo("vertical", verticalAngle);
  }
});

horizontalSvg.addEventListener("pointerdown", (event) => {
  updateHorizontalFromPointer(event.clientX, event.clientY);
  horizontalSvg.setPointerCapture(event.pointerId);
});

horizontalSvg.addEventListener("pointermove", (event) => {
  if (event.buttons !== 1) return;
  updateHorizontalFromPointer(event.clientX, event.clientY);
});

horizontalSvg.addEventListener("pointerup", async () => {
  if (mode === "MANUAL") {
    await sendServo("horizontal", horizontalAngle);
  }
});

function applyVerticalInput() {
  if (mode !== "MANUAL") return;
  const val = parseInt(verticalValue.value, 10);
  if (!isNaN(val)) {
    verticalAngle = Math.round(clamp(val, 0, 180));
    renderVerticalAxis(verticalAngle);
    sendServo("vertical", verticalAngle);
  }
}

function applyHorizontalInput() {
  if (mode !== "MANUAL") return;
  const val = parseInt(horizontalValue.value, 10);
  if (!isNaN(val)) {
    horizontalAngle = Math.round(clamp(val, 0, 180));
    renderHorizontalAxis(horizontalAngle);
    sendServo("horizontal", horizontalAngle);
  }
}

verticalValue.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyVerticalInput();
});

horizontalValue.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyHorizontalInput();
});

modeToggle.addEventListener("click", async () => {
  const nextMode = mode === "AUTO" ? "MANUAL" : "AUTO";
  setModeUI(nextMode);
  await sendMode(nextMode);
});

Chart.defaults.font.family = "Roboto, Arial, sans-serif";
Chart.defaults.color = "#64748b";

const chartContext = document.getElementById("sensorChart").getContext("2d");

const sensorChart = new Chart(chartContext, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "Top Left", data: [], borderColor: "#f59e0b", borderWidth: 3, tension: 0.38, pointRadius: 0 },
      { label: "Top Right", data: [], borderColor: "#2563eb", borderWidth: 3, tension: 0.38, pointRadius: 0 },
      { label: "Bottom Left", data: [], borderColor: "#10b981", borderWidth: 3, tension: 0.38, pointRadius: 0 },
      { label: "Bottom Right", data: [], borderColor: "#ef4444", borderWidth: 3, tension: 0.38, pointRadius: 0 },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: true, position: "bottom" },
    },
    scales: {
      x: { grid: { color: "rgba(226,232,240,0.9)" } },
      y: { grid: { color: "rgba(226,232,240,0.9)" } },
    },
  },
});

function updateEspStatus(connected, appState = "", systemState = "") {
  onlineBadge.classList.toggle("offline", !connected);
  onlineText.textContent = connected ? "Online" : "Offline";

  espStatusValue.textContent = connected ? "Online" : "Offline";
  espStatusValue.className = connected ? "esp-value online" : "esp-value offline";
  espIcon.className = connected ? "esp-icon online" : "esp-icon offline";

  if (!connected) {
    appStateValue.textContent = "Trạng thái: ngắt kết nối";
    return;
  }

  appStateValue.textContent = `App: ${appState || "--"} | System: ${systemState || "--"}`;
}

function pushPoint(state) {
  const point = {
    time: new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    topLeft: Number(state.ldr1 ?? 0),
    topRight: Number(state.ldr2 ?? 0),
    bottomLeft: Number(state.ldr3 ?? 0),
    bottomRight: Number(state.ldr4 ?? 0),
  };

  sensorData = [...sensorData.slice(-(MAX_POINTS - 1)), point];

  topLeftValue.textContent = point.topLeft.toFixed(0);
  topRightValue.textContent = point.topRight.toFixed(0);
  bottomLeftValue.textContent = point.bottomLeft.toFixed(0);
  bottomRightValue.textContent = point.bottomRight.toFixed(0);

  sensorChart.data.labels = sensorData.map((item) => item.time);
  sensorChart.data.datasets[0].data = sensorData.map((item) => item.topLeft);
  sensorChart.data.datasets[1].data = sensorData.map((item) => item.topRight);
  sensorChart.data.datasets[2].data = sensorData.map((item) => item.bottomLeft);
  sensorChart.data.datasets[3].data = sensorData.map((item) => item.bottomRight);
  sensorChart.update();
}

async function loadState() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();

    if (!res.ok) {
      updateEspStatus(false);
      return;
    }

    updateEspStatus(true, state.app_state, state.system_state);

    setModeUI(state.mode || "AUTO");

    verticalAngle = Number(state.servo1 ?? 90);
    horizontalAngle = Number(state.servo2 ?? 90);

    renderVerticalAxis(verticalAngle);
    renderHorizontalAxis(horizontalAngle);

    pushPoint(state);
  } catch {
    updateEspStatus(false);
  }
}

setModeUI("AUTO");
renderVerticalAxis(verticalAngle);
renderHorizontalAxis(horizontalAngle);
updateEspStatus(false);

// --- CÀI ĐẶT ---
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const espIpInput = document.getElementById("espIpInput");
const espSecretInput = document.getElementById("espSecretInput");

function openModal() {
  settingsModal.classList.add("active");
  loadConfig();
}
function closeModal() {
  settingsModal.classList.remove("active");
}

settingsBtn.addEventListener("click", openModal);
closeSettingsBtn.addEventListener("click", closeModal);
cancelSettingsBtn.addEventListener("click", closeModal);

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeModal();
});

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      espIpInput.value = data.ip || "";
      espSecretInput.value = data.secret || "";
    }
  } catch (e) {
    console.error("Lỗi lấy Config:", e);
  }
}

saveSettingsBtn.addEventListener("click", async () => {
  const ip = espIpInput.value.trim();
  const secret = espSecretInput.value.trim();
  
  if (!ip) {
    alert("IP không được để trống!");
    return;
  }
  
  const originalText = saveSettingsBtn.textContent;
  saveSettingsBtn.textContent = "Đang lưu...";
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, secret })
    });
    if (res.ok) {
      saveSettingsBtn.style.background = "#10b981";
      saveSettingsBtn.textContent = "Đã lưu!";
      setTimeout(() => {
        saveSettingsBtn.style.background = "";
        saveSettingsBtn.textContent = originalText;
        closeModal();
      }, 1000);
    } else {
      alert("Lỗi khi lưu cấu hình!");
      saveSettingsBtn.textContent = originalText;
    }
  } catch (e) {
    console.error("Lỗi lưu Config:", e);
    alert("Lỗi mạng khi lưu cấu hình!");
    saveSettingsBtn.textContent = originalText;
  }
});

loadConfig();
loadState();
setInterval(loadState, 1500);