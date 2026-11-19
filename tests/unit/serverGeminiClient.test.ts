import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  GEMINI_TELEMETRY_USER_AGENT,
  getServerGeminiApiKey,
  getServerGeminiClient,
} from '../../server/geminiClient.js';

const ROOT = process.cwd();

describe('Server-Side Gemini API Architecture', () => {
  it('initializes shared GoogleGenAI client with server env key and aistudio-build telemetry header', () => {
    const prevKey = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = 'test-server-only-gemini-key-0001';
      assert.equal(getServerGeminiApiKey(), 'test-server-only-gemini-key-0001');
      assert.equal(GEMINI_TELEMETRY_USER_AGENT, 'aistudio-build');
      const client = getServerGeminiClient();
      assert.ok(client, 'Expected GoogleGenAI client instance');
      assert.equal(typeof client.models?.generateContent, 'function');
    } finally {
      if (prevKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = prevKey;
      }
    }
  });

  it('declares MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API in metadata.json', () => {
    const metaRaw = fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8');
    const meta = JSON.parse(metaRaw) as {
      name?: string;
      description?: string;
      majorCapabilities?: string[];
    };
    assert.equal(meta.name, 'A inventory');
    assert.ok(Array.isArray(meta.majorCapabilities));
    assert.ok(meta.majorCapabilities.includes('MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API'));
  });

  it('contains zero direct browser calls to generativelanguage.googleapis.com or @google/genai imports in src/', () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...walk(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          out.push(full);
        }
      }
      return out;
    };

    const srcFiles = walk(path.join(ROOT, 'src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      assert.doesNotMatch(
        content,
        /generativelanguage\.googleapis\.com/,
        `${rel} must not call generativelanguage.googleapis.com from the browser`
      );
      assert.doesNotMatch(
        content,
        /from\s+['"]@google\/genai['"]/,
        `${rel} must not import @google/genai in browser code`
      );
      assert.doesNotMatch(
        content,
        /VITE_GEMINI_API_KEY|X-Gemini-Api-Key|openSelectKey|hasSelectedApiKey/,
        `${rel} must not read client Gemini keys or legacy key selectors`
      );
    }
  });
});
