const { invoke } = window.__TAURI__.core;

// Constants
const DEFAULT_URL_KEY = "defaultUrl";
const DEFAULT_FALLBACK_URL = "";
const DEVICE_PRESET_KEY = "devicePreset";   // 마지막 선택 프리셋 이름
const CUSTOM_PRESETS_KEY = "customPresets";  // 사용자 추가 프리셋 (JSON 배열)
const TOOLBAR_H = 44;                        // lib.rs TOOLBAR_HEIGHT와 일치
const PANEL_W = 350;                         // 설정 패널 너비 (styles.css .control-panel과 일치)

// 내장 디바이스 프리셋 (viewport = 웹뷰 크기, 세로 기준)
const BUILTIN_PRESETS = [
  { name: "iPhone SE",           width: 375,  height: 667,  mobile: true },
  { name: "iPhone 12/13/14 Pro", width: 390,  height: 844,  mobile: true },
  { name: "iPhone 15 Pro Max",   width: 430,  height: 932,  mobile: true },
  { name: "Galaxy S24 Ultra",    width: 384,  height: 832,  mobile: true },
  { name: "Galaxy S26 Ultra",    width: 412,  height: 915,  mobile: true },
  { name: "Pixel 8",             width: 412,  height: 915,  mobile: true },
  { name: "iPad Mini",           width: 768,  height: 1024, mobile: true },
  { name: "Desktop",             width: 1280, height: 800,  mobile: false },
];

// DOM Elements
let urlInputEl;
let aotBtn;
let loadingScreen;
let controlPanel;
let defaultUrlDisplay;
let deviceSelectEl;
let customNameEl;
let customWidthEl;
let customHeightEl;
let toolbarEl;
let toolbarUrlEl;

// State
let isMobileMode = true; // Default to mobile mode
let isAlwaysOnTop = true; // 창은 always_on_top(true)로 생성됨
let deviceW = 375;        // 현재 디바이스 viewport 너비
let deviceH = 667;        // 현재 디바이스 viewport 높이

// ============================================================================
// URL Management
// ============================================================================

async function loadUrl() {
  let url = urlInputEl.value.trim();
  if (!url) return;
  // 스킴 없으면 https:// 자동 보정
  if (!/^https?:\/\//i.test(url) && !url.startsWith("about:")) {
    url = "https://" + url;
    urlInputEl.value = url;
  }

  try {
    await invoke("navigate_to_url", { url });
    hideLoadingScreen();
  } catch (error) {
    console.error("Navigation error:", error);
  }
}

// ============================================================================
// Toolbar URL input (🔗)
// ============================================================================

function openToolbarUrl() {
  toolbarEl.classList.add("url-open");
  toolbarUrlEl.value = urlInputEl.value || "";
  toolbarUrlEl.focus();
  toolbarUrlEl.select();
}

function closeToolbarUrl() {
  toolbarEl.classList.remove("url-open");
}

async function submitToolbarUrl() {
  const url = toolbarUrlEl.value.trim();
  closeToolbarUrl();
  if (!url) return;
  urlInputEl.value = url; // 패널 입력과 동기화 후 loadUrl이 스킴 보정+이동
  await loadUrl();
}

function getDefaultUrl() {
  return localStorage.getItem(DEFAULT_URL_KEY) || DEFAULT_FALLBACK_URL;
}

function updateDefaultUrlDisplay() {
  const savedUrl = localStorage.getItem(DEFAULT_URL_KEY);
  if (savedUrl) {
    defaultUrlDisplay.textContent = savedUrl;
    defaultUrlDisplay.style.color = "#0f0f0f";
  } else {
    defaultUrlDisplay.textContent = "Not set";
    defaultUrlDisplay.style.color = "#999";
  }
}

function setDefaultUrl() {
  const currentUrl = urlInputEl.value.trim();
  if (!currentUrl) return;

  localStorage.setItem(DEFAULT_URL_KEY, currentUrl);
  updateDefaultUrlDisplay();
  alert(`Default URL set to:\n${currentUrl}`);
}

