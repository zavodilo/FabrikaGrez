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
            fovClose: typeof MOVIE_FOV_CLOSE !== U ? MOVIE_FOV_CLOSE : 40,
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
        this._buildCast();
        CineCam3D.begin(app.camera);
        Sound3D.music(null);
        this._proj = Sound3D.play(MovieData.SFX.projector, { loop: true, volume: 0.16, x: this.base.x, y: this.base.y });
        const genre = MovieData.GENRES[tl.genre] || MovieData.GENRES.drama;
        Sound3D.music(MovieData.MUSIC[tl.music || genre.music] || MovieData.MUSIC.studio);

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
        this._stepPending();
        this._stepProps(t);
        this._stepRides();
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

    // --- scenes & shots ---------------------------------------------------------------------

    _enterScene(i, first) {
        const sc = this.tl.scenes[i];
        if (!sc) { this._beginCredits(); return; }
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
        // Atmosphere.
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
        const cs = UI.get('cineScene');
        if (cs && this.tl.scenes[this.si]) cs.setText(this.tl.scenes[this.si].label || '');
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
        const def = { roll: 0, fov: 52 };
        const type = cam.type || 'wide';
        const at = (id) => {
            const a = this.actors[id];
            return a ? { x: a.x, y: a.y, h: a.h, heading: a.heading } : null;
        };
        let p = { x: this.base.x, y: this.base.y, h: 60, az: -90, pitch: 50, zoom: 0.9, roll: 0, fov: 52 };
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
            if ((type === 'close' || type === 'dutch') && cam.fov == null) p.fov = this.cfg().fovClose;
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
        return p;
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
        let html = '<div class="cine-click" data-act="toggle"></div>';
        if (t === 'night' || tod === 'night') html += '<div class="tint-night"></div>';
        else if (t === 'sunset' || tod === 'sunset') html += '<div class="tint-sunset"></div>';
        if (t === 'rain') html += '<div class="tint-rain"></div>';
        html += '<div class="cine-vignette"></div>';
        if (c.grain) html += '<div class="cine-grain"></div>';
        if (this.flashUntil > 0 && this.t <= this.flashUntil) html += '<div class="cine-flash"></div>';
        el.setHTML(html);
    },

    _subtitle(who, text, dur) {
        const member = who == null ? null : (this.tl.cast || []).find((m) => m.id === who);
        const st = UI.get('subText'), sp = UI.get('subSpeaker'), pn = UI.get('subPanel');
        if (st) { st.setText(text); st.show(true); }
        if (sp) { sp.setText(member ? member.role : ''); sp.show(!!member); }
        if (pn) pn.show(true);
        this.subUntil = this.t + dur;
        this.pending.push({ t: this.subUntil, fn: () => this._hideSubtitle() });
    },

    _hideSubtitle() {
        for (const id of ['subText', 'subSpeaker', 'subPanel']) {
            const el = UI.get(id);
            if (el) el.show(false);
        }
    },

    _card(t1, t2, t3, small) {
        const el = UI.get('cineCard');
        if (!el) return;
        el.setHTML('<div class="cine-title fadein">' +
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
            const a = ActorRig3D.spawn(view, m.look || {}, {
                x: this.base.x + 1400, y: this.base.y + 900, h: 0, heading: 0,
            });
            this.actors[m.id] = a;
        }
    },

    // --- shot beat cursor ---------------------------------------------------------------------
    _beatIdx: 0,
    _camSnap: false,
    _fadeDur: 0.7,
};

// The beat cursor resets on every shot switch — hook into _beginShot.
(() => {
    const orig = MovieSequencer._beginShot;
    MovieSequencer._beginShot = function (sh, snap) {
        this._beatIdx = 0;
        orig.call(this, sh, snap);
    };
})();
