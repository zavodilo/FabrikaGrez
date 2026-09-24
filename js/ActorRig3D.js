// ActorRig3D.js — procedural blocky actors for films and lot ambience (ENGINE layer: pc.*).
// A body of colored unit boxes on a joint tree (pc.Entity pivots), animated by a code-driven
// action library — no GLB files, unlimited looks: skin/hair/costume colors are plain params,
// setLook() repaints an actor between films (the same rig, a new costume).
//
// Local space of a rig: the actor faces world −X at heading 0 (map +X), right = +Z, up = +Y.
// Placement mirrors the map like Location3D.placeObject: root at (−x, h, y), yaw = −heading.
// Registered through World3D.addObject(view, root, 'actor', { ink: false }) — toon bands and
// the silhouette outline apply; ink edges are skipped (a rig of boxes would over-ink).
//
// Game-layer usage (plain numbers, no pc types leak):
//   const a = ActorRig3D.spawn(app.location.view, { skin: '#d9996b', … }, { x, y, heading });
//   a.action('talk');  a.walkTo(1200, 900, 110);  a.faceTo(b.x, b.y);  a.setLook(costume);
//   ActorRig3D.update(dt);            // once per frame (Game.update)
//   ActorRig3D.despawn(a);  ActorRig3D.clear();
//
// Actions: idle, walk, run, talk, gesture, wave, punch, kick, kiss, dance, sit, drive,
// cheer, fall, dead, sneak, ride, look, crew. Looping unless noted; 'fall' holds its last
// frame and flips the actor to 'dead' (call a.action('dead') to keep the body down).

const ACTOR_RIG_ACTIONS = ['idle', 'walk', 'run', 'talk', 'gesture', 'wave', 'punch', 'kick',
    'kiss', 'dance', 'sit', 'drive', 'cheer', 'fall', 'dead', 'sneak', 'ride', 'look', 'crew'];