function clearDefaultUrl() {
  localStorage.removeItem(DEFAULT_URL_KEY);
  urlInputEl.value = DEFAULT_FALLBACK_URL;
  updateDefaultUrlDisplay();
  alert("Default URL cleared. Reset to fallback URL.");
}

function loadDefaultUrl() {
  urlInputEl.value = getDefaultUrl();
  loadUrl();
}

// ============================================================================
// DevTools & Window Controls
// ============================================================================

async function createNewWindow() {
  try {
    await invoke("create_new_window");
  } catch (error) {
    console.error("Failed to create new window:", error);
  }
}

async function toggleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  aotBtn.classList.toggle("active", isAlwaysOnTop);
  try {
    await invoke("set_always_on_top", { alwaysOnTop: isAlwaysOnTop });
  } catch (error) {
    console.error("Always on top error:", error);
  }
}

// ============================================================================
// Navigation (toolbar)
// ============================================================================

async function navBack() {
  try { await invoke("webview_back"); }
  catch (error) { console.error("Back error:", error); }
}

async function navForward() {
  try { await invoke("webview_forward"); }
  catch (error) { console.error("Forward error:", error); }
}

async function navReload() {
  try { await invoke("webview_reload"); }
  catch (error) { console.error("Reload error:", error); }
}

function hideLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.style.display = "none";
  }
}

// ============================================================================
// Menu Controls
// ============================================================================

async function toggleMenu() {
  const isOpen = controlPanel.classList.contains("open");
  const newWidth = isOpen ? deviceW : deviceW + PANEL_W;

  if (isOpen) {
    controlPanel.classList.remove("open");
  } else {
    controlPanel.classList.add("open");
  }

  try {
    await invoke("resize_window", { width: newWidth, height: deviceH + TOOLBAR_H });
    await fitWebview();
  } catch (error) {
    console.error("Failed to toggle menu:", error);
  }
}

async function closeMenu() {
  if (!controlPanel.classList.contains("open")) return;
  controlPanel.classList.remove("open");
  try {
    await invoke("resize_window", { width: deviceW, height: deviceH + TOOLBAR_H });
    await fitWebview();
  } catch (error) {
    console.error("Failed to close menu:", error);
  }
}

// ============================================================================
// Device Presets
// ============================================================================

function getCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY)) || [];
  } catch {
    return [];
  }
}

function allPresets() {
  return [...BUILTIN_PRESETS, ...getCustomPresets()];
}

function findPreset(name) {
  return allPresets().find((p) => p.name === name);
}

function populateDeviceSelect() {
  deviceSelectEl.innerHTML = allPresets()
    .map((p) => `<option value="${p.name}">${p.name} (${p.width}×${p.height})</option>`)
    .join("");
}

// 반응형 fit: 현재 창 크기(main webview의 innerWidth/Height = 실측 논리 px)에 맞춰
// 웹뷰를 (창폭 - 패널, 창높이 - 툴바)로 맞춘다. 클램핑/타이틀바/DPR/패널을 모두 흡수.
async function fitWebview() {
  const panelExtra = controlPanel.classList.contains("open") ? PANEL_W : 0;

  // 웹뷰 크기는 Rust의 실제 inner_size 기준으로 맞춘다 (JS innerHeight는 타이틀바만큼 부정확).
  let w, h;
  try {
    [w, h] = await invoke("fit_webview", { panelW: panelExtra });
  } catch (error) {
    console.error("Failed to fit webview:", error);
    return;
  }

  deviceW = w;
  deviceH = h;
  document.documentElement.style.setProperty("--device-w", w + "px");
}

async function applyDevice(preset) {
  if (!preset) return;

  try {
    // UA(모바일/데스크탑)가 바뀌면 웹뷰 재생성
    if (preset.mobile !== isMobileMode) {
      await invoke("set_user_agent", {
        isMobile: preset.mobile,
        currentUrl: urlInputEl.value.trim() || "about:blank",
      });
      isMobileMode = preset.mobile;
    }

    // 창만 리사이즈 (패널 열림이면 폭에 패널 몫 추가). 웹뷰는 fitWebview가 맞춤.
    const panelExtra = controlPanel.classList.contains("open") ? PANEL_W : 0;
    await invoke("set_device", { winW: preset.width + panelExtra, viewH: preset.height });
    await fitWebview();

    localStorage.setItem(DEVICE_PRESET_KEY, preset.name);
    if (deviceSelectEl.value !== preset.name) deviceSelectEl.value = preset.name;
  } catch (error) {
    console.error("Failed to apply device:", error);
  }
}

