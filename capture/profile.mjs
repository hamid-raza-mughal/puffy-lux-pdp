/**
 * profile.mjs — the SINGLE definition of capture determinism.
 *
 * Both capture.mjs (live site -> reference) and verify.mjs (rebuild -> comparison)
 * import this module and must use it identically. Any divergence between the two
 * invalidates the fidelity gate, so there is one definition here, not two copies.
 *
 * Every pin below exists because something on the target page is otherwise
 * non-deterministic. Reasons are stated inline — do not remove a pin without
 * understanding what it was suppressing.
 */

export const TARGET_URL = 'https://puffy.com/products/puffy-lux-mattress';

/**
 * Frozen wall clock. REQUIRED, not hygiene: the buy box renders
 * "Order today for delivery by <date>" from the client clock, so an unfrozen
 * clock changes pixels every day and would make the reference expire nightly.
 */
export const FAKE_CLOCK_ISO = '2026-08-19T17:00:00.000Z';

/** Seed for the deterministic Math.random replacement (see initScripts). */
export const RANDOM_SEED = 0x5eed1234;

/** Locale/timezone are pinned so date and currency formatting cannot drift. */
export const LOCALE = 'en-US';
export const TIMEZONE = 'America/Los_Angeles';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

/**
 * A/B allocation. Puffy runs first-party split testing in Vercel edge
 * middleware (experiment `reposition-celliant-14-08`); assignment is random per
 * visit and is carried in cookies. Pinning them fixes the variant so the
 * reference is reproducible. The chosen variant is recorded in manifest.json.
 */
export const PINNED_VARIANT = 'a';
export const PINNED_CLIENT_ID = '1700000000-PINNEDCAPTUREID';

export function abCookies(domain = '.puffy.com') {
  const base = { domain, path: '/', sameSite: 'Lax' };
  return [
    { name: 'experiment-var', value: PINNED_VARIANT, ...base },
    { name: 'ab-reposition-celliant-14-08-var', value: PINNED_VARIANT, ...base },
    { name: 'ab-reposition-celliant-14-08-source', value: '', ...base },
    { name: 'ab-excluded', value: 'true', ...base },
    { name: 'app.client.id', value: PINNED_CLIENT_ID, ...base },
  ];
}

/**
 * Viewports. DESKTOP ONLY: 1440px and wider. The sub-1440 entries (1024x900,
 * 768x900, 390x844, 390x667) were retired when the deliverable's scope was
 * corrected to real monitor widths; their captured evidence is preserved under
 * reference/_retired/ and dom/_retired/ but no longer gates anything.
 *
 * Width alone is NOT enough: the inline Tailwind build contains
 * `@media (max-height: 720px)` used ~93 times on the layer-scene module, so
 * viewport height changes the design. Primary heights sit above 720;
 * 1440x700 is the remaining heightSensitive probe below it.
 *
 * `gated: false` means CAPTURED AND DIFFED BUT NOT GATED; absent means gated.
 * No viewport currently opts out. 1662 and 1920 were report-only while the
 * source's min-[1640px] states were unimplemented; those are now built, so all
 * four widths gate for real. The mechanism stays because it is the honest way
 * to carry a measured-but-unbuilt width, and re-adding the flag is a one-word
 * change if that is ever needed again.
 */
export const VIEWPORTS = [
  { width: 1440, height: 900, dprs: [1, 2], heightSensitive: false },
  { width: 1536, height: 900, dprs: [1, 2], heightSensitive: false },
  { width: 1662, height: 900, dprs: [1, 2], heightSensitive: false },
  { width: 1920, height: 900, dprs: [1, 2], heightSensitive: false },
  { width: 1440, height: 700, dprs: [1],    heightSensitive: true },
];

/** A viewport gates unless it explicitly opts out. */
export const isGated = (vp) => vp.gated !== false;

export const label = (vp) => `${vp.width}x${vp.height}`;

/** Full-page diffing is gated at DPR1 only (see plan decision 5). */
export const FULLPAGE_DPR = 1;

