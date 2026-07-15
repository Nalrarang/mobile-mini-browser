# Mobile Mini Browser

Tauri 기반의 **반응형 웹 프리뷰용 모바일 미니 브라우저**입니다.
반응형으로 개발된 웹 페이지를 여러 디바이스 크기로, 항상 위에 띄워두고, 여러 개를 나란히 비교하며 확인하는 개발/QA 도구입니다.
이 도구는 순수하게 Claude Code를 사용해서 개발되었습니다. (저는 Rust도 Tauri도 몰라요..)


<img width="737" height="756" alt="스크린샷 2026-07-15 오후 12 39 00" src="https://github.com/user-attachments/assets/a5b88011-d843-4ab7-8d90-66b81e1ae746" />
<img width="374" height="756" alt="스크린샷 2026-07-15 오후 12 38 48" src="https://github.com/user-attachments/assets/07afd0d8-9034-4350-8c6f-fee45327c253" />


## 주요 기능

- **디바이스 프리셋**: iPhone SE / iPhone 12·13·14 Pro / iPhone 15 Pro Max / Galaxy S24·S26 Ultra / Pixel 8 / iPad Mini / Desktop — 3열 카드로 선택
- **커스텀 크기**: 이름·너비·높이를 직접 추가해 저장 (localStorage 유지)
- **즐겨찾기**: 자주 쓰는 사이트를 그룹별로 관리
  - 하단 즐겨찾기 바(툴바 ⭐로 표시/숨김 토글) + 설정 패널 그리드
  - 그룹 칩 필터 · 새 그룹 추가 · 항목 삭제 · 추가 모달(이름/URL/그룹/메모)
- **주소 입력**: 툴바 주소 바 클릭 → 편집, Enter로 이동 (스킴 생략 시 `https://` 자동 보정)
- **로딩 / 오류 화면**: 페이지 이동 시 로딩 표시, 연결 실패·응답 없음이면 오류 화면 + 다시 시도
- **팝업/새창 지원**: `window.open` · `target="_blank"`로 열리는 새 창을 같은 창에서 자연스럽게 이동
- **멀티 윈도우 / Always on Top**: 여러 개를 나란히 비교, 다른 앱 위에 고정(📌 토글)
- **모바일/데스크탑 전환**: 선택한 디바이스 프리셋에 따라 User-Agent 자동 전환
- **토스트 알림**: 이동·추가·삭제·디바이스 전환 등 주요 동작 피드백
- **하단 툴바**: 뒤로(←) / 앞으로(→) / 주소 바(🔒 + 새로고침⟳ + 이동✓) / 즐겨찾기 바 토글(⭐) / 항상 위(📌) / 새 창(➕) / 설정(⚙️)

## 사용법

- **주소 이동**: 툴바 주소 바 클릭 → URL 입력 후 Enter(또는 ✓)
- **디바이스 변경**: ⚙️ 설정 패널 → 디바이스 카드 클릭
- **커스텀 프리셋 추가**: ⚙️ 패널 → `＋ 커스텀 추가` → 이름 / 너비 / 높이 입력 → `추가`
- **즐겨찾기**
  - 툴바 ⭐로 하단 즐겨찾기 바 표시/숨김 (상태는 저장됨)
  - 바 또는 패널의 항목 클릭 → 이동, 항목의 X → 삭제
  - 추가: 즐겨찾기 바 ＋ 또는 패널 "추가" 타일 → 모달에서 이름/URL/그룹/메모 입력
  - 그룹: 칩으로 필터, `+ 새 그룹`으로 새 그룹 생성
- **시작 페이지**: ⚙️ 패널 → `현재로 설정`(다음 실행 시 자동 로드) / `시작 페이지로 가기`

## 키보드 단축키

- **Cmd/Ctrl + K**: 설정 패널 토글
- **Cmd/Ctrl + N**: 새 창
- **Escape**: 모달 → 설정 패널 순으로 닫기

## 제약 사항

