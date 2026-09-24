// make-movie-sounds.mjs — the game's sound library in assets/sounds/, synthesized from numbers:
// film SFX (gunshot, punch, crowd, thunder, the clapperboard…) and SEAMLESS genre music loops
// (a tiny chord-progression synth: pads, plucks, walking bass, drums). Deterministic — the
// same bytes on every run; --check verifies the files on disk.
//
//   node tools/make-movie-sounds.mjs          # writes the files
//   node tools/make-movie-sounds.mjs --check  # exit 1 if a file differs
//
// WAV: PCM 16 bit, mono, 22050 Hz (the kit's format, tools/make-sounds.mjs).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { RATE, loopedNoise } from './make-sounds.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'sounds');

// --- primitives --------------------------------------------------------------------------

function noise(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x80000000 - 1;
    };
}

function lowpass(k) {
    let y = 0;
    return (x) => (y += k * (x - y));
}

function writeWav(samples) {
    const data = Buffer.alloc(samples.length * 2);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const g = peak > 0.98 ? 0.98 / peak : 1;
    for (let i = 0; i < samples.length; i++) {
        data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), i * 2);
    }
    const head = Buffer.alloc(44);
    head.write('RIFF', 0, 'latin1');
    head.writeUInt32LE(36 + data.length, 4);
    head.write('WAVEfmt ', 8, 'latin1');
    head.writeUInt16LE(16, 16);
    head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22);
    head.writeUInt32LE(RATE, 24);
    head.writeUInt32LE(RATE * 2, 28);
    head.writeUInt16LE(2, 32);
    head.writeUInt16LE(16, 34);
    head.write('data', 36, 'latin1');
    head.writeUInt32LE(data.length, 40);
    return Buffer.concat([head, data]);
}

const buf = (sec) => new Float64Array(Math.round(sec * RATE));

// One oscillator event with a frequency sweep and an exponential decay.
// f(t) — Hz at event-time t; phase is integrated, so sweeps stay continuous.
function tone(out, t0, dur, f, gain, decay, opts) {
    const o = opts || {};
    const i0 = Math.round(t0 * RATE), n = Math.round(dur * RATE);
    const a = o.attack || 0.004, lp = o.lp ? lowpass(o.lp) : null;
    const vib = o.vib || 0, vibHz = o.vibHz || 5.5;
    let ph = o.phase || 0;
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const hz = (typeof f === 'function' ? f(t) : f) * (vib ? 1 + vib * Math.sin(2 * Math.PI * vibHz * t) : 1);
        ph += 2 * Math.PI * hz / RATE;
        const env = Math.min(1, t / a) * Math.exp(-t * decay);
        let v = o.wave ? o.wave(ph) : Math.sin(ph);
        if (lp) v = lp(v);
        const idx = i0 + i;
        if (idx >= 0 && idx < out.length) out[idx] += v * env * gain;
    }
    return out;
}

function noiseBurst(out, t0, dur, gain, decay, lpK, seed, opts) {
    const o = opts || {};
    const i0 = Math.round(t0 * RATE), n = Math.round(dur * RATE);
    const rnd = noise(seed == null ? 7 : seed), lp = lowpass(lpK);
    const a = o.attack || 0.001;
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const env = Math.min(1, t / a) * Math.exp(-t * decay);
        const idx = i0 + i;
        if (idx >= 0 && idx < out.length) out[idx] += lp(rnd()) * env * gain;
    }
    return out;
}

// --- waves ----------------------------------------------------------------------------------
const sine = (p) => Math.sin(p);
const tri = (p) => { const x = (p / (2 * Math.PI)) % 1; return 4 * Math.abs(x - Math.floor(x + 0.75) + 0.25) - 1; };
const saw = (p) => { const x = (p / (2 * Math.PI)) % 1; return 2 * x - 1; };
const sqr = (p) => (Math.sin(p) >= 0 ? 0.6 : -0.6);

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORD = {
    maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10],
    dom7: [0, 4, 7, 10], dim: [0, 3, 6], sus: [0, 5, 7],
};

// --- the music mini-synth ---------------------------------------------------------------------
// A track = bars × 4 beats, every event wraps modulo the loop length, so the WAV is seamless.
class Track {
    constructor(bpm, bars, seed) {
        this.bpm = bpm;
        this.beat = 60 / bpm;
        this.bars = bars;
        this.N = Math.round(bars * 4 * this.beat * RATE);
        this.out = new Float64Array(this.N);
        this.rnd = noise(seed || 3);
    }

    _wrap(t0, dur, fn) {
        const n = Math.round(dur * RATE);
        let i0 = Math.round(t0 * RATE) % this.N;
        if (i0 < 0) i0 += this.N;
        for (let i = 0; i < n; i++) {
            const idx = (i0 + i) % this.N;
            this.out[idx] += fn(i / RATE, i / n);
        }
    }

