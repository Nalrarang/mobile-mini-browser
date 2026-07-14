# Mobile Mini Browser

Tauri 기반의 **반응형 웹 프리뷰용 모바일 미니 브라우저**입니다.
반응형으로 개발된 웹 페이지를 여러 디바이스 크기로, 항상 위에 띄워두고, 여러 개를 나란히 비교하며 확인하는 개발/QA 도구입니다.
이 도구는 순수하게 Claude Code를 사용해서 개발되었습니다.(저는 Rust도 모르고 Tauri도 몰라요..)

## 주요 기능

- **디바이스 프리셋**: iPhone SE / iPhone 12·13·14 Pro / iPhone 15 Pro Max / Galaxy S24·S26 Ultra / Pixel 8 / iPad Mini / Desktop
- **커스텀 크기**: 이름·너비·높이를 직접 추가해 저장 (localStorage에 유지)
- **팝업/새창 지원**: `window.open` · `target="_blank"`로 열리는 새 창을 같은 창에서 자연스럽게 이동 (예: 상품 클릭 시 상세로 이동)
- **상시 하단 툴바**: 뒤로(←) / 앞으로(→) / 새로고침(⟳) / 주소 입력(🔗) / 항상 위(📌) / 새 창(➕) / 설정(⚙️)
- **멀티 윈도우**: 여러 개를 띄워 한 화면에서 서로 다른 페이지를 나란히 비교
- **Always on Top**: 다른 앱 위에 프리뷰 고정 (📌 토글)
- **모바일/데스크탑 전환**: 선택한 디바이스 프리셋에 따라 User-Agent 자동 전환

## 사용법

- **주소 이동**: 툴바 🔗 → 입력창에 URL 입력 후 Enter (스킴 생략 시 `https://` 자동 보정)
- **디바이스 변경**: ⚙️ 설정 패널 → `Device` 드롭다운에서 선택
- **커스텀 프리셋 추가**: ⚙️ 패널 → `Name` / `W` / `H` 입력 → `＋ Add preset`
- **시작 기본 URL**: ⚙️ 패널에서 `Set as Default URL` (다음 실행 시 자동 로드)

## 키보드 단축키

- **Cmd/Ctrl + K**: 설정 패널 토글
- **Cmd/Ctrl + N**: 새 창
- **Escape**: 설정 패널 닫기

## 제약 사항

- **Google / Apple 소셜 로그인 불가**: 두 provider가 임베디드 웹뷰에서의 OAuth를 정책상 차단합니다(2021~). Tauri뿐 아니라 Electron 등 모든 임베디드 웹뷰가 동일하게 막히며, 앱 내에서 우회할 방법이 없습니다. 해당 로그인이 꼭 필요하면 일반 브라우저를 사용하세요. (리다이렉트·쿠키 기반의 회사 SSO / 자체 로그인은 대부분 정상 동작)
- **화면보다 큰 프리셋**: 세로 크기가 모니터 작업영역보다 크면 자동으로 잘립니다. 폭은 정확하게 유지되고 높이만 화면에 맞게 축소됩니다.

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
mobile-webview-app/
├── src/               # 프론트엔드 (vanilla JS)
│   ├── index.html     # UI (상시 툴바 + 설정 패널)
│   ├── main.js        # 앱 로직 (디바이스 프리셋 · 팝업 · 툴바)
│   └── styles.css     # 스타일링
└── src-tauri/         # Rust 백엔드
    ├── src/
    │   └── lib.rs     # Tauri 커맨드 (창/웹뷰 제어, 팝업 인터셉트, 디바이스 fit)
    ├── icons/         # 애플리케이션 아이콘
    └── Cargo.toml     # Rust 의존성
```

## 기술 세부사항

### 레이아웃

- **창**: 디바이스 뷰포트 + 하단 툴바(44px). 설정 패널 열림 시 폭에 350px 추가.
- **콘텐츠 웹뷰**: 좌상단(0,0)에 배치, 창 실제 inner 크기 기준으로 자동 맞춤(`fit_webview`).
- **팝업 인터셉트**: 자식 웹뷰에 init-script를 주입해 `window.open`/`target=_blank`를 같은 창 이동으로 처리.

### 저장소 (localStorage)

- `defaultUrl` — 시작 기본 URL
- `devicePreset` — 마지막 선택 디바이스
- `customPresets` — 사용자 추가 프리셋

## 권장 IDE 설정

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
