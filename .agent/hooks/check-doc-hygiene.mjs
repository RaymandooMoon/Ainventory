#!/usr/bin/env node
/**
 * Ainventory Documentation Hygiene Check
 * Ported from everything-claude-code (scripts/hooks/doc-file-warning.js)
 *
 * Warns when non-standard .md or .txt files are created at repository root
 * instead of standard project documentation locations.
 */

import fs from 'node:fs';

const ALLOWED_ROOT_DOCS = new Set([
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'LICENSE',
  'LICENSE.md',
  // Existing Ainventory root docs
  'TODO.md',
  'RENEWAL_PLAN.md',
  'conversation_log.md',
]);

const entries = fs.readdirSync(process.cwd(), { withFileTypes: true });
const unexpected = entries
  .filter((e) => e.isFile() && /\.(md|txt)$/i.test(e.name) && !ALLOWED_ROOT_DOCS.has(e.name))
  .map((e) => e.name);

if (unexpected.length > 0) {
  console.warn('[Doc Hygiene] Non-standard root documentation file(s) detected:');
  for (const name of unexpected) {
    console.warn(`  - ${name} (prefer docs/ or session artifacts unless explicitly requested)`);
  }
} else {
  console.log('[Doc Hygiene] Root documentation layout is clean.');
}