    // A wrapped oscillator voice. f — Hz or f(t); env(a, decay); wave fn; optional lowpass.
    voice(t0, dur, f, gain, decay, opts) {
        const o = opts || {};
        const a = o.attack || 0.005, lpK = o.lp || 0;
        const vib = o.vib || 0, vibHz = o.vibHz || 5.5;
        const wave = o.wave || sine;
        let lp = null;
        let ph = 0;
        this._wrap(t0, dur, (t) => {
            const hz = (typeof f === 'function' ? f(t) : f) * (vib ? 1 + vib * Math.sin(2 * Math.PI * vibHz * t) : 1);
            ph += 2 * Math.PI * hz / RATE;
            if (lpK && !lp) lp = lowpass(lpK);
            const v = wave(ph);
            return (lp ? lp(v) : v) * Math.min(1, t / a) * Math.exp(-t * decay) * gain;
        });
        return this;
    }

    noise(t0, dur, gain, decay, lpK, seed) {
        const rnd = noise(seed == null ? Math.round(t0 * 1000) : seed), lp = lowpass(lpK);
        this._wrap(t0, dur, (t) => lp(rnd()) * Math.min(1, t / 0.002) * Math.exp(-t * decay) * gain);
        return this;
    }

    // A sustained chord (two detuned saws through a slow lowpass).
    pad(bar, rootMidi, type, gain, opts) {
        const o = opts || {};
        const t0 = bar * 4 * this.beat, dur = 4 * this.beat * 0.98;
        const notes = CHORD[type] || CHORD.maj;
        for (const iv of notes) {
            const f = midi(rootMidi + iv + (o.oct || 0));
            this.voice(t0, dur, f * 1.002, gain * 0.5, 0.55, { wave: saw, lp: o.lp || 0.09, attack: o.attack || 0.35 });
            this.voice(t0, dur, f * 0.998, gain * 0.5, 0.55, { wave: saw, lp: o.lp || 0.09, attack: (o.attack || 0.35) * 1.3 });
        }
        return this;
    }

    // A plucked note (fast decay, triangle body + a pinch of saw).
    pluck(t0, f, gain, decay, opts) {
        const o = opts || {};
        this.voice(t0, o.dur || 0.5, f, gain, decay || 7, { wave: tri, lp: o.lp || 0.5, attack: 0.003 });
        this.voice(t0, (o.dur || 0.5) * 0.6, f * 2.01, gain * 0.18, (decay || 7) * 1.6, { wave: saw, lp: 0.3 });
        return this;
    }

    kick(t0, gain) {
        this.voice(t0, 0.24, (t) => 44 + 92 * Math.exp(-t * 26), gain || 0.85, 13, {});
        this.noise(t0, 0.03, (gain || 0.85) * 0.25, 90, 0.3);
        return this;
    }

    snare(t0, gain) {
        this.noise(t0, 0.17, gain || 0.4, 24, 0.4);
        this.voice(t0, 0.1, 190, (gain || 0.4) * 0.6, 30, { wave: tri });
        return this;
    }

    hat(t0, gain) {
        this.noise(t0, 0.05, gain || 0.14, 85, 0.8);
        return this;
    }

    render() {
        // A gentle soft-clip so layered tracks glue instead of crunching.
        for (let i = 0; i < this.N; i++) this.out[i] = Math.tanh(this.out[i] * 0.9);
        return this.out;
    }
}

// --- tracks -----------------------------------------------------------------------------------

// Upbeat swing for the studio lot and menus: walking bass, brush hats, off-beat comping.
function musicStudio() {
    const T = new Track(112, 8, 21);
    const prog = [[48, 'maj7'], [45, 'min7'], [50, 'min7'], [55, 'dom7'], [48, 'maj7'], [41, 'min7'], [43, 'min7'], [55, 'dom7']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar];
        T.pad(bar, root + 12, type, 0.085, { attack: 0.06, lp: 0.12 });
        // Walking bass: root, fifth, octave, chromatic approach.
        const steps = [root, root + 7, root + 12, root + (bar % 2 ? 11 : 10)];
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            T.voice(t, T.beat * 0.92, midi(steps[b] - 12), 0.34, 3.4, { wave: (p) => sine(p) + 0.35 * tri(p), lp: 0.35 });
        }
        // Comping on the off-beats + brush hats on eighths.
        for (let s = 0; s < 8; s++) {
            const t = (bar * 4 + s / 2) * T.beat;
            T.hat(t, s % 2 ? 0.07 : 0.11);
            if (s === 2 || s === 5 || (bar % 4 === 3 && s === 7)) {
                const n = CHORD[type];
                for (const iv of n) T.pluck(t, midi(root + 12 + iv), 0.1, 9, { dur: 0.3 });
            }
        }
        // A sparse vibraphone-ish twinkle.
        if (bar % 2 === 1) {
            const t = (bar * 4 + 2.5) * T.beat;
            T.voice(t, 0.7, midi(root + 24), 0.07, 5, { wave: sine, vib: 0.01 });
        }
    }
    return T.render();
}

