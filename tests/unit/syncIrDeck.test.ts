import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
  applyBindingsToHtml,
  collectIrDeckSnapshot,
  toHostedWebHtml,
} from '../../scripts/sync-ir-deck.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DECK_HTML_PATH = path.join(REPO_ROOT, 'docs', 'ir-deck', 'index.html');
const HOSTED_DECK_HTML_PATH = path.join(REPO_ROOT, 'site', 'public', 'ir', 'index.html');

describe('Living IR Deck auto-sync & terminology guardrails', () => {
  test('collectIrDeckSnapshot reads real package versions, test counts, and garment compression', async () => {
    const snapshot = await collectIrDeckSnapshot(REPO_ROOT);

    assert.equal(snapshot.assets.missing.length, 0, 'all referenced site assets must exist');
    assert.match(snapshot.versions.threeBadge, /^Three\.js \d+\.\d+$/);
    assert.ok(snapshot.tests.suiteCount >= 40, 'should count full unit/api/e2e test suites');
    assert.ok(snapshot.tests.caseCount >= 300, 'should count real test cases');
    assert.ok(snapshot.garment.beforeBytes > snapshot.garment.afterBytes);
    assert.match(snapshot.garment.compressionPct, /^-\d+%$/);
    assert.ok(snapshot.journey.buy && snapshot.journey.share && snapshot.journey.resale);
    assert.ok(snapshot.roadmap['stage-1'] && snapshot.roadmap['stage-3']);
  });

  test('applyBindingsToHtml updates bound text and badge class while preserving [TBD] fields', async () => {
    const snapshot = await collectIrDeckSnapshot(REPO_ROOT);
    const sample = [
      '<strong data-ir-bind="tests.roundedPlus">0</strong>',
      '<span class="badge badge--todo" data-ir-bind="journey.buy.badge">OLD</span>',
      '<div class="kpi-num">[TBD] 억원</div>',
    ].join('\n');

    const { html, matchedCount } = applyBindingsToHtml(sample, snapshot);

    assert.equal(matchedCount, 2);
    assert.ok(html.includes(`data-ir-bind="tests.roundedPlus">${snapshot.tests.roundedPlus}</strong>`));
    assert.ok(html.includes('class="badge badge--live" data-ir-bind="journey.buy.badge">출시</span>'));
    assert.ok(html.includes('[TBD] 억원'), 'manual [TBD] investor placeholders must never be overwritten');
  });

  test('IR deck strictly restricts "3D" terminology to Three.js contexts only', () => {
    const html = fs.readFileSync(DECK_HTML_PATH, 'utf8');
    const lines = html.split('\n');
    const violations: string[] = [];

    lines.forEach((line, idx) => {
      if (/(?:^|[^a-zA-Z0-9])3D(?![a-zA-Z0-9])/i.test(line) && !/three\.js/i.test(line)) {
        violations.push(`line ${idx + 1}: ${line.trim()}`);
      }
    });

    assert.deepEqual(
      violations,
      [],
      `Non-Three.js "3D" wording detected in docs/ir-deck/index.html:\n${violations.join('\n')}`
    );
    assert.ok(!html.includes('누끼'), 'docs/ir-deck/index.html must not contain informal "누끼" slang');
  });

  test('committed docs/ir-deck/index.html and hosted site/public/ir/index.html are in zero-drift sync with live codebase', async () => {
    const snapshot = await collectIrDeckSnapshot(REPO_ROOT);
    const currentHtml = fs.readFileSync(DECK_HTML_PATH, 'utf8');
    const { html: syncedHtml, matchedCount } = applyBindingsToHtml(currentHtml, snapshot);

    assert.ok(matchedCount >= 30, 'expected at least 30 active live bindings in IR deck');
    assert.equal(
      syncedHtml,
      currentHtml,
      'docs/ir-deck/index.html drifted from live codebase — run `npm run ir:sync`'
    );

    assert.ok(fs.existsSync(HOSTED_DECK_HTML_PATH), 'hosted site/public/ir/index.html must exist');
    const hostedHtml = fs.readFileSync(HOSTED_DECK_HTML_PATH, 'utf8');
    assert.equal(
      hostedHtml,
      toHostedWebHtml(syncedHtml),
      'site/public/ir/index.html drifted from docs/ir-deck/index.html — run `npm run ir:sync`'
    );
    assert.ok(
      !hostedHtml.includes('../../site/public/assets/'),
      'hosted /ir/index.html must rewrite relative site asset paths to /assets/'
    );
    assert.ok(
      hostedHtml.includes('data-light-src-en="/assets/previews/app-fitting-live-en-light.webp"'),
      'hosted /ir/index.html must include rewritten English Light preview assets'
    );
    assert.ok(
      hostedHtml.includes('data-dark-src-en="/assets/previews/app-fitting-live-en-dark.webp"'),
      'hosted /ir/index.html must include rewritten English Dark preview assets'
    );
  });

  test('bilingual ir-deck-i18n.js dictionary is synced to hosted /ir/ and covers KO/EN switching', () => {
    const docsI18nPath = path.join(REPO_ROOT, 'docs', 'ir-deck', 'ir-deck-i18n.js');
    const hostedI18nPath = path.join(REPO_ROOT, 'site', 'public', 'ir', 'ir-deck-i18n.js');
    assert.ok(fs.existsSync(docsI18nPath), 'docs/ir-deck/ir-deck-i18n.js must exist');
    assert.ok(fs.existsSync(hostedI18nPath), 'hosted site/public/ir/ir-deck-i18n.js must exist');
    assert.equal(
      fs.readFileSync(hostedI18nPath, 'utf8'),
      fs.readFileSync(docsI18nPath, 'utf8'),
      'site/public/ir/ir-deck-i18n.js drifted from docs/ir-deck/ir-deck-i18n.js — run `npm run ir:sync`'
    );
    const i18nSrc = fs.readFileSync(docsI18nPath, 'utf8');
    assert.ok(i18nSrc.includes('RICH_HTML_EN') && i18nSrc.includes('TEXT_EN') && i18nSrc.includes('formatBoundEn'));
  });

  test('Slide 01 mounts live official site Hero via iframe and syncs lang/theme/mood', () => {
    const html = fs.readFileSync(DECK_HTML_PATH, 'utf8');
    const js = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'ir-deck', 'ir-deck.js'), 'utf8');
    assert.ok(html.includes('id="ir-live-hero-frame"'), 'Slide 01 must include live official site iframe');
    assert.ok(js.includes("'ir-cover'") && js.includes('invtry:ir-cover-sync'), 'ir-deck.js must wire live cover embed sync');
    assert.ok(!html.includes('s-head-right'), 'slides must not render cluttered right-side header badges');
    assert.ok(!html.includes('하루 옷 입기 6순간'), 'unnatural Korean slide title must stay removed');
    assert.ok(!/420\+|410\+|428개|data-ir-bind="tests\./.test(html), 'IR deck must not display internal 420+ test count metrics');
    const ninetySixMatches = html.match(/96%/g) ?? [];
    assert.equal(ninetySixMatches.length, 1, 'IR deck must mention 96% image-size reduction strictly once');
    const slide08Match = html.match(/<section id="slide-08"[\s\S]*?<\/section>/);
    assert.ok(slide08Match && slide08Match[0].includes('96%'), 'the sole 96% reduction mention must live inside Slide 08 core tech');
    assert.ok(html.includes('id="ir-mobile-bottom-nav"') && html.includes('id="ir-mobile-sheet"'), 'IR deck must include single-DOM synced mobile nav and settings sheet');
    assert.ok(js.includes('MOBILE_BREAKPOINT') && js.includes('data-layout'), 'ir-deck.js must auto-sync desktop and mobile layouts from the same single DOM');
  });
});

