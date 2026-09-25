// «Фабрика Грёз»: logic smoke tests — everything that runs without DOM/pc:
// the deterministic Rng, PeopleSystem generation, the StudioManager weekly tick and the
// DEMO_MOVIE timeline integrity (sets/props/sfx ids must exist; cast ids must resolve).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js', 'js/ActorModels.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
]);
const get = page.get;

test('Rng: один seed — один поток, диапазоны честные', () => {
    const Rng = get('Rng');
    const a = Rng.create('fabrika'), b = Rng.create('fabrika');
    for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
    assert.equal(Rng.hash('abc'), Rng.hash('abc'));
    assert.notEqual(Rng.hash('abc'), Rng.hash('abd'));
    const r = Rng.create(42);
    for (let i = 0; i < 500; i++) {
        const v = r.range(3, 7);
        assert.ok(Number.isInteger(v) && v >= 3 && v <= 7);
    }
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) assert.ok(items.includes(r.pick(items)));
    assert.equal(r.pick([]), null);
    const sh = r.shuffled([1, 2, 3, 4, 5]);
    assert.deepEqual(sh.slice().sort(), [1, 2, 3, 4, 5]);
});

test('PeopleSystem: генерация людей и внешности в допустимых границах', () => {
    const P = get('PeopleSystem'), Rng = get('Rng');
    const r = Rng.create('people-test');
    for (let i = 0; i < 60; i++) {
        const p = P.randomPerson(r, { role: i % 5 === 0 ? 'director' : 'actor' });
        assert.ok(p.name.length > 3);
        assert.ok(p.age >= 19 && p.age <= 60);
        for (const k of ['drama', 'comedy', 'action', 'romance']) {
            assert.ok(p.skills[k] >= 0 && p.skills[k] <= 10, k + '=' + p.skills[k]);
        }
        assert.ok(p.salary > 0);
        assert.ok(p.mood >= 0 && p.mood <= 100);
        const look = p.look;
        assert.ok(/^#[0-9a-f]{6}$/i.test(look.skin) && /^#[0-9a-f]{6}$/i.test(look.shirt));
        assert.ok(['m', 'f'].includes(look.gender));
    }
    assert.equal(P.starOf({ exp: 0, hits: 0, awards: 0, films: 0 }), 0);
    assert.equal(P.starOf({ exp: 150, hits: 15, awards: 5, films: 25 }), 5);
    assert.equal(P.starOf({ exp: 40, hits: 6, awards: 2, films: 8 }), 3);
});

test('StudioManager: новая игра и 60 недель тикают без NaN и с правильным календарём', () => {
    const S = get('StudioManager');
    const game = { modal() {}, toast() {} };
    S.init(game);
    const s = S.newGame('Тест-Студия');
    assert.equal(s.cash, get('STUDIO_START_CASH'));
    assert.equal(s.year, get('STUDIO_START_YEAR'));
    assert.ok(s.roster.length >= 1 && s.staff.length >= 2);
    const cash0 = s.cash;
    for (let i = 0; i < 60; i++) {
        const r = S.tickWeek();
        assert.ok(Array.isArray(r.toasts));
    }
    assert.ok(Number.isFinite(s.cash));
    assert.ok(s.cash < cash0, 'зарплаты списываются');
    assert.equal(s.year, get('STUDIO_START_YEAR') + 1);
    assert.equal(s.week, 9);          // 60 weeks = 52 + 8
    assert.ok(s.market.length > 0);
    assert.ok(s.news.length > 0);
    // The weekly RNG stream is reproducible from the state.
    const before = s.cash;
    S.tickWeek();
    assert.ok(Number.isFinite(s.cash) && s.cash !== before || s.cash < before);
});

test('StudioManager: найм, увольнение, обучение, декорации', () => {
    const S = get('StudioManager');
    S.init({ modal() {}, toast() {} });
    const s = S.newGame('Операции');
    const cand = s.market[0];
    const n0 = s.roster.length + s.staff.length;
    assert.equal(S.hire(cand), true);
    assert.equal(s.roster.length + s.staff.length, n0 + 1);
    assert.equal(S.hire(cand), false);            // уже нанят
    const p = s.roster[0];
    assert.equal(S.startTraining(p, 'drama'), true);
    assert.equal(S.startTraining(p, 'comedy'), false);   // уже учится
    for (let i = 0; i < 4; i++) S.tickWeek();
    assert.equal(p.training, null);
    assert.ok(p.skills.drama <= 10);
    assert.equal(S.buySet('forest'), true);
    assert.ok(s.ownedSets.forest);
    assert.equal(S.buySet('forest'), false);
    assert.equal(S.fire(p), true);
});

test('DEMO_MOVIE: таймлайн целостен — сеты, пропы, SFX, музыка, cast', () => {
    const M = get('MovieData'), SP = get('SetPieces3D');
    const demo = M.DEMO_MOVIE;
    const castIds = new Set(demo.cast.map((c) => c.id));
    const CAM_TYPES = ['wide', 'medium', 'close', 'duo', 'over', 'low', 'crane', 'fixed', 'dutch'];
    assert.ok(demo.scenes.length >= 3);
    for (const sc of demo.scenes) {
        assert.ok(SP.SETS[sc.set], 'нет декорации: ' + sc.set);
        for (const p of sc.props || []) assert.ok(SP.PROPS[p.id], 'нет пропа: ' + p.id);
        for (const e of sc.enter || []) assert.ok(castIds.has(e.who), 'enter: ' + e.who);
        assert.ok(sc.shots.length > 0);
        for (const sh of sc.shots) {
            assert.ok(sh.dur > 0.3 && sh.dur < 30, 'dur: ' + sh.dur);
            assert.ok(CAM_TYPES.includes(sh.cam.type), 'cam: ' + sh.cam.type);
            if (sh.cam.who) assert.ok(castIds.has(sh.cam.who));
            if (sh.cam.who2) assert.ok(castIds.has(sh.cam.who2));
            for (const b of sh.beats || []) {
                assert.ok(b.t >= 0 && b.t < sh.dur + 0.01, 'beat t: ' + b.t);
                if (b.who) assert.ok(castIds.has(b.who), 'beat who: ' + b.who);
                if (b.sfx) assert.ok(M.SFX[b.sfx], 'sfx: ' + b.sfx);
                if (b.music) assert.ok(M.MUSIC[b.music], 'music: ' + b.music);
                if (b.moveProp || b.despawnProp) assert.ok(SP.PROPS[b.moveProp || b.despawnProp]);
            }
        }
    }
    // Every genre has music, sets and at least a handful of lines per mood.
    for (const g of Object.keys(M.GENRES)) {
        const G = M.GENRES[g];
        assert.ok(M.MUSIC[G.music], g + ': music');
        assert.ok(G.sets.every((s) => SP.SETS[s]), g + ': sets');
        assert.ok(M.DIALOGS[g], g + ': dialogs');
        for (const mood of G.moods) {
            const pool = (M.DIALOGS[g] && M.DIALOGS[g][mood]) || M.DIALOGS.COMMON[mood];
            assert.ok(pool && pool.length >= 2, g + '/' + mood);
        }
    }
});

test('деньги форматируются читаемо', () => {
    const f = get('StudioUI_money');
    assert.equal(f(999), '$999');
    assert.equal(f(1234), '$1 234');
    assert.equal(f(1234567), '$1.23M');
    assert.equal(f(-1500), '−$1 500');
    assert.equal(f(12000000), '$12M');
});
