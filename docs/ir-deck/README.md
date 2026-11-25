# iNVTRY (Ainvtry) IR 사업계획서 데크 (`docs/ir-deck/`) — v3.0 (18장 · Silk Theme)

TIPS · 도전의IR · VC 투자 제안서 표준을 반영하고 **Ainventory 공식 홈페이지(`ainvtry.com`) 및 메인 로그인 페이지의 3D 드레이프 실크 테마(구슬 제외) + Google Stitch 기반 아이콘·인포그래픽 시스템**을 적용한 **18슬라이드 듀얼 비율(`16:9` & `4:3`) HTML IR 사업계획서**입니다.

## v3.0 주요 특징
- **공식 홈페이지 · 메인페이지 4종 실크 테마(구슬 제외)**: [`src/components/auth/loginThreeScenes.ts`](../../src/components/auth/loginThreeScenes.ts)의 실제 3D 실크 셰이더에서 구슬(`uMarbleOpacity=0`)을 제외한 4종 고해상도 실크 배경(`assets/bg/silk-{luxury,aurora}-{light,dark}.webp`)과 반투명 프로스티드 글래스 카드를 그대로 적용했습니다.
  - **럭셔리 라이트** (`mood=luxury&theme=light`, 기본값): 메인 로그인·라이트 홈페이지 포슬린 샴페인 실크
  - **럭셔리 다크** (`mood=luxury&theme=dark`): `ainvtry.com` 공식 OLED 옵시디언·샴페인 실크
  - **오로라 라이트 / 오로라 다크** (`mood=aurora`): 프리즘 오로라 실크
- **Stitch-First 아이콘 & 인포그래픽 전환**: 32종 Lucide 스타일 인라인 벡터 아이콘 스프라이트(총 174개 배치), **6→1 중앙 수렴 허브(SVG 베지어 연결선)**, **원가 방어 비교 막대 차트**, **70%+ 목표 마진 도넛 링 게이지**, **자금 배분 SVG 도넛 차트**를 적용해 문장 비중을 대폭 줄이고 3초 스캔 가독성을 확보했습니다.
- **듀얼 비율 네이티브 전환**: 상단 툴바 또는 URL 쿼리(`?ratio=16-9` / `?ratio=4-3`)로 `16:9` (`1280×720`)와 `4:3` (`1024×768`)을 잘림 없이 실시간 전환하며, 인쇄 시 `@page` 규격도 자동 연동됩니다.

## 열람 방법
1. **오프라인 직접 열람**: 로컬 저장소에서 `docs/ir-deck/index.html`을 Chrome/Safari로 더블클릭합니다.
2. **URL 파라미터 예시**:
   - `index.html?ratio=16-9&mood=luxury&theme=light&view=deck`
   - `index.html?ratio=16-9&mood=luxury&theme=dark&view=deck`
   - `index.html?ratio=4-3&mood=aurora&theme=light&view=scroll`
3. **키보드 단축키**: `←` / `→` / `Space` / `Home` / `End` (목차 슬라이드 각 항목 클릭 시 즉시 이동)

## 제출 전 기입 항목 (`[TBD]`)
- **Slide 10**: SOM 3개년 목표 MAU / GMV
- **Slide 12–13**: iNVTRY Pro 월 구독 확정가(`₩6,900~9,900` 중 택1) 및 베타 이후 3개년 손익 수치
- **Slide 16**: 대표자 핵심 경력·학력 2~3줄 및 법인·사업자 현황
- **Slide 17**: 희망 투자 유치 금액(`[TBD] 억원`) 및 18개월 목표 MAU

## Phase 2 예정 산출물 (HTML 최종 승인 후 생성)
- `16:9` / `4:3` 인쇄용 고해상도 **PDF** 2종 (동일 실크 배경 포함)
- `16:9` / `4:3` 편집 가능한 **PowerPoint (`.pptx`)** 2종 (동일 실크 마스터 배경 포함)
