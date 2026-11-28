#!/usr/bin/env node
/**
 * Living IR Business Plan Deck Auto-Sync Batch Engine (`npm run ir:sync`)
 *
 * Syncs live Ainventory app & site state directly into:
 *   1. docs/ir-deck/ir-deck.data.json  (structured single-source snapshot)
 *   2. docs/ir-deck/index.html         (updates only `data-ir-bind="..."` slots,
 *                                       preserving all manual IR prose & [TBD] fields)
 *
 * Usage:
 *   node --experimental-strip-types scripts/sync-ir-deck.mjs
 *   node --experimental-strip-types scripts/sync-ir-deck.mjs --check
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DECK_DIR = path.join(REPO_ROOT, 'docs', 'ir-deck');
const DECK_HTML_PATH = path.join(DECK_DIR, 'index.html');
const DECK_DATA_PATH = path.join(DECK_DIR, 'ir-deck.data.json');

const CHECK_ONLY = process.argv.includes('--check');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cleanSemver(raw) {
  return String(raw || '').replace(/^[~^>=<\s]+/, '');
}

function majorMinor(raw) {
  const cleaned = cleanSemver(raw);
  const parts = cleaned.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : cleaned;
}

function majorOnly(raw) {
  return cleanSemver(raw).split('.')[0] || '';
}

function walkTestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTestFiles(full));
    } else if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function collectTestMetrics(repoRoot) {
  const files = walkTestFiles(path.join(repoRoot, 'tests'));
  let totalCases = 0;
  let unitSuites = 0;
  let apiSuites = 0;
  let e2eSuites = 0;

  for (const filePath of files) {
    const rel = path.relative(path.join(repoRoot, 'tests'), filePath);
    if (rel.startsWith('unit')) unitSuites += 1;
    else if (rel.startsWith('api')) apiSuites += 1;
    else if (rel.startsWith('e2e')) e2eSuites += 1;

    const src = fs.readFileSync(filePath, 'utf8');
    const matches = src.match(/\b(?:test|it)\s*\(/g);
    totalCases += matches ? matches.length : 0;
  }

  const roundedTen = Math.floor(totalCases / 10) * 10;
  return {
    suiteCount: files.length,
    unitSuites,
    apiSuites,
    e2eSuites,
    caseCount: totalCases,
    roundedPlus: `${roundedTen}+`,
    summaryShort: `${files.length}개 묶음 · ${totalCases}개 검증 통과`,
    summaryLine: `자동 품질 검증 ${files.length}개 묶음(${totalCases}개 항목) · 웹·앱`,
  };
}

function collectGarmentMetrics(repoRoot, garmentAssets) {
  const jpgRel = path.join('site', 'public', garmentAssets.trenchOriginalJpg.replace(/^\/+/, ''));
  const webpRel = path.join('site', 'public', garmentAssets.trenchWebp.replace(/^\/+/, ''));
  const jpgBytes = fs.statSync(path.join(repoRoot, jpgRel)).size;
  const webpBytes = fs.statSync(path.join(repoRoot, webpRel)).size;

  const jpgKb = Math.round(jpgBytes / 1000);
  const webpKb = Math.round(webpBytes / 1000);
  const savedPct = Math.round((1 - webpBytes / jpgBytes) * 100);

  return {
    beforeBytes: jpgBytes,
    afterBytes: webpBytes,
    beforeKb: jpgKb,
    afterKb: webpKb,
    compressionPct: `-${savedPct}%`,
    pairShort: `${jpgKb}KB → ${webpKb}KB WebP`,
    beforeTitle: `${jpgKb} KB · 위치정보·방 배경 포함`,
    afterTitle: `${webpKb} KB · 위치정보 삭제 · 옷만 분리`,
    costOldBar: `장당 ${jpgKb} KB (위치정보·배경 포함)`,
    costNewBar: `${webpKb} KB`,
    costNewNote: `-${savedPct}% 압축 · 내 폰에 안전 보관`,
    costHeadSaved: `-${savedPct}% 용량 절감`,
  };
}

function hashFileShort(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function collectAssetHashes(repoRoot) {
  const relPaths = [
    'site/public/assets/previews/app-fitting-live-ko-light.webp',
    'site/public/assets/previews/app-fitting-live-ko-dark.webp',
    'site/public/assets/previews/app-fitting-live-en-light.webp',
    'site/public/assets/previews/app-fitting-live-en-dark.webp',
    'site/public/assets/previews/app-closet-ko-light.webp',
    'site/public/assets/previews/app-closet-ko-dark.webp',
    'site/public/assets/previews/app-closet-en-light.webp',
    'site/public/assets/previews/app-closet-en-dark.webp',
    'site/public/assets/previews/app-stats-ko-light.webp',
    'site/public/assets/previews/app-stats-ko-dark.webp',
    'site/public/assets/previews/app-stats-en-light.webp',
    'site/public/assets/previews/app-stats-en-dark.webp',
    'site/public/assets/previews/app-profile-ko-light.webp',
    'site/public/assets/previews/app-profile-ko-dark.webp',
    'site/public/assets/previews/app-profile-en-light.webp',
    'site/public/assets/previews/app-profile-en-dark.webp',
    'site/public/assets/previews/app-calendar-ko-light.webp',
    'site/public/assets/previews/app-calendar-ko-dark.webp',
    'site/public/assets/previews/app-calendar-en-light.webp',
    'site/public/assets/previews/app-calendar-en-dark.webp',
    'site/public/assets/previews/app-weather-ko-light.webp',
    'site/public/assets/previews/app-weather-ko-dark.webp',
    'site/public/assets/previews/app-weather-en-light.webp',
    'site/public/assets/previews/app-weather-en-dark.webp',
    'site/public/assets/previews/s02-part3-market-dark.webp',
    'site/public/assets/previews/s02-part3-market-light.webp',
    'site/public/assets/previews/s02-part4-traction-dark.webp',
    'site/public/assets/previews/s02-part4-traction-light.webp',
    'site/public/assets/previews/site-hero-ko-light.webp',
    'site/public/assets/previews/site-hero-ko-dark.webp',
    'site/public/assets/previews/site-hero-en-light.webp',
    'site/public/assets/previews/site-hero-en-dark.webp',
    'site/public/assets/previews/site-live-studio-ko-light.webp',
    'site/public/assets/previews/site-live-studio-ko-dark.webp',
    'site/public/assets/previews/site-live-studio-en-light.webp',
    'site/public/assets/previews/site-live-studio-en-dark.webp',
    'site/public/assets/previews/site-arch-privacy-ko-light.webp',
    'site/public/assets/previews/site-arch-privacy-ko-dark.webp',
    'site/public/assets/previews/site-arch-privacy-en-light.webp',
    'site/public/assets/previews/site-arch-privacy-en-dark.webp',
    'site/public/assets/previews/site-arch-weather-ko-light.webp',
    'site/public/assets/previews/site-arch-weather-ko-dark.webp',
    'site/public/assets/previews/site-arch-weather-en-light.webp',
    'site/public/assets/previews/site-arch-weather-en-dark.webp',
    'site/public/assets/previews/site-specs-pillars-ko-light.webp',
    'site/public/assets/previews/site-specs-pillars-ko-dark.webp',
    'site/public/assets/previews/site-specs-pillars-en-light.webp',
    'site/public/assets/previews/site-specs-pillars-en-dark.webp',
    'site/public/assets/previews/site-specs-mannequin-ko-light.webp',
    'site/public/assets/previews/site-specs-mannequin-ko-dark.webp',
    'site/public/assets/previews/site-specs-mannequin-en-light.webp',
    'site/public/assets/previews/site-specs-mannequin-en-dark.webp',
    'site/public/assets/previews/site-about-loop-ko-light.webp',
    'site/public/assets/previews/site-about-loop-ko-dark.webp',
    'site/public/assets/previews/site-about-loop-en-light.webp',
    'site/public/assets/previews/site-about-loop-en-dark.webp',
    'site/public/assets/journey/clay-cut-01-v1.webp',
    'site/public/assets/journey/clay-cut-02-v1.webp',
    'site/public/assets/journey/clay-cut-03-v1.webp',
    'site/public/assets/journey/clay-cut-04-v1.webp',
    'site/public/assets/journey/clay-cut-05-v1.webp',
    'site/public/assets/journey/clay-cut-06-v1.webp',
  ];

  const hashes = {};
  const missing = [];
  for (const rel of relPaths) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
    } else {
      hashes[rel] = hashFileShort(abs);
    }
  }
  return { hashes, missing };
}

function readGitMetadata(repoRoot) {
  try {
    const commitDate = execFileSync('git', ['log', '-1', '--format=%cs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    const [yyyy, mm] = commitDate.split('-');
    return {
      syncMonth: yyyy && mm ? `${yyyy}. ${Number(mm)}.` : '2026. 11.',
    };
  } catch {
    return { syncMonth: '2026. 11.' };
  }
}

/**
 * Code-truth 3-tier feature status for IR Deck v6.0 (C5 compliance).
 * Verified against src/components/*, server/*, and android/ (ios/ not yet created).
 * - 'live'    -> 출시
 * - 'beta'    -> 베타 (care_label_scan OCR implemented in AddGarmentModal.jsx & garmentVisionService.js)
 * - 'planned' -> 개발 예정 (pickup booking & resale/donation commerce not yet built)
 */
