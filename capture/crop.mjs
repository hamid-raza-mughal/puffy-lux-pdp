/** crop.mjs — crop a region out of a reference/diff PNG for close inspection.
 *  node crop.mjs <src.png> <x> <y> <w> <h> <out.png> [scale]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
const [src, x, y, w, h, out, scaleArg] = process.argv.slice(2);
const S = Number(scaleArg || 1);
const img = PNG.sync.read(await readFile(src));
const X = +x, Y = +y, W = Math.min(+w, img.width - X), H = Math.min(+h, img.height - Y);
const dst = new PNG({ width: W * S, height: H * S });
for (let j = 0; j < H * S; j++) {
  for (let i = 0; i < W * S; i++) {
    const si = ((img.width * (Y + Math.floor(j / S))) + (X + Math.floor(i / S))) << 2;
    const di = ((dst.width * j) + i) << 2;
    dst.data[di] = img.data[si]; dst.data[di+1] = img.data[si+1];
    dst.data[di+2] = img.data[si+2]; dst.data[di+3] = 255;
  }
}
await writeFile(out, PNG.sync.write(dst));
console.log(`${out}  ${dst.width}x${dst.height}  (from ${src} at ${X},${Y} ${W}x${H} scale ${S})`);
