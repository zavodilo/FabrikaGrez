// Sky3D.js — the procedural sky (ENGINE layer: pc.*). A gradient dome with the sun disc,
// procedural stars and a plane-projected fbm cloud layer drifting on the shader clock. The lot wears
// it from the boot; MovieSequencer dresses every exterior scene in it (interiors hide it —
// a dollhouse shot has no horizon) and aims its sun disc at the shot's key light, so the disc
// in the sky and the shadow on the ground never disagree.
//
//   Sky3D.attach(view);            // once, from main.js
//   Sky3D.setLot();                // the neutral day sky of the studio lot
//   Sky3D.setLook(tod, grade);     // a scene's hour: palettes from gradeFor()
//   Sky3D.setSun(azDeg, elDeg);    // the disc follows the shot's key
//   Sky3D.hide() / show();         // interiors / exteriors
//
// The pure half (paletteFor) runs without the engine and is covered by tests/fabrika-light.

/** @satisfies {Record<string, any>} */
const Sky3D = {
    /** @type {any} */ view: null,
    dome: null,
    mat: null,
    attached: false,
    visible: true,
    /** Playback seconds for the cloud drift while a film runs (null — wall clock). */
    movieT: null,
    _t: 0,
    _last: 0,

    cfg() {
        const U = 'undefined';
        return {
            on: typeof SKY_PROCEDURAL !== U ? SKY_PROCEDURAL : 1,
            domeR: typeof SKY_DOME_R !== U ? SKY_DOME_R : 6000,
            clouds: typeof SKY_CLOUDS !== U ? SKY_CLOUDS : 9,
            sunSize: typeof SKY_SUN_SIZE !== U ? SKY_SUN_SIZE : 0.9975,
            stars: typeof SKY_STARS !== U ? SKY_STARS : 1,
            backX: typeof STUDIO_BACKLOT_X !== U ? STUDIO_BACKLOT_X : 3200,
            backY: typeof STUDIO_BACKLOT_Y !== U ? STUDIO_BACKLOT_Y : 3200,
        };
    },

    // --- the looks (pure): the hour owns the palette ------------------------------------------

    /**
     * The sky palette of an hour (pure — no engine). skyHex/sunHex come from the scene grade
     * (MovieSequencer.gradeFor): the horizon keeps the grade's sky, the zenith deepens it,
     * the night trades the sun for a cold moon and fades the stars in.
     * @param {string | null} tod 'day' | 'sunset' | 'night'
     * @param {{ sky?: number, sunColor?: number, sunIntensity?: number }} grade
     * @returns {{ top: number[], horizon: number[], bottom: number[], sun: number[], sunI: number, stars: number, cloud: number }}
     */
    paletteFor(tod, grade) {
        const g = grade || {};
        const c = this.cfg();
        const rgb = (hex) => {
            const v = (hex == null ? 0x8fc3e0 : hex) | 0;
            return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
        };
        const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
        const sky = rgb(g.sky != null ? g.sky : 0x8fc3e0);
        const sun = rgb(g.sunColor != null ? g.sunColor : 0xfff7e6);
        const sunI = Math.max(0, g.sunIntensity != null ? g.sunIntensity : 0.8);
        if (tod === 'night') {
            return {
                top: mix(scale(sky, 0.55), [0.02, 0.03, 0.09], 0.6),
                horizon: mix(sky, [0.08, 0.11, 0.22], 0.5),
                bottom: scale(sky, 0.25),
                sun: mix(sun, [0.75, 0.82, 1.0], 0.6),
                sunI: Math.min(1.2, sunI * 1.6),
                stars: c.stars,
                cloud: 0.22,
            };
        }
        if (tod === 'sunset') {
            return {
                top: mix(scale(sky, 0.7), [0.16, 0.12, 0.28], 0.55),
                horizon: mix(sky, [1.0, 0.55, 0.22], 0.55),
                bottom: mix(scale(sky, 0.5), [0.2, 0.14, 0.12], 0.5),
                sun: mix(sun, [1.0, 0.6, 0.25], 0.5),
                sunI: sunI * 1.5,
                stars: 0,
                cloud: 0.65,
            };
        }
        return {
            top: mix(scale(sky, 0.85), [0.16, 0.35, 0.68], 0.5),
            horizon: mix(sky, [1, 1, 1], 0.22),
            bottom: mix(scale(sky, 0.7), [0.42, 0.4, 0.34], 0.5),
            sun: sun,
            sunI: sunI * 1.7,
            stars: 0,
            cloud: 0.85,
        };
    },

    // --- the engine half -------------------------------------------------------------------------

    /**
     * Build the dome and the cloud ring on a view. Returns false when the engine cannot
     * draw them here (no WebGL2 shapes) — the flat clear color stays as the fallback sky.
     * @param {any} view View3D
     */
    attach(view) {
        this.view = view || null;
        this.attached = false;
        if (!view || typeof pc === 'undefined' || !this.cfg().on) return false;
        const dev = view.app.graphicsDevice;
        if (!dev || typeof pc.createSphere !== 'function') return false;
        const c = this.cfg();

        // The dome: an inside-out sphere riding on the camera, unlit, depth-read but never
        // depth-writing — geometry closer than the horizon simply draws over it.
        const mesh = pc.createSphere(dev, { radius: c.domeR, segments: 20 });
        this.mat = new pc.ShaderMaterial({
            uniqueName: 'arcSky' + view.uid,
            attributes: { vertex_position: pc.SEMANTIC_POSITION },
            vertexGLSL: [
                'attribute vec3 vertex_position;',
                'uniform mat4 matrix_model;',
                'uniform mat4 matrix_viewProjection;',
                'varying vec3 vDir;',
                'void main(void) {',
                '    vDir = vertex_position;',
                '    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);',
                '}',
            ].join('\n'),
            fragmentGLSL: [
                'precision highp float;',
                'varying vec3 vDir;',
                'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;',
                'uniform vec3 uSunDir; uniform vec3 uSunColor;',
                'uniform float uSunSize; uniform float uSunI; uniform float uStars; uniform float uTime;',
                'uniform float uCloud;',
                'float hsh(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }',
                'float vnoise(vec2 p) {',
                '    vec2 i = floor(p), f = fract(p);',
                '    f = f * f * (3.0 - 2.0 * f);',
                '    return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y);',
                '}',
                'float fbm(vec2 p) {',
                '    float a = 0.55, s = 0.0;',
                '    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + 17.3; a *= 0.5; }',
                '    return s;',
                '}',
                'float hash13(vec3 p) {',
                '    p = fract(p * 0.1031);',
                '    p += dot(p, p.yzx + 33.33);',
                '    return fract((p.x + p.y) * p.z);',
                '}',
                'void main(void) {',
                '    vec3 d = normalize(vDir);',
                '    vec3 col = mix(uHorizon, uTop, smoothstep(0.015, 0.45, d.y));',
                '    col = mix(col, uBottom, smoothstep(0.0, -0.22, d.y));',
                '    float sd = dot(d, normalize(uSunDir));',
                '    float disc = smoothstep(uSunSize, uSunSize + 0.0035, sd);',
                '    float halo = pow(max(sd, 0.0), 32.0) * 0.30 + pow(max(sd, 0.0), 5.0) * 0.10;',
                '    col += uSunColor * (disc * uSunI + halo * uSunI);',
                '    if (uCloud > 0.01 && d.y > 0.015) {',          // clouds live on a plane: project the ray
                '        vec2 cp = d.xz / max(d.y, 0.06);',
                '        float cn = fbm(cp * 0.22 + vec2(uTime * 0.004, uTime * 0.0015));',
                '        float cov = smoothstep(0.52, 0.74, cn) * smoothstep(0.015, 0.10, d.y) * uCloud;',
                '        vec3 cc = mix(vec3(0.92, 0.94, 0.98), uSunColor, 0.25);',
                '        col = mix(col, cc, cov);',
                '    }',
                '    if (uStars > 0.001 && d.y > 0.01) {',
                '        vec3 q = floor(d * 240.0);',
                '        float s = hash13(q);',
                '        float star = step(0.9975, s) * (0.55 + 0.45 * sin(uTime * 2.1 + s * 97.0));',
                '        col += vec3(star) * uStars * smoothstep(0.01, 0.28, d.y);',
                '    }',
                '    gl_FragColor = vec4(col, 1.0);',
                '}',
            ].join('\n'),
        });
        this.mat.cull = pc.CULLFACE_FRONT;       // we live INSIDE the sphere
        this.mat.depthWrite = false;
        this.mat.setParameter('uTop', [0.2, 0.4, 0.7]);
        this.mat.setParameter('uHorizon', [0.6, 0.75, 0.88]);
        this.mat.setParameter('uBottom', [0.3, 0.3, 0.28]);
        this.mat.setParameter('uSunDir', [0.5, 0.7, 0.3]);
        this.mat.setParameter('uSunColor', [1, 0.95, 0.85]);
        this.mat.setParameter('uSunSize', c.sunSize);
        this.mat.setParameter('uSunI', 1.2);
        this.mat.setParameter('uStars', 0);
        this.mat.setParameter('uTime', 0);
        this.dome = new pc.Entity('sky-dome');
        view.root.addChild(this.dome);
        this.dome.addComponent('render', { layers: [pc.LAYERID_WORLD] });
        this.dome.render.meshInstances = [new pc.MeshInstance(mesh, this.mat, this.dome)];
        const mi = this.dome.render.meshInstances[0];
        mi.castShadow = false;
        mi.receiveShadow = false;

        // The cloud ring: billboards on a turntable around the camera, one shared texture.
        view.onBeforeFrame(() => this._sync());
        this.attached = true;
        return true;
    },

    /** The dome rides the camera; the cloud layer drifts on the shader clock. */
    _sync() {
        if (!this.attached || !this.view) return;
        const cam = this.view.camEntity;
        if (!cam) return;
        const p = cam.getPosition();
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const dt = this._last ? Math.min(0.1, Math.max(0, now - this._last)) : 0;
        this._last = now;
        this._t += dt;
        if (this.dome) this.dome.setPosition(p.x, p.y, p.z);
        if (this.mat) this.mat.setParameter('uTime', this.movieT != null ? this.movieT : this._t);
    },

    /** Wear an hour of day: grade is MovieSequencer.gradeFor(tod) plus the scene's sky color. */
    setLook(tod, grade) {
        if (!this.attached || !this.mat) return;
        const pal = this.paletteFor(tod, grade);
        this.mat.setParameter('uTop', pal.top);
        this.mat.setParameter('uHorizon', pal.horizon);
        this.mat.setParameter('uBottom', pal.bottom);
        this.mat.setParameter('uSunColor', pal.sun);
        this.mat.setParameter('uSunI', pal.sunI);
        this.mat.setParameter('uStars', pal.stars);
        if (this.mat) {
            const dens = Math.min(1.5, Math.max(0, this.cfg().clouds) / 9);
            this.mat.setParameter('uCloud', pal.cloud * dens);
        }
        const g = grade || {};
        if (g.sunAz != null || g.sunEl != null) this.setSun(g.sunAz != null ? g.sunAz : 53, g.sunEl != null ? g.sunEl : 48);
    },

    /** Aim the disc where the shot's key stands (the shadow and the sky agree). */
    setSun(azDeg, elDeg) {
        if (!this.attached || !this.mat || typeof World3D === 'undefined') return;
        const dir = World3D.sunDirection({ sunAz: azDeg, sunEl: Math.max(2, Math.min(88, elDeg)), sunIntensity: 1, sunColor: 0xffffff });
        this.mat.setParameter('uSunDir', [-dir.x, -dir.y, -dir.z]);   // toward the sun, not along its light
    },

    /** Interiors: no horizon in a dollhouse shot. */
    hide() {
        this.visible = false;
        if (this.dome) this.dome.enabled = false;
    },

    show() {
        this.visible = true;
        if (this.dome) this.dome.enabled = true;
    },

    /** The lot's neutral day sky (the render constants own its colors). */
    setLot() {
        if (!this.attached) return;
        const c = (typeof World3D !== 'undefined' && World3D.cfg) ? World3D.cfg() : {};
        this.show();
        this.setLook('day', { sky: c.sky != null ? c.sky : 0x8fc3e0, sunColor: c.sunColor != null ? c.sunColor : 0xfff7e6, sunIntensity: c.sunIntensity != null ? c.sunIntensity : 0.8, sunAz: c.sunAz != null ? c.sunAz : 53, sunEl: c.sunEl != null ? c.sunEl : 48 });
    },

    dispose() {
        if (this.dome) { try { this.dome.destroy(); } catch (e) { /* gone */ } this.dome = null; }
        if (this.mat) { try { this.mat.destroy(); } catch (e) { /* gone */ } this.mat = null; }
        this.attached = false;
        this.view = null;
    },
};
