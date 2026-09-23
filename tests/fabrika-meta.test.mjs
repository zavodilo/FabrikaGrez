// «Фабрика Грёз», фаза Ж: мета-игра. События студии с условиями и последствиями, дрейф
// десятилетий с анонсом моды, сиквелы и франшизы (узнаваемость продаёт, несвежесть штрафует,
// номер ограничен), сценарии игры с победой и провалом, достижения и хроника.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js', 'js/ProductionSystem.js',
    'js/ReleaseSystem.js', 'js/MetaSystem.js',
]);
const get = page.get;
const StudioManager = get('StudioManager');
const MetaSystem = get('MetaSystem');
const ScriptGenerator = get('ScriptGenerator');
const CastingSystem = get('CastingSystem');
const ProductionSystem = get('ProductionSystem');
const ReleaseSystem = get('ReleaseSystem');
const PeopleSystem = get('PeopleSystem');
const Rng = get('Rng');
const MovieData = get('MovieData');

function studio(opts) {
    const o = opts || {};
    const s = StudioManager.newGame('Тест-Мета', o.scenario || 'sandbox');
    s.seed = o.seed != null ? o.seed : 1234;
    s.cash = 2000000;
    const r = Rng.create('meta-roster');
    s.roster.length = 0; s.staff.length = 0;
    for (let i = 0; i < 6; i++) {
        const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 5, maxSkill: 9 });
        p.gender = i % 2 ? 'f' : 'm'; p.look.gender = p.gender;
        s.roster.push(p);
    }
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'writer', minSkill: 5, maxSkill: 8 }));
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'director', minSkill: 6, maxSkill: 8 }));
    StudioManager.state = s; StudioManager.init(null);
    return s;
}

function movie(state, over) {
    const m = {
        id: 'mv' + ((state.released || []).length + 1),
        title: 'Тестовый Фильм', genre: 'comedy', year: state.year, score: 7, audience: 70,
        state: 'done', boxOffice: 5000000, budget: 600000, spent: 540000, marketing: 100000,
        sequelOf: '', takes: [1000000], screens: 200, reviews: [], awards: [], castIds: {}, directorId: '',
    };
    Object.assign(m, over || {});
    state.released = state.released || [];
    state.released.push(m);
    return m;
}

test('события студии: случаются по условию и оставляют след в деньгах, фанатах и хронике', () => {
    let fired = null;
    for (let seed = 1; seed < 100 && !fired; seed++) {
        const s = studio({ seed });
        s.ownedSets.diner = { level: 1 };
        const cash0 = s.cash, fans0 = s.fans;
        StudioManager.tickWeek();
        if ((s.events || []).length) fired = { s, cash0, fans0 };
    }
    assert.ok(fired, 'ни на одном seed событие не случилось');
    const { s, cash0, fans0 } = fired;
    const ev = s.events[0];
    assert.ok(MetaSystem.EVENTS.some((e) => e.id === ev.id), 'в хронике неизвестное событие');
    assert.ok(s.cash !== cash0 || s.fans !== fans0 || (s.rep || 20) !== 20, 'событие ничего не изменило');
    assert.ok(s.news.some((n) => n.text.length > 5), 'событие не попало в хронику');
    // Conditions gate the pool: no sets -> no warehouse fire.
    const fire = MetaSystem.EVENTS.find((e) => e.id === 'fire');
    const bare = studio();
    assert.equal(!!fire.cond(bare), false, 'пожар доступен студии без декораций');
    bare.ownedSets.diner = { level: 1 };
    assert.equal(!!fire.cond(bare), true, 'пожар недоступен студии с декорациями');
    // The festival needs a good film; the grant needs any film.
    const fest = MetaSystem.EVENTS.find((e) => e.id === 'festival');
    const grant = MetaSystem.EVENTS.find((e) => e.id === 'grant');
    const s2 = studio();
    assert.equal(!!fest.cond(s2), false);
    movie(s2, { score: 8 });
    assert.equal(!!fest.cond(s2), true);
    assert.equal(!!grant.cond(studio()), false);
    const s3 = studio(); s3.stats.films = 2;
    assert.equal(!!grant.cond(s3), true);
});

