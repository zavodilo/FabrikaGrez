// MovieSequencer.js — the film player (game layer: no pc.*). Plays a timeline JSON:
// scenes -> shots -> beats, staging procedural actors (ActorRig3D) on procedural sets
// (SetPieces3D) at the backlot, driving the cinematic camera (CineCam3D), subtitles and
// overlays through UI records, sound through Sound3D. The SAME player serves the demo film,
// the dailies of a production and the full cinema release of finished movies.
//
// Timeline contract (all plain JSON, see MovieData.DEMO_MOVIE):
//   { title, genre, year, seed, cast: [{ id, role, name, look }], credits: {…},
//     scenes: [{ set, timeOfDay, label, music, tint, enter: [{who, anchor|x/y, heading, act, h}],
//                props: [{ id, anchor|x/y, heading }],
//                shots: [{ dur, trans: 'cut'|'fade', cam: {…}, beats: [{ t, … }] }] }] }
//   cam: { type: 'wide'|'medium'|'close'|'duo'|'over'|'low'|'crane'|'fixed',
//          anchor?, who?, who2?, az?, pitch?, zoom?, roll?, fov?, h?, glide?, to? }
//   beats: { who + act|to|spawn|face|look|say|rideProp|unride, sfx, narr, shake, fx,
//            music, tint, moveProp, despawnProp, endCard }
//
//   MovieSequencer.play(timeline, { dailies: sceneIndex, onEnd: fn })
//   MovieSequencer.update(dt)      — every frame from Game.update
//   MovieSequencer.togglePause() / setSpeed(x) / stop()

