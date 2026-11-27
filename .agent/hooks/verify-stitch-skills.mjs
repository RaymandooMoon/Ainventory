#!/usr/bin/env node
/**
 * Ainventory Stitch Skills Integrity & Helper Test Verifier
 *
 * Verifies the internalized google-labs-code/stitch-skills suite:
 * 1. Manifest integrity (.agent/reference/stitch-skills.manifest.json) & Apache-2.0 license presence
 * 2. All 16 internalized SKILL.md files exist with kebab-case `name` matching directory name
 * 3. No unresolved `<SKILL_DIR>` or `stitch-skills/plugins/` placeholders remain in SKILL.md
 * 4. All relative markdown links in internalized SKILL.md files resolve to existing paths
 * 5. Upstream zero-dep helper script regression tests (`*.test.mjs`) pass via `node --test`
 * 6. `upload_to_stitch.py` compiles cleanly with Python 3 and supports STITCH_API_KEY env fallback
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, '.agent', 'reference', 'stitch-skills.manifest.json');
const LICENSE_PATH = path.join(ROOT, '.agent', 'LICENSE-STITCH-SKILLS.md');
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`[Stitch Skills] Missing manifest: ${MANIFEST_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(LICENSE_PATH)) {
  errors.push(`Missing Apache-2.0 license file: ${LICENSE_PATH}`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const allSkills = Object.values(manifest.plugins || {}).flat();

if (allSkills.length === 0) {
  errors.push('Manifest lists zero Stitch skills.');
}

const helperTestFiles = [];

for (const skill of allSkills) {
  const skillDir = path.join(ROOT, skill.localPath);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    errors.push(`Missing SKILL.md for ${skill.name}: ${skill.localPath}/SKILL.md`);
    continue;
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    errors.push(`Missing YAML frontmatter in ${skill.localPath}/SKILL.md`);
  } else {
    const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
    const parsedName = nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';
    if (parsedName !== skill.name) {
      errors.push(
        `Frontmatter name mismatch in ${skill.localPath}/SKILL.md: expected "${skill.name}", got "${parsedName}"`,
      );
    }
    if (!KEBAB_RE.test(parsedName)) {
      errors.push(`Non-kebab-case skill name "${parsedName}" in ${skill.localPath}/SKILL.md`);
    }
  }

  if (content.includes('<SKILL_DIR>')) {
    errors.push(`Unresolved <SKILL_DIR> placeholder in ${skill.localPath}/SKILL.md`);
  }
  if (content.includes('stitch-skills/plugins/')) {
    errors.push(`Unresolved upstream path stitch-skills/plugins/ in ${skill.localPath}/SKILL.md`);
  }

  // Verify local relative markdown links (excluding external http/https/mailto/# links)
  const linkRe = /\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkRe)) {
    const rawTarget = match[1].trim();
    if (
      !rawTarget ||
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('#')
    ) {
      continue;
    }
    const cleanTarget = rawTarget.split('#')[0];
    if (!cleanTarget) continue;
    const resolved = path.resolve(skillDir, cleanTarget);
    if (!fs.existsSync(resolved)) {
      errors.push(`Broken relative link "${rawTarget}" in ${skill.localPath}/SKILL.md`);
    }
  }

  // Collect zero-dependency *.test.mjs tests inside this skill
  const testsDir = path.join(skillDir, 'tests');
  if (fs.existsSync(testsDir)) {
    for (const entry of fs.readdirSync(testsDir)) {
      if (entry.endsWith('.test.mjs')) {
        helperTestFiles.push(path.join(testsDir, entry));
      }
    }
  }
}

if (errors.length > 0) {
  console.error('[Stitch Skills] Integrity checks FAILED:');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log(`[Stitch Skills] Integrity checks passed (${allSkills.length} skills verified).`);

if (helperTestFiles.length > 0) {
  const testRes = spawnSync(process.execPath, ['--test', ...helperTestFiles], {
    stdio: 'inherit',
  });
  if (testRes.status !== 0) {
    process.exit(testRes.status ?? 1);
  }
}

// Verify upload_to_stitch.py syntax & env-var error handling without creating __pycache__
const uploadScript = path.join(ROOT, '.agent', 'skills', 'upload-to-stitch', 'scripts', 'upload_to_stitch.py');
const pyCheck = spawnSync(
  'python3',
  ['-B', '-c', 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text("utf-8"))', uploadScript],
  { encoding: 'utf8' },
);
if (pyCheck.error && pyCheck.error.code === 'ENOENT') {
  console.log('[Stitch Skills] python3 not found; skipping upload_to_stitch.py check.');
} else if (pyCheck.status !== 0) {
  console.error('[Stitch Skills] upload_to_stitch.py syntax check FAILED:\n' + (pyCheck.stderr || ''));
  process.exit(1);
} else {
  const helpCheck = spawnSync('python3', ['-B', uploadScript, '--help'], { encoding: 'utf8' });
  if (helpCheck.status !== 0 || !helpCheck.stdout.includes('STITCH_API_KEY')) {
    console.error('[Stitch Skills] upload_to_stitch.py --help missing STITCH_API_KEY support.');
    process.exit(1);
  }
  console.log('[Stitch Skills] upload_to_stitch.py verified.');
}