test('десятилетия: на рубеже студия слышит, что теперь любит мир', () => {
    const s = studio();
    s.year = 1959; s.week = 52;
    StudioManager.tickWeek();
    assert.equal(s.year, 1960);
    assert.equal(s.lastDecade, 1960);
    assert.ok(s.news.some((n) => /1960-е/.test(n.text)), 'нет анонса нового десятилетия');
    // The heat table actually drifts: western cools, action warms across the decades.
    assert.ok(MovieData.heat('western', 1950) > MovieData.heat('western', 1990));
    assert.ok(MovieData.heat('action', 1980) > MovieData.heat('action', 1950));
});

test('сценарии игры: победа, провал и песочница', () => {
    const c = MetaSystem.cfg();
    const s = studio({ scenario: 'kadr10' });
    let sc = MetaSystem.scenario(s);
    assert.equal(sc.done, false); assert.equal(sc.failed, false);
    s.stats.awards = 1;
    sc = MetaSystem.scenario(s);
    assert.equal(sc.done, true, 'премия не закрыла сценарий');
    const s2 = studio({ scenario: 'kadr10' });
    s2.year = s2.foundedYear + c.kadrYears + 1;
    assert.equal(MetaSystem.scenario(s2).failed, true, 'десять лет без премии не провал');
    const s3 = studio({ scenario: 'empire' });
    s3.stats.boxOffice = c.empireGross;
    assert.equal(MetaSystem.scenario(s3).done, true, 'сто миллионов не закрыли империю');
    s3.stats.boxOffice = 10;
    assert.ok(MetaSystem.scenario(s3).progress < 0.01);
    const s4 = studio({ scenario: 'sandbox' });
    s4.year += 50;
    const sb = MetaSystem.scenario(s4);
    assert.equal(sb.done, false); assert.equal(sb.failed, false);
    // The weekly hook announces the verdict exactly once.
    const s5 = studio({ scenario: 'kadr10' });
    s5.stats.awards = 1;
    const t1 = MetaSystem.weekly(s5, StudioManager);
    assert.ok(t1.some((t) => /выполнен/.test(t)), 'победа не объявлена');
    const t2 = MetaSystem.weekly(s5, StudioManager);
    assert.ok(!t2.some((t) => /выполнен/.test(t)), 'победа объявлена дважды');
});

test('достижения: открываются один раз и помнятся', () => {
    const s = studio();
    assert.equal((s.achievements || []).length, 0);
    movie(s, { score: 9, profit: 2000000 });
    const got = MetaSystem.checkAchievements(s);
    const ids = got.map((a) => a.id);
    assert.ok(ids.includes('first-premiere'), 'премьера не дала достижение');
    assert.ok(ids.includes('first-hit'), 'хит не дала достижение');
    assert.ok(ids.includes('masterpiece'), 'шедевр не дал достижение');
    assert.ok(ids.includes('profitable'), 'прибыль не дала достижение');
    const again = MetaSystem.checkAchievements(s);
    assert.equal(again.length, 0, 'достижения открылись повторно');
    assert.ok(s.achievements.includes('first-premiere'));
    // The weekly hook toasts them.
    const s2 = studio();
    movie(s2, { score: 7 });
    const toasts = MetaSystem.weekly(s2, StudioManager);
    assert.ok(toasts.some((t) => /Достижение/.test(t)), 'достижение не объявлено тостом');
});

