import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  BOTTOM_STAGE_PILLS,
  BRAND_LOGO_ASSETS,
  resolveAppPreviewSrc,
  SITE_COPY,
  SITE_META,
  SPECS_3D_PILLAR_LABELS,
  stageIdToViewId,
  STUDIO_GARMENT_ASSETS,
  STUDIO_POSE_TELEMETRY,
  viewIdToStageId,
  type AppPreviewScreenId,
  type SiteLang,
  type SiteTheme,
} from '../../src/site/siteContent.ts';

describe('ainvtry.com official site content & icon-first architecture contract', () => {
  it('aligns domain, contact email, founder identity, and stage/view mapping for startup verification', () => {
    assert.equal(SITE_META.domain, 'ainvtry.com');
    assert.equal(SITE_META.logoMark, 'iNVTRY');
    assert.equal(SITE_META.contactEmail, 'raymond@ainvtry.com');
    assert.ok(SITE_META.contactEmail.endsWith(`@${SITE_META.domain}`));
    assert.equal(SITE_META.founderName, 'Raymond Moon');

    assert.equal(BOTTOM_STAGE_PILLS.length, 4);
    assert.deepEqual(
      BOTTOM_STAGE_PILLS.map((pill) => pill.stageId),
      ['studio', 'architecture', 'specs', 'about']
    );
    for (const pill of BOTTOM_STAGE_PILLS) {
      assert.equal(stageIdToViewId(pill.stageId), pill.viewId);
      assert.equal(viewIdToStageId(pill.viewId), pill.stageId);
    }
    assert.equal(stageIdToViewId('hero'), 'home');
    assert.equal(viewIdToStageId('home'), 'hero');
  });

  it('ships all 16 theme/language-synced live app preview WebP assets plus brand and garment assets on disk', () => {
    const screens: readonly AppPreviewScreenId[] = ['outfits', 'closet', 'stats', 'profile'];
    const langs: readonly SiteLang[] = ['en', 'ko'];
    const themes: readonly SiteTheme[] = ['dark', 'light'];
    const publicDir = path.resolve(import.meta.dirname, '../../site/public');

    for (const screen of screens) {
      const prefix = screen === 'outfits' ? 'app-fitting-live' : `app-${screen}`;
      for (const lang of langs) {
        for (const theme of themes) {
          const src = resolveAppPreviewSrc(screen, lang, theme);
          assert.equal(src, `/assets/previews/${prefix}-${lang}-${theme}.webp`);
          const diskPath = path.join(publicDir, src.replace(/^\//, ''));
          assert.ok(fs.existsSync(diskPath), `Missing preview asset on disk: ${diskPath}`);
        }
      }
    }

    for (const assetSrc of [
      ...Object.values(BRAND_LOGO_ASSETS),
      ...Object.values(STUDIO_GARMENT_ASSETS),
    ]) {
      const diskPath = path.join(publicDir, assetSrc.replace(/^\//, ''));
      assert.ok(fs.existsSync(diskPath), `Missing static site asset on disk: ${diskPath}`);
    }
  });

  it('ships all 6 minimal 3D clay comic journey WebP assets on disk', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../site/public');
    for (const lang of ['en', 'ko'] as const) {
      assert.equal(SITE_COPY[lang].journey.cuts.length, 6);
      for (const cut of SITE_COPY[lang].journey.cuts) {
        assert.match(cut.imageSrc, /^\/assets\/journey\/clay-cut-0[1-6]-v1\.webp$/);
        const diskPath = path.join(publicDir, cut.imageSrc.replace(/^\//, ''));
        assert.ok(fs.existsSync(diskPath), `Missing clay journey asset on disk: ${diskPath}`);
      }
    }
  });

  it('ships lightweight 20-bone skinned studio-mannequin-v1.glb with all 6 sculpted meshes', () => {
    const glbPath = path.resolve(
      import.meta.dirname,
      '../../site/public/assets/models/studio-mannequin-v1.glb'
    );
    assert.ok(fs.existsSync(glbPath), `Missing Studio 3D mannequin GLB on disk: ${glbPath}`);
    const buf = fs.readFileSync(glbPath);
    assert.equal(buf.toString('utf8', 0, 4), 'glTF', 'Must be a valid binary glTF 2.0 container');
    assert.ok(buf.byteLength < 1024 * 1024, `Studio GLB must stay under 1 MB (got ${buf.byteLength})`);

    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)) as {
      meshes: Array<{ name: string }>;
      skins: Array<{ name: string; joints: number[] }>;
    };
    const meshNames = gltf.meshes.map((m) => m.name);
    assert.deepEqual(meshNames, [
      'mannequin_body',
      'mannequin_hair',
      'garment_coat',
      'garment_knit',
      'garment_slacks',
      'garment_shoes',
    ]);
    assert.equal(gltf.skins.length, 1);
    assert.equal(gltf.skins[0].joints.length, 20);
  });

  it('provides complete bilingual EN/KO icon-first content, 6-cut clay journey, Google API x 3D theater, 6-tier Dev/Prod blueprint, and 4-line privacy defense', () => {
    for (const lang of ['en', 'ko'] as const) {
      const copy = SITE_COPY[lang];
      assert.ok(copy.hero.titleAccent.length > 0);
      assert.ok(copy.hero.marbleHint.length > 0);
      assert.ok(copy.nav.homeAria.length > 0);
      assert.ok(copy.nav.opacityLabel.length > 0);
      assert.ok(copy.tapHint.length > 0);

      // Studio icon-first features
      assert.equal(copy.appPreview.screens.length, 4);
      assert.equal(copy.capabilities.pillars.atelier.features.length, 4);
      assert.equal(copy.capabilities.pillars.intelligence.features.length, 4);

      // Architecture: 6-Tier System & Hardware Blueprint + Right Governance + 4-Line Privacy + 6 Google API x 3D
      assert.equal(copy.architecture.tiers.length, 6);
      assert.equal(copy.architecture.governance.length, 3);
      assert.equal(copy.architecture.privacyShields.length, 4);
      assert.equal(copy.architecture.mapsNodes.length, 6);
      assert.equal(copy.subtabs.archMaps, 'Google API × Three.js 3D');
      assert.ok(
        copy.architecture.tiers.some((tier) => tier.highlight && tier.id === 'core'),
        'Core service tier must spotlight iNVTRY'
      );
      for (const tier of copy.architecture.tiers) {
        assert.ok(tier.nodes.length >= 1, `Tier ${tier.id} must have at least one node`);
        for (const node of tier.nodes) {
          assert.ok(node.devSpec.length > 0, `Node ${node.id} must define devSpec`);
          assert.ok(node.prodSpec.length > 0, `Node ${node.id} must define prodSpec`);
        }
      }

      // Specs & About narrative flow (01 User Journey -> 02 Mission & Roadmap -> 03 BM & Founder)
      assert.equal(copy.stack.heroKpis.length, 4);
      assert.equal(copy.stack.specs.length, 4);
      assert.equal(copy.stack.pillars3d.length, 6);
      assert.deepEqual(copy.stack.pillarLabels, [...SPECS_3D_PILLAR_LABELS]);
      assert.equal(copy.stack.cards.length, 6);
      assert.equal(copy.journey.cuts.length, 6);
      assert.ok(copy.journey.cuts.some((cut) => cut.status === 'todo'), 'Journey must explicitly mark TO-DO cuts');
      assert.equal(copy.mission.commitments.length, 3);
      assert.equal(copy.mission.loopNodes.length, 5);
      assert.equal(copy.mission.exits.length, 2);
      assert.equal(copy.vision.milestones.length, 3);
      assert.equal(copy.vision.moats.length, 4);
      assert.equal(copy.vision.revenuePillars.length, 3);

      // Legal & Privacy compliance
      assert.ok(copy.legal.privacySections.length >= 4);
      assert.ok(copy.legal.termsSections.length >= 4);

      const serialized = JSON.stringify(copy);
      // Domain authenticity, Google APIs x Three.js, & TO-DO roadmap coverage
      assert.ok(serialized.includes('Weather API v1'), 'Must document Google Weather API v1');
      assert.ok(serialized.includes('Places API (New)'), 'Must document Google Places API (New)');
      assert.ok(serialized.includes('Street View'), 'Must spotlight Google Street View avatar staging');
      assert.ok(serialized.includes('Three.js 0.187'), 'Must spotlight Three.js 0.187 engine');
      assert.ok(serialized.includes('Google Calendar'), 'Must include Google Calendar TO-DO integration');
      assert.ok(serialized.includes('SNS'), 'Must include Instagram/SNS OOTD tagging TO-DO');
      assert.ok(
        lang === 'ko' ? serialized.includes('방문수거') : serialized.includes('pickup'),
        'Must include laundry service app pickup TO-DO'
      );
      assert.ok(
        lang === 'ko' ? serialized.includes('모델명') : serialized.includes('model code'),
        'Must include tag/model-code web lookup TO-DO'
      );
      assert.ok(serialized.includes('L4 / A100'), 'Must contrast Prod GPU hardware spec');
      assert.ok(serialized.includes('OIDC'), 'Must highlight Stateless OIDC privacy defense');
      assert.ok(serialized.includes('CMEK'), 'Must highlight 3-Zone CMEK vault defense');
      assert.ok(
        lang === 'ko' ? serialized.includes('정품 인증') : serialized.includes('Authentic'),
        'Must expand resale concept to luxury/purchase-record verified authentic resale'
      );

      // Hygiene & anti-AI / anti-leak / anti-trademark / line-break safety guards
      assert.ok(!serialized.includes('누끼'), 'Must avoid informal 누끼 slang');
      assert.ok(!serialized.includes('모두의 창업'), 'Must not leak internal program strategy report');
      assert.ok(!serialized.includes('쇼미룩'), 'Must not mention external competitor names');
      assert.ok(!serialized.includes('스타일봇'), 'Must not mention external competitor names');
      assert.ok(!/burberry/i.test(serialized), 'Must never contain third-party luxury brand trademarks');
      assert.ok(!serialized.includes('Capacitor 6'), 'Must reference Capacitor 8');
      assert.ok(!serialized.includes('concierge@'), 'Must use verified raymond@ainvtry.com');
      assert.ok(!serialized.includes('MILANO'), 'Must not contain fabricated office claims');
      assert.ok(!serialized.includes('99.99%'), 'Must not contain unverified mock SLA metrics');
      assert.ok(!serialized.includes('Kyber768'), 'Must not contain fabricated cryptography claims');
      assert.ok(!serialized.includes('H100'), 'Must not contain fabricated H100 hardware claims');
      assert.ok(!serialized.includes('V4.8'), 'Must not contain fake Stitch version badges');
      assert.ok(
        !/[가-힣]·[가-힣]/.test(serialized),
        'Must place spaces around Korean middle dots ( · ) to prevent awkward line-break runs'
      );
    }
  });

  it('enforces Checklist 0~4 zero-loss content parity across both EN and KO', () => {
    // Shared pose bone & drape telemetry contract
    assert.deepEqual(STUDIO_POSE_TELEMETRY.stand, {
      bone: 'BONE_SPINE_02',
      drape: '0.942 N/m²',
    });
    assert.deepEqual(STUDIO_POSE_TELEMETRY.walk, {
      bone: 'BONE_L_CLAVICLE_12',
      drape: '1.184 N/m²',
    });
    assert.deepEqual(STUDIO_POSE_TELEMETRY.rain, {
      bone: 'BONE_R_WRIST_UMBRELLA',
      drape: '1.310 N/m²',
    });

    for (const lang of ['en', 'ko'] as const) {
      const copy = SITE_COPY[lang];
      const serialized = JSON.stringify(copy);
      const isKo = lang === 'ko';

      // 0. Global Chrome, HERO & Legal
      assert.equal(copy.nav.silkLuxury, isKo ? '럭셔리' : 'Luxury');
      assert.equal(copy.nav.silkAurora, isKo ? '오로라' : 'Aurora');
      assert.equal(copy.nav.switchToLight, isKo ? '라이트' : 'Light');
      assert.equal(copy.nav.switchToDark, isKo ? '다크' : 'Dark');
      assert.equal(copy.nav.switchLang, isKo ? 'EN' : 'KO');
      assert.equal(copy.hero.secondaryCta, isKo ? '창업자 문의' : 'Contact Founder');
      assert.ok(
        copy.legal.updatedAt.includes(isKo ? '2026년 11월 23일' : 'November 23, 2026'),
        `[${lang}] Privacy Policy effective date must match Nov 23, 2026`
      );
      assert.ok(serialized.includes('Raymond Moon'), `[${lang}] Must credit Raymond Moon`);
      assert.ok(serialized.includes('raymond@ainvtry.com'), `[${lang}] Must include raymond@ainvtry.com`);

      // 1. Studio — Live App (4 screens)
      const [fitting, closet, stats, profile] = copy.appPreview.screens;
      assert.equal(fitting.locationTag, isKo ? '서울 · 명동' : 'Seoul · Myeongdong');
      assert.ok(
        fitting.hudMetrics.some((m) => m.value === (isKo ? '서울 · 명동' : 'Seoul · Myeongdong')),
        `[${lang}] Fitting screen must show Seoul · Myeongdong location`
      );
      assert.ok(
        closet.hudMetrics.some((m) => m.value === '233 ITEMS'),
        `[${lang}] Closet screen must show 233 ITEMS`
      );
      assert.ok(closet.brands?.includes('ARKET'), `[${lang}] Closet screen must include ARKET`);
      assert.ok(
        closet.hudMetrics.some((m) => m.value.includes('ARKET')),
        `[${lang}] Closet HUD metrics must list ARKET`
      );
      assert.ok(
        stats.hudMetrics.some((m) => m.value === '100% UTILIZATION'),
        `[${lang}] Stats screen must show 100% UTILIZATION`
      );
      assert.ok(
        stats.hudMetrics.some((m) => m.value === '3167'),
        `[${lang}] Stats screen must show 3167 total wears`
      );
      assert.ok(
        stats.hudMetrics.some((m) => m.value === '₩83,000'),
        `[${lang}] Stats screen must show ₩83,000 avg cost/wear`
      );
      assert.ok(
        profile.modeOptions?.includes(isKo ? '캐릭터 시뮬레이션' : 'Character Simulation'),
        `[${lang}] Profile screen must expose Character Simulation mode`
      );
      assert.ok(
        profile.hudMetrics.some(
          (m) => m.value === (isKo ? '미니멀 / 밸런스 / 레이어드' : 'Minimal / Balanced / Layered')
        ),
        `[${lang}] Profile screen must expose Minimal / Balanced / Layered density`
      );

      // 1. Studio — 3D Fitting pose telemetry + PCCS + Care & CPW
      assert.equal(copy.interactive.poseTelemetry.stand.bone, 'BONE_SPINE_02');
      assert.equal(copy.interactive.poseTelemetry.stand.drape, '0.942 N/m²');
      assert.equal(copy.interactive.poseTelemetry.walk.bone, 'BONE_L_CLAVICLE_12');
      assert.equal(copy.interactive.poseTelemetry.walk.drape, '1.184 N/m²');
      assert.equal(copy.interactive.poseTelemetry.rain.bone, 'BONE_R_WRIST_UMBRELLA');
      assert.equal(copy.interactive.poseTelemetry.rain.drape, '1.310 N/m²');
      assert.equal(copy.interactive.pccsNote, isKo ? 'PCCS 12톤 · MST-04' : 'PCCS 12-Tone · MST-04');
      assert.equal(copy.interactive.cpwValue, '₩14,200');
      assert.equal(copy.interactive.cpwDelta, isKo ? '전월 대비 -18%' : '-18% MoM');
      assert.equal(copy.interactive.balanceValue, '98.4%');
      assert.equal(copy.interactive.balanceMeta, isKo ? '이염 충돌 0건' : '0 bleed conflicts');

      // 2. Architecture — Privacy & Security + Google API × Three.js 3D
      assert.equal(copy.interactive.ingestionMeta, '582 KB → 24 KB WebP (-96%)');
      assert.ok(
        serialized.includes('resolveAuthorizedClosets'),
        `[${lang}] Must specify resolveAuthorizedClosets tenant guard`
      );
      assert.ok(
        serialized.includes(isKo ? '15분 서명 URL' : '15m Signed URL'),
        `[${lang}] Must specify 15m Signed URL in 3-Zone storage`
      );
      assert.ok(
        serialized.includes('DELETE /api/auth/account'),
        `[${lang}] Must specify DELETE /api/auth/account atomic erasure`
      );

      const streetViewNode = copy.architecture.mapsNodes.find((n) => n.id === 'streetview');
      assert.ok(streetViewNode?.coordinates?.includes('37.54°N'), `[${lang}] Street View must include 37.54°N`);

      const placesNode = copy.architecture.mapsNodes.find((n) => n.id === 'places');
      assert.deepEqual(
        placesNode?.nearbyCareSpots?.map((spot) => spot.distance),
        ['180m', '320m', '490m'],
        `[${lang}] Places API care spots must preserve 180m / 320m / 490m distances`
      );

      const calendarNode = copy.architecture.mapsNodes.find((n) => n.id === 'calendar');
      assert.equal(calendarNode?.status, 'todo');
      assert.equal(calendarNode?.statusLabel, 'TO-DO');

      // 3. Specs — Key Metrics + Tech Stack
      assert.deepEqual(
        copy.stack.heroKpis.map((kpi) => kpi.value),
        ['5-Stage', '0 Bytes', '340+', '4 APIs'],
        `[${lang}] Hero KPIs must match 5-Stage / 0 Bytes / 340+ / 4 APIs`
      );
      assert.ok(
        copy.stack.cards.some((card) => card.metric === 'Three.js 0.187'),
        `[${lang}] Tech Stack must include Three.js 0.187`
      );
      assert.ok(
        copy.stack.cards.some((card) => card.metric === 'Capacitor 8'),
        `[${lang}] Tech Stack must include Capacitor 8`
      );
      assert.ok(copy.vision.faqs.length >= 4, `[${lang}] Vision must include at least 4 FAQ entries`);

      // 4. About — User Journey + Mission & Roadmap + BM & Founder
      assert.equal(copy.journey.badge, isKo ? '6컷 AI 여정' : '6-Cut AI Cycle');
      assert.equal(copy.mission.centerKicker, 'iNVTRY LOOP');
      assert.deepEqual(
        copy.vision.milestones.map((m) => m.phase),
        ['LIVE 01', 'LIVE 02', 'TO-DO']
      );
    }
  });
});

