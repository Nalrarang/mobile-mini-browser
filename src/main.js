const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const DEFAULT_URL_KEY = "defaultUrl";
const DEFAULT_FALLBACK_URL = "https://www.google.com";
const DEFAULTS_VERSION_KEY = "defaultsVersion";
const APP_DEFAULTS_VERSION = "2"; // 이 값을 올리면 시작페이지·시드 즐겨찾기 기본값을 1회 재적용
const DEVICE_PRESET_KEY = "devicePreset";   // 마지막 선택 프리셋 이름
const CUSTOM_PRESETS_KEY = "customPresets";  // 사용자 추가 프리셋 (JSON 배열)
const FAVORITES_KEY = "favorites";          // 즐겨찾기 (JSON 배열)
const BOOKMARK_BAR_KEY = "bookmarkBarHidden"; // 즐겨찾기 바 숨김 상태 ("1"=숨김)
const PANEL_W = 362;                         // 설정 패널 너비 (styles.css .control-panel과 일치)

// 즐겨찾기 아이콘 팔레트 (신규 추가 시 순번대로 배정 — 목업과 동일)
const FAV_PALETTE = [
  "var(--brand-primary)", "var(--state-positive)", "var(--purple-500)",
  "var(--accent-primary)", "var(--orange-400)", "var(--light-blue-600)",
];

// 초기 시드 즐겨찾기 (쇼핑 그룹 3개)
const SEED_FAVORITES = [
  { name: "지그재그",   letter: "Z", color: "var(--brand-primary)",  group: "쇼핑", memo: "", url: "zigzag.kr" },
  { name: "무신사",     letter: "M", color: "var(--purple-500)",     group: "쇼핑", memo: "", url: "musinsa.com" },
  { name: "네이버쇼핑", letter: "N", color: "var(--state-positive)", group: "쇼핑", memo: "", url: "shopping.naver.com/ns/home" },
];

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

let urlInputEl;
let aotBtn;
let gearBtn;
let loadingScreen;
let controlPanel;
let defaultUrlDisplay;
let deviceGridEl;
let customToggleEl;
let customFormEl;
let customNameEl;
let customWidthEl;
let customHeightEl;
let toolbarEl;
let toolbarUrlEl;
let urlBarEl;
let urlDisplayEl;
let chromeEl;
let starBtn;
let bookmarkStripEl;
let bookmarkListEl;
let favGridEl;
let favGroupFilterEl;
let favModalEl;
let favNameEl;
let favUrlEl;
let favMemoEl;
let favGroupChipsEl;
let favNewGroupRowEl;
let favNewGroupEl;
let favNewGroupAddBtn;
let toastEl;
let navLoadingEl;
let loadErrorEl;
let loadErrorUrlEl;

let isMobileMode = true;
let isAlwaysOnTop = true; // 창은 always_on_top(true)로 생성됨
let deviceW = 375;        // 현재 디바이스 viewport 너비
let deviceH = 667;        // 현재 디바이스 viewport 높이
let currentUrl = "";      // 마지막 이동 URL (실시간 URL 아님)
let currentPresetName = ""; // 현재 선택된 디바이스 프리셋 이름
let favGroup = "";        // 패널 즐겨찾기 섹션의 현재 그룹 필터
let favModalGroup = "";   // 추가 모달에서 선택된 그룹
let modalGroups = [];     // 모달 칩 목록 (도출 그룹 + 이번 모달에서 새로 만든 그룹)
let showNewGroupInput = false; // "새 그룹" 입력행 펼침 여부

// ============================================================================
// Toast (하단 크롬 밴드 — 네이티브 웹뷰 위엔 못 띄우므로 툴바 영역에 표시)
// ============================================================================

let toastTimer = null;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1900);
}

// ============================================================================
// Content load watchdog (콘텐츠 로드 실패 감지)
// 프론트에서 네비게이션을 시작할 때 워치독을 건다. 서버가 응답(on_page_load "started"=commit)
// 하거나 로드가 끝나면(finished) 해제. 아무 이벤트도 안 오면(DNS 실패·연결 불가·멈춤 →
// WKWebView는 이 경우 on_page_load를 아예 안 쏨) 타임아웃 후 오류를 표시한다.
// 서버가 응답하는 404는 commit되어 해제됨 → 사이트 자체 404가 뜸(우리 오류 아님).
// ============================================================================

