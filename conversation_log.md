# A inventory — Conversation & Implementation Log (`conversation_log.md`)

## 2026-11-09 — 통합 구현 완료 (다른 PC 작업분 `[1] 2~11` + 미완료 `[2] a~h` + Cyberpunk 2077 PBR 3D 인벤토리)

### 1. 사용자 요구사항 및 아키텍처 결정 요약
- **기존 PC 미푸시 작업분(`[1] 2~11`) 및 잔여 TODO(`[2] a~h`) 전량 반영**
- **게임 인벤토리 × 디지털 옷장 결합**:
  - 전체 앱은 밝은 아틀리에(Atelier) 감성을 유지하되, **마네킹 및 11부위 착용 스테이지**는 **사이버펑크 2077(Cyberpunk 2077) 장비창 HUD 스타일**로 구축
  - **Three.js / WebGL PBR 3D 엔진(`Mannequin3DWebGLEngine`)** 도입:
    - `MeshPhysicalMaterial` 기반 서브서피스 스킨 셰이딩(퍼스널컬러 바디 반영), 클리어코트/광택/절차적 패브릭 노멀·범프맵(니트·울·개버딘·패딩·데님·실크·가죽) 실시간 표현
    - 상단 토글로 **조각상 마네킹 헤드(얼굴 없는 마네킹)** ↔ **캐릭터 아바타 헤드(게임 캐릭터 스타일)** 즉시 전환
    - 11부위 슬롯 클릭 시 해당 부위로 **3D 카메라 자동 줌 포커스**, 드래그 360° 회전, 레이캐스트 클릭/호버 부위 인식
    - 아이템 등급 자동 산출 배지(`ICONIC` / `LEGENDARY` / `EPIC` / `RARE` / `COMMON`), 실시간 로드아웃 RPG 스탯 게이지(`방한 방어력 THERMAL`, `방수 실드 HYDRO SHIELD`, `포멀 지수 FORMALITY`, `퍼스널컬러 싱크로율`), 장착 스캔라인 연출

---

### 2. 세부 구현 내역

1. **한/영 멀티랭귀지 (`[1] 2`)**
   - `src/utils/i18n.js`: 한국어(`ko`)/영어(`en`) 사전 및 로컬 스토리지 상태 관리
   - `src/components/LoginView.jsx`, `src/App.jsx`: 로그인/회원가입/이메일 인증 화면, 데스크톱 사이드바, 모바일 상단바에 `KO / EN` 즉시 전환 토글 적용

2. **이메일 인증 회원가입 및 해시 검증 로그인 (`[1] 3`)**
   - `server/api.js`, `server/db.js`, `src/components/LoginView.jsx`
   - `POST /api/auth/register` → `/?verify_token=...` 인증 링크 발행
   - `GET /api/auth/verify-info`, `POST /api/auth/verify-email` → 인증 시 `verified_at` 타임스탬프 + SHA-256 `verification_hash` 저장
   - `POST /api/auth/login` → `verified_at` 및 `verification_hash`가 존재하는 계정만 로그인 허용

3. **사용자별 기본 옷장 분리 (`[1] 4`)**
   - 회원가입 시 옷장 선택 UI 제거, `closet_<username>` 전용 키 자동 생성
   - 최초 로그인 시 옷장 이름 설정 모달(`POST /api/auth/closet-setup`, `users.closet_name`) 표시

4. **7체형 + 스리사이즈/머리둘레/체지방 + 퍼스널 컬러 진단 모달 (`[1] 5, 8, 9`, `[2] a, b, e`)**
   - `src/utils/bodyAnthropometrics.js`: 7체형(`ectomorph_thin`, `skinny_fat`, `standard_balanced`, `upper_developed`, `lower_developed`, `muscular_athletic`, `plus_curvy`), `recommendBodyShapeFromMetrics`, `resolveAnatomicalProfile`(미입력 시 성별·나이·키·몸무게·체형 기반 디폴트 자동 산출)
   - `src/components/ProfilePersonalColorModal.jsx`:
     - **Step 1**: 10단계 연령대, 성별, 키/몸무게, 7체형 미니 3D 마네킹 카드 선택, BMI/체지방 기반 추천 체형 버튼, 체지방률·가슴·허리·엉덩이·머리둘레 입력(디폴트 placeholder + 비우기 버튼), 실시간 3D 미리보기
     - **Step 2**: D65 자연광 안내, 4가지 조명 보정(`auto_d65`, `studio_cool_fix`, `indoor_warm_fix`, `raw_original`) 및 변경 확인 팝업 + `0~100%` 재분석 애니메이션, 상/하/좌/우 20색 언더톤 유사도, 신뢰도 산식 공개(`40/25/20/15`), 4개 피부 부위(이마/좌볼/우볼/콧대·턱) 참조 핀
   - `src/utils/faceLandmarkEngine.js`, `src/components/PortraitCropAndPinEditorModal.jsx`: 얼굴 방향 무관 인식, 전신샷 2단계 헤드 줌 재탐색, 회전/크롭 및 4개 핀 드래그 직접 조정, 인식 부정확 시 안내 팝업

