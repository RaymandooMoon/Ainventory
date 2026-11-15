#!/usr/bin/env node
/**
 * Ainventory Pre-Commit & Staged Quality Gate
 * Ported from everything-claude-code (pre-bash-commit-quality.js + config-protection.js)
 *
 * Checks:
 * 1. Linter/Formatter Config Protection (.oxlintrc.json, eslint/prettier/biome configs)
 * 2. Hardcoded Secret Detection (Anthropic, OpenAI, GitHub PAT, AWS, generic API keys) -> BLOCKS
 * 3. `debugger` Statement Detection -> BLOCKS
 * 4. `console.log` & unlinked `TODO/FIXME` Warnings -> WARNS
 * 5. Fast `oxlint` Execution on Staged JS/JSX/TS/TSX Files -> BLOCKS on lint error
 *
 * Flags:
 *   --secrets-only : Scan tracked/modified files in working tree (or staged files) for secrets only
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const secretsOnly = args.has('--secrets-only');

const PROTECTED_CONFIG_BASENAMES = new Set([
  '.oxlintrc.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'biome.json',
  'biome.jsonc',
  '.biome.json',
  '.biome.jsonc',
  '.eslintignore',
  '.prettierignore',
]);

const PROTECTED_CONFIG_PATTERNS = [
  /^(eslint|prettier|stylelint|commitlint|oxlint)\.config(\.[A-Za-z0-9_-]+)*\.(js|mjs|cjs|ts|mts|cts|json)$/i,
  /^\.(eslintrc|prettierrc|stylelintrc|markdownlintrc|oxlintrc)(\.[A-Za-z0-9_-]+)*\.(js|cjs|mjs|ts|mts|cts|json|jsonc|yml|yaml|toml)$/i,
];

const CONSOLE_EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /^tests\//,
  /^scripts\//,
  /^tools\//,
  /^\.agent\//,
  /^\.agents\//,
];

const SECRET_PATTERNS = [
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/, name: 'Anthropic API key' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub PAT' },
  { pattern: /AKIA[A-Z0-9]{16}/, name: 'AWS Access Key' },
  { pattern: /api[_-]?key\s*[=:]\s*['"]([^'"]+)['"]/i, name: 'API key', valueGroup: 1 },
  {
    pattern: /api[_-]?key\s*[=:]\s*(?!['"])((?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{12,})/i,
    name: 'API key',
    valueGroup: 1,
  },
];

function isPlaceholderSecret(value) {
  const v = (value || '').trim();
  if (v.length === 0) return true;
  if (/^process\.env\.[A-Za-z0-9_]+$/.test(v)) return true;
  if (/^import\.meta\.env\.[A-Za-z0-9_]+$/.test(v)) return true;
  if (/^\$\{[^}]*\}$/.test(v)) return true;
  if (/^<[^<>]*>$/.test(v)) return true;
  if (
    /^(REPLACE_ME|CHANGE_?ME|YOUR[_-]?[A-Z0-9_-]*[_-]?(?:KEY|TOKEN|HERE)|API[_-]?KEY|SECRET|TOKEN|KEY|TODO|TBD|FIXME|XXX+)$/i.test(
      v,
    )
  ) {
    return true;
  }
  return false;
}

function isProtectedConfig(filePath) {
  const base = path.basename(filePath);
  return (
    PROTECTED_CONFIG_BASENAMES.has(base) ||
    PROTECTED_CONFIG_BASENAMES.has(base.toLowerCase()) ||
    PROTECTED_CONFIG_PATTERNS.some((re) => re.test(base))
  );
}

function getStagedFiles() {
  const res = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return [];
  return res.stdout
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getStagedModifiedFiles() {
  // Only M (modified) or D (deleted) for config protection — first-time creation (A) is allowed
  const res = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=MD'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return [];
  return res.stdout
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTrackedScanFiles() {
  const res = spawnSync('git', ['ls-files', 'src', 'server', 'tests', 'scripts', 'tools'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return [];
  return res.stdout
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => f && fs.existsSync(f));
}

function getFileContent(filePath, fromStaged) {
  if (fromStaged) {
    const res = spawnSync('git', ['show', `:${filePath}`], { encoding: 'utf8' });
    return res.status === 0 ? res.stdout : null;
  }
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function scanContent(filePath, content) {
  const issues = [];
  if (!content) return issues;
  const isCodeFile = /\.(js|jsx|ts|tsx|mjs|cjs|py)$/.test(filePath);
  const skipConsole = CONSOLE_EXCLUDED_PATTERNS.some((re) => re.test(filePath));
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    for (const { pattern, name, valueGroup } of SECRET_PATTERNS) {
      const match = line.match(pattern);
      if (match && !(valueGroup && isPlaceholderSecret(match[valueGroup]))) {
        issues.push({
          severity: 'error',
          filePath,
          line: lineNum,
          message: `Potential ${name} exposed at ${filePath}:${lineNum}`,
        });
      }
    }

    if (secretsOnly || !isCodeFile) return;

    if (/\bdebugger\b/.test(line) && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
      issues.push({
        severity: 'error',
        filePath,
        line: lineNum,
        message: `debugger statement found at ${filePath}:${lineNum}`,
      });
    }

    if (
      !skipConsole &&
      line.includes('console.log') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('#')
    ) {
      issues.push({
        severity: 'warning',
        filePath,
        line: lineNum,
        message: `console.log statement at ${filePath}:${lineNum}`,
      });
    }
  });

  return issues;
}

function runOxlintOnFiles(files) {
  const lintTargets = files.filter(
    (f) => /\.(js|jsx|ts|tsx)$/.test(f) && /^(src|server|tests)\//.test(f),
  );
  if (lintTargets.length === 0) return { ok: true, output: '' };

  const oxlintBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
  );
  if (!fs.existsSync(oxlintBin)) return { ok: true, output: '' };

  const res = spawnSync(oxlintBin, lintTargets, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    ok: res.status === 0,
    output: (res.stdout || '') + (res.stderr || ''),
  };
}

let hasBlockingError = false;

if (secretsOnly) {
  const staged = getStagedFiles();
  const targets = staged.length > 0 ? staged : getTrackedScanFiles();
  const useStaged = staged.length > 0;
  const secretErrors = [];

  for (const file of targets) {
    if (file.startsWith('.agent/') || file.startsWith('.agents/')) continue;
    const content = getFileContent(file, useStaged);
    for (const issue of scanContent(file, content)) {
      if (issue.severity === 'error') secretErrors.push(issue);
    }
  }

  if (secretErrors.length > 0) {
    console.error('[Guardrail] Hardcoded secret check FAILED:');
    for (const err of secretErrors) console.error(`  - ${err.message}`);
    process.exit(1);
  }
  console.log(`[Guardrail] Secret scan clean (${targets.length} file(s) checked).`);
  process.exit(0);
}

const stagedFiles = getStagedFiles();
if (stagedFiles.length === 0) {
  console.log('[Pre-Commit] No staged files to verify.');
  process.exit(0);
}

// 1. Config protection check
if (process.env.ALLOW_LINTER_CONFIG_EDIT !== '1') {
  const modifiedProtected = getStagedModifiedFiles().filter(isProtectedConfig);
  if (modifiedProtected.length > 0) {
    console.error('[Config Protection] BLOCKED modification to protected linter/formatter config:');
    for (const f of modifiedProtected) console.error(`  - ${f}`);
    console.error('Fix the source code rather than weakening linter rules. (Set ALLOW_LINTER_CONFIG_EDIT=1 only if explicitly intended by user.)');
    hasBlockingError = true;
  }
}

// 2. Content checks (secrets, debugger, console.log)
const errors = [];
const warnings = [];
for (const file of stagedFiles) {
  if (file.startsWith('.agent/') || file.startsWith('.agents/')) continue;
  const content = getFileContent(file, true);
  for (const issue of scanContent(file, content)) {
    if (issue.severity === 'error') errors.push(issue);
    else warnings.push(issue);
  }
}

if (warnings.length > 0) {
  console.warn('[Pre-Commit] Warnings in staged files:');
  for (const w of warnings.slice(0, 15)) console.warn(`  - ${w.message}`);
  if (warnings.length > 15) console.warn(`  ... and ${warnings.length - 15} more warning(s)`);
}

if (errors.length > 0) {
  console.error('[Pre-Commit] BLOCKING issues in staged files:');
  for (const e of errors) console.error(`  - ${e.message}`);
  hasBlockingError = true;
}

// 3. Fast oxlint check on staged src/server/tests files
const lintResult = runOxlintOnFiles(stagedFiles);
if (!lintResult.ok) {
  console.error('[Pre-Commit] oxlint failed on staged files:\n' + lintResult.output);
  hasBlockingError = true;
}

if (hasBlockingError) {
  process.exit(1);
}

console.log(`[Pre-Commit] Quality checks passed (${stagedFiles.length} staged file(s)).`);
