/**
 * capture.mjs — capture ground truth from the live target.
 *
 * Modes:
 *   node capture.mjs --probe      one viewport; validates readiness, records geo +
 *                                 A/B state, dumps the discovered section outline,
 *                                 captures overlay states. Cheap; run this first.
 *   node capture.mjs              full matrix (all viewports x DPRs).
 *   node capture.mjs --only=WxH   single viewport from the matrix.
 *
 * Politeness: one pass, sequential, no parallelism, settle pauses throughout.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as P from './profile.mjs';
import { discoverSections, DISMISS } from './discover.mjs';

const ROOT = path.resolve('..');
const REF = path.join(ROOT, 'capture', 'reference');
const DOM = path.join(ROOT, 'capture', 'dom');
const NET = path.join(ROOT, 'capture', 'network');
const ASSETS = path.join(ROOT, 'assets', 'third-party');

const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1];

const requests = [];
const savedAssets = new Map();
const consoleErrors = [];

/** Assets we deliberately do not download — see assets/third-party/NOTICE.md */
const EXCLUDED = [
  { test: (u) => /fonts\.gstatic\.com/.test(u), why: 'Google Symbols — googlerestricted licence' },
  { test: (u) => /cdn1?\.affirm\.com/.test(u), why: 'Affirm proprietary brand asset' },
];

const ASSET_HOSTS = /^(puffy\.com|cdn\.shopify\.com)$/;

function assetDir(type, url) {
  if (type === 'font') return path.join(ASSETS, 'fonts');
  if (/\.svg(\?|$)/i.test(url)) return path.join(ASSETS, 'icons');
  return path.join(ASSETS, 'images');
}

/**
 * Extension inferred from the response content-type, used ONLY when the URL
 * path has none. Puffy serves the gallery's bundle images through
 * `/_next/image?url=...`, whose pathname basename is the literal string
 * "image" — so a name derived from the URL alone came out as `image-<hash>`
 * with no extension at all, and an extensionless AVIF is not reliably sniffed
 * as an image over file://. See docs/DEVIATIONS.md.
 */
const CT_EXT = {
  'image/avif': '.avif', 'image/webp': '.webp', 'image/png': '.png',
  'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/svg+xml': '.svg',
  'font/woff2': '.woff2', 'video/mp4': '.mp4',
};
const extFromType = (ct) => CT_EXT[String(ct || '').split(';')[0].trim().toLowerCase()] || '';

function safeName(url, contentType) {
  const u = new URL(url);
  // `/_next/image?url=<encoded real url>` is Next.js's image proxy: its pathname
  // basename is the constant "image", so every proxied asset would collide on a
  // meaningless stem. Take the stem from the proxied url instead.
  const proxied = u.pathname.endsWith('/_next/image') && u.searchParams.get('url');
  const base = (proxied ? path.basename(new URL(proxied).pathname) : path.basename(u.pathname)) || 'asset';
  const qs = u.search ? '-' + createHash('sha1').update(u.search).digest('hex').slice(0, 8) : '';
  const ext = path.extname(base) || extFromType(contentType);
  const stem = path.extname(base) ? base.slice(0, -ext.length) : base;
  return `${stem.replace(/[^A-Za-z0-9._-]/g, '_')}${qs}${ext}`;
}

async function wireCollectors(page) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
  });
  page.on('response', async (res) => {
    const req = res.request();
    const url = req.url();
    const type = req.resourceType();
    let host = '';
    try { host = new URL(url).host; } catch { return; }

    requests.push({
      url, type, status: res.status(), host,
      initiator: req.frame() ? 'frame' : 'other',
      size: Number(res.headers()['content-length'] || 0),
    });

    if (!['image', 'font', 'media'].includes(type)) return;
    if (!ASSET_HOSTS.test(host)) return;
    const excluded = EXCLUDED.find((e) => e.test(url));
    if (excluded) return;
    if (savedAssets.has(url)) return;

    try {
      const body = await res.body();
      const dir = assetDir(type, url);
      await mkdir(dir, { recursive: true });
      const name = safeName(url, res.headers()['content-type']);
      await writeFile(path.join(dir, name), body);
      savedAssets.set(url, {
        originalUrl: url,
        localPath: path.relative(ROOT, path.join(dir, name)),
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        resourceType: type,
      });
    } catch { /* body unavailable (redirect/cached) — recorded in requests anyway */ }
  });
}

