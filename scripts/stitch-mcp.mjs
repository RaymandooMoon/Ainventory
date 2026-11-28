#!/usr/bin/env node
/**
 * Local CLI bridge for Google Stitch Streamable HTTP MCP (JSON-RPC 2.0).
 * Reads STITCH_API_KEY and STITCH_MCP_URL from process.env or gitignored .env.local.
 * Never logs or prints API credentials.
 */
import fs from 'node:fs';
import path from 'node:path';

function loadLocalEnv() {
  const envFile = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile)) return;
  const raw = fs.readFileSync(envFile, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !(k in process.env)) {
      process.env[k] = v;
    }
  }
}

loadLocalEnv();

const MCP_URL = process.env.STITCH_MCP_URL || 'https://stitch.googleapis.com/mcp';
const API_KEY = process.env.STITCH_API_KEY || '';

if (!API_KEY) {
  console.error('Missing STITCH_API_KEY in environment or .env.local');
  process.exit(1);
}

let sessionId = null;

async function mcpRpc(method, params = {}, id = 1) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-Goog-Api-Key': API_KEY,
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });

  const nextSession = res.headers.get('mcp-session-id');
  if (nextSession) sessionId = nextSession;

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 600)}`);
  }

  if (contentType.includes('text/event-stream')) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    const parsed = dataLines.map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return { raw: chunk };
      }
    });
    const match = parsed.find((msg) => msg && msg.id === id) || parsed[parsed.length - 1];
    return match;
  }

  return JSON.parse(text);
}

async function initializeSession() {
  const initRes = await mcpRpc(
    'initialize',
    {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'ainventory-local-stitch-cli', version: '1.0.0' },
    },
    1,
  );
  // Send notifications/initialized (best-effort)
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-Goog-Api-Key': API_KEY,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }),
  }).catch(() => {});
  return initRes;
}

async function main() {
  const [, , cmd, arg1, arg2] = process.argv;

  if (!cmd || cmd === 'help') {
    console.log('Usage:');
    console.log('  node scripts/stitch-mcp.mjs ping');
    console.log('  node scripts/stitch-mcp.mjs tools');
    console.log('  node scripts/stitch-mcp.mjs call <toolName> [jsonArgs]');
    process.exit(0);
  }

  const init = await initializeSession();

  if (cmd === 'ping') {
    console.log(
      JSON.stringify(
        {
          ok: !init?.error,
          serverInfo: init?.result?.serverInfo || null,
          protocolVersion: init?.result?.protocolVersion || null,
          hasSession: Boolean(sessionId),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'tools') {
    const res = await mcpRpc('tools/list', {}, 2);
    const tools = res?.result?.tools || [];
    console.log(
      JSON.stringify(
        {
          count: tools.length,
          tools: tools.map((t) => ({
            name: t.name,
            description: (t.description || '').slice(0, 140),
            required: t.inputSchema?.required || [],
            properties: Object.keys(t.inputSchema?.properties || {}),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'call') {
    if (!arg1) {
      console.error('Missing toolName');
      process.exit(1);
    }
    const parsedArgs = arg2 ? JSON.parse(arg2) : {};
    const res = await mcpRpc('tools/call', { name: arg1, arguments: parsedArgs }, 3);
    if (res?.error) {
      console.error(JSON.stringify(res.error, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify(res?.result ?? res, null, 2));
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Stitch MCP error:', err?.message || err);
  process.exit(1);
});
