// Game.js — «Фабрика Грёз»: the game shell on top of the kit. Boots the studio lot
// (SetPieces3D), the ambience crowd (ActorRig3D), the HUD and the screens (UI 'screen'
// elements fed by StudioUI), runs the weekly tick (StudioManager) and hands the camera to
// the MovieSequencer for film playback (demo film, dailies, the cinema).
// Agent-facing: no pc.* here — only the semantic layer and the game's own modules.

class Game {
    /** @param {{ location: Location3D, camera: CameraController }} app */
    constructor(app) {
        this.app = app;
        this.view = app.location.view;
        this.lot = null;
        /** @type {ActorHandle[]} */
        this.crowd = [];
        this.hudOn = false;
        this.screen = 'none';        // none | menu | studio | people | films | cinema | more | help | newmovie | casting | …
        this._toastQueue = [];
        this._toastUntil = 0;
        this._hudT = 0;
        this._crowdT = 0;

        const U = 'undefined';
        const LX = typeof STUDIO_LOT_X !== U ? STUDIO_LOT_X : 1000;
        const LY = typeof STUDIO_LOT_Y !== U ? STUDIO_LOT_Y : 1100;

        // The lot: buildings, plaza, gate — one static build.
        this.lot = SetPieces3D.buildLot(this.view, LX, LY);

        // A welcoming frame: the gate and the plaza from the south.
        app.camera.lookAt(LX, LY + 120);
        app.camera.zoomTarget = app.camera.zoom = 0.85;
        app.camera.flightKeys = true;

        // The ambience crowd: a few townsfolk strolling the lot.
        this._spawnCrowd(4);

        this._wireUi();
        StudioManager.init(this);
        // The master volume survives sessions even before a save exists.
        try {
            const v = Number(Store.get('fg.volume'));
            if (Number.isFinite(v) && v >= 0 && v <= 1 && typeof Sound3D !== 'undefined' && Sound3D.master) {
                Sound3D.master.gain.value = v;
            }
        } catch (e) { /* a closed storage is not a reason to fail the boot */ }
        this._autoWeekT = 0;
        this._tipT = 0;
        this.toMenu();
        Kit.onFrame('game-music', () => { /* music starts on the first user gesture (browser rule) */ });
    }

    // --- ambience -------------------------------------------------------------------------

    _spawnCrowd(n) {
        const r = Rng.create('crowd-' + n);
        for (let i = 0; i < n; i++) {
            const look = PeopleSystem.randomLook(r);
            const wp = this.lot.waypoints[i % this.lot.waypoints.length];
            const a = ActorRig3D.spawn(this.view, look, { x: wp.x, y: wp.y, heading: 0 });
            a.gesture = i % 3;
            this.crowd.push(a);
            this._stroll(a, r);
        }
    }

    _stroll(a, r) {
        const rr = r || Rng.create((a.id * 7919) >>> 0);
        const wps = this.lot ? this.lot.waypoints : [];
        if (!wps.length) return;
        const wp = rr.pick(wps);
        const pause = rr.range(2, 7);
        a.walkTo(wp.x + rr.range(-60, 60), wp.y + rr.range(-60, 60), rr.range(65, 130), 'idle', () => {
            a.act(rr.pick(['idle', 'idle', 'talk', 'crew', 'wave', 'gesture']));
            a._strollAt = Kit.time() + pause;
        });
        a._strollAt = Kit.time() + 30;
    }

    _updateCrowd() {
        for (const a of this.crowd) {
            if (!a.moveTarget && a._strollAt != null && Kit.time() >= a._strollAt) {
                a._strollAt = null;
                this._stroll(a);
            }
        }
    }

    // --- UI wiring -------------------------------------------------------------------------