/** @satisfies {Record<string, any>} */
const MovieSequencer = {
    state: 'idle',        // idle | intro | scene | endcard | credits
    /** @type {any} */ tl: null,
    opts: null,
    t: 0,                 // playback seconds (scaled by speed)
    speed: 1,
    paused: false,
    transitioning: false,
    _proj: null,
    si: 0,                // scene index
    shot: 0,
    shotT: 0,
    introT: 0,
    cardT: 0,             // narration/end-card countdown
    creditsT: 0,
    subUntil: -1,
    fadeAlpha: 0,
    fadeDir: 0,           // -1 fading in (alpha->0), +1 fading out
    fadeCb: null,
    flashUntil: -1,
    base: { x: 0, y: 0 },
    set: null,
    /** @type {Record<string, ActorHandle>} */ actors: {},
    /** @type {Record<string, SetHandle>} */ props: {},
    /** @type {Record<string, string>} */ riding: {},
    propMoves: [],
    pending: [],          // { t, fn } — timed reverts (subtitle hide, act restore…)
    totalDur: 1,
    _app: null,

    cfg() {
        const U = 'undefined';
        return {
            titleSec: typeof MOVIE_TITLE_SEC !== U ? MOVIE_TITLE_SEC : 3.5,
            creditsSpeed: typeof MOVIE_CREDITS_SPEED !== U ? MOVIE_CREDITS_SPEED : 46,
            camLerp: typeof MOVIE_CAM_LERP !== U ? MOVIE_CAM_LERP : 6,
            grain: typeof MOVIE_GRAIN !== U ? MOVIE_GRAIN : 1,
            backX: typeof STUDIO_BACKLOT_X !== U ? STUDIO_BACKLOT_X : 3200,
            backY: typeof STUDIO_BACKLOT_Y !== U ? STUDIO_BACKLOT_Y : 3200,
        };
    },

    get playing() { return this.state !== 'idle'; },

    // --- lifecycle ----------------------------------------------------------------------

    play(tl, opts) {
        if (this.state !== 'idle') this.stop(true);
        const app = /** @type {any} */ (window).app;
        if (!app || !app.location) { console.warn('MovieSequencer: игра не запущена'); return; }
        this._app = app;
        this.tl = tl;
        this.opts = opts || {};
        const c = this.cfg();
        this.base = { x: c.backX, y: c.backY };
        this.t = 0; this.introT = 0; this.cardT = 0; this.creditsT = 0;
        this.si = 0; this.shot = 0; this.shotT = 0;
        this.subUntil = -1; this.flashUntil = -1;
        this.speed = 1; this.paused = false;
        this.propMoves = []; this.pending = []; this.riding = {}; this.props = {};

        const dailies = this.opts.dailies != null;
        if (dailies) this.si = Math.max(0, Math.min(tl.scenes.length - 1, this.opts.dailies | 0));
        this.totalDur = this._computeTotal(dailies);

        // Cinema UI on, studio HUD off (Game listens through opts.ui hooks it wired once).
        this._uiCinema(true);
        if (typeof Particles3D !== 'undefined') Particles3D.stopAll();   // a fresh picture, a fresh sky
        this._buildCast();
        CineCam3D.begin(app.camera);
        Sound3D.music(null);
        this._proj = Sound3D.play(MovieData.SFX.projector, { loop: true, volume: 0.16, x: this.base.x, y: this.base.y });
        const genre = MovieData.GENRES[tl.genre] || MovieData.GENRES.drama;
        Sound3D.music(MovieData.MUSIC[tl.music || genre.music] || MovieData.MUSIC.studio);
        // The post frame switches to the picture's look: genre LUT × era stock × the hour.
        if (typeof CinePost3D !== 'undefined') {
            CinePost3D.setCinema(tl.genre, this.eraClass(tl.year), 'day');
        }

        if (dailies) {
            this.state = 'intro';
            this._card('ДНЕВНИКИ СЪЁМОК', tl.scenes[this.si] ? tl.scenes[this.si].label : '', '');
            this.introT = -(c.titleSec * 0.6);   // a shorter card
        } else {
            this.state = 'intro';
            const names = (tl.cast || []).filter((m) => !/^e/.test(m.id)).slice(0, 3).map((m) => m.name).join(' · ');
            this._card('Студия «' + (tl.studio || 'Фабрика Грёз') + '» представляет', tl.title,
                (genre.ru || '') + (tl.year ? ' · ' + tl.year : '') + (names ? ' · ' + names : ''));
        }
        this.fadeAlpha = 1;
        this._applyFade();
    },

    _computeTotal(dailies) {
        const c = this.cfg();
        let d = c.titleSec + 1.6;
        const scenes = dailies ? [this.tl.scenes[this.si]] : this.tl.scenes;
        for (const sc of scenes || []) for (const sh of (sc && sc.shots) || []) d += sh.dur;
        if (!dailies) d += 2.5 + this._creditsDur();
        return Math.max(1, d);
    },

    _creditsDur() {
        const n = ((this.tl && this.tl.cast) || []).length;
        return Math.max(20, Math.min(46, 14 + n * 2.6));
    },

    stop(silent) {
        if (this.state === 'idle') return;
        this._teardown();
        this.state = 'idle';
        if (!silent && this.opts && this.opts.onEnd) this.opts.onEnd();
        this.tl = null;
    },

    _teardown() {
        this._duck(false);
        this._killBirds();
        const v = this._app && this._app.location && this._app.location.view;
        if (v && v.applyLighting && typeof World3D !== 'undefined') v.applyLighting(World3D.cfg());
        if (v && v.setCinemaRim) v.setCinemaRim(false);      // the rig leaves with the crew
        if (typeof Particles3D !== 'undefined') Particles3D.stopAll();
        if (typeof Sky3D !== 'undefined' && Sky3D.attached) Sky3D.setLot();
        if (typeof CinePost3D !== 'undefined') {
            CinePost3D.setDofPlan('wide');     // deep focus: the lot has no rack
            CinePost3D.setStudio();
        }
        this._speaker = null;
        this._focusDist = null;
        this._focusSnap = false;
        this._glass = null;
        if (this._fg) { SetPieces3D.dispose(this._fg); this._fg = null; }
        if (typeof CinePost3D !== 'undefined' && CinePost3D.setPlanVignette) CinePost3D.setPlanVignette(1);
        Sound3D.music(null);
        if (this._proj) { this._proj.stop(); this._proj = null; }
        for (const id of Object.keys(this.props)) SetPieces3D.dispose(this.props[id]);
        this.props = {};
        for (const id of Object.keys(this.actors)) ActorRig3D.despawn(this.actors[id]);
        this.actors = {};
        if (this.set) { SetPieces3D.dispose(this.set); this.set = null; }
        if (CineCam3D.isActive()) CineCam3D.end();
        this._uiCinema(false);
    },

    togglePause() {
        if (this.state === 'idle') return;
        this.paused = !this.paused;
        const btn = UI.get('btnCinePlay');
        if (btn) btn.setText(this.paused ? '▶ Играть' : '❚❚ Пауза');
        if (this.paused) this._cardSmall('ПАУЗА');
        else if (this.state !== 'intro' && this.state !== 'credits' && this.state !== 'endcard') this._hideCard();
    },

    setSpeed(x) {
        this.speed = x;
        const btn = UI.get('btnCineSpeed');
        if (btn) btn.setText(x + '×');
    },

    // --- the frame ------------------------------------------------------------------------

    update(dt) {
        if (this.state === 'idle') return;
        CineCam3D.speedMul = this.paused ? 0.0001 : this.speed;
        if (this.paused) return;
        const t = dt * this.speed;
        this.t += t;

        this._stepFade(t);
        this._stepBirds(t);
        this._stepPending();
        this._stepProps(t);
        this._stepRides();
        this._stepFocus(t);
        this._stepPracticals();
        if (typeof Particles3D !== 'undefined') Particles3D.update(t);
        this._stepFlash();

        if (this.state === 'intro') {
            this.introT += t;
            const need = this.cfg().titleSec + 1.6;
            if (this.introT >= need) { this._hideCard(); this._enterScene(this.si, true); }
            this._hud();
            return;
        }
        if (this.state === 'scene') {
            if (!this.transitioning) {
                this.shotT += t;
                const sc = this.tl.scenes[this.si];
                const sh = sc && sc.shots ? sc.shots[this.shot] : null;
                if (!sh) { this._nextScene(); this._hud(); return; }
                this._fireBeats(sh);
                this._camera(sh);
                if (this.shotT >= sh.dur) {
                    this.shotT -= sh.dur;
                    this.shot++;
                    if (this.shot >= (sc.shots || []).length) this._nextScene();
                    else this._beginShot(sc.shots[this.shot]);
                }
            }
            this._hud();
            return;
        }
        if (this.state === 'endcard') {
            this.cardT -= t;
            if (this.cardT <= 0) { this._hideCard(); this._beginCredits(); }
            this._hud();
            return;
        }
        if (this.state === 'credits') {
            this.creditsT += t;
            if (this.creditsT >= this._creditsDur() + 1.6) this.stop(false);
            this._hud();
        }
    },

    _hud() {
        const bar = UI.get('cineBar');
        if (bar) bar.setValue(Math.max(0, Math.min(1, this.t / this.totalDur)));
        const tt = UI.get('cineTime');
        if (tt) {
            const a = Math.max(0, Math.floor(this.t)), b = Math.max(0, Math.floor(this.totalDur));
            tt.setText(this._mmss(a) + ' / ' + this._mmss(b));
        }
    },

    _mmss(s) {
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },

    /** The light of the scene's time of day: pure, so tests can hold it in their hands. */
    gradeFor(tod) {
        const U = 'undefined';
        const n = (k, fb) => (typeof globalThis !== U && globalThis[k] !== undefined ? globalThis[k] : fb);
        if (tod === 'night') {
            return { sunColor: n('CINEMA_SUN_NIGHT', 0x8fa8ff), sunIntensity: n('CINEMA_SUN_NIGHT_I', 0.32), sky: n('CINEMA_SKY_NIGHT', 0x0a1030) };
        }
        if (tod === 'sunset') {
            return { sunColor: n('CINEMA_SUN_SET', 0xff9a3c), sunIntensity: n('CINEMA_SUN_SET_I', 0.7), sky: n('CINEMA_SKY_SET', 0x3a2438) };
        }
        return { sunColor: n('CINEMA_SUN_DAY', 0xffedc7), sunIntensity: n('CINEMA_SUN_DAY_I', 0.85), sky: n('CINEMA_SKY_DAY', 0x9fc4e0) };
    },

    /** The film stock of the decade: silver stock scratches, color stock grains, modern is clean. */
    eraClass(year) {
        const y = year || 1950;
        return y < 1965 ? 'era-silver' : y < 1982 ? 'era-color' : 'era-clean';
    },

    // --- scenes & shots ---------------------------------------------------------------------

    _enterScene(i, first) {
        const sc = this.tl.scenes[i];
        if (!sc) { this._beginCredits(); return; }
        // Leave the intro card behind. Without this the state stayed 'intro' forever: the intro
        // branch re-entered this method on EVERY frame (rebuilding the set each time) and the
        // only other writer of 'scene' — _nextScene — is reachable solely from the 'scene'
        // branch, so no film ever got past its title card.
        this.state = 'scene';
        this.transitioning = false;
        this.si = i;
        this.shot = 0;
        this.shotT = 0;
        this.cardT = 0;
        this.propMoves = [];
        this.riding = {};
        // The set.
        if (this.set) { SetPieces3D.dispose(this.set); this.set = null; }
        for (const id of Object.keys(this.props)) SetPieces3D.dispose(this.props[id]);
        this.props = {};
        const view = this._app.location.view;
        this.set = SetPieces3D.buildSet(view, sc.set || 'western', this.base.x, this.base.y, 0);
        if (!this.set) this.set = SetPieces3D.buildSet(view, 'western', this.base.x, this.base.y, 0);
        // Interiors are shot as a dollhouse: the ceiling/fourth wall comes off for the take.
        if (this.set && this.set.shell) for (const e of this.set.shell) e.enabled = false;
        // Scene props.
        for (const p of sc.props || []) {
            const at = this._resolvePoint(p.anchor != null ? p.anchor : { x: p.x || 0, y: p.y || 0 });
            const hd = p.heading != null ? p.heading : at.heading;
            const h = SetPieces3D.buildProp(view, p.id, at.x, at.y, hd, 0);
            if (h) { h._px = at.x; h._py = at.y; h._ph = hd; this.props[p.id] = h; }
        }
        // Park the cast out of frame, then apply the enter list.
        const placed = {};
        for (const e of sc.enter || []) placed[e.who] = true;
        let park = 0;
        for (const id of Object.keys(this.actors)) {
            const a = this.actors[id];
            a.moveTarget = null; a.faceTarget = null; a.lookYaw = null;
            a.h = 0;
            if (!placed[id]) {
                a.x = this.base.x + 1400 + (park % 4) * 60;
                a.y = this.base.y + 900 + Math.floor(park / 4) * 60;
                park++;
                a.heading = 0;
                a.act('idle');
            }
        }
        for (const e of sc.enter || []) this._stage(e.who, e);
        // Atmosphere: the light follows the scene's hour, and the stock follows the decade.
        const grade = this.gradeFor(sc.timeOfDay);
        const view0 = this._app.location.view;
        if (view0 && view0.applyLighting && typeof World3D !== 'undefined') {
            view0.applyLighting(Object.assign({}, World3D.cfg(), grade));
        }
        if (typeof CinePost3D !== 'undefined') {
            CinePost3D.setCinema(this.tl.genre, this.eraClass(this.tl.year), sc.timeOfDay,
                (typeof MovieData !== 'undefined' && MovieData.accentFor) ? MovieData.accentFor(sc.kind) : null);
        }
        // Set lighting: the practicals wake for the scene's hour (fires and indoor neon burn
        // always, headlights sleep through a day exterior), and the procedural sky dresses
        // exteriors — a dollhouse interior has no horizon, so it hides the dome.
        const indoorSet = !!(MovieData.SET_INFO[sc.set] || {}).indoor;
        if (typeof SetPieces3D !== 'undefined' && SetPieces3D.setPracticals) {
            SetPieces3D.setPracticals(this.set, sc.timeOfDay, indoorSet, 1);
            for (const id of Object.keys(this.props)) SetPieces3D.setPracticals(this.props[id], sc.timeOfDay, indoorSet, 1);
        }
        // Noir rain: the floors turn to wet asphalt — gloss and reflected neon streaks.
        if (typeof SetPieces3D !== 'undefined' && SetPieces3D.setWet) {
            SetPieces3D.setWet(this.set, this.tl.genre === 'noir' && (sc.timeOfDay === 'night' || sc.tint === 'rain'));
        }
        if (typeof Sky3D !== 'undefined' && Sky3D.attached) {
            if (indoorSet) Sky3D.hide();
            else { Sky3D.show(); Sky3D.setLook(sc.timeOfDay, grade); }
        }
        this._startParticles(sc);
        this._spawnBirds(sc);
        const genre = MovieData.GENRES[this.tl.genre] || {};
        Sound3D.music(MovieData.MUSIC[sc.music || genre.music || 'studio'] || null);
        this._rebuildFx(sc.tint, sc.timeOfDay);
        const cs = UI.get('cineScene');
        if (cs) { cs.setText(sc.label || ('Сцена ' + (i + 1))); cs.show(true); }
        // Fade in from black, then the first shot.
        const sh = (sc.shots || [])[0];
        if (sh) {
            this.fadeAlpha = 1;
            this.fadeDir = -1;
            this.fadeCb = null;
            this._applyFade();
            this._beginShot(sh, true);
        }
        if (first) { /* nothing extra */ }
    },

    _nextScene() {
        this.transitioning = true;
        const dailies = this.opts && this.opts.dailies != null;
        if (dailies || this.si + 1 >= this.tl.scenes.length) {
            if (dailies) { this.stop(false); return; }
            this.state = 'endcard';
            this.cardT = 2.5;
            this._fadeTo(1, 0.6, () => {
                this._cardBig('КОНЕЦ');
                this._fadeTo(0, 0.8, null);
            });
            return;
        }
        this.state = 'scene';
        this._fadeTo(1, 0.45, () => {
            this._enterScene(this.si + 1, false);
        });
        // While fading out, freeze on the last pose (shots stop advancing).
        this.shot = (this.tl.scenes[this.si].shots || []).length;
    },

    _beginShot(sh, snap) {
        if (sh.trans === 'cut') {
            Sound3D.play(MovieData.SFX.cut, { volume: 0.14 });
            this._camSnap = true;
        } else this._camSnap = !!snap;
        this._camera(sh, true);
        // The shot's optics: the tag is the semantic framing ('close', 'wide'…) even when the
        // rig realised the pose as a 'fixed' solve. DoF plan, shadow budget and the focus snap
        // all key off it — a cut pulls focus with the frame, a fade lets it drift.
        const tag = sh.tag || (sh.cam && sh.cam.type) || 'wide';
        this._focusSnap = sh.trans === 'cut' || !!snap;
        if (typeof CinePost3D !== 'undefined') CinePost3D.setDofPlan(tag);
        this._shadowsFor(tag);
        this._lightRig(tag);
        this._compPlan(tag);
        this._foreground(sh, tag);
        const cs = UI.get('cineScene');
        if (cs && this.tl.scenes[this.si]) cs.setText(this.tl.scenes[this.si].label || '');
    },

    /**
     * The shadow budget of a shot tag (pure — tests hold it in their hands): the map size by
     * the plan and whether PCSS is allowed for this device and preset.
     * @returns {{ map: number, pcss: boolean }}
     */
    shadowPlanFor(tag, mobile, quality) {
        const U = 'undefined';
        const closeM = typeof CINE_SHADOW_MAP_CLOSE !== U ? CINE_SHADOW_MAP_CLOSE : 4096;
        const midM = typeof CINE_SHADOW_MAP_MID !== U ? CINE_SHADOW_MAP_MID : 2048;
        const wideM = typeof CINE_SHADOW_MAP_WIDE !== U ? CINE_SHADOW_MAP_WIDE : 1024;
        const want = typeof CINE_SHADOW_PCSS !== U ? CINE_SHADOW_PCSS : 1;
        const plan = (typeof MovieData !== 'undefined' && MovieData.planSize) ? MovieData.planSize(tag) : 'mid';
        let map = plan === 'close' ? closeM : (plan === 'mid' ? midM : wideM);
        if (mobile) map = Math.min(2048, map);
        return { map: map, pcss: !!want && !mobile && (quality == null ? true : quality >= 2) };
    },

    /** Write the shot's shadow budget onto the view's sun (PCSS + map size by the plan). */
    _shadowsFor(tag) {
        const view = this._app && this._app.location && this._app.location.view;
        if (!view || !view.setCinemaShadows) return;
        const U = 'undefined';
        const mob = typeof IS_MOBILE !== U && IS_MOBILE;
        const q = typeof CinePost3D !== 'undefined' ? CinePost3D.quality : 0;
        const plan = this.shadowPlanFor(tag, mob, q);
        const samples = typeof CINE_SHADOW_SAMPLES !== U ? CINE_SHADOW_SAMPLES : 16;
        const blockers = typeof CINE_SHADOW_BLOCKERS !== U ? CINE_SHADOW_BLOCKERS : 8;
        const penumbra = typeof CINE_SHADOW_PENUMBRA !== U ? CINE_SHADOW_PENUMBRA : 10;
        view.setCinemaShadows(plan.map, plan.pcss, { samples: samples, blockers: blockers, penumbra: penumbra });
    },

    /**
     * The shot's three-point rig (pure numbers — tests hold them in their hands): the key
     * stands CINE_KEY_OFFSET_DEG off the lens axis on the scene's side (the 180° rule holds
     * for light too), its elevation follows the hour and the plan; the rim peeks around the
     * subject from the opposite side. The fill rides the lens (CineCam3D._syncFill).
     */
    lightRigFor(tag, tod, side) {
        const U = 'undefined';
        const off = typeof CINE_KEY_OFFSET_DEG !== U ? CINE_KEY_OFFSET_DEG : 42;
        const elDay = typeof CINE_KEY_EL_DAY !== U ? CINE_KEY_EL_DAY : 48;
        const elSet = typeof CINE_KEY_EL_SET !== U ? CINE_KEY_EL_SET : 14;
        const elNight = typeof CINE_KEY_EL_NIGHT !== U ? CINE_KEY_EL_NIGHT : 38;
        const rDay = typeof CINE_RIM_DAY !== U ? CINE_RIM_DAY : 0.25;
        const rSet = typeof CINE_RIM_SET !== U ? CINE_RIM_SET : 0.5;
        const rNight = typeof CINE_RIM_NIGHT !== U ? CINE_RIM_NIGHT : 0.8;
        const rOff = typeof CINE_RIM_OFFSET_DEG !== U ? CINE_RIM_OFFSET_DEG : 18;
        const rEl = typeof CINE_RIM_EL_DEG !== U ? CINE_RIM_EL_DEG : 30;
        const rCol = typeof CINE_RIM_COLOR !== U ? CINE_RIM_COLOR : 0xbcd4ff;
        const s = side < 0 ? -1 : 1;
        const plan = (typeof MovieData !== 'undefined' && MovieData.planSize) ? MovieData.planSize(tag) : 'mid';
        // A close-up gets a lower, sculpting key; a wide master keeps the hour's elevation high.
        const base = tod === 'night' ? elNight : (tod === 'sunset' ? elSet : elDay);
        const keyEl = plan === 'close' ? Math.max(8, base - 8) : (plan === 'wide' ? Math.min(70, base + 8) : base);
        const rimI = tod === 'night' ? rNight : (tod === 'sunset' ? rSet : rDay);
        return { side: s, keyOff: s * off, keyEl: keyEl, rimI: rimI, rimOff: rOff, rimEl: rEl, rimColor: rCol };
    },

    /**
     * The composition plan of a shot (pure numbers — tests hold them): a close-up lifts its
     * key and sinks its vignette so the subject reads against the scene; a wide master lets
     * the air stack (aerial perspective). { keyBoost, vignette, haze }.
     */
    compPlanFor(tag) {
        const U = 'undefined';
        const kb = typeof CINE_KEY_BOOST_CLOSE !== U ? CINE_KEY_BOOST_CLOSE : 1.18;
        const vg = typeof CINE_VIGNETTE_CLOSE !== U ? CINE_VIGNETTE_CLOSE : 1.18;
        const hw = typeof CINE_HAZE_WIDE !== U ? CINE_HAZE_WIDE : 1.3;
        const hc = typeof CINE_HAZE_CLOSE !== U ? CINE_HAZE_CLOSE : 0.75;
        const plan = (typeof MovieData !== 'undefined' && MovieData.planSize) ? MovieData.planSize(tag) : 'mid';
        if (plan === 'close') return { keyBoost: kb, vignette: vg, haze: hc };
        if (plan === 'wide') return { keyBoost: 1, vignette: 0.92, haze: hw };
        return { keyBoost: 1 + (kb - 1) * 0.4, vignette: 1, haze: 1 };
    },

    /** Write the composition plan onto the view and the post frame. */
    _compPlan(tag) {
        const plan = this.compPlanFor(tag);
        const view = this._app && this._app.location && this._app.location.view;
        if (view) {
            if (view.setKeyBoost) view.setKeyBoost(plan.keyBoost);
            if (view.setHaze) view.setHaze(plan.haze);
        }
        if (typeof CinePost3D !== 'undefined' && CinePost3D.setPlanVignette) CinePost3D.setPlanVignette(plan.vignette);
    },

    /**
     * The foreground frame: on over-shoulders and interior close/medium shots a dark silhouette
     * (a door jamb, a leaf cluster) edges the frame from the camera's own corner — the cheapest
     * depth cue in cinema. Parented to the camera entity, so it rides every glide.
     */
    _foreground(sh, tag) {
        if (this._fg) { SetPieces3D.dispose(this._fg); this._fg = null; }
        const U = 'undefined';
        const chance = typeof CINE_FOREGROUND !== U ? CINE_FOREGROUND : 0.5;
        if (!chance) return;
        const sc = this.tl && this.tl.scenes ? this.tl.scenes[this.si] : null;
        const indoor = !!(sc && (MovieData.SET_INFO[sc.set] || {}).indoor);
        const plan = (typeof MovieData !== 'undefined' && MovieData.planSize) ? MovieData.planSize(tag) : 'mid';
        const want = tag === 'over' || ((plan === 'close' || plan === 'mid') && indoor);
        if (!want) return;
        const seed = ((this.tl && this.tl.seed) || 0) + this.si * 31 + this.shot * 7;
        const roll = (typeof Rng !== 'undefined' && Rng.create) ? Rng.create('fg-' + seed).float(0, 1) : 0.5;
        if (roll > chance) return;
        const view = this._app && this._app.location && this._app.location.view;
        if (!view || typeof CineCam3D === 'undefined' || !CineCam3D.view) return;
        const h = SetPieces3D.buildProp(view, indoor ? 'fdoor' : 'ffoliage', this.base.x + 4000, this.base.y + 4000, 0, 0);
        if (!h) return;
        const cam = CineCam3D.view.camEntity;
        cam.addChild(h.root);
        const side = roll > chance / 2 ? 1 : -1;
        h.root.setLocalPosition(side * 62, -34, -95);     // camera-local: ahead, aside, below center
        h.root.setLocalEulerAngles(0, side * -14, 0);
        h.root.setLocalScale(1.25, 1.25, 1.25);
        this._fg = h;
    },

    /** Aim the shot's key (the sun) and rim from the live pose; the sky disc follows the key. */
    _lightRig(tag) {
        const view = this._app && this._app.location && this._app.location.view;
        if (!view || typeof CineCam3D === 'undefined' || !CineCam3D.tgt) return;
        const sc = this.tl && this.tl.scenes ? this.tl.scenes[this.si] : null;
        const tod = (sc && sc.timeOfDay) || 'day';
        const plan = this.lightRigFor(tag, tod, this.si % 2 ? -1 : 1);
        const pose = CineCam3D.tgt;
        if (view.aimSun) view.aimSun(pose.az + plan.keyOff, plan.keyEl);
        if (view.setCinemaRim) view.setCinemaRim(plan.rimI > 0, pose.az + 180 - plan.side * plan.rimOff, plan.rimEl, plan.rimI, plan.rimColor);
        if (typeof Sky3D !== 'undefined' && Sky3D.attached && Sky3D.visible) Sky3D.setSun(pose.az + plan.keyOff, plan.keyEl);
    },

    /**
     * The scene's weather and fire: pooled procedural sprites over the set. Rain follows the
     * rain tint (and most noir nights), snow — a scene flag or a rare war night, dust — dry
     * sunny exteriors of the open genres; fire and smoke live at the camp/forest fire pit.
     * Everything is seeded, so a rewatch rains the same rain.
     */
    _startParticles(sc) {
        if (typeof Particles3D === 'undefined') return;
        Particles3D.stopAll();
        const view = this._app && this._app.location && this._app.location.view;
        if (!view) return;
        const info = MovieData.SET_INFO[sc.set] || {};
        const seed = ((this.tl && this.tl.seed) || 0) + this.si * 101;
        const cx = this.base.x, cy = this.base.y;
        const tod = sc.timeOfDay || 'day';
        const roll = (typeof Rng !== 'undefined' && Rng.create) ? Rng.create('wx-' + seed).float(0, 1) : 0.5;
        if (sc.tint === 'rain' || (this.tl.genre === 'noir' && tod === 'night' && roll < 0.7)) {
            Particles3D.start(view, 'rain', { x: cx, y: cy, h: 40, r: 420, seed: seed });
        } else if (sc.snow || (this.tl.genre === 'war' && tod === 'night' && roll < 0.25)) {
            Particles3D.start(view, 'snow', { x: cx, y: cy, h: 60, r: 380, seed: seed });
        } else if (!info.indoor && tod !== 'night' && roll < 0.6 &&
            (this.tl.genre === 'western' || this.tl.genre === 'adventure' || this.tl.genre === 'war')) {
            Particles3D.start(view, 'dust', { x: cx, y: cy, h: 4, r: 300, seed: seed });
        }
        if (sc.set === 'camp' || sc.set === 'forest') {
            const fx = cx + (sc.set === 'camp' ? 220 : 0), fy = cy + (sc.set === 'camp' ? 60 : 0);
            Particles3D.start(view, 'fire', { x: fx, y: fy, h: 30, r: 16, seed: seed });
            Particles3D.start(view, 'smoke', { x: fx, y: fy, h: 60, r: 14, seed: seed + 1 });
        }
    },

    /** A prop in the actor's hand: parented to the forearm, disposed with the actor. */
    _holdProp(a, id) {
        if (a.holdHandle) { SetPieces3D.dispose(a.holdHandle); a.holdHandle = null; }
        if (!id) return;
        const view = this._app && this._app.location && this._app.location.view;
        const h = SetPieces3D.buildProp(view, id, a.x, a.y, a.heading, 0);
        if (!h) return;
        const hand = a.joints && a.joints.foreR;
        if (hand) {
            hand.addChild(h.root);
            h.root.setLocalPosition(0, -14, 6);
            h.root.setLocalEulerAngles(90, 0, 0);
            h.root.setLocalScale(0.7, 0.7, 0.7);
        }
        a.holdHandle = h;
    },

    /** Fires breathe and neon buzzes on the playback clock (deterministic rewatch). */
    _stepPracticals() {
        if (typeof SetPieces3D === 'undefined' || !SetPieces3D.tickPracticals) return;
        if (this.set) SetPieces3D.tickPracticals(this.set, this.t);
        for (const id of Object.keys(this.props)) SetPieces3D.tickPracticals(this.props[id], this.t);
    },

    _camera(sh, forceSnap) {
        if (!sh || !sh.cam) return;
        const pose = this._poseFor(sh.cam, sh);
        if (!pose) return;
        CineCam3D.lerp = sh.cam.glide || this.cfg().camLerp;
        CineCam3D.setPose(pose, !!(forceSnap || this._camSnap));
        this._camSnap = false;
        // A crane shot glides to its end pose after the first 15%.
        if (sh.cam.to && this.shotT > sh.dur * 0.15) {
            CineCam3D.setPose(Object.assign({}, pose, sh.cam.to), false);
        }
    },

    _poseFor(cam, sh) {
        const D = Math.PI / 180;
        const type = cam.type || 'wide';
        // The shot's cine lens: 24 mm wides, 50 mm middles, 85 mm portraits (MovieData table).
        // zoom still frames the subject, so a longer lens pulls the eye back and flattens it.
        const defFov = Math.round((typeof MovieData !== 'undefined' ? MovieData.fovFor(type) : 52) * 10) / 10;
        const at = (id) => {
            const a = this.actors[id];
            return a ? { x: a.x, y: a.y, h: a.h, heading: a.heading } : null;
        };
        let p = { x: this.base.x, y: this.base.y, h: 60, az: -90, pitch: 50, zoom: 0.9, roll: 0, fov: defFov };
        if (type === 'wide' || type === 'crane') {
            const pt = cam.anchor != null ? this._resolvePoint(cam.anchor) : { x: this.base.x, y: this.base.y, heading: 0, h: 0 };
            p.x = pt.x; p.y = pt.y; p.h = pt.h + (cam.h != null ? cam.h : 60);
            p.az = cam.az != null ? cam.az : -90;
            p.pitch = cam.pitch != null ? cam.pitch : 50;
            p.zoom = cam.zoom != null ? cam.zoom : 0.9;
        } else if (type === 'medium' || type === 'close' || type === 'dutch' || type === 'low') {
            const a = at(cam.who);
            if (!a) return null;
            p.x = a.x; p.y = a.y;
            p.h = a.h + (type === 'close' || type === 'dutch' ? 148 : type === 'low' ? 78 : 95);
            p.az = cam.az != null ? cam.az : a.heading + 180;
            p.pitch = cam.pitch != null ? cam.pitch : (type === 'close' || type === 'dutch' ? 6 : type === 'low' ? -6 : 12);
            p.zoom = cam.zoom != null ? cam.zoom : (type === 'close' || type === 'dutch' ? 4.2 : type === 'low' ? 2.6 : 2.1);
            if (type === 'dutch' && cam.roll == null) p.roll = 9;
        } else if (type === 'duo') {
            const a = at(cam.who), b = at(cam.who2);
            if (!a || !b) return null;
            const dist = Math.max(60, Math.hypot(a.x - b.x, a.y - b.y));
            p.x = (a.x + b.x) / 2; p.y = (a.y + b.y) / 2;
            p.h = (a.h + b.h) / 2 + 95;
            const line = Math.atan2(b.y - a.y, b.x - a.x) / D;
            const s1 = ((line + 90 + 540) % 360) - 180, s2 = ((line - 90 + 540) % 360) - 180;
            p.az = cam.az != null ? cam.az : (Math.abs(((s1 + 90 + 540) % 360) - 180) < Math.abs(((s2 + 90 + 540) % 360) - 180) ? s1 : s2);
            p.pitch = cam.pitch != null ? cam.pitch : 12;
            p.zoom = cam.zoom != null ? cam.zoom : Math.max(1.1, Math.min(3, 1500 / dist));
        } else if (type === 'over') {
            const a = at(cam.who), b = at(cam.who2);
            if (!a || !b) return null;
            p.x = b.x; p.y = b.y; p.h = b.h + 140;
            p.az = Math.atan2(b.y - a.y, b.x - a.x) / D;
            p.pitch = cam.pitch != null ? cam.pitch : 8;
            p.zoom = cam.zoom != null ? cam.zoom : 2.8;
            p.roll = cam.roll != null ? cam.roll : 4;
        } else if (type === 'fixed') {
            const pt = cam.local ? { x: this.base.x + (cam.x || 0), y: this.base.y + (cam.y || 0) } : { x: cam.x || this.base.x, y: cam.y || this.base.y };
            p.x = pt.x; p.y = pt.y; p.h = cam.h != null ? cam.h : 80;
            p.az = cam.az != null ? cam.az : -90;
            p.pitch = cam.pitch != null ? cam.pitch : 45;
            p.zoom = cam.zoom != null ? cam.zoom : 1;
        }
        if (cam.roll != null) p.roll = cam.roll;
        if (cam.fov != null) p.fov = cam.fov;
        if (cam.az != null && (type === 'medium' || type === 'close')) p.az = cam.az;
        // The rule of thirds on hand-written poses: the look-at steps aside so the subject
        // lands on a thirds line; coverage alternates the side shot by shot.
        if ((type === 'close' || type === 'medium' || type === 'low') && cam.x == null && typeof MovieData !== 'undefined' && MovieData.thirdsOffset) {
            const dist = 720 / (2 * Math.tan(p.fov * Math.PI / 360) * Math.max(0.05, p.zoom));
            const off = MovieData.thirdsOffset(p.az, dist, p.fov, (this.shot % 2) ? 1 : -1);
            p.x += off.dx; p.y += off.dy;
        }
        return p;
    },

    // --- ambient life: birds over outdoor day scenes ---------------------------------------------
    _spawnBirds(sc) {
        this._killBirds();
        const U = 'undefined';
        const n = typeof CINEMA_BIRDS !== U ? CINEMA_BIRDS : 3;
        if (!n || !sc || (MovieData.SET_INFO[sc.set] || {}).indoor) return;
        if (sc.timeOfDay === 'night') return;
        if (typeof pc === U || !this._app) return;
        this._birds = [];
        for (let i = 0; i < n; i++) {
            const e = new pc.Entity('bird' + i);
            this._app.location.view.root.addChild(e);
            e.addComponent('render', { layers: [pc.LAYERID_WORLD] });
            const mi = new pc.MeshInstance(ActorRig3D.unitBox(this._app.location.view), ActorRig3D.mat('#2a2a30'), e);
            e.render.meshInstances = [mi];
            e.setLocalScale(14, 2, 4);
            this._birds.push({ e: e, a: (i / n) * Math.PI * 2, r: 260 + i * 60, h: 240 + i * 30 });
        }
    },

    _killBirds() {
        if (!this._birds) return;
        for (const b of this._birds) {
            if (b.e.parent) b.e.parent.removeChild(b.e);
            b.e.destroy();
        }
        this._birds = null;
    },

    _stepBirds(dt) {
        if (!this._birds) return;
        const bx = this.base.x, by = this.base.y;
        for (const b of this._birds) {
            b.a += dt * 0.35;
            const x = bx + Math.cos(b.a) * b.r;
            const y = by + Math.sin(b.a) * b.r * 0.6;
            b.e.setPosition(-x, b.h + Math.sin(b.a * 3) * 8, y);
            b.e.setEulerAngles(0, -b.a * 180 / Math.PI, Math.sin(b.a * 6) * 12);
        }
    },

    // --- beats ------------------------------------------------------------------------------

    _fireBeats(sh) {
        const beats = sh.beats || [];
        while (this._beatIdx < beats.length && beats[this._beatIdx].t <= this.shotT) {
            this._beat(beats[this._beatIdx]);
            this._beatIdx++;
        }
    },

    _beat(b) {
        const a = b.who != null ? this.actors[b.who] : null;
        if (b.endCard != null) {
            this.state = 'endcard';
            this.cardT = 2.5;
            this._fadeTo(1, 0.6, () => { this._cardBig(b.endCard || 'КОНЕЦ'); this._fadeTo(0, 0.8, null); });
            return;
        }
        if (b.narr != null) {
            this.cardT = b.dur || 2.5;
            this._card('', b.narr, '', true);
            this.pending.push({ t: this.t + (b.dur || 2.5), fn: () => { if (this.cardT <= 0) this._hideCard(); } });
            return;
        }
        if (b.say != null) {
            this._subtitle(a ? b.who : null, b.say, b.dur || 2.5);
            // The lens racks onto whoever speaks: the focus target of the shot.
            this._speaker = a ? b.who : null;
            if (a) {
                if (a.action !== 'kiss' && a.action !== 'fall' && a.action !== 'ride') a.act('talk');
                this.pending.push({ t: this.t + (b.dur || 2.5), fn: () => { if (a.action === 'talk') a.act('idle'); } });
            }
            return;
        }
        if (b.sfx != null) {
            const src = MovieData.SFX[b.sfx];
            if (!src) return;
            const at = b.who != null ? this.actors[b.who] : null;
            const opt = { volume: b.vol != null ? b.vol : 0.9 };
            if (at) { opt.x = at.x; opt.y = at.y; }
            else if (b.at) { const p = this._resolvePoint(b.at); opt.x = p.x; opt.y = p.y; }
            else { opt.x = this.base.x; opt.y = this.base.y; }
            Sound3D.play(src, opt);
            return;
        }
        if (a && b.spawn != null) {
            const p = this._resolvePoint(b.spawn);
            a.moveTarget = null;
            a.x = p.x; a.y = p.y; a.heading = b.heading != null ? b.heading : p.heading;
            if (b.h != null) a.h = b.h;
            if (b.act) a.act(b.act);
            return;
        }
        if (a && b.act != null) {
            a.act(b.act);
            if (b.look !== undefined) a.lookYaw = this._resolveYaw(b.look, a);
            if (b.dur) this.pending.push({ t: this.t + b.dur, fn: () => { if (a.action === b.act) a.act('idle'); } });
            return;
        }
        if (a && b.to != null) {
            const p = this._resolvePoint(b.to);
            a.walkTo(p.x, p.y, b.speed || 100, b.arriveAct || 'idle');
            if (b.h != null) a.h = b.h;
            return;
        }
        if (a && b.face !== undefined) {
            if (b.face === null) { a.faceTarget = null; a.lookYaw = null; }
            else if (typeof b.face === 'number') { a.heading = b.face; a.faceTarget = null; }
            else {
                const o = this.actors[b.face];
                if (o) { a.faceTo(o.x, o.y); a.lookYaw = null; }
            }
            return;
        }
        if (a && b.look !== undefined) {
            a.lookYaw = this._resolveYaw(b.look, a);
            return;
        }
        if (a && b.pose !== undefined) { a.pose = b.pose || null; return; }
        if (a && b.hold !== undefined) { this._holdProp(a, b.hold); return; }
        if (a && b.rideProp != null) {
            const prop = this.props[b.rideProp];
            if (prop) { this.riding[b.who] = { prop: b.rideProp, h: b.h != null ? b.h : 62 }; a.act('ride'); }
            return;
        }
        if (a && b.unride) {
            delete this.riding[b.who];
            a.h = 0;
            a.act('idle');
            return;
        }
        if (b.moveProp != null) {
            const prop = this.props[b.moveProp];
            if (prop) {
                const p = this._resolvePoint(b.to);
                this.propMoves.push({ id: b.moveProp, x: p.x, y: p.y, speed: b.speed || 150, heading: b.heading != null ? b.heading : null });
            }
            return;
        }
        if (b.despawnProp != null) {
            const prop = this.props[b.despawnProp];
            if (prop) { SetPieces3D.dispose(prop); delete this.props[b.despawnProp]; }
            return;
        }
        if (b.shake != null) { CineCam3D.shake(b.ms || 300, b.shake); return; }
        if (b.fx === 'flash') { this.flashUntil = this.t + 0.42; this._rebuildFx(); return; }
        if (b.music !== undefined) { Sound3D.music(b.music ? MovieData.MUSIC[b.music] || null : null); return; }
        if (b.tint !== undefined && this.tl.scenes[this.si]) { this.tl.scenes[this.si].tint = b.tint; this._rebuildFx(b.tint); return; }
    },

    _resolveYaw(look, a) {
        if (look === null || look === undefined) return null;
        if (typeof look === 'number') return look;
        const o = this.actors[look];
        return o ? Math.atan2(o.y - a.y, o.x - a.x) * 180 / Math.PI : null;
    },

    _resolvePoint(to) {
        if (typeof to === 'string') {
            const an = this.set && this.set.anchors ? this.set.anchors[to] : null;
            return an ? { x: an.x, y: an.y, h: an.h, heading: an.heading } : { x: this.base.x, y: this.base.y, h: 0, heading: 0 };
        }
        if (to && to.anchor != null) {
            const an = this.set && this.set.anchors ? this.set.anchors[to.anchor] : null;
            const p = an ? { x: an.x, y: an.y, h: an.h, heading: an.heading } : { x: this.base.x, y: this.base.y, h: 0, heading: 0 };
            return { x: p.x + (to.dx || 0), y: p.y + (to.dy || 0), h: p.h + (to.dh || 0), heading: to.heading != null ? to.heading : p.heading };
        }
        const x = (to && to.x != null) ? this.base.x + to.x : this.base.x;
        const y = (to && to.y != null) ? this.base.y + to.y : this.base.y;
        return { x: x, y: y, h: (to && to.h) || 0, heading: (to && to.heading) || 0 };
    },

    _stage(who, e) {
        const a = this.actors[who];
        if (!a) return;
        const p = e.anchor != null ? this._resolvePoint(e.anchor) : { x: this.base.x + (e.x || 0), y: this.base.y + (e.y || 0), heading: 0, h: 0 };
        a.moveTarget = null; a.faceTarget = null;
        a.x = p.x; a.y = p.y;
        a.heading = e.heading != null ? e.heading : p.heading;
        a.h = e.h != null ? e.h : (p.h || 0);
        a.lookYaw = null;
        a.act(e.act || 'idle');
    },

    _stepProps(dt) {
        for (let i = this.propMoves.length - 1; i >= 0; i--) {
            const m = this.propMoves[i];
            const prop = this.props[m.id];
            if (!prop) { this.propMoves.splice(i, 1); continue; }
            const dx = m.x - prop._px, dy = m.y - prop._py;
            const d = Math.hypot(dx, dy);
            const step = m.speed * dt;
            if (d <= Math.max(2, step)) {
                prop._px = m.x; prop._py = m.y;
                SetPieces3D.moveTo(prop, m.x, m.y, m.heading != null ? m.heading : prop._ph || 0);
                this.propMoves.splice(i, 1);
            } else {
                prop._px += dx / d * step;
                prop._py += dy / d * step;
                const hd = m.heading != null ? m.heading : Math.atan2(dy, dx) * 180 / Math.PI;
                prop._ph = hd;
                SetPieces3D.moveTo(prop, prop._px, prop._py, hd);
            }
        }
    },

    _stepRides() {
        for (const who of Object.keys(this.riding)) {
            const r = this.riding[who];
            const prop = this.props[r.prop];
            const a = this.actors[who];
            if (!prop || !a) { delete this.riding[who]; continue; }
            const px = prop._px != null ? prop._px : this.base.x, py = prop._py != null ? prop._py : this.base.y;
            const hd = (prop._ph || 0) * Math.PI / 180;
            a.x = px + Math.cos(hd) * 4;
            a.y = py + Math.sin(hd) * 4;
            a.heading = prop._ph || 0;
            a.h = r.h;
            if (a.action !== 'ride') a.act('ride');
        }
    },

    /**
     * Rack focus: the sharp plane pulls toward the speaking actor's eyes, and when nobody
     * talks — toward the shot's look-at point. The pull is exponential (CINE_RACK_SPEED),
     * a hard cut snaps it. CinePost3D writes the distance into the frame's DoF.
     */
    _stepFocus(dt) {
        if (typeof CinePost3D === 'undefined' || typeof CineCam3D === 'undefined' || !CineCam3D.isActive()) return;
        const a = this._speaker != null ? this.actors[this._speaker] : null;
        let target;
        if (a) target = CineCam3D.distTo(a.x, a.y, a.h + 150);      // the rig's eye line
        else {
            const c = CineCam3D.cur;
            target = c ? CineCam3D.distTo(c.x, c.y, c.h) : 0;
        }
        if (!Number.isFinite(target) || target <= 1) return;
        if (this._focusSnap || this._focusDist == null) { this._focusDist = target; this._focusSnap = false; }
        else {
            const U = 'undefined';
            const rate = typeof CINE_RACK_SPEED !== U ? CINE_RACK_SPEED : 2.2;
            const k = 1 - Math.exp(-Math.max(0.1, rate) * Math.max(0, dt));
            this._focusDist += (target - this._focusDist) * k;
        }
        CinePost3D.setFocus(this._focusDist);
    },

    _stepPending() {
        for (let i = this.pending.length - 1; i >= 0; i--) {
            if (this.pending[i].t <= this.t) {
                const fn = this.pending[i].fn;
                this.pending.splice(i, 1);
                try { fn(); } catch (e) { console.warn('MovieSequencer pending:', e); }
            }
        }
        if (this.cardT > 0) {
            // narration/end cards count down inside update(); hide here when expired
        }
    },

    _stepFade(dt) {
        if (!this.fadeDir) return;
        this.fadeAlpha += this.fadeDir * dt / (this._fadeDur || 0.7);
        if (this.fadeDir < 0 && this.fadeAlpha <= 0) { this.fadeAlpha = 0; this.fadeDir = 0; this._afterFade(); }
        if (this.fadeDir > 0 && this.fadeAlpha >= 1) { this.fadeAlpha = 1; this.fadeDir = 0; this._afterFade(); }
        this._applyFade();
    },

    _fadeTo(alpha, dur, cb) {
        this.fadeDir = alpha > this.fadeAlpha ? 1 : -1;
        this.fadeCb = cb || null;
        this._fadeDur = Math.max(0.15, dur || 0.7);
    },

    _afterFade() {
        const cb = this.fadeCb;
        this.fadeCb = null;
        if (cb) cb();
    },

    _applyFade() {
        const el = UI.get('fade');
        if (!el) return;
        el.def.alpha = Math.max(0, Math.min(1, this.fadeAlpha));
        el.show(this.fadeAlpha > 0.01);
        el.apply();
    },

    _stepFlash() {
        if (this.flashUntil > 0 && this.t > this.flashUntil) {
            this.flashUntil = -1;
            this._rebuildFx();
        }
    },

    // --- overlays ----------------------------------------------------------------------------

    _uiCinema(on) {
        for (const id of ['cineFx', 'lbTop', 'lbBot', 'cineBar', 'btnCinePlay', 'btnCineSpeed', 'btnCineStop', 'cineTime']) {
            const el = UI.get(id);
            if (el) el.show(on);
        }
        if (!on) {
            for (const id of ['cineCard', 'subPanel', 'subText', 'subSpeaker', 'cineScene', 'fade']) {
                const el = UI.get(id);
                if (el) el.show(false);
            }
            // Take the glass and the stock layers off the DOM: their data-URI textures are
            // per-film, and a hidden overlay must not keep them (or the flare) alive.
            const fx = UI.get('cineFx');
            if (fx) fx.setHTML('');
        } else {
            this._rebuildFx();
            const sp = UI.get('btnCineSpeed');
            if (sp) sp.setText(this.speed + '×');
        }
    },

    _rebuildFx(tint, timeOfDay) {
        const el = UI.get('cineFx');
        if (!el) return;
        const c = this.cfg();
        const sc = this.tl && this.tl.scenes ? this.tl.scenes[this.si] : null;
        const t = tint != null ? tint : (sc ? sc.tint : null);
        const tod = timeOfDay || (sc ? sc.timeOfDay : 'day');
        const era = this.eraClass(this.tl ? this.tl.year : 1950);
        let html = '<div class="cine-click ' + era + '" data-act="toggle"></div>';
        if (t === 'night' || tod === 'night') html += '<div class="tint-night"></div>';
        else if (t === 'sunset' || tod === 'sunset') html += '<div class="tint-sunset"></div>';
        if (t === 'rain') html += '<div class="tint-rain"></div>';
        html += '<div class="cine-vignette"></div>';
        if (c.grain) html += '<div class="cine-grain"></div>';
        if (era === 'era-silver') html += '<div class="cine-scratches"></div>';
        // The lens glass and the projector lamp: flare rides the anamorphic streaks, dirt and
        // flicker belong to the older stocks (both baked from the film's seed — see _glassFx).
        const glass = this._glassFx();
        if (glass && glass.flare) html += '<div class="cine-flare" style="background-image:url(' + glass.flare + ')"></div>';
        if (c.grain && glass && glass.dirt) html += '<div class="cine-dirt" style="background-image:url(' + glass.dirt + ')"></div>';
        if (c.grain && era !== 'era-clean') html += '<div class="cine-flicker ' + era + '"></div>';
        const pic = UI.get('cineC');
        if (pic && pic.classList) {
            if (era === 'era-silver') pic.classList.add('gate-weave');
            else pic.classList.remove('gate-weave');
        }
        if (this.flashUntil > 0 && this.t <= this.flashUntil) html += '<div class="cine-flash"></div>';
        el.setHTML(html);
    },

    /**
     * The lens glass, baked procedurally from the film's seed: anamorphic streaks (flare) and
     * dust/fibres on the glass (dirt) as data-URI backgrounds for the cine overlay. Every
     * picture scratches its own copy of the glass — deterministic, zero assets. Without a DOM
     * (logic tests) it returns empty textures instead of throwing.
     */
    _glassFx() {
        const U = 'undefined';
        const flareK = typeof CINE_FLARE !== U ? CINE_FLARE : 0.5;
        const dirtK = typeof CINE_DIRT !== U ? CINE_DIRT : 0.55;
        const era = this.eraClass(this.tl ? this.tl.year : 1950);
        const seedKey = String((this.tl && this.tl.seed) || 0) + '|' + era + '|' + flareK + '|' + dirtK;
        if (this._glass && this._glass.seed === seedKey) return this._glass;
        const none = { seed: seedKey, flare: null, dirt: null };
        if (typeof document === U || !document.createElement) { this._glass = none; return none; }
        const W = 640, H = 360;
        const r = (typeof Rng !== U && Rng.create) ? Rng.create('glass-' + seedKey) : null;
        const rnd = r ? () => r.float(0, 1) : Math.random;
        let flare = null, dirt = null;
        if (flareK > 0) {
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d');
            if (g) {
                const n = 3 + Math.floor(rnd() * 3);
                for (let i = 0; i < n; i++) {          // horizontal anamorphic streaks
                    const y = Math.round(H * (0.16 + rnd() * 0.68));
                    const h = 2 + rnd() * 5;
                    const a = (0.10 + rnd() * 0.16) * flareK;
                    const hue = Math.round(190 + rnd() * 30);
                    const grad = g.createLinearGradient(0, y - h * 3, 0, y + h * 3);
                    grad.addColorStop(0, 'hsla(' + hue + ',95%,70%,0)');
                    grad.addColorStop(0.5, 'hsla(' + hue + ',95%,72%,' + a.toFixed(3) + ')');
                    grad.addColorStop(1, 'hsla(' + hue + ',95%,70%,0)');
                    g.fillStyle = grad;
                    g.fillRect(0, y - h * 3, W, h * 6);
                }
                for (let i = 0; i < 2; i++) {          // hot spots where a streak crosses
                    const x = W * (0.2 + rnd() * 0.6), y = H * (0.25 + rnd() * 0.5), rad = 30 + rnd() * 60;
                    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
                    rg.addColorStop(0, 'hsla(196,90%,80%,' + (0.14 * flareK).toFixed(3) + ')');
                    rg.addColorStop(1, 'hsla(196,90%,80%,0)');
                    g.fillStyle = rg;
                    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
                }
                flare = cv.toDataURL();
            }
        }
        if (dirtK > 0 && era !== 'era-clean') {
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d');
            if (g) {
                const mul = era === 'era-silver' ? 1.4 : 1;
                const n = Math.round((50 + 70 * dirtK) * mul);
                for (let i = 0; i < n; i++) {          // dust: dark specks and bright fibres
                    const x = rnd() * W, y = rnd() * H, rad = 0.4 + rnd() * 1.9;
                    const light = rnd() < 0.3;
                    g.fillStyle = light ? 'rgba(255,255,255,' + (0.05 + rnd() * 0.10) * dirtK + ')'
                        : 'rgba(0,0,0,' + (0.06 + rnd() * 0.14) * dirtK + ')';
                    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
                }
                for (let i = 0; i < 5; i++) {          // hairs across the gate
                    const x = rnd() * W, y = rnd() * H;
                    g.strokeStyle = 'rgba(0,0,0,' + (0.05 + rnd() * 0.07) * dirtK + ')';
                    g.lineWidth = 0.8;
                    g.beginPath(); g.moveTo(x, y);
                    g.quadraticCurveTo(x + (rnd() * 30 - 15), y + rnd() * 14, x + rnd() * 40 - 20, y + rnd() * 26);
                    g.stroke();
                }
                dirt = cv.toDataURL();
            }
        }
        this._glass = { seed: seedKey, flare: flare, dirt: dirt };
        return this._glass;
    },

    /** The score steps back while a line is on screen: voices own the mix. */
    _duck(on) {
        if (typeof Sound3D === 'undefined') return;
        const mh = Sound3D._music;
        if (mh && mh.setVolume) mh.setVolume(on ? 0.45 : 1);
    },

    _subtitle(who, text, dur) {
        const member = who == null ? null : (this.tl.cast || []).find((m) => m.id === who);
        this._duck(true);
        const st = UI.get('subText'), sp = UI.get('subSpeaker'), pn = UI.get('subPanel');
        if (st) { st.setText(text); st.show(true); }
        if (sp) { sp.setText(member ? member.role : ''); sp.show(!!member); }
        if (pn) pn.show(true);
        this.subUntil = this.t + dur;
        this.pending.push({ t: this.subUntil, fn: () => this._hideSubtitle() });
    },

    _hideSubtitle() {
        this._duck(false);
        this._speaker = null;      // the line is over: the focus returns to the shot's look-at
        for (const id of ['subText', 'subSpeaker', 'subPanel']) {
            const el = UI.get(id);
            if (el) el.show(false);
        }
    },

    _card(t1, t2, t3, small) {
        const el = UI.get('cineCard');
        if (!el) return;
        const era = this.eraClass(this.tl ? this.tl.year : 1950);
        el.setHTML('<div class="cine-title fadein ' + era + '">' +
            (t1 ? '<div class="t1">' + t1 + '</div>' : '') +
            (t2 ? '<div class="t2"' + (small ? ' style="font-size:30px"' : '') + '>' + t2 + '</div>' : '') +
            (t3 ? '<div class="t3">' + t3 + '</div>' : '') + '</div>');
        el.show(true);
    },

    _cardBig(text) {
        const el = UI.get('cineCard');
        if (!el) return;
        el.setHTML('<div class="cine-title fadein"><div class="t2">' + text + '</div></div>');
        el.show(true);
    },

    _cardSmall(text) {
        const el = UI.get('cineCard');
        if (!el) return;
        el.setHTML('<div class="pause-badge">' + text + '</div>');
        el.show(true);
    },

    _hideCard() {
        const el = UI.get('cineCard');
        if (el) { el.show(false); el.setHTML(''); }
        this.cardT = 0;
    },

    _beginCredits() {
        this.state = 'credits';
        this.creditsT = 0;
        this._fadeTo(1, 0.8, () => {
            const el = UI.get('cineCard');
            if (!el) return;
            const tl = this.tl || {};
            const cr = tl.credits || {};
            const dur = this._creditsDur();
            let rows = '';
            const line = (role, nm) => '<div class="role">' + role + '</div><div class="nm">' + nm + '</div>';
            rows += '<h3>' + (tl.title || 'Без названия') + '</h3>';
            if (cr.director) rows += line('Режиссёр', cr.director);
            if (cr.writer) rows += line('Сценарий', cr.writer);
            if (cr.composer) rows += line('Музыка', cr.composer);
            for (const m of tl.cast || []) rows += line(m.role || '', m.name + (m.star ? ' ★'.repeat(m.star) : ''));
            rows += line('Студия', '«' + (tl.studio || 'Фабрика Грёз') + '»');
            rows += '<div class="fin">К О Н Е Ц</div>';
            el.setHTML('<div class="credits run" style="--crawl:' + dur.toFixed(1) + 's">' + rows + '</div>');
            el.show(true);
            this._fadeTo(0, 0.9, null);
        });
        const cs = UI.get('cineScene');
        if (cs) cs.show(false);
        this._hideSubtitle();
        Sound3D.music(MovieData.MUSIC.studio);
    },

    // --- cast -------------------------------------------------------------------------------

    _buildCast() {
        const view = this._app.location.view;
        this.actors = {};
        for (const m of this.tl.cast || []) {
            const a = ActorRig3D.spawn(view, m.look || {}, { lod: /^e/.test(m.id) ? 'low' : undefined,
                x: this.base.x + 1400, y: this.base.y + 900, h: 0, heading: 0,
            });
            this.actors[m.id] = a;
        }
    },

    // --- shot beat cursor ---------------------------------------------------------------------
    _beatIdx: 0,
    _camSnap: false,
    _fadeDur: 0.7,
    // --- optics state: the rack focus and the lens glass ---------------------------------------
    /** @type {string | null} the actor id whose line is on screen (the focus target). */
    _speaker: null,
    /** @type {number | null} the current focus distance, px from the eye. */
    _focusDist: null,
    _focusSnap: false,
    /** @type {{ seed: string, flare: string | null, dirt: string | null } | null} glass cache. */
    _glass: null,
    /** @type {any} the foreground frame prop of the current shot, if the shot earned one. */
    _fg: null,
};

// The beat cursor resets on every shot switch — hook into _beginShot.
(() => {
    const orig = MovieSequencer._beginShot;
    MovieSequencer._beginShot = function (sh, snap) {
        this._beatIdx = 0;
        orig.call(this, sh, snap);
    };
})();