function loadDevice() {
  const preset = findPreset(localStorage.getItem(DEVICE_PRESET_KEY)) || BUILTIN_PRESETS[0];
  deviceSelectEl.value = preset.name;
  applyDevice(preset);
}

function addCustomPreset() {
  const name = customNameEl.value.trim();
  const width = parseInt(customWidthEl.value, 10);
  const height = parseInt(customHeightEl.value, 10);
  if (!name || !width || !height) {
    alert("Name, Width, Height를 모두 입력하세요.");
    return;
  }

  const customs = getCustomPresets().filter((p) => p.name !== name);
  customs.push({ name, width, height, mobile: true });
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customs));

  customNameEl.value = "";
  customWidthEl.value = "";
  customHeightEl.value = "";
  populateDeviceSelect();
  deviceSelectEl.value = name;
  applyDevice(findPreset(name));
}

// ============================================================================
// Initialization
// ============================================================================

window.addEventListener("DOMContentLoaded", () => {
  // Initialize DOM elements
  urlInputEl = document.querySelector("#url-input");
  aotBtn = document.querySelector("#aot-btn");
  loadingScreen = document.querySelector("#loading-screen");
  controlPanel = document.querySelector("#control-panel");
  defaultUrlDisplay = document.querySelector("#default-url-display");
  deviceSelectEl = document.querySelector("#device-select");
  customNameEl = document.querySelector("#custom-name");
  customWidthEl = document.querySelector("#custom-width");
  customHeightEl = document.querySelector("#custom-height");
  toolbarEl = document.querySelector("#toolbar");
  toolbarUrlEl = document.querySelector("#toolbar-url");

  // Load saved state
  urlInputEl.value = getDefaultUrl();
  updateDefaultUrlDisplay();
  populateDeviceSelect();
  loadDevice();

  // Toolbar controls
  document.querySelector("#nav-back").addEventListener("click", navBack);
  document.querySelector("#nav-forward").addEventListener("click", navForward);
  document.querySelector("#nav-reload").addEventListener("click", navReload);
  aotBtn.addEventListener("click", toggleAlwaysOnTop);
  document.querySelector("#menu-toggle").addEventListener("click", toggleMenu);
  document.querySelector("#menu-close").addEventListener("click", closeMenu);

  // 툴바 URL 입력 (🔗)
  document.querySelector("#url-toggle").addEventListener("click", () => {
    toolbarEl.classList.contains("url-open") ? closeToolbarUrl() : openToolbarUrl();
  });
  toolbarUrlEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitToolbarUrl(); }
    else if (e.key === "Escape") { e.preventDefault(); closeToolbarUrl(); }
  });

  // Settings controls
  document.querySelector("#set-default-url-btn").addEventListener("click", setDefaultUrl);
  document.querySelector("#clear-default-url-btn").addEventListener("click", clearDefaultUrl);

  // Device preset controls
  deviceSelectEl.addEventListener("change", () => applyDevice(findPreset(deviceSelectEl.value)));
  document.querySelector("#add-preset-btn").addEventListener("click", addCustomPreset);

  // 창 크기 변화(프리셋/패널/수동 드래그) 시 웹뷰를 항상 맞춤
  window.addEventListener("resize", fitWebview);

  // Form submissions
  document.querySelector("#webview-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadUrl();
  });

  // Quick actions
  document.querySelector("#new-window-btn").addEventListener("click", createNewWindow);
  document.querySelector("#default-url-btn").addEventListener("click", loadDefaultUrl);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      toggleMenu();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      createNewWindow();
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  });

  // Initial navigation and loading
  loadUrl();
  setTimeout(hideLoadingScreen, 1000);
});
