#!/usr/bin/env node
/**
 * Ainventory Conventional Commit Message Validator
 * Ported from everything-claude-code (pre-bash-commit-quality.js validateCommitMessage)
 */

import fs from 'node:fs';

const msgFile = process.argv[2];
if (!msgFile || !fs.existsSync(msgFile)) {
  process.exit(0);
}

const raw = fs.readFileSync(msgFile, 'utf8');
const lines = raw
  .split(/\r?\n/)
  .filter((line) => !line.startsWith('#'))
  .map((line) => line.trimEnd());

const subject = (lines[0] || '').trim();

if (!subject) {
  console.error('[Commit-Msg] Empty commit message.');
  process.exit(1);
}

// Allow Git-generated merge/revert/fixup messages
if (/^(Merge\b|Revert\b|fixup!|squash!)/.test(subject)) {
  process.exit(0);
}

const conventionalPattern =
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-zA-Z0-9_./-]+\))?!?:\s+.+/;

if (!conventionalPattern.test(subject)) {
  console.error(`[Commit-Msg] Invalid commit format: "${subject}"`);
  console.error(
    'Expected Conventional Commits format: <type>(<optional-scope>): <description>\n' +
      'Allowed types: feat, fix, docs, style, refactor, test, chore, build, ci, perf, revert',
  );
  process.exit(1);
}

if (subject.length > 72) {
  console.warn(
    `[Commit-Msg] Warning: First line is ${subject.length} chars (recommended <= 72 chars).`,
  );
}

if (subject.endsWith('.')) {
  console.warn('[Commit-Msg] Warning: Subject line should not end with a trailing period.');
}

process.exit(0);