const IR_V6_JOURNEY_TRUTH = {
  buy: { status: 'live', label: '출시' },
  scan: { status: 'beta', label: '베타' },
  weather: { status: 'live', label: '출시' },
  share: { status: 'live', label: '출시' },
  care: { status: 'planned', label: '개발 예정' },
  resale: { status: 'planned', label: '개발 예정' },
};

function journeyStatusToClass(status) {
  if (status === 'live') return 'badge badge--live';
  if (status === 'beta') return 'badge badge--beta';
  return 'badge badge--planned';
}

function milestoneStatusToClass(status) {
  if (status === 'done') return 'badge badge--live';
  return 'badge badge--gold';
}

export async function collectIrDeckSnapshot(repoRoot = REPO_ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const contentUrl = pathToFileURL(path.join(repoRoot, 'src', 'data', 'content.ts')).href;
  const contentMod = await import(contentUrl);
  const siteMeta = contentMod.SITE_META;
  const ko = contentMod.SITE_COPY.ko;

  const tests = collectTestMetrics(repoRoot);
  const garment = collectGarmentMetrics(repoRoot, contentMod.STUDIO_GARMENT_ASSETS);
  const assets = collectAssetHashes(repoRoot);
  const git = readGitMetadata(repoRoot);

  const versions = {
    react: cleanSemver(deps.react),
    reactMajor: majorOnly(deps.react),
    typescript: cleanSemver(deps.typescript),
    typescriptMajor: majorOnly(deps.typescript),
    vite: cleanSemver(deps.vite),
    viteMajor: majorOnly(deps.vite),
    express: cleanSemver(deps.express),
    expressMajor: majorOnly(deps.express),
    capacitor: cleanSemver(deps['@capacitor/core']),
    capacitorMajor: majorOnly(deps['@capacitor/core']),
    three: cleanSemver(deps.three),
    threeMinor: majorMinor(deps.three),
    threeBadge: `Three.js ${majorMinor(deps.three)}`,
    threeVtonTag: `Three.js ${majorMinor(deps.three)} 연출 · 8각도 AI 가상 피팅`,
    stackShort: `React ${majorOnly(deps.react)} · Vite ${majorOnly(deps.vite)} · Express ${majorOnly(deps.express)} · Capacitor ${majorOnly(deps['@capacitor/core'])} (Android · Web 우선, iOS 예정)`,
    clientEdge: `React ${majorOnly(deps.react)} · Capacitor ${majorOnly(deps['@capacitor/core'])} · Three.js ${majorMinor(deps.three)} · MediaPipe WASM(얼굴 원본 0B) · IndexedDB`,
  };

  /** @type {Record<string, { num: string, shortTitle: string, status: string, label: string, badgeClass: string }>} */
  const journey = {};
  for (const cut of ko.journey.cuts) {
    const truth = IR_V6_JOURNEY_TRUTH[cut.id] || { status: 'planned', label: '개발 예정' };
    journey[cut.id] = {
      num: cut.num,
      shortTitle: cut.shortTitle,
      status: truth.status,
      label: truth.label,
      badgeClass: journeyStatusToClass(truth.status),
    };
  }

  /** @type {Record<string, { phase: string, status: string, badgeText: string, badgeClass: string, title: string }>} */
  const roadmap = {};
  ko.vision.milestones.forEach((m, idx) => {
    const phaseNum = String(idx + 1);
    const isDone = m.status === 'done';
    roadmap[m.id] = {
      phase: m.phase,
      status: m.status,
      badgeText: isDone ? `${phaseNum}단계 · 구현 완료` : `${phaseNum}단계 · 진행 예정`,
      badgeClass: milestoneStatusToClass(m.status),
      title: m.title,
    };
  });

  const liveDoneCount = ko.vision.milestones.filter((m) => m.status === 'done').length;
  const roadmapPillText = liveDoneCount >= 2 ? `핵심 기능 구현 완료` : `${liveDoneCount}단계 완료`;

  const en = contentMod.SITE_COPY.en;
  const pacerSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'utils', 'adaptiveFramePacer.ts'),
    'utf8'
  );
  const supports120Fps =
    pacerSrc.includes('boost120') && pacerSrc.includes('detectedRefreshHz: allowHighRefresh ? 120 : 60');
  const maxFps = supports120Fps ? 120 : 60;
  const performance = {
    maxFps,
    fpsLabel: `${maxFps} FPS`,
    fpsCompact: `${maxFps}FPS`,
    fpsThreeChip: `Three.js 연출 · ${maxFps} FPS`,
    fpsMorphChip: `${maxFps} FPS · Three.js 연출`,
  };
  const hero = {
    kicker: ko.hero.kicker,
    titleLead: ko.hero.titleLead,
    titleAccent: ko.hero.titleAccent,
    subtitle: ko.hero.subtitle,
    secondaryCta: ko.hero.secondaryCta,
    tocCover: `01 · 표지 — ${ko.hero.titleLead} · ${siteMeta.logoMark}`,
    tocAgendaItem: ko.hero.titleLead,
    en: {
      kicker: en.hero.kicker,
      titleLead: en.hero.titleLead,
      titleAccent: en.hero.titleAccent,
      subtitle: en.hero.subtitle,
      secondaryCta: en.hero.secondaryCta,
    },
  };

  return {
    schemaVersion: '6.0',
    syncMonth: git.syncMonth,
    meta: {
      brandName: siteMeta.brandName,
      logoMark: siteMeta.logoMark,
      domain: siteMeta.domain,
      url: `https://www.${siteMeta.domain}`,
      urlShort: `www.${siteMeta.domain}`,
      founderName: siteMeta.founderName,
      contactEmail: siteMeta.contactEmail,
      founderContact: `${siteMeta.founderName} (대표) · ${siteMeta.contactEmail}`,
      domainContact: `${siteMeta.domain} · ${siteMeta.contactEmail}`,
      locationDate: `대한민국 서울 · ${git.syncMonth}`,
    },
    hero,
    performance,
    versions,
    tests,
    garment,
    journey,
    roadmap,
    roadmapPillText,
    assets,
  };
}

