# iNVTRY (Ainvtry) IR 사업계획서 초안 v1.0 (`16:9` · `4:3` 듀얼 지원)

투자사·TIPS(도전의IR)·기업 제휴 제출용으로 제작된 **15장 구성 HTML IR 덱**입니다.

## 파일 구성
- `index.html`: 15개 슬라이드 본문 (실제 앱 스크린샷·6컷 3D 클레이 스토리보드·EXIF 전/후 비교·시장/포지셔닝 SVG 포함)
- `ir-deck.css`: 네이티브 **`16:9` (`1280×720`)** 및 **`4:3` (`1024×768`)** 듀얼 레이아웃 + **Light (제출·인쇄)** / **Dark (발표)** 테마 + 인쇄용 `@page` 여백 제로 스타일
- `ir-deck.js`: 비율·테마·보기 모드 전환, 동적 `@page` 크기 반영, 키보드 탐색(`←`/`→`/`Space`/`Home`/`End`), URL 쿼리 동기화

## 실행 및 전환 방법
1. 브라우저에서 `docs/ir-deck/index.html`을 열거나 로컬 정적 서버로 서빙합니다.
2. 상단 컨트롤 바(인쇄·PDF 시 자동 숨김) 또는 URL 쿼리로 즉시 전환할 수 있습니다:
   - `16:9` 라이트(제출 기본): `?ratio=16-9&theme=light&view=deck`
   - `4:3` 라이트(TIPS/VC 표준): `?ratio=4-3&theme=light&view=deck`
   - `16:9` 다크(프로젝터 발표): `?ratio=16-9&theme=dark&view=deck`
   - 전체 스크롤 검토: `?view=scroll`

## `[TBD]` 기입 항목 (초안 확정 전 대표님 확인)
- **Slide 09 (Market SOM)**: 서울 2030 초기 타깃 3개년 목표 MAU / GMV
- **Slide 11 (Business Model)**: Pro 월 구독 가격 최종안 및 상세 재무 추정치
- **Slide 14 (Team)**: 창업자 경력·학력 요약 2~3줄 및 법인 설립 현황
- **Slide 15 (Funding Ask)**: 희망 투자 규모(억원), 18개월 목표 MAU/GMV 수치

## 다음 단계 (HTML 확정 후)
- **PDF 자동 내보내기**: Playwright로 `16:9` & `4:3` 무여백 고해상도 제출용 PDF 자동 생성
- **PowerPoint(`.pptx`) 자동 생성**: 동일한 슬라이드 콘텐츠 기반으로 `16:9` & `4:3` 편집 가능한 `.pptx` 파일 생성