/**
 * The 14 real breakpoints, extracted from the target's inline Tailwind build
 * rather than guessed. Note lg = 1025 (not Tailwind's default 1024) and
 * xl = 1201 (not 1280) — the scale is customised.
 *
 * This is the NAMED scale, not the complete set of widths at which the page
 * changes. The source also carries arbitrary `min-[Npx]:` variants; in the
 * desktop range alone, min-[1600px], min-[1640px] and min-[1740px] are live on
 * in-scope sections. Do not treat this list as exhaustive.
 */
export const BREAKPOINTS = [
  360, 390, 481, 640, 768, 992, 1025, 1201, 1280, 1366, 1440, 1536, 1662, 1920,
];

/**
 * Geometry-only probes ±1px around every breakpoint.
 * Currently unused by any script; kept because BREAKPOINTS above is the
 * extracted record of the source's scale and this is its natural consumer.
 */
export const breakpointProbes = () =>
  BREAKPOINTS.flatMap((bp) => [bp - 1, bp]);

/**
 * Computed-style properties captured for fidelity work. Deliberately scoped:
 * dumping every property would produce an unreadable multi-hundred-MB file.
 */
export const STYLE_PROPS = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'font-variant-ligatures', 'font-kerning', 'font-feature-settings',
  'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line',
  'color', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat',
  'border-top-width', 'border-right-width', 'border-bottom-width',
  'border-left-width', 'border-top-color', 'border-style',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'opacity',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'max-width', 'min-width', 'max-height',
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self', 'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-column', 'grid-row',
  'transform', 'transition', 'overflow', 'visibility', 'white-space',
  'aspect-ratio', 'object-fit',
];

/**
 * Ordered top-level sections, derived from live recon. capture.mjs ALSO dumps a
 * discovered outline so the true inventory can be reported before any rebuild
 * work begins (below-fold sections have never been observed rendered).
 */
export const SECTIONS = [
  { slug: 'header',          selector: '#header' },
  { slug: 'sale-banner',     selector: '#sale-banner' },
  { slug: 'above-the-fold',  selector: '#pdp-above-the-fold' },
  { slug: 'layer-scene',     selector: '#see-inside-layer-scene', heightSensitive: true },
  { slug: 'buy-box',         selector: '#pdp-description' },
  { slug: 'usp-banner',      selector: '#usp_tag_banner' },
  { slug: 'awards',          selector: '#pdp_awards_section' },
  { slug: 'risk-free-trial', selector: '[id*="risk_free_trial"]' },
  { slug: 'layers',          selector: '[id*="layers-section"]' },
  { slug: 'footer',          selector: 'footer' },
  { slug: 'sticky-bar',      selector: '#variant-selector' },
  { slug: 'cookie-banner',   selector: '[class*="cookie-consent-banner"]' },
];

/**
 * Units captured only as interaction states, never as gated sections, because
 * they are not on screen in the page's rest state.
 */
export const HEIGHT_SENSITIVE_SLUGS = ['above-the-fold', 'gallery', 'layer-scene'];

/** Max device pixels per screenshot dimension. Chrome cannot encode beyond ~16384. */
export const MAX_DEVICE_PX = 12000;

export const STATE_UNITS = [
  { slug: 'sticky-bar', selector: '#variant-selector', reveal: 'scroll' },
  { slug: 'email-modal', selector: '[data-testid="email_popup_close_overlay"]', reveal: 'auto', intermittent: true },
  { slug: 'cookie-banner', selector: '.cookie-consent-banner', reveal: 'auto' },
];

/** Readiness anchors — asserted rather than waited on by timer. */
export const READY_TESTIDS = [
  'variant_selector',
  'main_size_selector',
  'final-price',
  'carousel-content',
];

/**
 * Browser context options shared by capture and verify.
 * reducedMotion is pinned explicitly because `motion-reduce:` appears ~40x in
 * the target's CSS — the design genuinely differs under reduced motion.
 */
export function contextOptions(vp, dpr) {
  return {
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: dpr,
    userAgent: USER_AGENT,
    locale: LOCALE,
    timezoneId: TIMEZONE,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
    forcedColors: 'none',
    isMobile: false,
    // Inert under desktop-only scope (no viewport is <= 480). Left in place
    // rather than removed: deleting it would move profileHash for no rendering
    // reason, and it is the correct expression if the range ever widens again.
    hasTouch: vp.width <= 480,
  };
}

