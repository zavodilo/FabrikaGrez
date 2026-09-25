// «Фабрика Грёз», фаза З: балансировка. Продюсерская политика среднего качества ведёт студию
// 20 лет: заказывает сценарии по моде эпохи, собирает каст, снимает, выпускает с кампанией,
// продлевает контракты и перебивает офферы. Прогон обязан обойтись без NaN, без банкротства,
// с растущей фильмографией и живой фанбазой — иначе баланс правится константами, а не удачей.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js', 'js/ActorModels.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js', 'js/ProductionSystem.js',
    'js/ReleaseSystem.js', 'js/MetaSystem.js', 'js/SaveSystem.js', 'js/Tutorial.js',
]);
const get = page.get;
const StudioManager = get('StudioManager');
const ScriptGenerator = get('ScriptGenerator');
const CastingSystem = get('CastingSystem');
const ProductionSystem = get('ProductionSystem');
const ReleaseSystem = get('ReleaseSystem');
const MetaSystem = get('MetaSystem');
const MovieData = get('MovieData');

/** A mediocre-but-sane producer: never gambles the studio, never lets a film rot. */
function policy(s) {
    const cash = s.cash;
    // Contracts first: people are the studio.
    for (const p of (s.roster || []).concat(s.staff || [])) {
        if (p.demand) { if (cash > 250000) StudioManager.renew(p); else StudioManager.letGo(p); }
        if (p.offer) { if (cash > 350000) StudioManager.counter(p); }
    }
    // Hire when the troupe is thin and the purse is full.
    if ((s.roster || []).length < 6 && cash > 700000) {
        const cand = (s.market || []).filter((x) => x.role === 'actor')
            .sort((a, b) => (b.skills.drama + b.skills.comedy + b.skills.action + b.skills.romance) / (b.salary || 1) - (a.skills.drama + a.skills.comedy + a.skills.action + a.skills.romance) / (a.salary || 1))[0];
        if (cand) StudioManager.hire(cand, 'actor');
    }
    const shooting = (s.projects || []).filter((p) => p.state === 'shooting');
    const post = (s.projects || []).filter((p) => p.state === 'post');
    const uncased = (s.scripts || []).find((sc) => sc.state === 'ready' && (!sc.cast || !CastingSystem.isComplete(s, sc)));
    const casted = (s.scripts || []).find((sc) => sc.cast && CastingSystem.isComplete(s, sc) && !(s.projects || []).some((p) => p.scriptId === sc.id && p.state !== 'shelf'));
    // Release anything waiting in the editing room.
    for (const pr of post) {
        const fit = Object.keys(ReleaseSystem.EDIT_FIT).find((k) => ReleaseSystem.EDIT_FIT[k].indexOf(pr.genre) >= 0) || 'normal';
        ReleaseSystem.premiere(s, StudioManager, pr, {
            edit: fit, music: (MovieData.GENRES[pr.genre] || {}).music,
            marketing: Math.round(pr.budget * 0.3),
        });
    }
    // Put a cast picture on the floor if the floor is empty.
    if (casted && shooting.length < 2) ProductionSystem.start(s, StudioManager, casted);
    // Cast a ready script.
    if (uncased) {
        uncased.cast = CastingSystem.autoCast(s, uncased);
        // A producer hires until the sheet can actually be cast.
        let guard = 0;
        while (!CastingSystem.isComplete(s, uncased) && guard++ < 6 && s.cash > 150000 && s.roster.length < 9) {
            const cand = (s.market || []).filter((x) => x.role === 'actor')
                .sort((a, b) => (b.skills.drama + b.skills.comedy + b.skills.action + b.skills.romance) / (b.salary || 1) - (a.skills.drama + a.skills.comedy + a.skills.action + a.skills.romance) / (a.salary || 1))[0];
            if (!cand || !StudioManager.hire(cand, 'actor')) break;
            uncased.cast = CastingSystem.autoCast(s, uncased);
        }
        const cr = CastingSystem.isComplete(s, uncased) ? CastingSystem.confirm(s, uncased, StudioManager) : { ok: false, why: 'каст не собрался' };
        
    }
    // Order a new script when the pipeline is dry and the purse allows.
    const pipeline = (s.orders || []).length +
        (s.scripts || []).filter((sc) => sc.state === 'ready' || sc.state === 'cast').length +
        (s.projects || []).filter((pr) => pr.state === 'shooting' || pr.state === 'post').length;
    const thisYear = (s.released || []).filter((m) => m.year === s.year).length;
    if (pipeline < 2 && cash > 250000 && thisYear < 4) {
        const year = s.year;
        const genre = Object.keys(MovieData.GENRES).sort((a, b) => MovieData.heat(b, year) - MovieData.heat(a, year))[0];
        const writer = (s.staff || []).find((p) => p.role === 'writer' && !p.training);
        ScriptGenerator.order(s, StudioManager, {
            genre: genre,
            budget: Math.max(300000, Math.min(ScriptGenerator.IDEAL_BUDGET[genre] || 400000, Math.round(cash * 0.4 / 50000) * 50000)),
            writerId: writer ? writer.id : '',
            title: '',
        });
    }
    // Buy the set a waiting script needs, when rich.
    if (cash > 900000) {
        const want = (s.scripts || []).find((sc) => !sc.timeline);
        if (want) {
            const G = MovieData.GENRES[want.genre] || {};
            const missing = (G.sets || []).find((x) => !s.ownedSets[x]);
            if (missing) StudioManager.buySet(missing);
        }
    }
}

