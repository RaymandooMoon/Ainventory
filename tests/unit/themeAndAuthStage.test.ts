import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resolveInitialAuthStage } from '../../src/utils/authStage.ts';
import { getThemePreference, resolveEffectiveTheme } from '../../src/utils/nativeBridge.ts';
import {
  computeCircleRevealRadius,
  resolveCircleOrigin,
} from '../../src/utils/themeTransition.ts';

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  });
});

describe('Default system theme preference, circular ripple origin & Boro intro auth stage', () => {
  it('defaults theme preference to system when localStorage has no stored theme', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
      configurable: true,
    });

    assert.equal(getThemePreference(), 'system');

    store.set('ainventory_theme_pref', 'invalid-value');
    assert.equal(getThemePreference(), 'system');

    store.set('ainventory_theme_pref', 'dark');
    assert.equal(getThemePreference(), 'dark');
  });

  it('resolves system theme from prefers-color-scheme media query', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        matchMedia: (query: string) => ({
          matches: query.includes('dark'),
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      },
      configurable: true,
    });
    assert.equal(resolveEffectiveTheme('system'), 'dark');

    Object.defineProperty(globalThis, 'window', {
      value: {
        matchMedia: () => ({
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      },
      configurable: true,
    });
    assert.equal(resolveEffectiveTheme('system'), 'light');
  });

  it('opens LoginView in intro stage by default and respects stage=auth or autostart=1', () => {
    assert.equal(resolveInitialAuthStage(''), 'intro');
    assert.equal(resolveInitialAuthStage('?auth=1'), 'intro');
    assert.equal(resolveInitialAuthStage('?stage=auth'), 'auth');
    assert.equal(resolveInitialAuthStage('?autostart=1'), 'auth');
    assert.equal(resolveInitialAuthStage('?verify_token=abc123'), 'auth');
  });

  it('computes circular theme ripple origin from button rect and farthest-corner radius', () => {
    const fromRect = resolveCircleOrigin({
      rect: { left: 1200, top: 14, width: 88, height: 48 },
      clientX: 1210,
      clientY: 20,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    assert.deepEqual(fromRect, { x: 1244, y: 38 });

    const fromPointer = resolveCircleOrigin({
      rect: null,
      clientX: 300,
      clientY: 500,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    assert.deepEqual(fromPointer, { x: 300, y: 500 });

    const fallbackOrigin = resolveCircleOrigin({
      rect: null,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    assert.deepEqual(fallbackOrigin, { x: 326, y: 38 });

    const radius = computeCircleRevealRadius(1244, 38, 1440, 900);
    assert.equal(radius, Math.ceil(Math.hypot(1244, 862)));
    assert.ok(radius >= 1510);
  });
});