    _wireUi() {
        const main = UI.get('screenMain');
        const modal = UI.get('screenModal');
        if (main) main.onAction((act, el) => this.onAction(act, el, main));
        if (modal) modal.onAction((act, el) => this.onAction(act, el, modal));

        const nav = {
            btnNavStudio: () => this.showScreen('studio'),
            btnNavPeople: () => this.showScreen('people'),
            btnNavFilms: () => this.startNewMovie(),
            btnNavCinema: () => this.showScreen('cinema'),
            btnNavMore: () => this.showScreen('more'),
            btnWeek: () => this.nextWeek(),
        };
        for (const id of Object.keys(nav)) {
            const b = UI.get(id);
            if (b) b.onClick(nav[id]);
        }

        // Cinema transport.
        const bp = UI.get('btnCinePlay');
        if (bp) bp.onClick(() => MovieSequencer.togglePause());
        const bs = UI.get('btnCineSpeed');
        if (bs) bs.onClick(() => {
            const nx = MovieSequencer.speed === 1 ? 2 : MovieSequencer.speed === 2 ? 0.5 : 1;
            MovieSequencer.setSpeed(nx);
        });
        const bx = UI.get('btnCineStop');
        if (bx) bx.onClick(() => MovieSequencer.stop(false));

        // The cineFx screen carries the click-catcher (pause on a click over the picture).
        const fx = UI.get('cineFx');
        if (fx) fx.onAction((act) => { if (act === 'toggle') MovieSequencer.togglePause(); });
        const card = UI.get('cineCard');
        if (card) card.onAction((act) => { if (act === 'toggle') MovieSequencer.togglePause(); });

        // Keyboard: space — pause, esc — leave the cinema / close a screen.
        window.addEventListener('keydown', (e) => {
            if (MovieSequencer.playing) {
                if (e.code === 'Space') { e.preventDefault(); MovieSequencer.togglePause(); }
                else if (e.code === 'Escape') MovieSequencer.stop(false);
                return;
            }
            if (e.code === 'Escape' && this.screen !== 'none' && this.screen !== 'menu') this.showScreen('none');
            // Hotkeys: 1..5 walk the five screens, W turns the week. Only when the lot is on
            // screen and no film plays, so a typing player never loses a picture.
            if (!this.started || MovieSequencer.playing) return;
            const screens = { Digit1: 'studio', Digit2: 'people', Digit3: 'newmovie', Digit4: 'cinema', Digit5: 'more' };
            if (screens[e.code]) { e.preventDefault(); this.showScreen(screens[e.code]); return; }
            if (e.code === 'KeyW' && this.screen === 'none') { e.preventDefault(); this.nextWeek(); }
        });
    }

    // A click inside a 'screen' element: data-act="name" (UIElement delegation).
    onAction(act, el, screenEl) {
        StudioUI.onAction(this, act, el, screenEl);
    }

    // --- screens ---------------------------------------------------------------------------

    toMenu() {
        this.started = false;
        this._setHud(false);
        this.screen = 'menu';
        const main = UI.get('screenMain');
        if (main) { main.setHTML(StudioUI.menu(this)); main.show(true); }
    }

    showScreen(name) {
        if (!this.started && name !== 'menu' && name !== 'help') { name = 'menu'; }
        this.screen = name;
        const main = UI.get('screenMain');
        if (!main) return;
        if (name === 'none') { main.show(false); main.setHTML(''); return; }
        main.setHTML(StudioUI.render(this, name));
        main.show(true);
        main.el.scrollTop = 0;
        const inner = main.inner;
        if (inner) inner.scrollTop = 0;
    }

    refreshScreen() {
        if (this.screen !== 'none' && this.screen !== 'menu' || this.screen === 'menu') {
            const main = UI.get('screenMain');
            if (main && main.visible) this.showScreen(this.screen);
        }
    }

    modal(html) {
        const m = UI.get('screenModal');
        if (!m) return;
        m.setHTML(html);
        m.show(true);
    }

    closeModal() {
        const m = UI.get('screenModal');
        if (m) { m.show(false); m.setHTML(''); }
    }

    // --- HUD --------------------------------------------------------------------------------

    _setHud(on) {
        this.hudOn = on;
        for (const id of ['hudPanel', 'hudLogo', 'hudMoney', 'hudDate', 'hudFans',
            'btnNavStudio', 'btnNavPeople', 'btnNavFilms', 'btnNavCinema', 'btnNavMore', 'btnWeek']) {
            const el = UI.get(id);
            if (el) el.show(on);
        }
    }