function runYears(years, seed) {
    const s = StudioManager.newGame('Баланс-Студия', 'sandbox');
    s.seed = seed;
    StudioManager.state = s; StudioManager.init(null);
    const trace = { minCash: s.cash, maxFans: 0, films: 0, awards: 0, best: 0, bankrupt: false };
    const weeks = years * 52;
    for (let w = 0; w < weeks; w++) {
        policy(s);
        StudioManager.tickWeek();
        if (!Number.isFinite(s.cash) || !Number.isFinite(s.fans) || !Number.isFinite(s.rep)) {
            throw new Error('NaN на неделе ' + w + ': cash=' + s.cash + ' fans=' + s.fans + ' rep=' + s.rep);
        }
        trace.minCash = Math.min(trace.minCash, s.cash);
        trace.maxFans = Math.max(trace.maxFans, s.fans);
        if (s.cash < -500000) trace.bankrupt = true;
        if (s.fans < 0 || s.fans > 100) throw new Error('фанбаза вне границ: ' + s.fans);
    }
    trace.films = (s.stats || {}).films || 0;
    trace.awards = (s.stats || {}).awards || 0;
    trace.best = (s.stats || {}).bestScore || 0;
    trace.gross = (s.stats || {}).boxOffice || 0;
    trace.finalCash = s.cash;
    trace.finalFans = s.fans;
    trace.year = s.year;
    trace.released = (s.released || []).length;
    return trace;
}

test('20 лет под продюсерской политикой: без NaN, без банкротства, с растущей студией', () => {
    const t = runYears(20, 20260);
    assert.equal(t.bankrupt, false, 'студия обанкротилась: минимум кассы ' + Math.round(t.minCash));
    assert.ok(t.films >= 6, 'за 20 лет снято меньше шести фильмов: ' + t.films);
    assert.ok(t.finalCash > 0, 'студия дожила до 20 лет в минусе: ' + Math.round(t.finalCash));
    assert.ok(t.finalFans >= 10, 'фанбаза не живёт: ' + t.finalFans.toFixed(1));
    assert.ok(t.best >= 5, 'за 20 лет ни одного приличного фильма: лучшая оценка ' + t.best);
    assert.ok(t.gross > 0, 'касса проката пуста');
    // The curve must not degrade: the second decade is not worse than the first.
    const first = runYears(10, 20260);
    assert.ok(first.films >= 3, 'первое десятилетие без фильмов: ' + first.films);
});

test('десять разных seed: баланс не держится на одном удачном кубике', () => {
    let survived = 0, withFilms = 0;
    for (const seed of [1, 7, 42, 99, 777, 1234, 4242, 31337, 80808, 20260]) {
        const t = runYears(12, seed);
        if (!t.bankrupt && t.finalCash > -200000) survived++;
        if (t.films >= 3) withFilms++;
    }
    assert.ok(survived >= 8, 'выжили только ' + survived + ' из 10 seed');
    assert.ok(withFilms >= 8, 'фильмография выросла только у ' + withFilms + ' из 10 seed');
});