// Slow minor strings for dramas.
function musicDrama() {
    const T = new Track(64, 4, 33);
    const prog = [[45, 'min'], [41, 'maj'], [48, 'maj'], [43, 'maj']];
    for (let bar = 0; bar < 4; bar++) {
        const [root, type] = prog[bar];
        T.pad(bar, root, type, 0.13, { attack: 0.6, lp: 0.07 });
        T.pad(bar, root - 12, type === 'min' ? 'min' : 'maj', 0.09, { attack: 0.8, lp: 0.05 });
        T.voice(bar * 4 * T.beat, 4 * T.beat, midi(root - 24), 0.3, 0.5, { wave: (p) => sine(p) + 0.2 * saw(p), lp: 0.1, attack: 0.2 });
        // A lonely piano-ish line over the change.
        const mel = [[0, 12], [1.5, 7], [3, 3]][bar % 3];
        T.pluck((bar * 4 + mel[0]) * T.beat, midi(root + 12 + mel[1]), 0.12, 4.5, { dur: 1.4, lp: 0.25 });
    }
    return T.render();
}

// Bouncy pizzicato for comedies.
function musicComedy() {
    const T = new Track(126, 8, 45);
    const prog = [[48, 'maj'], [53, 'maj'], [55, 'dom7'], [48, 'maj'], [45, 'min'], [50, 'dom7'], [55, 'dom7'], [48, 'maj']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar];
        const n = CHORD[type];
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            if (b === 0 || b === 2) T.voice(t, 0.3, midi(root - 12), 0.4, 6, { wave: sine, lp: 0.4 });   // tuba
            // Pizzicato oom-pah-pah.
            const off = b === 0 ? 0 : 0;
            for (let k = 0; k < 2; k++) {
                const tt = t + (k + 1) * T.beat * 0.5 - off * 0;
                if (tt >= (bar * 4 + 4) * T.beat) continue;
                T.pluck(tt, midi(root + 12 + n[(k + b) % n.length]), 0.14, 14, { dur: 0.22, lp: 0.6 });
            }
            T.hat(t + T.beat * 0.5, 0.05);
            if (b === 1 || b === 3) T.noise(t, 0.05, 0.1, 60, 0.5);   // woodblock-ish
        }
        if (bar % 4 === 3) for (let s = 0; s < 4; s++) T.pluck((bar * 4 + 3 + s * 0.25) * T.beat, midi(root + 12 + n[s % n.length] + 12), 0.1, 16, { dur: 0.15 });
    }
    return T.render();
}

// Driving minor action: 8th bass, four-on-floor, tense stabs.
function musicAction() {
    const T = new Track(144, 8, 57);
    const prog = [[40, 'min'], [36, 'maj'], [40, 'min'], [38, 'maj'], [40, 'min'], [36, 'maj'], [38, 'maj'], [38, 'dom7']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar];
        for (let s = 0; s < 8; s++) {
            const t = (bar * 4 + s / 2) * T.beat;
            T.voice(t, T.beat * 0.46, midi(root - 12) * (s % 4 === 3 ? 1.06 : 1), 0.3, 9, { wave: sqr, lp: 0.16 });
            T.hat(t, s % 2 ? 0.06 : 0.1);
        }
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            T.kick(t, b % 2 === 0 ? 0.8 : 0.5);
            if (b === 1 || b === 3) T.snare(t, 0.34);
        }
        if (bar % 2 === 0) {
            const t = bar * 4 * T.beat;
            for (const iv of CHORD[type]) T.voice(t, 1.1, midi(root + iv), 0.07, 3.2, { wave: saw, lp: 0.1, attack: 0.01 });
        }
    }
    return T.render();
}

// A breathing dissonant drone with distant glissandi for horrors.
function musicHorror() {
    const T = new Track(50, 4, 69);
    const bars = T.bars, L = T.bars * 4 * T.beat;
    const f0 = midi(38);
    T.voice(0, L, f0, 0.22, 0.05, { wave: sine, attack: 1.2, vib: 0.004, vibHz: 0.3 });
    T.voice(0, L, f0 * 1.005, 0.18, 0.05, { wave: sine, attack: 1.6, vib: 0.006, vibHz: 0.22 });
    T.voice(0, L, f0 * 1.498, 0.1, 0.05, { wave: saw, lp: 0.04, attack: 2.2 });
    T.voice(0, L, midi(39), 0.06, 0.05, { wave: tri, lp: 0.05, attack: 2.8 });   // the wrong note
    for (let b = 0; b < bars; b += 2) {
        const t = b * 4 * T.beat + T.beat;
        const hi = midi(74 + (b % 4));
        T.voice(t, 2.6, (u) => hi * (1 + 0.5 * u / 2.6), 0.05, 1.1, { wave: sine, attack: 0.9, vib: 0.02, vibHz: 6.5 });
    }
    // A slow heartbeat.
    for (let b = 0; b < bars * 2; b++) {
        const t = b * 2 * T.beat;
        T.kick(t, 0.3);
        T.kick(t + 0.28, 0.18);
    }
    return T.render();
}