/**
 * Dismiss the auto-firing email modal, then the cookie banner.
 *
 * Both overlays stay in the DOM after dismissal and merely translate off-screen
 * (the cookie banner ends at transform translateY(+900px)), so Playwright's
 * isVisible() still reports true. Presence must therefore be judged by whether
 * the element actually intersects the viewport, not by isVisible().
 *
 * The email modal is INTERMITTENT — it does not fire on every session. Absence is
 * normal and not an error; only a failure to clear something that IS on screen is.
 */
async function onScreen(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  }, selector);
}

async function dismissOverlays(page) {
  const dismissed = [];
  const seen = [];
  for (const t of DISMISS) {
    if (!(await onScreen(page, t.selector))) continue;
    seen.push(t.slug);
    try {
      await page.locator(t.selector).first().click({ timeout: 5000 });
    } catch {
      try { await page.locator(t.selector).first().click({ timeout: 3000, force: true }); } catch { /* fall through to assert */ }
    }
    await page.waitForTimeout(900);
    if (!(await onScreen(page, t.selector))) dismissed.push(t.slug);
  }
  const remaining = [];
  for (const t of DISMISS) if (await onScreen(page, t.selector)) remaining.push(t.slug);
  if (remaining.length) throw new Error(`overlay still on screen after dismissal: ${remaining.join(', ')}`);
  return { dismissed, seen };
}

/** Walk the DOM to depth N and record structure — used to report the TRUE inventory. */
async function discoverOutline(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      for (const c of el.children) {
        const tag = c.tagName.toLowerCase();
        if (['script', 'style', 'template', 'link', 'meta', 'noscript'].includes(tag)) continue;
        const r = c.getBoundingClientRect();
        const heading = c.querySelector('h1,h2,h3');
        out.push({
          depth, tag,
          id: c.id || null,
          testid: c.getAttribute('data-testid') || null,
          cls: (c.className && typeof c.className === 'string' ? c.className : '').slice(0, 120),
          rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
          heading: heading ? (heading.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90) : null,
        });
        walk(c, depth + 1);
      }
    };
    walk(document.body, 0);
    return out;
  });
}

async function dumpComputed(page, props) {
  return page.evaluate((props) => {
    const rows = [];
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'meta', 'link', 'template', 'noscript', 'head'].includes(tag)) continue;
      const cs = getComputedStyle(el);
      const style = {};
      for (const p of props) style[p] = cs.getPropertyValue(p);
      const r = el.getBoundingClientRect();
      rows.push({
        i, tag,
        id: el.id || null,
        testid: el.getAttribute('data-testid') || null,
        // SVG className is an SVGAnimatedString, not a string — read the attribute
        // so SVG elements are not recorded with an empty class.
        cls: (typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '')).slice(0, 200),
        rect: { x: +r.x.toFixed(2), y: +(r.y + window.scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
        style,
      });
    }
    return rows;
  }, props);
}

async function dumpGeometry(page, sections) {
  return page.evaluate((sections) => {
    const res = {
      page: {
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio,
      },
      sections: {},
    };
    for (const s of sections) {
      const el = document.querySelector(s.selector);
      if (!el) { res.sections[s.slug] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const fixed = cs.position === 'fixed';
      res.sections[s.slug] = {
        selector: s.selector,
        x: r.x, y: fixed ? r.y : r.y + window.scrollY, width: r.width, height: r.height,
        position: cs.position, zIndex: cs.zIndex, display: cs.display,
        // textContent includes CSS-hidden nodes (the announcement bar keeps two
        // aria-hidden marquee measurement copies), so it is the wrong signal for
        // fidelity. innerText respects display/visibility and is what the gate uses.
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 4000),
        visibleText: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 4000),
      };
    }
    return res;
  }, sections);
}

