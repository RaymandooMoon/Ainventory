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
    summaryShort: `${files.length}스위트 · ${totalCases}케이스 통과`,
    summaryLine: `단위·API·WebGL E2E ${files.length}스위트(${totalCases}케이스) · 3플랫폼`,
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
    beforeTitle: `${jpgKb} KB · EXIF/GPS/실내 포함`,
    afterTitle: `${webpKb} KB · EXIF 0% · 순수 의류`,
    costOldBar: `${jpgKb} KB / 장 (EXIF·배경 포함)`,
    costNewBar: `${webpKb} KB`,
    costNewNote: `-${savedPct}% 압축 · IndexedDB 로컬 캐시`,
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
    'site/public/assets/previews/app-closet-ko-light.webp',
    'site/public/assets/previews/app-closet-ko-dark.webp',
    'site/public/assets/previews/app-stats-ko-light.webp',
    'site/public/assets/previews/app-stats-ko-dark.webp',
    'site/public/assets/previews/app-profile-ko-light.webp',
    'site/public/assets/previews/app-profile-ko-dark.webp',
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
      syncMonth: yyyy && mm ? `${yyyy}.${mm}` : '2026.11',
    };
  } catch {
    return { syncMonth: '2026.11' };
  }
}

function journeyStatusToClass(status) {
  if (status === 'live') return 'badge badge--live';
  if (status === 'hybrid') return 'badge badge--hybrid';
  return 'badge badge--todo';
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
    threeVtonTag: `THREE.JS ${majorMinor(deps.three)} · VTON`,
    stackShort: `React ${majorOnly(deps.react)} · Vite ${majorOnly(deps.vite)} · Express ${majorOnly(deps.express)} · Capacitor ${majorOnly(deps['@capacitor/core'])} (iOS/Android)`,
    clientEdge: `React ${majorOnly(deps.react)} · Capacitor ${majorOnly(deps['@capacitor/core'])} · Three.js ${majorMinor(deps.three)} · MediaPipe WASM(0B) · IndexedDB`,
  };

  /** @type {Record<string, { num: string, shortTitle: string, status: string, label: string, badgeClass: string }>} */
  const journey = {};
  for (const cut of ko.journey.cuts) {
    journey[cut.id] = {
      num: cut.num,
      shortTitle: cut.shortTitle,
      status: cut.status,
      label: cut.shortStatusLabel,
      badgeClass: journeyStatusToClass(cut.status),
    };
  }

  /** @type {Record<string, { phase: string, status: string, badgeText: string, badgeClass: string, title: string }>} */
  const roadmap = {};
  ko.vision.milestones.forEach((m, idx) => {
    const phaseNum = String(idx + 1).padStart(2, '0');
    const isDone = m.status === 'done';
    roadmap[m.id] = {
      phase: m.phase,
      status: m.status,
      badgeText: isDone ? `PHASE ${phaseNum} · 완료` : `PHASE ${phaseNum} · 2026.Q4~27`,
      badgeClass: milestoneStatusToClass(m.status),
      title: m.title,
    };
  });

  const liveDoneCount = ko.vision.milestones.filter((m) => m.status === 'done').length;
  const roadmapPillText = liveDoneCount >= 2 ? `LIVE 01·02 완료` : `LIVE ${liveDoneCount} 완료`;

  return {
    schemaVersion: '3.1',
    syncMonth: git.syncMonth,
    meta: {
      brandName: siteMeta.brandName,
      logoMark: siteMeta.logoMark,
      domain: siteMeta.domain,
      url: `https://www.${siteMeta.domain}`,
      urlShort: `www.${siteMeta.domain}`,
      founderName: siteMeta.founderName,
      contactEmail: siteMeta.contactEmail,
      founderContact: `${siteMeta.founderName} · ${siteMeta.contactEmail}`,
      domainContact: `${siteMeta.domain} · ${siteMeta.contactEmail}`,
      locationDate: `Seoul, Republic of Korea · ${git.syncMonth}`,
    },
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
    'meta.founderContact': { text: snapshot.meta.founderContact },
    'meta.contactEmail': { text: snapshot.meta.contactEmail },
    'meta.domainContact': { text: snapshot.meta.domainContact },
    'meta.locationDate': { text: snapshot.meta.locationDate },

    'versions.threeBadge': { text: snapshot.versions.threeBadge },
    'versions.threeVtonTag': { text: snapshot.versions.threeVtonTag },
    'versions.stackShort': { text: snapshot.versions.stackShort },
    'versions.clientEdge': { text: snapshot.versions.clientEdge },

    'tests.roundedPlus': { text: snapshot.tests.roundedPlus },
    'tests.summaryShort': { text: snapshot.tests.summaryShort },
    'tests.summaryLine': { text: snapshot.tests.summaryLine },
    'tests.tractionTitle': { text: `${snapshot.tests.roundedPlus} 자동화 테스트` },
    'tests.tocTag': { text: `${snapshot.tests.roundedPlus} TESTS` },

    'garment.compression': { text: snapshot.garment.compressionPct },
    'garment.pairShort': { text: snapshot.garment.pairShort },
    'garment.beforeTitle': { text: snapshot.garment.beforeTitle },
    'garment.afterTitle': { text: snapshot.garment.afterTitle },
    'garment.costOldBar': { text: snapshot.garment.costOldBar },
    'garment.costNewBar': { text: snapshot.garment.costNewBar },
    'garment.costNewNote': { text: snapshot.garment.costNewNote },
    'garment.costHeadSaved': { text: snapshot.garment.costHeadSaved },
    'garment.wasmNote': { text: `WASM 로컬 + ${snapshot.garment.afterKb}KB 무학습` },
    'garment.flowArrow': { text: `${snapshot.garment.afterKb}KB WebP →` },
    'garment.pipelineFooter': { text: `Core Technology — Verified ${snapshot.garment.pairShort} Pipeline` },

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