// Arpeggiated synths with echo for sci-fi.
function musicScifi() {
    const T = new Track(128, 8, 81);
    const prog = [[36, 'min'], [32, 'maj'], [39, 'maj'], [34, 'maj']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar % 4];
        const n = CHORD[type];
        for (let s = 0; s < 16; s++) {
            const t = (bar * 4 + s / 4) * T.beat;
            const f = midi(root + 12 + n[s % n.length] + (s % 8 >= 4 ? 12 : 0));
            T.voice(t, 0.2, f, 0.1, 10, { wave: (p) => 0.7 * sqr(p) + 0.3 * sine(p), lp: 0.35 });
            T.voice(t + T.beat * 0.375, 0.2, f, 0.045, 10, { wave: sqr, lp: 0.25 });   // echo
            T.voice(t + T.beat * 0.75, 0.2, f, 0.02, 10, { wave: sqr, lp: 0.2 });
        }
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            T.voice(t, T.beat * 0.9, midi(root - 12), 0.26, 5, { wave: saw, lp: 0.12 });
            if (b % 2 === 1) T.noise(t + T.beat * 0.5, 0.03, 0.07, 120, 0.9);
        }
        if (bar % 4 === 0) T.pad(bar, root + 12, type, 0.06, { attack: 0.4, lp: 0.1 });
    }
    return T.render();
}

// Warm slow chords and a soft arpeggio for romance.
// Noir: a brushed kit, a walked double bass and a lonely trumpet in the rain.
function musicNoir() {
    const T = new Track(84, 4, 77);
    const prog = [[41, 'min7'], [44, 'dom7'], [39, 'min7'], [46, 'dom7']];
    for (let bar = 0; bar < 4; bar++) {
        const [root, type] = prog[bar];
        const n = CHORD[type];
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            T.voice(t, 0.9 * T.beat, midi(root - 12 + n[b % n.length] - (b === 3 ? 1 : 0)), 0.3, 5, { wave: tri, lp: 0.25 });  // walked bass
            T.hat(t + T.beat * 0.5, 0.035);                                       // brushes
            if (b === 1 || b === 3) T.noise(t + T.beat * 0.5, 0.09, 0.05, 40, 0.35);
        }
        // The trumpet line: three notes, then silence that does the talking.
        if (bar % 2 === 1) {
            const line = [root + 12, root + 15, root + 11];
            for (let k = 0; k < 3; k++) {
                T.voice((bar * 4 + k * 1.5) * T.beat, 1.4 * T.beat, midi(line[k]), 0.11, 2.2,
                    { wave: saw, lp: 0.12, attack: 0.06, vib: 0.012, vibHz: 5.2 });
            }
        }
        T.pad(bar, root, type, 0.07, { attack: 0.8, lp: 0.06 });
    }
    // Rain on the window: a thin filtered noise bed.
    for (let t = 0; t < T.bars * 4 * T.beat; t += 0.5 * T.beat) T.noise(t, 0.4 * T.beat, 0.02, 30, 0.12);
    return T.render();
}

// Musical: a bright stride piano, handclaps and a section of sustained thirds.
function musicMusical() {
    const T = new Track(138, 8, 88);
    const prog = [[48, 'maj'], [55, 'dom7'], [45, 'min7'], [53, 'maj'], [41, 'min7'], [46, 'dom7'], [50, 'dom7'], [48, 'maj']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar];
        const n = CHORD[type];
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            // Stride: low note on the beat, chord off it.
            T.voice(t, 0.25 * T.beat, midi(root - 12), 0.3, 8, { wave: sine, lp: 0.5 });
            for (let k = 0; k < 3; k++) {
                T.pluck(t + T.beat * 0.5, midi(root + 12 + n[(k + b) % n.length]), 0.09, 10, { dur: 0.3, lp: 0.7 });
            }
            T.hat(t + T.beat * 0.5, 0.05);
            if (b === 1 || b === 3) T.snare(t, 0.06);
            if (b === 3) T.noise(t + T.beat * 0.75, 0.05, 0.08, 50, 0.4);   // handclap
        }
        // The section: sustained thirds that lift the last two bars.
        if (bar >= 6) {
            T.voice(bar * 4 * T.beat, 4 * T.beat, midi(root + 12), 0.09, 1.5, { wave: tri, lp: 0.3, attack: 0.2 });
            T.voice(bar * 4 * T.beat, 4 * T.beat, midi(root + 16), 0.08, 1.5, { wave: tri, lp: 0.3, attack: 0.25 });
        }
    }
    return T.render();
}

