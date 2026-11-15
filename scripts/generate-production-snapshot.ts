// Writes the deployment-only snapshot of one commit into a new folder (docs/deployment/production-branch.md).
// Everything is read from the git object database (the commit's tree and the commit's own manifest), never from
// the working directory: uncommitted changes, untracked files and local .env files cannot end up in the snapshot.
// Node built-ins only, so it runs without an install:
//   node scripts/generate-production-snapshot.ts --commit <sha> [--out <new folder>] [--allow-unmerged]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { METADATA_FILE, matcher, parseManifest, validateSnapshot } from './validate-production-snapshot.ts';

const SOURCE_BRANCH = 'main';
const MANIFEST = 'config/production-files.json';

const { values: args } = parseArgs({ options: { commit: { type: 'string' }, out: { type: 'string' }, 'allow-unmerged': { type: 'boolean' } } });
if (!args.commit) throw new Error('usage: node scripts/generate-production-snapshot.ts --commit <sha> [--out <new folder>] [--allow-unmerged]');

const repo = path.resolve(import.meta.dirname, '..');
const git = (argv: string[], opts: { env?: NodeJS.ProcessEnv; input?: string } = {}) =>
  execFileSync('git', argv, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

const commit = git(['rev-parse', '--verify', `${args.commit}^{commit}`]).trim();

// Only commits that are part of main are published. --allow-unmerged is for trying the script on a branch.
let merged = true;
try { git(['merge-base', '--is-ancestor', commit, `origin/${SOURCE_BRANCH}`]); } catch { merged = false; }
if (!merged && !args['allow-unmerged']) throw new Error(`${commit} is not on origin/${SOURCE_BRANCH}: refusing to snapshot an unmerged commit`);

const manifest = parseManifest(git(['show', `${commit}:${MANIFEST}`]));
const allowed = matcher(manifest);

// `<mode> <type> <sha>\t<path>` per tracked file. Symlinks (120000) and submodules (160000) could bring in content
// from outside the repository, so a snapshot that selects one is refused.
const files: string[] = [];
const excluded = new Map<string, number>(); // reported by folder, two levels deep
for (const entry of git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean)) {
  const [info, file] = entry.split('\t');
  if (!allowed(file)) {
    const parts = file.split('/');
    const key = parts.slice(0, Math.min(2, parts.length - 1)).join('/') || file;
    excluded.set(key, (excluded.get(key) ?? 0) + 1);
    continue;
  }
  const mode = info.split(' ')[0];
  if (mode !== '100644' && mode !== '100755') throw new Error(`${file} is a symbolic link or submodule (mode ${mode}): not allowed in the snapshot`);
  if (file.split('/').includes('..') || path.isAbsolute(file)) throw new Error(`${file} escapes the repository root`);
  files.push(file);
}
files.sort();

const out = path.resolve(args.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'greenscape-production-')));
fs.mkdirSync(out, { recursive: true });
if (fs.readdirSync(out).length) throw new Error(`${out} is not empty`);

// A throwaway index holds the commit's tree; checkout-index writes just the approved files (applying .gitattributes
// line endings). The repository's own index and working directory are not touched.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greenscape-index-'));
try {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, 'index') };
  git(['read-tree', commit], { env });
  git(['checkout-index', `--prefix=${out.replaceAll('\\', '/')}/`, '-z', '--stdin'], { env, input: files.join('\0') });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

// No timestamp: the same commit always produces the same tree. The publish commit and the workflow run carry the time.
const metadata = {
  notice: 'Generated from main by .github/workflows/production-pipeline.yml. Do not edit this branch by hand.',
  sourceBranch: merged ? SOURCE_BRANCH : null,
  sourceCommit: commit,
  generatedBy: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
  deploymentTarget: 'dokploy',
  fileCount: files.length,
};
fs.writeFileSync(path.join(out, METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`);

const problems = validateSnapshot(out, manifest);
if (problems.length) {
  console.error(`snapshot of ${commit} is NOT valid (${problems.length} problems):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

const byTop = new Map<string, number>();
for (const f of files) byTop.set(f.split('/')[0], (byTop.get(f.split('/')[0]) ?? 0) + 1);
console.log(`snapshot of ${commit}: ${files.length} files, valid`);
for (const [top, n] of byTop) console.log(`  ${String(n).padStart(4)}  ${top}`);
const excludedCount = [...excluded.values()].reduce((a, b) => a + b, 0);
console.log(`excluded: ${excludedCount} tracked files`);
for (const [key, n] of [...excluded].sort()) console.log(`  ${String(n).padStart(4)}  ${key}`);
console.log(out);
