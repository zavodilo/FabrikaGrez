// «Фабрика Грёз»: полнота контента. Новый жанр или декорация легко приезжают «полу-подключёнными»:
// музыка без файла, жанр без ролей, декорация без слотов, сет без жанра в SET_INFO.genres.
// Этот тест требует, чтобы каждая сущность контентной таблицы была связана со всеми остальными:
// жанр ↔ музыка(файл на диске) ↔ титулы ↔ реплики по настроениям ↔ нарратив ↔ эпоха ↔ роли ↔
// темп монтажа ↔ идеальный бюджет ↔ костюм; декорация ↔ строитель ↔ слоты ↔ координаты ↔ жанры.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/ScriptGenerator.js', 'js/ReleaseSystem.js',
]);
const get = page.get;
const M = get('MovieData');
const SP = get('SetPieces3D');
const SG = get('ScriptGenerator');
const PS = get('PeopleSystem');
const RS = get('ReleaseSystem');

test('каждый жанр связан со всей контентной обвязкой', () => {
    for (const g of Object.keys(M.GENRES)) {
        const G = M.GENRES[g];
        // music: the loop exists in the table AND as a file on disk
        assert.ok(M.MUSIC[G.music], g + ': нет записи в MUSIC');
        const file = path.join(ROOT, M.MUSIC[G.music]);
        assert.ok(fs.existsSync(file), g + ': файла музыки нет на диске: ' + M.MUSIC[G.music]);
        assert.ok(fs.statSync(file).size > 40000, g + ': музыка подозрительно короткая');
        // titles, narration, era column
        assert.ok(M.TITLES[g] && M.TITLES[g].a.length >= 4 && M.TITLES[g].n.length >= 5, g + ': титулы бедны');
        assert.ok(M.NARR[g] && M.NARR[g].length >= 2, g + ': нет нарратива');
        for (const dec of Object.keys(M.ERAS)) {
            assert.ok(Number.isFinite(M.ERAS[dec][g]), g + ': нет моды в ' + dec);
        }
        // dialogue per mood of the genre (own pool or a COMMON one with enough lines)
        for (const mood of G.moods) {
            const own = (M.DIALOGS[g] || {})[mood] || [];
            const common = (M.DIALOGS.COMMON || {})[mood] || [];
            assert.ok(own.length + common.length >= 3, g + '/' + mood + ': мало реплик');
        }
        // generator tables
        assert.ok(SG.ROLES[g] && SG.ROLES[g].length >= 4, g + ': нет листа ролей');
        assert.ok(SG.ROLES[g].filter((r) => r.tier === 'lead').length >= 2, g + ': мало главных ролей');
        assert.ok(SG.MIX[g], g + ': нет весов второго акта');
        assert.ok(SG.IDEAL_BUDGET[g] > 0, g + ': нет идеального бюджета');
        const fitAll = Object.values(RS.EDIT_FIT).flat();
        assert.ok(fitAll.includes(g), g + ': жанр не назначен ни одному темпу монтажа');
        // costumes: a generated look has colors, not undefined
        const look = PS.costumeFor(get('Rng').create('cos-' + g), g, 'f');
        assert.ok(/^#[0-9a-f]{6}$/i.test(look.shirt), g + ': костюм без цвета рубашки');
        // sets: every set of the genre builds, has slots and coordinates, and lists the genre back
        for (const setId of G.sets) {
            assert.ok(SP.SETS[setId], g + ': декорация ' + setId + ' не строится');
            assert.ok(M.SET_SLOTS[setId], g + ': у ' + setId + ' нет слотов');
            assert.ok(M.ANCHOR_XY[setId], g + ': у ' + setId + ' нет координат');
            assert.ok((M.SET_INFO[setId].genres || []).includes(g),
                setId + ' не признаёт жанр ' + g + ' в SET_INFO.genres');
        }
        // props of the genre exist as builders
        for (const pr of G.props) assert.ok(SP.PROPS[pr], g + ': проп ' + pr + ' не существует');
    }
});

test('каждая декорация связана со строительством, слотами и жанрами', () => {
    for (const setId of Object.keys(M.SET_INFO)) {
        assert.ok(SP.SETS[setId], setId + ': нет строителя');
        const slots = M.SET_SLOTS[setId];
        assert.ok(slots, setId + ': нет слотов');
        for (const k of ['wide', 'a', 'b', 'c', 'd', 'e', 'f', 'enter']) {
            assert.ok(slots[k], setId + ': нет слота ' + k);
            assert.ok(M.ANCHOR_XY[setId][slots[k]], setId + ': слот ' + k + ' указывает на несуществующий якорь');
        }
        // the set must be claimed by at least one genre, or it is dead content
        assert.ok((M.SET_INFO[setId].genres || []).length >= 1, setId + ': ничейная декорация');
        for (const g of M.SET_INFO[setId].genres) assert.ok(M.GENRES[g], setId + ': неизвестный жанр ' + g);
        // a built set yields parts and the anchors the slots point at
        const { parts, anchors } = SP.partsOf(setId);
        assert.ok(parts.length >= 8, setId + ': декорация слишком бедная');
        for (const k of ['wide', 'a', 'b']) assert.ok(anchors[slots[k]], setId + ': якорь ' + slots[k] + ' не объявлен');
    }
});

test('темпы монтажа покрывают все жанры ровно один раз', () => {
    const fit = RS.EDIT_FIT;
    const seen = {};
    for (const pace of Object.keys(fit)) {
        for (const g of fit[pace]) {
            assert.ok(!seen[g], g + ' назначен двум темпам монтажа');
            seen[g] = pace;
        }
    }
    for (const g of Object.keys(M.GENRES)) assert.ok(seen[g], g + ': нет темпа монтажа');
});

test('титулы согласованы: прилагательное и существительное мужского рода, единственного числа', () => {
    // The generator concatenates «Прилагательное + Существительное» with the adjective in the
    // masculine singular, so every noun in every title bank must agree: a masculine singular
    // noun ends in a consonant, -й or -ь; feminine (-а/-я) and plural (-ы/-и) break the phrase.
    const BAD_END = /[аояеыиэю]$/;
    for (const g of Object.keys(M.TITLES)) {
        const { a, n } = M.TITLES[g];
        for (const adj of a) assert.ok(/[йыи]$/.test(adj), g + ': прилагательное не м.р.: ' + adj);
        for (const noun of n) assert.ok(!BAD_END.test(noun), g + ': существительное не согласуется: ' + noun);
    }
});