const LOAD_TIMEOUT_MS = 10000;
let loadWatchdog = null;
let contentOverlay = false; // 로딩/오류 오버레이로 콘텐츠 웹뷰를 가린 상태

// 콘텐츠 웹뷰를 가리고(hide_webview) 지정 오버레이만 보인다. which: "loading" | "error"
async function coverContent(which) {
  navLoadingEl.hidden = which !== "loading";
  loadErrorEl.hidden = which !== "error";
  if (!contentOverlay) {
    contentOverlay = true;
    try { await invoke("hide_webview"); } catch (e) { console.error("hide_webview:", e); }
  }
}

// 오버레이를 걷고 콘텐츠 웹뷰를 다시 보인다.
async function uncoverContent() {
  navLoadingEl.hidden = true;
  loadErrorEl.hidden = true;
  if (contentOverlay) {
    contentOverlay = false;
    try { await invoke("show_webview"); } catch (e) { console.error("show_webview:", e); }
  }
}

// 네비 시작: 로딩 표시 + 워치독 무장. 서버 응답(이벤트)이 없으면 타임아웃에 오류로 전환.
function armLoadWatchdog(url) {
  clearTimeout(loadWatchdog);
  coverContent("loading");
  loadWatchdog = setTimeout(() => showLoadError(url), LOAD_TIMEOUT_MS);
}

// 콘텐츠 로드 이벤트(started/finished) = 서버 도달 → 워치독 해제 + 웹뷰 노출.
function handleContentLoad() {
  clearTimeout(loadWatchdog);
  uncoverContent();
}

async function showLoadError(url) {
  loadErrorUrlEl.textContent = url;
  await coverContent("error");
}

function retryLoadError() {
  urlInputEl.value = loadErrorUrlEl.textContent;
  loadUrl(false); // → armLoadWatchdog → 로딩 표시
}

// ============================================================================
// URL Management
// ============================================================================

async function loadUrl(notify = true) {
  let url = urlInputEl.value.trim();
  if (!url) return;
  // 스킴 없으면 https:// 자동 보정
  if (!/^https?:\/\//i.test(url) && !url.startsWith("about:")) {
    url = "https://" + url;
    urlInputEl.value = url;
  }

  try {
    await invoke("navigate_to_url", { url });
    currentUrl = url;
    updateUrlDisplay();
    hideLoadingScreen();
    armLoadWatchdog(url);
    if (notify) toast(`${url.replace(/^https?:\/\//i, "")} 로 이동`);
  } catch (error) {
    console.error("Navigation error:", error);
  }
}

// ============================================================================
// Toolbar URL bar (idle 텍스트 ↔ 편집 input)
// ============================================================================

function updateUrlDisplay() {
  urlDisplayEl.textContent = currentUrl ? currentUrl.replace(/^https?:\/\//, "") : "새 탭";
}

function openUrlEdit() {
  urlBarEl.classList.add("editing");
  toolbarUrlEl.value = currentUrl || "";
  toolbarUrlEl.focus();
  toolbarUrlEl.select();
}

function closeUrlEdit() {
  urlBarEl.classList.remove("editing");
}

async function submitUrlEdit() {
  const v = toolbarUrlEl.value.trim();
  closeUrlEdit();
  if (!v) return;
  urlInputEl.value = v; // loadUrl이 스킴 보정 + 이동 + currentUrl 갱신
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
  const url = urlInputEl.value.trim();
  if (!url) return;

  localStorage.setItem(DEFAULT_URL_KEY, url);
  updateDefaultUrlDisplay();
  toast("시작 페이지로 설정했습니다");
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
    toast(isAlwaysOnTop ? "항상 위로 고정했습니다" : "항상 위 고정을 해제했습니다");
  } catch (error) {
    console.error("Always on top error:", error);
  }
}

// ============================================================================
// Navigation (toolbar)
// ============================================================================

async function navBack() {
  try { await invoke("webview_back"); toast("뒤로 이동"); }
  catch (error) { console.error("Back error:", error); }
}