/** @satisfies {Record<string, any>} */
const ActorRig3D = {
    DEG: Math.PI / 180,
    /** @type {ActorHandle[]} */
    handles: [],
    _nextId: 1,
    /** @type {Map<string, pc.StandardMaterial>} */
    _mats: new Map(),
    /** @type {pc.Mesh | null} */
    _box: null,

    // One shared unit box mesh (1×1×1, centered): parts scale it. Normals/winding get the
    // same guards Mesh3D.build applies, so the outline hull and the light agree.
    unitBox(view) {
        if (this._box) return this._box;
        const positions = Procedural3D._box(1, 1, 1);
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
        this._box = mesh;
        return mesh;
    },

    // sRGB '#rrggbb' -> a cached StandardMaterial (diffuse in linear space, like the kit's).
    mat(hex) {
        const key = String(hex || '#808080').toLowerCase();
        let m = this._mats.get(key);
        if (m) return m;
        const v = parseInt(key.slice(1), 16);
        const lin = (/** @type {number} */ c) => {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        m = /** @type {ArcMaterial} */ (new pc.StandardMaterial());
        m.name = 'actor-' + key;
        m.diffuse = new pc.Color(lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255));
        m.update();
        this._mats.set(key, m);
        return m;
    },

    // A scaled box part parented to a joint entity; returns the mesh instance (for repaints).
    _part(parent, view, cx, cy, cz, sx, sy, sz, hex) {
        const e = new pc.Entity('part');
        parent.addChild(e);
        e.setLocalPosition(cx, cy, cz);
        e.setLocalScale(sx, sy, sz);
        e.addComponent('render', { layers: [pc.LAYERID_WORLD] });
        const mi = new pc.MeshInstance(this.unitBox(view), this.mat(hex), e);
        e.render.meshInstances = [mi];
        return mi;
    },

    /**
     * Build an actor. look — { skin, hair, shirt, pants, shoes, hat ('' — none), gender
     * ('m'|'f'), hairStyle (0..3), scale (0.85..1.15) }; opts — { x, y, h, heading (deg) }.
     * @param {View3D} view
     * @param {ActorLook} look
     * @param {{ x?: number, y?: number, h?: number, heading?: number, lod?: 'low' }} [opts]
     * @returns {ActorHandle}
     */
    spawn(view, look, opts) {
        const low = !!(opts && opts.lod === 'low');
        const o = opts || {};
        const L = ActorRig3D._normLook(look);
        const root = new pc.Entity('actor' + this._nextId);
        view.root.addChild(root);
        const id = this._nextId++;

        // Joint tree: hips -> torso -> (head, armL->foreL, armR->foreR); hips -> legL->shinL, legR->shinR.
        const joint = (/** @type {pc.Entity} */ parent, /** @type {string} */ name, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
            const e = new pc.Entity(name);
            parent.addChild(e);
            e.setLocalPosition(x, y, z);
            return e;
        };
        const hips = joint(root, 'hips', 0, 86, 0);
        const torso = joint(hips, 'torso', 0, 4, 0);
        const head = joint(torso, 'head', 0, 52, 0);
        const armL = joint(torso, 'armL', 0, 44, -19);
        const foreL = joint(armL, 'foreL', 0, -34, 0);
        const armR = joint(torso, 'armR', 0, 44, 19);
        const foreR = joint(armR, 'foreR', 0, -34, 0);
        const legL = joint(hips, 'legL', 0, -10, -11);
        const shinL = joint(legL, 'shinL', 0, -38, 0);
        const legR = joint(hips, 'legR', 0, -10, 11);
        const shinR = joint(legR, 'shinR', 0, -38, 0);

        /** @type {Record<string, pc.MeshInstance[]>} */
        const byRole = { skin: [], hair: [], shirt: [], pants: [], shoes: [], hat: [], eyes: [], mouth: [] };
        const P = (/** @type {pc.Entity} */ parent, /** @type {string} */ role,
            /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ cz,
            /** @type {number} */ sx, /** @type {number} */ sy, /** @type {number} */ sz, /** @type {string} */ hex) => {
            const mi = this._part(parent, view, cx, cy, cz, sx, sy, sz, hex);
            (byRole[role] || (byRole[role] = [])).push(mi);
        };

        // Pelvis + chest
        P(hips, 'pants', 0, -4, 0, 26, 16, 42, L.pants);
        P(torso, 'shirt', 0, 24, 0, 28, 48, 44, L.shirt);
        if (L.gender === 'f') P(hips, 'shirt', 0, -16, 0, 30, 26, 44, L.shirt);   // a dress/skirt block
        // Head, face, hair, hat
        P(head, 'skin', 0, 12, 0, 24, 26, 24, L.skin);
        // LOD: a background body keeps its silhouette (hat, hair, coat) but drops the face —
        // at crowd distance eyes and mouth cost meshes and read as nothing.
        if (!low) {
            P(head, 'eyes', -12, 15, -6, 2.5, 4.5, 4.5, '#2a1d14');
            P(head, 'eyes', -12, 15, 6, 2.5, 4.5, 4.5, '#2a1d14');
            P(head, 'mouth', -13.5, 6.5, 0, 2, 1.8, 7, '#4a2320');
        }
        if (L.hairStyle !== 3) {
            P(head, 'hair', 0, 24.5, 0, 25.5, 7, 25.5, L.hair);
            if (L.hairStyle === 0) P(head, 'hair', 10, 15, 0, 6, 16, 25.5, L.hair);
            if (L.hairStyle === 1) P(head, 'hair', 11, 6, 0, 8, 34, 26.5, L.hair);
            if (L.hairStyle === 2) { P(head, 'hair', 10, 15, 0, 6, 16, 25.5, L.hair); P(head, 'hair', 14, 27, 0, 10, 10, 10, L.hair); }
        }
        if (L.hat) {
            P(head, 'hat', 0, 27, 0, 46, 3, 46, L.hat);
            P(head, 'hat', 0, 34.5, 0, 22, 15, 22, L.hat);
        }
        // Arms
        P(armL, 'shirt', 0, -17, 0, 11, 34, 11, L.shirt);
        P(foreL, 'skin', 0, -15, 0, 10, 30, 10, L.skin);
        P(foreL, 'skin', 0, -33, 0, 10.5, 9, 10.5, L.skin);
        P(armR, 'shirt', 0, -17, 0, 11, 34, 11, L.shirt);
        P(foreR, 'skin', 0, -15, 0, 10, 30, 10, L.skin);
        P(foreR, 'skin', 0, -33, 0, 10.5, 9, 10.5, L.skin);
        // Legs
        P(legL, 'pants', 0, -19, 0, 13, 38, 13, L.pants);
        P(shinL, L.gender === 'f' ? 'skin' : 'pants', 0, -17, 0, 11, 34, 11, L.gender === 'f' ? L.skin : L.pants);
        P(shinL, 'shoes', -4, -34, 0, 22, 8, 12, L.shoes);
        P(legR, 'pants', 0, -19, 0, 13, 38, 13, L.pants);
        P(shinR, L.gender === 'f' ? 'skin' : 'pants', 0, -17, 0, 11, 34, 11, L.gender === 'f' ? L.skin : L.pants);
        P(shinR, 'shoes', -4, -34, 0, 22, 8, 12, L.shoes);

        World3D.addObject(view, root, 'actor', { ink: false });

        const h = {
            id: id,
            view: view,
            root: root,
            joints: { hips: hips, torso: torso, head: head, armL: armL, foreL: foreL, armR: armR, foreR: foreR, legL: legL, shinL: shinL, legR: legR, shinR: shinR },
            parts: byRole,
            look: L,
            x: Number(o.x) || 0,
            y: Number(o.y) || 0,
            h: Number(o.h) || 0,
            heading: Number(o.heading) || 0,
            action: 'idle',
            t: 0,
            speedMul: 1,
            phase: (id * 2.399) % (Math.PI * 2),     // a stable per-actor phase offset
            gesture: id % 3,
            moveTarget: null,
            moveSpeed: 110,
            arriveAction: 'idle',
            onArrive: null,
            onActionEnd: null,
            faceTarget: null,
            blinkIn: 1.2 + (id % 5) * 0.8,   // staggered: the cast never blinks in unison
            blinkHold: 0,
            mouthBase: { x: 2, y: 1.8, z: 7 },
            lookYaw: null,
            _done: false,
        };
        // The handle's own methods (plain closures over h — game code never sees pc types).
        const handle = /** @type {ActorHandle} */ (/** @type {any} */ (h));
        handle.act = ActorRig3D._actFn(handle);
        handle.walkTo = ActorRig3D._walkFn(handle);
        handle.faceTo = ActorRig3D._faceFn(handle);
        handle.setLook = ActorRig3D._lookFn(handle);
        this.handles.push(handle);
        this._place(handle);
        return handle;
    },

    _normLook(look) {
        const l = look || /** @type {ActorLook} */ ({});
        return {
            skin: l.skin || '#d9996b',
            hair: l.hair || '#3a2a1a',
            shirt: l.shirt || '#b8442f',
            pants: l.pants || '#3d4a63',
            shoes: l.shoes || '#4a3222',
            hat: l.hat || '',
            gender: l.gender === 'f' ? 'f' : 'm',
            hairStyle: Math.max(0, Math.min(3, Math.round(Number(l.hairStyle) || 0))),
            scale: Math.max(0.6, Math.min(1.4, Number(l.scale) || 1)),
        };
    },

    // Per-frame transform of one handle (map -> mirrored world, like placeObject).
    /** @param {any} h @param {ActorPose | null} [pose] */
    _place(h, pose) {
        const p = pose || null;
        const bob = p && p.bob ? p.bob : 0;
        const tilt = p && p.tilt ? p.tilt * this.DEG : 0;
        const s = h.look.scale;
        h.root.setPosition(-h.x, h.h + bob * s, h.y);
        h.root.setRotation(World3D.rotQuat(0, -h.heading * this.DEG, tilt));
        h.root.setLocalScale(s, s, s);
        if (p) {
            h.joints.hips.setLocalPosition(0, 86 + (p.hipsY || 0), 0);
            const j = p.j || {};
            for (const name of Object.keys(h.joints)) {
                const e = /** @type {pc.Entity} */ (/** @type {any} */ (h.joints)[name]);
                const r = j[name];
                if (name === 'hips') { if (r) e.setLocalEulerAngles(r[0], r[1], r[2]); continue; }
                e.setLocalEulerAngles(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
            }
        }
    },

    /**
     * One step of the secondary-motion spring (pure — tests hold it in their hands):
     * a damped oscillator driven by the body's acceleration; returns the new state.
     */
    _swayStep(st, accel, dt) {
        const k = 42, c = 6.5;                     // a soft braid of hair, not a metronome
        const a = accel - k * st.x - c * st.v;
        const v = st.v + a * dt;
        return { x: st.x + v * dt, v: v };
    },

    // Eyes and mouth that live: a staggered blink, a closed eye on a corpse, and a mouth that
    // opens with the line. Base scales mirror the parts built in spawn() (eyes 2.5/4.5/4.5,
    // mouth 2/1.8/7) — change one and you must change the other.
    _face(h, dt) {
        const eyes = h.parts && h.parts.eyes;
        const mouth = h.parts && h.parts.mouth;
        if (eyes && eyes.length) {
            const dead = h.action === 'dead';
            if (dead) h.blinkHold = 1;
            else if (h.blinkHold > 0) h.blinkHold -= dt;
            else {
                h.blinkIn -= dt;
                if (h.blinkIn <= 0) {
                    h.blinkHold = 0.12;
                    h.blinkIn = 2.2 + (Math.sin(h.phase * 13.7) * 0.5 + 0.5) * 3.4;
                }
            }
            const k = h.blinkHold > 0 ? 0.1 : 1;
            for (const mi of eyes) { if (mi.node && mi.node.setLocalScale) mi.node.setLocalScale(2.5, 4.5 * k, 4.5); }
        }
        if (mouth && mouth.length) {
            const b = h.mouthBase || { x: 2, y: 1.8, z: 7 };
            const k = h.action === 'talk' ? 0.55 + Math.abs(Math.sin(h.t * 13)) * 2.1 : 1;
            for (const mi of mouth) { if (mi.node && mi.node.setLocalScale) mi.node.setLocalScale(b.x, b.y * k, b.z); }
        }
    },

    /**
     * Secondary motion and hand poses, layered OVER the action pose (which the action library
     * rewrites every frame): the hair and the coat hem lag the body on a damped spring driven
     * by the body's own acceleration; a pose ('hips', 'point') rests the hands.
     */
    _secondary(h, dt) {
        const U = 'undefined';
        const on = typeof ACTOR_SECONDARY !== U ? ACTOR_SECONDARY : 1;
        const vx = h._px != null ? (h.x - h._px) / Math.max(1e-4, dt) : 0;
        const vy = h._py != null ? (h.y - h._py) / Math.max(1e-4, dt) : 0;
        h._px = h.x; h._py = h.y;
        const speed = Math.hypot(vx, vy);
        const accel = (speed - (h._ps || 0)) / Math.max(1e-4, dt);
        h._ps = speed;
        if (!on) { h._sw = { x: 0, v: 0 }; return; }
        h._sw = this._swayStep(h._sw || { x: 0, v: 0 }, Math.max(-900, Math.min(900, accel)) * 0.0016, Math.min(0.05, dt));
        const sway = Math.max(-1, Math.min(1, h._sw.x));
        const bob = Math.sin(h.t * (h.action === 'walk' ? 9 : h.action === 'run' ? 13 : 2.2)) * (h.action === 'run' ? 0.35 : h.action === 'walk' ? 0.2 : 0.06);
        const hairK = 2.6 * sway + 1.6 * bob;
        for (const mi of (h.parts && h.parts.hair) || []) {
            if (mi.node && mi.node.setLocalEulerAngles) mi.node.setLocalEulerAngles(hairK * 0.4, 0, hairK);
        }
        for (const mi of (h.parts && h.parts.shirt) || []) {
            if (mi.node && mi.node.setLocalEulerAngles) mi.node.setLocalEulerAngles(-hairK * 0.25, 0, -hairK * 0.5);
        }
        const j = h.joints;
        if (h.pose === 'hips' && j) {
            j.armL.setLocalEulerAngles(0, 0, 34); j.foreL.setLocalEulerAngles(0, 0, 74);
            j.armR.setLocalEulerAngles(0, 0, -34); j.foreR.setLocalEulerAngles(0, 0, -74);
        } else if (h.pose === 'point' && j) {
            j.armR.setLocalEulerAngles(-78, 0, -6); j.foreR.setLocalEulerAngles(-14, 0, 0);
            j.armL.setLocalEulerAngles(0, 0, 10); j.foreL.setLocalEulerAngles(0, 0, 20);
        }
    },

    update(dt) {
        for (const h of this.handles) {
            // Movement along the map.
            if (h.moveTarget) {
                const dx = h.moveTarget.x - h.x, dy = h.moveTarget.y - h.y;
                const d = Math.hypot(dx, dy);
                const step = h.moveSpeed * dt;
                if (d <= Math.max(2, step)) {
                    h.x = h.moveTarget.x; h.y = h.moveTarget.y;
                    h.moveTarget = null;
                    const act = h.arriveAction || 'idle';
                    ActorRig3D.setAction(h, act);
                    if (typeof h.onArrive === 'function') { const f = h.onArrive; h.onArrive = null; f(h); }
                } else {
                    h.x += dx / d * step;
                    h.y += dy / d * step;
                    h.heading = Math.atan2(dy, dx) / ActorRig3D.DEG;
                    ActorRig3D.setAction(h, h.moveSpeed > 190 ? 'run' : 'walk', true);
                    h.speedMul = Math.max(0.4, Math.min(2.2, h.moveSpeed / 110));
                }
            }
            // Smooth turning toward a face target.
            if (h.faceTarget) {
                const want = Math.atan2(h.faceTarget.y - h.y, h.faceTarget.x - h.x) / ActorRig3D.DEG;
                let d = ((want - h.heading + 540) % 360) - 180;
                const step = 240 * dt;
                if (Math.abs(d) <= step) { h.heading = want; h.faceTarget = null; }
                else h.heading += Math.sign(d) * step;
            }
            // Animation clock.
            h.t += dt * (h.speedMul || 1);
            ActorRig3D._face(h, dt);
            const A = ActorRig3D.ACTIONS[h.action] || ActorRig3D.ACTIONS['idle'];
            if (!A.loop) {
                if (h.t >= A.dur) {
                    h.t = A.dur;
                    if (!h._done) {
                        h._done = true;
                        if (A.then) ActorRig3D.setAction(h, A.then);
                        if (typeof h.onActionEnd === 'function') { const f = h.onActionEnd; h.onActionEnd = null; f(h); }
                    }
                }
            }
            const pose = A.pose(h.t, h);
            if (h.lookYaw != null) {
                // A head/torso turn toward an absolute map yaw (degrees), clamped to the neck.
                let d = ((h.lookYaw - h.heading + 540) % 360) - 180;
                d = Math.max(-70, Math.min(70, d));
                pose.j = pose.j || {};
                pose.j.head = [0, -d * 0.7, 0];
                pose.j.torso = [0, -d * 0.25, 0];
            }
            ActorRig3D._place(h, pose);
        }
    },

    // --- handle methods (assigned in spawn) -----------------------------------------

    /** @param {any} h */
    _actFn(h) {
        return (/** @type {string} */ name, /** @type {{ speedMul?: number, onEnd?: ((handle: ActorHandle) => void) | null } | undefined} */ opts) => {
            ActorRig3D.setAction(h, name, false, opts);
            return h;
        };
    },
    /** @param {any} h */
    _walkFn(h) {
        return (/** @type {number} */ x, /** @type {number} */ y, /** @type {number | undefined} */ speed, /** @type {string | undefined} */ arriveAction, /** @type {((handle: ActorHandle) => void) | null | undefined} */ onArrive) => {
            h.moveTarget = { x: x, y: y };
            h.moveSpeed = Math.max(20, Number(speed) || 110);
            h.arriveAction = arriveAction || 'idle';
            h.onArrive = onArrive || null;
            return h;
        };
    },
    /** @param {any} h */
    _faceFn(h) {
        return (/** @type {number} */ x, /** @type {number} */ y, /** @type {boolean | undefined} */ instant) => {
            if (instant) {
                h.heading = Math.atan2(y - h.y, x - h.x) / ActorRig3D.DEG;
                h.faceTarget = null;
            } else h.faceTarget = { x: x, y: y };
            return h;
        };
    },
    /** @param {any} h */
    _lookFn(h) {
        return (/** @type {ActorLook} */ look) => {
            const L = ActorRig3D._normLook(Object.assign({}, h.look, look || {}));
            h.look = L;
            for (const role of Object.keys(h.parts)) {
                const hex = /** @type {string} */ (role === 'eyes' ? '#2a1d14'
                    : role === 'mouth' ? '#4a2320'
                    : (/** @type {any} */ (L))[role] || '#808080');
                if (role === 'hat' && !L.hat) { for (const mi of h.parts[role]) mi.enabled = false; continue; }
                if (role === 'hat') { for (const mi of h.parts[role]) mi.enabled = true; }
                if (role === 'hair' && L.hairStyle === 3) { for (const mi of h.parts[role]) mi.enabled = false; continue; }
                if (role === 'hair') { for (const mi of h.parts[role]) mi.enabled = true; }
                const m = ActorRig3D.mat(hex);
                for (const mi of h.parts[role]) mi.material = m;
            }
            return h;
        };
    },

    /** @param {any} h @param {string} name @param {boolean} [keepClock] @param {{ speedMul?: number, onEnd?: ((handle: ActorHandle) => void) | null }} [opts] */
    setAction(h, name, keepClock, opts) {
        const A = ActorRig3D.ACTIONS[name] ? name : 'idle';
        if (h.action !== A || !keepClock) { h.action = A; h._done = false; if (!keepClock) h.t = 0; }
        if (opts && opts.speedMul != null) h.speedMul = opts.speedMul;
        if (opts && opts.onEnd) h.onActionEnd = opts.onEnd;
    },

    despawn(h) {
        const i = this.handles.indexOf(h);
        if (i >= 0) this.handles.splice(i, 1);
        if (h.holdHandle && typeof SetPieces3D !== 'undefined') { SetPieces3D.dispose(h.holdHandle); h.holdHandle = null; }
        World3D.removeObject(h.view, h.root);
    },

    clear() {
        for (const h of this.handles.slice()) this.despawn(h);
        this.handles.length = 0;
    },

    // --- action library ----------------------------------------------------------------
    // A pose: { j: { joint: [rx, ry, rz] deg }, hipsY, bob, tilt } in the rig's local space
    // (forward = −X): rz negative swings a hanging limb FORWARD, positive leans the torso
    // forward; rx positive moves a hanging limb toward −Z (the actor's left).

    /** Piecewise-linear keyframes: kf(0.5, [[0, 0], [1, 10]]). */
    kf(t, keys) {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 1; i < keys.length; i++) {
            if (t <= keys[i][0]) {
                const t0 = keys[i - 1][0], v0 = keys[i - 1][1], t1 = keys[i][0], v1 = keys[i][1];
                return v0 + (v1 - v0) * (t - t0) / ((t1 - t0) || 1);
            }
        }
        return keys[keys.length - 1][1];
    },

    _restPose() {
        return {
            j: {
                head: [0, 0, 0], torso: [0, 0, 0],
                armL: [5, 0, 0], foreL: [0, 0, -12],
                armR: [-5, 0, 0], foreR: [0, 0, -12],
                legL: [0, 0, 0], shinL: [0, 0, 0],
                legR: [0, 0, 0], shinR: [0, 0, 0],
            },
            hipsY: 0, bob: 0, tilt: 0,
        };
    },

    ACTIONS: /** @type {Record<string, { loop: boolean, dur: number, then?: string, pose: (t: number, h: ActorHandle) => ActorPose }>} */ ({}),
};

