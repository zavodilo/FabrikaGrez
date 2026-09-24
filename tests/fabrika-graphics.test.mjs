// «Фабрика Грёз»: графический кадр без движка. CinePost3D — это pc.CameraFrame (ACES, bloom,
// SSAO, виньетка, fringing, волюметрический туман) и процедурный Color LUT 256×16, который
// печётся на лету под жанр × эпоху × время суток. Здесь проверяется чистая половина:
//
//  1) LUT-байты: ровно 256×16×4, альфа всюду 255, нейтральный стиль = sRGB-кривая ±1.
//  2) Нуар обесцвечивает кадр, мюзикл — усиливает цвет (против нейтрального).
//  3) gradeFor для всех жанров × эпох × суток остаётся в диапазонах движка
//     (bloom 0..0.1, виньетка 0..1, fringing 0..100, LUT 0..1, туман ≥ 0).
//  4) Ночь ярче светится и темнее по экспозиции, серебро добавляет fringing,
//     цветная плёнка 60–70-х добавляет fade; gradeFor детерминирован.
//  5) Пресеты качества клампятся 0..3 и не падают без движка (attach(null), tick, dispose).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts(['js/Constants.js', 'js/CinePost3D.js']);
const get = page.get;
const CinePost3D = get('CinePost3D');

const GENRES = ['western', 'comedy', 'drama', 'action', 'horror', 'scifi', 'romance', 'noir', 'war', 'adventure', 'musical'];
const ERAS = ['era-silver', 'era-color', 'era-clean'];
const TODS = ['day', 'sunset', 'night'];

const N = 16;
/** Index of the voxel (ir, ig, ib) inside the baked strip — layout: green Y, blue slice, red X. */
const at = (bytes, ir, ig, ib) => ((ig * N + ib) * N + ir) * 4;
const enc = (v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));

test('LUT: ровно 256×16×4 байт, альфа всюду 255', () => {
    const b = CinePost3D.lutBytes({});
    assert.equal(b.length, 256 * 16 * 4, 'размер полосы LUT');
    // The bytes are born inside the vm-realm, so a host instanceof would lie — check structurally.
    assert.ok(ArrayBuffer.isView(b) && b.constructor.name === 'Uint8Array', 'тип — Uint8Array');
    for (let p = 3; p < b.length; p += 4) {
        assert.equal(b[p], 255, 'альфа в пикселе ' + ((p - 3) / 4) + ' должна быть 255');
    }
});

test('LUT: нейтральный стиль — это sRGB-кривая v^(1/2.2) с точностью до 1', () => {
    const b = CinePost3D.lutBytes({});
    for (let k = 0; k < N; k++) {
        const v = k / (N - 1);
        const p = at(b, k, k, k);           // серая диагональ: r = g = b
        for (let c = 0; c < 3; c++) {
            assert.ok(Math.abs(b[p + c] - enc(v)) <= 1,
                'диагональ ' + v.toFixed(3) + ': байт ' + b[p + c] + ', ждём ' + enc(v));
        }
    }
});

test('LUT: нуар обесцвечивает, мюзикл усиливает цвет (против нейтрального)', () => {
    // Воксел с заметным разбросом каналов: r 0.8, g 0.6, b 0.4.
    const ir = 12, ig = 9, ib = 6;
    const spread = (st) => {
        const b = CinePost3D.lutBytes(st);
        const p = at(b, ir, ig, ib);
        const ch = [b[p], b[p + 1], b[p + 2]].map((v) => v / 255);
        return Math.max(...ch) - Math.min(...ch);
    };
    const neutral = spread({});
    const noir = spread(CinePost3D.STYLES.noir);
    const musical = spread(CinePost3D.STYLES.musical);
    assert.ok(noir < 0.12, 'нуар: разброс каналов ' + noir.toFixed(3) + ' — кадр обязан быть почти монохромным');
    assert.ok(musical > neutral, 'мюзикл: разброс ' + musical.toFixed(3) + ' должен превышать нейтральный ' + neutral.toFixed(3));
});

test('LUT: каждый стиль жанра печётся в валидные байты', () => {
    for (const [name, st] of Object.entries(CinePost3D.STYLES)) {
        const b = CinePost3D.lutBytes(CinePost3D.styleFor(name === 'neutral' ? null : name, 'era-clean', 'day'));
        assert.equal(b.length, 256 * 16 * 4, name + ': размер');
    }
});

test('styleFor: неизвестный жанр откатывается в нейтральный', () => {
    const a = CinePost3D.styleFor('whatever', null, null);
    const b = CinePost3D.styleFor(null, null, null);
    assert.deepEqual(a, b, 'неизвестный жанр = нейтральный стиль');
});

test('gradeFor: все жанры × эпохи × сутки в диапазонах движка', () => {
    const bad = [];
    for (const g of GENRES) {
        for (const era of ERAS) {
            for (const tod of TODS) {
                const gr = CinePost3D.gradeFor(g, era, tod);
                const key = g + '/' + era + '/' + tod;
                if (!(gr.bloom >= 0 && gr.bloom <= 0.1)) bad.push(key + ' bloom ' + gr.bloom);
                if (!(gr.vignette >= 0 && gr.vignette <= 1)) bad.push(key + ' vignette ' + gr.vignette);
                if (!(gr.fringing >= 0 && gr.fringing <= 100)) bad.push(key + ' fringing ' + gr.fringing);
                if (!(gr.fog >= 0)) bad.push(key + ' fog ' + gr.fog);
                if (!(gr.lutIntensity >= 0 && gr.lutIntensity <= 1)) bad.push(key + ' lut ' + gr.lutIntensity);
                if (!(gr.brightness > 0 && gr.brightness <= 1)) bad.push(key + ' brightness ' + gr.brightness);
                if (!gr.lut) bad.push(key + ': кино без LUT');
                if (typeof gr.toneMapping !== 'number') bad.push(key + ': тонмаппинг не число');
            }
        }
    }
    assert.deepEqual(bad, [], 'выход за диапазоны:\n' + bad.join('\n'));
});