// War: a field drum, a low brass chorale and a distant rumble that never quite arrives.
function musicWar() {
    const T = new Track(96, 4, 91);
    const prog = [[38, 'min'], [36, 'min'], [41, 'min'], [43, 'dom7']];
    for (let bar = 0; bar < 4; bar++) {
        const [root, type] = prog[bar];
        const n = CHORD[type];
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            T.snare(t, b % 2 === 0 ? 0.12 : 0.07);                       // field drum
            if (b === 3) T.snare(t + T.beat * 0.5, 0.09);
            T.voice(t, 0.9 * T.beat, midi(root - 12 + n[b % n.length]), 0.26, 4, { wave: tri, lp: 0.2 });
        }
        // The chorale: three low voices, a half-step of wrongness on the last bar.
        for (let k = 0; k < 3; k++) {
            T.voice(bar * 4 * T.beat, 4 * T.beat, midi(root + n[k % n.length] + (bar === 3 && k === 2 ? 1 : 0)),
                0.07, 1.2, { wave: saw, lp: 0.08, attack: 0.6 });
        }
    }
    // Distant rumble: filtered noise swells between bars.
    for (let bar = 0; bar < 4; bar++) T.noise(bar * 4 * T.beat, 2.2 * T.beat, 0.05, 12, 0.06);
    return T.render();
}

// Adventure: a 6/8 driving pluck, a brass fanfare and a tambourine on the push.
function musicAdventure() {
    const T = new Track(120, 8, 95);
    const prog = [[45, 'min'], [50, 'maj'], [43, 'maj'], [52, 'dom7'], [45, 'min'], [48, 'maj'], [43, 'maj'], [45, 'min']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar];
        const n = CHORD[type];
        for (let e = 0; e < 6; e++) {
            const t = (bar * 4 + e * 2 / 3) * T.beat;
            T.pluck(t, midi(root + 12 + n[e % n.length]), 0.11, 12, { dur: 0.26, lp: 0.5 });
            if (e % 3 === 0) T.voice(t, 0.5 * T.beat, midi(root - 12), 0.3, 6, { wave: sine, lp: 0.35 });
        }
        if (bar % 4 === 3) T.hat((bar * 4 + 2) * T.beat, 0.07);
        // The fanfare on bars 4-5: three rising brass notes.
        if (bar === 4 || bar === 5) {
            const line = [root + 12, root + 19, root + 24];
            for (let k = 0; k < 3; k++) {
                T.voice((bar * 4 + k * 1.25) * T.beat, 1.1 * T.beat, midi(line[k]), 0.1, 2,
                    { wave: saw, lp: 0.16, attack: 0.04 });
            }
        }
    }
    return T.render();
}

function musicRomance() {
    const T = new Track(76, 4, 93);
    const prog = [[50, 'maj7'], [47, 'min7'], [43, 'maj7'], [45, 'dom7']];
    for (let bar = 0; bar < 4; bar++) {
        const [root, type] = prog[bar];
        T.pad(bar, root, type, 0.12, { attack: 0.5, lp: 0.08 });
        T.voice(bar * 4 * T.beat, 4 * T.beat, midi(root - 12), 0.24, 0.6, { wave: sine, lp: 0.2, attack: 0.15 });
        const n = CHORD[type];
        for (let s = 0; s < 8; s++) {
            const t = (bar * 4 + s / 2) * T.beat;
            T.pluck(t, midi(root + 12 + n[(s * 2 + bar) % n.length]), 0.07, 5, { dur: 0.8, lp: 0.2 });
        }
    }
    return T.render();
}

// Boom-chick plucks and a wailing harmonica for westerns.
function musicWestern() {
    const T = new Track(96, 8, 105);
    const prog = [[38, 'maj'], [43, 'maj'], [45, 'dom7'], [38, 'maj'], [38, 'maj'], [43, 'maj'], [45, 'dom7'], [38, 'maj']];
    for (let bar = 0; bar < 8; bar++) {
        const [root, type] = prog[bar];
        for (let b = 0; b < 4; b++) {
            const t = (bar * 4 + b) * T.beat;
            if (b % 2 === 0) { T.voice(t, 0.28, midi(root - 12), 0.36, 8, { wave: tri, lp: 0.3 }); T.kick(t, 0.3); }
            else {
                for (const iv of [7, 12]) T.pluck(t, midi(root + iv), 0.1, 12, { dur: 0.24, lp: 0.5 });
            }
        }
        // Harmonica-ish sustained line with a bend.
        if (bar % 2 === 1) {
            const n = CHORD[type];
            const f = midi(root + 12 + n[bar % n.length]);
            T.voice(bar * 4 * T.beat, T.beat * 3.4, (t) => f * (1 + 0.02 * Math.min(1, t)), 0.09, 1.2, { wave: (p) => 0.6 * sine(p) + 0.4 * sqr(p), lp: 0.2, attack: 0.08, vib: 0.012, vibHz: 5 });
        }
    }
    return T.render();
}

// --- SFX ----------------------------------------------------------------------------------

