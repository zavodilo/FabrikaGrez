// «Фабрика Грёз»: партиклы без движка. Таблица поведения Particles3D.specFor (пулы, скорости,
// баллистика) и высота частицы над базой (_heightOf) — чистая арифметика; без pc.start()
// вежливо возвращает null, а не падает.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts(['js/Constants.js', 'js/Rng.js', 'js/Particles3D.js']);
const Particles3D = page.get('Particles3D');
const get = page.get;

test('specFor: падающие и баллистические виды различаются и лежат в разумных границах', () => {
    for (const kind of ['rain', 'snow', 'dust', 'sparks', 'smoke', 'fire']) {
        const s = Particles3D.specFor(kind);
        assert.ok(s, kind + ': спецификация есть');
        assert.equal(s.n, get('PART_' + kind.toUpperCase() + '_N'), kind + ': пул из константы');
        assert.ok(s.size > 0 && s.spread > 0, kind + ': размер и радиус положительны');
        if (s.up) {
            assert.ok(s.speed > 0, kind + ': бросок вверх');
            assert.ok(s.grav < 0, kind + ': гравитация тянет вниз');
            assert.ok(s.life > 0.2 && s.life < 6, kind + ': время жизни разумно');
        } else {
            assert.ok(s.fall > 0 && s.col > 0, kind + ': колонка и скорость падения');
            assert.ok(s.fall * 0.016 < s.col, kind + ' за кадр не пролетает всю колонку');
        }
    }
    assert.equal(Particles3D.specFor('confetti'), null, 'неизвестный вид — null');
});

test('_heightOf: падающие заворачиваются в колонке, баллистика считает параболу', () => {
    const rain = Particles3D.specFor('rain');
    const em = { h: 40, spec: rain, t: 3.25 };
    for (const off of [0, 77, 140, 279]) {
        const h = Particles3D._heightOf(em, { off: off, t: 0 });
        assert.ok(h >= 40 && h <= 40 + rain.col, 'дождь в колонке: ' + h);
    }
    const fire = Particles3D.specFor('fire');
    const emf = { h: 30, spec: fire, t: 0 };
    const h0 = Particles3D._heightOf(emf, { off: 0, t: 0 });
    const h1 = Particles3D._heightOf(emf, { off: 0, t: 0.3 });
    const h2 = Particles3D._heightOf(emf, { off: 0, t: 0.75 });
    assert.equal(h0, 30, 'огонь стартует с базы');
    assert.ok(h1 > h0, 'огонь поднимается');
    assert.ok(h2 < h1, 'и гаснет раньше конца жизни (гравитация)');
});

test('без движка start() возвращает null, stopAll и update не падают', () => {
    assert.equal(Particles3D.start(null, 'rain', {}), null);
    assert.equal(Particles3D.start({}, 'fire', {}), null);
    Particles3D.update(0.016);
    Particles3D.stop('rain#1');
    Particles3D.stopAll();
    Particles3D.dispose();
});