test('gradeFor: ночь светится сильнее дня и темнее по экспозиции', () => {
    for (const g of GENRES) {
        const day = CinePost3D.gradeFor(g, 'era-clean', 'day');
        const night = CinePost3D.gradeFor(g, 'era-clean', 'night');
        assert.ok(night.bloom > day.bloom, g + ': ночной bloom обязан превышать дневной');
        assert.ok(night.vignette > day.vignette, g + ': ночная виньетка глубже');
        assert.ok(night.fog > 0, g + ': ночью есть волюметрическая дымка');
        assert.ok(night.brightness < 1, g + ': ночная экспозиция ниже единицы');
    }
});

test('gradeFor: серебро добавляет fringing, цветная плёнка — fade', () => {
    for (const g of GENRES) {
        const clean = CinePost3D.gradeFor(g, 'era-clean', 'day');
        const silver = CinePost3D.gradeFor(g, 'era-silver', 'day');
        assert.ok(silver.fringing > clean.fringing, g + ': старая плёнка сильнее хроматит');
        const fClean = CinePost3D.styleFor(g, 'era-clean', 'day');
        const fColor = CinePost3D.styleFor(g, 'era-color', 'day');
        assert.ok(fColor.fade > fClean.fade, g + ': плёнка 60–70-х выцветает сильнее');
    }
});

test('gradeFor: студийный двор — чистый кадр без LUT, с мягкой виньеткой', () => {
    const st = CinePost3D.gradeFor(null, null, 'day');
    assert.equal(st.lut, null, 'двор без жанрового грейда');
    assert.equal(st.lutIntensity, 0, 'LUT двора выключен');
    const cine = CinePost3D.gradeFor('drama', 'era-clean', 'day');
    assert.ok(st.vignette < cine.vignette, 'виньетка двора мягче кинематографической');
    assert.ok(st.fringing < cine.fringing, 'двор хроматит меньше кино');
});

test('gradeFor детерминирован: одинаковый вход — одинаковый выход', () => {
    for (const g of GENRES) {
        const a = CinePost3D.gradeFor(g, 'era-color', 'sunset');
        const b = CinePost3D.gradeFor(g, 'era-color', 'sunset');
        assert.equal(JSON.stringify(a), JSON.stringify(b), g + ': грейд поплыл между вызовами');
    }
});

test('lutKey различает жанр, эпоху и сутки (кэш LUT не склеит кадры)', () => {
    const keys = new Set();
    for (const g of GENRES) for (const era of ERAS) for (const tod of TODS) {
        keys.add(CinePost3D.gradeFor(g, era, tod).lutKey);
    }
    assert.equal(keys.size, GENRES.length * ERAS.length * TODS.length, 'ключи LUT обязаны быть уникальными');
});

test('пресеты качества: клампятся 0..3 и живут без движка', () => {
    assert.equal(CinePost3D.attach(null), false, 'attach без вида — отказ, не исключение');
    assert.equal(CinePost3D.frame, null, 'без pc.CameraFrame кадра нет');
    CinePost3D.setQuality(5);
    assert.equal(CinePost3D.quality, 3, 'кламп сверху');
    CinePost3D.setQuality(-2);
    assert.equal(CinePost3D.quality, 0, 'кламп снизу');
    CinePost3D.setQuality('2');
    assert.equal(CinePost3D.quality, 2, 'строка приводится к числу');
    assert.equal(CinePost3D.storedQuality(), 2, 'без сохранений — дефолт из Constants');
    // tick и dispose без кадра обязаны просто молчать.
    CinePost3D.tick(0.016);
    CinePost3D.setCinema('noir', 'era-silver', 'night');
    CinePost3D.setStudio();
    CinePost3D.dispose();
    assert.equal(CinePost3D.frame, null, 'dispose не resurrects');
});

test('cfg: все константы постобработки читаются из Constants.js', () => {
    const c = CinePost3D.cfg();
    const P = (n) => get(n);
    assert.equal(c.tonemap, P('POSTFX_TONEMAP'), 'тонмаппинг');
    assert.equal(c.bloomDay, P('POSTFX_BLOOM_DAY'), 'bloom дня');
    assert.equal(c.bloomNight, P('POSTFX_BLOOM_NIGHT'), 'bloom ночи');
    assert.ok(c.bloomNight > c.bloomDay, 'ночной bloom ярче дневного');
    assert.ok(c.bloomNight <= 0.1, 'bloom в диапазоне движка 0..0.1');
    assert.equal(c.vignette, P('POSTFX_VIGNETTE'), 'виньетка');
    assert.equal(c.fringing, P('POSTFX_FRINGING'), 'fringing');
    assert.equal(c.qualityDefault, P('GFX_QUALITY_DEFAULT'), 'дефолтный пресет');
    assert.equal(c.adaptive, P('POSTFX_ADAPTIVE'), 'адаптивное разрешение');
});
