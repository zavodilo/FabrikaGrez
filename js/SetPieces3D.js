// SetPieces3D.js — procedural toon sets, props and studio buildings (ENGINE layer: pc.*).
// Everything is built from three shared unit meshes (box, cone/cylinder, gem) and per-color
// cached materials — no files, no licences, deterministic, cheap. Registered through
// World3D.addObject(view, root, 'prop') so toon bands, ink edges, shadows and the silhouette
// outline apply like on any kit object.
//
// Local coordinates of a builder: lx — right (map +x), ly — down the map (+y), h — up.
// Parts are placed by their BOTTOM height (B/C) or center (G); finish() mirrors the whole
// group into the world at a base point, exactly like Location3D.placeObject.
//
//   const s = SetPieces3D.buildSet(view, 'western', 3200, 3200);   // -> { root, anchors, id }
//   SetPieces3D.moveTo(s, x, y, headingDeg);                        // re-place a handle
//   SetPieces3D.dispose(s);
//   const p = SetPieces3D.buildProp(view, 'car', x, y, headingDeg);
//   const lot = SetPieces3D.buildLot(view, cx, cy);                 // studio lot + waypoints
//
// 'glow' parts get an unlit material (screens, lamps, fire) — the toon pass skips them.

/** @satisfies {Record<string, any>} */
const SetPieces3D = {
    DEG: Math.PI / 180,
    /** @type {Map<string, pc.StandardMaterial>} */
    _glowMats: new Map(),
    /** @type {pc.Mesh | null} */ _cone: null,
    /** @type {pc.Mesh | null} */ _cyl: null,
    /** @type {pc.Mesh | null} */ _gem: null,
    _b: null,
    /** Set builders by id (filled below). @type {Record<string, (S: any) => void>} */
    SETS: {},
    /** Prop builders by id (filled below). @type {Record<string, (S: any) => void>} */
    PROPS: {},
    /** The studio lot builder (assigned below). @type {((view: View3D, cx: number, cy: number) => SetHandle) | null} */
    buildLot: null,

    // --- shared meshes ---------------------------------------------------------------

    _guarded(view, positions) {
        const indices = new Uint32Array(positions.length / 3);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        let normals = Mesh3D.normals(positions, indices);
        if (Mesh3D._inward(positions, normals)) {
            for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
            for (let t = 0; t < indices.length; t += 3) {
                const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp;
            }
        }
        const w = Debug3D.windingAgainstNormals(positions, normals, indices, 20000);
        if (w.total && w.against > 0.5) {
            for (let t = 0; t < indices.length; t += 3) {
                const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp;
            }
            const again = Debug3D.windingAgainstNormals(positions, normals, indices, 20000);
            if (again.total && again.against > 0.5) {
                for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
            }
        }
        const mesh = new pc.Mesh(view.world.app.graphicsDevice);
        mesh.setPositions(positions);
        mesh.setNormals(normals);
        mesh.setIndices(indices);
        mesh.update(pc.PRIMITIVE_TRIANGLES);
        return mesh;
    },

    // Unit cone: radius 0.5, height 1, CENTERED on the origin (base −0.5, apex +0.5),
    // 10 sides — every part entity is placed at its center, like the unit box.
    coneMesh(view) {
        if (!this._cone) this._cone = this._guarded(view, Procedural3D._cone(0.5, 1, 10, 0, -0.5, 0, null));
        return this._cone;
    },

    cylMesh(view) {
        if (this._cyl) return this._cyl;
        // A frustum with equal radii: side quads + two fan caps, unit r 0.5, h 1, centered.
        const seg = 10, out = [];
        const ring = (/** @type {number} */ y) => {
            const r = [];
            for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; r.push([Math.cos(a) * 0.5, y, Math.sin(a) * 0.5]); }
            return r;
        };
        const b = ring(-0.5), t = ring(0.5);
        for (let i = 0; i < seg; i++) {
            const j = (i + 1) % seg;
            out.push(...b[i], ...b[j], ...t[j], ...b[i], ...t[j], ...t[i]);
        }
        for (let i = 1; i < seg - 1; i++) out.push(...b[0], ...b[i + 1], ...b[i]);
        for (let i = 1; i < seg - 1; i++) out.push(...t[0], ...t[i], ...t[i + 1]);
        this._cyl = this._guarded(view, out);
        return this._cyl;
    },

    gemMesh(view) {
        if (this._gem) return this._gem;
        const v = [[0.5, 0, 0], [-0.5, 0, 0], [0, 0.5, 0], [0, -0.5, 0], [0, 0, 0.5], [0, 0, -0.5]];
        const f = [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 0, 2, 0, 3, 5, 5, 3, 1, 1, 3, 4, 4, 3, 0];
        const out = [];
        for (const i of f) out.push(...v[i]);
        this._gem = this._guarded(view, out);
        return this._gem;
    },

    // Unlit emissive material (screens, fire, lamps), cached per color.
    glowMat(hex) {
        const key = String(hex || '#ffffff').toLowerCase();
        let m = this._glowMats.get(key);
        if (m) return m;
        const v = parseInt(key.slice(1), 16);
        const lin = (/** @type {number} */ c) => {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        m = /** @type {ArcMaterial} */ (new pc.StandardMaterial());
        m.name = 'glow-' + key;
        m.diffuse = new pc.Color(lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255));
        m.emissive = new pc.Color(lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255));
        m.useLighting = false;
        m.update();
        this._glowMats.set(key, m);
        return m;
    },

    // --- builder ----------------------------------------------------------------------

    begin() {
        this._b = { parts: [], anchors: {}, shell: [] };
        return this;
    },

    /** A box: bottom at h0, footprint w × d, height hh, centered at (lx, ly). */
    B(lx, ly, h0, w, d, hh, hex, opts) {
        const o = opts || {};
        this._b.parts.push({ m: 'box', lx: lx, ly: ly, lh: h0 + hh / 2, sx: w, sy: hh, sz: d, hex: hex, yaw: o.yaw || 0, tilt: o.tilt || 0, glow: !!o.glow, shell: !!o.shell });
        return this;
    },

    /** A cone (rt 0, default) or a cylinder (rt = r): bottom at h0, radius r, height hh. */
    C(lx, ly, h0, r, hh, hex, opts) {
        const o = opts || {};
        const cyl = o.rt == null ? false : Math.abs(o.rt - r) < 0.01;
        this._b.parts.push({ m: cyl ? 'cyl' : 'cone', lx: lx, ly: ly, lh: h0 + hh / 2, sx: r * 2, sy: hh, sz: r * 2, hex: hex, yaw: o.yaw || 0, tilt: o.tilt || 0, glow: !!o.glow });
        return this;
    },

    /** A gem (octahedron) centered at height hc, radii (rx, ry, rz). */
    G(lx, ly, hc, rx, ry, rz, hex, opts) {
        const o = opts || {};
        this._b.parts.push({ m: 'gem', lx: lx, ly: ly, lh: hc, sx: rx * 2, sy: ry * 2, sz: rz * 2, hex: hex, yaw: o.yaw || 0, tilt: o.tilt || 0, glow: !!o.glow });
        return this;
    },

    /** A named placement point for actors (absolute map coords after finish). */
    A(name, lx, ly, headingDeg, h) {
        this._b.anchors[name] = { lx: lx, ly: ly, heading: headingDeg || 0, h: h || 0 };
        return this;
    },

    finish(view, baseX, baseY, groundH) {
        const b = this._b;
        this._b = null;
        if (!b) {
            throw new Error('SetPieces3D.finish() без begin(): строитель не открыт. ' +
                'Каждый buildSet/buildProp/buildLot обязан вызвать begin() до fn(S).');
        }
        const root = new pc.Entity('set');
        view.root.addChild(root);
        const gh = groundH || 0;
        root.setPosition(-baseX, gh, baseY);
        for (const p of b.parts) {
            const e = new pc.Entity('p');
            root.addChild(e);
            e.setLocalPosition(-p.lx, p.lh, p.ly);
            if (p.yaw || p.tilt) e.setRotation(World3D.rotQuat((p.tilt || 0) * this.DEG, -(p.yaw || 0) * this.DEG, 0));
            e.setLocalScale(p.sx, p.sy, p.sz);
            e.addComponent('render', { layers: [pc.LAYERID_WORLD] });
            const mesh = p.m === 'box' ? ActorRig3D.unitBox(view)
                : p.m === 'cone' ? this.coneMesh(view)
                : p.m === 'cyl' ? this.cylMesh(view) : this.gemMesh(view);
            const mat = p.glow ? this.glowMat(p.hex) : ActorRig3D.mat(p.hex);
            e.render.meshInstances = [new pc.MeshInstance(mesh, mat, e)];
            // Shell parts (ceilings, the fourth wall) are handed back on the handle so the
            // cinema can drop them and shoot the interior as a dollhouse.
            if (p.shell) b.shell.push(e);
        }
        World3D.addObject(view, root, 'prop');
        /** @type {Record<string, SetAnchor>} */
        const anchors = {};
        for (const name of Object.keys(b.anchors)) {
            const a = b.anchors[name];
            anchors[name] = { x: baseX + a.lx, y: baseY + a.ly, heading: a.heading, h: a.h };
        }
        return { root: root, anchors: anchors, view: view, groundH: gh, id: '', shell: b.shell.slice() };
    },

    // --- de-flicker: no two visible surfaces may share a plane ----------------------------------
    // Z-fighting («блики») is born where two coincident or coplanar faces overlap: the depth test
    // cannot choose a winner and the pixels shimmer. Bottom faces are buried in the ground and
    // exempt; tops and vertical sides are visible (the dollhouse camera looks from above), so the
    // builder separates them here for EVERY set, present and future: a coplanar top is lifted a
    // hair (keeping its bottom planted), a flush vertical face is inset a hair.
    DEFLICKER_EPS: 0.5,
    DEFLICKER_STEP: 0.75,

    _over1(a1, a2, b1, b2) { return Math.abs(a1 - b1) < (a2 + b2) - this.DEFLICKER_EPS; },

    /** parts: [{ m, lx, ly, cz, hx, hy, hz }] in set-local px; mutated in place. */
    _deflicker(parts) {
        const E = this.DEFLICKER_EPS, D = this.DEFLICKER_STEP;
        for (let i = 0; i < parts.length; i++) {
            for (let pass = 0; pass < 4; pass++) {
                let moved = false;
                const a = parts[i];
                for (let j = 0; j < i; j++) {
                    const b = parts[j];
                    // exact duplicate: lift it clear of its twin
                    if (a.lx === b.lx && a.ly === b.ly && a.cz === b.cz && a.hx === b.hx && a.hy === b.hy && a.hz === b.hz) {
                        a.cz += D / 2; a.hz += D / 2; moved = true; continue;
                    }
                    // coplanar tops with overlapping footprints
                    if (Math.abs((a.cz + a.hz) - (b.cz + b.hz)) < E &&
                        this._over1(a.lx, a.hx, b.lx, b.hx) && this._over1(a.ly, a.hy, b.ly, b.hy)) {
                        a.cz += D / 2; a.hz += D / 2; moved = true; continue;
                    }
                    // flush vertical faces: inset the later part on that axis
                    if (Math.abs((a.lx - a.hx) - (b.lx - b.hx)) < E &&
                        this._over1(a.ly, a.hy, b.ly, b.hy) && this._over1(a.cz, a.hz, b.cz, b.hz)) {
                        a.lx += D; a.hx = Math.max(0.5, a.hx - D); moved = true; continue;
                    }
                    if (Math.abs((a.lx + a.hx) - (b.lx + b.hx)) < E &&
                        this._over1(a.ly, a.hy, b.ly, b.hy) && this._over1(a.cz, a.hz, b.cz, b.hz)) {
                        a.lx -= D; a.hx = Math.max(0.5, a.hx - D); moved = true; continue;
                    }
                    if (Math.abs((a.ly - a.hy) - (b.ly - b.hy)) < E &&
                        this._over1(a.lx, a.hx, b.lx, b.hx) && this._over1(a.cz, a.hz, b.cz, b.hz)) {
                        a.ly += D; a.hy = Math.max(0.5, a.hy - D); moved = true; continue;
                    }
                    if (Math.abs((a.ly + a.hy) - (b.ly + b.hy)) < E &&
                        this._over1(a.lx, a.hx, b.lx, b.hx) && this._over1(a.cz, a.hz, b.cz, b.hz)) {
                        a.ly -= D; a.hy = Math.max(0.5, a.hy - D); moved = true; continue;
                    }
                }
                if (!moved) break;
            }
        }
        return parts;
    },

    /** The finalized boxes of a set, after the de-flicker pass: what the audit and the eye see. */
    partsOf(setId) {
        const parts = [];
        const anchors = {};
        const box = (m, lx, ly, cz, hx, hy, hz) => parts.push({ m, lx, ly, cz, hx, hy, hz });
        const S = {
            B: (lx, ly, h0, w, d, hh) => { box('box', lx, ly, h0 + hh / 2, w / 2, d / 2, hh / 2); return S; },
            C: (lx, ly, h0, r, hh) => { box('cyl', lx, ly, h0 + hh / 2, r, r, hh / 2); return S; },
            G: (lx, ly, hc, rx, ry, rz) => { box('gem', lx, ly, hc, rx, ry, rz); return S; },
            A: (name, lx, ly, heading, h) => { anchors[name] = { x: lx, y: ly, heading: heading || 0, h: h || 0 }; return S; },
        };
        const fn = this.SETS[setId];
        if (fn) fn(S);
        this._deflicker(parts);
        return { parts, anchors };
    },

    // --- handles ----------------------------------------------------------------------

    /** Re-place a built handle (map px + heading deg) — for moving props (cars, horses). */
    moveTo(handle, x, y, headingDeg) {
        handle.root.setPosition(-x, handle.groundH || 0, y);
        handle.root.setRotation(World3D.rotQuat(0, -(headingDeg || 0) * this.DEG, 0));
    },

    dispose(handle) {
        if (handle && handle.root) World3D.removeObject(handle.view, handle.root);
    },

    /** Build a set by id at a base point (its anchors come back in absolute map coords).
     *  begin() is mandatory here: buildLot's finish() leaves _b null, so a set built without
     *  opening the builder crashes on its very first box — which silently killed every film
     *  playback (the demo only ever reached its intro card before anyone played a real scene). */
    buildSet(view, id, baseX, baseY, groundH) {
        const fn = SetPieces3D.SETS[id];
        if (!fn) return null;
        SetPieces3D.begin();
        fn(SetPieces3D);
        SetPieces3D._deflicker(SetPieces3D._b.parts);
        const h = SetPieces3D.finish(view, baseX, baseY, groundH);
        h.id = id;
        return h;
    },

    buildProp(view, id, x, y, headingDeg, groundH) {
        const fn = SetPieces3D.PROPS[id];
        if (!fn) return null;
        SetPieces3D.begin();
        fn(SetPieces3D);
        const h = SetPieces3D.finish(view, x, y, groundH);
        h.id = id;
        SetPieces3D.moveTo(h, x, y, headingDeg || 0);
        return h;
    },
};

