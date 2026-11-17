#!/usr/bin/env node
/**
 * Ainventory console.log Audit Script
 * Ported from everything-claude-code (scripts/hooks/check-console-log.js)
 *
 * Scans modified JS/TS/JSX/TSX files in git working tree (excluding tests, scripts, tools, configs)
 * and warns if debug console.log statements remain before commit.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /^public\//,
  /^scripts\//,
  /^tools\//,
  /^tests\//,
  /^\.agent\//,
  /^\.agents\//,
  /__tests__\//,
  /__mocks__\//,
];

const args = new Set(process.argv.slice(2));
const scanAll = args.has('--all') || Boolean(process.env.CI);
const strictMode = args.has('--strict');

function getTargetCodeFiles() {
  if (scanAll) {
    const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
    const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    });
    const allSet = new Set([
      ...(tracked.status === 0 ? tracked.stdout.split('\n') : []),
      ...(untracked.status === 0 ? untracked.stdout.split('\n') : []),
    ]);
    return [...allSet]
      .map((f) => f.trim())
      .filter((f) => f && /\.(ts|tsx|js|jsx)$/.test(f))
      .filter((f) => !EXCLUDED_PATTERNS.some((re) => re.test(f)))
      .filter((f) => fs.existsSync(path.resolve(f)));
  }

  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  const unstaged = spawnSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  });
  const combined = new Set([
    ...(staged.status === 0 ? staged.stdout.split('\n') : []),
    ...(unstaged.status === 0 ? unstaged.stdout.split('\n') : []),
    ...(untracked.status === 0 ? untracked.stdout.split('\n') : []),
  ]);

  return [...combined]
    .map((f) => f.trim())
    .filter((f) => f && /\.(ts|tsx|js|jsx)$/.test(f))
    .filter((f) => !EXCLUDED_PATTERNS.some((re) => re.test(f)))
    .filter((f) => fs.existsSync(path.resolve(f)));
}

const files = getTargetCodeFiles();
let count = 0;

for (const file of files) {
  const content = fs.readFileSync(path.resolve(file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (
      line.includes('console.log') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('*')
    ) {
      console.warn(`[Console Audit] WARNING: console.log in ${file}:${idx + 1}`);
      count++;
    }
  });
}

if (count > 0) {
  console.warn(
    `[Console Audit] ${count} console.log statement(s) found across ${files.length} file(s). Remove debug logs before committing.`
  );
  if (strictMode) {
    process.exitCode = 1;
  }
} else {
  console.log(
    `[Console Audit] Clean (${files.length} ${scanAll ? 'tracked' : 'modified'} code file(s) checked).`
  );
}
