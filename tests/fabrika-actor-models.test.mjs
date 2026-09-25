// «Фабрика Грёз»: каталог CC0-моделей актёров (js/ActorModels.js). У каждого актёра —
// своя модель: люди Kenney, рыцари/скелеты/манекены KayKit, чудовища/динозавры/звери
// Quaternius, роботы (RobotExpressive + q_Robot). Атрибуция — NOTICE, конвертация —
// tools/convert-actors.mjs. Проверяется без движка:
//  1) каталог >= 50 записей, id уникальны, url — литерал assets/, файл есть на диске;
//  2) клипы: все 19 действий ACTOR_RIG_ACTIONS замаплены, каждый клип реально лежит
//     в GLB (JSON-чанк, animations[].name) — иначе актёр молча встанет в rest-pose;
//  3) записи валидны: gender ∈ {m,f,any}, height 40..500 px, палитра — 3 hex-цвета,
//     размер файла <= 2.5 МБ (dev-гейт веса);
//  4) ActorModels.get/idsFor/pick: 'robot' на месте (совместимость сейвов), pick
//     детерминирован от seed и уважает ампуа по полу;
//  5) PeopleSystem.randomLook: каждая персона получает модель каталога своего пола;
//  6) PEOPLE_MARKET_SIZE даёт пул кастинга 50–100 претендентов (экспандер в UI).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js', 'js/ActorModels.js',
    'js/ActorRig3D.js', 'js/PeopleSystem.js',
]);
const get = page.get;
const ActorModels = get('ActorModels');
const ACTOR_MODELS = get('ACTOR_MODELS');
const ACTOR_RIG_ACTIONS = get('ACTOR_RIG_ACTIONS');
const PeopleSystem = get('PeopleSystem');
const Rng = get('Rng');
const PEOPLE_MARKET_SIZE = get('PEOPLE_MARKET_SIZE');

/** Имена анимаций GLB из JSON-чанка (без движка). */
function glbClipNames(file) {
    const buf = fs.readFileSync(file);
    assert.equal(buf.readUInt32BE(0), 0x676c5446, file + ': не GLB');
    const jsonLen = buf.readUInt32LE(12);
    const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    return new Set((j.animations || []).map((a) => a.name));
}

const HEX = /^#[0-9a-fA-F]{6}$/;

test('каталог: >= 50 моделей, уникальные id, url-литералы, файлы на диске, вес в гейте', () => {
    assert.ok(ACTOR_MODELS.length >= 50, 'каталог бедный: ' + ACTOR_MODELS.length + ' записей');
    const ids = new Set();
    for (const e of ACTOR_MODELS) {
        assert.ok(!ids.has(e.id), 'дубль id: ' + e.id);
        ids.add(e.id);
        assert.match(e.url, /^assets\/models\/(actors\/[A-Za-z_]+\.glb|RobotExpressive\.glb)$/, e.id + ': url ' + e.url);
        const f = path.join(ROOT, e.url);
        assert.ok(fs.existsSync(f), e.id + ': нет файла ' + e.url);
        const kb = fs.statSync(f).size / 1024;
        assert.ok(kb <= 2560, e.id + ': GLB тяжелее 2.5 МБ (' + Math.round(kb) + ' КБ) — ужмите конвертер');
        assert.ok(typeof e.ru === 'string' && e.ru.length > 0, e.id + ': ru-имя');
        assert.ok(['m', 'f', 'any'].includes(e.gender), e.id + ': gender ' + e.gender);
        assert.ok(Number.isFinite(e.height) && e.height >= 40 && e.height <= 500, e.id + ': height ' + e.height);
        assert.ok(typeof e.badge === 'string', e.id + ': badge');
        for (const k of ['skin', 'hair', 'shirt']) assert.match(e.palette[k], HEX, e.id + ': palette.' + k);
    }
});

test('клипы: все 19 действий замаплены и реально есть в GLB', () => {
    for (const e of ACTOR_MODELS) {
        const clips = glbClipNames(path.join(ROOT, e.url));
        for (const act of ACTOR_RIG_ACTIONS) {
            const clip = e.clips[act];
            assert.ok(clip, e.id + ': действие ' + act + ' не замаплено');
            assert.ok(clips.has(clip), e.id + ': клип ' + clip + ' (' + act + ') отсутствует в файле');
        }
    }
});

test('ActorModels: get/idsFor/pick — robot на месте, детерминизм, ампуа по полу', () => {
    assert.ok(ActorModels.get('robot'), 'нет записи robot (сейвы и DEMO_MOVIE её ждут)');
    assert.equal(ActorModels.get('нет-такого'), null);
    for (const g of ['m', 'f']) {
        const ids = ActorModels.idsFor(g);
        assert.ok(ids.length >= 20, 'для ' + g + ' только ' + ids.length + ' моделей');
        for (const id of ids) {
            const e = ActorModels.get(id);
            assert.ok(e.gender === 'any' || e.gender === g, id + ': пол не совпал');
        }
    }
    const a = Rng.create('pick-a'), b = Rng.create('pick-a');
    for (let i = 0; i < 60; i++) {
        const g = i % 2 ? 'f' : 'm';
        assert.equal(ActorModels.pick(a, g), ActorModels.pick(b, g), 'pick не детерминирован на ' + i);
    }
});

test('randomLook: каждая персона получает модель каталога своего пола', () => {
    const r = Rng.create('look-1');
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
        const look = PeopleSystem.randomLook(r);
        assert.ok(look.model, 'персона без модели');
        const e = ActorModels.get(look.model);
        assert.ok(e, 'модель вне каталога: ' + look.model);
        assert.ok(e.gender === 'any' || e.gender === look.gender, e.id + ': пол ' + look.gender);
        seen.add(look.model);
    }
    assert.ok(seen.size >= 30, 'разнообразие бедное: ' + seen.size + ' моделей из 400 персон');
    // Детерминизм от seed: два одинаковых Rng дают одинаковые модели.
    const r1 = Rng.create('look-2'), r2 = Rng.create('look-2');
    for (let i = 0; i < 50; i++) assert.equal(PeopleSystem.randomLook(r1).model, PeopleSystem.randomLook(r2).model);
});

test('биржа: PEOPLE_MARKET_SIZE держит пул кастинга в 50–100 претендентов', () => {
    assert.ok(PEOPLE_MARKET_SIZE >= 80 && PEOPLE_MARKET_SIZE <= 120, 'PEOPLE_MARKET_SIZE=' + PEOPLE_MARKET_SIZE);
    // Доля актёров на бирже ~0.58 (StudioManager.refreshMarket): 90 * 0.58 ≈ 52.
    const actors = Math.round(PEOPLE_MARKET_SIZE * 0.58);
    assert.ok(actors >= 50 && actors <= 100, 'актёров на бирже ' + actors + ' — вне вилки 50–100');
});