// The library itself (kept out of the namespace literal for readable math).
(() => {
    const A = ActorRig3D.ACTIONS;
    const rest = ActorRig3D._restPose;
    const kf = (/** @type {number} */ t, /** @type {number[][]} */ keys) => ActorRig3D.kf(t, keys);
    const TAU = Math.PI * 2;

    A['idle'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 3.6 + h.phase;
            p.j.torso = [0, 2 * Math.sin(f * 0.7), 1.6 * Math.sin(f)];
            p.j.head = [0, 7 * Math.sin(f * 0.37 + h.phase), 1.5 * Math.sin(f * 0.8)];
            p.j.armL = [5, 0, 3 * Math.sin(f)]; p.j.foreL = [0, 0, -14];
            p.j.armR = [-5, 0, -3 * Math.sin(f + 1)]; p.j.foreR = [0, 0, -14];
            p.bob = 1.1 * Math.sin(f);
            return p;
        },
    };

    const gait = (period, legAmp, shinAmp, armAmp, lean, bobAmp, shinPhase, elbow) => (t, h) => {
        const p = rest(), f = TAU * t / period + h.phase;
        const s = Math.sin(f);
        p.j.legL = [0, 0, -legAmp * s];
        p.j.legR = [0, 0, legAmp * s];
        p.j.shinL = [0, 0, shinAmp * Math.max(0, Math.sin(f - shinPhase))];
        p.j.shinR = [0, 0, shinAmp * Math.max(0, Math.sin(f - shinPhase + Math.PI))];
        p.j.armL = [4, 0, armAmp * s]; p.j.foreL = [0, 0, -elbow];
        p.j.armR = [-4, 0, -armAmp * s]; p.j.foreR = [0, 0, -elbow];
        p.j.torso = [0, 5 * s, lean];
        p.j.head = [0, -3 * s, 0];
        p.bob = bobAmp * Math.abs(Math.sin(f));
        p.hipsY = -bobAmp * 0.4;
        return p;
    };
    A['walk'] = { loop: true, dur: 0, pose: gait(0.95, 26, 32, 16, 4, 2.4, 2.0, 18) };
    A['run'] = { loop: true, dur: 0, pose: gait(0.62, 42, 62, 34, 12, 5, 2.2, 55) };
    A['sneak'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = gait(0.6, 15, 20, 8, 16, 1.4, 2.0, 35)(t, h);
            p.hipsY = -16;
            p.j.armL = [4, 0, 18]; p.j.armR = [-4, 0, -18];
            return p;
        },
    };

    A['talk'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 1.15 + h.phase, g = h.gesture;
            p.j.torso = [0, 5 * Math.sin(f * 1.3), 2];
            p.j.head = [2 * Math.sin(f * 2.1), 8 * Math.sin(f * 0.9), 3 * Math.sin(f * 1.7)];
            const amp = g === 0 ? 18 : g === 1 ? 30 : 42;
            p.j.armR = [-5, 0, -(amp * (0.55 + 0.45 * Math.sin(f * 2)))];
            p.j.foreR = [0, 0, -(45 + 25 * Math.sin(f * 2.4 + 1))];
            p.j.armL = [5, 0, -(8 + 5 * Math.sin(f * 1.6))];
            p.j.foreL = [0, 0, -30];
            p.bob = 0.8 * Math.sin(f * 2);
            return p;
        },
    };

    A['gesture'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 1.6 + h.phase;
            p.j.torso = [0, 6 * Math.sin(f), 4];
            p.j.head = [0, 6 * Math.sin(f * 0.8), 0];
            p.j.armL = [12, 0, -(35 + 30 * Math.max(0, Math.sin(f)))]; p.j.foreL = [0, 0, -(50 + 30 * Math.max(0, Math.sin(f + 0.6)))];
            p.j.armR = [-12, 0, -(35 + 30 * Math.max(0, Math.sin(f + Math.PI)))]; p.j.foreR = [0, 0, -(50 + 30 * Math.max(0, Math.sin(f + Math.PI + 0.6)))];
            return p;
        },
    };

    A['wave'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t;
            p.j.armR = [-140 + 8 * Math.sin(f * 1.5), 0, -8];
            p.j.foreR = [25 * Math.sin(f * 3 + h.phase), 0, -35];
            p.j.armL = [5, 0, 4]; p.j.foreL = [0, 0, -16];
            p.j.head = [0, -6, 5 * Math.sin(f * 1.5)];
            p.j.torso = [0, -4, 2];
            return p;
        },
    };

    A['punch'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), c = t % 1.5;
            const wind = kf(c, [[0, 0], [0.42, 1], [0.52, 0], [1.5, 0]]);
            const hit = kf(c, [[0, 0], [0.42, 0], [0.54, 1], [0.75, 0.4], [1.1, 0]]);
            p.j.armR = [-5, 0, 30 * wind - 88 * hit - 25 * (1 - wind - hit > 0 ? 0 : 0)];
            p.j.foreR = [0, 0, -70 * (1 - hit) - 8 * hit];
            p.j.armL = [5, 0, -38]; p.j.foreL = [0, 0, -78];          // guard
            p.j.torso = [0, -14 * wind + 20 * hit, 5 * hit];
            p.j.legL = [0, 0, -8 * hit]; p.j.legR = [0, 0, 10 * hit];
            p.bob = -2.5 * hit;
            return p;
        },
    };

    A['kick'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), c = t % 1.6;
            const k = kf(c, [[0, 0], [0.4, 0.15], [0.58, 1], [0.85, 0.3], [1.2, 0]]);
            p.j.legR = [0, 0, -78 * k];
            p.j.shinR = [0, 0, 55 * (1 - k)];
            p.j.legL = [0, 0, 6 * k]; p.j.shinL = [0, 0, 8 * k];
            p.j.torso = [0, 0, 16 * k];
            p.j.armL = [25 * k, 0, -20 * k]; p.j.armR = [-25 * k, 0, 20 * k];
            p.bob = -3 * k;
            return p;
        },
    };

    A['kiss'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 2.4 + h.phase;
            p.j.torso = [0, 6, 13 + 1.5 * Math.sin(f)];
            p.j.head = [0, 14, 9];
            p.j.armL = [8, 0, -58]; p.j.foreL = [0, 0, -52];
            p.j.armR = [-8, 0, -58]; p.j.foreR = [0, 0, -52];
            p.hipsY = 2;
            p.bob = 1.2 * Math.sin(f);
            return p;
        },
    };

    A['dance'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 1.05 + h.phase;
            const s = Math.sin(f);
            p.j.hips = [0, 13 * s, 0];
            p.j.torso = [0, -8 * s, 4];
            p.j.head = [0, -5 * s, 6 * Math.sin(f * 2)];
            p.j.armL = [18 + 12 * Math.max(0, s), 0, -(35 + 55 * Math.max(0, s))];
            p.j.armR = [-18 - 12 * Math.max(0, -s), 0, -(35 + 55 * Math.max(0, -s))];
            p.j.foreL = [0, 0, -30 - 35 * Math.max(0, s)];
            p.j.foreR = [0, 0, -30 - 35 * Math.max(0, -s)];
            p.j.legL = [0, 0, -10 * Math.max(0, s)]; p.j.shinL = [0, 0, 18 * Math.max(0, s)];
            p.j.legR = [0, 0, -10 * Math.max(0, -s)]; p.j.shinR = [0, 0, 18 * Math.max(0, -s)];
            p.bob = 6 * Math.abs(s);
            return p;
        },
    };

    A['sit'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 4 + h.phase;
            p.hipsY = -42;
            p.j.legL = [3, 0, -84]; p.j.legR = [-3, 0, -84];
            p.j.shinL = [0, 0, 84]; p.j.shinR = [0, 0, 84];
            p.j.torso = [0, 2 * Math.sin(f * 0.6), 5];
            p.j.armL = [5, 0, -10]; p.j.foreL = [0, 0, -58];
            p.j.armR = [-5, 0, -10]; p.j.foreR = [0, 0, -58];
            p.j.head = [3 * Math.sin(f), 6 * Math.sin(f * 0.5), 0];
            return p;
        },
    };

    A['drive'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 3 + h.phase;
            p.hipsY = -42;
            p.j.legL = [3, 0, -84]; p.j.legR = [-3, 0, -84];
            p.j.shinL = [0, 0, 84]; p.j.shinR = [0, 0, 84];
            p.j.torso = [0, 0, 9];
            p.j.armL = [6, 0, -62]; p.j.foreL = [0, 0, -34 + 4 * Math.sin(f)];
            p.j.armR = [-6, 0, -62]; p.j.foreR = [0, 0, -34 + 4 * Math.sin(f + 1)];
            p.j.head = [0, 4 * Math.sin(f * 0.7), 0];
            return p;
        },
    };

    A['cheer'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 0.72 + h.phase;
            const jump = Math.max(0, Math.sin(f));
            p.j.armL = [160, 0, -8]; p.j.armR = [-160, 0, 8];
            p.j.foreL = [0, 0, -14]; p.j.foreR = [0, 0, -14];
            p.j.legL = [0, 0, -16 * jump]; p.j.legR = [0, 0, -16 * jump];
            p.j.shinL = [0, 0, 26 * jump]; p.j.shinR = [0, 0, 26 * jump];
            p.j.head = [-7, 0, 0];
            p.j.torso = [0, 0, -3];
            p.bob = 10 * jump;
            return p;
        },
    };

    A['fall'] = {
        loop: false, dur: 0.7, then: 'dead',
        pose(t, h) {
            const p = rest();
            const k = kf(t, [[0, 0], [0.5, 0.86], [0.7, 1]]);
            const flail = Math.sin(Math.min(1, t / 0.5) * Math.PI);
            p.tilt = 86 * k;
            p.hipsY = -66 * k;
            p.j.torso = [0, 0, 8 * k];
            p.j.head = [0, 0, -14 * k];
            p.j.armL = [30 * flail, 0, -(70 * flail)];
            p.j.armR = [-30 * flail, 0, 70 * flail * 0.6];
            p.j.foreL = [0, 0, -40 * flail];
            p.j.legL = [0, 0, -22 * k]; p.j.legR = [0, 0, 16 * k];
            p.j.shinL = [0, 0, 18 * k]; p.j.shinR = [0, 0, 12 * k];
            return p;
        },
    };

    A['dead'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest();
            p.tilt = 86;
            p.hipsY = -66;
            p.j.head = [0, 0, -14];
            p.j.torso = [0, 0, 8];
            p.j.armL = [6, 0, -10]; p.j.armR = [-6, 0, 10];
            p.j.legL = [0, 0, -22]; p.j.legR = [0, 0, 16];
            p.j.shinL = [0, 0, 18]; p.j.shinR = [0, 0, 12];
            return p;
        },
    };

    A['ride'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 0.44 + h.phase;
            p.j.legL = [26, 0, -34 + 6 * Math.sin(f)]; p.j.legR = [-26, 0, -34 + 6 * Math.sin(f + Math.PI)];
            p.j.shinL = [0, 0, 52]; p.j.shinR = [0, 0, 52];
            p.j.torso = [0, 0, 9 + 3 * Math.sin(f)];
            p.j.armL = [5, 0, -36]; p.j.foreL = [0, 0, -32];
            p.j.armR = [-5, 0, -36]; p.j.foreR = [0, 0, -32];
            p.j.head = [0, 0, -3];
            p.bob = 5 * Math.sin(f);
            return p;
        },
    };

    A['look'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = A['idle'].pose(t, h);
            return p;   // lookYaw (set by the caller) turns head/torso in update()
        },
    };

    A['crew'] = {
        loop: true, dur: 0,
        pose(t, h) {
            const p = rest(), f = TAU * t / 2.2 + h.phase;
            const bend = Math.max(0, Math.sin(f));
            p.j.torso = [0, 8 * Math.sin(f * 0.4), 26 * bend];
            p.j.head = [0, 14 * Math.sin(f * 0.31), -10 * bend];
            p.j.armR = [-6, 0, -(28 + 46 * Math.max(0, Math.sin(f * 2)))];
            p.j.foreR = [0, 0, -52];
            p.j.armL = [5, 0, -18]; p.j.foreL = [0, 0, -40];
            p.j.legL = [0, 0, -6 * bend]; p.j.legR = [0, 0, 6 * bend];
            p.hipsY = -8 * bend;
            return p;
        },
    };
})();
