/**
 * gen-manifest.mjs — make the reference evidence portable.
 *
 * Raw reference PNGs are too large to track in git, but a rebuild whose references
 * live only on one laptop cannot substantiate a "machine-proven" claim. So we commit
 * a sha256 manifest of every reference file plus a versioned bundle, and verify.mjs
 * refuses to trust references that do not match the manifest.
 *
 * Git LFS is the upgrade path once a remote exists; with no remote configured it would
 * add ceremony without portability.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const exec = promisify(execFile);

const ROOT = path.resolve('..');
const REF = path.join(ROOT, 'capture', 'reference');

async function walk(dir, rel = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), r)));
    else if (e.name.endsWith('.png')) out.push(r);
  }
  return out;
}

(async () => {
  const files = (await walk(REF)).sort();
  const lines = [];
  let bytes = 0;
  for (const f of files) {
    const buf = await readFile(path.join(REF, f));
    bytes += buf.length;
    lines.push(`${createHash('sha256').update(buf).digest('hex')}  ${f}`);
  }
  await writeFile(path.join(REF, 'MANIFEST.sha256'), lines.join('\n') + '\n');

  const manifest = await readFile(path.join(ROOT, 'capture', 'network', 'manifest.json'), 'utf8').catch(() => '{}');
  const capturedAt = (JSON.parse(manifest).capturedAt || new Date().toISOString()).slice(0, 10);
  const bundle = path.join(ROOT, 'capture', `reference-bundle-${capturedAt}.tar.gz`);

  // The bundle carries BOTH the reference PNGs and the large derived evidence
  // (computed.json / page.html), which are excluded from git to keep the repo
  // sane. Portability must not depend on what git happens to track.
  await exec('tar', ['-czf', bundle, '-C', path.join(ROOT, 'capture'), 'reference', 'dom']);
  const bBuf = await readFile(bundle);
  const bSha = createHash('sha256').update(bBuf).digest('hex');
  const bSize = (await stat(bundle)).size;

  await writeFile(path.join(REF, 'README.md'), `# Reference evidence

These PNGs are the **ground truth** the fidelity gate diffs against. They are the
output of \`capture/capture.mjs\` run against the live target and are treated as an
**immutable frozen baseline** (see plan decision 9): if the live page drifts, that is
reported, but this baseline does not move unless explicitly re-captured.

## Why this directory is not tracked file-by-file

${files.length} PNGs totalling ${(bytes / 1024 / 1024).toFixed(1)} MB. Tracking them individually
would bloat the repository. Portability instead comes from two tracked artifacts:

| Artifact | Purpose |
|---|---|
| \`MANIFEST.sha256\` | sha256 of every reference file. Tracked in git. |
| \`../reference-bundle-${capturedAt}.tar.gz\` | the PNGs **and** the large derived evidence (\`dom/**/computed.json\`, \`dom/**/page.html\`), which git excludes |

\`verify.mjs\` hash-verifies every reference against \`MANIFEST.sha256\` before diffing
and refuses to run against unverified references.

## Restoring from a clean checkout

\`\`\`bash
cd capture
tar -xzf reference-bundle-${capturedAt}.tar.gz   # restores reference/ and dom/
cd reference && shasum -a 256 -c MANIFEST.sha256
\`\`\`

## Bundle identity

\`\`\`
file    reference-bundle-${capturedAt}.tar.gz
size    ${bSize} bytes
sha256  ${bSha}
files   ${files.length} PNG
\`\`\`

If \`shasum -c\` fails, the references have been altered and any diff percentage
computed against them is meaningless. Re-capture rather than proceeding.
`);

  console.log(`reference files : ${files.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`MANIFEST.sha256 : written`);
  console.log(`bundle          : ${path.basename(bundle)}  ${(bSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`bundle sha256   : ${bSha}`);
})();