5. **연령별 통계 옷장 및 실사 스튜디오 팩샷 마이그레이션 (`[1] 6, 11`, `[2] a, f`, `[3]`)**
   - `server/wardrobeStatsAndGenerator.js`: WRAP UK, Hot or Cool Institute, KOFOTI/한국의류학회 기반 10연령대 × 11부위 × 4계절 벤치마크(`wardrobe_statistics_benchmarks`) 시드 및 통계 수량만큼 의류 자동 생성
   - `public/seed/studio-*.jpg|png` (30종 스튜디오 팩샷 생성 완료, 기존 시드 포함 전 부위 실사 팩샷 확보)
   - `server/db.js`: `initDb()`에서 `garments.image_url`이 `data:image/svg+xml%` 이거나 `/seed/store-terracotta-cardigan.jpg` 인 행을 `getStudioSeedImageForGarment(category, subcategory)` 결과로 자동 UPDATE
   - `src/components/StudioGarmentImage.jsx`: `WeatherStylingView`, `OutfitInspectorModal`, `WardrobeView`, `OutfitStudioView`, `AnalyticsCalendarView`, `ShoppingCheckView` 전 화면에 적용

6. **사이버펑크 2077 3D 인벤토리 마네킹 + 코디 인스펙터 + 월간 착용 캘린더 (`[1] 7, 10`, `[2] c, d`)**
   - `src/utils/mannequin3DRenderer.js` & `src/components/VirtualMannequin.jsx`: Three.js WebGL PBR 3D 마네킹 + 좌우 11슬롯 장비창 + 카메라 부위 포커스 + RPG 스탯 게이지
   - `src/components/OutfitInspectorModal.jsx`: 머리→발 11부위 한 화면 인스펙터 및 `"다른 아이템으로 변경하시겠습니까?"` 확인 팝업 후 교체/확정
   - `src/components/AnalyticsCalendarView.jsx`: 월간 착용 캘린더, Google Calendar 일정 등록 링크, `.ics` 내보내기

---

## 2026-11-09 — 오리지널 로그인 화면 복원 + 사이버펑크 2077 인벤토리(`image_2.png`) 정밀 재설계 + 전 화면 반응형 고도화