// --- movie sets -------------------------------------------------------------------------
// Each builder fills the current batch (B/C/G/A). Footprints stay within ~±350 px of the
// base point; anchors are the spots the ScriptGenerator/MovieSequencer stage actors at.
SetPieces3D.SETS = /** @type {Record<string, (S: any) => void>} */ ({

    western(S) {
        S.B(0, 30, 0, 700, 150, 3, '#b09060');                                  // dusty street
        // Saloon (north-west)
        S.B(-140, -170, 0, 200, 120, 150, '#8a5a32').B(-140, -175, 150, 200, 110, 44, '#7a4a28');
        S.B(-140, -104, 0, 40, 6, 74, '#3a2415');                               // door
        S.B(-190, -106, 60, 34, 5, 34, '#22303e').B(-90, -106, 60, 34, 5, 34, '#22303e');
        S.B(-140, -120, 116, 92, 6, 24, '#c8a24a');                             // sign board
        S.B(-140, -96, 100, 216, 64, 8, '#6a4222');                             // porch roof
        S.C(-220, -84, 0, 5, 100, '#5a3a20', { rt: 5 }).C(-60, -84, 0, 5, 100, '#5a3a20', { rt: 5 });
        S.B(-140, -78, 0, 200, 34, 10, '#7a5230');                              // porch deck
        S.B(-140, -64, 0, 70, 26, 12, '#6a4626');                               // steps
        // General store (north-east)
        S.B(150, -160, 0, 170, 110, 120, '#7a6a52').B(150, -108, 92, 176, 56, 7, '#a44a3a');
        S.C(76, -86, 0, 4, 92, '#5a4a3a', { rt: 4 }).C(224, -86, 0, 4, 92, '#5a4a3a', { rt: 4 });
        S.B(150, -104, 20, 36, 5, 56, '#3a2a1a');
        // South row
        S.B(-150, 160, 0, 150, 100, 95, '#6a5a4a').B(60, 160, 0, 130, 100, 110, '#7a5a3a');
        S.B(-150, 108, 30, 30, 5, 30, '#22303e').B(60, 108, 34, 30, 5, 30, '#22303e');
        // Water tower
        S.C(310, -190, 0, 4, 150, '#5a4a3a', { rt: 4 }).C(334, -166, 0, 4, 150, '#5a4a3a', { rt: 4 });
        S.C(286, -166, 0, 4, 150, '#5a4a3a', { rt: 4 }).C(310, -214, 0, 4, 150, '#5a4a3a', { rt: 4 });
        S.C(310, -190, 150, 46, 64, '#6a6a72', { rt: 46 }).C(310, -190, 214, 48, 34, '#5a4028');
        // Details: cacti, barrels, trough, hitching rail, tumbleweed rocks
        S.B(-320, 120, 0, 14, 14, 84, '#3a6a30').B(-338, 120, 40, 22, 12, 12, '#3a6a30').B(-346, 120, 52, 12, 12, 30, '#3a6a30');
        S.B(-290, 180, 0, 12, 12, 60, '#3a6a30').B(-276, 180, 30, 18, 10, 10, '#3a6a30');
        S.C(-40, -60, 0, 16, 28, '#5a4028', { rt: 14 }).C(-6, -64, 0, 16, 28, '#5a4028', { rt: 14 });
        S.B(240, 60, 0, 76, 32, 24, '#5a4a3a').B(240, 60, 22, 68, 26, 3, '#3a5a7a');
        S.B(-20, 108, 52, 130, 6, 6, '#5a3a20').C(-70, 108, 0, 5, 52, '#4a3018', { rt: 5 }).C(30, 108, 0, 5, 52, '#4a3018', { rt: 5 });
        S.G(330, 140, 12, 16, 12, 16, '#8a7a5a');
        // Anchors
        S.A('duel_a', -95, 34, 0).A('duel_b', 95, 34, 180).A('porch', -140, -74, 90);
        S.A('saloon_door', -140, -90, 90).A('store', 150, -70, 90).A('street_w', -250, 34, 0);
        S.A('street_e', 250, 34, 180).A('tower', 300, -120, -135).A('south', -60, 96, -90);
    },

    saloon(S) {
        // Room shell
        S.B(0, 0, 0, 520, 420, 5, '#7a5230');                                   // floor
        S.B(0, -206, 0, 520, 12, 190, '#6a4a2e').B(-256, 0, 0, 12, 420, 190, '#6a4a2e').B(256, 0, 0, 12, 420, 190, '#6a4a2e');
        S.B(0, 206, 0, 520, 12, 190, '#5a3e26');
        S.B(0, 0, 190, 520, 420, 8, '#4a3220', { shell: 1 });                   // ceiling (hidden in the cinema)
        // Bar
        S.B(-100, -130, 0, 260, 42, 66, '#5a3a20').B(-100, -130, 66, 272, 52, 7, '#3a2412');
        S.B(-100, -186, 0, 260, 14, 120, '#4a3018');                            // back shelf
        S.B(-100, -176, 44, 240, 8, 5, '#6a4626').B(-100, -176, 84, 240, 8, 5, '#6a4626');
        const bottles = ['#3a6a30', '#6a3a20', '#caa13a', '#2a4a6a', '#8a3a4a'];
        for (let i = 0; i < 9; i++) {
            S.B(-200 + i * 25, -176, 49, 7, 7, 20, bottles[i % bottles.length]);
            if (i % 2 === 0) S.B(-190 + i * 25, -176, 89, 7, 7, 18, bottles[(i + 2) % bottles.length]);
        }
        S.B(-100, -186, 120, 200, 6, 40, '#9ab0c0');                            // mirror
        // Piano + stool
        S.B(170, 60, 0, 92, 34, 74, '#3a2a1a').B(170, 42, 44, 84, 18, 6, '#e8e0c8');
        S.C(170, 96, 0, 12, 30, '#5a4630', { rt: 12 });
        // Tables + chairs
        S.C(-40, 100, 0, 6, 44, '#5a3a20', { rt: 6 }).C(-40, 100, 44, 32, 5, '#7a5230', { rt: 32 });
        S.C(100, 140, 0, 6, 44, '#5a3a20', { rt: 6 }).C(100, 140, 44, 32, 5, '#7a5230', { rt: 32 });
        S.B(-84, 100, 0, 26, 26, 30, '#5a4630').B(-84, 100, 30, 26, 6, 34, '#5a4630');
        S.B(4, 100, 0, 26, 26, 30, '#5a4630').B(4, 100, 30, 26, 6, 34, '#5a4630');
        // Swinging doors (south) + windows
        S.B(-34, 202, 26, 44, 7, 62, '#8a5a32', { yaw: 16 }).B(34, 202, 26, 44, 7, 62, '#8a5a32', { yaw: -16 });
        S.B(-160, -200, 70, 44, 6, 44, '#22303e').B(160, -200, 70, 44, 6, 44, '#22303e');
        S.B(-160, 202, 70, 44, 6, 44, '#22303e').B(160, 202, 70, 44, 6, 44, '#22303e');
        // Hanging lamps
        S.C(0, -40, 150, 2, 26, '#3a3a3a', { rt: 2 }).G(0, -40, 142, 12, 8, 12, '#ffd27a', { glow: true });
        S.C(0, 120, 150, 2, 26, '#3a3a3a', { rt: 2 }).G(0, 120, 142, 12, 8, 12, '#ffd27a', { glow: true });
        S.A('bar_in', -100, -152, 90).A('bar_out', -100, -84, -90).A('piano', 170, 108, -90);
        S.A('table1', -40, 140, -90).A('table2', 100, 100, 90).A('door', 0, 168, -90);
        S.A('center', 0, 20, 90).A('corner_l', -210, 150, 0).A('corner_r', 210, -60, 180);
    },

    space(S) {
        S.B(0, 0, 0, 560, 460, 6, '#232833');                                   // deck
        S.B(0, -226, 0, 560, 14, 200, '#2e3542').B(-276, 0, 0, 14, 460, 200, '#2a3140').B(276, 0, 0, 14, 460, 200, '#2a3140');
        S.B(0, 226, 0, 560, 14, 200, '#262d3a');
        S.B(0, 0, 200, 560, 460, 10, '#1c212b', { shell: 1 });                  // ceiling (hidden in the cinema)
        S.B(0, -216, 60, 320, 6, 100, '#05070f');                               // viewport
        const stars = [[-120, 90], [-60, 130], [10, 80], [70, 140], [130, 100], [-90, 140], [40, 120], [100, 70], [-30, 70], [150, 130]];
        for (const st of stars) S.B(st[0], -213, st[1], 4, 2, 4, '#dfe8ff', { glow: true });
        // Console arc + screens
        S.B(0, -150, 6, 130, 44, 54, '#39404e', {}).B(-120, -134, 6, 110, 40, 54, '#39404e', { yaw: 28 }).B(120, -134, 6, 110, 40, 54, '#39404e', { yaw: -28 });
        S.B(0, -158, 62, 110, 8, 34, '#2ad0c8', { glow: true });
        S.B(-118, -146, 62, 88, 8, 30, '#7aa0ff', { glow: true, yaw: 28 }).B(118, -146, 62, 88, 8, 30, '#ff9a5a', { glow: true, yaw: -28 });
        // Captain chair + floor light strips + wall pipes
        S.B(0, -40, 6, 44, 44, 12, '#4a5262').B(0, -58, 18, 44, 12, 56, '#5a6272');
        S.B(0, -190, 7, 420, 6, 3, '#2ad0c8', { glow: true }).B(0, 150, 7, 420, 6, 3, '#2ad0c8', { glow: true });
        S.B(-262, -60, 150, 8, 240, 8, '#4a5262').B(262, -60, 150, 8, 240, 8, '#4a5262');
        S.B(-250, 120, 6, 40, 60, 90, '#343b49').B(250, 120, 6, 40, 60, 90, '#343b49');  // side pods
        S.G(-250, 120, 106, 12, 8, 12, '#ff5a5a', { glow: true }).G(250, 120, 106, 12, 8, 12, '#5aff8a', { glow: true });
        // Airlock door (south)
        S.B(0, 216, 6, 90, 10, 130, '#39404e').B(0, 214, 6, 70, 6, 110, '#141821');
        S.A('console', 0, -104, -90).A('chair', 0, 10, -90).A('center', 0, 60, 90);
        S.A('pod_l', -200, 120, 0).A('pod_r', 200, 120, 180).A('door', 0, 170, -90).A('window', 0, -170, 90);
    },

    city(S) {
        S.B(0, 0, 0, 720, 190, 3, '#3a3a40');                                   // asphalt
        S.B(0, 0, 3, 720, 6, 1, '#c8c8a0');                                     // center line dashes
        for (let i = -3; i <= 3; i++) if (i !== 0) S.B(i * 100, 0, 3, 46, 6, 1, '#c8c8a0');
        S.B(0, -130, 0, 720, 70, 10, '#8a8a90').B(0, 130, 0, 720, 70, 10, '#8a8a90');
        // North towers
        S.B(-230, -280, 0, 170, 150, 330, '#5a5a68').B(0, -290, 0, 150, 160, 430, '#4a5a6a').B(230, -270, 0, 180, 140, 270, '#6a5a5a');
        S.B(-230, -200, 330, 120, 20, 14, '#3a3a44').B(0, -206, 430, 100, 20, 12, '#3a4450');
        const win = ['#ffd27a', '#3a4a5a'];
        for (let bI = 0; bI < 3; bI++) {
            const bx = [-230, 0, 230][bI], top = [330, 430, 270][bI];
            for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
                if ((bI * 7 + r * 3 + c * 5) % 4 === 0) continue;
                S.B(bx - 54 + c * 36, -204, top - 60 - r * 66, 14, 5, 20, ((bI + r + c) % 5 === 0 ? win[0] : win[1]), { glow: (bI + r + c) % 5 === 0 });
            }
        }
        // Awnings + shopfronts (south)
        S.B(-160, 240, 0, 200, 130, 120, '#7a4a3a').B(60, 240, 0, 220, 130, 150, '#4a6a5a').B(280, 250, 0, 140, 120, 90, '#6a5a7a');
        S.B(-160, 172, 96, 190, 40, 7, '#c84a3a').B(60, 172, 120, 200, 40, 7, '#3a8a5a');
        S.B(-160, 178, 20, 60, 8, 60, '#9ac8e8').B(60, 178, 20, 70, 8, 70, '#9ac8e8');
        // Street furniture
        for (const lx of [-240, 0, 240]) {
            S.C(lx, -108, 10, 4, 120, '#2e3a2e', { rt: 4 }).B(lx + 10, -108, 122, 22, 10, 8, '#2e3a2e');
            S.G(lx + 18, -108, 126, 7, 5, 7, '#ffe8a0', { glow: true });
        }
        S.C(-120, 108, 10, 9, 26, '#c83a2a', { rt: 7 });
        S.B(200, 112, 10, 76, 44, 44, '#3a6a3a').B(200, 108, 54, 80, 48, 5, '#2e5a2e');
        S.C(-320, 60, 10, 14, 30, '#c8c8c0', { rt: 14 }).B(-320, 60, 40, 20, 4, 6, '#8a8a80');  // hydrant-ish
        S.A('road_w', -260, 40, 0).A('road_e', 260, -40, 180).A('walk_n', -60, -120, 90);
        S.A('walk_s', 60, 120, -90).A('alley', 330, 180, 180).A('shop', -160, 150, -90).A('center', 0, 0, 0);
    },

    mansion(S) {
        S.B(0, 0, 0, 540, 440, 5, '#6a4a30');                                   // parquet
        S.B(0, 40, 5, 250, 170, 2, '#8a2a2a');                                  // rug
        S.B(0, -216, 0, 540, 14, 210, '#4a3a52').B(-266, 0, 0, 14, 440, 210, '#4a3a52').B(266, 0, 0, 14, 440, 210, '#4a3a52');
        S.B(0, 216, 0, 540, 14, 210, '#42344c');
        S.B(0, 0, 210, 540, 440, 10, '#3a2e44');
        // Fireplace (west)
        S.B(-240, -60, 0, 60, 150, 160, '#7a7a72').B(-216, -60, 20, 20, 90, 90, '#1a1410');
        S.G(-212, -60, 44, 16, 12, 22, '#ff7a2a', { glow: true });
        S.B(-240, -60, 160, 80, 170, 10, '#5a4a3a');
        S.B(-238, -60, 172, 30, 20, 26, '#caa13a');                             // mantel clock
        // Sofa + table (east)
        S.B(190, 40, 0, 150, 70, 32, '#6a2a34').B(238, 40, 32, 26, 70, 46, '#7a3240');
        S.B(190, -4, 0, 150, 16, 26, '#7a3240').B(190, 84, 0, 150, 16, 26, '#7a3240');
        S.B(60, 40, 0, 90, 60, 8, '#5a3a20', {}).B(60, 40, 8, 84, 54, 4, '#7a5230');
        S.C(60, 40, 0, 8, 30, '#3a2412', { rt: 8 });
        // Painting + chandelier + bookshelf + plant
        S.B(-60, -208, 110, 96, 6, 72, '#caa13a').B(-60, -206, 116, 80, 4, 60, '#2a3a5a');
        S.C(40, -40, 150, 3, 56, '#caa13a', { rt: 3 });
        S.G(40, -40, 142, 26, 10, 26, '#ffe8a0', { glow: true });
        S.B(120, 200, 0, 180, 44, 150, '#4a3220');
        for (let i = 0; i < 7; i++) S.B(48 + i * 24, 198, 60 + (i % 3) * 0, 18, 30, 40, ['#8a3a2a', '#2a5a4a', '#4a4a7a'][i % 3]);
        S.C(-160, 170, 0, 20, 30, '#8a5a3a', { rt: 24 }).B(-160, 170, 30, 10, 10, 60, '#2a5a24');
        S.G(-160, 170, 100, 26, 22, 26, '#2e6a2a');
        S.A('sofa', 170, 96, -90).A('fireplace', -180, -60, 0).A('center', 20, 20, 180);
        S.A('table', 60, 100, -90).A('door', -60, 190, -90).A('painting', -60, -160, 90);
    },

    forest(S) {
        S.B(0, 0, 0, 920, 720, 2, '#4a7a3a');                                   // grass patch
        const trees = [[-330, -220], [-250, 180], [300, -250], [360, 120], [-380, 30], [180, 280], [-120, -290], [390, -60]];
        for (let i = 0; i < trees.length; i++) {
            const t = trees[i], r = 40 + (i % 3) * 14;
            S.C(t[0], t[1], 2, 11, 84, '#5a3a20', { rt: 9 });
            S.C(t[0], t[1], 70, r, 66, i % 2 ? '#2a5a24' : '#2e6a2a');
            S.C(t[0], t[1], 118, r * 0.72, 54, i % 2 ? '#2e6a2a' : '#336a2e');
        }
        for (const r of [[-160, -140], [220, 60], [-60, 240], [300, -140]]) {
            S.G(r[0], r[1], 16, 26, 17, 22, '#6a6a66');
        }
        // Campfire + logs
        S.C(0, 0, 2, 30, 5, '#5a4a3a', { rt: 34 });
        S.B(-16, 6, 4, 44, 10, 10, '#4a3220', { yaw: 24 }).B(16, -6, 4, 44, 10, 10, '#4a3220', { yaw: -24 });
        S.G(0, 0, 22, 15, 17, 15, '#ff8a30', { glow: true }).G(0, 0, 40, 8, 12, 8, '#ffb050', { glow: true });
        S.B(0, 96, 0, 130, 26, 22, '#5a3a20').C(-52, 96, 0, 9, 22, '#4a3018', { rt: 9 }).C(52, 96, 0, 9, 22, '#4a3018', { rt: 9 });
        S.B(-300, 240, 0, 90, 90, 8, '#3a6a30');                                // mossy patch
        S.A('fire_a', -70, 26, 0).A('fire_b', 70, 26, 180).A('fire_c', 0, -60, 90);
        S.A('log', 0, 130, -90).A('path_w', -300, 160, 0).A('deep_e', 300, -60, 180).A('center', 0, 40, 90);
    },

    beach(S) {
        S.B(0, -300, 0, 940, 260, 4, '#2a6a9a');                                // sea
        S.B(0, -176, 3, 940, 16, 3, '#dce8ea');                                 // foam
        S.B(0, -160, 0, 940, 30, 3, '#e0cf9f');                                 // wet sand
        S.C(170, 40, 0, 10, 130, '#7a5a30', { rt: 7 });                         // palm trunk
        S.B(182, 40, 118, 96, 12, 8, '#2a6a2a', { yaw: -14 }).B(158, 40, 126, 96, 12, 8, '#2e7a2e', { yaw: 16 });
        S.B(170, 20, 132, 12, 84, 8, '#2a6a2a', { yaw: 90 }).B(170, 60, 132, 12, 84, 8, '#276a27', { yaw: 90 });
        S.C(170, 40, 128, 16, 14, '#3a7a30');
        S.C(-90, 60, 0, 5, 110, '#8a6a4a', { rt: 5 });                          // umbrella
        S.G(-90, 60, 118, 52, 12, 52, '#c84a4a');
        S.B(-220, 90, 1, 66, 110, 2, '#e8a04a');                                // towel
        S.B(-300, 20, 0, 22, 7, 96, '#e8e0d0', { yaw: 12 }).G(-300, 20, 100, 9, 9, 14, '#e85a8a');
        S.G(280, -60, 14, 22, 15, 20, '#8a8a80');                               // rock
        S.G(320, -30, 10, 15, 10, 14, '#7a7a72');
        S.B(60, 160, 0, 130, 26, 26, '#8a6a4a').B(60, 160, 26, 120, 22, 6, '#e0cf9f'); // driftwood deck?
        S.A('shore', -40, -120, -90).A('sand_a', -160, 40, 90).A('sand_b', 100, 80, -90);
        S.A('water', 40, -220, -90).A('palm', 220, 60, 180).A('umbrella', -40, 70, 90).A('center', 0, 40, 0);
    },

    lab(S) {
        S.B(0, 0, 0, 560, 440, 5, '#2a3138');
        S.B(0, -216, 0, 560, 14, 200, '#2e3a44').B(-276, 0, 0, 14, 440, 200, '#2e3a44').B(276, 0, 0, 14, 440, 200, '#2e3a44');
        S.B(0, 216, 0, 560, 14, 200, '#28323c');
        S.B(0, 0, 200, 560, 440, 10, '#222a32');
        S.B(-80, 60, 0, 30, 60, 58, '#3a4a5a').B(80, 60, 0, 30, 60, 58, '#3a4a5a');  // table legs
        S.B(0, 60, 58, 320, 80, 9, '#46586a');                                  // main table
        const flasks = [['#5aff8a', -90], ['#ffb050', -40], ['#7aa0ff', 20]];
        for (const f of flasks) { S.C(f[1], 50, 67, 11, 28, f[0], { glow: true }); S.B(f[1], 50, 67, 8, 8, 4, '#c8d8e0'); }
        S.B(110, 70, 67, 40, 30, 26, '#9ab0c0');                                // apparatus
        // Tesla coil
        S.B(190, -100, 5, 70, 70, 20, '#3a4a5a').C(190, -100, 25, 8, 90, '#5a6a7a', { rt: 8 });
        S.G(190, -100, 130, 26, 24, 26, '#9ad0ff', { glow: true });
        S.B(190, -140, 118, 60, 5, 5, '#9ad0ff', { glow: true, yaw: 30 }).B(190, -60, 118, 60, 5, 5, '#9ad0ff', { glow: true, yaw: -30 });
        // Desk + monitor (west), cabinets (north), ceiling lights
        S.B(-190, -80, 0, 120, 60, 56, '#46586a');
        S.B(-190, -96, 56, 50, 10, 36, '#141a20').B(-190, -96, 60, 44, 5, 30, '#7aff9a', { glow: true });
        for (let i = 0; i < 4; i++) S.B(-150 + i * 100, -190, 5, 80, 40, 110, '#39454f');
        for (let i = 0; i < 4; i++) S.B(-150 + i * 100, -172, 40, 60, 4, 5, '#5a6a7a');
        S.B(-80, 0, 186, 140, 8, 4, '#dfe8ff', { glow: true }).B(120, -60, 186, 140, 8, 4, '#dfe8ff', { glow: true });
        S.B(40, 160, 2, 200, 8, 2, '#141a20');                                  // cable
        S.A('table', 0, 130, -90).A('table2', -60, 130, -90).A('coil', 150, -40, -135);
        S.A('desk', -190, -20, 90).A('center', 0, 20, 90).A('door', 220, 190, 180);
    },

    diner(S) {
        S.B(0, 0, 0, 560, 440, 5, '#d8d0c0');
        S.B(0, -216, 0, 560, 14, 190, '#b8a898').B(-276, 0, 0, 14, 440, 190, '#b8a898').B(276, 0, 0, 14, 440, 190, '#b8a898');
        S.B(0, 216, 0, 560, 14, 190, '#a89888');
        S.B(0, 0, 190, 560, 440, 10, '#c8c0b0');
        // Counter + stools + back wall menu
        S.B(0, -90, 0, 260, 54, 58, '#a44a3a').B(0, -90, 58, 272, 64, 7, '#e8e0d0');
        for (let i = 0; i < 4; i++) {
            const sx = -105 + i * 70;
            S.C(sx, -30, 5, 5, 30, '#8a8a90', { rt: 5 }).C(sx, -30, 35, 15, 7, '#c84a4a', { rt: 15 });
        }
        S.B(0, -160, 60, 200, 8, 70, '#3a3028').B(0, -158, 70, 180, 4, 10, '#ffd27a', { glow: true });
        S.B(0, -158, 92, 180, 4, 8, '#ffd27a', { glow: true });
        // Booths
        for (const bx of [-170, 170]) {
            S.B(bx, 110, 0, 110, 44, 30, '#a44a3a').B(bx, 148, 0, 110, 14, 56, '#8a3a2e');
            S.B(bx, 40, 0, 110, 44, 30, '#a44a3a').B(bx, 2, 0, 110, 14, 56, '#8a3a2e');
            S.B(bx, 75, 0, 80, 46, 6, '#e8e0d0');
        }
        // Jukebox + windows + floor strips
        S.B(238, -150, 0, 54, 40, 84, '#caa13a').G(238, -150, 96, 26, 16, 18, '#ff9a3a', { glow: true });
        for (let i = 0; i < 3; i++) S.B(-180 + i * 180, -210, 60, 70, 6, 60, '#9ac8e8');
        for (let i = 0; i < 6; i++) S.B(-250 + i * 100, 190, 5, 46, 60, 2, i % 2 ? '#c85a4a' : '#d8d0c0');
        S.A('counter', -35, -30, -90).A('counter2', 35, -30, -90).A('booth_l', -170, 78, 90);
        S.A('booth_r', 170, 78, 90).A('juke', 200, -110, 180).A('door', -240, 60, 0).A('center', 0, 40, 90);
    },

    office(S) {
        S.B(0, 0, 0, 520, 420, 5, '#7a6248');
        S.B(0, -206, 0, 520, 14, 190, '#a89880').B(-256, 0, 0, 14, 420, 190, '#a89880').B(256, 0, 0, 14, 420, 190, '#a89880');
        S.B(0, 206, 0, 520, 14, 190, '#98886e');
        S.B(0, 0, 190, 520, 420, 10, '#8a7a62');
        S.B(0, -40, 5, 320, 90, 8, '#c8b898');                                  // rug
        // Desk (boss behind it, facing south)
        S.B(0, -80, 0, 190, 76, 58, '#5a4630').B(0, -80, 58, 200, 84, 8, '#6a5238');
        S.B(-60, -100, 66, 54, 10, 38, '#1a2028').B(-60, -100, 70, 48, 5, 32, '#7aa0ff', { glow: true });
        S.B(50, -90, 66, 40, 28, 3, '#e8e0d0').B(74, -70, 66, 14, 14, 20, '#caa13a');  // papers + trophy
        S.B(0, -20, 0, 50, 50, 8, '#3a3a42').C(0, -20, 8, 7, 24, '#5a5a62', { rt: 7 });
        S.B(0, -6, 32, 46, 46, 8, '#4a4a52').B(0, 16, 40, 46, 10, 52, '#4a4a52');    // swivel chair
        // Cabinets, window with blinds, bookshelf, coat rack
        S.B(-220, -120, 0, 56, 44, 96, '#5a6a7a').B(-220, -120, 96, 56, 44, 96, '#5a6a7a');
        S.B(-220, -104, 30, 40, 5, 5, '#46525e').B(-220, -104, 126, 40, 5, 5, '#46525e');
        S.B(60, -200, 70, 150, 6, 70, '#9ac8e8');
        for (let i = 0; i < 5; i++) S.B(60, -200, 76 + i * 14, 148, 7, 5, '#c8b898');
        S.B(200, 40, 0, 60, 150, 140, '#4a3a28');
        for (let i = 0; i < 6; i++) S.B(200, -20 + i * 24, 40 + (i % 2) * 44, 44, 18, 34, ['#8a3a2a', '#2a4a6a', '#3a6a4a'][i % 3]);
        S.C(-180, 120, 5, 4, 100, '#5a4630', { rt: 4 }).B(-180, 120, 100, 40, 40, 8, '#3a3028');
        S.A('boss', 0, -50, 90).A('guest1', -60, 60, -90).A('guest2', 60, 60, -90);
        S.A('door', -200, 180, -90).A('window', 60, -150, 90).A('center', 0, 20, 90);
    },

    stage(S) {
        S.B(0, -60, 0, 520, 320, 40, '#5a4632');                                // stage deck
        S.B(0, 96, 0, 520, 16, 44, '#caa13a');                                  // gold trim
        S.B(-248, -60, 40, 30, 320, 240, '#8a1a2a').B(248, -60, 40, 30, 320, 240, '#8a1a2a');
        S.B(0, -206, 40, 520, 24, 44, '#7a1626');                               // valance
        S.B(0, -230, 0, 560, 16, 300, '#2a2028');                               // back wall
        S.C(-270, 180, 0, 6, 210, '#3a3a42', { rt: 6 }).B(-270, 150, 200, 30, 40, 26, '#4a4a52');
        S.G(-270, 150, 196, 12, 8, 12, '#ffe8a0', { glow: true });
        S.C(270, 180, 0, 6, 210, '#3a3a42', { rt: 6 }).B(270, 150, 200, 30, 40, 26, '#4a4a52');
        S.G(270, 150, 196, 12, 8, 12, '#ffe8a0', { glow: true });
        S.C(0, 30, 40, 4, 96, '#2e2e36', { rt: 4 }).G(0, 30, 140, 8, 7, 8, '#c8c8d0');   // mic
        S.B(-150, -110, 40, 96, 34, 66, '#241a12').B(-150, -128, 84, 88, 16, 6, '#e8e0c8');  // piano
        S.C(-150, -80, 40, 12, 26, '#3a2a1a', { rt: 12 });
        S.C(140, -120, 52, 26, 30, '#8a3a2a', { rt: 26, tilt: 90 });          // bass drum
        S.C(110, -140, 66, 14, 8, '#caa13a', { rt: 14 }).C(170, -140, 66, 14, 8, '#caa13a', { rt: 14 });
        for (let r = 0; r < 3; r++) for (let c = -2; c <= 2; c++) {
            S.B(c * 90, 210 + r * 60, 0, 70, 30, 26, '#5a2a34');
            S.B(c * 90, 224 + r * 60, 26, 70, 8, 30, '#6a3240');
        }
        S.A('mic', 0, 60, 90).A('piano', -150, -60, 0).A('drums', 140, -70, 90);
        S.A('center', 0, -40, 90).A('curtain_l', -200, 40, 0).A('curtain_r', 200, 40, 180);
        S.A('audience', 0, 240, -90).A('stage_back', 0, -180, 90);
    },

    rooftop(S) {
        S.B(0, 0, -30, 580, 480, 30, '#4a4a52');                                // slab (top at 0)
        S.B(0, -236, 0, 580, 16, 34, '#3a3a42').B(0, 236, 0, 580, 16, 34, '#3a3a42');
        S.B(-286, 0, 0, 16, 480, 34, '#3a3a42').B(286, 0, 0, 16, 480, 34, '#3a3a42');
        S.C(-160, -120, 0, 7, 90, '#5a4a3a', { rt: 7 }).C(-120, -120, 0, 7, 90, '#5a4a3a', { rt: 7 });
        S.C(-160, -80, 0, 7, 90, '#5a4a3a', { rt: 7 }).C(-120, -80, 0, 7, 90, '#5a4a3a', { rt: 7 });
        S.C(-140, -100, 90, 46, 76, '#6a5240', { rt: 46 }).C(-140, -100, 166, 50, 18, '#4a3a2c');
        for (const ac of [[180, 60], [230, 130], [140, 160]]) {
            S.B(ac[0], ac[1], 0, 64, 52, 44, '#5a626a').C(ac[0], ac[1], 44, 20, 8, '#3a424a', { rt: 20 });
        }
        S.B(120, -170, 0, 84, 84, 120, '#3e4650').B(120, -128, 6, 44, 6, 76, '#2a3138');   // door hut
        S.C(-40, -200, 0, 4, 190, '#8a8a90', { rt: 4 }).B(-40, -200, 150, 50, 4, 4, '#8a8a90').B(-40, -200, 176, 34, 4, 4, '#8a8a90');
        S.G(-40, -200, 196, 6, 6, 6, '#ff5a5a', { glow: true });
        // Skyline backdrop (north/east, far)
        const sky = [[-420, -420, 120, 260], [-260, -460, 150, 340], [-80, -430, 110, 220], [100, -470, 170, 380], [280, -440, 130, 280], [430, -420, 100, 200], [460, -100, 120, 240], [470, 120, 90, 180]];
        for (const b of sky) {
            S.B(b[0], b[1], -30, b[2], 120, b[3], '#22262f');
            for (let wI = 0; wI < 4; wI++) if ((b[0] + wI) % 3 !== 0) S.B(b[0] - b[2] / 2 + 20 + wI * (b[2] / 4), b[1] + 62, b[3] * 0.5 - 40 + wI * 26, 10, 4, 14, '#ffd27a', { glow: true });
        }
        S.B(-60, 120, 0, 60, 40, 10, '#3a424a');                                // vent
        S.A('edge_s', 0, 190, 90).A('edge_n', 0, -190, -90).A('tank', -140, -20, 90);
        S.A('center', 0, 0, 90).A('door', 120, -100, 90).A('ac', 200, 0, 180).A('antenna', -60, -160, 45);
    },
});

