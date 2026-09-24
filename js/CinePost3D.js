// CinePost3D.js — the post-processing frame (pc.CameraFrame, PlayCanvas 2): the cinema look of
// the whole game. ACES tone mapping over an HDR buffer, bloom on practicals, SSAO contact
// shadows, vignette, fringing, volumetric haze — and a PROCEDURAL COLOR LUT baked on the fly:
// genre × era × hour of day (noir is a cold-shadow monochrome, a musical is Technicolor, the
// 70s are faded stock, a night scene is blue and glowing). Four quality presets (low — post
// off, medium, high, ultra — TAA + volumetric fog), the choice lives in the store (fg.gfx).
//
// This is an engine-layer module like SetPieces3D: it knows numbers and pc objects, not game
// meaning — the genre, the era and the hour arrive from MovieSequencer (setCinema) and the lot
// gets the neutral studio grade (setStudio). The pure half (STYLES, styleFor, gradeFor,
// lutBytes) runs without the engine and is covered by tests/fabrika-graphics.test.mjs.
//
// The LUT contract of the engine (composeColorLutPS): a 256×16 horizontal strip — an unwrapped
// 16×16×16 cube in the Unreal layout (16 slices along blue, red → X, green → Y), sRGB-encoded
// bytes, indexed by the sRGB-encoded tonemapped color, sampled bilinearly, mipmaps off.

