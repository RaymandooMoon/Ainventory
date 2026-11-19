import { GoogleGenAI } from '@google/genai';

export const GEMINI_TELEMETRY_USER_AGENT = 'aistudio-build';

let cachedClient = null;
let cachedApiKey = '';

function readTrimmedEnv(name) {
  const val = process.env[name];
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Resolves the server-side Gemini API key strictly from server environment variables.
 */
export function getServerGeminiApiKey() {
  return (
    readTrimmedEnv('GEMINI_API_KEY') ||
    readTrimmedEnv('GOOGLE_API_KEY') ||
    readTrimmedEnv('GOOGLE_GENAI_API_KEY') ||
    ''
  );
}

/**
 * Returns a shared server-side GoogleGenAI SDK client configured with telemetry headers.
 */
export function getServerGeminiClient(explicitApiKey = '') {
  const apiKey = String(explicitApiKey || '').trim() || getServerGeminiApiKey();
  if (!apiKey) return null;
  if (cachedClient && cachedApiKey === apiKey) {
    return cachedClient;
  }
  cachedApiKey = apiKey;
  cachedClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': GEMINI_TELEMETRY_USER_AGENT,
      },
    },
  });
  return cachedClient;
}
