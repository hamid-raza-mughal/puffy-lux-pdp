/** blocks.mjs — compare rebuild block boxes against reference doc-coords. */
import { chromium } from 'playwright';
import path from 'node:path';
import * as P from './profile.mjs';
import { serve } from './lib-server.mjs';

const EXPECT = [
  ['.s-header',                 0,   0, 1440,  122],
  ['.header-spacer',           0, 122, 1440,  121],
  ['main',                     0, 121, 1440,    0],
  ['#pdp-above-the-fold',       0, 121, 1440, 1836],
  ['.atf__media',              0, 122,  990,  928],
  ['#pdp-description',       990, 121,  450, 1836],
  ['.atf__buy-col',         1006, 121,  418, 1338],
  ['.atf__title-row',       1006, 141,  418,   64],
  ['.atf__rating',          1006, 181,  401,   24],
  ['.atf__usps',            1006, 221,  418,   98],
  ['.atf__upgrades-head',   1006, 335,  418,   28],
  ['.atf__upgrades',        1006, 367,  418,  256],
  ['.atf__sizes-wrap',      1006, 639,  418,  318],
  ['.atf__price',           1006, 871,  418,   86],
  ['.atf__atc-wrap',        1006, 973,  418,  134],
  ['#delivery-date',        1006,1131,  418,   94],
  ['.atf__bundle',          1006,1245,  418,  214],
  ['.atf__trust-wrap',      1006,1459,  418,  148],
  ['.atf__concierge-wrap',  1006,1607,  418,  334],
  ['.atf__card',             1006, 387,  201,  236],
  ['.atf__card-top',         1015, 396,  183,   24],
  ['.atf__card-media',       1015, 420,  183,   90],
  ['.atf__card-body',        1015, 510,  183,  104],
  ['.atf__sizes',            1006, 675,  418,  172],
  ['.atf__size',             1006, 675,  134,   52],
  ['.atf__bundle-head',      1023,1262,  384,   58],
  ['.atf__bundle-grid',      1007,1332,  416,  110],
  ['.atf__trust',            1006,1479,  418,  126],
  ['.atf__concierge',        1006,1663,  418,  266],
  ['.atf__card-name',        1015, 510,  183,   20],
  ['.atf__card-list',        1015, 534,  183,   80],
  ['.atf__bundle-item',      1057,1332,   95,  110],
  ['.atf__bundle-item p',    1057,1398,   95,   44],
  ['.atf__concierge h3',     1041,1700,  349,   32],
  ['.atf__concierge p',      1070,1740,  291,   24],
  ['.atf__concierge-actions',1031,1776,  368,  128],
  ['.atf__call',             1031,1776,  368,   56],
];

const { server, port } = await serve(path.resolve('..'));
const browser = await chromium.launch();
const ctx = await browser.newContext(P.contextOptions(P.VIEWPORTS[0], 1));
for (const s of P.initScripts()) await ctx.addInitScript({ content: s });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(P.FAKE_CLOCK_ISO));
await page.goto(`http://127.0.0.1:${port}/index.html?fidelity=1`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await P.scrollAndSettle(page);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);

const got = await page.evaluate((sels) => {
  const o = {};
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) { o[s] = null; continue; }
    const r = el.getBoundingClientRect();
    o[s] = { x: +r.x.toFixed(1), y: +(r.y + window.scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }
  return o;
}, EXPECT.map((e) => e[0]));

console.log('block                        ref x,y   w x h        got x,y   w x h        dy    dh');
for (const [sel, x, y, w, h] of EXPECT) {
  const g = got[sel];
  if (!g) { console.log(`  ${sel.padEnd(26)} MISSING`); continue; }
  const dy = (g.y - y), dh = (g.h - h);
  const flag = (Math.abs(dy) > 1 || Math.abs(dh) > 1) ? '  <--' : '';
  console.log(`  ${sel.padEnd(26)} ${String(x+','+y).padStart(9)} ${String(w+'x'+h).padStart(10)}   ${String(g.x+','+g.y).padStart(11)} ${String(g.w+'x'+g.h).padStart(12)} ${String(dy.toFixed(0)).padStart(6)} ${String(dh.toFixed(0)).padStart(5)}${flag}`);
}
await browser.close();
server.close();