1. **최초 에디토리얼 로그인 화면 복원 ([src/components/LoginView.jsx](file:///home/antigravity/RaymandooMoon/Ainventory/src/components/LoginView.jsx))**
   - 최초 커밋의 좌측 에디토리얼 쇼케이스(`auth-editorial`, `auth-showcase`, 4종 실사 팩샷 스트립 `/seed/beige-trench.jpg`, `/seed/navy-knit.jpg`, `/seed/charcoal-slacks.jpg`, `/seed/white-sneakers.jpg`, `auth-pillars`)와 우측 `auth-card`(`어드민 (남편)` / `테스터 (와이프)` 빠른 입장 버튼) 레이아웃 및 타이포그래피를 그대로 복원하고, 한/영 토글 및 이메일 인증 가입 흐름을 자연스럽게 통합했습니다.

2. **첨부 레퍼런스(`image_2.png`) 기반 사이버펑크 2077 인벤토리 재설계 ([src/components/VirtualMannequin.jsx](file:///home/antigravity/RaymandooMoon/Ainventory/src/components/VirtualMannequin.jsx), [src/index.css](file:///home/antigravity/RaymandooMoon/Ainventory/src/index.css))**
   - **배경 및 분위기**: 상단 크림슨 레드(`#3c121b`)에서 하단 옵시디언 블랙(`#07060b`)으로 떨어지는 다크 비네팅 배경과 좌우 가장자리 바이너리 텔레메트리(`0111 1001...`) 적용.
   - **상단 헤더 바 (`cp77-topbar`)**:
     - 좌측: 시안(`#2de2e6`) `27 레벨` 및 `스타일 평판` 수치 + 시안 프로그레스 바
     - 중앙: `[1]` `사이버웨어` | **`인벤토리`**(활성 시안 언더라인 글로우) | `캐릭터` | `코디북` | `일지` `[3]`
     - 우측: 코랄 레드(`#ff5750`) 보유 용량(`BAG`) 및 골드(`€$`) 총 코디 가치 표시
   - **좌측 컬럼 (`cp77-col-left`)**:
     - **`주력 코디` (무기 슬롯 스타일 가로형 와이드 카드 3단)**: 좌측 수직 등급 컬러 바(퍼플·시안·골드), 상단 소켓 도트(`● ● ○`), 중앙 실사 의류 이미지, 하단 시안 스코어(`= 96`, `|| 606`) 및 아이템명
     - **`사이버웨어` (정사각 3슬롯)**: 7체형/3사이즈 파츠, 퍼스널컬러 D65 코어, 방한·방수 실드 코어
     - **`퀵 액세스` (정사각 3슬롯)**: 좌하단 시안 번호 배지(`1`, `2`, `3`)가 포함된 이너웨어·양말·장갑 슬롯
   - **중앙 컬럼 (`cp77-col-center`)**:
     - 박스 테두리 없이 다크 크림슨-옵시디언 배경 위에 자연스럽게 서 있는 전신 3D 캐릭터/마네킹 뷰포트(360° 드래그 회전, 아바타/마네킹 헤드 전환, 부위별 포커스)
   - **우측 컬럼 (`cp77-col-right`)**:
     - **`머리`(2슬롯) + `상체`(2슬롯)** 및 **`하체`(2슬롯) + `복장`(세로 2단 높이의 롱 슬롯 + 전신 수트 실루엣 워터마크 + `1 [옷걸이]` 아이콘)**
     - **`관련 항목` (우하단 3단 사선 버튼)**: 시안 다이아몬드 아이콘(`◇`)이 결합된 `배낭`, `제작`, `스테이터스` 버튼 및 `NEURONET PROTOCOL` / `ESC` 푸터

3. **전 화면 반응형 설계 ([src/index.css](file:///home/antigravity/RaymandooMoon/Ainventory/src/index.css))**
   - `1180px`, `980px`(태블릿: 3D 캐릭터 상단 중앙 배치 후 좌·우 장비 슬롯 2열 병렬 배치), `640px`(모바일: 1열 스택 및 터치 최적화) 브레이크포인트 완비.
---

## 2026-11-10 — PC1 핸드오프 명세(`HANDOFF_SPEC.md`) 대조 보완 + 3D 피팅 스튜디오 아틀리에 톤 전환

- **User**: PC1에서 PUSH 못 했던 개발 명세(`FULL_PROJECT_SOURCE_BACKUP.md` / `HANDOFF_SPEC.md`)를 반영해 달라. 방향은 상의해서 정할 것.
- **결정 사항 (사용자 선택)**:
  1. 현재 `main`(`b48c786`)을 기준으로 두고, 명세와 다른 부분만 보완 (전달된 메시지가 잘려 `### FILE:` 소스 블록은 포함되지 않음)
  2. Three.js 엔진은 유지하고, 3D 마네킹 화면은 앱 전체와 같은 밝은 아틀리에/스튜디오 톤으로 변경 (사이버펑크 HUD 제거)
  3. `TODO.md` 복원 및 함수·상수 이름을 명세와 맞추기 (`Mannequin3DBodyPreview` export 포함)
- **Assistant**:
  1. **명세 이름 정렬** — `src/utils/bodyAnthropometrics.js`: `BODY_SHAPE_OPTIONS`, `suggestBodyShapeFromMetrics`, `normalizeBodyShapeKey`(레거시 `body_type` 값 매핑) 추가, 기존 `BODY_SHAPES` / `recommendBodyShapeFromMetrics`는 호환용 별칭으로 유지
  2. **서버 (`[2] b, c`)** — `server/wardrobeStatsAndGenerator.js`: `BODY_SHAPE_OPTIONS`, `normalizeBodyShapeKey` 재export, `computeBodyMetrics`에 `bodyLabelKo/En`, `bodyShortKo`, `resolvedMeasurements` 추가 (→ 날씨 추천 `stylingProfile`에도 자동 포함) / `server/api.js`: `formatUserPayload`에 `bodyShapeLabelKo/En`, `bodyShapeShortKo`, `bodyShapeCustom`, `personalColorLabelKo/En` 추가, `profile-setup`에서 체형 키 정규화, `GET /api/body-shapes` 추가
  3. **3D 피팅 스튜디오 (`[2] d`)** — `src/components/VirtualMannequin.jsx` 전면 재작성:
     - 아틀리에 톤 3단 레이아웃(좌: 머리·목/상체/손, 중앙: 3D 스테이지, 우: 하체·전신/발/액세서리), 머리→발 번호(`01~11`) 슬롯 카드 + 실사 팩샷 + 원단 소재 표기
     - 상단 배지: 퍼스널컬러 바디 톤 · 7대 체형 · `가슴 · 허리 · 힙 · 두위` (커스텀 n/4 / 디폴트)
     - 각도 프리셋 `좌측면 -28°` / `3/4 입체 -14°` / `정면 0°` / `우측면 +24°`, 드래그 회전, 호버 콜아웃, 의류 클릭 → `onSelectSlot` + `onItemClick`
     - 기본 헤드를 **무안면 마네킹**으로 변경(아바타 헤드 토글은 유지)
     - `export function Mannequin3DBodyPreview({ user, poseYawDeg = -16 })` 경량 2D-투영 프리뷰 추가
  4. **3D 엔진 (`src/utils/mannequin3DRenderer.js`)** — 네온 시안/골드 림라이트·페디스털을 아이보리 소프트박스 조명 + 트래버틴 페디스털로 교체, 씬 재생성 시 geometry/material `dispose()`로 GPU 메모리 누수 방지
  5. **버그 수정 (기존 `main`에서 3D 스테이지가 렌더되지 않던 원인)**:
     - `BufferGeometry`에 존재하지 않는 `.rotation.x` 대입(`jawGeom`, 넥웨어 `torus`) → `rotateX()`로 교체 (페이지 로드 시 `TypeError`로 날씨 코디 화면 전체가 멈춤)
     - `VirtualMannequin`이 엔진에 없는 메서드(`setTargetYaw`, `focusOnSlot`, `setMouseParallax`, `pickSlotAtClientPos`)를 호출 → 실제 메서드(`setRotationDeg`, `setFocusSlot`, `setParallax`, `hitTestClientPoint`)로 연결
     - `WeatherStylingView`가 넘기는 `onOpenBodySetup` / `onOpenInspector`를 컴포넌트가 받지 않던 문제 수정
     - WebGL 버퍼 크기를 캔버스 실제 CSS 크기에 맞춰 반응형 구간에서 마네킹이 늘어나던 문제 수정
  6. **프로필 모달 (`[2] e`)** — 7종 체형 카드와 실시간 프리뷰를 `Mannequin3DBodyPreview`로 교체, 다크 패널을 아틀리에 톤으로 변경, 프리뷰 바디 톤에 선택된 퍼스널컬러 반영
  7. **`TODO.md` 복원** (명세 원문 + a~h 체크리스트 + 후속 과제), `npm run build` 통과, 헤드리스 브라우저(SwiftShader WebGL)로 화면 검증

---

## 2026-11-10 — 실사 인체 3D 마네킹 & 29종 의류 GLB 파이프라인(Blender + MPFB2) + `@mediapipe/tasks-vision` 478-랜드마크 통합

- **User**:
  - `git push`는 아직 하지 말 것.
  - 3D 마네킹 품질을 단순 도형 조합이 아닌 게임(언리얼5/유니티) 수준의 실사 인체 모델링 및 실제 의류 착장 핏으로 고도화 요청.
  - 마네킹 작업 완료 후 `@mediapipe/tasks-vision`(478개 얼굴 포인트 인식) 작업 진행 요청.
- **Assistant**:
  1. **Blender 4.2 LTS + MakeHuman/MPFB2(`v2.0.18`) + CC0 의류 에셋 빌드 파이프라인 구축 (`tools/blender/`)**:
     - [tools/blender/build_mannequin.py](file:///home/antigravity/RaymandooMoon/Ainventory/tools/blender/build_mannequin.py): MakeHuman 13,380 버텍스 인체 베이스 메쉬에서 눈·코·입 내부 파우치 디스크(2,414 버텍스)를 분리하고, 이마·관자놀이·볼·턱 외곽 앵커 기반 **Thin-Plate Spline(TPS) 곡면 보간 + Tutte 평면 위상 릴랙세이션**을 적용해 주름·구멍 없이 매끄러운 **무안면(Faceless) 스컬프팅 헤드** 구현.
     - **29개 인체 모프 타깃(`shape keys`) 생성**: `gender_female`, `gender_male`, `weight_up/down`, `muscle_up/down`, `age_old`, `bust_up/down`, `shoulder_up/down`, `chest_up/down`, `waist_up/down`, `belly_up/down`, `hips_up/down`, `thigh_up/down`, `calf_up/down`, `arm_up/down`, `neck_up/down`, `head_up/down`.
     - **11부위 29종 3D 의류 피팅 ([tools/blender/garment_catalog.py](file:///home/antigravity/RaymandooMoon/Ainventory/tools/blender/garment_catalog.py), [tools/blender/procedural_garments.py](file:///home/antigravity/RaymandooMoon/Ainventory/tools/blender/procedural_garments.py))**: MakeHuman `.mhclo` 바인딩 수식(`GarmentFit`) 및 최근접 3-버텍스 바인딩(`NearestFit`)을 벡터화하여 29개 모프 상태 전체에 대해 의류가 인체와 함께 실시간 변형되도록 익스포트.
     - **Meshopt 고압축 (`public/models/mannequin/`)**: `gltf-transform meshopt --level high`로 `body.glb`(652 KB) 및 29종 의류 GLB(총 5.8 MB) 압축, CC0 무잡티 뉴트럴 스킨 알베도(`public/textures/mannequin/skin_albedo.jpg`) 및 패브릭 노멀맵 생성.
  2. **Three.js GLB PBR 렌더링 엔진 전면 교체 ([src/utils/mannequin3DRenderer.js](file:///home/antigravity/RaymandooMoon/Ainventory/src/utils/mannequin3DRenderer.js))**:
     - `GLTFLoader` + `MeshoptDecoder` + `RoomEnvironment` PMREM 스튜디오 IBL 적용.
     - 퍼스널컬러/피부톤 HEX와 스킨 알베도·서브서피스 시인을 결합한 `createSkinMaterial`, 원단별(울·캐시미어·니트·개버딘·데님·실크·풀그레인 레더·구스다운) 노멀/범프맵을 결합한 `createGarmentMaterial` 구현.
     - 3D 공간 해시 기반 실시간 바디 표면 컬링(`computeCoveredVertices`) + 아우터 착용 시 이너 상의 소매 마스킹(`maskInnerTopUnderOuter`) + 롱 팬츠 착용 시 양말 상단 마스킹(`maskSocksUnderLongPants`)으로 의류 간 관통(Poke-through) 완벽 제거.
     - 공유 오프스크린 WebGL 렌더러를 통해 프로필 모달의 7종 체형 미니 카드 및 실시간 프리뷰(`Mannequin3DBodyPreview`)에서도 동일한 실사 3D 메쉬와 모프 타깃을 렌더링.
  3. **`@mediapipe/tasks-vision` 478-랜드마크 얼굴 인식 통합 ([src/utils/faceLandmarkEngine.js](file:///home/antigravity/RaymandooMoon/Ainventory/src/utils/faceLandmarkEngine.js), `public/mediapipe/`)**:
     - `@mediapipe/tasks-vision` 패키지 및 로컬 WASM 런타임(`public/mediapipe/wasm/*`), `face_landmarker.task`(`public/mediapipe/face_landmarker.task`) 내장.
     - 1단계 전체 프레임 478-랜드마크 검출 + 2단계 전신샷 상단 헤드 줌 재탐색 + 이마·좌볼·우볼·콧대/턱 해부학 랜드마크 인덱스 기반 4핀 자동 배치 및 YCbCr 폴백 통합.

