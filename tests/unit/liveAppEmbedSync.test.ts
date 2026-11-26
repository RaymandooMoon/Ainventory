import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('Embedded Live Studio screen sync (Calendar tab regression guard)', () => {
  it('includes calendar in LiveAppScreenId and StageInteractionState.studioPreviewScreen', () => {
    const embedSrc = readRepoFile('src/site/liveAppEmbed.tsx');
    const stageTypesSrc = readRepoFile('src/three/stageTypes.ts');

    assert.match(
      embedSrc,
      /export type LiveAppScreenId =[^;]*'calendar'/
    );
    assert.match(
      stageTypesSrc,
      /studioPreviewScreen:[^;]*'calendar'/
    );
  });

  it('never remaps calendar to outfits when posting ainvtry-live-app-screen and accepts calendar in handleEmbedSync', () => {
    const appSrc = readRepoFile('src/App.jsx');

    assert.ok(
      !appSrc.includes("target.key === 'calendar' || target.key === 'admin' ? 'outfits'"),
      'App.jsx must NOT remap calendar tab to outfits when posting to parent frame'
    );
    assert.ok(
      appSrc.includes("type: 'ainvtry-live-app-screen'") && appSrc.includes('screen: target.key'),
      'App.jsx should post the exact target.key screen ID for embedded tabs'
    );
    assert.ok(
      appSrc.includes("detail.screen === 'calendar'"),
      'App.jsx handleEmbedSync must accept calendar screen sync'
    );
  });

  it('accepts calendar in LiveAppStageOverlay and suppresses echo-loop screen overrides on non-screen syncs', () => {
    const overlaySrc = readRepoFile('src/site/LiveAppStageOverlay.tsx');

    assert.ok(
      overlaySrc.includes("screenVal === 'calendar'"),
      'LiveAppStageOverlay must allow calendar screen notifications from iframe'
    );
    assert.ok(
      overlaySrc.includes('lastSyncedScreenRef.current = screenVal'),
      'LiveAppStageOverlay must record iframe-reported screen so it does not echo screen back'
    );
    assert.ok(
      overlaySrc.includes('...(includeScreen ? { screen: nextScreen } : {})'),
      'LiveAppStageOverlay must omit screen during pure lang/theme/mood/visibility syncs'
    );
  });
});
