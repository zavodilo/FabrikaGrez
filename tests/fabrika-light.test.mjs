// «Фабрика Грёз»: свет площадки без движка. Палитра процедурного неба (Sky3D.paletteFor),
// параметры трёхточечной схемы по кадру и времени суток (MovieSequencer.lightRigFor) и
// практические источники (SetPieces3D.setPracticals/tickPracticals) на фейковых ручках —
// движок им не нужен,_gate и интенсивности считаются чистой арифметикой.
//
//  1) Небо: ночь приносит звёзды и тёмный зенит, закат — тёплый горизонт, день — высокий ключ;
//     палитра детерминирована и лежит в разумных диапазонах.
//  2) Риг: ключ стоит вне оси объектива на своей стороне сцены, его высота зависит от часа
//     и крупности плана; контровой ночью режет силуэт, днём лишь шепчет.
//  3) Практические: 'always' горят всегда (днём на улице — вполсилы), 'night' спят днём
//     на улице; level 0 гасит всё; мерцание костра дышит в границах и детерминировано.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js', 'js/ActorModels.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/Sky3D.js', 'js/MovieSequencer.js',
]);
const get = page.get;
const Sky3D = get('Sky3D');
const MovieSequencer = get('MovieSequencer');
const SetPieces3D = get('SetPieces3D');

const inRange = (v) => v >= 0 && v <= 2;
const pal3 = (a) => a.every(inRange);

test('небо: палитры суток честные, детерминированные и в диапазонах', () => {
    const grade = { sky: 0x9fc4e0, sunColor: 0xffedc7, sunIntensity: 0.85 };
    const day = Sky3D.paletteFor('day', grade);
    const sunset = Sky3D.paletteFor('sunset', { sky: 0x3a2438, sunColor: 0xff9a3c, sunIntensity: 0.7 });
    const night = Sky3D.paletteFor('night', { sky: 0x0a1030, sunColor: 0x8fa8ff, sunIntensity: 0.32 });
    for (const p of [day, sunset, night]) {
        assert.ok(pal3(p.top) && pal3(p.horizon) && pal3(p.bottom) && pal3(p.sun), 'канал палитры вне 0..2');
        assert.ok(p.sunI >= 0 && p.sunI <= 3, 'интенсивность диска ' + p.sunI);
        assert.ok(p.cloud >= 0 && p.cloud <= 1, 'облачность ' + p.cloud);
    }
    assert.equal(night.stars, 1, 'ночью проступают звёзды');
    assert.equal(day.stars, 0, 'днём звёзд нет');
    assert.equal(sunset.stars, 0, 'на закате звёзд ещё нет');
    const lum = (c) => c[0] + c[1] + c[2];
    assert.ok(lum(night.top) < lum(day.top), 'ночной зенит темнее дневного');
    assert.ok(sunset.horizon[0] > sunset.horizon[2], 'закатный горизонт теплее синего');
    assert.ok(night.cloud < day.cloud, 'ночные облака едва намечены');
    assert.deepEqual(Sky3D.paletteFor('day', grade), day, 'палитра детерминирована');
    const fb = Sky3D.paletteFor(null, {});
    assert.ok(pal3(fb.top) && pal3(fb.horizon), 'без грейда палитра не ломается');
});

test('риг: ключ вне оси на своей стороне, высота по часу и плану, контровой ночью режет', () => {
    for (const tod of ['day', 'sunset', 'night']) {
        const left = MovieSequencer.lightRigFor('medium', tod, -1);
        const right = MovieSequencer.lightRigFor('medium', tod, 1);
        assert.equal(left.keyOff, -right.keyOff, tod + ': стороны сцены зеркальны');
        assert.ok(Math.abs(right.keyOff) >= 10, tod + ': ключ стоит вне оси');
        const close = MovieSequencer.lightRigFor('close', tod, 1);
        const wide = MovieSequencer.lightRigFor('wide', tod, 1);
        assert.ok(close.keyEl < wide.keyEl, tod + ': крупный план — ниже и скульптурнее');
        assert.ok(close.keyEl >= 8 && wide.keyEl <= 70, tod + ': высоты в разумных границах');
    }
    const day = MovieSequencer.lightRigFor('medium', 'day', 1);
    const night = MovieSequencer.lightRigFor('medium', 'night', 1);
    const sunset = MovieSequencer.lightRigFor('medium', 'sunset', 1);
    assert.ok(night.rimI > sunset.rimI && sunset.rimI > day.rimI, 'ночной контровой сильнее закатного, закатный — дневного');
    assert.ok(night.rimI > 0.3, 'ночью контровой вырезает фигуру: ' + night.rimI);
    assert.ok(day.rimEl >= 10 && day.rimEl <= 60, 'высота контрового над плечами');
    assert.equal(typeof night.rimColor, 'number', 'цвет контрового — число из Constants');
    assert.deepEqual(MovieSequencer.lightRigFor('dutch', 'night', 1), MovieSequencer.lightRigFor('close', 'night', 1), 'dutch читается как крупный');
});