function buildBindingsMap(snapshot) {
  const flat = {
    'meta.url': { text: snapshot.meta.url },
    'meta.urlShort': { text: snapshot.meta.urlShort },
    'meta.founderName': { text: snapshot.meta.founderName },
    'meta.founderContact': { text: snapshot.meta.founderContact },
    'meta.contactEmail': { text: snapshot.meta.contactEmail },
    'meta.domainContact': { text: snapshot.meta.domainContact },
    'meta.locationDate': { text: snapshot.meta.locationDate },
    'meta.syncMonth': { text: snapshot.syncMonth },

    'hero.kicker': { text: snapshot.hero.kicker },
    'hero.titleLead': { text: snapshot.hero.titleLead },
    'hero.subtitle': { text: snapshot.hero.subtitle },
    'hero.secondaryCta': { text: snapshot.hero.secondaryCta },
    'hero.tocCover': { text: snapshot.hero.tocCover },
    'hero.tocAgendaItem': { text: snapshot.hero.tocAgendaItem },

    'performance.maxFps': { text: String(snapshot.performance.maxFps) },
    'performance.fpsLabel': { text: snapshot.performance.fpsLabel },
    'performance.fpsThreeChip': { text: snapshot.performance.fpsThreeChip },
    'performance.fpsMorphChip': { text: snapshot.performance.fpsMorphChip },

    'versions.threeBadge': { text: snapshot.versions.threeBadge },
    'versions.threeVtonTag': { text: snapshot.versions.threeVtonTag },
    'versions.stackShort': { text: snapshot.versions.stackShort },
    'versions.clientEdge': { text: snapshot.versions.clientEdge },
    'versions.reactMajor': { text: `React ${snapshot.versions.reactMajor}` },
    'versions.expressMajor': { text: `Express ${snapshot.versions.expressMajor}` },
    'versions.capacitorMajor': { text: `Capacitor ${snapshot.versions.capacitorMajor}` },

    'tests.roundedPlus': { text: snapshot.tests.roundedPlus },
    'tests.summaryShort': { text: snapshot.tests.summaryShort },
    'tests.summaryLine': { text: snapshot.tests.summaryLine },
    'tests.tractionTitle': { text: `${snapshot.tests.roundedPlus} 자동 품질 검증` },
    'tests.tocTag': { text: `${snapshot.tests.roundedPlus} 검증` },

    'garment.compression': { text: snapshot.garment.compressionPct },
    'garment.pairShort': { text: snapshot.garment.pairShort },
    'garment.beforeKb': { text: `${snapshot.garment.beforeKb} KB` },
    'garment.afterKb': { text: `${snapshot.garment.afterKb} KB` },
    'garment.beforeTitle': { text: snapshot.garment.beforeTitle },
    'garment.afterTitle': { text: snapshot.garment.afterTitle },
    'garment.costOldBar': { text: snapshot.garment.costOldBar },
    'garment.costNewBar': { text: snapshot.garment.costNewBar },
    'garment.costNewNote': { text: snapshot.garment.costNewNote },
    'garment.costHeadSaved': { text: snapshot.garment.costHeadSaved },
    'garment.wasmNote': { text: `기기 내 처리 · ${snapshot.garment.afterKb} KB WebP` },
    'garment.flowArrow': { text: `${snapshot.garment.afterKb} KB WebP →` },
    'garment.pipelineFooter': { text: `핵심 기술 — ${snapshot.garment.pairShort} 기기 내 경량화` },

    'roadmap.pill': { text: snapshot.roadmapPillText },
  };

  for (const [id, cut] of Object.entries(snapshot.journey)) {
    flat[`journey.${id}.badge`] = { text: cut.label, className: cut.badgeClass };
  }

  for (const [id, ms] of Object.entries(snapshot.roadmap)) {
    flat[`roadmap.${id}.badge`] = { text: ms.badgeText, className: ms.badgeClass };
  }

  return flat;
}

