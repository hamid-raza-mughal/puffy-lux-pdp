/**
 * verify.mjs — THE ACCEPTANCE GATE.
 *
 * Screenshots the rebuild with the SAME profile.mjs used for the reference capture,
 * then evaluates every gated signal. A percentage alone is not the gate.
 *
 * Only sections listed in built.json are gated. Others are reported as pending, so the
 * section-by-section workflow can run this after every section without false failures.
 *
 * Exits non-zero if any GATED signal fails.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import path from 'node:path';
import * as P from './profile.mjs';
import { serve } from './lib-server.mjs';
import { checkRights } from './lib-rights.mjs';
import { loadPng, diffPng, composite } from './lib-diff.mjs';

const ROOT = path.resolve('..');
const REF = path.join(ROOT, 'capture', 'reference');
const DIFFS = path.join(ROOT, 'capture', 'diffs');

const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const ONLY_DPR = Number((args.find((a) => a.startsWith('--dpr=')) || '').split('=')[1]) || null;
const ONLY_UNIT = (args.find((a) => a.startsWith('--unit=')) || '').split('=')[1] || null;
const VERBOSE = args.includes('--verbose');

const readJson = async (p, fallback = null) => {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
};

const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

(async () => {
  const cfg = await readJson(path.join(ROOT, 'capture', 'diff-config.json'));
  const masksDoc = await readJson(path.join(ROOT, 'capture', 'masks.json'), { masks: [] });
  const builtDoc = await readJson(path.join(ROOT, 'capture', 'built.json'), { built: [] });
  const sectionsDoc = await readJson(path.join(ROOT, 'capture', 'sections.json'));
  const refManifest = await readJson(path.join(ROOT, 'capture', 'network', 'manifest.json'));
  const built = new Set(builtDoc.built || []);

  if (!sectionsDoc) { console.error('FAIL: capture/sections.json missing — run capture first.'); process.exit(2); }

  console.log('='.repeat(78));
  console.log('FIDELITY GATE');
  console.log('='.repeat(78));
  console.log(`profile hash     ${await P.profileHash()}`);
  console.log(`reference        ${refManifest?.capturedAt ?? '(none)'}  chromium ${refManifest?.chromium ?? '?'}`);
  console.log(`diff config      pixelmatch threshold=${cfg.pixelmatch.threshold} includeAA=${cfg.pixelmatch.includeAA} alpha=${cfg.pixelmatch.alpha}`);
  console.log(`tile             ${cfg.tile.size}px, max ${cfg.tile.maxTilePct}%`);
  console.log(`masks declared   ${masksDoc.masks.length}`);
  console.log(`sections gated   ${built.size}/${sectionsDoc.count}`);
  console.log(`viewports gated  ${P.VIEWPORTS.filter(P.isGated).map(P.label).join(', ')}`);
  console.log(`report-only      ${P.VIEWPORTS.filter((v) => !P.isGated(v)).map(P.label).join(', ') || '(none)'}`);

  const failures = [];
  const notes = [];

  // ---------- 1. rights controls ----------
  console.log('\n-- rights controls --');
  const rights = await checkRights(ROOT);
  for (const c of rights) {
    console.log(`  ${c.skipped ? 'SKIP' : c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
    if (!c.pass && !c.skipped) failures.push(`rights: ${c.name} — ${c.detail}`);
  }

  // ---------- 2. reference bundle integrity ----------
  console.log('\n-- reference integrity --');
  const manifestSha = path.join(REF, 'MANIFEST.sha256');
  const shaDoc = await readFile(manifestSha, 'utf8').catch(() => null);
  if (!shaDoc) {
    console.log('  SKIP  MANIFEST.sha256 absent (run gen-manifest.mjs) — references unverified');
    notes.push('reference manifest absent; portability claim unverified');
  } else {
    const { createHash } = await import('node:crypto');
    let bad = 0, checked = 0;
    for (const line of shaDoc.trim().split('\n')) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
      if (!m) continue;
      checked++;
      const buf = await readFile(path.join(REF, m[2])).catch(() => null);
      if (!buf || createHash('sha256').update(buf).digest('hex') !== m[1]) bad++;
    }
    console.log(`  ${bad === 0 ? 'PASS' : 'FAIL'}  ${checked} reference files hash-verified${bad ? `, ${bad} MISMATCH` : ''}`);
    if (bad) failures.push(`reference integrity: ${bad} file(s) do not match MANIFEST.sha256`);
  }

  // ---------- 3. rebuild present? ----------
  const indexPath = path.join(ROOT, 'index.html');
  if (!(await readFile(indexPath).catch(() => null))) {
    console.log('\n-- rebuild --');
    console.log('  PENDING  index.html does not exist yet; nothing to diff.');
    console.log('\n' + '='.repeat(78));
    console.log(`RESULT: ${failures.length ? 'FAIL' : 'PENDING'} (rebuild not started)`);
    for (const f of failures) console.log(`  ! ${f}`);
    console.log('='.repeat(78));
    process.exit(failures.length ? 1 : 0);
  }

  // ---------- 4. generated-file freshness ----------
  console.log('\n-- generated files --');
  const genPath = path.join(ROOT, 'capture', 'gen-html.mjs');
  if (await readFile(genPath).catch(() => null)) {
    const before = await readFile(indexPath, 'utf8');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('node', ['gen-html.mjs'], { cwd: path.join(ROOT, 'capture') }).catch(() => {});
    const after = await readFile(indexPath, 'utf8');
    const fresh = before === after;
    console.log(`  ${fresh ? 'PASS' : 'FAIL'}  index.html is up to date with data/*.json`);
    if (!fresh) failures.push('generated files stale: gen-html.mjs changed index.html — data/*.json and markup are out of sync');
  } else {
    console.log('  SKIP  gen-html.mjs not present yet');
  }

  // ---------- 5. render + diff ----------
  const { server, port } = await serve(ROOT);
  const base = `http://127.0.0.1:${port}/index.html?fidelity=1`;
  const browser = await chromium.launch();
  const rows = [];
  let consoleErrors = [], externalRequests = [];

  const viewports = P.VIEWPORTS.filter((vp) => !ONLY || P.label(vp) === ONLY);

  for (const vp of viewports) {
    for (const dpr of vp.dprs) {
      if (ONLY_DPR && dpr !== ONLY_DPR) continue;
      const tag = `${P.label(vp)} dpr-${dpr}`;
      // Report-only viewports render and diff exactly as gated ones do; the only
      // difference is that nothing they produce is pushed to `failures`. Every
      // console line below stays unconditional so the numbers are still visible.
      const gates = P.isGated(vp);
      process.stdout.write(`\n-- ${tag}${gates ? '' : '  [report-only]'} --\n`);

      const ctx = await browser.newContext(P.contextOptions(vp, dpr));
      for (const sc of P.initScripts()) await ctx.addInitScript({ content: sc });
      const page = await ctx.newPage();
      await page.clock.setFixedTime(new Date(P.FAKE_CLOCK_ISO));

      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); });
      page.on('request', (r) => {
        const u = r.url();
        if (!u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith('data:') && !u.startsWith('blob:')) {
          externalRequests.push(`${tag}: ${u.slice(0, 160)}`);
        }
      });

      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await P.assertReady(page, { requireTestIds: false });
      const settle = await P.scrollAndSettle(page);
      await P.clearOverlays(page); // symmetry with capture: never shoot through an overlay
      await P.freeze(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);

      let sections = sectionsDoc.sections;
      if (vp.heightSensitive) sections = sections.filter((u) => P.HEIGHT_SENSITIVE_SLUGS.includes(u.slug));
      if (ONLY_UNIT) sections = sections.filter((u) => u.slug === ONLY_UNIT);

      // page height parity
      const refGeo = await readJson(path.join(ROOT, 'capture', 'dom', P.label(vp), 'geometry.json'));
      const gotHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (refGeo && !ONLY_UNIT) {
        const d = gotHeight - refGeo.page.scrollHeight;
        const pass = Math.abs(d) <= cfg.gate.heightDeltaPx;
        console.log(`  height  ref ${refGeo.page.scrollHeight}px  rebuild ${gotHeight}px  delta ${d >= 0 ? '+' : ''}${d}px  ${pass ? 'PASS' : 'FAIL'}`);
        if (!pass && built.size && gates) failures.push(`${tag}: page height delta ${d}px (gate ${cfg.gate.heightDeltaPx}px)`);
      }

      const outDir = path.join(DIFFS, P.label(vp), `dpr-${dpr}`);
      await mkdir(outDir, { recursive: true });
      const refDir = path.join(REF, P.label(vp), `dpr-${dpr}`);

      // full page (DPR1 only)
      if (dpr === P.FULLPAGE_DPR && !ONLY_UNIT) {
        const gotBuf = await page.screenshot({ fullPage: true });
        const refFile = path.join(refDir, 'full.png');
        const refPng = await loadPng(refFile).catch(() => null);
        if (refPng) {
          const got = PNG.sync.read(gotBuf);
          const r = diffPng(refPng, got, cfg, []);
          const pass = !r.dimensionMismatch && r.pct <= cfg.gate.fullPagePct;
          rows.push({ tag, unit: 'FULL PAGE', gated: built.size > 0 && gates, reportOnly: !gates, pass, ...r });
          console.log(`  full    ${r.dimensionMismatch ? `DIMENSION MISMATCH ref ${r.ref} vs ${r.got}` : `${r.pct.toFixed(3)}%  worstTile ${r.worstTilePct.toFixed(1)}%`}  ${pass ? 'PASS' : 'FAIL'}`);
          if (r.out) await writeFile(path.join(outDir, 'full.diff.png'), PNG.sync.write(r.out));
          if (!pass && built.size && gates) failures.push(`${tag} FULL PAGE: ${r.dimensionMismatch ? 'dimension mismatch' : r.pct.toFixed(3) + '%'}`);
        }
      }

      // per-section
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        const n = String(sectionsDoc.sections.indexOf(s) + 1).padStart(2, '0');
        const refFile = path.join(refDir, `section-${n}-${s.slug}.png`);
        const refPng = await loadPng(refFile).catch(() => null);
        const isBuilt = built.has(s.slug);
        if (!refPng) {
          if (VERBOSE) console.log(`  ${s.slug.padEnd(36)} (no single-file reference — sliced or absent)`);
          continue;
        }
        const loc = page.locator(s.selector).first();
        if ((await loc.count()) === 0) {
          rows.push({ tag, unit: s.slug, gated: isBuilt && gates, reportOnly: !gates, pass: !isBuilt, missing: true });
          console.log(`  ${s.slug.padEnd(36)} ${isBuilt ? (gates ? 'FAIL  selector not found in rebuild' : 'report  selector not found in rebuild') : 'pending'}`);
          if (isBuilt && gates) failures.push(`${tag} ${s.slug}: selector ${s.selector} not found in rebuild`);
          continue;
        }
        const gotBuf = await loc.screenshot();
        const got = PNG.sync.read(gotBuf);
        const masks = (masksDoc.masks || []).filter((m) => m.unit === s.slug && (!m.viewport || m.viewport === P.label(vp)));
        const r = diffPng(refPng, got, cfg, masks);
        const pass = !r.dimensionMismatch && r.pct <= cfg.gate.sectionPct && r.worstTilePct <= cfg.tile.maxTilePct;
        rows.push({ tag, unit: s.slug, gated: isBuilt && gates, reportOnly: !gates, pass, masks: masks.length, ...r });
        const label = r.dimensionMismatch
          ? `DIM ref ${r.ref} vs ${r.got}`
          : `${r.pct.toFixed(3)}%  worstTile ${r.worstTilePct.toFixed(1)}%`;
        console.log(`  ${s.slug.padEnd(36)} ${label.padEnd(34)} ${isBuilt ? (gates ? (pass ? 'PASS' : 'FAIL') : (pass ? 'report ok' : 'report GAP')) : 'pending'}`);
        if (r.out) {
          await writeFile(path.join(outDir, `section-${n}-${s.slug}.diff.png`), PNG.sync.write(r.out));
          const comp = composite(refPng, got, r.out);
          await writeFile(path.join(outDir, `section-${n}-${s.slug}.sbs.png`), PNG.sync.write(comp));
        }
        if (isBuilt && !pass && gates) failures.push(`${tag} ${s.slug}: ${label}`);

        // text equality for built sections
        if (isBuilt && refGeo?.sections?.[s.slug]) {
          // Compare VISIBLE text. textContent would penalise not reproducing
          // CSS-hidden nodes (e.g. the announcement bar's aria-hidden marquee
          // measurement copies), which are invisible and irrelevant to fidelity.
          const gotText = norm(await loc.evaluate((el) => el.innerText || ''));
          const refText = norm(refGeo.sections[s.slug].visibleText ?? refGeo.sections[s.slug].text);
          if (refText && gotText.slice(0, refText.length) !== refText) {
            if (gates) failures.push(`${tag} ${s.slug}: text content differs from reference`);
            console.log(`  ${''.padEnd(36)} ${gates ? 'FAIL' : 'report'}  text content differs`);
          }
        }
      }

      await ctx.close();
    }
  }

  await browser.close();
  server.close();

  // ---------- 6. runtime hygiene ----------
  console.log('\n-- runtime hygiene --');
  console.log(`  ${consoleErrors.length === 0 ? 'PASS' : 'FAIL'}  console errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 8).forEach((e) => console.log(`      ${e}`));
  if (consoleErrors.length > cfg.gate?.maxConsoleErrors ?? 0) failures.push(`${consoleErrors.length} console error(s)`);
  console.log(`  ${externalRequests.length === 0 ? 'PASS' : 'FAIL'}  external network requests: ${externalRequests.length}`);
  externalRequests.slice(0, 8).forEach((e) => console.log(`      ${e}`));
  if (externalRequests.length) failures.push(`${externalRequests.length} external network request(s) at runtime`);

  // ---------- 7. report ----------
  const table = (title, list, failMark) => {
    if (!list.length) return;
    list.sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0));
    console.log('\n-- ' + title + ' --');
    console.log('  ' + 'viewport'.padEnd(16) + 'unit'.padEnd(36) + 'diff%'.padStart(9) + 'worstTile%'.padStart(12) + '  masks');
    for (const r of list) {
      console.log('  ' + r.tag.padEnd(16) + r.unit.padEnd(36) +
        (r.pct ?? 0).toFixed(3).padStart(9) + (r.worstTilePct ?? 0).toFixed(1).padStart(12) +
        '  ' + (r.masks || 0) + (r.pass ? '' : failMark));
    }
  };

  const scored = rows.filter((r) => !r.missing && (r.gated || r.reportOnly));
  table('gated results, worst first', scored.filter((r) => r.gated), '   <-- FAIL');
  // Report-only rows are measured the same way but bind nothing. They are printed
  // in a separate table, never merged with gated ones, so a number here can never
  // be read as a passing gate.
  table('report-only results (NOT gated), worst first', scored.filter((r) => r.reportOnly), '   <-- gap (not gated)');

  await writeFile(path.join(DIFFS, 'report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    profileHash: await P.profileHash(),
    referenceCapturedAt: refManifest?.capturedAt ?? null,
    chromium: refManifest?.chromium ?? null,
    diffConfig: cfg, masksDeclared: masksDoc.masks,
    gatedSections: [...built],
    gatedViewports: P.VIEWPORTS.filter(P.isGated).map(P.label),
    reportOnlyViewports: P.VIEWPORTS.filter((v) => !P.isGated(v)).map(P.label),
    rights, notes, failures,
    rows: rows.map(({ out, ...r }) => r),
  }, null, 2));

  console.log('\n' + '='.repeat(78));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} gated signal(s) failed`);
    failures.slice(0, 25).forEach((f) => console.log(`  ! ${f}`));
  } else if (built.size === 0) {
    console.log('RESULT: PENDING — no sections declared built yet (see capture/built.json)');
  } else {
    console.log(`RESULT: PASS — all ${built.size} gated section(s) within threshold`);
  }
  notes.forEach((n) => console.log(`  note: ${n}`));
  console.log('='.repeat(78));
  process.exit(failures.length ? 1 : 0);
})();
