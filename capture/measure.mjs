/**
 * measure.mjs — compare rebuild element boxes against the captured reference.
 * The plan requires fixing the actual numeric difference, not guessing from a heatmap.
 *   node measure.mjs <viewport> <cssSelector>=<refLabel> ...
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as P from './profile.mjs';
import { serve } from './lib-server.mjs';

const vpLabel = process.argv[2] || '1440x900';
const vp = P.VIEWPORTS.find((v) => P.label(v) === vpLabel);
const pairs = process.argv.slice(3).map((a) => {
  const [sel, ref] = a.split('=');
  return { sel, ref: ref || sel };
});

const ROOT = path.resolve('..');
const computed = JSON.parse(await readFile(path.join(ROOT, 'capture', 'dom', vpLabel, 'computed.json'), 'utf8'));

const findRef = (label) => {
  const k = label.replace(/^[#@]/, '').toLowerCase();
  if (label[0] === '#') return computed.find((r) => (r.id || '').toLowerCase() === k);
  if (label[0] === '@') return computed.find((r) => (r.testid || '').toLowerCase() === k);
  return computed.find((r) => (r.cls || '').toLowerCase().includes(k));
};

const { server, port } = await serve(ROOT);
const browser = await chromium.launch();
const ctx = await browser.newContext(P.contextOptions(vp, 1));
for (const s of P.initScripts()) await ctx.addInitScript({ content: s });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(P.FAKE_CLOCK_ISO));
await page.goto(`http://127.0.0.1:${port}/index.html?fidelity=1`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const PROPS = ['width','height','font-size','font-weight','line-height','padding-left','padding-right','color','background-color','letter-spacing'];

console.log(`\n${vpLabel}   rebuild vs reference\n`);
for (const { sel, ref } of pairs) {
  const got = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const o = { x: r.x, y: r.y, width: r.width, height: r.height };
    for (const p of ['font-size','font-weight','line-height','padding-left','padding-right','color','background-color','letter-spacing'])
      o[p] = cs.getPropertyValue(p);
    return o;
  }, sel);
  const want = findRef(ref);
  console.log(`--- ${sel}   (ref ${ref})`);
  if (!got) { console.log('    MISSING in rebuild\n'); continue; }
  if (!want) { console.log('    no reference row found\n'); continue; }
  const rows = [];
  for (const p of PROPS) {
    const a = p === 'width' || p === 'height' ? `${Math.round(got[p] * 100) / 100}px` : got[p];
    const b = want.style[p];
    if (b === undefined) continue;
    const na = parseFloat(a), nb = parseFloat(b);
    const same = (!Number.isNaN(na) && !Number.isNaN(nb)) ? Math.abs(na - nb) < 0.6 : String(a) === String(b);
    rows.push(`    ${same ? ' ' : '!'} ${p.padEnd(18)} rebuild ${String(a).padEnd(26)} ref ${b}`);
  }
  console.log(rows.join('\n') + '\n');
}
await browser.close();
server.close();
