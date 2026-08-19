/** Pixel diffing with per-tile analysis, so a local defect cannot hide in a tall section. */
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export async function loadPng(p) {
  return PNG.sync.read(await readFile(p));
}

/**
 * Diff two PNGs. Returns overall % plus the worst tile, because a 0.5% threshold on a
 * 6661px-tall section can hide a severe local defect in a sea of unchanged pixels.
 */
export function diffPng(a, b, cfg, masks = []) {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      ok: false,
      dimensionMismatch: true,
      ref: `${a.width}x${a.height}`,
      got: `${b.width}x${b.height}`,
      pct: 100, worstTilePct: 100, diffPixels: null, out: null,
    };
  }
  const { width, height } = a;
  const out = new PNG({ width, height });

  // Neutralise declared mask rectangles in BOTH images before diffing.
  for (const m of masks) {
    for (let y = Math.max(0, m.y); y < Math.min(height, m.y + m.height); y++) {
      for (let x = Math.max(0, m.x); x < Math.min(width, m.x + m.width); x++) {
        const i = (width * y + x) << 2;
        a.data[i] = b.data[i] = 0;
        a.data[i + 1] = b.data[i + 1] = 0;
        a.data[i + 2] = b.data[i + 2] = 0;
        a.data[i + 3] = b.data[i + 3] = 255;
      }
    }
  }

  const diffPixels = pixelmatch(a.data, b.data, out.data, width, height, {
    threshold: cfg.pixelmatch.threshold,
    includeAA: cfg.pixelmatch.includeAA,
    alpha: cfg.pixelmatch.alpha,
    diffMask: true,
  });
  const total = width * height;
  const pct = total ? (diffPixels / total) * 100 : 0;

  // Worst tile
  const T = cfg.tile.size;
  let worstTilePct = 0, worstTile = null;
  for (let ty = 0; ty < height; ty += T) {
    for (let tx = 0; tx < width; tx += T) {
      const w = Math.min(T, width - tx), h = Math.min(T, height - ty);
      let n = 0;
      for (let y = ty; y < ty + h; y++) {
        for (let x = tx; x < tx + w; x++) {
          if (out.data[((width * y + x) << 2) + 3] > 0) n++;
        }
      }
      const tp = (n / (w * h)) * 100;
      if (tp > worstTilePct) { worstTilePct = tp; worstTile = { x: tx, y: ty, w, h, pct: tp }; }
    }
  }

  return { ok: true, dimensionMismatch: false, pct, diffPixels, total, worstTilePct, worstTile, out, width, height };
}

/** Side-by-side + heatmap composite: reference | rebuild | diff */
export function composite(ref, got, diff) {
  const W = ref.width + got.width + (diff ? diff.width : 0);
  const H = Math.max(ref.height, got.height, diff ? diff.height : 0);
  const c = new PNG({ width: W, height: H });
  c.data.fill(24);
  const blit = (src, ox) => {
    if (!src) return;
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (src.width * y + x) << 2;
        const di = (W * y + (x + ox)) << 2;
        const alpha = src.data[si + 3];
        c.data[di] = alpha ? src.data[si] : 24;
        c.data[di + 1] = alpha ? src.data[si + 1] : 24;
        c.data[di + 2] = alpha ? src.data[si + 2] : 24;
        c.data[di + 3] = 255;
      }
    }
  };
  blit(ref, 0);
  blit(got, ref.width);
  if (diff) blit(diff, ref.width + got.width);
  return c;
}
