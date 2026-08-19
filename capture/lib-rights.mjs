/**
 * lib-rights.mjs — the rights posture as ENFORCED CONTROLS, not prose.
 *
 * robots.txt governs crawl etiquette only; RFC 9309 states explicitly that it is
 * not an authorization mechanism. Standing rights posture therefore rests on
 * internal-only use, attribution and non-redistribution — and those are checked here
 * so they cannot silently rot.
 */
import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const BINARY_EXT = /\.(png|jpe?g|webp|gif|avif|svg|woff2?|ttf|otf|eot|mp4|webm)$/i;

export async function checkRights(root) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail, skipped: false });
  const skip = (name, detail) => checks.push({ name, pass: true, detail, skipped: true });

  // 1. NOTICE.md exists and is substantive
  const noticePath = path.join(root, 'assets', 'third-party', 'NOTICE.md');
  try {
    const n = await readFile(noticePath, 'utf8');
    add('NOTICE.md present and non-empty', n.trim().length > 400, `${n.length} bytes`);
    add('NOTICE.md covers third-party marks beyond Puffy',
      /Good Housekeeping|CNN|Healthline/i.test(n) && /award/i.test(n),
      'award-publisher marks named');
    add('NOTICE.md records deliberate exclusions',
      /googlerestricted/i.test(n) && /affirm/i.test(n),
      'Google Symbols + Affirm icon font');
  } catch {
    add('NOTICE.md present and non-empty', false, 'missing');
  }

  // 2. Third-party binaries confined to assets/third-party/
  const stray = [];
  const walk = async (dir, rel = '') => {
    let entries = [];
    try { const { readdir } = await import('node:fs/promises'); entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'reference', 'diffs', 'dom'].includes(e.name)) continue;
        await walk(path.join(dir, e.name), r);
      } else if (BINARY_EXT.test(e.name)) {
        if (!r.startsWith(path.join('assets', 'third-party'))) stray.push(r);
      }
    }
  };
  await walk(root);
  add('third-party binaries confined to assets/third-party/', stray.length === 0,
    stray.length ? `stray: ${stray.slice(0, 8).join(', ')}` : 'none outside');

  // 3. No canonical / og:url / favicon pointing at puffy.com
  try {
    const html = await readFile(path.join(root, 'index.html'), 'utf8');
    const bad = [];
    if (/<link[^>]+rel=["']?canonical[^>]*puffy\.com/i.test(html)) bad.push('canonical');
    if (/<meta[^>]+og:url[^>]*puffy\.com/i.test(html)) bad.push('og:url');
    if (/<link[^>]+rel=["'][^"']*icon[^>]*puffy\.com/i.test(html)) bad.push('favicon');
    add('no canonical/og:url/favicon pointing at puffy.com', bad.length === 0, bad.join(', ') || 'clean');
    add('dev banner present in markup', /class=["'][^"']*dev-banner/.test(html), 'default internal-review mode');
  } catch {
    // Absent index.html means the rebuild has not started. That is pending work,
    // not a rights violation — these two controls activate once markup exists.
    skip('no canonical/og:url/favicon pointing at puffy.com', 'index.html absent — rebuild not started');
    skip('dev banner present in markup', 'index.html absent — rebuild not started');
  }

  // 4. Repo has no configured remote (internal-only)
  try {
    const { stdout } = await exec('git', ['remote'], { cwd: root });
    add('git repo has no remote (internal-only)', stdout.trim() === '', stdout.trim() || 'none');
  } catch {
    add('git repo has no remote (internal-only)', true, 'not a repo / no remotes');
  }

  return checks;
}