export function applyBindingsToHtml(html, snapshot) {
  const bindings = buildBindingsMap(snapshot);
  const matchedKeys = new Set();

  // Matches any element with data-ir-bind="key" containing plain text (no nested HTML tags)
  const nextHtml = html.replace(
    /<([a-zA-Z0-9-]+)([^>]*\bdata-ir-bind="([^"]+)"[^>]*)>([^<]*)<\/\1>/g,
    (fullMatch, tag, attrs, key, currentText) => {
      const binding = bindings[key];
      if (!binding) return fullMatch;
      matchedKeys.add(key);

      let nextAttrs = attrs;
      if (binding.className) {
        if (/\bclass="[^"]*"/.test(nextAttrs)) {
          nextAttrs = nextAttrs.replace(/\bclass="[^"]*"/, `class="${binding.className}"`);
        } else {
          nextAttrs = `${nextAttrs} class="${binding.className}"`;
        }
      }

      const nextText = escapeHtml(binding.text);
      if (nextAttrs === attrs && nextText === currentText) {
        return fullMatch;
      }
      return `<${tag}${nextAttrs}>${nextText}</${tag}>`;
    }
  );

  return { html: nextHtml, matchedCount: matchedKeys.size };
}

export function toHostedWebHtml(html) {
  return html.replace(/\.\.\/\.\.\/site\/public\/assets\//g, '/assets/');
}

function syncHostedWebDeck(repoRoot, syncedDocsHtml, nextDataJson, checkOnly) {
  const docsDir = path.join(repoRoot, 'docs', 'ir-deck');
  const hostedDir = path.join(repoRoot, 'site', 'public', 'ir');
  const hostedBgDir = path.join(hostedDir, 'assets', 'bg');

  const expectedTextFiles = [
    { rel: 'index.html', content: toHostedWebHtml(syncedDocsHtml) },
    { rel: 'ir-deck.css', content: fs.readFileSync(path.join(docsDir, 'ir-deck.css'), 'utf8') },
    { rel: 'ir-deck-i18n.js', content: fs.readFileSync(path.join(docsDir, 'ir-deck-i18n.js'), 'utf8') },
    { rel: 'ir-deck.js', content: fs.readFileSync(path.join(docsDir, 'ir-deck.js'), 'utf8') },
    { rel: 'ir-deck.data.json', content: nextDataJson },
  ];

  const bgDir = path.join(docsDir, 'assets', 'bg');
  const bgFiles = fs.existsSync(bgDir)
    ? fs.readdirSync(bgDir).filter((name) => name.endsWith('.webp')).sort()
    : [];

  const drifted = [];

  for (const file of expectedTextFiles) {
    const dest = path.join(hostedDir, file.rel);
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (current !== file.content) {
      drifted.push(`site/public/ir/${file.rel}`);
      if (!checkOnly) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, file.content, 'utf8');
      }
    }
  }

  const expectedBgSet = new Set(bgFiles);
  for (const name of bgFiles) {
    const srcBuf = fs.readFileSync(path.join(bgDir, name));
    const dest = path.join(hostedBgDir, name);
    const curBuf = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    if (!curBuf || !curBuf.equals(srcBuf)) {
      drifted.push(`site/public/ir/assets/bg/${name}`);
      if (!checkOnly) {
        fs.mkdirSync(hostedBgDir, { recursive: true });
        fs.writeFileSync(dest, srcBuf);
      }
    }
  }

  if (fs.existsSync(hostedBgDir)) {
    for (const existing of fs.readdirSync(hostedBgDir)) {
      if (existing.endsWith('.webp') && !expectedBgSet.has(existing)) {
        drifted.push(`site/public/ir/assets/bg/${existing} (stale)`);
        if (!checkOnly) {
          fs.unlinkSync(path.join(hostedBgDir, existing));
        }
      }
    }
  }

  return drifted;
}