async function loadSections() {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(path.join(ROOT, 'capture', 'sections.json'), 'utf8');
  return JSON.parse(raw).sections;
}

async function captureViewport(browser, vp, dpr, opts = {}) {
  const tag = `${P.label(vp)} dpr-${dpr}`;
  process.stdout.write(`  ${tag} ... `);

  const ctx = await browser.newContext(P.contextOptions(vp, dpr));
  await ctx.addCookies(P.abCookies());
  for (const sc of P.initScripts()) await ctx.addInitScript({ content: sc });

  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(P.FAKE_CLOCK_ISO));
  await wireCollectors(page);

  await page.goto(P.TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await P.assertReady(page);

  const outDir = path.join(REF, P.label(vp), `dpr-${dpr}`);
  const domDir = path.join(DOM, P.label(vp));
  await mkdir(outDir, { recursive: true });
  await mkdir(domDir, { recursive: true });

  // --- overlays: capture BEFORE dismissing, then assert they are gone ---
  await page.waitForTimeout(3500); // email modal self-fires at ~2-3s
  const stateDir = path.join(REF, 'states', 'overlays', P.label(vp), `dpr-${dpr}`);
  if (opts.captureStates) {
    await mkdir(stateDir, { recursive: true });
    await P.freeze(page);
    await page.screenshot({ path: path.join(stateDir, 'overlays-present.png') });
  }
  await P.unfreeze(page); // paused animations would block the hide transition
  const { dismissed, seen: overlaysSeen } = await dismissOverlays(page);
  await P.clearOverlays(page);
  if (opts.captureStates) {
    await P.freeze(page);
    await page.screenshot({ path: path.join(stateDir, 'overlays-dismissed.png') });
    await P.unfreeze(page);
  }

  // --- settle the whole page, then return to top ---
  const settle = await P.scrollAndSettle(page);
  if (!settle.settled) console.warn(`\n    WARN ${tag}: did not settle: ${JSON.stringify(settle.fingerprints)}`);
  // The email modal fires LATE, after the scroll pass. Clearing once after load is
  // not enough — assert again here, immediately before anything is screenshotted.
  const lateCleared = await P.clearOverlays(page);
  await P.freeze(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  // --- ALL dumps happen here, at scrollY=0, BEFORE any screenshot moves the page ---
  let sections = opts.discover ? await discoverSections(page) : await loadSections();
  // Secondary (sub-720px) heights exist ONLY to exercise the @media(max-height:720px)
  // rules on the layer scene. Capturing the whole page there would bank references for
  // modules that legitimately render differently (or not at all) at that height.
  if (vp.heightSensitive) {
    sections = sections.filter((u) => P.HEIGHT_SENSITIVE_SLUGS.includes(u.slug));
  }
  if (opts.discover) {
    await writeFile(
      path.join(ROOT, 'capture', 'sections.json'),
      JSON.stringify({ discoveredAt: new Date().toISOString(), viewport: P.label(vp), count: sections.length, sections }, null, 2)
    );
  }
  const geometry = await dumpGeometry(page, sections);
  await writeFile(path.join(domDir, 'geometry.json'), JSON.stringify(geometry, null, 2));
  await writeFile(path.join(domDir, 'page.html'), await page.content());

  let computedCount = 0;
  if (dpr === 1) {
    const computed = await dumpComputed(page, P.STYLE_PROPS);
    computedCount = computed.length;
    await writeFile(path.join(domDir, 'computed.json'), JSON.stringify(computed));
  }

  let outline = null, geo = null, variant = null;
  if (opts.captureStates) {
    outline = await discoverOutline(page);
    await writeFile(path.join(domDir, 'outline.json'), JSON.stringify(outline, null, 2));
    const cookies = await ctx.cookies();
    const loc = cookies.find((c) => c.name === 'app.location');
    geo = loc ? decodeURIComponent(loc.value).slice(0, 400) : null;
    variant = cookies.filter((c) => /^(experiment-var|ab-)/.test(c.name)).map((c) => `${c.name}=${c.value}`);
  }

  // --- screenshots last ---
  if (dpr === P.FULLPAGE_DPR) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outDir, 'full.png'), fullPage: true });
  }

  const sectionResults = [];
  let n = 0;
  for (const s of sections) {
    n++;
    const file = path.join(outDir, `section-${String(n).padStart(2, '0')}-${s.slug}.png`);
    try {
      const el = page.locator(s.selector).first();
      if ((await el.count()) === 0) { sectionResults.push({ slug: s.slug, ok: false, why: 'not found' }); continue; }
      // Re-assert the exact dump state before EVERY clip. Element screenshots
      // scroll their target into view, and the full-page screenshot runs first,
      // so without this a later clip can be taken in a different scroll/animation
      // state than the geometry dump recorded - which silently produces a
      // reference that disagrees with its own geometry.json.
      await page.evaluate(() => window.scrollTo(0, 0));
      await P.freeze(page);
      await page.waitForTimeout(120);
      const box = await el.boundingBox();
      if (!box || box.height < 1 || box.width < 1) { sectionResults.push({ slug: s.slug, ok: false, why: 'zero box' }); continue; }
      // Chrome cannot encode beyond ~16384 device px in one dimension. Oversized
      // sections are captured as deterministic vertical slices rather than dropped,
      // so DPR2 coverage is preserved (e.g. reviews at 390x844 = 780x18156 device px).
      const devH = box.height * dpr, devW = box.width * dpr;
      if (devW > P.MAX_DEVICE_PX) {
        sectionResults.push({ slug: s.slug, ok: false, why: `width exceeds encoder limit (${Math.round(devW)} device px)` });
        continue;
      }
      if (devH > P.MAX_DEVICE_PX) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const sliceCss = Math.floor(P.MAX_DEVICE_PX / dpr);
        const n = Math.ceil(box.height / sliceCss);
        for (let k = 0; k < n; k++) {
          const y = box.y + k * sliceCss;
          const h = Math.min(sliceCss, box.y + box.height - y);
          await page.screenshot({
            path: file.replace(/\.png$/, `.slice-${k + 1}of${n}.png`),
            fullPage: true,
            clip: { x: box.x, y, width: box.width, height: h },
          });
        }
        sectionResults.push({ slug: s.slug, ok: true, w: Math.round(box.width), h: Math.round(box.height), slices: n });
        continue;
      }
      await el.screenshot({ path: file, timeout: 30000 });
      sectionResults.push({ slug: s.slug, ok: true, w: Math.round(box.width), h: Math.round(box.height) });
    } catch (e) {
      sectionResults.push({ slug: s.slug, ok: false, why: String(e.message || e).slice(0, 120) });
    }
  }

  await ctx.close();
  const found = sectionResults.filter((r) => r.ok).length;
  const sliced = sectionResults.filter((r) => r.slices).length;
  console.log(`ok  (sections ${found}/${sections.length}${sliced ? ` +${sliced} sliced` : ''}, page ${geometry.page.scrollHeight}px, text ${settle.textLength}, settle ${settle.rounds}r ${settle.settled ? 'stable' : 'UNSTABLE'}${computedCount ? `, ${computedCount} els` : ''})`);
  return { vp: P.label(vp), dpr, sectionCount: sections.length, sectionResults, geometry: geometry.page, settle, dismissed, overlaysSeen, lateCleared: lateCleared.cleared, outline, geo, variant };
}

