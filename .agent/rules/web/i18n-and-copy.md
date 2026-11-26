---
trigger: glob
globs: "**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.html,**/manifest.webmanifest"
---
> This file extends [common/coding-style.md](../common/coding-style.md) and [web/design-quality.md](./design-quality.md) with UI copy, localization, and Korean proofreading governance.

# Web i18n & UI Copy Standards

## Context-Aware UI Copy & Accessible Labels

- Never author, translate, or revise UI copy in isolation: inspect the calling component to verify UI role (button action, heading, status banner, error, or inline fragment), runtime interpolation values, and container width constraints.
- Synchronize non-visible accessibility copy (`aria-label`, `aria-describedby` error/hint strings, `alt`, `<label>`, `<title>`/meta tags, and `aria-live` announcements) in lockstep with visible copy using natural target-language phrasing.
- Verify revised or localized strings across narrow mobile and wide desktop viewports so expanded text wraps, truncates, or scales cleanly without overflowing or shifting controls.
- Synchronize forward copy updates with reverse lookup maps (e.g., [`src/utils/i18n.ts`](../../src/utils/i18n.ts) `KO_TO_EN` dictionaries) and runtime emitters (`server/api.js`, `server/db.js`, `server/rbac.js`, `src/utils/standaloneFallback.ts`) so EN/KO toggling never drifts.
- See skill: `i18n-sync`, `frontend-design-direction`, `frontend-a11y`.

## Terminology, Voice & Protected Terms

- Batch copy and localization updates by feature against a single canonical glossary so shared domain concepts use one consistent term everywhere.
- Enforce a unified product voice and register appropriate to the audience, and preserve explicit do-not-translate brand identifiers (`A inventory`, `Ainvtry`, `VALEXTRA`, etc.), material codes, and proper nouns verbatim.
- Keep domain terminology synchronized between runtime UI strings and design/project specs ([`.stitch/DESIGN.md`](../../.stitch/DESIGN.md) / `SITE.md`).

### Ainventory Korean Copy Standards (5 Core Rules)

1. **No mistranslations or untranslated English leaks:** Never leave untranslated English copy in Korean UI slots, and avoid misleading literalisms (`Atelier` → `아틀리에`, `Saved Outfit` → `저장된 코디`, `Sleeper Piece` → `잠자는 옷`, `Parquet` → `원목`, `Oxford` → `옥스포드`).
2. **Replace developer, medical, and domain jargon with user-friendly Korean:** Replace internal/technical words with everyday language (`모달` → `창`, `매핑` → `연결/설정`, `연부조직`/`사지`/`펙토럴` → `볼륨`/`팔다리`/`가슴·흉곽`, `진자 물리`/`지글 피직스`/`아키타입`/`코디안`/`고보`/`월 스콘스`/`코브등`/`무창`/`쿼터`/`업턴`/`모노리드`/`렉탱글` 순화). Keep factual privacy/spec tokens (`IndexedDB`, `WASM`, `API`, `RBAC`) only where precision is required and never invent fake terms.
3. **Avoid non-standard slang, loan-slang, and redundant doubling:** Eliminate slang (`누끼` → `배경 제거/컷아웃`, `쪼리`, `나시`, `톡톡`), duplicate nouns (`반바지 쇼츠` → `쇼츠`, `동·브론즈` → `브론즈`, `스카프 머플러` → `머플러`), and non-standard spelling (`복숭아뼈` → `복사뼈`, `뒷태` → `뒤태`, `아니오` → `아니요`).
4. **Enforce single glossary terms & respectful register:** Use consistent canonical words (`유저` → `사용자`, `와이프` → `아내`, `어드민` → `관리자`, `인벤토리` → `옷장` [except brand `A inventory`], `합세탁` → `함께 세탁` / `분리 세탁`, `무전송`/`무저장` → `미전송`/`미저장`, `네비게이션` → `내비게이션`, `엔틱` → `앤티크`, `쉬어` → `시어`, `리넨` → `린넨`, `골든 탄` → `골든 탠`, `쉐이브` → `셰이브`, `18K 금` → `18K 골드`, `925 은` → `925 실버`).
5. **Follow Korean spacing & punctuation norms:** Separate auxiliary verbs (`~해 주세요`, `~해 보세요`, `~어 보세요`), separate spaced nouns/phrases (`구름 조금`, `구름 많음`, `한 달`, `노란 조명`, `스웨이드 코트`), concatenate `코디북`, and keep spaces around Korean middle dots (` · `) per repository site-content tests.
- See skill: `i18n-sync`, `design-md`, `taste-design`, `site-md`.

## Actionable & Concise Copy Standards

- Pair error, empty, and permission-blocked states with plain-language causes and concrete recovery/next actions rather than raw exception details, internal error codes, or developer/pipeline jargon.
- Let clear control labels stand on their own; omit prose explaining UI chrome inside the UI, marketing buzzword clichés, and decorative prompts ("Scroll to explore", "Swipe down").
- Omit redundant element-role words in `alt` and `aria-label` strings because assistive technologies announce roles automatically.
- See skill: `accessibility`, `frontend-design-direction`, `taste-design`, `error-handling`.
