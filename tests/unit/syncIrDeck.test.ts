import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { applyBindingsToHtml, collectIrDeckSnapshot } from '../../scripts/sync-ir-deck.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DECK_HTML_PATH = path.join(REPO_ROOT, 'docs', 'ir-deck', 'index.html');

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
    assert.ok(html.includes('class="badge badge--live" data-ir-bind="journey.buy.badge">LIVE</span>'));
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
  });

  test('committed docs/ir-deck/index.html is in zero-drift sync with live codebase', async () => {
    const snapshot = await collectIrDeckSnapshot(REPO_ROOT);
    const currentHtml = fs.readFileSync(DECK_HTML_PATH, 'utf8');
    const { html: syncedHtml, matchedCount } = applyBindingsToHtml(currentHtml, snapshot);

    assert.ok(matchedCount >= 30, 'expected at least 30 active live bindings in IR deck');
    assert.equal(
      syncedHtml,
      currentHtml,
      'docs/ir-deck/index.html drifted from live codebase — run `npm run ir:sync`'
    );
  });
});