// A soft UI click: a 50 ms filtered blip, quiet enough to live under everything.
function sfxClick() {
    const o = buf(0.05), lp = lowpass(0.7);
    const rnd = noise(11);
    for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        const env = Math.exp(-t * 180);
        o[i] = lp(Math.sin(2 * Math.PI * 1500 * t) * 0.5 + rnd() * 0.22) * env;
    }
    return o;
}

function sfxCut() {                                     // a camera-cut whoosh
    const o = buf(0.32), lp = lowpass(0.5);
    const rnd = noise(5);
    for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        const env = Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 2;
        o[i] = lp(rnd()) * env * 0.7 * (1 - t * 1.8 > 0 ? 1 - t * 1.8 : 0.05);
    }
    return o;
}

function sfxGunshot() {
    const o = buf(0.4);
    noiseBurst(o, 0, 0.3, 0.95, 26, 0.55, 11);
    tone(o, 0, 0.25, (t) => 95 * Math.exp(-t * 14) + 42, 0.8, 22, {});
    noiseBurst(o, 0.01, 0.38, 0.3, 7, 0.12, 12);
    return o;
}

function sfxPunch() {
    const o = buf(0.22);
    tone(o, 0, 0.2, (t) => 72 * Math.exp(-t * 10) + 38, 0.95, 30, {});
    noiseBurst(o, 0, 0.1, 0.5, 40, 0.3, 13);
    return o;
}

function sfxSword() {
    const o = buf(0.55);
    noiseBurst(o, 0, 0.05, 0.4, 60, 0.9, 14);
    tone(o, 0.01, 0.5, 2160, 0.16, 9, { wave: sine });
    tone(o, 0.01, 0.5, 3230, 0.12, 11, { wave: sine });
    tone(o, 0.02, 0.44, 4510, 0.08, 13, { wave: sine });
    return o;
}

function sfxDoor() {
    const o = buf(0.28);
    tone(o, 0, 0.24, (t) => 58 * Math.exp(-t * 6) + 40, 0.9, 18, {});
    noiseBurst(o, 0, 0.05, 0.35, 70, 0.5, 15);
    return o;
}

function sfxThunder() {
    const o = buf(1.9);
    const lp = lowpass(0.035), rnd = noise(16);
    for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        const env = Math.min(1, t / 0.12) * Math.exp(-t * 2.2) * (0.7 + 0.3 * Math.sin(t * 9));
        o[i] = lp(rnd()) * env * 1.4;
    }
    tone(o, 0.02, 1.6, 41, 0.35, 2.4, { wave: sine });
    return o;
}

function sfxTypewriter() {
    const o = buf(0.1);
    noiseBurst(o, 0, 0.03, 0.5, 260, 0.8, 17);
    tone(o, 0, 0.05, 1850, 0.15, 180, { wave: tri });
    return o;
}

function sfxClapper() {                                  // the clapperboard: two woody smacks
    const o = buf(0.3);
    noiseBurst(o, 0, 0.05, 0.7, 130, 0.5, 18);
    tone(o, 0, 0.09, 320, 0.3, 60, { wave: tri });
    noiseBurst(o, 0.16, 0.06, 0.8, 110, 0.5, 19);
    tone(o, 0.16, 0.12, 240, 0.4, 45, { wave: tri });
    return o;
}

function sfxCash() {
    const o = buf(0.8);
    tone(o, 0, 0.6, 1318, 0.28, 5.5, { wave: sine });
    tone(o, 0.11, 0.62, 1760, 0.3, 5, { wave: sine });
    tone(o, 0.11, 0.5, 2637, 0.1, 7, { wave: sine });
    noiseBurst(o, 0, 0.02, 0.1, 300, 0.9, 20);
    return o;
}

function sfxPhone() {
    const o = buf(1.1);
    for (const t0 of [0, 0.45]) {
        tone(o, t0, 0.34, 440, 0.2, 3, { wave: sine, attack: 0.01 });
        tone(o, t0, 0.34, 480, 0.2, 3, { wave: sine, attack: 0.01 });
    }
    return o;
}

function sfxApplause() {
    const o = buf(3.4);
    const rnd = noise(21);
    for (let c = 0; c < 190; c++) {
        const t0 = rnd() * 3.1;
        const g = 0.05 + Math.abs(rnd()) * 0.1;
        const env = Math.min(1, (3.2 - t0) / 0.8);
        noiseBurst(o, t0, 0.035, g * env, 120, 0.55, 100 + c);
    }
    // A broad crowd bed under the claps.
    const lp = lowpass(0.2), r2 = noise(22);
    for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        const env = Math.min(1, t / 0.25) * Math.min(1, (3.3 - t) / 0.9);
        o[i] += lp(r2()) * 0.09 * env;
    }
    return o;
}