async function navForward() {
  try { await invoke("webview_forward"); toast("앞으로 이동"); }
  catch (error) { console.error("Forward error:", error); }
}

async function navReload() {
  try { await invoke("webview_reload"); toast("새로고침"); armLoadWatchdog(currentUrl); }
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

  controlPanel.classList.toggle("open", !isOpen);
  gearBtn.classList.toggle("soft-active", !isOpen);

  try {
    await invoke("resize_window", { width: newWidth, height: deviceH + measureChrome() });
    await fitWebview();
  } catch (error) {
    console.error("Failed to toggle menu:", error);
  }
}

async function closeMenu() {
  if (!controlPanel.classList.contains("open")) return;
  controlPanel.classList.remove("open");
  gearBtn.classList.remove("soft-active");
  try {
    await invoke("resize_window", { width: deviceW, height: deviceH + measureChrome() });
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

function renderDeviceCards() {
  deviceGridEl.innerHTML = "";
  allPresets().forEach((p) => {
    const sel = p.name === currentPresetName;
    const isTablet = p.width >= 700;
    const bodyW = isTablet ? 24 : 18;
    const bodyH = 28;
    const radius = isTablet ? 5 : 7;
    const notchW = isTablet ? 4 : 7;
    const notchH = isTablet ? 4 : 2;

    const card = document.createElement("div");
    card.className = "device-card" + (sel ? " selected" : "");
    card.innerHTML =
      `<div class="device-icon" style="width:${bodyW}px;height:${bodyH}px;border-radius:${radius}px;">` +
      `<div class="device-notch" style="width:${notchW}px;height:${notchH}px;"></div></div>` +
      `<div class="device-caption"><div class="device-name"></div><div class="device-dim"></div></div>`;
    card.querySelector(".device-name").textContent = p.name;
    card.querySelector(".device-dim").textContent = `${p.width}×${p.height}`;
    card.addEventListener("click", () => {
      applyDevice(p);
      toast(`${p.name} · ${p.width}×${p.height} 적용`);
    });
    deviceGridEl.appendChild(card);
  });
}

// 하단 크롬(북마크 스트립+툴바) 실측 높이. 레이아웃 기반이라 신뢰 가능(window.innerHeight 아님).
function measureChrome() {
  return chromeEl ? chromeEl.getBoundingClientRect().height : 44;
}

// 반응형 fit: 현재 창 크기(main webview의 innerWidth/Height = 실측 논리 px)에 맞춰
// 웹뷰를 (창폭 - 패널, 창높이 - 크롬)로 맞춘다. 클램핑/타이틀바/DPR/패널을 모두 흡수.
async function fitWebview() {
  const panelExtra = controlPanel.classList.contains("open") ? PANEL_W : 0;

  // 웹뷰 크기는 Rust의 실제 inner_size 기준으로 맞춘다 (JS innerHeight는 타이틀바만큼 부정확).
  let w, h;
  try {
    [w, h] = await invoke("fit_webview", { panelW: panelExtra, chromeH: measureChrome() });
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
    await invoke("set_device", { winW: preset.width + panelExtra, viewH: preset.height, chromeH: measureChrome() });
    await fitWebview();

    currentPresetName = preset.name;
    localStorage.setItem(DEVICE_PRESET_KEY, preset.name);
    renderDeviceCards();
  } catch (error) {
    console.error("Failed to apply device:", error);
  }
}

function loadDevice() {
  const preset = findPreset(localStorage.getItem(DEVICE_PRESET_KEY)) || BUILTIN_PRESETS[0];
  currentPresetName = preset.name;
  applyDevice(preset);
}

function toggleCustom() {
  if (customFormEl.hasAttribute("hidden")) {
    customFormEl.removeAttribute("hidden");
    customToggleEl.textContent = "닫기";
  } else {
    closeCustom();
  }
}

function closeCustom() {
  customFormEl.setAttribute("hidden", "");
  customToggleEl.textContent = "＋ 커스텀 추가";
  customNameEl.value = "";
  customWidthEl.value = "";
  customHeightEl.value = "";
}

function saveCustom() {
  const name = customNameEl.value.trim();
  const width = parseInt(customWidthEl.value, 10);
  const height = parseInt(customHeightEl.value, 10);
  if (!name || !width || !height) {
    toast("이름·너비·높이를 모두 입력하세요");
    return;
  }
  const customs = getCustomPresets().filter((p) => p.name !== name);
  customs.push({ name, width, height, mobile: true });
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customs));
  closeCustom();
  applyDevice(findPreset(name)); // 적용 + 카드 재렌더(신규 선택)
  toast(`${name} 프리셋을 추가했습니다`);
}

