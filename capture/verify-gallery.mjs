/**
 * verify-gallery.mjs — behavioural gate for the gallery carousel.
 *
 * verify.mjs compares PIXELS in the page's rest state. That cannot say anything
 * about a carousel, whose whole point is the five states you only reach by
 * interacting. So this script drives the REBUILD exactly the way
 * probe-gallery.mjs drove the live page, and asserts the rebuild's per-state
 * behaviour against the recorded live behaviour in capture/gallery-probe.json.
 *
 * It checks behaviour, not paint: which slide is active, the transform and
 * opacity of every slide, the thumbnail window's contents, and the arrows'
 * disabled states. Anything it asserts is something the live page was observed
 * doing — nothing here is an invented expectation.
 *
 *   node verify-gallery.mjs
 *   node verify-gallery.mjs --only=1440x900
 *   node verify-gallery.mjs --verbose
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as P from './profile.mjs';
import { serve } from './lib-server.mjs';

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const VERBOSE = process.argv.includes('--verbose');

const ROOT = path.resolve('..');
const probe = JSON.parse(await readFile(path.join(ROOT, 'capture', 'gallery-probe.json'), 'utf8'));

const failures = [];
const notes = [];

/** Read the rebuild's carousel state in the same shape the probe records. */
async function readState(page) {
  return page.evaluate(() => {
    const carousel = document.querySelector('[data-testid="pdp_gallery_carousel"]');
    const container = carousel.parentElement;
    const slides = [...carousel.querySelectorAll('[data-testid^="pdp_img_carousel_"][role="group"]')];
    const rail = container.querySelector('.atf__rail');
    const buttons = [...rail.querySelectorAll('button')];
    const num = (v) => Math.round(parseFloat(v) || 0);
    const tx = (t) => (t === 'none' ? 0 : num(new DOMMatrixReadOnly(t).m41));
    return {
      containerChildCount: container.children.length,
      slideCount: slides.length,
      active: slides.findIndex((s) => getComputedStyle(s).opacity === '1') + 1,
      slides: slides.map((s, i) => {
        const cs = getComputedStyle(s);
        return {
          index: i + 1,
          testid: s.getAttribute('data-testid'),
          tx: tx(cs.transform),
          opacity: cs.opacity,
          pointerEvents: cs.pointerEvents,
          width: Math.round(s.getBoundingClientRect().width),
        };
      }),
      window: buttons.filter((b) => b.dataset.testid).map((b) => b.dataset.testid.replace(/.*thumb/, '')),
      art: buttons.filter((b) => b.dataset.testid)
        .map((b) => decodeURIComponent(getComputedStyle(b).backgroundImage)
          .replace(/^url\("?.*\//, '').replace(/"?\)$/, '')),
      selected: buttons
        .filter((b) => b.dataset.testid && getComputedStyle(b).filter === 'brightness(1)')
        .map((b) => b.dataset.testid.replace(/.*thumb/, '')),
      upDisabled: buttons[0].disabled,
      downDisabled: buttons[buttons.length - 1].disabled,
    };
  });
}

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures.push(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (VERBOSE || !ok) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  return ok;
}

