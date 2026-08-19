/** tiles.mjs — rank the worst 64px tiles so fixes can be targeted, not guessed. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import path from 'node:path';
import * as P from './profile.mjs';
import { serve } from './lib-server.mjs';
import { loadPng, diffPng } from './lib-diff.mjs';

const unit = process.argv[2] || 'above-the-fold';
const file = process.argv[3] || 'section-03-above-the-fold.png';
const cfg = JSON.parse(await readFile('../capture/diff-config.json','utf8'));
const { server, port } = await serve(path.resolve('..'));
const b = await chromium.launch();
const ctx = await b.newContext(P.contextOptions(P.VIEWPORTS[0], 1));
for (const s of P.initScripts()) await ctx.addInitScript({ content: s });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(P.FAKE_CLOCK_ISO));
await page.goto(`http://127.0.0.1:${port}/index.html?fidelity=1`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await P.scrollAndSettle(page); await page.evaluate(()=>window.scrollTo(0,0)); await P.freeze(page);
await page.waitForTimeout(300);
const sections = JSON.parse(await readFile('../capture/sections.json','utf8')).sections;
const sel = sections.find(s=>s.slug===unit).selector;
const got = PNG.sync.read(await page.locator(sel).first().screenshot());
const ref = await loadPng('../capture/reference/1440x900/dpr-1/'+file);
const r = diffPng(ref, got, cfg, []);
console.log(`overall ${r.pct.toFixed(3)}%  worstTile ${r.worstTilePct.toFixed(1)}%  (${r.width}x${r.height})\n`);
// re-scan tiles from the diff mask
const T=64, out=r.out, W=r.width, H=r.height, tiles=[];
for(let ty=0;ty<H;ty+=T) for(let tx=0;tx<W;tx+=T){
  const w=Math.min(T,W-tx), h=Math.min(T,H-ty); let n=0;
  for(let y=ty;y<ty+h;y++) for(let x=tx;x<tx+w;x++) if(out.data[((W*y+x)<<2)+3]>0) n++;
  if(n) tiles.push({tx,ty,pct:100*n/(w*h),n});
}
tiles.sort((a,b)=>b.n-a.n);
const tot=tiles.reduce((s,t)=>s+t.n,0);
console.log('worst tiles (x,y = section coords):');
console.log('   x     y    tile%   diffPx   share of total');
for(const t of tiles.slice(0,22))
  console.log('  '+String(t.tx).padStart(4)+' '+String(t.ty).padStart(5)+'  '+t.pct.toFixed(1).padStart(6)+'  '+String(t.n).padStart(7)+'   '+(100*t.n/tot).toFixed(1).padStart(5)+'%');
console.log('\n  tiles with any diff: '+tiles.length+'   total differing px: '+tot);
await b.close(); server.close();
