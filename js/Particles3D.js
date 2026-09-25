// Particles3D.js — procedural sprite particles (ENGINE layer: pc.*): rain, snow, dust,
// sparks, smoke and fire for the cinema and the lot. One pooled quad mesh per emitter,
// one baked canvas sprite per kind, CPU-stepped positions (the counts are tiny), and the
// transparent instances are registered through View3D.putInLayer — the only path that
// guarantees they enter the layer's transparent composition (engine quirk, PlayArcEngine
// PR #16). Emitters never re-parent: quads are placed once and only move.
//
//   Particles3D.start(view, 'rain', { x, y, h, r, seed })  -> emitter id
//   Particles3D.update(dt)                                 // every frame from MovieSequencer
//   Particles3D.stop(id) / stopAll()
//
// Motion model: fallers (rain/snow/dust) wrap inside a column of `col` px above the emitter
// base; throwers (sparks/smoke/fire) fly ballistically (speed + grav) and respawn at `life`.
// The pure half (specFor) runs without the engine and is covered by tests/fabrika-particles.

/** @satisfies {Record<string, any>} */
const Particles3D = {
    /** @type {Record<string, any>} live emitters by id. */
    _em: {},
    _seq: 0,
    /** @type {Record<string, any>} baked sprite textures per kind. */
    _tex: {},
    /** @type {Record<string, any>} sprite materials per kind. */
    _mat: {},
    _quad: null,
    _dev: null,

    cfg() {
        const U = 'undefined';
        return {
            rain: typeof PART_RAIN_N !== U ? PART_RAIN_N : 120,
            snow: typeof PART_SNOW_N !== U ? PART_SNOW_N : 80,
            dust: typeof PART_DUST_N !== U ? PART_DUST_N : 48,
            sparks: typeof PART_SPARKS_N !== U ? PART_SPARKS_N : 36,
            smoke: typeof PART_SMOKE_N !== U ? PART_SMOKE_N : 18,
            fire: typeof PART_FIRE_N !== U ? PART_FIRE_N : 22,
        };
    },

    /**
     * The behaviour table of a kind (pure — tests hold it in their hands):
     * n — pool size; size — quad edge, px; spread — cylinder radius, px;
     * fallers: fall — px/s down inside a column of `col` px;
     * throwers: up — true, speed — px/s up, grav — px/s² (negative pulls down), life — s;
     * tilt — rain-like streaks lean and yaw-billboard differently; grow — scale over life.
     */
    specFor(kind) {
        const c = this.cfg();
        switch (kind) {
            case 'rain': return { n: c.rain, size: 26, spread: 420, fall: 780, col: 280, up: false, tilt: 0.16, grow: 0 };
            case 'snow': return { n: c.snow, size: 10, spread: 380, fall: 55, col: 280, up: false, tilt: 0, grow: 0 };
            case 'dust': return { n: c.dust, size: 16, spread: 300, fall: 6, col: 120, up: false, tilt: 0, grow: 0 };
            case 'sparks': return { n: c.sparks, size: 7, spread: 26, speed: 150, grav: -420, life: 0.9, up: true, tilt: 0, grow: -0.5 };
            case 'smoke': return { n: c.smoke, size: 60, spread: 22, speed: 55, grav: -10, life: 3.4, up: true, tilt: 0, grow: 1.6 };
            case 'fire': return { n: c.fire, size: 34, spread: 18, speed: 90, grav: -240, life: 0.8, up: true, tilt: 0, grow: -0.4 };
            default: return null;
        }
    },

    // --- sprites: one baked canvas per kind ----------------------------------------------------

    _sprite(view, kind) {
        if (this._tex[kind]) return this._tex[kind];
        if (typeof document === 'undefined' || typeof pc === 'undefined') return null;
        if (!this._dev) this._dev = view.app.graphicsDevice;
        const S = 64;
        const cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const g = cv.getContext('2d');
        if (!g) return null;
        g.clearRect(0, 0, S, S);
        if (kind === 'rain') {
            const grad = g.createLinearGradient(S * 0.5, 0, S * 0.5, S);
            grad.addColorStop(0, 'rgba(210,225,245,0)');
            grad.addColorStop(0.5, 'rgba(215,230,250,0.75)');
            grad.addColorStop(1, 'rgba(210,225,245,0)');
            g.fillStyle = grad;
            g.fillRect(S * 0.44, 0, S * 0.12, S);
        } else if (kind === 'sparks' || kind === 'snow') {
            const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
            const col = kind === 'sparks' ? '255,190,90' : '255,255,255';
            rg.addColorStop(0, 'rgba(' + col + ',0.95)');
            rg.addColorStop(0.4, 'rgba(' + col + ',0.5)');
            rg.addColorStop(1, 'rgba(' + col + ',0)');
            g.fillStyle = rg;
            g.fillRect(0, 0, S, S);
        } else {
            // dust / smoke / fire: a soft puff with a lumpy edge
            const base = kind === 'fire' ? '255,150,60' : (kind === 'smoke' ? '90,90,96' : '196,176,132');
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const rr = S * (0.16 + (i % 3) * 0.05);
                const x = S / 2 + Math.cos(a) * S * 0.13, y = S / 2 + Math.sin(a) * S * 0.13;
                const rg = g.createRadialGradient(x, y, 0, x, y, rr);
                rg.addColorStop(0, 'rgba(' + base + ',' + (kind === 'fire' ? 0.5 : 0.32) + ')');
                rg.addColorStop(1, 'rgba(' + base + ',0)');
                g.fillStyle = rg;
                g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
            }
        }
        const tex = new pc.Texture(this._dev, {
            name: 'part-' + kind, width: S, height: S, format: pc.PIXELFORMAT_RGBA8,
            mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
            addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        });
        tex.setSource(cv);
        this._tex[kind] = tex;
        return tex;
    },

    _material(view, kind) {
        if (this._mat[kind]) return this._mat[kind];
        const tex = this._sprite(view, kind);
        if (!tex) return null;
        const m = new pc.StandardMaterial();
        m.name = 'part-' + kind;
        m.diffuse = new pc.Color(0, 0, 0);
        m.emissive = new pc.Color(1, 1, 1);
        m.emissiveMap = tex;
        m.opacityMap = tex;
        m.useLighting = false;
        m.blendType = pc.BLEND_PREMULTIPLIED;
        m.depthWrite = false;
        m.cull = pc.CULLFACE_NONE;
        m.update();
        this._mat[kind] = m;
        return m;
    },

    _quadMesh(view) {
        if (this._quad) return this._quad;
        const pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
        const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
        const uv = [0, 1, 1, 1, 1, 0, 0, 0];
        const idx = [0, 1, 2, 0, 2, 3];
        const m = new pc.Mesh(view.app.graphicsDevice);
        m.setPositions(pos);
        m.setNormals(nor);
        m.setUvs(0, uv);
        m.setIndices(idx);
        m.update(pc.PRIMITIVE_TRIANGLES);
        // The quad is SHARED by every emitter, but a MeshInstance holds a ref on its mesh
        // and MeshInstance.destroy releases it: when stopAll() kills the last emitter of a
        // scene, the engine destroys the cached quad and the next scene builds its particles
        // on a dead mesh (the western→forest 'impl' render crash). The cache keeps its own
        // permanent ref; dispose() destroys the mesh explicitly.
        m.incRefCount();
        this._quad = m;
        return m;
    },

    // --- emitters -------------------------------------------------------------------------------

    /**
     * Spawn a pooled emitter of a kind at a map point (x, y) with a base height h and a
     * cylinder radius r. seed makes the initial scatter deterministic (a rewatch matches).
     * @returns {string | null} the emitter id, or null when the engine cannot draw it here.
     */
    start(view, kind, opts) {
        const o = opts || {};
        const spec = this.specFor(kind);
        if (!spec || !view) return null;
        const mat = this._material(view, kind);
        if (!mat) return null;
        const quad = this._quadMesh(view);
        const r = (typeof Rng !== 'undefined' && Rng.create) ? Rng.create('part-' + kind + '-' + (o.seed || 0)) : null;
        const rnd = r ? () => r.float(0, 1) : Math.random;
        const id = kind + '#' + (++this._seq);
        const spread = o.r != null ? o.r : spec.spread;
        const baseH = o.h != null ? o.h : 0;
        const parts = [];
        const root = new pc.Entity('part-' + id);
        view.root.addChild(root);
        for (let i = 0; i < spec.n; i++) {
            const e = new pc.Entity('p' + i);
            root.addChild(e);
            e.addComponent('render', { layers: [pc.LAYERID_WORLD] });
            e.render.meshInstances = [new pc.MeshInstance(quad, mat, e)];
            // The engine quirk guard lives in putInLayer: register the transparent instance
            // through it so the layer's transparent composition picks the quad up.
            view.putInLayer(e.render.meshInstances[0], pc.LAYERID_WORLD);
            e.render.meshInstances[0].castShadow = false;
            e.render.meshInstances[0].receiveShadow = false;
            parts.push({
                e: e,
                a: rnd() * Math.PI * 2,
                rad: Math.sqrt(rnd()) * spread,
                off: rnd() * (spec.up ? 1 : spec.col),
                t: rnd() * (spec.up ? spec.life : 1),
                s: 0.7 + rnd() * 0.6,
                ph: rnd() * 6.283,
            });
        }
        this._em[id] = {
            id: id, kind: kind, view: view, root: root, parts: parts, spec: spec,
            x: o.x != null ? o.x : 0, y: o.y != null ? o.y : 0, h: baseH, spread: spread, t: 0,
        };
        this._place(this._em[id]);
        return id;
    },

    /** Height of a particle over its emitter base at its own clock. */
    _heightOf(em, p) {
        const spec = em.spec;
        if (spec.up) {
            const t = p.t % spec.life;
            return em.h + spec.speed * t + 0.5 * spec.grav * t * t;
        }
        const col = spec.col;
        const fall = (p.off + spec.fall * em.t) % col;
        return em.h + col - fall;
    },

    _place(em) {
        const spec = em.spec;
        for (const p of em.parts) {
            const wx = em.x + Math.cos(p.a) * p.rad;
            const wy = em.y + Math.sin(p.a) * p.rad;
            p.e.setPosition(-wx, this._heightOf(em, p), wy);   // map -> mirrored world
            const g = 1 + (spec.grow || 0) * (spec.up ? (p.t % spec.life) / spec.life : 0);
            p.e.setLocalScale(spec.size * p.s * g, spec.size * p.s * g * (spec.tilt ? 3.2 : 1), 1);
        }
    },

    stop(id) {
        const em = this._em[id];
        if (!em) return;
        try { em.root.destroy(); } catch (e) { /* gone */ }
        delete this._em[id];
    },

    stopAll() {
        for (const id of Object.keys(this._em)) this.stop(id);
    },

    /** CPU step: fall or fly, drift, respawn; billboards face the eye every frame. */
    update(dt) {
        const step = Math.max(0, Math.min(0.1, dt));
        if (!step) return;
        for (const id of Object.keys(this._em)) {
            const em = this._em[id];
            const spec = em.spec;
            em.t += step;
            const cam = em.view.camEntity;
            const cp = cam ? cam.getPosition() : null;
            for (const p of em.parts) {
                if (spec.up) {
                    p.t += step;
                    if (p.t >= spec.life) { p.t -= spec.life; p.a = (p.a + 2.39996) % 6.283; p.rad = Math.sqrt(((p.rad / em.spread) ** 2 + 0.37) % 1) * em.spread; }
                }
                const drift = Math.sin(em.t * (spec.tilt ? 3 : 0.7) + p.ph) * (spec.tilt ? 26 : 8) * step;
                const wx = em.x + Math.cos(p.a) * p.rad + drift;
                const wy = em.y + Math.sin(p.a) * p.rad;
                const h = this._heightOf(em, p);
                p.e.setPosition(-wx, h, wy);
                if (cp) p.e.setEulerAngles(0, Math.atan2(cp.x + wx, cp.z - wy) * 180 / Math.PI, spec.tilt ? -9 : 0);
                const g = 1 + (spec.grow || 0) * (spec.up ? (p.t % spec.life) / spec.life : 0);
                p.e.setLocalScale(spec.size * p.s * g, spec.size * p.s * g * (spec.tilt ? 3.2 : 1), 1);
            }
        }
    },

    dispose() {
        this.stopAll();
        for (const k of Object.keys(this._mat)) { try { this._mat[k].destroy(); } catch (e) { /* gone */ } }
        for (const k of Object.keys(this._tex)) { try { this._tex[k].destroy(); } catch (e) { /* gone */ } }
        this._mat = {};
        this._tex = {};
        // The cache holds the quad's permanent ref (see _quadMesh): destroy it here.
        try { if (this._quad) this._quad.destroy(); } catch (e) { /* gone */ }
        this._quad = null;
        this._dev = null;
    },
};
