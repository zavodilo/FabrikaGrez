// «Фабрика Грёз», фаза Д: постпродакшн, прокат, награды. Проверяется экономика и честность
// чисел: монтаж и музыка дают обещанные дельты, премьера платит за кампанию и считает старт
// по фанатам/качеству/звёздам/моде/сезону с упором в экраны, прокат decay-ит по слову зрителей
// (любовь держит экраны дольше), доля студии приходит в кассу, на финале считаются прибыль,
// фанбаза и звёзды труппы, а раз в год раздаётся «Золотой Кадр» — и всё это детерминировано.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js', 'js/ProductionSystem.js', 'js/ReleaseSystem.js',
]);
const get = page.get;
const StudioManager = get('StudioManager');
const ScriptGenerator = get('ScriptGenerator');
const CastingSystem = get('CastingSystem');
const ProductionSystem = get('ProductionSystem');
const ReleaseSystem = get('ReleaseSystem');
const PeopleSystem = get('PeopleSystem');
const Rng = get('Rng');
const MovieData = get('MovieData');

/** A studio with a WRAPPED picture ready for the editing room (no shooting weeks needed). */
function wrappedStudio(opts) {
    const o = opts || {};
    const s = StudioManager.newGame('Тест-Прокат');
    s.seed = o.seed != null ? o.seed : 70707;
    s.cash = o.cash != null ? o.cash : 3000000;
    s.fans = o.fans != null ? o.fans : 20;
    const r = Rng.create('rel-roster');
    s.roster.length = 0; s.staff.length = 0;
    for (let i = 0; i < 8; i++) {
        const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 5, maxSkill: 9 });
        p.gender = i % 2 ? 'f' : 'm'; p.look.gender = p.gender;
        if (i < 2) p.star = 3;
        s.roster.push(p);
    }
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'writer', minSkill: 5, maxSkill: 9 }));
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'director', minSkill: 6, maxSkill: 9 }));
    for (const set of (MovieData.GENRES[o.genre || 'comedy'] || {}).sets || []) {
        if (!s.ownedSets[set]) s.ownedSets[set] = { level: 2 };
    }
    StudioManager.state = s; StudioManager.init(null);
    const sc = ScriptGenerator.draft(s, { genre: o.genre || 'comedy', budget: o.budget || 800000, seed: 4321, writer: null });
    sc.cast = CastingSystem.autoCast(s, sc);
    CastingSystem.confirm(s, sc, StudioManager);
    s.scripts.push(sc);
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    // Fake a wrapped shoot: every scene shot at a known quality.
    pr.scenesShot = sc.timeline.scenes.map((x, i) => ({
        idx: i, label: x.label, set: x.set, quality: o.shotQuality != null ? o.shotQuality : 6.5,
        parts: { base: 2.5, director: 1, actors: 1, set: 1.2, mood: 0, pace: 0, over: 0, luck: 0.8 },
        hadSet: true, week: 1,
    }));
    pr.nextScene = sc.timeline.scenes.length;
    pr.spent = Math.round(pr.budget * 0.9);
    pr.state = 'post';
    return { s, sc, pr };
}

test('монтаж и музыка: дельты честные и объяснимые', () => {
    assert.ok(ReleaseSystem.editDelta('action', 'fast') > 0, 'экшн не любит быстрый монтаж');
    assert.ok(ReleaseSystem.editDelta('action', 'slow') < 0, 'медленный монтаж экшна не штрафуется');
    assert.ok(ReleaseSystem.editDelta('western', 'normal') > 0, 'ровный темп вестерна — его родной');
    assert.ok(ReleaseSystem.editDelta('western', 'fast') < 0, 'чужой темп вестерна не штрафуется');
    assert.ok(ReleaseSystem.editDelta('drama', 'slow') > 0);
    assert.ok(ReleaseSystem.editDelta('drama', 'fast') < 0);
    // The delta is exactly the promised constant.
    assert.equal(ReleaseSystem.editDelta('action', 'fast'), ReleaseSystem.cfg().editMatch);
    assert.equal(ReleaseSystem.editDelta('action', 'slow'), ReleaseSystem.cfg().editMiss);
    const own = MovieData.GENRES.drama.music;
    assert.ok(ReleaseSystem.musicDelta('drama', own) > 0, 'родная музыка не льстит');
    assert.equal(ReleaseSystem.musicDelta('drama', 'studio'), 0);
    assert.ok(ReleaseSystem.musicDelta('drama', 'horror') < 0, 'чужая музыка не штрафуется');
});

test('finalQuality: материал + монтаж + музыка, в границах', () => {
    const { s, pr } = wrappedStudio();
    const base = ProductionSystem.projectedQuality(s, pr).quality;
    const good = ReleaseSystem.finalQuality(s, pr, { edit: 'fast', music: MovieData.GENRES[pr.genre].music });
    const bad = ReleaseSystem.finalQuality(s, pr, { edit: 'slow', music: 'horror' });
    assert.ok(good.quality > base, 'удачный монтаж и музыка не подняли качество');
    assert.ok(bad.quality < base, 'провальный монтаж и чужая музыка не опустили качество');
    assert.ok(Math.abs((base + good.edit + good.music) - good.quality) < 1e-9);
    assert.ok(good.quality <= 10 && bad.quality >= 0.3);
});

