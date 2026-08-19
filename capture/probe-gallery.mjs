/**
 * probe-gallery.mjs — targeted capture of the gallery carousel's PER-SLIDE states.
 *
 * WHY THIS EXISTS, separately from capture.mjs
 * -------------------------------------------
 * capture.mjs records the page in its REST state only: slide 1 active, slides
 * 2-6 translated out of view at opacity 0, and their `loading="lazy"` images
 * never decoded. That is enough to gate the section as it first paints, and it
 * is what capture/reference/<vp>/ holds today. It is NOT enough to rebuild the
 * carousel, because five of six slides have never been observed rendered:
 *
 *   - dom/<vp>/computed.json puts the slide 3-6 <img> layout box at 1024x651.688,
 *     which is the width/height ATTRIBUTE ratio (1400x891), not the ratio of the
 *     actual asset. Once the image decodes the box becomes 1024 x 1259.52 like
 *     slides 1-2. Building to 651.688 would bake in a loading artefact.
 *   - the thumbnail rail carries exactly THREE buttons for SIX slides. Whether
 *     that window scrolls as you advance cannot be read off a static DOM dump.
 *   - profile.STYLE_PROPS does not include `object-position` or `filter`, so the
 *     --awards-size crop mechanism and the thumbnail brightness states are absent
 *     from the existing dump entirely.
 *
 * So this probe drives the real carousel and records what actually happens. It
 * writes NEW state evidence and never touches capture/reference/<vp>/ — the
 * frozen rest-state baseline is left exactly as it was.
 *
 * Determinism, cookies, clock, UA and overlay handling are all imported from
 * profile.mjs, identical to capture.mjs. Politeness is identical too: one page
 * load per viewport, sequential, settle pauses throughout.
 *
 *   node probe-gallery.mjs                 # all gated viewports, DPR1
 *   node probe-gallery.mjs --only=1440x900
 *   node probe-gallery.mjs --no-shots      # measurements only
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as P from './profile.mjs';

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const SHOTS = !process.argv.includes('--no-shots');
const DPR = 1;

const ROOT = path.resolve('..');
const REF = path.join(ROOT, 'capture', 'reference');
const ASSETS = path.join(ROOT, 'assets', 'third-party');

/**
 * Asset collection, deliberately identical to capture.mjs's safeName/assetDir so
 * a file fetched here is indistinguishable from one fetched by a full capture.
 * It exists because advancing the carousel reveals three thumbnail images
 * (slides 4-6) that the rest-state capture never requested, so they are absent
 * from assets/ and from network/manifest.json. Provenance goes in its OWN
 * manifest; the frozen manifest.json is not rewritten.
 */
const ASSET_HOSTS = /^(puffy\.com|cdn\.shopify\.com)$/;
const savedAssets = new Map();

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

function assetDir(type, url) {
  if (type === 'font') return path.join(ASSETS, 'fonts');
  if (/\.svg(\?|$)/i.test(url)) return path.join(ASSETS, 'icons');
  return path.join(ASSETS, 'images');
}

async function collectAssets(page) {
  page.on('response', async (res) => {
    const req = res.request();
    const url = req.url();
    const type = req.resourceType();
    if (!['image', 'font', 'media'].includes(type)) return;
    let host = '';
    try { host = new URL(url).host; } catch { return; }
    if (!ASSET_HOSTS.test(host)) return;
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
    } catch { /* body unavailable (redirect/cached) */ }
  });
}

const SLIDES = 6;

/** The unit of work: the carousel's own container, not the carousel. */
const CONTAINER = '#pdp-above-the-fold [data-testid="pdp_gallery_carousel"]';

/**
 * Every custom property the gallery subtree reads. Resolved values are recorded
 * per viewport so the rebuild's CSS can cite a number instead of re-deriving a
 * clamp() by hand.
 */
const VARS = [
  '--awards-size', '--gallery-height', '--gallery-width',
  '--content-width', '--content-height', '--content-aspect-ratio',
  '--content-position', '--content-position--min', '--content-position--max',
  '--lux-badge-top', '--header-height',
  '--pdp-top-fold-rhs-column-width', '--gallery-thumbnails-top',
];