function sfxLaugh() {                                    // a crowd chuckle: ha-ha bursts
    const o = buf(2.1);
    const rnd = noise(23);
    for (let v = 0; v < 9; v++) {
        const off = rnd() * 0.5;
        const f = 260 + rnd() * 340;
        for (let h = 0; h < 4; h++) {
            const t0 = off + h * (0.17 + rnd() * 0.06);
            if (t0 > 1.75) continue;
            const g = 0.05 + Math.abs(rnd()) * 0.05;
            tone(o, t0, 0.14, (t) => f * (1 - 0.12 * t / 0.14), g, 22, { wave: (p) => 0.5 * sine(p) + 0.5 * tri(p), lp: 0.16, attack: 0.02, vib: 0.03, vibHz: 7 + v });
            noiseBurst(o, t0, 0.1, g * 0.5, 30, 0.14, 200 + v * 10 + h);
        }
    }
    return o;
}

function sfxGasp() {
    const o = buf(0.95);
    const rnd = noise(24);
    let lpY = 0;
    for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        const k = 0.06 + 0.22 * Math.min(1, t / 0.4);
        lpY += k * (rnd() - lpY);
        const env = Math.sin(Math.PI * Math.min(1, t / 0.85)) ** 1.4;
        o[i] = lpY * env * 0.85;
    }
    return o;
}

function sfxCarhorn() {
    const o = buf(0.85);
    for (const t0 of [0, 0.42]) {
        tone(o, t0, 0.36, 311, 0.3, 1.4, { wave: (p) => 0.7 * sqr(p) + 0.3 * sine(p), lp: 0.25, attack: 0.015 });
        tone(o, t0, 0.36, 415, 0.24, 1.4, { wave: (p) => 0.7 * sqr(p) + 0.3 * sine(p), lp: 0.25, attack: 0.015 });
    }
    return o;
}

function sfxHooves() {
    const o = buf(1.15);
    let t = 0.02;
    for (let i = 0; i < 5; i++) {
        tone(o, t, 0.1, (u) => 84 * Math.exp(-u * 22) + 48, 0.7, 42, {});
        noiseBurst(o, t, 0.05, 0.3, 90, 0.25, 30 + i);
        t += i % 2 === 0 ? 0.26 : 0.2;
    }
    return o;
}

function sfxGlass() {
    const o = buf(0.6);
    noiseBurst(o, 0, 0.09, 0.6, 32, 0.85, 31);
    const rnd = noise(32);
    for (let i = 0; i < 26; i++) {
        const t0 = 0.02 + rnd() * 0.4;
        tone(o, t0, 0.1, 2400 + rnd() * 3600, 0.06 + Math.abs(rnd()) * 0.07, 90 + rnd() * 80, { wave: sine });
    }
    return o;
}

function sfxExplosion() {
    const o = buf(1.1);
    tone(o, 0, 0.9, (t) => 62 * Math.exp(-t * 5) + 24, 1.0, 4.2, { wave: sine });
    noiseBurst(o, 0, 0.85, 0.9, 4.5, 0.06, 33);
    noiseBurst(o, 0, 0.12, 0.7, 40, 0.6, 34);
    const rnd = noise(35);
    for (let i = 0; i < 14; i++) noiseBurst(o, 0.25 + rnd() * 0.7, 0.06, 0.06 + Math.abs(rnd()) * 0.08, 50, 0.3, 300 + i);
    return o;
}

function sfxLaser() {
    const o = buf(0.34);
    tone(o, 0, 0.3, (t) => 1500 * Math.exp(-t * 7) + 160, 0.4, 9, { wave: (p) => 0.6 * sine(p) + 0.4 * sqr(p), lp: 0.5 });
    tone(o, 0, 0.22, (t) => 3000 * Math.exp(-t * 8) + 300, 0.12, 12, { wave: sine });
    return o;
}

function sfxKiss() {
    const o = buf(0.3);
    const rnd = noise(36), lp = lowpass(0.1);
    for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        const env = Math.sin(Math.PI * Math.min(1, t / 0.22)) ** 3;
        o[i] = lp(rnd()) * env * 0.9;
    }
    tone(o, 0.02, 0.12, 190, 0.12, 22, { wave: sine });
    return o;
}

function sfxProjector() {                                // a seamless 2 s projector rumble
    const base = loopedNoise(2, 41, 0.09, 0.5);
    const o = new Float64Array(base.length);
    o.set(base);
    const per = Math.round(base.length / 9);
    for (let k = 0; k < 9; k++) {
        const t0 = (k * per) / RATE;
        noiseBurst(o, t0, 0.02, 0.16, 210, 0.6, 42 + k);
    }
    return o;
}

function sfxStingHit() {                                 // a hit film: ta-da!
    const o = buf(1.4);
    const notes = [523, 659, 784];
    notes.forEach((f, i) => tone(o, 0.06 * i, 1.1, f, 0.24, 2.6, { wave: (p) => 0.7 * tri(p) + 0.3 * sine(p), lp: 0.4, attack: 0.01 }));
    tone(o, 0.18, 1.15, 1046, 0.16, 2.4, { wave: tri, lp: 0.5, attack: 0.01 });
    noiseBurst(o, 0, 0.5, 0.05, 8, 0.3, 43);
    return o;
}

