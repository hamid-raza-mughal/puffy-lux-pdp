/**
 * extract-tokens.mjs — derive the design system from captured computed styles.
 *
 * Per plan decision 3: declarations are derived MECHANICALLY from computed.json,
 * then hand-rationalised into token-driven section CSS. This script does the
 * mechanical half — it clusters observed values, counts usage, and emits
 * candidate tokens. It does not invent values, and it does not snap anything;
 * where the source is internally inconsistent that shows up as near-duplicate
 * clusters, which is the signal a human needs to make the call.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('..');
const VPS = ['1440x900', '1536x900', '1662x900', '1920x900'];

const IGNORE_COLOR = new Set(['rgba(0, 0, 0, 0)', 'transparent', 'currentcolor', 'none']);

/** rgb()/rgba() -> #rrggbb (+ alpha kept separately) so near-identical values cluster. */
function normColor(v) {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (IGNORE_COLOR.has(s)) return null;
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return s.startsWith('#') ? s : null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return a === 1 ? hex : `${hex}@${a}`;
}

const px = (v) => {
  const m = String(v || '').match(/^(-?[\d.]+)px$/);
  return m ? Number(m[1]) : null;
};

function bump(map, key, ctx) {
  if (key === null || key === undefined || key === '') return;
  const k = String(key);
  if (!map.has(k)) map.set(k, { count: 0, where: new Set() });
  const e = map.get(k);
  e.count++;
  if (e.where.size < 12 && ctx) e.where.add(ctx);
}

const toRows = (map, min = 1) =>
  [...map.entries()]
    .filter(([, v]) => v.count >= min)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([value, v]) => ({ value, count: v.count, where: [...v.where] }));

/** Cluster numerically-close values so "internally inconsistent" is visible. */
function cluster(rows, tolerance) {
  const nums = rows
    .map((r) => ({ ...r, n: parseFloat(r.value) }))
    .filter((r) => !Number.isNaN(r.n))
    .sort((a, b) => a.n - b.n);
  const groups = [];
  for (const r of nums) {
    const g = groups.find((x) => Math.abs(x.centre - r.n) <= tolerance);
    if (g) {
      g.members.push(r);
      g.centre = g.members.reduce((s, m) => s + m.n * m.count, 0) / g.members.reduce((s, m) => s + m.count, 0);
    } else {
      groups.push({ centre: r.n, members: [r] });
    }
  }
  return groups
    .map((g) => ({
      centre: Math.round(g.centre * 100) / 100,
      total: g.members.reduce((s, m) => s + m.count, 0),
      values: g.members.map((m) => ({ value: m.value, count: m.count })),
    }))
    .sort((a, b) => a.centre - b.centre);
}

const ctxOf = (el) =>
  (el.id ? '#' + el.id : el.testid ? '@' + el.testid : el.tag) +
  (el.cls ? '.' + el.cls.split(/\s+/).slice(0, 2).join('.') : '');