/** @satisfies {Record<string, any>} */
const CinePost3D = {
    /** 0 low (post off) · 1 medium · 2 high · 3 ultra. */
    quality: -1,
    /** @type {any} the pc.CameraFrame of the active view (null when unsupported). */
    frame: null,
    /** @type {any} the View3D the frame hangs on. */
    view: null,
    /** The grade in force (gradeFor result) — reapplied when the preset changes. */
    _grade: null,
    /** LUT texture cache: lutKey → pc.Texture. */
    _luts: {},
    _adaptScale: 1,
    _tickT: 0,
    _warmT: 0,

    // --- constants (all numbers live in Constants.js; read with defaults) --------------------

    cfg() {
        const U = 'undefined';
        return {
            qualityDefault: typeof GFX_QUALITY_DEFAULT !== U ? GFX_QUALITY_DEFAULT : 2,
            tonemap: typeof POSTFX_TONEMAP !== U ? POSTFX_TONEMAP : 4,
            bloomDay: typeof POSTFX_BLOOM_DAY !== U ? POSTFX_BLOOM_DAY : 0.01,
            bloomNight: typeof POSTFX_BLOOM_NIGHT !== U ? POSTFX_BLOOM_NIGHT : 0.035,
            vignette: typeof POSTFX_VIGNETTE !== U ? POSTFX_VIGNETTE : 0.32,
            fringing: typeof POSTFX_FRINGING !== U ? POSTFX_FRINGING : 6,
            ssaoType: typeof POSTFX_SSAO_TYPE !== U ? POSTFX_SSAO_TYPE : 2,
            ssaoIntensity: typeof POSTFX_SSAO_INTENSITY !== U ? POSTFX_SSAO_INTENSITY : 0.5,
            ssaoRadius: typeof POSTFX_SSAO_RADIUS !== U ? POSTFX_SSAO_RADIUS : 24,
            lutIntensity: typeof POSTFX_LUT_INTENSITY !== U ? POSTFX_LUT_INTENSITY : 1,
            exposureNight: typeof POSTFX_EXPOSURE_NIGHT !== U ? POSTFX_EXPOSURE_NIGHT : 0.92,
            fogNight: typeof POSTFX_FOG_NIGHT !== U ? POSTFX_FOG_NIGHT : 0.005,
            fogWar: typeof POSTFX_FOG_WAR !== U ? POSTFX_FOG_WAR : 0.004,
            sharpness: typeof POSTFX_SHARPNESS !== U ? POSTFX_SHARPNESS : 0.55,
            adaptive: typeof POSTFX_ADAPTIVE !== U ? POSTFX_ADAPTIVE : 1,
        };
    },

    // --- the looks (pure data) -----------------------------------------------------------------

    /**
     * LUT bake styles per genre: sat — saturation multiplier, mono — blend toward luma,
     * contrast — around mid gray, lift — raised blacks, fade — faded-stock black lift,
     * splitS/splitH — split-tone added to shadows/highlights (per channel, display space).
     */
    STYLES: {
        neutral: {},
        noir: { sat: 0.2, mono: 0.88, contrast: 1.3, fade: 0.02, splitS: [0.01, 0.02, 0.05], splitH: [0.05, 0.04, 0.02] },
        musical: { sat: 1.4, contrast: 1.05, splitH: [0.07, 0.025, -0.01], splitS: [-0.01, 0.01, 0.04] },
        war: { sat: 0.55, contrast: 1.16, fade: 0.04, splitS: [0.0, 0.02, 0.03], splitH: [0.035, 0.035, 0.02] },
        western: { sat: 0.95, contrast: 1.08, fade: 0.03, splitH: [0.07, 0.035, -0.02], splitS: [0.02, 0.01, -0.01] },
        action: { sat: 1.1, contrast: 1.2, splitS: [-0.015, 0.015, 0.05], splitH: [0.06, 0.025, -0.02] },
        comedy: { sat: 1.12, contrast: 0.97, lift: 0.05, fade: 0.05 },
        drama: { sat: 0.92, contrast: 1.05, splitS: [0.01, 0.01, 0.02] },
        horror: { sat: 0.6, contrast: 1.32, splitS: [-0.01, 0.03, 0.02], splitH: [0.02, 0.05, 0.015] },
        scifi: { sat: 0.95, contrast: 1.12, splitS: [-0.01, 0.02, 0.05], splitH: [0.015, 0.035, 0.06] },
        romance: { sat: 1.08, contrast: 0.97, lift: 0.04, splitH: [0.065, 0.025, 0.03], splitS: [0.03, 0.005, 0.015] },
        adventure: { sat: 1.2, contrast: 1.08, splitH: [0.05, 0.03, -0.005], splitS: [-0.005, 0.02, 0.03] },
    },

    /**
     * Merge the genre look with the era stock and the hour of day into LUT bake parameters.
     * @param {string | null} genreId one of MovieData.GENRES (null — the neutral studio lot)
     * @param {string | null} era 'era-silver' | 'era-color' | 'era-clean' (MovieSequencer.eraClass)
     * @param {string | null} tod 'day' | 'sunset' | 'night'
     */
    styleFor(genreId, era, tod) {
        const base = this.STYLES[genreId || 'neutral'] || this.STYLES.neutral;
        const st = {
            sat: base.sat != null ? base.sat : 1,
            contrast: base.contrast != null ? base.contrast : 1,
            fade: base.fade || 0,
            lift: base.lift || 0,
            mono: base.mono || 0,
            splitS: (base.splitS || [0, 0, 0]).slice(),
            splitH: (base.splitH || [0, 0, 0]).slice(),
        };
        // The stock of the decade: silver is warm and contrasty, color stock of the 60–70s faded.
        if (era === 'era-silver') {
            st.sat *= 0.82; st.contrast *= 1.05; st.fade += 0.06;
            st.splitH[0] += 0.03; st.splitH[1] += 0.012; st.splitH[2] -= 0.01;
        } else if (era === 'era-color') {
            st.sat *= 0.95; st.fade += 0.1;
            st.splitH[0] += 0.035; st.splitH[1] += 0.01; st.splitH[2] -= 0.015;
        }
        // The hour: a cold blue night, a golden sunset.
        if (tod === 'night') {
            st.contrast *= 1.05; st.splitS[1] += 0.012; st.splitS[2] += 0.04;
        } else if (tod === 'sunset') {
            st.splitH[0] += 0.04; st.splitH[1] += 0.015;
        }
        return st;
    },

    /**
     * The full post grade for a moment of the game: LUT bake parameters + the frame numbers.
     * genreId null — the studio lot: a clean neutral picture with a soft vignette.
     * @param {string | null} genreId
     * @param {string | null} era
     * @param {string | null} tod
     */
    gradeFor(genreId, era, tod) {
        const c = this.cfg();
        const night = tod === 'night', sunset = tod === 'sunset';
        const cinema = !!genreId;
        const k = night ? 1 : (sunset ? 0.5 : 0);
        const grade = {
            lutKey: (genreId || 'studio') + '|' + (era || 'era-clean') + '|' + (tod || 'day'),
            lut: (cinema || era) ? this.styleFor(genreId, cinema ? era : null, tod) : null,
            lutIntensity: cinema ? c.lutIntensity : 0,
            brightness: night ? c.exposureNight : (sunset ? 0.97 : 1),
            contrast: 1,
            saturation: 1,
            bloom: c.bloomDay + (c.bloomNight - c.bloomDay) * k,
            vignette: c.vignette * (cinema ? 1 : 0.55) * (night ? 1.2 : 1),
            fringing: cinema ? c.fringing + (era === 'era-silver' ? 4 : 0) : Math.round(c.fringing * 0.5),
            fog: night ? c.fogNight : ((genreId === 'war' || genreId === 'horror') ? c.fogWar : 0),
            toneMapping: c.tonemap,
        };
        return grade;
    },

    /**
     * Bake the LUT bytes (pure — no engine): a 256×16 strip of a 16³ cube, Unreal layout
     * (blue slices along X, red → X inside a slice, green → Y), sRGB-encoded display values.
     * @param {{ sat?: number, contrast?: number, fade?: number, lift?: number, mono?: number, splitS?: number[], splitH?: number[] }} st
     * @returns {Uint8Array}
     */
    lutBytes(st) {
        const N = 16, W = N * N;
        const out = new Uint8Array(W * N * 4);
        const sat = st.sat != null ? st.sat : 1;
        const contrast = st.contrast != null ? st.contrast : 1;
        const fade = st.fade || 0, lift = st.lift || 0, mono = st.mono || 0;
        const sS = st.splitS || [0, 0, 0], sH = st.splitH || [0, 0, 0];
        const enc = (v) => {
            const c = v < 0 ? 0 : (v > 1 ? 1 : v);
            return Math.round(255 * Math.pow(c, 1 / 2.2));
        };
        let p = 0;
        for (let ig = 0; ig < N; ig++) {                 // Y — green
            const g = ig / (N - 1);
            for (let ib = 0; ib < N; ib++) {             // slice — blue
                const b = ib / (N - 1);
                for (let ir = 0; ir < N; ir++) {         // X — red
                    const r = ir / (N - 1);
                    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    // saturation, then the monochrome blend (noir keeps a warm silver, not a flat gray)
                    let cr = lum + (r - lum) * sat, cg = lum + (g - lum) * sat, cb = lum + (b - lum) * sat;
                    if (mono > 0) {
                        cr += (lum - cr) * mono; cg += (lum - cg) * mono; cb += (lum - cb) * mono;
                    }
                    // contrast around mid gray
                    cr = (cr - 0.5) * contrast + 0.5;
                    cg = (cg - 0.5) * contrast + 0.5;
                    cb = (cb - 0.5) * contrast + 0.5;
                    // split tone: the tint of the shadows and of the highlights by luma weight
                    const wS = 1 - lum;
                    cr += sS[0] * wS + sH[0] * lum;
                    cg += sS[1] * wS + sH[1] * lum;
                    cb += sS[2] * wS + sH[2] * lum;
                    // lifted blacks (a print that has seen a hundred projectors)
                    if (lift > 0) { cr += lift * (1 - cr); cg += lift * (1 - cg); cb += lift * (1 - cb); }
                    // faded stock: blacks rise, whites hold
                    if (fade > 0) {
                        cr = cr + (0.84 * cr + 0.16 - cr) * fade;
                        cg = cg + (0.84 * cg + 0.16 - cg) * fade;
                        cb = cb + (0.84 * cb + 0.16 - cb) * fade;
                    }
                    out[p++] = enc(cr); out[p++] = enc(cg); out[p++] = enc(cb); out[p++] = 255;
                }
            }
        }
        return out;
    },

    // --- the engine half -------------------------------------------------------------------------

    /**
     * Hang the CameraFrame on the view's camera and restore the stored preset. Call once after
     * the view exists (main.js). Returns false when the engine cannot post-process here.
     * @param {any} view View3D
     */
    attach(view) {
        this.view = view || null;
        if (!view || !view.camComp || typeof pc === 'undefined' || !pc.CameraFrame) {
            console.warn('CinePost3D: CameraFrame недоступен — постобработка выключена');
            return false;
        }
        try {
            this.frame = new pc.CameraFrame(view.app, view.camComp);
        } catch (e) {
            console.warn('CinePost3D: CameraFrame не поднялся', e);
            this.frame = null;
            return false;
        }
        this.setQuality(this.storedQuality());
        this.setStudio();
        return true;
    },

    /** The preset from the store; the first launch on mobile starts one step lower. */
    storedQuality() {
        const c = this.cfg();
        let q = c.qualityDefault;
        let stored = false;
        try {
            const raw = Store.get('fg.gfx');
            if (raw !== null) {
                const v = Number(raw);
                if (Number.isFinite(v)) { q = Math.round(v); stored = true; }
            }
        } catch (e) { /* a closed storage is not a reason to fail the boot */ }
        if (!stored && typeof IS_MOBILE !== 'undefined' && IS_MOBILE) q = Math.max(0, q - 1);
        return Math.max(0, Math.min(3, q));
    },

    /**
     * Switch the preset (0..3) and remember it. Low kills the frame entirely — the old linear
     * pipeline; ultra adds TAA with sharpening and allows the volumetric fog.
     */
    setQuality(q) {
        q = Math.max(0, Math.min(3, Math.round(Number(q) || 0)));
        this.quality = q;
        try { Store.set('fg.gfx', String(q)); } catch (e) { /* never mind */ }
        const f = this.frame;
        if (!f) return;
        const c = this.cfg();
        f.enabled = q > 0;
        if (!f.enabled) { this._adaptScale = 1; return; }
        f.rendering.toneMapping = this._tonemap(c.tonemap);
        f.rendering.samples = q >= 3 ? 1 : (q === 2 ? 4 : 2);   // ultra trades MSAA for TAA
        f.rendering.sharpness = q >= 3 ? c.sharpness : 0;
        f.rendering.renderTargetScale = this._adaptScale;
        f.taa.enabled = q >= 3;
        f.taa.jitter = 1;
        f.ssao.type = q >= 2 ? this._ssaoType(c.ssaoType) : (typeof pc !== 'undefined' ? pc.SSAOTYPE_NONE : 'none');
        f.ssao.intensity = c.ssaoIntensity;
        f.ssao.radius = c.ssaoRadius;
        f.ssao.samples = q >= 3 ? 16 : 12;
        f.ssao.blurEnabled = q < 3;        // ultra: randomized sampling, TAA smooths it out
        f.ssao.randomize = q >= 3;
        this.apply(this._grade || this.gradeFor(null, null, 'day'));
    },

    /** The cinema grade: genre × era stock × the scene's hour (MovieSequencer calls it). */
    setCinema(genreId, era, tod) {
        this.apply(this.gradeFor(genreId || null, era || null, tod || 'day'));
    },

    /** The neutral grade of the studio lot. */
    setStudio() {
        this.apply(this.gradeFor(null, null, 'day'));
    },

    /**
     * Write the grade into the frame. The frame re-reads its settings every rendered frame, so
     * mutating the fields here is enough — no shader recompiles on a grade change.
     */
    apply(g) {
        this._grade = g;
        const f = this.frame;
        if (!f || !f.enabled || !g) return;
        f.rendering.toneMapping = this._tonemap(g.toneMapping);
        f.grading.enabled = true;
        f.grading.brightness = g.brightness;
        f.grading.contrast = g.contrast;
        f.grading.saturation = g.saturation;
        f.bloom.intensity = Math.max(0, Math.min(0.1, g.bloom));
        f.vignette.intensity = Math.max(0, Math.min(1, g.vignette));
        f.vignette.inner = 0.42;
        f.vignette.outer = 1.05;
        f.vignette.curvature = 0.55;
        f.fringing.intensity = Math.max(0, Math.min(100, g.fringing));
        f.colorLUT.texture = g.lut ? this.lutTexture(g.lutKey, g.lut) : null;
        f.colorLUT.intensity = Math.max(0, Math.min(1, g.lut ? g.lutIntensity : 0));
        // The volumetric haze is the most expensive guest — ultra only, night and war only.
        const fog = this.quality >= 3 && g.fog > 0;
        f.volumetricFog.enabled = fog;
        if (fog) {
            const v = this.view;
            f.volumetricFog.light = (v && v.sunEntity && v.sunEntity.light) ? v.sunEntity.light : null;
            f.volumetricFog.density = g.fog;
            f.volumetricFog.maxDistance = 1400;
            f.volumetricFog.steps = 32;
            f.volumetricFog.scale = 0.5;
            f.volumetricFog.heightBase = 0;
            f.volumetricFog.heightFalloff = 0.006;
            f.volumetricFog.anisotropy = 0.5;
            f.volumetricFog.ambientIntensity = 0.12;
        }
    },

    /** The baked (and cached) LUT texture of a grade. */
    lutTexture(key, style) {
        if (this._luts[key]) return this._luts[key];
        const dev = this.view && this.view.app && this.view.app.graphicsDevice;
        if (!dev || typeof pc === 'undefined') return null;
        const bytes = this.lutBytes(style);
        const tex = new pc.Texture(dev, {
            name: 'postfx-lut', width: 256, height: 16, format: pc.PIXELFORMAT_RGBA8,
            mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
            addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE, srgb: true,
        });
        /** @type {Uint8Array} */ (tex.lock()).set(bytes);
        tex.unlock();
        this._luts[key] = tex;
        return tex;
    },

    /** Adaptive resolution: below ~42 fps the scale steps down, above ~56 it creeps back. */
    tick(dt) {
        const f = this.frame;
        if (!f || !f.enabled || !this.cfg().adaptive) return;
        this._warmT += dt;
        this._tickT += dt;
        if (this._warmT < 5 || this._tickT < 2) return;
        this._tickT = 0;
        const fps = (typeof World3D !== 'undefined' && World3D.fps) ? (World3D.fps() || 60) : 60;
        const cur = f.rendering.renderTargetScale;
        let next = cur;
        if (fps < 42 && cur > 0.6) next = Math.max(0.6, cur - 0.15);
        else if (fps > 56 && cur < 1) next = Math.min(1, cur + 0.05);
        if (next !== cur) {
            f.rendering.renderTargetScale = next;
            this._adaptScale = next;
        }
    },

    dispose() {
        if (this.frame) { try { this.frame.destroy(); } catch (e) { /* already gone */ } this.frame = null; }
        for (const k of Object.keys(this._luts)) {
            try { this._luts[k].destroy(); } catch (e) { /* already gone */ }
        }
        this._luts = {};
        this.view = null;
        this._grade = null;
    },

    /** The number of POSTFX_TONEMAP → the engine constant (0 linear … 5 neutral). */
    _tonemap(n) {
        if (typeof pc === 'undefined') return 0;
        const list = [pc.TONEMAP_LINEAR, pc.TONEMAP_FILMIC, pc.TONEMAP_HEJL, pc.TONEMAP_ACES, pc.TONEMAP_ACES2, pc.TONEMAP_NEUTRAL];
        return list[n] != null ? list[n] : pc.TONEMAP_ACES2;
    },

    /** The number of POSTFX_SSAO_TYPE → the engine constant (1 lighting, 2 combine). */
    _ssaoType(n) {
        if (typeof pc === 'undefined') return 'none';
        return n === 1 ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_COMBINE;
    },
};
