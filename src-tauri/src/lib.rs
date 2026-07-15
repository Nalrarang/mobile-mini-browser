use tauri::{WebviewUrl, WebviewWindowBuilder, LogicalPosition, LogicalSize, Emitter, Manager};
use tauri::webview::{WebviewBuilder, PageLoadEvent};
use url::Url;
use std::sync::atomic::{AtomicU32, Ordering};

// 전역 창 카운터
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(0);
// 웹뷰 재생성 카운터
static WEBVIEW_RECREATION_COUNTER: AtomicU32 = AtomicU32::new(0);

// 하단 툴바 높이 (콘텐츠 웹뷰는 그 위에 배치됨)
// 하단 배치: 웹뷰 (0,0) + 높이를 줄여 하단에 툴바 공간 확보 (타이틀바와 무관, 검증된 방식)
const TOOLBAR_HEIGHT: f64 = 44.0;
const WINDOW_HEIGHT: f64 = 667.0;
// macOS 타이틀바 대략 높이 (세로 클램핑 계산용 — 창이 작업영역을 넘지 않게)
const TITLEBAR_APPROX: f64 = 28.0;

// User-Agent 상수
const MOBILE_USER_AGENT: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const DESKTOP_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 팝업/새창 인터셉트 스크립트 (페이지 JS보다 먼저, 모든 네비게이션마다 실행됨)
// window.open / target=_blank 를 같은 웹뷰 이동으로 바꿔 모바일 앱처럼 자연스럽게 연다.
// 소셜 로그인(Google/Apple)은 provider가 임베디드 웹뷰를 차단하므로 범위 밖.
const POPUP_INTERCEPT_JS: &str = r#"
(function () {
  window.open = function (url) {
    if (url) {
      try { window.location.href = new URL(url, window.location.href).href; }
      catch (e) { window.location.href = url; }
    }
    // 호출측이 반환값 메서드를 써도 안 깨지게 더미 window 반환
    return {
      closed: false,
      focus: function () {}, blur: function () {},
      close: function () {}, postMessage: function () {},
      location: { href: url || "" }
    };
  };

  document.addEventListener("click", function (e) {
    var el = e.target;
    var a = (el && el.closest) ? el.closest("a") : null;
    if (!a || !a.href) return;
    var t = a.getAttribute("target");
    if (t && t !== "_self") {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = a.href;
    }
  }, true);
})();
"#;

// 헬퍼 함수: 차일드 웹뷰 찾기 (webview-* 패턴으로 검색)
// recreation 웹뷰를 우선적으로 찾고, 없으면 기본 webview-* 찾기
fn find_child_webview(window: &tauri::Window) -> Result<tauri::Webview, String> {
    let mut fallback_webview: Option<tauri::Webview> = None;
    let mut max_recreation_id = -1i32;
    let mut recreation_webview: Option<tauri::Webview> = None;

    for webview in window.webviews() {
        let label = webview.label();

        // webview-recreation-* 패턴 확인 (가장 최신 것 찾기)
        if label.starts_with("webview-recreation-") {
            if let Some(id_str) = label.strip_prefix("webview-recreation-") {
                if let Ok(id) = id_str.parse::<i32>() {
                    if id > max_recreation_id {
                        max_recreation_id = id;
                        recreation_webview = Some(webview.clone());
                    }
                }
            }
        }
        // 기본 webview-* 패턴 (fallback용)
        else if label.starts_with("webview-") && fallback_webview.is_none() {
            fallback_webview = Some(webview.clone());
        }
    }

    // recreation 웹뷰가 있으면 그것을 반환, 없으면 fallback
    recreation_webview
        .or(fallback_webview)
        .ok_or_else(|| "Child webview not found".to_string())
}

#[tauri::command]
fn create_new_window(app: tauri::AppHandle) -> Result<(), String> {
    let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("main-{}", window_id);
    let webview_label = format!("webview-{}", window_id);

    let main_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App("index.html".into())
    )
    .title("Mobile Mini Browser")
    .inner_size(375.0, 667.0)
    .position(100.0 + (window_id as f64 * 30.0), 100.0 + (window_id as f64 * 30.0))
    .always_on_top(true)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    let window = main_window.as_ref().window();
    window.add_child(
        WebviewBuilder::new(
            &webview_label,
            WebviewUrl::External(Url::parse("about:blank").unwrap())
        )
        .user_agent(MOBILE_USER_AGENT)
        .initialization_script(POPUP_INTERCEPT_JS),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(375.0, WINDOW_HEIGHT - TOOLBAR_HEIGHT)
    )
    .map_err(|e| format!("Failed to add webview: {}", e))?;

    Ok(())
}