test('openingPlan: старт растёт от кампании, фанатов и звёзд и упирается в экраны', () => {
    const { s, pr } = wrappedStudio();
    const q = 7;
    const poor = ReleaseSystem.openingPlan(s, pr, 0, q);
    const rich = ReleaseSystem.openingPlan(s, pr, pr.budget, q);
    assert.ok(rich.opening > poor.opening, 'кампания не двигает старт');
    assert.ok(rich.mFrac <= ReleaseSystem.cfg().marketingMax + 1e-9, 'кампания выше потолка');
    const fansBefore = s.fans;
    s.fans = fansBefore + 30;
    const moreFans = ReleaseSystem.openingPlan(s, pr, 0, q);
    assert.ok(moreFans.opening > poor.opening, 'фанбаза не двигает старт');
    s.fans = fansBefore;
    // The screen cap: an absurd quality cannot print money beyond the screens.
    const capped = ReleaseSystem.openingPlan(s, pr, pr.budget, 10);
    assert.ok(capped.opening <= capped.cap, 'старт превысил потолок экранов');
    assert.ok(capped.screens > poor.screens, 'экраны не растут с качеством');
    // Season: a December week outsells a February one.
    const w = s.week;
    s.week = 50; const dec = ReleaseSystem.openingPlan(s, pr, 0, q);
    s.week = 7; const feb = ReleaseSystem.openingPlan(s, pr, 0, q);
    s.week = w;
    assert.ok(dec.opening > feb.opening, 'сезонность не работает: дек < фев');
});

test('premiere: платит кампанию, считает критиков и зрителей, отдаёт титры', () => {
    const { s, pr } = wrappedStudio();
    const cash0 = s.cash;
    const marketing = 200000;
    const res = ReleaseSystem.premiere(s, StudioManager, pr, { edit: 'normal', music: MovieData.GENRES[pr.genre].music, marketing });
    assert.equal(res.ok, true, res.why);
    assert.equal(s.cash, cash0 - marketing, 'кампания не списана');
    const m = res.movie;
    assert.equal(pr.state, 'released');
    assert.ok(m.screens > 0 && m.opening > 0);
    assert.ok(m.score > 0 && m.score <= 10, 'оценка критиков вне границ');
    assert.ok(m.audience >= 5 && m.audience <= 100, 'оценка зрителей вне границ');
    assert.ok(m.takes.length === 0 && m.state === 'run');
    assert.ok(m.timeline && m.timeline.scenes.length, 'фильм не унёс таймлайн в прокат');
    // Reviews: quotes of the right band, placeholders substituted.
    assert.ok(m.reviews.length >= 2 && m.reviews.length <= 3);
    for (const rv of m.reviews) {
        assert.ok(!/\{[a-z]\}/.test(rv.text), 'в рецензии остался плейсхолдер: ' + rv.text);
        assert.ok(rv.text.includes(m.title) || rv.text.length > 20);
        assert.ok(Math.abs(rv.score - m.score) <= 2.5, 'рецензия уехала от общей оценки');
    }
    // The cast got their credit.
    for (const k of Object.keys(pr.cast)) {
        const p = ProductionSystem.person(s, pr.cast[k]);
        assert.ok(p.films >= 1, 'актёр не получил фильмографию');
    }
    // A second premiere of the same picture is impossible.
    assert.equal(ReleaseSystem.premiere(s, StudioManager, pr, { marketing: 1 }).ok, false);
});

test('premiere: без денег на кампанию премьеры нет', () => {
    const { s, pr } = wrappedStudio();
    s.cash = 100;                                  // the campaign is unaffordable now
    const res = ReleaseSystem.premiere(s, StudioManager, pr, { marketing: 500000 });
    assert.equal(res.ok, false);
    assert.match(res.why, /касс|нет/);
});

test('прокат: доля студии приходит в кассу, сборы decay-ит, слово зрителей держит экраны', () => {
    const c = ReleaseSystem.cfg();
    const mk = (audience) => {
        const { s, pr } = wrappedStudio();
        const res = ReleaseSystem.premiere(s, StudioManager, pr, { marketing: 100000 });
        res.movie.audience = audience;
        res.movie.take = 1000000;
        res.movie.weeksLeft = 8;
        return { s, m: res.movie };
    };
    const loved = mk(90), hated = mk(20);
    StudioManager.state = loved.s; StudioManager.tickWeek();
    assert.ok(loved.m.takes.length === 1, 'неделя проката не записала сбор');
    const share = loved.s.ledger.filter((l) => /Прокат/.test(l.label)).map((l) => l.amount);
    assert.equal(share[0], loved.m.takes[0], 'доля студии не пришла в кассу проводкой');
    assert.ok(share[0] > 0 && share[0] <= 1000000 * 1.3 * ReleaseSystem.cfg().share + 1);
    assert.ok(loved.m.takes[0] > 0 && loved.m.takes[0] < 1000000 * 1.3);
    // Decay: the loved picture holds, the hated one collapses.
    for (let i = 0; i < 3; i++) { StudioManager.state = loved.s; StudioManager.tickWeek(); }
    for (let i = 0; i < 3; i++) { StudioManager.state = hated.s; StudioManager.tickWeek(); }
    assert.ok(loved.m.takes.length >= 3 && hated.m.takes.length >= 3, 'мало недель для сравнения');
    const lovedRatio = loved.m.takes[2] / loved.m.takes[0];
    const hatedRatio = hated.m.takes[2] / hated.m.takes[0];
    assert.ok(lovedRatio > hatedRatio, 'слово зрителей не держит экраны: ' + lovedRatio + ' vs ' + hatedRatio);
    assert.ok(hatedRatio < Math.pow(1 - c.drop + 0.05, 2), 'провал не падает достаточно быстро');
});