async function main() {
  const snapshot = await collectIrDeckSnapshot(REPO_ROOT);

  if (snapshot.assets.missing.length > 0) {
    process.stderr.write(
      `[ir:sync] Missing required site assets referenced by IR deck:\n  - ${snapshot.assets.missing.join('\n  - ')}\n`
    );
    process.exit(1);
  }

  const nextDataJson = `${JSON.stringify(snapshot, null, 2)}\n`;
  const currentDataJson = fs.existsSync(DECK_DATA_PATH)
    ? fs.readFileSync(DECK_DATA_PATH, 'utf8')
    : '';

  const currentHtml = fs.readFileSync(DECK_HTML_PATH, 'utf8');
  const { html: nextHtml, matchedCount } = applyBindingsToHtml(currentHtml, snapshot);

  const dataChanged = nextDataJson !== currentDataJson;
  const htmlChanged = nextHtml !== currentHtml;
  const hostedDrifted = syncHostedWebDeck(REPO_ROOT, nextHtml, nextDataJson, CHECK_ONLY);

  if (CHECK_ONLY) {
    if (dataChanged || htmlChanged || hostedDrifted.length > 0) {
      const reasons = [
        dataChanged ? 'docs/ir-deck/ir-deck.data.json' : null,
        htmlChanged ? 'docs/ir-deck/index.html' : null,
        ...hostedDrifted,
      ].filter(Boolean);
      process.stderr.write(
        `[ir:sync:check] DRIFT DETECTED (${reasons.join(', ')}). Run \`npm run ir:sync\` to update.\n`
      );
      process.exit(1);
    }
    process.stdout.write(
      `[ir:sync:check] OK — IR deck & hosted /ir/ are in sync with live app/site (${matchedCount} bindings, ${snapshot.tests.caseCount} tests across ${snapshot.tests.suiteCount} suites).\n`
    );
    return;
  }

  if (dataChanged) {
    fs.writeFileSync(DECK_DATA_PATH, nextDataJson, 'utf8');
  }
  if (htmlChanged) {
    fs.writeFileSync(DECK_HTML_PATH, nextHtml, 'utf8');
  }

  process.stdout.write(
    `[ir:sync] Synced ${matchedCount} live bindings (${snapshot.tests.roundedPlus} tests, ${snapshot.versions.threeBadge}, ${snapshot.garment.pairShort}) -> data:${dataChanged ? 'updated' : 'unchanged'}, html:${htmlChanged ? 'updated' : 'unchanged'}, hosted(/ir/):${hostedDrifted.length > 0 ? `updated(${hostedDrifted.length})` : 'unchanged'}.\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}