#[tauri::command]
fn navigate_to_url(window: tauri::Window, url: String) -> Result<(), String> {
    if Url::parse(&url).is_err() {
        return Err("Invalid URL format".to_string());
    }

    let webview = find_child_webview(&window)?;
    webview.navigate(Url::parse(&url).unwrap())
        .map_err(|e| format!("Failed to navigate: {}", e))
}

#[tauri::command]
fn open_devtools(window: tauri::Window) -> Result<(), String> {
    let webview = find_child_webview(&window)?;
    webview.open_devtools();
    Ok(())
}

#[tauri::command]
fn webview_back(window: tauri::Window) -> Result<(), String> {
    let webview = find_child_webview(&window)?;
    webview.eval("history.back()")
        .map_err(|e| format!("Failed to go back: {}", e))
}

#[tauri::command]
fn webview_forward(window: tauri::Window) -> Result<(), String> {
    let webview = find_child_webview(&window)?;
    webview.eval("history.forward()")
        .map_err(|e| format!("Failed to go forward: {}", e))
}

#[tauri::command]
fn webview_reload(window: tauri::Window) -> Result<(), String> {
    let webview = find_child_webview(&window)?;
    webview.eval("location.reload()")
        .map_err(|e| format!("Failed to reload: {}", e))
}

#[tauri::command]
fn resize_window(window: tauri::Window, width: f64, height: f64) -> Result<(), String> {
    window.set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to resize window: {}", e))
}

// 디바이스 프리셋 적용 — 창만 리사이즈한다. 웹뷰 크기는 프론트의 반응형 fit(resize 이벤트)이 맞춘다.
// win_w: 창 폭(패널 열림이면 viewport폭 + 패널폭). view_h: viewport 높이. chrome_h: 하단 크롬(북마크 스트립+툴바) 실측 높이.
// 화면 작업영역보다 큰 프리셋은 세로를 캡핑해 창이 잘리지 않게 한다.
#[tauri::command]
fn set_device(window: tauri::Window, win_w: f64, view_h: f64, chrome_h: f64) -> Result<(), String> {
    let max_view_h = match window.current_monitor() {
        Ok(Some(m)) => {
            let work_h = m.work_area().size.height as f64 / m.scale_factor();
            (work_h - TITLEBAR_APPROX - chrome_h).max(200.0)
        }
        _ => view_h,
    };
    let wv_h = view_h.min(max_view_h);
    window.set_size(LogicalSize::new(win_w, wv_h + chrome_h))
        .map_err(|e| format!("Failed to resize window: {}", e))
}

// 웹뷰를 실제 창 inner 크기에 맞춘다 (JS window.innerHeight는 macOS 타이틀바 safe-area만큼
// 실제보다 작게 보고되므로 반드시 Rust inner_size 기준으로 계산). 웹뷰 = (inner_w - panel_w) x (inner_h - chrome_h).
// chrome_h는 프론트가 크롬 컨테이너를 실측해 넘긴다(북마크 스트립 추가로 44px 고정이 아님).
// 반환: 적용한 (webview 폭, webview 높이) 논리 px.
#[tauri::command]
fn fit_webview(window: tauri::Window, panel_w: f64, chrome_h: f64) -> Result<(f64, f64), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let inner_w = inner.width as f64 / scale;
    let inner_h = inner.height as f64 / scale;
    let w = (inner_w - panel_w).max(0.0);
    let h = (inner_h - chrome_h).max(0.0);

    let webview = find_child_webview(&window)?;
    let _ = webview.set_position(LogicalPosition::new(0.0, 0.0));
    webview.set_size(LogicalSize::new(w, h))
        .map_err(|e| format!("Failed to resize webview: {}", e))?;
    Ok((w, h))
}