/** Read the container's element inventory + the state of every moving part. */
async function readState(page, containerSel, vars) {
  return page.evaluate(({ containerSel, vars }) => {
    const carousel = document.querySelector(containerSel);
    const container = carousel?.parentElement;
    if (!container) return { error: 'container not found' };

    const atf = document.querySelector('#pdp-above-the-fold');
    const atfCS = getComputedStyle(atf);
    const resolvedVars = {};
    for (const v of vars) resolvedVars[v] = atfCS.getPropertyValue(v).trim() || null;

    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: +(r.x).toFixed(2), y: +(r.y + window.scrollY).toFixed(2),
        w: +(r.width).toFixed(2), h: +(r.height).toFixed(2),
      };
    };

    // Element inventory of the container subtree, SVG internals collapsed.
    const inventory = [];
    const walk = (el, depth) => {
      const cs = getComputedStyle(el);
      inventory.push({
        depth,
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid') || null,
        cls: String(el.getAttribute('class') || ''),
        box: box(el),
        display: cs.display,
        position: cs.position,
        opacity: cs.opacity,
        transform: cs.transform,
        pointerEvents: cs.pointerEvents,
        zIndex: cs.zIndex,
        filter: cs.filter,
        overflow: cs.overflow,
        text: el.children.length === 0 ? (el.textContent || '').trim().slice(0, 80) || null : null,
      });
      if (el.tagName.toLowerCase() === 'svg') return; // do not walk svg guts
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(container, 0);

    const slides = [...carousel.querySelectorAll('[data-testid^="pdp_img_carousel_"][role="group"]')]
      .map((s, i) => {
        const cs = getComputedStyle(s);
        const img = s.querySelector('img[class*="object-cover"]');
        const imgCS = img ? getComputedStyle(img) : null;
        const gradient = s.querySelector('.gallery-gradient');
        return {
          index: i + 1,
          testid: s.getAttribute('data-testid'),
          dataActive: s.getAttribute('data-active'),
          cls: String(s.getAttribute('class') || ''),
          inlineStyle: s.getAttribute('style') || null,
          transform: cs.transform,
          opacity: cs.opacity,
          pointerEvents: cs.pointerEvents,
          box: box(s),
          // the slide's own inner wrapper, which is --gallery-height tall
          innerBox: s.firstElementChild ? box(s.firstElementChild) : null,
          innerHeightUsed: s.firstElementChild ? getComputedStyle(s.firstElementChild).height : null,
          gradientBox: gradient ? box(gradient) : null,
          gradientHeightUsed: gradient ? getComputedStyle(gradient).height : null,
          gradientBefore: gradient
            ? { content: getComputedStyle(gradient, '::before').content }
            : null,
          img: img ? {
            src: img.currentSrc || img.src,
            attrW: img.getAttribute('width'), attrH: img.getAttribute('height'),
            naturalW: img.naturalWidth, naturalH: img.naturalHeight,
            complete: img.complete,
            loading: img.getAttribute('loading'),
            layoutW: imgCS.width, layoutH: imgCS.height,
            minW: imgCS.minWidth, maxW: imgCS.maxWidth,
            objectFit: imgCS.objectFit,
            objectPosition: imgCS.objectPosition,
            transform: imgCS.transform,
            box: box(img),
            // Does object-position have anything to shift? cover overflow only
            // exists when the content ratio differs from the box ratio.
            coverOverflow: (() => {
              const bw = parseFloat(imgCS.width), bh = parseFloat(imgCS.height);
              if (!img.naturalWidth || !bw || !bh) return null;
              const scale = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
              return {
                x: +(img.naturalWidth * scale - bw).toFixed(3),
                y: +(img.naturalHeight * scale - bh).toFixed(3),
              };
            })(),
          } : null,
          // per-slide overlay: which of the three kinds is present
          overlay: {
            hasHeader: !!s.querySelector('header'),
            hasAwards: !!s.querySelector('.--awards'),
            hasPoyBadge: !!s.querySelector('[class*="lux-badge-top"]'),
            headingText: (s.querySelector('h2')?.innerText || '').trim() || null,
            subText: (s.querySelector('h2 + div, .mt-2')?.innerText || '').trim().slice(0, 120) || null,
            overlayText: (s.firstElementChild?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 400),
          },
        };
      });

    const rail = carousel.parentElement.querySelector('.hidden.lg\\:flex, [class*="hidden"][class*="lg:flex"]');
    const railButtons = rail ? [...rail.querySelectorAll('button')].map((b) => {
      const cs = getComputedStyle(b);
      return {
        testid: b.getAttribute('data-testid') || null,
        ariaLabel: b.getAttribute('aria-label') || null,
        disabled: b.disabled,
        cls: String(b.getAttribute('class') || ''),
        backgroundImage: cs.backgroundImage,
        backgroundPosition: cs.backgroundPosition,
        backgroundSize: cs.backgroundSize,
        filter: cs.filter,
        opacity: cs.opacity,
        cursor: cs.cursor,
        borderColor: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        borderRadius: cs.borderTopLeftRadius,
        box: box(b),
      };
    }) : null;

    const dots = [...(carousel.querySelector('[class*="lg:hidden"][class*="rounded-full"]')?.children || [])]
      .map((d) => ({
        dataActive: d.getAttribute('data-active'),
        cls: String(d.getAttribute('class') || ''),
        display: getComputedStyle(d).display,
      }));

    return {
      vars: resolvedVars,
      viewport: { w: innerWidth, h: innerHeight, dvh: visualViewport?.height ?? null },
      containerCls: String(container.getAttribute('class') || ''),
      containerBox: box(container),
      containerChildren: [...container.children].map((c) => ({
        tag: c.tagName.toLowerCase(),
        testid: c.getAttribute('data-testid') || null,
        cls: String(c.getAttribute('class') || ''),
        display: getComputedStyle(c).display,
        box: box(c),
      })),
      carouselChildren: [...carousel.children].map((c) => ({
        tag: c.tagName.toLowerCase(),
        testid: c.getAttribute('data-testid') || null,
        cls: String(c.getAttribute('class') || ''),
        display: getComputedStyle(c).display,
      })),
      inventory,
      slides,
      railButtons,
      dots,
    };
  }, { containerSel, vars });
}