// --- props (placed and moved individually) -------------------------------------------------
SetPieces3D.PROPS = /** @type {Record<string, (S: any) => void>} */ ({

    car(S) {
        S.B(0, 0, 22, 176, 74, 42, '#c84a3a');
        S.B(-14, 0, 64, 96, 66, 40, '#a83a2e');
        S.B(-14, -34, 70, 84, 5, 28, '#202830').B(-14, 34, 70, 84, 5, 28, '#202830');
        S.B(30, 0, 70, 6, 60, 26, '#202830');
        for (const w of [[56, -40], [56, 40], [-56, -40], [-56, 40]]) {
            S.C(w[0], w[1], 11, 17, 12, '#1a1a1e', { rt: 17, tilt: 90 });
            S.C(w[0], w[1], 14, 8, 6, '#8a8a90', { rt: 8, tilt: 90 });
        }
        S.B(86, -22, 40, 6, 14, 10, '#ffe8a0', { glow: true }).B(86, 22, 40, 6, 14, 10, '#ffe8a0', { glow: true });
        S.B(-88, -24, 44, 5, 12, 8, '#ff5a4a', { glow: true }).B(-88, 24, 44, 5, 12, 8, '#ff5a4a', { glow: true });
        S.B(88, 0, 30, 8, 60, 10, '#8a8a90');
    },

    horse(S) {
        S.B(0, 0, 88, 116, 46, 50, '#7a4a28');
        S.B(52, 0, 112, 26, 26, 44, '#7a4a28').B(74, 0, 136, 30, 22, 24, '#6a3e20');
        S.B(84, 0, 152, 10, 16, 8, '#6a3e20');
        S.B(66, -8, 150, 6, 8, 12, '#4a2e18').B(66, 8, 150, 6, 8, 12, '#4a2e18');      // ears
        S.B(30, 0, 138, 34, 8, 10, '#3a2412');                                          // mane
        S.B(-64, 0, 108, 12, 10, 44, '#3a2412', {});                                    // tail
        for (const l of [[38, -16], [38, 16], [-40, -16], [-40, 16]]) {
            S.B(l[0], l[1], 44, 12, 12, 46, '#6a3e20').B(l[0], l[1], 0, 14, 14, 46, '#5a3418');
            S.B(l[0], l[1], 0, 15, 15, 8, '#2a1a0e');
        }
        S.B(4, 0, 138, 46, 54, 12, '#3a2a1a');                                          // saddle
        S.B(4, -26, 140, 8, 6, 20, '#caa13a').B(4, 26, 140, 8, 6, 20, '#caa13a');
    },

    robot(S) {
        S.B(0, 0, 6, 44, 36, 16, '#5a626a');
        S.B(0, 0, 20, 52, 42, 66, '#9aa8b8');
        S.B(0, -22, 40, 8, 6, 30, '#7a8898').B(0, 22, 40, 8, 6, 30, '#7a8898');
        S.B(0, 0, 86, 38, 34, 30, '#8a98a8');
        S.B(-19, -8, 96, 3, 8, 8, '#7affff', { glow: true }).B(-19, 8, 96, 3, 8, 8, '#7affff', { glow: true });
        S.C(0, 0, 116, 3, 22, '#5a626a', { rt: 3 }).G(0, 0, 142, 6, 6, 6, '#ff5a5a', { glow: true });
        S.B(-26, 0, 50, 4, 20, 24, '#7aff9a', { glow: true });
        S.B(-14, -30, 34, 10, 10, 40, '#7a8898').B(-14, 30, 34, 10, 10, 40, '#7a8898');
    },

    bed(S) {
        S.B(0, 0, 0, 130, 200, 20, '#5a3a20').B(0, -96, 20, 130, 10, 60, '#4a3018');
        S.B(0, 0, 20, 118, 188, 18, '#d8d0c0').B(0, -74, 38, 56, 34, 12, '#e8e4da');
        S.B(0, 30, 38, 118, 120, 8, '#4a6a8a');
    },

    table(S) {
        S.B(0, 0, 56, 130, 84, 9, '#7a5230');
        for (const l of [[-52, -30], [52, -30], [-52, 30], [52, 30]]) S.B(l[0], l[1], 0, 10, 10, 56, '#5a3a20');
    },

    chair(S) {
        S.B(0, 0, 30, 42, 42, 7, '#5a4630').B(0, 20, 37, 42, 7, 50, '#5a4630');
        for (const l of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) S.B(l[0], l[1], 0, 6, 6, 30, '#4a3a26');
    },

    barrel(S) {
        S.C(0, 0, 0, 17, 32, '#5a4028', { rt: 15 });
        S.C(0, 0, 6, 18, 4, '#3a2a18', { rt: 17 }).C(0, 0, 22, 18, 4, '#3a2a18', { rt: 17 });
    },

    crate(S) {
        S.B(0, 0, 0, 44, 44, 44, '#8a6a42');
        S.B(0, -23, 8, 4, 40, 6, '#6a4a2a').B(0, 23, 8, 4, 40, 6, '#6a4a2a');
        S.B(-23, 0, 8, 40, 4, 6, '#6a4a2a').B(23, 0, 8, 40, 4, 6, '#6a4a2a');
    },

    lamp(S) {
        S.C(0, 0, 0, 7, 130, '#2e3a2e', { rt: 5 });
        S.B(10, 0, 124, 26, 10, 8, '#2e3a2e');
        S.G(20, 0, 126, 9, 7, 9, '#ffe8a0', { glow: true });
    },

    cactus(S) {
        S.B(0, 0, 0, 15, 15, 86, '#3a6a30');
        S.B(-18, 0, 42, 24, 12, 12, '#3a6a30').B(-26, 0, 54, 12, 12, 32, '#3a6a30');
        S.B(16, 0, 26, 20, 11, 11, '#356a2c').B(24, 0, 37, 11, 11, 26, '#356a2c');
    },

    tomb(S) {
        S.B(0, 20, 0, 60, 40, 8, '#6a5a44');
        S.B(0, 0, 6, 42, 11, 52, '#8a8a88').C(0, 0, 58, 21, 12, '#8a8a88', { rt: 21 });
        S.B(0, -6, 26, 26, 4, 5, '#5a5a58').B(0, -6, 38, 5, 4, 20, '#5a5a58');
    },

    saucer(S) {
        for (const l of [[-40, -30], [40, -30], [0, 44]]) S.C(l[0], l[1], 0, 5, 30, '#5a626a', { rt: 5 });
        S.C(0, 0, 26, 74, 18, '#9aa8b8', { rt: 74 });
        S.C(0, 0, 44, 40, 10, '#7a8898', { rt: 30 });
        S.G(0, 0, 62, 30, 18, 30, '#9ad0ff', { glow: true });
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            S.G(Math.cos(a) * 58, Math.sin(a) * 58, 34, 6, 5, 6, i % 2 ? '#ff5a5a' : '#5aff8a', { glow: true });
        }
    },

    coffin(S) {
        S.B(0, 0, 0, 46, 150, 26, '#4a3018').B(0, 0, 26, 40, 140, 6, '#5a3a20');
        S.B(0, -50, 32, 6, 26, 4, '#caa13a').B(0, -56, 26, 18, 6, 4, '#caa13a');
    },

    tripod(S) {
        for (const a of [30, 150, 270]) {
            const r = a * Math.PI / 180;
            S.B(Math.cos(r) * 16, Math.sin(r) * 16, 0, 6, 6, 60, '#2e2e36', { yaw: a });
        }
        S.B(0, 0, 58, 34, 24, 22, '#1a1a20').C(14, 0, 62, 9, 16, '#0e0e12', { rt: 9, yaw: 90 });
    },

    dchair(S) {
        S.B(0, 0, 0, 40, 40, 6, '#c84a3a').B(0, 18, 6, 40, 6, 54, '#c84a3a');
        for (const l of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) S.B(l[0], l[1], -6, 5, 5, 12, '#3a3a42');
        S.B(0, 24, 60, 34, 4, 8, '#e8e0d0');
    },
});