// 즐겨찾기 추가 모달용: child webview를 숨겨 뒤의 메인 웹뷰가 모달을 풀 렌더하게 한다.
#[tauri::command]
fn hide_webview(window: tauri::Window) -> Result<(), String> {
    find_child_webview(&window)?.hide()
        .map_err(|e| format!("Failed to hide webview: {}", e))
}

#[tauri::command]
fn show_webview(window: tauri::Window) -> Result<(), String> {
    find_child_webview(&window)?.show()
        .map_err(|e| format!("Failed to show webview: {}", e))
}

#[tauri::command]
fn set_always_on_top(window: tauri::Window, always_on_top: bool) -> Result<(), String> {
    window.set_always_on_top(always_on_top)
        .map_err(|e| format!("Failed to set always on top: {}", e))
}

#[tauri::command]
fn set_user_agent(window: tauri::Window, is_mobile: bool, current_url: String) -> Result<(), String> {
    let user_agent = if is_mobile {
        MOBILE_USER_AGENT
    } else {
        DESKTOP_USER_AGENT
    };

    // 현재 웹뷰 찾기 및 정보 저장
    let old_webview = find_child_webview(&window)?;
    let webview_size = old_webview.size().map_err(|e| format!("Failed to get size: {}", e))?;

    // 기존 웹뷰 닫기 시도
    let _ = old_webview.close();

    // 새로운 고유 라벨 생성
    let recreation_id = WEBVIEW_RECREATION_COUNTER.fetch_add(1, Ordering::SeqCst);
    let new_webview_label = format!("webview-recreation-{}", recreation_id);

    // 새 URL 파싱
    let url_to_load = if current_url.is_empty() || current_url == "about:blank" {
        Url::parse("about:blank").unwrap()
    } else {
        Url::parse(&current_url).map_err(|e| format!("Invalid URL: {}", e))?
    };

    // 새 웹뷰 생성 with User-Agent
    window.add_child(
        WebviewBuilder::new(
            &new_webview_label,
            WebviewUrl::External(url_to_load)
        )
        .user_agent(user_agent)
        .initialization_script(POPUP_INTERCEPT_JS),
        LogicalPosition::new(0.0, 0.0),
        webview_size
    )
    .map_err(|e| format!("Failed to create new webview: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            create_new_window,
            navigate_to_url,
            open_devtools,
            webview_back,
            webview_forward,
            webview_reload,
            resize_window,
            set_device,
            fit_webview,
            hide_webview,
            show_webview,
            set_always_on_top,
            set_user_agent
        ])
        // 콘텐츠 웹뷰(webview-*)의 로드 시작/완료를 메인 UI 웹뷰로 전달 → 프론트가 워치독으로 로드 실패 감지.
        .on_page_load(|webview, payload| {
            let label = webview.label().to_string();
            if !label.starts_with("webview-") { return; } // 메인 UI 웹뷰 제외
            let status = if matches!(payload.event(), PageLoadEvent::Started) { "started" } else { "finished" };
            let _ = webview.app_handle().emit("content-load", format!("{}|{}", status, payload.url()));
        })
        .setup(|app| {
            // 고유한 창 ID 생성 (여러 인스턴스 허용)
            let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
            let window_label = format!("main-{}", window_id);
            let webview_label = format!("webview-{}", window_id);

            let main_window = WebviewWindowBuilder::new(
                app,
                &window_label,
                WebviewUrl::App("index.html".into())
            )
            .title("Mobile Mini Browser")
            .inner_size(375.0, 667.0)
            .position(100.0, 100.0)
            .always_on_top(true)
            .build()
            .expect("Failed to create main window");

            // 차일드 웹뷰 추가 (초기 URL은 about:blank, JavaScript에서 저장된 URL로 네비게이션)
            // 기본적으로 모바일 User-Agent 설정
            let window = main_window.as_ref().window();
            window.add_child(
                WebviewBuilder::new(
                    &webview_label,
                    WebviewUrl::External(Url::parse("about:blank").unwrap())
                )
                .user_agent(MOBILE_USER_AGENT)
                .initialization_script(POPUP_INTERCEPT_JS),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(375.0, WINDOW_HEIGHT - TOOLBAR_HEIGHT)
            )
            .expect("Failed to add child webview");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