test('практические: always горят, night спят днём на улице, level 0 гасит всё', () => {
    const mk = () => ({
        lights: [
            { e: null, light: { intensity: -1 }, base: 2, flicker: null, mode: 'always', gate: 0, phase: 0.3 },
            { e: null, light: { intensity: -1 }, base: 1.5, flicker: 'neon', mode: 'night', gate: 0, phase: 1.1 },
            { e: null, light: { intensity: -1 }, base: 2.4, flicker: 'fire', mode: 'always', gate: 0, phase: 2.2 },
        ],
    });
    const night = mk();
    SetPieces3D.setPracticals(night, 'night', false, 1);
    assert.equal(night.lights[0].light.intensity, 2, 'ночью always в полную силу');
    assert.equal(night.lights[1].light.intensity, 1.5, 'ночью неон горит');
    const dayOut = mk();
    SetPieces3D.setPracticals(dayOut, 'day', false, 1);
    assert.ok(dayOut.lights[0].light.intensity > 0 && dayOut.lights[0].light.intensity < 2, 'днём на улице always вполсилы');
    assert.equal(dayOut.lights[1].light.intensity, 0, 'фары и уличные лампы днём на улице спят');
    const dayIn = mk();
    SetPieces3D.setPracticals(dayIn, 'day', true, 1);
    assert.ok(dayIn.lights[1].light.intensity > 0, 'в интерьере неон горит и днём');
    const off = mk();
    SetPieces3D.setPracticals(off, 'night', false, 0);
    assert.ok(off.lights.every((l) => l.light.intensity === 0), 'level 0 гасит всю площадку');
    SetPieces3D.setPracticals(null, 'night', false, 1);   // no handle — no crash
});

test('мерцание: костёр дышит в границах и детерминированно, погашенный молчит', () => {
    const h = {
        lights: [
            { e: null, light: { intensity: 0 }, base: 2.4, flicker: 'fire', mode: 'always', gate: 0, phase: 2.2 },
            { e: null, light: { intensity: 0 }, base: 1.5, flicker: 'neon', mode: 'always', gate: 0, phase: 1.1 },
        ],
    };
    SetPieces3D.setPracticals(h, 'night', false, 1);
    const fire = [], neon = [];
    for (let i = 0; i < 40; i++) {
        SetPieces3D.tickPracticals(h, i * 0.13);
        fire.push(h.lights[0].light.intensity);
        neon.push(h.lights[1].light.intensity);
    }
    const base = 2.4;
    assert.ok(fire.every((v) => v > base * 0.4 && v < base * 1.15), 'костёр не гаснет и не слепит');
    assert.ok(Math.max(...fire) - Math.min(...fire) > base * 0.1, 'костёр действительно дышит');
    assert.ok(neon.every((v) => v >= 0 && v <= 1.5 * 1.05), 'неон в границах');
    const h2 = JSON.parse(JSON.stringify(h));
    SetPieces3D.tickPracticals(h2, 3.77);
    SetPieces3D.tickPracticals(h, 3.77);
    assert.equal(h.lights[0].light.intensity, h2.lights[0].light.intensity, 'одно и то же время — одно и то же пламя');
    h.lights[0].gate = 0;
    SetPieces3D.tickPracticals(h, 5.1);
    assert.equal(h.lights[0].light.intensity, 0, 'погашенный источник молчит');
});

test('декорации несут практические источники там, где нарисовано свечение', () => {
    // The builders are read as source: a set with glow paint must declare its practicals,
    // or the neon stays a sticker. Counts are the contract of the lighting block.
    const src = fs.readFileSync(path.join(ROOT, 'js', 'SetPieces3D.js'), 'utf8');
    const count = (name) => {
        const i = src.indexOf('    ' + name + '(S) {');
        if (i < 0) return -1;
        const j = src.indexOf('\n    },', i + 10);
        const body = src.slice(i, j > 0 ? j : src.length);
        return (body.match(/(?:S|\))\.L\(/g) || []).length;   // S.L(...) and chained .L(...)
    };
    assert.ok(count('nightclub') >= 5, 'ночной клуб: неон, лампы и шар — ' + count('nightclub'));
    assert.ok(count('camp') >= 1 && count('forest') >= 1, 'костры лагеря и леса');
    assert.ok(count('mansion') >= 2, 'камин и люстра особняка');
    assert.ok(count('city') >= 3, 'уличные фонари города');
    assert.ok(count('car') >= 1, 'фары машины');
});
