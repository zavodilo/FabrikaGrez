// ============================================================================
//  tools/png-diff.mjs — a dependency-free PNG reader + pixel diff (dev-only)
// ----------------------------------------------------------------------------
//  node tools/png-diff.mjs A.png B.png [--json]
//  import { readPng, diffPngs } from './png-diff.mjs'
//
//  Why this exists: the visual regression gate compares fresh contact sheets
//  against the golden ones (docs/golden). The kit ships zero npm dependencies,
//  so the PNG codec here is the minimal honest one: 8-bit RGB/RGBA/grayscale,
//  non-interlaced, filters 0..4 — exactly what a headless Chrome screenshot is.
// ============================================================================
import fs from 'node:fs';
import zlib from 'node:zlib';

/** Minimal PNG decode: { width, height, data: Uint8Array RGBA }. */
export function readPng(file) {
    const buf = fs.readFileSync(file);
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ': not a PNG');
    let off = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') break;
        off += 12 + len;
    }
    if (bitDepth !== 8 || interlace !== 0) throw new Error(file + ': only 8-bit non-interlaced PNG supported');
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
    if (!channels) throw new Error(file + ': unsupported color type ' + colorType);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = new Uint8Array(width * height * 4);
    let prev = new Uint8Array(stride);
    let p = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[p++];
        const line = raw.subarray(p, p + stride);
        p += stride;
        const cur = new Uint8Array(stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? cur[x - channels] : 0;
            const b = prev[x];
            const c = x >= channels ? prev[x - channels] : 0;
            let v = line[x];
            if (filter === 1) v = (v + a) & 255;
            else if (filter === 2) v = (v + b) & 255;
            else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
            else if (filter === 4) {
                const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
                const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
                v = (v + pr) & 255;
            }
            cur[x] = v;
        }
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            if (channels >= 3) {
                out[o] = cur[x * channels]; out[o + 1] = cur[x * channels + 1]; out[o + 2] = cur[x * channels + 2];
                out[o + 3] = channels === 4 ? cur[x * channels + 3] : 255;
            } else {
                const g = cur[x * channels];
                out[o] = g; out[o + 1] = g; out[o + 2] = g;
                out[o + 3] = channels === 2 ? cur[x * channels + 1] : 255;
            }
        }
        prev = cur;
    }
    return { width, height, data: out };
}

/**
 * Pixel diff of two RGBA images: mean absolute delta over all channels (0..255 scale),
 * the share of pixels whose worst channel delta exceeds `tol`, and the worst pixel.
 * @returns {{ mean: number, badShare: number, worst: number, width: number, height: number }}
 */
export function diffPngs(a, b, tol = 12) {
    if (a.width !== b.width || a.height !== b.height) {
        return { mean: 255, badShare: 1, worst: 255, width: -1, height: -1 };
    }
    let sum = 0, bad = 0, worst = 0;
    const n = a.width * a.height;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        let d = 0;
        for (let c = 0; c < 4; c++) {
            const dc = Math.abs(a.data[o + c] - b.data[o + c]);
            if (dc > d) d = dc;
        }
        sum += d;
        if (d > tol) bad++;
        if (d > worst) worst = d;
    }
    return { mean: sum / n, badShare: bad / n, worst, width: a.width, height: a.height };
}

if (process.argv[1] && process.argv[1].endsWith('png-diff.mjs')) {
    const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (args.length < 2) {
        console.error('usage: node tools/png-diff.mjs A.png B.png');
        process.exit(2);
    }
    const d = diffPngs(readPng(args[0]), readPng(args[1]));
    const line = 'mean ' + d.mean.toFixed(2) + ', bad ' + (d.badShare * 100).toFixed(2) + '%, worst ' + d.worst;
    console.log(line);
    process.exit(d.mean > 6 || d.badShare > 0.12 ? 1 : 0);
}