test('сиквелы: оценка, номер, одна франшиза в работе', () => {
    const c = MetaSystem.cfg();
    const s = studio();
    const flop = movie(s, { score: 4 });
    assert.equal(MetaSystem.canSequel(s, flop), false, 'провал плодит сиквелы');
    const hit = movie(s, { score: 7.5, id: 'mvHit' });
    assert.equal(MetaSystem.canSequel(s, hit), true);
    const running = movie(s, { score: 8, state: 'run' });
    assert.equal(MetaSystem.canSequel(s, running), false, 'не вышедший фильм плодит сиквелы');
    // A franchise in work blocks a second entry.
    const res = MetaSystem.startSequel(s, hit.id);
    assert.equal(res.ok, true, res.why);
    assert.equal(res.number, 2);
    assert.match(res.script.title, /2$/, 'название сиквела не пронумеровано: ' + res.script.title);
    assert.equal(res.script.sequelOf, hit.id);
    assert.ok(res.script.franchise && res.script.franchise.number === 2);
    assert.equal(MetaSystem.canSequel(s, hit), false, 'вторая запись франшизы в работе разрешена');
    // Freshness penalty: the sequel drafts weaker than the same seed without the franchise.
    const plain = ScriptGenerator.draft(s, { genre: hit.genre, budget: hit.budget, seed: 4242, writer: null });
    const seq = ScriptGenerator.draft(s, {
        genre: hit.genre, budget: hit.budget, seed: 4242, writer: null,
        sequelOf: { id: hit.id, title: hit.title }, penalty: c.freshPenalty,
    });
    assert.ok(seq.quality < plain.quality, 'сиквел не оштрафован за несвежесть');
    // The chain caps at META_SEQUEL_MAX.
    const s2 = studio();
    const m1 = movie(s2, { score: 8, id: 'a1' });
    const m2 = movie(s2, { score: 8, id: 'a2', sequelOf: 'a1' });
    const m3 = movie(s2, { score: 8, id: 'a3', sequelOf: 'a2' });
    const m4 = movie(s2, { score: 8, id: 'a4', sequelOf: 'a3' });
    assert.equal(MetaSystem.sequelNumber(s2, m4), 4);
    assert.equal(MetaSystem.canSequel(s2, m4), false, 'четвёртый номер разрешён');
    assert.equal(MetaSystem.canSequel(s2, m3), true, 'третий номер запрещён рано');
});

test('франшиза в кассе: узнаваемость продаёт, усталость съедает', () => {
    const c = MetaSystem.cfg();
    assert.equal(MetaSystem.franchiseMultiplier(null), 1);
    assert.equal(MetaSystem.franchiseMultiplier({}), 1);
    const m2 = { franchise: { number: 2, recognition: 80 } };
    const m3 = { franchise: { number: 3, recognition: 80 } };
    const k2 = MetaSystem.franchiseMultiplier(m2);
    const k3 = MetaSystem.franchiseMultiplier(m3);
    assert.ok(k2 > 1, 'узнаваемость не продаёт сиквел');
    assert.ok(k3 < k2, 'усталость франшизы не растёт с номером');
    assert.ok(k3 > 0.4, 'множитель ушёл в пол');
    // The premiere plan carries it.
    const s = studio();
    const sc = ScriptGenerator.draft(s, { genre: 'comedy', budget: 600000, seed: 99, writer: null });
    sc.cast = CastingSystem.autoCast(s, sc);
    CastingSystem.confirm(s, sc, StudioManager);
    s.scripts.push(sc);
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    const plainPlan = ReleaseSystem.openingPlan(s, pr, 0, 7);
    sc.franchise = { number: 2, recognition: 90 };
    const franPlan = ReleaseSystem.openingPlan(s, pr, 0, 7);
    assert.ok(franPlan.opening > plainPlan.opening, 'франшиза не двигает старт');
    assert.ok(franPlan.franchise > 1);
});

test('экраны: выбор сценария и хроника рисуются без падений', () => {
    const s = studio();
    const picker = MetaSystem.scenarioPicker({});
    for (const id of Object.keys(MetaSystem.SCENARIOS)) {
        assert.ok(picker.includes('meta:scenario:' + id), 'в пикере нет сценария ' + id);
    }
    movie(s, { score: 8 });
    s.events = [{ week: 1, year: s.year, id: 'fire', ru: 'Пожар на складе реквизита' }];
    const html = MetaSystem.statsScreen({});
    assert.ok(/ХРОНИКА СТУДИИ/.test(html));
    assert.ok(/Достижения/.test(html));
    assert.ok(/Пожар на складе/.test(html), 'события не попали на экран хроники');
    assert.ok(/1950-е/.test(html), 'эпоха не показана');
});