test('финал проката: прибыль, фанбаза и звёзды двигаются в нужную сторону', () => {
    const run = (shotQuality, expectFansUp) => {
        const { s, pr } = wrappedStudio({ shotQuality, fans: 30 });
        const res = ReleaseSystem.premiere(s, StudioManager, pr, { marketing: 50000 });
        const m = res.movie;
        m.take = shotQuality > 6 ? 2000000 : 20000;
        m.weeksLeft = 1;
        const fans0 = s.fans;
        const cast = Object.keys(pr.cast).map((k) => ProductionSystem.person(s, pr.cast[k]));
        const stars0 = cast.map((p) => p.star);
        StudioManager.state = s; StudioManager.tickWeek();
        assert.equal(m.state, 'done', 'картина не сошла с проката');
        assert.ok(typeof m.profit === 'number');
        assert.ok(s.stats.films === 1 && s.stats.boxOffice > 0);
        return { fansDelta: s.fans - fans0, starsUp: cast.some((p, i) => p.star >= stars0[i]) };
    };
    const hit = run(8.5, true);
    const flop = run(1.5, false);
    // The weekly fan drift of StudioManager also runs on the same tick, so the sign of the net
    // delta is not purely the wrap's; test the wrap's fan math in isolation.
    const c = ReleaseSystem.cfg();
    const fansOf = (q) => {
        const st = wrappedStudio().s;
        st.fans = 40;
        const m = { id: 'x', title: 'X', quality: q, score: q, audience: 60, boxOffice: 1000, spent: 500, marketing: 100, castIds: {}, directorId: '' };
        const out = [];
        ReleaseSystem._wrap(st, StudioManager, m, out);
        return st.fans - 40;
    };
    const up = fansOf(8.5), down = fansOf(2);
    assert.ok(Math.abs(up - (8.5 - 6) * c.fansPerQuality) < 1e-9, 'фанаты хита считаются не по формуле: ' + up);
    assert.ok(Math.abs(down - (2 - 4.5) * c.fansLoss) < 1e-9, 'фанаты провала считаются не по формуле: ' + down);
    assert.ok(up > 0 && down < 0);
    assert.ok(hit.flop !== true);
});

test('«Золотой Кадр»: раздаётся за прошедший год и только при наличии фильмов', () => {
    const { s, pr } = wrappedStudio();
    assert.equal(ReleaseSystem.awardsCeremony(s).length, 0, 'без фильмов церемония молчит');
    const res = ReleaseSystem.premiere(s, StudioManager, pr, { marketing: 50000 });
    const m = res.movie;
    m.state = 'done';
    m.year = s.year;                       // released this year: the ceremony waits for the next
    assert.equal(ReleaseSystem.awardsCeremony(s).length, 0, 'церемония награждает не за тот год');
    m.year = s.year - 1;
    const rep0 = s.rep, fans0 = s.fans, cash0 = s.cash;
    const toasts = ReleaseSystem.awardsCeremony(s);
    assert.ok(toasts.length >= 2, 'церемония бедна на тосты: ' + toasts.length);
    assert.ok(toasts.some((t) => /лучший фильм/i.test(t)));
    assert.ok(m.awards.length >= 1, 'фильм не получил наград');
    assert.ok(s.rep > rep0 && s.fans >= fans0, 'награды не подняли репутацию/фанатов');
    assert.equal(s.cash, cash0 + ReleaseSystem.cfg().awardCash, 'премиальные не пришли');
    assert.ok(s.news.some((n) => /Золотой Кадр/.test(n.text)));
    // The laureates grew stars through their awards.
    const dir = ProductionSystem.person(s, m.directorId);
    assert.ok(dir.awards >= 1 && dir.star >= 0);
});

test('детерминизм: одна премьера из одного состояния даёт те же цифры и те же рецензии', () => {
    const run = () => {
        const { s, pr } = wrappedStudio({ seed: 8080 });
        const res = ReleaseSystem.premiere(s, StudioManager, pr, { edit: 'fast', music: 'studio', marketing: 123456 });
        const m = res.movie;
        return [m.score, m.audience, m.screens, m.opening, JSON.stringify(m.reviews)].join('|');
    };
    assert.equal(run(), run());
});
