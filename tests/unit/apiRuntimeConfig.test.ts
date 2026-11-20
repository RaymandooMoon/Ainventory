import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveApiRuntimeConfig } from '../../src/utils/apiRuntimeConfig.ts';

const ROOT = process.cwd();

describe('API Runtime Config & Static Standalone External Backend Resolution', () => {
  it('defaults to relative /api and non-standalone mode when env is empty', () => {
    const cfg = resolveApiRuntimeConfig({});
    assert.equal(cfg.apiBaseUrl, '/api');
    assert.equal(cfg.hasExternalApiBase, false);
    assert.equal(cfg.isStaticStandaloneWithoutApi, false);
  });

  it('stays in static standalone mode when VITE_STATIC_STANDALONE=1 and no external URL is set', () => {
    for (const rawBase of [undefined, '', '   ', '/api', '/api/']) {
      const cfg = resolveApiRuntimeConfig({
        VITE_STATIC_STANDALONE: '1',
        VITE_API_BASE_URL: rawBase,
      });
      assert.equal(cfg.apiBaseUrl, '/api');
      assert.equal(cfg.hasExternalApiBase, false);
      assert.equal(cfg.isStaticStandaloneWithoutApi, true);
    }
  });

  it('enables remote server API when VITE_STATIC_STANDALONE=1 and an external https URL is configured', () => {
    const bareOrigin = resolveApiRuntimeConfig({
      VITE_STATIC_STANDALONE: '1',
      VITE_API_BASE_URL: 'https://ainventory-api.example.com/',
    });
    assert.equal(bareOrigin.apiBaseUrl, 'https://ainventory-api.example.com/api');
    assert.equal(bareOrigin.apiOrigin, 'https://ainventory-api.example.com');
    assert.equal(bareOrigin.hasExternalApiBase, true);
    assert.equal(bareOrigin.isStaticStandaloneWithoutApi, false);

    const explicitApiPath = resolveApiRuntimeConfig({
      VITE_STATIC_STANDALONE: '1',
      VITE_API_BASE_URL: 'https://ainventory-api.example.com/api/',
    });
    assert.equal(explicitApiPath.apiBaseUrl, 'https://ainventory-api.example.com/api');
    assert.equal(explicitApiPath.apiOrigin, 'https://ainventory-api.example.com');
    assert.equal(explicitApiPath.hasExternalApiBase, true);
    assert.equal(explicitApiPath.isStaticStandaloneWithoutApi, false);

    const nestedPrefix = resolveApiRuntimeConfig({
      VITE_STATIC_STANDALONE: '1',
      VITE_API_BASE_URL: 'https://ainventory-api.example.com/v2/api/',
    });
    assert.equal(nestedPrefix.apiBaseUrl, 'https://ainventory-api.example.com/v2/api');
    assert.equal(nestedPrefix.hasExternalApiBase, true);
    assert.equal(nestedPrefix.isStaticStandaloneWithoutApi, false);
  });

  it('rejects unsafe, credentialed, or malformed schemes and falls back safely to /api', () => {
    for (const unsafe of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://example.com/api',
      'https://user:pass@api.example.com/api',
    ]) {
      const cfg = resolveApiRuntimeConfig({
        VITE_STATIC_STANDALONE: '1',
        VITE_API_BASE_URL: unsafe,
      });
      assert.equal(cfg.apiBaseUrl, '/api');
      assert.equal(cfg.apiOrigin, null);
      assert.equal(cfg.hasExternalApiBase, false);
      assert.equal(cfg.isStaticStandaloneWithoutApi, true);
    }
  });

  it('preserves custom relative paths on non-standalone server deployments', () => {
    const cfg = resolveApiRuntimeConfig({
      VITE_API_BASE_URL: '/custom-api/',
    });
    assert.equal(cfg.apiBaseUrl, '/custom-api');
    assert.equal(cfg.hasExternalApiBase, false);
    assert.equal(cfg.isStaticStandaloneWithoutApi, false);
  });

  it('vton2DService.ts delegates standalone checks to isStaticStandaloneWithoutApi() instead of raw VITE_STATIC_STANDALONE === "1"', () => {
    const vtonSrc = fs.readFileSync(path.join(ROOT, 'src/services/vton2DService.ts'), 'utf8');
    assert.match(vtonSrc, /isStaticStandaloneWithoutApi/);
    assert.doesNotMatch(
      vtonSrc,
      /VITE_STATIC_STANDALONE/,
      'vton2DService.ts should use isStaticStandaloneWithoutApi() so VITE_API_BASE_URL is always respected'
    );
  });

  it('deploy-pages.yml wires VITE_API_BASE_URL and never embeds Gemini API keys in client builds', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github/workflows/deploy-pages.yml'),
      'utf8'
    );
    assert.match(workflow, /VITE_API_BASE_URL/);
    assert.doesNotMatch(
      workflow,
      /VITE_GEMINI_API_KEY|RAW_GEMINI_API_KEY|VITE_GEMINI_API_KEY_B64/,
      'deploy-pages.yml must never embed Gemini API keys into public static bundles'
    );
  });
});