// ============================================================================
// Favorites (즐겨찾기)
// ============================================================================

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

function setFavorites(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

// 데이터에서 도출한 그룹 목록 (등장 순서 유지)
function favGroups() {
  return [...new Set(getFavorites().map((f) => f.group).filter(Boolean))];
}

// 스킴/끝 슬래시 제거 — 별 매칭용. 저장 URL(스킴 없음)과 currentUrl(스킴 있음) 대칭 정규화.
function normUrl(u) {
  return (u || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
}

// 저장된 즐겨찾기 바 표시 상태를 DOM에 복원 (초기 fit 전에 호출 → 크롬 높이 실측이 정확).
// 저장값이 없으면 기본 숨김("0"=표시로 명시 저장된 경우만 표시).
function restoreBookmarkBar() {
  const hidden = localStorage.getItem(BOOKMARK_BAR_KEY) !== "0";
  bookmarkStripEl.hidden = hidden;
  starBtn.classList.toggle("soft-active", !hidden);
}

// 하단 툴바 별 = 즐겨찾기 바(북마크 스트립) 표시/숨김 토글. 크롬 높이가 바뀌므로 창/웹뷰 재fit.
async function toggleBookmarkStrip() {
  const show = bookmarkStripEl.hidden; // 지금 숨김이면 → 보이기로
  bookmarkStripEl.hidden = !show;
  starBtn.classList.toggle("soft-active", show);
  localStorage.setItem(BOOKMARK_BAR_KEY, show ? "0" : "1");
  const panelExtra = controlPanel.classList.contains("open") ? PANEL_W : 0;
  try {
    await invoke("resize_window", { width: deviceW + panelExtra, height: deviceH + measureChrome() });
    await fitWebview();
  } catch (error) {
    console.error("Failed to toggle bookmark strip:", error);
  }
}

function goToFav(fav) {
  urlInputEl.value = fav.url; // loadUrl이 스킴 보정 + 이동 + currentUrl 갱신 + 토스트
  loadUrl();
}

function renderBookmarks() {
  bookmarkListEl.innerHTML = "";
  const favs = getFavorites();
  if (!favs.length) {
    const empty = document.createElement("span");
    empty.className = "bookmark-empty";
    empty.textContent = "즐겨찾기가 없습니다";
    bookmarkListEl.appendChild(empty);
    return;
  }
  favs.forEach((fav, i) => {
    const item = document.createElement("div");
    item.className = "bookmark-item";
    item.innerHTML =
      `<div class="bookmark-badge" style="background:${fav.color}"></div>` +
      `<span class="bookmark-name"></span>` +
      `<button class="bookmark-del" title="삭제"><svg width="11" height="11"><use href="#ic-x"/></svg></button>`;
    item.querySelector(".bookmark-badge").textContent = fav.letter;
    item.querySelector(".bookmark-name").textContent = fav.name;
    item.addEventListener("click", () => goToFav(fav));
    item.querySelector(".bookmark-del").addEventListener("click", (e) => {
      e.stopPropagation(); // 항목 이동 클릭과 분리
      deleteFav(i);
    });
    bookmarkListEl.appendChild(item);
  });
}

function deleteFav(index) {
  const favs = getFavorites();
  const removed = favs[index];
  setFavorites(favs.filter((_, i) => i !== index));
  renderFavorites();
  if (removed) toast(`${removed.name} 삭제됨`);
}

// 그룹 칩 렌더 공통 (필터/모달 둘 다 사용). active 그룹은 채워진 칩.
function renderChips(container, active, onPick) {
  container.innerHTML = "";
  favGroups().forEach((g) => {
    const chip = document.createElement("span");
    chip.className = "chip" + (g === active ? " active" : "");
    chip.textContent = g;
    chip.addEventListener("click", () => onPick(g));
    container.appendChild(chip);
  });
}

function renderGroupFilter() {
  renderChips(favGroupFilterEl, favGroup, (g) => {
    favGroup = g;
    renderGroupFilter();
    renderFavGrid();
  });
}

function renderFavGrid() {
  favGridEl.innerHTML = "";
  const groups = favGroups();
  if (!groups.includes(favGroup)) favGroup = groups[0] || "";

  getFavorites()
    .filter((f) => f.group === favGroup)
    .forEach((fav) => {
      const tile = document.createElement("div");
      tile.className = "fav-tile";
      tile.innerHTML =
        `<div class="fav-tile-icon" style="background:${fav.color}"></div>` +
        `<div class="fav-tile-cap"><div class="fav-tile-name"></div><div class="fav-tile-memo"></div></div>`;
      tile.querySelector(".fav-tile-icon").textContent = fav.letter;
      tile.querySelector(".fav-tile-name").textContent = fav.name;
      tile.querySelector(".fav-tile-memo").textContent = fav.memo || "";
      tile.addEventListener("click", () => goToFav(fav));
      favGridEl.appendChild(tile);
    });

  // 추가 타일 (항상 표시)
  const add = document.createElement("div");
  add.className = "fav-tile fav-add-tile";
  add.innerHTML =
    `<div class="fav-tile-icon"><svg width="20" height="20"><use href="#ic-plus"/></svg></div>` +
    `<div class="fav-tile-cap"><div class="fav-tile-name">추가</div></div>`;
  add.addEventListener("click", () => openFavModal(""));
  favGridEl.appendChild(add);
}

function renderFavorites() {
  // 활성 그룹 필터를 먼저 확정해야 칩과 그리드가 일치한다.
  const groups = favGroups();
  if (!groups.includes(favGroup)) favGroup = groups[0] || "";
  renderBookmarks();
  renderGroupFilter();
  renderFavGrid();
}

// ---- 추가 모달 (열릴 때 child webview hide → 뒤 메인 웹뷰가 풀 렌더) ----

async function openFavModal(prefUrl) {
  // 로딩/오류 오버레이가 떠 있으면 정리 (이후 모달이 웹뷰 hide 상태를 이어받음)
  clearTimeout(loadWatchdog);
  navLoadingEl.hidden = true;
  loadErrorEl.hidden = true;
  contentOverlay = false;
  favNameEl.value = "";
  favUrlEl.value = prefUrl ? "https://" + normUrl(prefUrl) : "";
  favMemoEl.value = "";
  // 칩 목록 = 데이터에서 도출한 그룹. 현재 선택 그룹은 항상 목록에 포함.
  modalGroups = favGroups();
  favModalGroup = favGroup || modalGroups[0] || "쇼핑";
  if (!modalGroups.includes(favModalGroup)) modalGroups.unshift(favModalGroup);
  hideNewGroupInput();
  favNewGroupEl.value = "";
  renderModalChips();
  try { await invoke("hide_webview"); } catch (e) { console.error("hide_webview:", e); }
  favModalEl.hidden = false;
  favNameEl.focus();
}

async function closeFavModal() {
  favModalEl.hidden = true;
  try { await invoke("show_webview"); } catch (e) { console.error("show_webview:", e); }
}

function renderModalChips() {
  favGroupChipsEl.innerHTML = "";
  modalGroups.forEach((g) => {
    const chip = document.createElement("span");
    chip.className = "chip" + (g === favModalGroup ? " active" : "");
    chip.textContent = g;
    chip.addEventListener("click", () => { favModalGroup = g; hideNewGroupInput(); renderModalChips(); });
    favGroupChipsEl.appendChild(chip);
  });
  // "+ 새 그룹" 칩: 펼침 상태면 active(파란 아웃라인)
  const addChip = document.createElement("span");
  addChip.className = "chip new-group-chip" + (showNewGroupInput ? " active" : "");
  addChip.textContent = "+ 새 그룹";
  addChip.addEventListener("click", toggleNewGroupInput);
  favGroupChipsEl.appendChild(addChip);
}

function toggleNewGroupInput() {
  showNewGroupInput = !showNewGroupInput;
  favNewGroupRowEl.hidden = !showNewGroupInput;
  if (showNewGroupInput) { favNewGroupEl.value = ""; favNewGroupEl.focus(); }
  renderModalChips();
}

function hideNewGroupInput() {
  showNewGroupInput = false;
  favNewGroupRowEl.hidden = true;
}

// "추가" — 새 그룹을 칩 목록에 넣고 선택. 실제 저장은 "저장" 시점에 즐겨찾기와 함께.
function addNewGroup() {
  const name = favNewGroupEl.value.trim();
  if (!name) { toast("그룹 이름을 입력하세요"); return; }
  if (!modalGroups.includes(name)) modalGroups.push(name);
  favModalGroup = name;
  hideNewGroupInput();
  renderModalChips();
}

function saveFav() {
  const name = favNameEl.value.trim();
  if (!name) { toast("사이트 이름을 입력하세요"); return; }
  // 새 그룹 입력이 펼쳐진 채 값이 있으면(추가 안 눌러도) 그 그룹을 우선 반영
  const pending = showNewGroupInput ? favNewGroupEl.value.trim() : "";
  const group = pending || favModalGroup || "쇼핑";
  const favs = getFavorites();
  const fav = {
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    color: FAV_PALETTE[favs.length % FAV_PALETTE.length],
    group,
    memo: favMemoEl.value.trim(),
    url: normUrl(favUrlEl.value),
  };
  favs.push(fav);
  setFavorites(favs);
  favGroup = group; // 추가한 그룹으로 필터 이동 → 새 타일 바로 보이게
  closeFavModal();
  renderFavorites();
  toast(`${name} 즐겨찾기에 추가`);
}

// 시작페이지·시드 즐겨찾기 기본값을 버전 단위로 1회 반영.
// 기존 테스트 상태(저장된 시작 URL·즐겨찾기)를 새 기본값으로 갱신하고, 이후엔 사용자 변경을 존중.
function applyDefaultsOnce() {
  if (localStorage.getItem(DEFAULTS_VERSION_KEY) === APP_DEFAULTS_VERSION) return;
  localStorage.removeItem(DEFAULT_URL_KEY); // 저장된 시작 URL 제거 → 새 fallback(google) 적용
  setFavorites(SEED_FAVORITES);             // 즐겨찾기를 새 시드로 재설정
  localStorage.setItem(DEFAULTS_VERSION_KEY, APP_DEFAULTS_VERSION);
}

// ============================================================================
// Initialization
// ============================================================================

window.addEventListener("DOMContentLoaded", () => {
  urlInputEl = document.querySelector("#url-input");
  aotBtn = document.querySelector("#aot-btn");
  gearBtn = document.querySelector("#menu-toggle");
  loadingScreen = document.querySelector("#loading-screen");
  controlPanel = document.querySelector("#control-panel");
  defaultUrlDisplay = document.querySelector("#default-url-display");
  deviceGridEl = document.querySelector("#device-grid");
  customToggleEl = document.querySelector("#custom-toggle");
  customFormEl = document.querySelector("#custom-form");
  customNameEl = document.querySelector("#custom-name");
  customWidthEl = document.querySelector("#custom-width");
  customHeightEl = document.querySelector("#custom-height");
  toolbarEl = document.querySelector("#toolbar");
  toolbarUrlEl = document.querySelector("#toolbar-url");
  urlBarEl = document.querySelector("#url-bar");
  urlDisplayEl = document.querySelector("#url-display");
  chromeEl = document.querySelector("#chrome");
  starBtn = document.querySelector("#star-btn");
  bookmarkStripEl = document.querySelector("#bookmark-strip");
  bookmarkListEl = document.querySelector("#bookmark-list");
  favGridEl = document.querySelector("#fav-grid");
  favGroupFilterEl = document.querySelector("#fav-group-filter");
  favModalEl = document.querySelector("#fav-modal");
  favNameEl = document.querySelector("#fav-name");
  favUrlEl = document.querySelector("#fav-url");
  favMemoEl = document.querySelector("#fav-memo");
  favGroupChipsEl = document.querySelector("#fav-group-chips");
  favNewGroupRowEl = document.querySelector("#fav-new-group-row");
  favNewGroupEl = document.querySelector("#fav-new-group");
  favNewGroupAddBtn = document.querySelector("#fav-new-group-add");
  toastEl = document.querySelector("#toast");
  navLoadingEl = document.querySelector("#nav-loading");
  loadErrorEl = document.querySelector("#load-error");
  loadErrorUrlEl = document.querySelector("#load-error-url");

  // 콘텐츠 로드 이벤트 구독 (초기 loadUrl 전에 등록해야 시작 이벤트를 놓치지 않음)
  listen("content-load", () => handleContentLoad());

  applyDefaultsOnce(); // 새 기본값(시작페이지·시드 즐겨찾기) 1회 반영 — getDefaultUrl/렌더 전에
  urlInputEl.value = getDefaultUrl();
  currentUrl = getDefaultUrl();
  updateUrlDisplay();
  updateDefaultUrlDisplay();
  // 즐겨찾기 렌더+바 표시상태 복원을 loadDevice 전에 → 크롬 높이가 실측돼야 fit이 정확.
  renderFavorites();
  restoreBookmarkBar();
  loadDevice();

  document.querySelector("#nav-back").addEventListener("click", navBack);
  document.querySelector("#nav-forward").addEventListener("click", navForward);
  document.querySelector("#nav-reload").addEventListener("click", navReload);
  aotBtn.addEventListener("click", toggleAlwaysOnTop);
  document.querySelector("#menu-toggle").addEventListener("click", toggleMenu);
  document.querySelector("#menu-close").addEventListener("click", closeMenu);

  // 툴바 주소 바: idle 텍스트 클릭 → 편집, Enter/체크 → 이동, Esc → 취소
  urlDisplayEl.addEventListener("click", openUrlEdit);
  document.querySelector("#url-submit").addEventListener("click", submitUrlEdit);
  toolbarUrlEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitUrlEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); closeUrlEdit(); }
  });

  document.querySelector("#set-default-url-btn").addEventListener("click", setDefaultUrl);

  customToggleEl.addEventListener("click", toggleCustom);
  document.querySelector("#custom-cancel").addEventListener("click", closeCustom);
  document.querySelector("#custom-save").addEventListener("click", saveCustom);

  starBtn.addEventListener("click", toggleBookmarkStrip);
  document.querySelector("#bookmark-add").addEventListener("click", () => openFavModal(currentUrl));
  document.querySelector("#fav-modal-close").addEventListener("click", closeFavModal);
  document.querySelector("#fav-cancel").addEventListener("click", closeFavModal);
  document.querySelector("#fav-save").addEventListener("click", saveFav);
  // 백드롭 클릭 시 닫기 (카드 내부 클릭은 무시)
  favModalEl.addEventListener("click", (e) => { if (e.target === favModalEl) closeFavModal(); });
  favNameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") saveFav(); });
  favUrlEl.addEventListener("keydown", (e) => { if (e.key === "Enter") saveFav(); });
  favMemoEl.addEventListener("keydown", (e) => { if (e.key === "Enter") saveFav(); });
  // 새 그룹: Enter/추가 버튼은 그룹만 추가(즐겨찾기 저장 아님)
  favNewGroupAddBtn.addEventListener("click", addNewGroup);
  favNewGroupEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addNewGroup(); } });

  // 로드 오류 오버레이 (다시 시도만 — 닫기는 실패 페이지로 돌아갈 뿐이라 제거. 주소 재입력은 툴바로 가능)
  document.querySelector("#load-error-retry").addEventListener("click", retryLoadError);

  // 창 크기 변화(프리셋/패널/수동 드래그) 시 웹뷰를 항상 맞춤
  window.addEventListener("resize", fitWebview);

  document.querySelector("#webview-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadUrl();
  });

  document.querySelector("#new-window-btn").addEventListener("click", createNewWindow);
  document.querySelector("#default-url-btn").addEventListener("click", loadDefaultUrl);

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
      if (!favModalEl.hidden) closeFavModal();
      else closeMenu();
    }
  });

  // Initial navigation and loading (시작 자동 이동은 토스트 없이)
  loadUrl(false);
  setTimeout(hideLoadingScreen, 1000);
});
