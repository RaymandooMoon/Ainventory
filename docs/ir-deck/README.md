# iNVTRY (인벤토리) IR 사업계획서 데크 (`docs/ir-deck/`) — v6.0

국내 VC 심사역과 TIPS 운영사가 **15분 내에 본문 14장만으로 투자 판단의 뼈대(문제 · 고객 · 제품 · 시장 · 수익 · 단위경제 · 팀 · 투자 조건)**를 파악하고, 학술·점검·아키텍처·보안·출처 근거는 **부록 5장**에서 확인할 수 있도록 전면 개편한 **총 19장(본문 14장 + 부록 5장)** HTML IR 사업계획서입니다.

## v6.0 핵심 변경 요약
- **14장 본문 + 5장 부록 구조**: 중복·반품 핵심 문제 집중(S03), 포스트-Doppl 플랫폼 흡수 대응(S04), 첫 진입 웨지 전략(S05), 실제 앱 시연(S06), 서버 전송 vs 기기 내 격리(S07), 거래액·SW 분리 시장 규모(S08), 기능 비교·방어 구조(S09), 수익·단위경제·이해상충 정책(S10), 사전 출시 검증 실험(S11), 단일 프리시드 18개월 로드맵(S12), 팀·채용(S13), 투자 제안(S14) + 부록 01~05(S15~S19).
- **Stitch-First 디자인 시스템 적용**: 기본 진입 상태를 **`KO · Atelier Paper Light · 16:9 · Deck`**으로 통일하고, S01 표지 및 S02 핵심 요약은 기존 레이아웃을 유지·정제했으며 S08 · S10 · S14는 Google Stitch 시안 A(Swiss Institutional Minimal) 기반으로 구현했습니다.
- **엄격한 5단계 타이포그래피 & 인포그래픽 중심**: `36px / 24px / 18px / 14px / 11.5px` 5단계 스케일로 본문 가독성(`>= 14px`)을 보장하고, 모든 수치를 `tabular-nums` 전용 모노스페이스 폰트로 정렬했습니다.
- **사실성 · 코드 정합성**:
  - 기능 상태 3단계 통일: **`출시` / `베타` / `개발 예정`** (`LIVE+` 삭제, 목 택·케어라벨 OCR은 코드 구현 근거로 `베타` 유지, 판매·기부 및 방문 수거는 `개발 예정`, 플랫폼은 `Android · Web 우선, iOS 예정`).
  - `0 Bytes`는 **얼굴 피부톤 분석 원본**으로, `추가 서버비 없음`은 **배경 제거·피부톤 분석**으로 정확히 범위 한정.
  - 가상 피팅은 **`8각도 AI 가상 피팅 + Three.js 연출`**로 통일 (`360°` 및 과장 표현 전면 제거).
  - 미확정 투자액·단가·약력은 임의 작성이나 `[TBD]` 없이 [`FOUNDER_INPUTS.md`](./FOUNDER_INPUTS.md)로 분리 관리하고, 본문에는 `"협의 후 공유"` 또는 `"사전 출시"`로 정직하게 표기합니다.

## 관련 문서 및 산출물
- [`index.html`](./index.html) / [`ir-deck.css`](./ir-deck.css) / [`ir-deck.js`](./ir-deck.js) / [`ir-deck-i18n.js`](./ir-deck-i18n.js) — v6.0 원본 데크 (배포 미러 `site/public/ir/`는 직접 수정 금지)
- [`FOUNDER_INPUTS.md`](./FOUNDER_INPUTS.md) — 창업자 확정 필요 12개 항목 입력 요청서
- [`DATAROOM_SECURITY_PROPOSAL.md`](./DATAROOM_SECURITY_PROPOSAL.md) — 접근 코드 교체 절차 및 투자자별 코드·만료·워터마크 개선 제안서
- [`CHANGELOG-v6.md`](./CHANGELOG-v6.md) — 독립 검토 지적(`C1~C13`, `D1~D11`, `K1~K10`) 전수 처리 및 반박 근거 로그
- [`iNVTRY-IR-v6.0-16x9.pdf`](./iNVTRY-IR-v6.0-16x9.pdf) — 16:9(`1280×720`) Light 모드 19페이지 벡터 PDF 출력본

## 자동 동기화 (`npm run ir:sync`)
- [`scripts/sync-ir-deck.mjs`](../../scripts/sync-ir-deck.mjs)가 `package.json`, `src/data/content.ts`, `site/public/assets/**`의 실측값을 읽어 `docs/ir-deck/ir-deck.data.json`과 `docs/ir-deck/index.html`의 `data-ir-bind` 슬롯을 갱신하고 `site/public/ir/`로 자동 미러링합니다.
- 동기화 실행: `npm run ir:sync`
- 드리프트 검증: `npm run ir:sync:check`