function sfxStingFlop() {                                // a flop: the sad slide
    const o = buf(1.6);
    tone(o, 0, 1.5, (t) => 392 * Math.exp(-t * 0.85) * (1 - 0.05 * t), 0.26, 1.5, { wave: (p) => 0.6 * saw(p) + 0.4 * sine(p), lp: 0.14, attack: 0.05, vib: 0.015, vibHz: 4.5 });
    tone(o, 0.02, 1.4, 196, 0.18, 1.6, { wave: sine, attack: 0.06 });
    return o;
}

function sfxStingAward() {                               // the award fanfare
    const o = buf(2.6);
    const seq = [[0, 392], [0.16, 523], [0.32, 659], [0.48, 784], [0.72, 1046]];
    for (const [t0, f] of seq) {
        tone(o, t0, 1.7, f, 0.2, 1.9, { wave: (p) => 0.65 * tri(p) + 0.35 * sine(p), lp: 0.4, attack: 0.012 });
    }
    tone(o, 0.72, 1.9, 196, 0.14, 1.6, { wave: saw, lp: 0.1, attack: 0.02 });
    for (let k = 0; k < 3; k++) tone(o, 0.72 + k * 0.01, 1.2, 110 * (1 + k * 0.5), 0.3 - k * 0.08, 5, { wave: sine });
    const rnd = noise(44);
    for (let i = 0; i < 30; i++) tone(o, 0.8 + rnd() * 1.4, 0.3, 2000 + rnd() * 4000, 0.02 + Math.abs(rnd()) * 0.03, 12, { wave: sine });
    return o;
}

// --- the registry ------------------------------------------------------------------------------

function buildMovieSounds() {
    return {
        // music loops
        'music_studio.wav': writeWav(musicStudio()),
        'music_drama.wav': writeWav(musicDrama()),
        'music_comedy.wav': writeWav(musicComedy()),
        'music_action.wav': writeWav(musicAction()),
        'music_horror.wav': writeWav(musicHorror()),
        'music_scifi.wav': writeWav(musicScifi()),
        'music_romance.wav': writeWav(musicRomance()),
        'music_western.wav': writeWav(musicWestern()),
        'music_noir.wav': writeWav(musicNoir()),
        'music_musical.wav': writeWav(musicMusical()),
        'music_war.wav': writeWav(musicWar()),
        'music_adventure.wav': writeWav(musicAdventure()),
        // sfx
        'click.wav': writeWav(sfxClick()),
        'cut.wav': writeWav(sfxCut()),
        'gunshot.wav': writeWav(sfxGunshot()),
        'punch.wav': writeWav(sfxPunch()),
        'sword.wav': writeWav(sfxSword()),
        'door.wav': writeWav(sfxDoor()),
        'thunder.wav': writeWav(sfxThunder()),
        'typewriter.wav': writeWav(sfxTypewriter()),
        'clapper.wav': writeWav(sfxClapper()),
        'cash.wav': writeWav(sfxCash()),
        'phone.wav': writeWav(sfxPhone()),
        'applause.wav': writeWav(sfxApplause()),
        'laugh.wav': writeWav(sfxLaugh()),
        'gasp.wav': writeWav(sfxGasp()),
        'carhorn.wav': writeWav(sfxCarhorn()),
        'hooves.wav': writeWav(sfxHooves()),
        'glass.wav': writeWav(sfxGlass()),
        'explosion.wav': writeWav(sfxExplosion()),
        'laser.wav': writeWav(sfxLaser()),
        'kiss.wav': writeWav(sfxKiss()),
        'projector.wav': writeWav(sfxProjector()),
        'sting_hit.wav': writeWav(sfxStingHit()),
        'sting_flop.wav': writeWav(sfxStingFlop()),
        'sting_award.wav': writeWav(sfxStingAward()),
    };
}

export { buildMovieSounds, OUT_DIR };

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
    const sounds = buildMovieSounds(), check = process.argv.includes('--check');
    let differs = false;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, bytes] of Object.entries(sounds)) {
        const file = path.join(OUT_DIR, name);
        if (check) {
            const same = fs.existsSync(file) && fs.readFileSync(file).equals(bytes);
            if (!same) console.log(name + ' differs from the generator');
            differs = differs || !same;
        } else {
            fs.writeFileSync(file, bytes);
            console.log(`assets/sounds/${name}: ${bytes.length} bytes, ${((bytes.length - 44) / 2 / RATE).toFixed(2)} s`);
        }
    }
    if (check) { console.log(differs ? 'make-movie-sounds: files differ' : 'make-movie-sounds: up to date'); process.exit(differs ? 1 : 0); }
    console.log('make-movie-sounds: ' + Object.keys(sounds).length + ' files written.');
}