/**
 * Init scripts injected before any page script runs.
 * Seeding Math.random also stabilises React's generated SVG gradient ids
 * (`id="star-xxxxxxxxx"`), which otherwise change on every render.
 */
export function initScripts() {
  return [
    `(() => {
      let s = ${RANDOM_SEED} >>> 0;
      Math.random = function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();`,
  ];
}

/** CSS injected immediately before screenshotting to remove motion and carets. */
export const FREEZE_CSS = `
  *, *::before, *::after {
    animation-delay: -0.0001s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    animation-play-state: paused !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

export const FREEZE_STYLE_ID = '__capture_freeze__';

/**
 * Freeze/unfreeze must be toggleable: FREEZE_CSS pauses animations, and an
 * overlay whose hide transition is paused can never actually dismiss. So we
 * freeze only for screenshots and unfreeze before interacting.
 */
export async function freeze(page) {
  await page.evaluate(({ id, css }) => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }, { id: FREEZE_STYLE_ID, css: FREEZE_CSS });
}

export async function unfreeze(page) {
  await page.evaluate((id) => {
    document.getElementById(id)?.remove();
  }, FREEZE_STYLE_ID);
}

/** pixelmatch configuration. Recorded in every report — an unrecorded config makes a percentage meaningless. */
export const DIFF_CONFIG = {
  threshold: 0.1,
  includeAA: false,
  alpha: 0.1,
  aaColor: [255, 255, 0],
  diffColor: [255, 0, 0],
  diffColorAlt: [0, 255, 0],
  diffMask: false,
};

/** Gate thresholds. Percentage alone is not the gate — see verify.mjs. */
export const GATE = {
  sectionPct: 0.5,
  fullPagePct: 1.0,
  worstTilePct: 5.0,
  tileSize: 64,
  geometryTolerancePx: 1,
  heightDeltaPx: 0,
  maxConsoleErrors: 0,
  maxExternalRequests: 0,
};

/** Hash of everything that affects rendering, so a reference can be audited. */
export async function profileHash() {
  const { createHash } = await import('node:crypto');
  const payload = JSON.stringify({
    FAKE_CLOCK_ISO, RANDOM_SEED, LOCALE, TIMEZONE, USER_AGENT,
    PINNED_VARIANT, PINNED_CLIENT_ID, VIEWPORTS, STYLE_PROPS,
    FREEZE_CSS, DIFF_CONFIG, GATE,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Scroll the full height in increments so lazy images, IntersectionObserver
 * animations and deferred React Server Component sections all resolve.
 *
 * Repeats the whole pass until BOTH document height and total text length stop
 * changing. Height alone is not sufficient: at 1440x700 the reviews module had not
 * begun loading, so height was briefly "stable" at 20483px with the reviews block
 * at 272px and 46 chars of text, versus 6661px and full content at 1440x900.
 * Stable != complete, so the fingerprint includes content.
 *
 * Returns diagnostics so capture/verify can record how settling actually went.
 */
export async function scrollAndSettle(page, { maxRounds = 8, stableRoundsRequired = 2 } = {}) {
  const heights = [];
  let stable = 0;

  const onePass = () =>
    page.evaluate(async () => {
      const pause = (ms) => new Promise((r) => setTimeout(r, ms));
      let last = -1;
      for (let guard = 0; guard < 400; guard++) {
        window.scrollBy(0, Math.round(window.innerHeight * 0.6));
        await pause(160);
        const y = Math.round(window.scrollY);
        const atBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 2;
        if (atBottom && y === last) break;
        last = y;
      }
      await pause(350);
      return {
        h: document.documentElement.scrollHeight,
        t: (document.body.innerText || '').length,
      };
    });

  for (let round = 0; round < maxRounds; round++) {
    const fp = await onePass();
    heights.push(fp);
    const prev = heights[heights.length - 2];
    stable = prev && fp.h === prev.h && fp.t === prev.t ? stable + 1 : 0;
    if (stable >= stableRoundsRequired) break;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
  }

  // Settle at top, then require the height to hold still there too.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  let atTop = [];
  for (let i = 0; i < 8; i++) {
    atTop.push(await page.evaluate(() => document.documentElement.scrollHeight));
    if (atTop.length >= 3 && atTop.slice(-3).every((v) => v === atTop[atTop.length - 1])) break;
    await page.waitForTimeout(500);
  }
  const finalHeight = atTop[atTop.length - 1];
  const last = heights[heights.length - 1];
  const settled =
    atTop.slice(-3).every((v) => v === finalHeight) &&
    heights.length > 1 &&
    stable >= stableRoundsRequired &&
    last.h === finalHeight;
  return { rounds: heights.length, fingerprints: heights, atTop, finalHeight, textLength: last?.t ?? null, settled };
}

/**
 * Detect anything that visually covers the page: a modal scrim, a consent bar, a
 * drawer. Deliberately GENERIC (area + stacking + paint), not a list of known
 * selectors, because the failure this guards against was an overlay that was not
 * on any list.
 *
 * Why this exists: the target's email-capture modal fires LATE — after the full
 * scroll pass, not at the documented 2-3s. An earlier capture run dismissed it at
 * 3.5s, scrolled, and then screenshotted through a `bg-black/80
 * backdrop-blur-[10px]` scrim at z-index 200002. Every reference PNG came out
 * veiled (white timer tiles read 34,34,36) and the whole set had to be redone.
 * So: never assume an overlay stays dismissed. Assert immediately before every
 * screenshot.
 */
export async function blockingOverlays(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const vArea = vw * vh;
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const op = Number(cs.opacity);
      if (op === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // intersection with the viewport
      const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const cover = (ix * iy) / vArea;
      if (cover < 0.25) continue;
      const z = cs.zIndex === 'auto' ? 0 : Number(cs.zIndex) || 0;
      const paints =
        cs.backdropFilter !== 'none' ||
        (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) ||
        (cs.backgroundImage && cs.backgroundImage !== 'none');
      if (!paints) continue;
      // The page's own chrome legitimately paints and is part of the reference.
      if (el.id === 'header' || el.closest('#header') || el.closest('#product-page') || el.closest('#footer')) continue;
      if (z < 30) continue;
      out.push({
        tag: el.tagName, id: el.id || null,
        testid: el.getAttribute('data-testid') || null,
        z, cover: Math.round(cover * 100),
        bg: cs.backgroundColor, backdrop: cs.backdropFilter, opacity: cs.opacity,
        cls: String(el.className || '').slice(0, 90),
      });
    }
    return out;
  });
}

/**
 * Clear every blocking overlay and PROVE it. Escape first (the target's modals are
 * Radix dialogs, which close on Escape), then known close controls, then re-check.
 * Throws rather than silently capturing through a scrim.
 */
export async function clearOverlays(page, { attempts = 4 } = {}) {
  const CLOSERS = [
    '[data-testid="email_popup_close_x_button"]',
    '[data-testid="cookie-consent-banner-accept-button"]',
    '[data-testid="dialog-content"] button[aria-label="Close" i]',
  ];
  const seen = new Set();
  for (let i = 0; i < attempts; i++) {
    const found = await blockingOverlays(page);
    if (!found.length) return { cleared: [...seen], remaining: [] };
    found.forEach((f) => seen.add(f.testid || f.id || f.cls.slice(0, 40)));
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    for (const sel of CLOSERS) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 300 })) {
          await el.click({ timeout: 2500, force: true });
          await page.waitForTimeout(400);
        }
      } catch { /* not present */ }
    }
    await page.waitForTimeout(500);
  }
  const remaining = await blockingOverlays(page);
  if (remaining.length) {
    throw new Error(
      'blocking overlay(s) still covering the page at screenshot time: ' +
        JSON.stringify(remaining.map((r) => ({ id: r.id, testid: r.testid, z: r.z, cover: r.cover + '%', bg: r.bg })))
    );
  }
  return { cleared: [...seen], remaining: [] };
}

/** Assert the page is genuinely ready. networkidle is unreliable on this target. */
export async function assertReady(page, { requireTestIds = true } = {}) {
  if (requireTestIds) {
    for (const id of READY_TESTIDS) {
      await page
        .locator(`[data-testid="${id}"]`)
        .first()
        .waitFor({ state: 'attached', timeout: 45000 });
    }
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      Array.from(document.images).every(
        (img) => !img.currentSrc || (img.complete && img.naturalWidth > 0)
      ),
    null,
    { timeout: 45000 }
  ).catch(() => {});
}
