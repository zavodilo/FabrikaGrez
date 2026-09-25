// «Фабрика Грёз»: CC0 GLB-декор декораций и реквизита. Интернет-модели (Kenney «Nature Kit»,
// CC0 — атрибутция в NOTICE) ставятся поверх процедурной базы записями GLB_DECOR/PROP_GLB
// (грузит SetPieces3D._glbDecor через Model3D). Проверяется без движка:
//  1) URL каждой записи — литерал из assets/models/nature/, файл есть на диске (сканер
//     ассетов архивирует только названные в коде файлы; пропавший файл = missing в гейте).
//  2) Записи валидны: конечные координаты, положительный масштаб, сет из таблицы SETS.
//  3) Природная семья сетов (western/forest/camp/jungle/beach) покрыта декором; реквизит
//     cactus заменён GLB, процедурный фолбэк-курган оставлен в PROPS.
//  4) В одном сете нет двух записей с одинаковыми url+координатами (двойная отрисовка
//     одной модели в одной точке — лишние инстансы и потенциальное мерцание).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';

const page = loadScripts(['js/Constants.js', 'js/ActorRig3D.js', 'js/SetPieces3D.js']);
const SetPieces3D = page.get('SetPieces3D');
const GLB_DECOR = SetPieces3D.GLB_DECOR;
const PROP_GLB = SetPieces3D.PROP_GLB;

const NATURE_SETS = ['western', 'forest', 'camp', 'jungle', 'beach'];

function allRecords() {
    const out = [];
    for (const [setId, recs] of Object.entries(GLB_DECOR)) {
        for (const r of recs) out.push({ setId, r });
    }
    for (const [propId, r] of Object.entries(PROP_GLB)) out.push({ setId: 'prop:' + propId, r });
    return out;
}

test('GLB-декор: файлы существуют, url — литерал nature-папки, записи валидны', () => {
    const all = allRecords();
    assert.ok(all.length >= 60, 'декор слишком бедный: ' + all.length + ' записей');
    for (const { setId, r } of all) {
        assert.match(r.url, /^assets\/models\/nature\/[a-zA-Z_]+\.glb$/, setId + ': url ' + r.url);
        assert.ok(fs.existsSync(path.join(ROOT, r.url)), setId + ': нет файла ' + r.url);
        assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), setId + ': координаты');
        assert.ok(r.h === undefined || Number.isFinite(r.h), setId + ': высота');
        assert.ok(r.s === undefined || (Number.isFinite(r.s) && r.s > 0), setId + ': масштаб');
        assert.ok(r.yaw === undefined || Number.isFinite(r.yaw), setId + ': поворот');
        if (!setId.startsWith('prop:')) assert.ok(SetPieces3D.SETS[setId], 'неизвестный сет: ' + setId);
        else assert.ok(SetPieces3D.PROPS[setId.slice(5)], 'неизвестный реквизит: ' + setId);
    }
});

test('GLB-декор: природные сеты покрыты, интерьеры не тронуты', () => {
    for (const id of NATURE_SETS) {
        assert.ok(GLB_DECOR[id] && GLB_DECOR[id].length >= 6, 'сет без CC0-декора: ' + id);
    }
    // Интерьерные и городские сеты ждут своих китов (мебель, транспорт, город) — природа там чужая.
    for (const id of Object.keys(GLB_DECOR)) {
        assert.ok(NATURE_SETS.includes(id), 'декор залез в непредназначенный сет: ' + id);
    }
});

test('GLB-декор: кактус-реквизит заменён моделью, процедурный фолбэк на месте', () => {
    assert.ok(PROP_GLB.cactus && /cactus_tall\.glb$/.test(PROP_GLB.cactus.url));
    // Фолбэк-курган: PROPS.cactus обязан остаться (грузится синхронно, GLB приходит поверх).
    assert.equal(typeof SetPieces3D.PROPS.cactus, 'function');
    let parts = 0;
    const T = { B: () => { parts++; return T; }, C: () => { parts++; return T; }, G: () => { parts++; return T; }, A: () => T, L: () => T };
    SetPieces3D.PROPS.cactus(T);
    assert.ok(parts >= 1, 'процедурный фолбэк кактуса исчез');
});

test('GLB-декор: нет дублей одной модели в одной точке сета', () => {
    const seen = new Set();
    for (const { setId, r } of allRecords()) {
        const key = setId + '|' + r.url + '|' + r.x + '|' + r.y;
        assert.ok(!seen.has(key), 'дубль: ' + key);
        seen.add(key);
    }
});