async function run(browser, port, vpProbe) {
  const label = vpProbe.viewport;
  const [w, h] = label.split('x').map(Number);
  console.log(`\n-- ${label} --`);

  const ctx = await browser.newContext(P.contextOptions({ width: w, height: h }, 1));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?fidelity=1`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const live = vpProbe.states;

  // structure, once
  const first = await readState(page);
  check(`${label} container has exactly the reference's 2 children`,
    first.containerChildCount, live[0].containerChildren.length);
  check(`${label} slide count`, first.slideCount, live[0].slides.length);

  const nextArrow = page.locator('.atf__rail-arrow--down');

  for (let i = 0; i < live.length; i++) {
    if (i > 0) {
      await nextArrow.click();
      await page.waitForTimeout(120);
    }
    const got = await readState(page);
    const want = live[i];
    const wantActive = want.activeIndex;

    check(`${label} slide ${wantActive}: active slide`, got.active, wantActive);

    // translateX as the live page reported it (m41 is the 5th of matrix()'s six)
    const liveTx = want.slides.map((s) => {
      const n = String(s.transform).match(/matrix\(([^)]*)\)/);
      return n ? Math.round(parseFloat(n[1].split(',')[4])) : 0;
    });
    check(`${label} slide ${wantActive}: per-slide translateX`, got.slides.map((s) => s.tx), liveTx);
    check(`${label} slide ${wantActive}: per-slide opacity`,
      got.slides.map((s) => s.opacity), want.slides.map((s) => s.opacity));
    check(`${label} slide ${wantActive}: per-slide pointer-events`,
      got.slides.map((s) => s.pointerEvents), want.slides.map((s) => s.pointerEvents));

    const liveWindow = want.railButtons.filter((b) => b.testid)
      .map((b) => b.testid.replace(/.*thumb/, ''));
    const liveSelected = want.railButtons
      .filter((b) => b.testid && b.filter === 'brightness(1)')
      .map((b) => b.testid.replace(/.*thumb/, ''));
    check(`${label} slide ${wantActive}: thumbnail window`, got.window, liveWindow);

    // ...and that each button shows the RIGHT PICTURE. Checking the testid alone
    // missed a real bug where thumbs 4-6 all rendered slide 3's art. The live
    // URLs are CDN, the rebuild's are local files named `<stem>-<queryhash>.<ext>`,
    // so the assertion is that the rebuild's filename contains the live stem.
    const liveStems = want.railButtons.filter((b) => b.testid).map((b) => {
      const file = decodeURIComponent(b.backgroundImage)
        .replace(/^url\("?.*\//, '').replace(/\?.*$/, '').replace(/"?\)$/, '');
      return file.replace(/\.[a-z0-9]+$/i, '');
    });
    check(`${label} slide ${wantActive}: thumbnail art matches each slide`,
      got.art.map((a, k) => a.includes(liveStems[k])), liveStems.map(() => true));
    check(`${label} slide ${wantActive}: three DISTINCT thumbnails`,
      new Set(got.art).size, got.art.length);
    check(`${label} slide ${wantActive}: selected thumbnail`, got.selected, liveSelected);
    check(`${label} slide ${wantActive}: up arrow disabled`,
      got.upDisabled, want.railButtons[0].disabled);
    check(`${label} slide ${wantActive}: down arrow disabled`,
      got.downDisabled, want.railButtons[want.railButtons.length - 1].disabled);
  }

  // clicking a thumbnail jumps to ITS slide (the live page's testids are
  // slide-indexed, so the last window's first button goes back to slide 4)
  const firstThumb = page.locator('.atf__rail .atf__thumb').first();
  const target = Number(await firstThumb.getAttribute('data-slide'));
  await firstThumb.click();
  await page.waitForTimeout(120);
  const jumped = await readState(page);
  check(`${label} clicking thumbnail ${target} activates slide ${target}`, jumped.active, target);
  if (vpProbe.thumbClick) {
    notes.push(`${label}: live page recorded the same jump (thumb ${vpProbe.thumbClick.targetTestid.replace(/.*thumb/, '')} -> slide ${vpProbe.thumbClick.after})`);
  }

  // the source does NOT move slides with the arrow keys; neither may the rebuild
  if (vpProbe.keyboard && vpProbe.keyboard.arrowKeysMoveSlides === false) {
    const before = (await readState(page)).active;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    const after = (await readState(page)).active;
    check(`${label} ArrowRight does not move slides (matching the source)`, after, before);
  }

  check(`${label} no console/page errors while interacting`, errors.slice(0, 3), []);

  await ctx.close();
}

console.log('='.repeat(78));
console.log('GALLERY BEHAVIOUR GATE');
console.log('='.repeat(78));
console.log(`recorded live behaviour: capture/gallery-probe.json  (${probe.probedAt})`);
console.log(`profileHash: ${probe.profileHash}`);

const { server, port } = await serve(ROOT);
const browser = await chromium.launch();
for (const vp of probe.viewports) {
  if (vp.error || (ONLY && vp.viewport !== ONLY)) continue;
  await run(browser, port, vp);
}
await browser.close();
server.close();

console.log('\n' + '='.repeat(78));
for (const n of notes) console.log('note  ' + n);
if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.log('  ! ' + f);
  process.exit(1);
}
console.log('\nALL CHECKS PASS — the rebuilt carousel behaves as the live one was observed to.');