/** Which slide reports itself active. */
const activeIndex = (st) => st.slides.findIndex((s) => s.opacity === '1') + 1;

async function probeViewport(browser, vp) {
  const tag = P.label(vp);
  process.stdout.write(`  ${tag} ... `);

  const ctx = await browser.newContext(P.contextOptions(vp, DPR));
  await ctx.addCookies(P.abCookies());
  for (const sc of P.initScripts()) await ctx.addInitScript({ content: sc });

  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(P.FAKE_CLOCK_ISO));
  await collectAssets(page);
  await page.goto(P.TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await P.assertReady(page);

  await page.waitForTimeout(3500);          // email modal self-fires late
  await P.unfreeze(page);
  await P.clearOverlays(page);
  const settle = await P.scrollAndSettle(page);
  await P.clearOverlays(page);

  const shotDir = path.join(REF, 'states', 'gallery', tag, `dpr-${DPR}`);
  if (SHOTS) await mkdir(shotDir, { recursive: true });

  const container = page.locator(CONTAINER).first();
  const shoot = async (name) => {
    if (!SHOTS) return null;
    await P.clearOverlays(page);
    await P.freeze(page);
    const file = path.join(shotDir, `${name}.png`);
    // the container's own parent is the unit of work; screenshot that box
    const boxOf = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel).parentElement;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, CONTAINER);
    await page.screenshot({ path: file, clip: boxOf });
    await P.unfreeze(page);
    return path.relative(ROOT, file);
  };

  const states = [];

  // rest state first, untouched
  const rest = await readState(page, CONTAINER, VARS);
  rest.label = 'rest';
  rest.activeIndex = activeIndex(rest);
  rest.shot = await shoot('slide-1');
  states.push(rest);

  // Advance with the DESKTOP down arrow (the last button in the lg rail), one
  // slide at a time, recording after each move.
  const nextArrow = page.locator(
    '#pdp-above-the-fold [aria-label="Next slide"]:not([data-testid])'
  ).last();

  for (let i = 2; i <= SLIDES; i++) {
    await nextArrow.click({ timeout: 15000 });
    await page.waitForTimeout(1200);       // transition + lazy image decode
    await page.waitForFunction(
      () => Array.from(document.images).every((im) => !im.currentSrc || im.complete),
      null, { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(400);
    const st = await readState(page, CONTAINER, VARS);
    st.label = `after-next-${i - 1}`;
    st.activeIndex = activeIndex(st);
    st.shot = await shoot(`slide-${i}`);
    states.push(st);
  }

  // keyboard: does the carousel region respond to arrow keys?
  const keyboard = await (async () => {
    try {
      await container.click({ position: { x: 40, y: 40 }, timeout: 8000 });
    } catch { /* click may land on a pointer-events:none overlay */ }
    const before = activeIndex(await readState(page, CONTAINER, VARS));
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(900);
    const afterLeft = activeIndex(await readState(page, CONTAINER, VARS));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
    const afterRight = activeIndex(await readState(page, CONTAINER, VARS));
    return { before, afterLeft, afterRight,
      arrowKeysMoveSlides: afterLeft !== before || afterRight !== afterLeft };
  })();

  // thumbnail click: jump straight to a thumbnail's target
  const thumbClick = await (async () => {
    const thumbs = page.locator('#pdp-above-the-fold [data-testid*="_thumb"]');
    const n = await thumbs.count();
    if (!n) return null;
    const before = activeIndex(await readState(page, CONTAINER, VARS));
    const target = thumbs.first();
    const targetTestid = await target.getAttribute('data-testid');
    const targetLabel = await target.getAttribute('aria-label');
    await target.click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    const st = await readState(page, CONTAINER, VARS);
    return { before, targetTestid, targetLabel, after: activeIndex(st),
      railAfter: st.railButtons?.map((b) => b.testid) };
  })();

  await ctx.close();
  process.stdout.write(`ok (${states.length} states${SHOTS ? ', shots' : ''})\n`);
  return { viewport: tag, dpr: DPR, settled: settle.settled, states, keyboard, thumbClick };
}

const viewports = P.VIEWPORTS
  .filter(P.isGated)
  .filter((v) => !v.heightSensitive || v.height === 700)
  .filter((v) => !ONLY || P.label(v) === ONLY);

console.log(`probe-gallery: ${viewports.map(P.label).join(', ')} @ dpr${DPR}`);
console.log(`target: ${P.TARGET_URL}`);
console.log(`profileHash: ${await P.profileHash()}`);

const browser = await chromium.launch();
const out = { probedAt: new Date().toISOString(), target: P.TARGET_URL,
  profileHash: await P.profileHash(), unit: CONTAINER, viewports: [] };
for (const vp of viewports) {
  try {
    out.viewports.push(await probeViewport(browser, vp));
  } catch (e) {
    console.error(`  ${P.label(vp)} FAILED: ${e.message}`);
    out.viewports.push({ viewport: P.label(vp), error: e.message });
  }
}
await browser.close();

out.assets = [...savedAssets.values()].sort((a, b) => a.localPath.localeCompare(b.localPath));

const outFile = path.join(ROOT, 'capture', 'gallery-probe.json');
await writeFile(outFile, JSON.stringify(out, null, 2));
console.log(`\nwrote ${path.relative(ROOT, outFile)}`);

const assetManifest = path.join(ROOT, 'capture', 'network', 'manifest-gallery.json');
await writeFile(assetManifest, JSON.stringify({
  note: 'Assets requested only while the gallery carousel is advanced past slide 1. '
      + 'The rest-state capture never requests these, so they are absent from manifest.json. '
      + 'manifest.json is the frozen record of the rest-state capture and is NOT rewritten here.',
  probedAt: out.probedAt,
  target: out.target,
  profileHash: out.profileHash,
  assetCount: out.assets.length,
  assets: out.assets,
}, null, 2));
console.log(`wrote ${path.relative(ROOT, assetManifest)}  (${out.assets.length} assets)`);