    _updateHud(dt) {
        this._hudT -= dt;
        if (this._hudT > 0) return;
        this._hudT = 0.25;
        const S = StudioManager.state;
        // Before «Новая игра» there is no studio state yet (StudioManager.state === null), so the
        // counters stay dark — dereferencing it here used to throw every 0.25 s on the main menu.
        if (S) {
            const money = UI.get('hudMoney');
            if (money) money.setText(StudioUI.money(S.cash));
            const date = UI.get('hudDate');
            if (date) date.setText(StudioUI.dateLong(S));
            const fans = UI.get('hudFans');
            if (fans) fans.setText('♥ поклонники ' + Math.round(S.fans));
        }
        // Toasts.
        const now = Kit.time();
        if (this._toastUntil && now > this._toastUntil) {
            this._toastUntil = 0;
            const tp = UI.get('toastPanel'), tt = UI.get('toastText');
            if (tp) tp.show(false);
            if (tt) tt.show(false);
            if (this._toastQueue.length) this.toast(this._toastQueue.shift());
        }
    }

    toast(msg) {
        // The cinema owns the frame: a management toast over the picture would spoil it, so it
        // waits in the queue and shows up when the film is over.
        if (typeof MovieSequencer !== 'undefined' && MovieSequencer.playing) { this._toastQueue.push(msg); return; }
        if (this._toastUntil > Kit.time()) { this._toastQueue.push(msg); return; }
        const tp = UI.get('toastPanel'), tt = UI.get('toastText');
        if (!tp || !tt) return;
        tt.setText(msg);
        tp.show(true);
        tt.show(true);
        this._toastUntil = Kit.time() + 4;
    }

    // --- the week ------------------------------------------------------------------------------

    nextWeek() {
        if (!this.started || MovieSequencer.playing) return;
        const report = StudioManager.tickWeek();
        for (const line of report.toasts) this.toast(line);
        this.refreshScreen();
        this._updateHud(999);
    }

    // --- cinema ---------------------------------------------------------------------------------

    playMovie(timeline, opts) {
        const o = Object.assign({
            onEnd: () => {
                this._setHud(this.started);
                const LX = typeof STUDIO_LOT_X !== 'undefined' ? STUDIO_LOT_X : 1000;
                const LY = typeof STUDIO_LOT_Y !== 'undefined' ? STUDIO_LOT_Y : 1100;
                this.app.camera.lookAt(LX, LY + 120);
                this.app.camera.zoomTarget = 0.85;
                if (this.started) this.showScreen(this.screen === 'menu' ? 'none' : this.screen);
                else this.toMenu();
                this.refreshScreen();
            },
        }, opts || {});
        this._setHud(false);
        const main = UI.get('screenMain'), modal = UI.get('screenModal');
        if (main) main.show(false);
        if (modal) modal.show(false);
        // Put an on-screen toast back in the queue: the frame belongs to the picture.
        if (this._toastUntil) {
            const tt = UI.get('toastText');
            if (tt && tt._text) this._toastQueue.unshift(tt._text);
            this._toastUntil = 0;
        }
        for (const id of ['toastPanel', 'toastText']) { const el = UI.get(id); if (el) el.show(false); }
        MovieSequencer.play(timeline, o);
    }

    startNewMovie() {
        if (!this.started) return;
        this.showScreen('newmovie');
    }

    // --- the frame ------------------------------------------------------------------------------

    update(dt) {
        if (MovieSequencer.playing) {
            MovieSequencer.update(dt);
            if (!MovieSequencer.paused) ActorRig3D.update(dt);
            return;
        }
        ActorRig3D.update(dt);
        this._crowdT -= dt;
        if (this._crowdT <= 0) { this._crowdT = 0.5; this._updateCrowd(); }
        this._updateHud(dt);
        if (this.started) {
            StudioManager.update(dt);
            // The tutorial speaks at most once a second and only while the lot is on screen.
            this._tipT -= dt;
            if (this._tipT <= 0) {
                this._tipT = 1;
                if (typeof Tutorial !== 'undefined' && this.screen === 'none') Tutorial.maybeTip(this);
            }
            // An auto-week cadence for players who want the calendar to flow by itself.
            const aw = StudioManager.state && StudioManager.state.settings ? StudioManager.state.settings.autoWeek : 0;
            if (aw > 0 && this.screen === 'none' && !MovieSequencer.playing) {
                this._autoWeekT += dt;
                if (this._autoWeekT >= aw) { this._autoWeekT = 0; this.nextWeek(); }
            }
        }
    }
}
