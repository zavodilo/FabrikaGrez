// ============================================================================
//  tools/make-anchor-xy.mjs — derive MovieData.ANCHOR_XY from SetPieces3D.js
// ----------------------------------------------------------------------------
//  The ScriptGenerator stages dialogue so that actors FACE each other and the
//  close/medium cameras sit on the acting axis INSIDE the set (a camera derived
//  from an anchor's stored heading can end up behind an interior wall, which
//  fills the frame with a brown slab). That needs anchor coordinates, and the
//  canon for them is the S.A(…) calls in js/SetPieces3D.js.
//
//  This tool re-reads that canon and rewrites the ANCHOR_XY table inside
//  js/MovieData.js. tests/fabrika-script.test.mjs re-derives the same numbers and
//  fails if the table ever drifts from the engine source.
//
//  node tools/make-anchor-xy.mjs            rewrite the table
//  node tools/make-anchor-xy.mjs --check    fail if the table is stale
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'js', 'SetPieces3D.js');
const OUT = path.join(ROOT, 'js', 'MovieData.js');
const CHECK = process.argv.includes('--check');

/** Parse every set function body: name -> { anchor: [lx, ly] }. */
export function deriveAnchors(src) {
    const parts = src.split(/\n    (\w+)\(S\) \{/);
    const out = {};
    for (let i = 1; i < parts.length; i += 2) {
        const name = parts[i], body = parts[i + 1] || '';
        const anchors = {};
        // S.A('duel_a', -95, 34, 0).A('duel_b', 95, 34, 180) — chained calls included.
        const rx = /\.A\('([a-zA-Z_0-9]+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g;
        let m;
        while ((m = rx.exec(body))) anchors[m[1]] = [Number(m[2]), Number(m[3])];
        if (Object.keys(anchors).length) out[name] = anchors;
    }
    return out;
}

function table(anchors) {
    const ids = Object.keys(anchors).filter((k) => anchors[k] && Object.keys(anchors[k]).length);
    const lines = ids.map((set) => {
        const inner = Object.keys(anchors[set])
            .map((a) => `${a}: [${anchors[set][a][0]}, ${anchors[set][a][1]}]`)
            .join(', ');
        return `        ${set}: { ${inner} },`;
    });
    return '    ANCHOR_XY: {\n' + lines.join('\n') + '\n    },';
}

const anchors = deriveAnchors(fs.readFileSync(SRC, 'utf8'));
const block = table(anchors);

let src = fs.readFileSync(OUT, 'utf8');
const rx = /    ANCHOR_XY: \{[\s\S]*?\n    \},/;
if (!rx.test(src)) {
    // First run: insert before SET_SLOTS.
    const at = src.indexOf('    SET_SLOTS: {');
    if (at < 0) { console.error('make-anchor-xy: нет места для вставки в MovieData.js'); process.exit(1); }
    src = src.slice(0, at) + block + '\n\n' + src.slice(at);
} else {
    src = src.replace(rx, block);
}
if (CHECK) {
    const cur = fs.readFileSync(OUT, 'utf8');
    if (cur !== src) { console.error('make-anchor-xy: ANCHOR_XY устарел — запустите node tools/make-anchor-xy.mjs'); process.exit(1); }
    console.log('make-anchor-xy: ok (' + Object.keys(anchors).length + ' декораций)');
    process.exit(0);
}
fs.writeFileSync(OUT, src);
console.log('make-anchor-xy: js/MovieData.js ANCHOR_XY (' +
    Object.keys(anchors).length + ' декораций, ' +
    Object.values(anchors).reduce((a, x) => a + Object.keys(x).length, 0) + ' якорей)');