(async () => {
  await mkdir(NET, { recursive: true });
  const browser = await chromium.launch();
  const version = browser.version();
  console.log(`Chromium ${version}`);
  console.log(`profile  ${await P.profileHash()}`);
  console.log(`clock    ${P.FAKE_CLOCK_ISO}  variant=${P.PINNED_VARIANT}`);

  let matrix;
  if (PROBE) {
    matrix = [{ vp: P.VIEWPORTS[0], dpr: 1, captureStates: true, discover: true }];
  } else {
    matrix = [];
    for (const vp of P.VIEWPORTS) {
      if (ONLY && P.label(vp) !== ONLY) continue;
      for (const dpr of vp.dprs) matrix.push({ vp, dpr, captureStates: false, discover: false });
    }
    if (matrix.length) matrix[0].captureStates = true;
  }

  console.log(`\n${PROBE ? 'PROBE' : 'CAPTURE'} - ${matrix.length} pass(es)\n`);
  const results = [];
  for (const m of matrix) {
    results.push(await captureViewport(browser, m.vp, m.dpr, m));
  }
  await browser.close();

  const manifest = {
    capturedAt: new Date().toISOString(),
    mode: PROBE ? 'probe' : 'full',
    target: P.TARGET_URL,
    chromium: version,
    profileHash: await P.profileHash(),
    determinism: {
      fakeClock: P.FAKE_CLOCK_ISO,
      randomSeed: P.RANDOM_SEED,
      locale: P.LOCALE,
      timezone: P.TIMEZONE,
      reducedMotion: 'no-preference',
      pinnedVariant: P.PINNED_VARIANT,
      pinnedClientId: P.PINNED_CLIENT_ID,
    },
    resolvedGeo: results.find((r) => r.geo)?.geo ?? null,
    geoCaveat: 'Reference is geo-as-captured; may not represent a US visitor. See docs/DEVIATIONS.md',
    abCookiesObserved: results.find((r) => r.variant)?.variant ?? null,
    overlaysDismissed: results.find((r) => r.dismissed?.length)?.dismissed ?? [],
    overlaysSeenAcrossPasses: [...new Set(results.flatMap((r) => r.overlaysSeen || []))],
    overlayNote: 'The email-capture modal is intermittent AND fires late - after the full scroll pass, not at the documented 2-3s. Overlays are therefore re-asserted immediately before every screenshot via profile.clearOverlays(). See docs/DEVIATIONS.md.',
    lateClearedPerPass: results.map((r) => ({ vp: r.vp, dpr: r.dpr, cleared: r.lateCleared || [] })),
    passes: results.map(({ outline, ...r }) => r),
    consoleErrorsOnLiveSite: consoleErrors.slice(0, 40),
    requestCount: requests.length,
    distinctHosts: [...new Set(requests.map((r) => r.host))].sort(),
    assets: [...savedAssets.values()],
    requests,
  };
  // A single-viewport run must NOT overwrite the full-matrix provenance record.
  // It used to: an earlier `--only=1440x900` run replaced manifest.json wholesale
  // and destroyed the capture record for the viewports it did not visit (their
  // reference PNGs survived; the record of how they were captured did not).
  // Only a full run writes manifest.json; --only writes its own file.
  const manifestName = PROBE
    ? 'manifest-probe.json'
    : ONLY
      ? `manifest-${ONLY}.json`
      : 'manifest.json';
  await writeFile(path.join(NET, manifestName), JSON.stringify(manifest, null, 2));
  console.log(`manifest ${manifestName}`);

  console.log(`\nrequests ${requests.length} across ${manifest.distinctHosts.length} hosts`);
  console.log(`assets   ${savedAssets.size} saved`);
  console.log(`geo      ${manifest.resolvedGeo || '(not resolved)'}`);
  console.log(`ab       ${(manifest.abCookiesObserved || []).join(' ') || '(none)'}`);
})();
