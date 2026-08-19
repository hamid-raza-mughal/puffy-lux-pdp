/**
 * q.mjs — query the captured computed-style dump.
 *
 * Exists so section CSS is derived from recorded numbers rather than guessed.
 *   node q.mjs <viewport> <match> [prop,prop,...]
 *   node q.mjs 1440x900 '#navbar'
 *   node q.mjs 1440x900 '@logo' font-size,color
 *   node q.mjs 1440x900 'sale-banner' background-color --all
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [vp, match, propArg] = process.argv.slice(2);
const ALL = process.argv.includes('--all');
if (!vp || !match) {
  console.error("usage: node q.mjs <viewport> <match> [prop,prop] [--all]");
  process.exit(2);
}

const rows = JSON.parse(await readFile(path.join('..', 'capture', 'dom', vp, 'computed.json'), 'utf8'));

const needle = match.replace(/^[#@.]/, '').toLowerCase();
const kind = match[0];
const hits = rows.filter((r) => {
  if (kind === '#') return (r.id || '').toLowerCase() === needle;
  if (kind === '@') return (r.testid || '').toLowerCase() === needle;
  if (kind === '.') return (r.cls || '').toLowerCase().includes(needle);
  return (r.id || '').toLowerCase().includes(needle)
    || (r.testid || '').toLowerCase().includes(needle)
    || (r.cls || '').toLowerCase().includes(needle);
});

const INTERESTING = [
  'display', 'position', 'width', 'height', 'max-width', 'min-width',
  'margin-top', 'margin-bottom', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'background-image',
  'border-top-width', 'border-top-color', 'border-top-left-radius',
  'flex-direction', 'align-items', 'justify-content', 'gap',
  'grid-template-columns', 'grid-template-areas', 'z-index', 'transform', 'opacity', 'overflow',
];
const props = propArg && !propArg.startsWith('--') ? propArg.split(',') : INTERESTING;

console.log(`${hits.length} match(es) for ${match} @ ${vp}\n`);
for (const r of hits.slice(0, ALL ? 999 : 6)) {
  const label = (r.id ? '#' + r.id : r.testid ? '@' + r.testid : r.tag);
  console.log(`--- ${label}  <${r.tag}>  ${r.cls ? r.cls.slice(0, 110) : ''}`);
  for (const p of props) {
    const v = r.style[p];
    if (v === undefined) continue;
    if (!ALL && (v === '' || v === 'none' || v === 'normal' || v === 'auto' || v === '0px' || v === 'rgba(0, 0, 0, 0)' || v === 'static' || v === 'visible')) continue;
    console.log(`    ${p.padEnd(24)} ${v.slice(0, 92)}`);
  }
  console.log();
}
