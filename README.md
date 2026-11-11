# A inventory

플레이스토어 · 앱스토어 출시 규격 및 **Apple HIG(Human Interface Guidelines)** 무채색 미니멀 디자인 시스템을 적용한 3D 디지털 옷장 · AI 스타일링 · 오프라인 쇼핑 중복 판독 아틀리에입니다.

## 핵심 기능 요약

1. **Apple HIG 무채색 미니멀 3D 스튜디오 & 경량 물리 엔진**
   - 라이트(`#FFFFFF` · `#F5F5F7`) / OLED 다크(`#000000` · `#1C1C1E`) 무경계 8pt 그리드 디자인 및 고정폭 수치(`tabular-nums`) 적용
   - 21-Bone 스켈레탈 모션(`idle`, `walk`, `wave`, 날씨 연동 `umbrella`, 장갑 인스펙션 `pose_hands`), 28종 체형 모프 타겟, PCCS 12톤 퍼스널컬러 마네킹 동기화
   - 머플러·스카프·서류가방·토트백·코트·스커트 본 기반 경량 `SpringBone` 물리 및 `webglcontextlost` 자동 복구 + 2D 콜라주 폴백 뷰어
2. **AI 의류 등록 파이프라인 (포토 크롭 → 자동 누끼 · WebP 압축 · 11슬롯 매핑)**
   - 사진 촬영·업로드 직후 8-핸들 스마트 크롭 에디터 자동 실행, 에지 알파 매팅 배경 제거 및 `image/webp` 압축 정규화
   - 대분류·소분류, 주요 색상, 계절감, 원단(`cotton`, `denim`, `knit`, `leather`, `wool`, `silk`, `padding`) 자동 추론 및 베이스 3D GLB + PBR 노멀/러프니스 동적 합성
3. **벤치마크(Acloset · GetWardrobe · Whering) 리텐션 & 오프라인 우선 동기화**
   - 날짜별 OOTD 착용 기록(`worn`) · 미래 코디 예약(`planned`, `.ics` 내보내기) · 여행 기간/목적지별 짐싸기 체크리스트
   - 애플 피트니스 스타일 벤토 인사이트 카드(1회 착용 비용 `CPW`, 미착용 방치 알림, 색상·카테고리 편중도 리포트)
   - 비로그인 **샘플 옷장 체험 모드** 분리 및 로그인 사용자용 빈 옷장 온보딩 + **IndexedDB 오프라인 우선(Offline-first)** 동기화
4. **모바일 스토어 심사 · 보안 가드레일 & Capacitor 패키징**
   - **Sign in with Apple**, 이메일 6자리 OTP 인증(60초 재발송 쿨다운 · 시도 횟수 Rate Limit), 계정 설정 내 **회원 탈퇴 및 개인 데이터 즉시 영구 파기**
   - 카메라·갤러리 사전 권한 안내 모달 및 안면 피부톤(`FaceLandmarker` WASM 지연 로딩) 로컬 처리 사전 동의
   - Capacitor 정식 설정(`com.ainventory.app`, `android/` 네이티브 프로젝트 포함)

---

## 다른 컴퓨터(Mac / Windows / Linux)에서 바로 열기 & 실행

**권장 환경**: Node.js 20.19+ 또는 Node.js 22 / 24 LTS (`sql.js` 순수 WASM SQLite 내장으로 별도 네이티브 DB 빌드 불필요)

```bash
git clone https://github.com/RaymandooMoon/Ainventory.git
# 이미 클론되어 있다면:
# git pull origin main

cd Ainventory
npm install
npm run dev
```

- 실행 후 브라우저에서 로컬 개발 서버(`http://localhost:5173`)로 접속하면 프론트엔드와 내장 API 서버(`/api/*`)가 함께 동작합니다.
- 초기 진입 화면에서 **샘플 옷장 체험 모드**로 즉시 테스트하거나, 이메일 OTP(로컬 개발 시 `data/outbox/` 및 화면 안내로 확인 가능) / Apple 로그인 / 기본 데모 계정(`admin` / `admin`, `wife` / `wife1234`)을 사용할 수 있습니다.

## 주요 명령어

```bash
# 개발 서버 실행 (Vite + Express API 통합)
npm run dev

# 프로덕션 빌드 및 정적/API 서버 단독 실행
npm run build
PORT=3000 npm start

# 코드 정적 분석 (oxlint)
npm run lint

# Capacitor Android 웹 에셋 빌드 및 네이티브 동기화
npm run cap:sync

# 무인 모바일 E2E 검증 스위트 (최초 1회 브라우저 설치 시: npx playwright install chromium)
npm run test:e2e
```
