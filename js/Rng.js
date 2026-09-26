// Rng.js — the game's deterministic random (mulberry32), the same stream on every device.
// Nothing in the gameplay uses Math.random: films regenerate from their seeds byte-identical,
// saves stay consistent, and a replayed timeline is reproducible (Scene.random is the kit's
// stream; this one is per-context: a script, a film, a week, a person).
//
//   const r = Rng.create(12345);
//   r.next()          — [0, 1)
//   r.range(2, 5)     — 2..5 inclusive (integers)
//   r.pick(arr)       — an element of arr
//   r.chance(0.3)     — true with p = 0.3
//   Rng.hash('text')  — a stable uint32 seed from a string

/** @satisfies {Record<string, any>} */
const Rng = {
    /** A uint32 seed from any string (FNV-1a). */
    hash(str) {
        let h = 2166136261;
        const s = String(str);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    },

    /** A fresh generator from a seed (number or string). */
    create(seed) {
        let a = (typeof seed === 'string' ? Rng.hash(seed) : (Number(seed) >>> 0)) || 1;
        const next = () => {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        return {
            seed: a,
            next,
            /** Integer in [min, max] inclusive. */
            range(min, max) { return min + Math.floor(next() * (max - min + 1)); },
            /** Float in [min, max). */
            float(min, max) { return min + next() * (max - min); },
            /** A copy of arr in a shuffled order. */
            shuffled(arr) {
                const out = arr.slice();
                for (let i = out.length - 1; i > 0; i--) {
                    const j = Math.floor(next() * (i + 1));
                    const t = out[i]; out[i] = out[j]; out[j] = t;
                }
                return out;
            },
            /** An element of arr (or null on an empty one). */
            pick(arr) { return arr && arr.length ? arr[Math.floor(next() * arr.length)] : null; },
            /** True with probability p. */
            chance(p) { return next() < p; },
            /** A weighted pick: weights — numbers parallel to arr. */
            weighted(arr, weights) {
                let total = 0;
                for (const w of weights) total += w;
                if (total <= 0) return arr && arr.length ? arr[Math.floor(next() * arr.length)] : null;
                let r = next() * total;
                for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
                return arr[arr.length - 1];
            },
            /** A bell-curved value around 0 (sum of 3 uniforms, roughly ±1). */
            gauss() { return (next() + next() + next()) / 1.5 - 1; },
        };
    },
};
