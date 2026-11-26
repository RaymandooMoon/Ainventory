import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  createLightweightStudioCubeEnvMap,
  disposeStudioEnvMap,
} from '../../src/three/stages/stageMaterials.ts';
import {
  isIosSafariRuntime,
  isIosTouchDevice,
  safeReleasePointerCapture,
  safeSetPointerCapture,
} from '../../src/utils/iosSafariCompat.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('Apple iOS Safari / iPhone Air compatibility contract', () => {
  it('accurately identifies iPhone, iPad, iPadOS desktop-mode Safari while excluding Android and desktop Chrome', () => {
    const iphoneAirSafari = {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    };
    const ipadDesktopModeSafari = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    };
    const desktopMacChrome = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    };
    const androidChrome = {
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    };

    assert.equal(isIosTouchDevice(iphoneAirSafari), true);
    assert.equal(isIosSafariRuntime(iphoneAirSafari), true);

    assert.equal(isIosTouchDevice(ipadDesktopModeSafari), true);
    assert.equal(isIosSafariRuntime(ipadDesktopModeSafari), true);

    assert.equal(isIosTouchDevice(desktopMacChrome), false);
    assert.equal(isIosSafariRuntime(desktopMacChrome), false);

    assert.equal(isIosTouchDevice(androidChrome), false);
    assert.equal(isIosSafariRuntime(androidChrome), false);
  });

  it('safely swallows InvalidStateError during pointer capture on iOS Safari touch cancel', () => {
    const throwingEl = {
      setPointerCapture() {
        throw new Error('InvalidStateError');
      },
      hasPointerCapture() {
        return true;
      },
      releasePointerCapture() {
        throw new Error('InvalidStateError');
      },
    } as unknown as Element;

    assert.equal(safeSetPointerCapture(throwingEl, 7), false);
    assert.doesNotThrow(() => safeReleasePointerCapture(throwingEl, 7));
    assert.equal(safeSetPointerCapture(null, 1), false);
  });

  it('never sets body { touch-action: none } and enables pan-y scrolling on HUD & modal scrollers', () => {
    const tokensCss = readRepoFile('src/site/styles/tokensAndShell.css');
    const stageHudCss = readRepoFile('src/site/styles/stageHud.css');
    const modalsCss = readRepoFile('src/site/styles/modalsAndAnalytics.css');

    const bodyRuleMatch = tokensCss.match(/body\s*\{[^}]*\}/);
    assert.ok(bodyRuleMatch, 'body CSS rule should exist in tokensAndShell.css');
    assert.ok(
      !bodyRuleMatch[0].includes('touch-action: none'),
      'body must NOT declare touch-action: none (breaks all scrolling on iOS Safari)'
    );
    assert.ok(
      bodyRuleMatch[0].includes('touch-action: manipulation'),
      'body should declare touch-action: manipulation'
    );
    assert.ok(
      tokensCss.includes("html[data-ios-safari='true']"),
      'tokensAndShell.css should include iOS Safari blur/animation safeguards'
    );

    assert.match(stageHudCss, /\.site-hud-scroll\s*\{[^}]*touch-action:\s*pan-y/);
    assert.match(modalsCss, /\.site-modal-body\s*\{[^}]*touch-action:\s*pan-y/);
    assert.match(modalsCss, /\.site-analytics-scroll\s*\{[^}]*touch-action:\s*pan-y/);
  });

  it('keeps mobile form inputs >= 16px to prevent iOS Safari focus auto-zoom lock', () => {
    const modalsCss = readRepoFile('src/site/styles/modalsAndAnalytics.css');
    const loginCss = readRepoFile('src/components/auth/loginAtelier.css');

    assert.match(modalsCss, /\.site-newsletter-input\s*\{[^}]*font-size:\s*(?:1rem|16px)/);
    assert.match(loginCss, /\.atelier-input\s*\{[^}]*font-size:\s*(?:16px|1rem)/);
  });

  it('does not attach window capture-phase touchend/click DeviceOrientationEvent.requestPermission trap', () => {
    const hookSrc = readRepoFile('src/components/auth/useMarbleBackdropStage.ts');
    assert.ok(
      !hookSrc.includes("window.addEventListener('touchend', requestIosGyro"),
      'requestIosGyro must NOT attach a window-level touchend trap on iOS Safari'
    );
    assert.ok(
      !hookSrc.includes("addEventListener('click', requestIosGyro, true)"),
      'requestIosGyro must NOT intercept clicks in capture phase'
    );
    assert.ok(
      hookSrc.includes("stageEl.addEventListener('touchend', requestIosGyroOnStageTap"),
      'Gyro permission on open Hero canvas should be scoped strictly to stageEl'
    );
    assert.ok(
      hookSrc.includes('GYRO_IGNORE_SELECTOR'),
      'requestIosGyro must ignore clicks on buttons/HUD/modals'
    );
  });

  it('applies iOS Safari WebGL GPU memory, native HalfFloat FBO, direct 3D-stage cloth pass, Metal NaN guards, and Retina MSAA quality', () => {
    const scenesSrc = readRepoFile('src/components/auth/loginThreeScenes.ts');
    const hookSrc = readRepoFile('src/components/auth/useMarbleBackdropStage.ts');
    const pacerSrc = readRepoFile('src/utils/adaptiveFramePacer.ts');
    const tokensCss = readRepoFile('src/site/styles/tokensAndShell.css');
    const heroSrc = readRepoFile('src/site/SiteMarbleHero.tsx');
    const studioLayerSrc = readRepoFile('src/components/three/StudioThreeStageLayer.tsx');
    const relightSrc = readRepoFile('src/components/three/StudioCharacterRelightCanvas.tsx');

    assert.ok(scenesSrc.includes('isIosSafariRuntime'));
    assert.ok(
      scenesSrc.includes('antialias: true'),
      'Apple Silicon TBDR GPU runs tile-memory MSAA cleanly and needs antialias: true for crisp 3D edges'
    );
    assert.ok(
      scenesSrc.includes('const maxDpr = isSoftwareGl ? 1.0 : isIosSafari ? 2.0 : 1.75;'),
      'iPhone Air OLED Retina should render at 2.0x DPR instead of blurry 1.25x'
    );
    assert.equal(
      /pow\(\s*\([^)]*-\s*[^)]*\)\s*\/[^,]+,\s*2\.0\s*\)/.test(scenesSrc),
      false,
      'GLSL shaders must never pass potentially negative bases into pow(x, 2.0) (NaN on Apple Silicon Metal)'
    );
    assert.ok(
      scenesSrc.includes('const safeRenderFrame = (dt: number) =>') &&
        scenesSrc.includes('getDiagnostics()'),
      'Render loop must isolate renderFrame exceptions and expose live diagnostics'
    );
    assert.ok(
      scenesSrc.includes('const useHalfFloat = !isSoftwareGl && supportsHalfFloatRenderTarget(renderer);'),
      'iOS Safari should use native Metal HalfFloat wave FBO instead of slow 12-loop analytic fallback'
    );
    assert.ok(
      scenesSrc.includes('uTrailBounds'),
      'SILK_CLOTH_FRAG must early-out pixels outside uTrailBounds'
    );
    assert.ok(
      scenesSrc.includes('const needsMarblePass = !isExternalMarbleHidden && marbleOpacity > 0.01;'),
      '3D stages should bypass backdropRT + blitScene when hero marble is hidden'
    );
    assert.match(
      tokensCss,
      /\.site-marble-stage\s*\{[^}]*pointer-events:\s*auto[^}]*touch-action:\s*none/
    );
    assert.match(
      tokensCss,
      /\.site-marble-stage\[data-active-stage='hero'\]\s*\{[^}]*cursor:\s*pointer/
    );
    assert.ok(
      tokensCss.includes("html[data-ios-safari='true'] .site-root :is(") &&
        tokensCss.includes('backdrop-filter: none;'),
      'iOS Safari should disable multi-layer CoreAnimation backdrop-filter stalls over live WebGL'
    );
    assert.ok(
      hookSrc.includes("stageEl.addEventListener('touchmove', onStageTouchMove, { passive: false })"),
      'Marble stage must prevent iOS rubber-band pointercancel during single-finger drags'
    );
    assert.ok(
      hookSrc.includes("stageEl.addEventListener('click', requestIosGyro, false)"),
      'Hero canvas must register direct stageEl click activation for iOS gyro permission'
    );
    assert.ok(
      pacerSrc.includes('if (tier === \'active60\' && state.detectedRefreshHz <= 60)'),
      'adaptiveFramePacer must never drop 60Hz ticks to 30fps on Safari 1ms-quantized timestamps'
    );
    assert.ok(
      pacerSrc.includes('if (!Number.isFinite(elapsed) || elapsed < 0)'),
      'shouldCommitFrame must recover cleanly from negative or non-finite rAF timestamp skew'
    );
    assert.ok(heroSrc.includes('setSoftwareGlGlassFallback(isSoftwareGl || isIosSafariRuntime())'));
    assert.ok(heroSrc.includes('deferBootUntilPaint: false'));
    assert.ok(heroSrc.includes('__AINVTRY_3D_DIAG__'));
    assert.ok(studioLayerSrc.includes('isIosSafariRuntime'));
    assert.ok(relightSrc.includes('isIosSafariRuntime'));
    assert.ok(
      relightSrc.includes('edgeBase > 0.0001 ? pow(edgeBase, 2.15) : 0.0'),
      'StudioCharacterRelightCanvas should guard zero-base pow() against Metal fast-math NaN'
    );
  });

  it('prevents WebKit preserve-3d lazy-image blackouts, WebGL buffer wipe, and double-character relight ghosting', () => {
    const garmentImgSrc = readRepoFile('src/components/StudioGarmentImage.jsx');
    const flatLaySrc = readRepoFile('src/components/EditorialFlatLayBoard.jsx');
    const viewerCss = readRepoFile('src/components/Studio2DFittingViewer.css');
    const relightSrc = readRepoFile('src/components/three/StudioCharacterRelightCanvas.tsx');
    const prioritySrc = readRepoFile('src/utils/resourcePriority.ts');

    assert.ok(
      garmentImgSrc.includes('loading="eager"'),
      'IntersectionObserver-gated StudioGarmentImage should use loading="eager" so WebKit loads inside preserve-3d'
    );
    assert.ok(garmentImgSrc.includes('[displaySrc, loadedSrc, isNearViewport]'));
    assert.ok(garmentImgSrc.includes('supportsCanvasWebpEncode'));
    assert.ok(
      relightSrc.includes('preserveDrawingBuffer: true'),
      'On-demand StudioCharacterRelightCanvas must preserve drawing buffer so WebKit never clears character to transparent'
    );
    assert.ok(
      relightSrc.includes('if (cssW === lastCssW && cssH === lastCssH) return;'),
      'syncSize must skip redundant renderer.setSize calls that wipe the WebGL drawing buffer'
    );
    const renderIdx = relightSrc.indexOf('renderer.render(scene, camera);');
    const readyTrueIdx = relightSrc.indexOf('onReadyChangeRef.current?.(true);');
    assert.ok(renderIdx > 0 && readyTrueIdx > renderIdx, 'WebGL ready signal must fire ONLY after renderer.render succeeds');
    assert.equal(
      relightSrc.indexOf('onReadyChangeRef.current?.(true);', readyTrueIdx + 1),
      -1,
      'onReadyChangeRef.current?.(true) must not be called prematurely inside img.onload before drawing'
    );
    assert.ok(
      relightSrc.includes('rafFallbackId = window.setTimeout'),
      'StudioCharacterRelightCanvas should include an iOS Safari rAF fallback timer'
    );
    assert.ok(
      prioritySrc.includes('fallbackTimer = window.setTimeout(runOnce, 120)'),
      'scheduleAfterFirstPaint must include a 120ms timer safety net for throttled WebKit iframes'
    );
    assert.ok(
      flatLaySrc.includes("incomingEl.style.opacity = isRelightCanvasActive ? '0' : '1'"),
      'EditorialFlatLayBoard must keep raw img hidden when WebGL relight canvas is active'
    );
    assert.match(
      viewerCss,
      /\.editorial-ai-vton-img\.is-relight-canvas-backed\s*\{[^}]*transition:\s*none\s*!important/
    );
  });

  it('wires embed visibility handshake and Apple Safari meta tags', () => {
    const embedSrc = readRepoFile('src/site/liveAppEmbed.tsx');
    const overlaySrc = readRepoFile('src/site/LiveAppStageOverlay.tsx');
    const siteHtml = readRepoFile('site/index.html');

    assert.ok(embedSrc.includes('ainvtry:embed-visibility'));
    assert.ok(embedSrc.includes('ainvtry-live-app-ready'));
    assert.ok(overlaySrc.includes('ainvtry-live-app-ready'));
    assert.ok(overlaySrc.includes('visible: nextVisible'));
    assert.ok(siteHtml.includes('apple-mobile-web-app-capable'));
    assert.ok(siteHtml.includes('apple-touch-icon'));
  });

  it('builds a pre-filtered mipmap-complete 64x64 PMREM CubeTexture bypassing Three.js 0.187 256-sample GGX PMREMGenerator stalls on iOS Metal', () => {
    const cubeEnv = createLightweightStudioCubeEnvMap();
    const flagged = cubeEnv as THREE.CubeTexture & { isPMREMTexture?: boolean };
    assert.equal(flagged.isPMREMTexture, true, 'Lightweight studio envMap must set isPMREMTexture=true so WebGLRenderer skips PMREMGenerator');
    assert.equal(cubeEnv.mapping, THREE.CubeReflectionMapping);
    assert.equal(cubeEnv.generateMipmaps, false);
    assert.equal(Array.isArray(cubeEnv.image) && cubeEnv.image.length, 6);
    const baseFace0 = (cubeEnv.image as unknown as Array<{ image?: { width?: number } }>)[0];
    assert.equal(baseFace0?.image?.width, 64);

    // Complete 6 custom mip levels (32, 16, 8, 4, 2, 1) below base 64x64 for WebGL2/Metal completeness
    assert.equal(cubeEnv.mipmaps.length, 6);
    const expectedMipSizes = [32, 16, 8, 4, 2, 1];
    for (let i = 0; i < expectedMipSizes.length; i += 1) {
      const mip = cubeEnv.mipmaps[i] as unknown as { width?: number; image?: unknown[] };
      assert.equal(mip.width, expectedMipSizes[i]);
      assert.equal(Array.isArray(mip.image) && mip.image.length, 6);
    }

    assert.doesNotThrow(() => disposeStudioEnvMap(cubeEnv));
  });

  it('drives marble & 3D stage drags natively via TouchEvent, keeps iOS gyro retryable, caps ProMotion at 60fps, and bounds iOS GPU/iframe memory', () => {
    const scenesSrc = readRepoFile('src/components/auth/loginThreeScenes.ts');
    const hookSrc = readRepoFile('src/components/auth/useMarbleBackdropStage.ts');
    const heroSrc = readRepoFile('src/site/SiteMarbleHero.tsx');
    const siteAppSrc = readRepoFile('src/site/AinvtrySiteApp.tsx');
    const stageMatSrc = readRepoFile('src/three/stages/stageMaterials.ts');
    const threeCapSrc = readRepoFile('src/components/three/threeRuntimeCapabilities.ts');

    // 1. iOS ProMotion 120Hz -> 60fps queue cap & Pass 1 wave FBO skip when marble hidden
    assert.ok(
      scenesSrc.includes('allowHighRefresh: !isSoftwareGl && !isIosSafari'),
      'iOS WebKit must cap ProMotion 120Hz to 60fps to prevent async Metal queue flooding'
    );
    assert.ok(
      scenesSrc.includes('if (!needsMarblePass)'),
      'Pass 1 wave FBO must be skipped whenever hero marble is hidden on 3D stages'
    );

    // 2. Native TouchEvent driving Hero marble & non-permanent gyro retry
    assert.ok(
      hookSrc.includes('activeTouchId') && hookSrc.includes('isSuppressedTouchPointer'),
      'Hero marble drag/flick/tap must run natively on TouchEvent with PointerEvent deduplication'
    );
    assert.ok(
      hookSrc.includes('gyroPermissionInFlight') && hookSrc.includes('gyroPermissionResolved'),
      'iOS gyro requestPermission must not permanently disable itself if a drag gesture fails'
    );
    assert.ok(
      hookSrc.includes('if (touchTotalMovedPx >= 14) return;'),
      'iOS gyro permission prompt must only fire on clean taps, not drags'
    );

    // 3. Native TouchEvent 3D stage orbiting + inactive stage disposal + no speculative GLB pre-warm on iOS
    assert.ok(
      heroSrc.includes("stageEl.addEventListener('touchstart', onTouchStart") &&
        heroSrc.includes("stageEl.addEventListener('touchmove', onTouchMove, { passive: false })"),
      '3D stages (Architecture/Specs/About) must support native TouchEvent drag & tap on iOS'
    );
    assert.ok(
      heroSrc.includes('rig.director.disposeInactiveStages('),
      'iOS WebKit must dispose inactive 3D stages to prevent WKWebView Jetsam crashes'
    );
    assert.ok(
      heroSrc.includes("if (activeStage !== 'specs' || isIosSafariRuntime()) return undefined;"),
      'iOS WebKit must skip speculative background studioStage GLB pre-instantiation'
    );

    // 4. PMREM bypass + lazy 1x sprites on iOS + hidden Studio iframe release on iOS
    assert.ok(
      stageMatSrc.includes('softwareGlGlassFallback || isIosSafariRuntime()'),
      'createStudioEnvMap must return lightweight pre-filtered PMREM cube envMap on iOS'
    );
    assert.ok(
      threeCapSrc.includes('createLightweightStudioCubeEnvMap'),
      'createStudioEnvironmentTexture must return PMREM-flagged cube texture so WebGLRenderer skips PMREMGenerator'
    );
    assert.ok(
      siteAppSrc.includes("(isIosWebKit ? activeStage === 'studio' : hasVisitedStudio)"),
      'iOS WebKit must unmount hidden Studio iframe when switching to 3D stages to avoid Jetsam reloads'
    );
  });

  it('supports per-site 3D motion override under iOS Reduce Motion and dual-sensor synchronous iOS gyroscope activation', () => {
    const hookSrc = readRepoFile('src/components/auth/useMarbleBackdropStage.ts');
    const heroSrc = readRepoFile('src/site/SiteMarbleHero.tsx');
    const siteAppSrc = readRepoFile('src/site/AinvtrySiteApp.tsx');
    const headersSrc = readRepoFile('site/public/_headers');

    assert.ok(
      hookSrc.includes('reducedMotionOverride') &&
        hookSrc.includes('systemReducedMotion && !reducedMotionOverrideRef.current'),
      'useMarbleBackdropStage must compute effective reducedMotion using reducedMotionOverride'
    );
    assert.ok(
      hookSrc.includes('devMotionCtor') &&
        hookSrc.includes("window.addEventListener('devicemotion', onDeviceMotionFallback"),
      'iOS gyroscope must support DeviceMotionEvent.requestPermission + accelerationIncludingGravity fallback'
    );
    assert.ok(
      hookSrc.includes('onGyroRequesterReady') &&
        hookSrc.includes('onGyroStatusChange'),
      'useMarbleBackdropStage must expose explicit synchronous gyro permission requester and status updates'
    );
    assert.ok(
      heroSrc.includes('reducedMotionOverride') &&
        heroSrc.includes('onGyroRequesterReady'),
      'SiteMarbleHero must forward reducedMotionOverride and gyro callbacks'
    );
    assert.ok(
      siteAppSrc.includes('site-enable-3d-motion-btn') &&
        siteAppSrc.includes('site-enable-gyro-btn') &&
        siteAppSrc.includes('handleEnableSite3dMotion'),
      'AinvtrySiteApp must provide 1-tap 3D Motion Override badge (under Reduce Motion) and explicit iOS Tilt Gyro trigger'
    );
    assert.ok(
      headersSrc.includes('accelerometer=(self)') && headersSrc.includes('gyroscope=(self)'),
      'site/public/_headers must explicitly permit accelerometer and gyroscope sensors'
    );
  });
});