// --- the studio lot -------------------------------------------------------------------------
// One static build around (cx, cy): buildings, plaza, gate, fences, trees + patrol waypoints
// for the ambience actors. Returns a set-like handle with extra `waypoints` (map px).
SetPieces3D.buildLot = function (view, cx, cy) {
    const S = SetPieces3D;
    S.begin();
    // Plaza + roads
    S.B(cx, cy, 0, 760, 560, 2, '#a89878');
    S.B(cx, cy + 340, 0, 160, 400, 2, '#b0a080');
    S.B(cx - 260, cy + 30, 0, 120, 460, 2, '#b0a080');
    S.B(cx + 250, cy + 30, 0, 120, 460, 2, '#b0a080');
    // Sound stage (north-west): the hangar where films are shot
    S.B(cx - 250, cy - 150, 0, 340, 240, 150, '#6a6a72');
    S.B(cx - 250, cy - 150, 150, 320, 220, 16, '#56565e');
    S.B(cx - 250, cy - 32, 0, 110, 8, 96, '#a83a2a');
    S.B(cx - 250, cy - 28, 108, 150, 6, 26, '#c8a24a');
    S.B(cx - 396, cy - 200, 40, 8, 60, 40, '#ffd27a', { glow: true });
    // Office (north-east, two floors)
    S.B(cx + 230, cy - 150, 0, 190, 150, 170, '#8a7a6a');
    S.B(cx + 230, cy - 150, 170, 170, 130, 14, '#6a5a4a');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) S.B(cx + 160 + c * 46, cy - 76, 30 + r * 76, 30, 6, 34, r * 4 + c === 3 ? '#ffd27a' : '#31424e', { glow: r * 4 + c === 3 });
    S.B(cx + 230, cy - 72, 0, 44, 8, 60, '#4a3a2a');
    S.B(cx + 230, cy - 60, 62, 90, 6, 20, '#c8a24a');
    // Cinema/theater (south-east): premieres
    S.B(cx + 240, cy + 150, 0, 230, 170, 150, '#7a3a3a');
    S.B(cx + 240, cy + 150, 150, 210, 150, 14, '#5e2c2c');
    S.B(cx + 240, cy + 62, 100, 180, 44, 28, '#c8a24a');
    for (let i = 0; i < 9; i++) S.G(cx + 160 + i * 20, cy + 80, 96, 5, 5, 5, '#ffd27a', { glow: true });
    S.B(cx + 180, cy + 68, 20, 52, 6, 74, '#e8e0d0').B(cx + 300, cy + 68, 20, 52, 6, 74, '#e8d8c0');
    S.B(cx + 240, cy + 66, 0, 76, 8, 80, '#3a1a1a');
    // Casting (south-center) and editing (south-west)
    S.B(cx - 60, cy + 200, 0, 150, 130, 105, '#5a7a6a');
    S.B(cx - 60, cy + 200, 105, 130, 110, 12, '#48625a');
    S.B(cx - 60, cy + 138, 0, 40, 7, 58, '#3a4a42');
    S.B(cx - 250, cy + 200, 0, 150, 130, 105, '#5a6a8a');
    S.B(cx - 250, cy + 200, 105, 130, 110, 12, '#48587a');
    S.B(cx - 250, cy + 138, 0, 40, 7, 58, '#3a4258');
    // Water tower
    S.C(cx + 30, cy - 250, 0, 5, 150, '#5a4a3a', { rt: 5 }).C(cx + 70, cy - 250, 0, 5, 150, '#5a4a3a', { rt: 5 });
    S.C(cx + 50, cy - 270, 0, 5, 150, '#5a4a3a', { rt: 5 }).C(cx + 50, cy - 230, 0, 5, 150, '#5a4a3a', { rt: 5 });
    S.C(cx + 50, cy - 250, 150, 48, 66, '#7a8a9a', { rt: 48 }).C(cx + 50, cy - 250, 216, 50, 30, '#5a4028');
    S.B(cx + 50, cy - 202, 176, 60, 5, 26, '#c8a24a');
    // Gate + fence (south front)
    S.B(cx - 90, cy + 420, 0, 30, 30, 130, '#8a8a88').B(cx + 90, cy + 420, 0, 30, 30, 130, '#8a8a88');
    S.B(cx, cy + 420, 130, 210, 24, 26, '#7a4a3a');
    S.G(cx, cy + 420, 176, 20, 16, 8, '#ffd75a', { glow: true });
    for (let i = 1; i <= 6; i++) {
        S.B(cx - 90 - i * 70, cy + 420, 0, 10, 10, 70, '#6a5a44').B(cx - 90 - i * 70 - 35, cy + 420, 52, 70, 5, 6, '#6a5a44');
        S.B(cx + 90 + i * 70, cy + 420, 0, 10, 10, 70, '#6a5a44').B(cx + 90 + i * 70 + 35, cy + 420, 52, 70, 5, 6, '#6a5a44');
    }
    // Trees around the lot
    for (const t of [[cx - 480, cy + 330], [cx + 480, cy + 330], [cx - 480, cy - 320], [cx + 480, cy - 320], [cx - 130, cy + 330], [cx + 150, cy + 330]]) {
        S.C(t[0], t[1], 2, 10, 70, '#5a3a20', { rt: 8 });
        S.C(t[0], t[1], 60, 40, 56, '#2e6a2a');
        S.C(t[0], t[1], 100, 28, 44, '#337a30');
    }
    // Benches + lamp posts on the plaza
    for (const b of [[cx - 130, cy + 60], [cx + 130, cy + 60]]) {
        S.B(b[0], b[1], 26, 80, 20, 7, '#7a5230').B(b[0], b[1] + 12, 26, 80, 6, 30, '#7a5230');
        S.B(b[0] - 32, b[1], 2, 7, 16, 26, '#4a4a52').B(b[0] + 32, b[1], 2, 7, 16, 26, '#4a4a52');
    }
    S.C(cx, cy + 120, 2, 6, 120, '#2e3a2e', { rt: 6 }).G(cx, cy + 120, 128, 10, 8, 10, '#ffe8a0', { glow: true });
    // Anchors: doors and stroll points (absolute map coords)
    S.A('gate', cx, cy + 390, -90).A('plaza', cx, cy + 60, 90);
    S.A('stage_door', cx - 250, cy - 10, 90).A('office_door', cx + 230, cy - 56, 90);
    S.A('theater_door', cx + 240, cy + 56, 90).A('casting_door', cx - 60, cy + 128, 90);
    S.A('editing_door', cx - 250, cy + 128, 90).A('tower', cx + 50, cy - 180, 90);
    const h = S.finish(view, 0, 0, 0);
    h.id = 'lot';
    h.waypoints = [
        { x: cx, y: cy + 300 }, { x: cx - 250, y: cy + 40 }, { x: cx + 230, y: cy + 40 },
        { x: cx - 60, y: cy + 100 }, { x: cx + 140, y: cy + 220 }, { x: cx - 300, y: cy + 260 },
        { x: cx, y: cy - 40 }, { x: cx + 250, y: cy + 260 },
    ];
    return h;
};