(async () => {
  const acc = {
    color: new Map(), bg: new Map(), borderColor: new Map(),
    fontFamily: new Map(), fontSize: new Map(), fontWeight: new Map(),
    lineHeight: new Map(), letterSpacing: new Map(), textTransform: new Map(),
    radius: new Map(), shadow: new Map(), borderWidth: new Map(),
    spacing: new Map(), gap: new Map(), transition: new Map(),
    maxWidth: new Map(), bgImage: new Map(),
  };
  const perViewport = {};

  for (const vp of VPS) {
    let rows;
    try {
      rows = JSON.parse(await readFile(path.join(ROOT, 'capture', 'dom', vp, 'computed.json'), 'utf8'));
    } catch { console.warn(`  skip ${vp} (no computed.json)`); continue; }

    const vAcc = { fontSize: new Map(), maxWidth: new Map() };
    for (const el of rows) {
      const s = el.style, c = ctxOf(el);
      bump(acc.color, normColor(s.color), c);
      bump(acc.bg, normColor(s['background-color']), c);
      bump(acc.borderColor, normColor(s['border-top-color']), c);
      bump(acc.fontFamily, (s['font-family'] || '').split(',')[0].replace(/['"]/g, '').trim(), c);
      bump(acc.fontWeight, s['font-weight'], c);
      bump(acc.textTransform, s['text-transform'] === 'none' ? null : s['text-transform'], c);
      bump(acc.letterSpacing, s['letter-spacing'] === 'normal' ? null : s['letter-spacing'], c);
      bump(acc.lineHeight, s['line-height'], c);
      bump(acc.fontSize, s['font-size'], c);
      bump(vAcc.fontSize, s['font-size'], c);
      if (s['box-shadow'] && s['box-shadow'] !== 'none') bump(acc.shadow, s['box-shadow'], c);
      if (s['transition'] && !/^all 0s/.test(s['transition'])) bump(acc.transition, s['transition'], c);
      if (s['background-image'] && s['background-image'] !== 'none') {
        bump(acc.bgImage, s['background-image'].slice(0, 160), c);
      }
      for (const k of ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']) {
        const n = px(s[k]); if (n) bump(acc.radius, n + 'px', c);
      }
      for (const k of ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']) {
        const n = px(s[k]); if (n) bump(acc.borderWidth, n + 'px', c);
      }
      for (const k of ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
        const n = px(s[k]); if (n) bump(acc.spacing, n + 'px', c);
      }
      for (const k of ['gap', 'row-gap', 'column-gap']) {
        const n = px(s[k]); if (n) bump(acc.gap, n + 'px', c);
      }
      const mw = px(s['max-width']); if (mw) { bump(acc.maxWidth, mw + 'px', c); bump(vAcc.maxWidth, mw + 'px', c); }
    }
    perViewport[vp] = {
      fontSize: toRows(vAcc.fontSize, 2).slice(0, 40),
      containerMaxWidths: toRows(vAcc.maxWidth, 2).slice(0, 20),
    };
    console.log(`  ${vp}: ${rows.length} elements`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Mechanically derived from capture/dom/*/computed.json. Values are OBSERVED, not snapped. Near-duplicate clusters indicate the source system is internally inconsistent — keep the original value for fidelity and document the tension (see docs/TOKENS.md).',
    colors: {
      text: toRows(acc.color, 2),
      background: toRows(acc.bg, 2),
      border: toRows(acc.borderColor, 2),
    },
    type: {
      families: toRows(acc.fontFamily, 1),
      weights: toRows(acc.fontWeight, 1),
      sizes: toRows(acc.fontSize, 2),
      sizeClusters: cluster(toRows(acc.fontSize, 2), 0.6),
      lineHeights: toRows(acc.lineHeight, 2).slice(0, 40),
      letterSpacing: toRows(acc.letterSpacing, 1),
      textTransform: toRows(acc.textTransform, 1),
    },
    space: {
      values: toRows(acc.spacing, 3),
      clusters: cluster(toRows(acc.spacing, 3), 1),
      gaps: toRows(acc.gap, 2),
    },
    shape: {
      radii: toRows(acc.radius, 2),
      radiusClusters: cluster(toRows(acc.radius, 2), 1),
      borderWidths: toRows(acc.borderWidth, 2),
      shadows: toRows(acc.shadow, 1).slice(0, 30),
    },
    motion: { transitions: toRows(acc.transition, 1).slice(0, 30) },
    layout: { containerMaxWidths: toRows(acc.maxWidth, 2).slice(0, 30) },
    media: { backgroundImages: toRows(acc.bgImage, 1).slice(0, 40) },
    perViewport,
  };

  await writeFile(path.join(ROOT, 'capture', 'tokens-observed.json'), JSON.stringify(report, null, 2));

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const spaceNums = report.space.values.map((r) => parseFloat(r.value)).filter((n) => n > 0 && Number.isInteger(n));
  const baseUnit = spaceNums.length ? spaceNums.reduce((a, b) => gcd(a, b)) : null;

  console.log('\n--- observed design system ---');
  console.log('font families   :', report.type.families.slice(0, 6).map((r) => `${r.value}(${r.count})`).join(', '));
  console.log('font weights    :', report.type.weights.map((r) => `${r.value}(${r.count})`).join(', '));
  console.log('font sizes      :', report.type.sizes.length, 'distinct ->', report.type.sizeClusters.length, 'clusters');
  console.log('text colours    :', report.colors.text.length, 'distinct');
  console.log('bg colours      :', report.colors.background.length, 'distinct');
  console.log('spacing values  :', report.space.values.length, 'distinct ->', report.space.clusters.length, 'clusters');
  console.log('spacing GCD     :', baseUnit, 'px  (inferred base unit)');
  console.log('radii           :', report.shape.radii.length, 'distinct ->', report.shape.radiusClusters.length, 'clusters');
  console.log('shadows         :', report.shape.shadows.length);
  console.log('transitions     :', report.motion.transitions.length);
  console.log('container widths:', report.layout.containerMaxWidths.slice(0, 8).map((r) => r.value).join(', '));
  console.log('\nwrote capture/tokens-observed.json');
})();
