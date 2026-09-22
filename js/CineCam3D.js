// CineCam3D.js — the cinematic camera (ENGINE layer: drives ArcCamera directly).
// During a film playback the MovieSequencer owns the camera: begin() takes it over from the
// CameraController (flight keys off, pointer ignored), setPose() gives a shot in MAP space
// (look-at point x/y/h, azimuth/pitch degrees, zoom = screen px per world px, roll degrees,
// fov degrees), update(dt) glides the current pose toward the target (or snaps on a cut) and
// writes it onto view.camera every frame — main.js calls capture() AFTER camera.update(dt),
// so the controller's pose never fights the cinematic one. end() hands the camera back,
// synced to where the film left it.
//
//   CineCam3D.begin(app.camera);
//   CineCam3D.setPose({ x: 3200, y: 3240, h: 90, az: 90, pitch: 8, zoom: 3.4, roll: -6, fov: 40 }, true);
//   CineCam3D.update(dt);   // each frame
//   CineCam3D.end();        // the controller resumes from the last pose

/** @satisfies {Record<string, any>} */
const CineCam3D = {
    DEG: Math.PI / 180,
    active: false,
    /** @type {CameraController | null} */
    ctrl: null,
    /** @type {View3D | null} */
    view: null,
    /** @type {CinePose | null} */ cur: null,
    /** @type {CinePose | null} */ tgt: null,
    lerp: 6,               // 1/s toward the target pose (MOVIE_CAM_LERP)
    speedMul: 1,           // playback speed scales the glide too
    _shakeUntil: 0,
    _shakeAmp: 0,

    isActive() { return this.active; },

    _defaultPose() {
        return { x: 0, y: 0, h: 60, az: -90, pitch: 55, zoom: 1, roll: 0, fov: 52 };
    },

    // camera — the kit's CameraController (app.camera).
    begin(camera) {
        if (this.active) return;
        this.ctrl = camera;
        this.view = camera.view;
        this.active = true;
        camera.follow(null);
        camera.flightKeys = false;
        camera.ignorePointer = () => true;
        const U = 'undefined';
        this.lerp = typeof MOVIE_CAM_LERP !== U ? MOVIE_CAM_LERP : 6;
        const t = camera.target;
        this.cur = {
            x: t.x, y: t.y, h: t.h,
            az: camera.azimuth / this.DEG, pitch: camera.pitch / this.DEG,
            zoom: camera.zoom, roll: 0, fov: camera.cam.fov / this.DEG,
        };
        this.tgt = Object.assign({}, this.cur);
    },

    /** A new shot pose (any subset of fields); snap — a hard cut instead of a glide. */
    setPose(pose, snap) {
        if (!this.active) return;
        this.tgt = Object.assign(this._defaultPose(), this.tgt, pose || {});
        if (snap) this.cur = Object.assign({}, this.tgt);
    },

    /** Action shake: intensity — fraction of the frame (0.02 light, 0.1 heavy). */
    shake(ms, intensity) {
        this._shakeAmp = Math.max(this._shakeAmp, Math.min(60, (intensity || 0.02) * 600));
        this._shakeUntil = performance.now() + (ms || 250);
    },

    update(dt) {
        if (!this.active || !this.cur || !this.tgt || !this.view) return;
        const k = 1 - Math.exp(-Math.max(0.1, this.lerp * this.speedMul) * dt);
        const c = this.cur, t = this.tgt;
        c.x += (t.x - c.x) * k;
        c.y += (t.y - c.y) * k;
        c.h += (t.h - c.h) * k;
        // The azimuth glides the short way around the circle.
        let dAz = ((t.az - c.az + 540) % 360) - 180;
        c.az += dAz * k;
        c.pitch += (t.pitch - c.pitch) * k;
        c.zoom += (t.zoom - c.zoom) * k;
        c.roll += (t.roll - c.roll) * k;
        c.fov += (t.fov - c.fov) * k;
        this._write();
    },

    // Current pose -> the camera entity (eye from the look-at point like CameraController._eye).
    _write() {
        const c = this.cur, view = this.view;
        const cam = view.camera;
        const canvas = view.world.canvas;
        const ch = (canvas && canvas.clientHeight) || 720;
        const fovRad = Math.max(12, Math.min(110, c.fov)) * this.DEG;
        const dist = ch / (2 * Math.tan(fovRad / 2) * Math.max(0.05, c.zoom));
        const az = c.az * this.DEG, pitch = c.pitch * this.DEG;
        let ex = c.x - Math.cos(az) * Math.cos(pitch) * dist;
        let ey = c.y - Math.sin(az) * Math.cos(pitch) * dist;
        let eh = c.h + Math.sin(pitch) * dist;
        let tx = c.x, ty = c.y, th = c.h;
        const now = performance.now();
        if (this._shakeUntil > now) {
            const a = this._shakeAmp * Math.min(1, (this._shakeUntil - now) / 250);
            ex += (Math.random() * 2 - 1) * a;
            ey += (Math.random() * 2 - 1) * a;
            eh += (Math.random() * 2 - 1) * a * 0.5;
            tx += (Math.random() * 2 - 1) * a * 0.4;
            ty += (Math.random() * 2 - 1) * a * 0.4;
        } else this._shakeAmp = 0;
        cam.fov = fovRad;
        cam.position.set(ex, eh, ey);                 // ArcCamera: x — map x, y — height, z — map y
        cam.setTarget({ x: tx, y: th, z: ty });
        if (Math.abs(c.roll) > 0.01) view.camEntity.rotateLocal(0, 0, c.roll);
        // Keep the controller's state in sync: Sound3D hears from the controller's eye
        // (main.js calls Sound3D.update(camera) with it), and end() resumes from here.
        const ctrl = this.ctrl;
        if (ctrl) {
            ctrl.target.x = tx; ctrl.target.y = ty; ctrl.target.h = th;
            ctrl.azimuth = c.az * this.DEG;
            ctrl.pitch = c.pitch * this.DEG;
            ctrl.zoom = ctrl.zoomTarget = c.zoom;
        }
        // Keep the shadow frustum around the shot (the controller did it for its own pose).
        view.fitShadowFrustum(c.x, c.y, c.h, dist * 0.8 + 120);
    },

    // main.js calls this right after camera.update(dt) while a film plays.
    capture() {
        if (this.active) this._write();
    },

    /** Hand the camera back to the controller, synced to the last cinematic pose. */
    end() {
        if (!this.active || !this.ctrl || !this.cur) { this.active = false; return; }
        const c = this.cur, ctrl = this.ctrl;
        ctrl.target.x = c.x;
        ctrl.target.y = c.y;
        ctrl.target.h = c.h;
        ctrl.lift = 0;
        ctrl.azimuth = c.az * this.DEG;
        ctrl.pitch = Math.max(20 * this.DEG, Math.min(88 * this.DEG, c.pitch * this.DEG));
        ctrl.zoomTarget = ctrl.zoom = Math.max(0.12, Math.min(6, c.zoom));
        ctrl.flightKeys = true;
        ctrl.ignorePointer = null;
        ctrl.cam.fov = ctrl.c.fov * this.DEG;
        ctrl._apply();
        this.active = false;
        this.ctrl = null;
        this.view = null;
        this.cur = null;
        this.tgt = null;
    },
};
