# iNVTRY (Ainvtry) IR 사업계획서 데크 (`docs/ir-deck/`) — v3.1 (Auto-Sync · 18장)

TIPS · 도전의IR · VC 투자 제안서 표준을 반영하고 **Ainventory 공식 홈페이지(`ainvtry.com`) 및 메인 로그인 페이지의 드레이프 실크 테마(구슬 제외) + Google Stitch 기반 아이콘·인포그래픽 시스템 + 앱/웹 자동 배치 동기화**를 적용한 **18슬라이드 듀얼 비율(`16:9` & `4:3`) HTML IR 사업계획서**입니다.

## v3.1 주요 특징
- **정확한 기술 용어 정책 (`Three.js` 전용 3D 표기)**:
  - 실제 포토리얼 가상 피팅 모델은 **8방향 멀티앵글 2D VTON**으로, 플랫폼은 **디지털 순환 옷장 OS**로 정직하게 표기합니다.
  - **`3D` 표기는 `Three.js`를 실제 사용하는 영역**(Three.js 3D 아바타·SpringBone 물리, Three.js 3D 우산·바람 기상 스테이지, Three.js 3D 공식 웹/실크 셰이더)에만 엄격히 사용합니다.
- **앱 · 홈페이지 자동 배치 동기화 (Living IR Deck)**:
  - [`scripts/sync-ir-deck.mjs`](../../scripts/sync-ir-deck.mjs)가 실제 코드베이스(`package.json`, `src/data/content.ts`, `tests/**`, `site/public/assets/**`)를 읽어 [`ir-deck.data.json`](./ir-deck.data.json)과 [`index.html`](./index.html)의 `data-ir-bind` 슬롯을 비파괴 자동 갱신합니다.
  - 로컬 수동 배치: `npm run ir:sync` (동기화 실행) / `npm run ir:sync:check` (드리프트 검증)
  - 자동 CI 배치([`.github/workflows/ir-deck-sync.yml`](../../.github/workflows/ir-deck-sync.yml)): `main` 브랜치에 앱/웹 변경사항 푸시 시 자동 실행 + 매주 월요일 09:00 KST 정기 배치 + GitHub Actions 수동 1클릭 실행 지원
- **공식 홈페이지 · 메인페이지 4종 실크 테마(구슬 제외)**: [`src/components/auth/loginThreeScenes.ts`](../../src/components/auth/loginThreeScenes.ts)의 Three.js 3D 실크 셰이더에서 구슬(`uMarbleOpacity=0`)을 제외한 4종 배경(`assets/bg/silk-{luxury,aurora}-{light,dark}.webp`)과 프로스티드 글래스 카드를 적용했습니다.
- **듀얼 비율 네이티브 전환**: 상단 툴바 또는 URL 쿼리(`?ratio=16-9` / `?ratio=4-3`)로 `16:9` (`1280×720`)와 `4:3` (`1024×768`)을 즉시 전환합니다.

## 자동 연동되는 항목 (`data-ir-bind`)
| 항목 | 원본 소스 | IR 데크 반영 슬라이드 |
| :--- | :--- | :--- |
| **패키지 버전** (`React`, `Vite`, `Express`, `Capacitor`, `Three.js`) | `package.json` | Slide 01, 08, 14 |
| **자동화 테스트 수** (스위트·케이스 전수 집계) | `tests/**/*.{test,spec}.*` | Slide 01, 02, 03, 14 |
| **6단계 사용자 여정 상태** (`LIVE` / `LIVE+` / `TO-DO`) | `src/data/content.ts` (`SITE_COPY.ko.journey`) | Slide 06 |
| **로드맵 단계 완료 상태** (`PHASE 01·02·03`) | `src/data/content.ts` (`SITE_COPY.ko.vision`) | Slide 15 |
| **EXIF/배경 -96% 압축 실측 용량** (`KB`) | `site/public/assets/garments/beige-trench.*` | Slide 01, 08, 13 |
| **공식 도메인 · 대표자 · 연락처 · 기준월** | `src/data/content.ts` (`SITE_META`) + `git` | Slide 01, 16, 18 |

> 수동 작성한 IR 문구 및 `[TBD]` 투자자 입력 항목은 동기화 시 절대 덮어쓰지 않습니다.

## 제출 전 기입 항목 (`[TBD]`)
- **Slide 10**: SOM 3개년 목표 MAU / GMV
- **Slide 12–13**: iNVTRY Pro 월 구독 확정가(`₩6,900~9,900` 중 택1) 및 베타 이후 3개년 손익 수치
- **Slide 16**: 대표자 핵심 경력·학력 2~3줄 및 법인·사업자 현황
- **Slide 17**: 희망 투자 유치 금액(`[TBD] 억원`) 및 18개월 목표 MAU

## Phase 2 예정 산출물 (HTML 최종 승인 후 생성)
- `16:9` / `4:3` 인쇄용 고해상도 **PDF** 2종 (동일 실크 배경 포함)
- `16:9` / `4:3` 편집 가능한 **PowerPoint (`.pptx`)** 2종 (동일 실크 마스터 배경 포함)