- **Google / Apple 소셜 로그인 불가**: 두 provider가 임베디드 웹뷰에서의 OAuth를 정책상 차단합니다(2021~). Tauri뿐 아니라 Electron 등 모든 임베디드 웹뷰가 동일하게 막히며, 앱 내에서 우회할 방법이 없습니다. 해당 로그인이 꼭 필요하면 일반 브라우저를 사용하세요. (리다이렉트·쿠키 기반의 회사 SSO / 자체 로그인은 대부분 정상 동작)
- **화면보다 큰 프리셋**: 세로 크기가 모니터 작업영역보다 크면 자동으로 잘립니다. 폭은 정확하게 유지되고 높이만 화면에 맞게 축소됩니다.
- **오류 화면 범위**: 연결 실패·응답 없음(멈춤)은 감지해 오류 화면을 띄우지만, 서버가 응답하는 404 등은 사이트 자체 페이지가 표시됩니다. 네이티브 웹뷰 위엔 HTML을 올릴 수 없어 로딩·오류·모달은 웹뷰를 잠시 숨기고, 토스트는 하단 크롬 영역에 표시됩니다.

## 개발 환경 설정

### 사전 요구사항

- [Rust](https://www.rust-lang.org/tools/install)

### 설치 & 실행

```bash
# 1. Rust 설치
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 환경변수 로드 (또는 터미널 재시작)
source $HOME/.cargo/env

# 3. Tauri CLI 설치
cargo install tauri-cli

# 4. 개발 모드 실행
cargo tauri dev

# 5. 프로덕션 빌드
cargo tauri build
```

## 프로젝트 구조

```
mobile-mini-browser/
├── src/               # 프론트엔드 (vanilla JS)
│   ├── index.html     # UI (툴바 · 즐겨찾기 바 · 설정 패널 · 모달 · 로딩/오류 오버레이)
│   ├── main.js        # 앱 로직 (디바이스 · 즐겨찾기 · 로딩/오류 워치독 · 토스트)
│   ├── styles.css     # 스타일 (PDS 토큰 기반)
│   └── pds.css        # 디자인 토큰 (색 / 타이포 / radius / shadow)
└── src-tauri/         # Rust 백엔드
    ├── src/
    │   └── lib.rs     # Tauri 커맨드 (창/웹뷰 제어, 팝업 인터셉트, fit, 로드 이벤트)
    ├── icons/         # 애플리케이션 아이콘
    ├── capabilities/  # 권한 설정 (default.json)
    └── Cargo.toml     # Rust 의존성
```

## 기술 세부사항

### 레이아웃

- **창**: 디바이스 뷰포트 + 하단 크롬(즐겨찾기 바 + 툴바). 크롬 높이는 `getBoundingClientRect`로 실측해 `fit_webview`에 반영(북마크 바 토글에 따라 가변). 설정 패널 열림 시 폭에 362px 추가.
- **콘텐츠 웹뷰**: 네이티브 자식 웹뷰를 (0,0)에 배치, 창의 실제 inner 크기 기준으로 자동 맞춤.
- **로딩 / 오류 / 모달**: 네이티브 웹뷰 위엔 HTML을 못 올리므로, 표시 시 자식 웹뷰를 `hide()`하고 메인 웹뷰가 오버레이를 렌더 → 닫으면 `show()`.
- **로드 실패 감지**: `on_page_load`로 로드 시작/완료 이벤트를 받아 워치독으로 판정. 연결 실패 시 이벤트가 오지 않는 점을 이용(네비 시작 시 무장 → 이벤트 오면 해제, 없으면 오류).
- **팝업 인터셉트**: 자식 웹뷰에 init-script를 주입해 `window.open`/`target=_blank`를 같은 창 이동으로 처리.

### 저장소 (localStorage)

- `defaultUrl` — 시작 페이지
- `devicePreset` / `customPresets` — 디바이스 프리셋
- `favorites` — 즐겨찾기 목록
- `bookmarkBarHidden` — 즐겨찾기 바 표시 상태
- `defaultsVersion` — 기본값 마이그레이션 버전

## 권장 IDE 설정

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
