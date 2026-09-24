// «Фабрика Грёз», фаза З-эконом: сделки о прокате, зарубежная дистрибуция и агенты.
// Сделки меняют форму жизни картины: широкий прокат продаёт старт, платформенный — ноги,
// стриминг платит сразу и гасит славу, фестиваль меняет кассу на репутацию. Зарубежный прокат
// даёт картине вторую жизнь по регионам с риском пиратства и потолком, который расширяет
// агент. Агент же смягчает аппетит рынка: продление, переманивание и найм дешевеют.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
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
const PeopleSystem = get('PeopleSystem');

/** A studio with a wrapped picture ready to premiere under a chosen deal. */
function ready(deal) {
    const s = StudioManager.newGame('Тест-Сделки', 'sandbox');
    s.seed = 4242; s.cash = 3000000;
    StudioManager.state = s; StudioManager.init(null);
    const sc = ScriptGenerator.draft(s, { genre: 'drama', budget: 600000, seed: 99, writer: null });
    // Hire until the sheet can actually be cast: a drama asks for four roles, a new studio has three.
    let guard = 0;
    while (guard++ < 8) {
        sc.cast = CastingSystem.autoCast(s, sc);
        if (CastingSystem.isComplete(s, sc)) break;
        const cand = (s.market || []).filter((x) => x.role === 'actor')[0];
        if (!cand || !StudioManager.hire(cand, 'actor')) break;
    }
    CastingSystem.confirm(s, sc, StudioManager);
    s.scripts.push(sc);
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    pr.scenesShot = sc.timeline.scenes.map((x, i) => ({ idx: i, label: x.label, set: x.set, quality: 6.5, parts: {}, hadSet: true, week: 1 }));
    pr.nextScene = sc.timeline.scenes.length;
    pr.state = 'post';
    pr.postWeeks = 2;
    return { s, sc, pr, deal };
}

function premiere(r) {
    return ReleaseSystem.premiere(r.s, StudioManager, r.pr, {
        edit: 'normal', music: 'drama', marketing: 100000, deal: r.deal,
    });
}

test('сделки: платформенный выпуск жертвует стартом ради ног и критики', () => {
    const wide = premiere(ready('wide'));
    const plat = premiere(ready('platform'));
    assert.equal(wide.ok, true, wide.why);
    assert.equal(plat.ok, true, plat.why);
    assert.ok(plat.movie.opening < wide.movie.opening, 'платформа не уступила стартом');
    assert.ok(plat.movie.take < wide.movie.take, 'платформа не вышла скромнее');
    assert.ok(plat.movie.weeksLeft > wide.movie.weeksLeft, 'платформа не живёт дольше');
    assert.ok(plat.movie.score > wide.movie.score - 0.001, 'платформа не получила заботу о критике');
    assert.ok(plat.movie.holdBonus > 0, 'у платформы нет бонуса удержания');
});

test('сделки: стриминг платит сразу и гасит прокат, фестиваль меняет кассу на репутацию', () => {
    const r = ready('streaming');
    const cash0 = r.s.cash;
    const res = premiere(r);
    assert.equal(res.ok, true, res.why);
    const m = res.movie;
    assert.equal(m.state, 'done', 'стриминг не закрыл картину сразу');
    assert.ok(m.boxOffice > 0, 'стриминг не заплатил');
    assert.equal(r.s.cash - cash0, m.boxOffice - 100000, 'цена стриминга не прошла проводкой');
    assert.equal((r.s.stats || {}).films, 1, 'стриминг не засчитан в фильмографию');
    // No weekly run: the picture has no takes.
    StudioManager.tickWeek();
    assert.equal(m.takes.length, 0, 'у стриминга не должно быть недельных сборов');

    const f = ready('festival');
    const rep0 = f.s.rep || 20;
    const fres = premiere(f);
    assert.equal(fres.ok, true, fres.why);
    assert.ok(fres.movie.take < premiere(ready('wide')).movie.take, 'фестиваль не уступил кассой');
    assert.ok((f.s.rep || 20) > rep0, 'фестиваль не дал репутации');
});

test('зарубежный прокат: регион стоит денег, приносит недели и защищён потолком', () => {
    const r = ready('wide');
    const res = premiere(r);
    const m = res.movie;
    m.state = 'done';
    m.takes = [1000000, 600000, 360000, 216000];
    const cash0 = r.s.cash;
    const open = ReleaseSystem.startForeign(r.s, StudioManager, m, 'europe');
    assert.equal(open.ok, true, open.why);
    assert.equal(r.s.cash, cash0 - (typeof FOREIGN_COST !== 'undefined' ? FOREIGN_COST : 50000));
    const reg = m.foreign.regions.europe;
    assert.equal(reg.weeksLeft, typeof FOREIGN_WEEKS !== 'undefined' ? FOREIGN_WEEKS : 4);
    const avg = (1000000 + 600000 + 360000 + 216000) / 4;
    assert.equal(reg.take, Math.round(avg * ReleaseSystem.foreignMult('europe')));
    // A second region needs an agent.
    const second = ReleaseSystem.startForeign(r.s, StudioManager, m, 'asia');
    assert.equal(second.ok, false, 'второй регион без агента открыться не должен');
    assert.match(second.why, /агент/);
    // Hire an agent: the cap lifts.
    const agent = PeopleSystem.randomPerson(get('Rng').create('agent1'), { role: 'agent', minSkill: 4, maxSkill: 8 });
    r.s.market.push(agent);
    StudioManager.hire(agent, 'agent');
    assert.equal(PeopleSystem.agentPower(r.s), 1);
    const second2 = ReleaseSystem.startForeign(r.s, StudioManager, m, 'asia');
    assert.equal(second2.ok, true, second2.why);
    // Weekly: foreign takes land in the ledger and decay.
    const gross0 = m.boxOffice;
    StudioManager.tickWeek();
    assert.ok(m.boxOffice > gross0, 'зарубежные сборы не пришли');
    assert.ok((r.s.ledger || []).some((l) => /Зарубежный прокат/.test(l.label)), 'нет проводки зарубежного проката');
    assert.ok(m.foreign.regions.europe.weeksLeft < (typeof FOREIGN_WEEKS !== 'undefined' ? FOREIGN_WEEKS : 4));
    // Piracy can bite: sweep seeds until it does, and it halves the take.
    let bitten = false;
    for (let seed = 1; seed < 60 && !bitten; seed++) {
        const rr = ready('wide');
        rr.s.seed = seed;
        const mv = premiere(rr).movie;
        mv.state = 'done';
        mv.takes = [800000, 480000];
        ReleaseSystem.startForeign(rr.s, StudioManager, mv, 'asia');
        const before = mv.foreign.regions.asia.take;
        const toasts = ReleaseSystem.weekly(rr.s, StudioManager);
        if (toasts.some((t) => /Пираты/.test(t))) {
            bitten = true;
            assert.ok(mv.foreign.regions.asia.take < before, 'пиратство не срезало сборы');
        }
    }
    assert.ok(bitten, 'пиратство ни разу не сработало за 60 seed');
});

test('агенты: сила ограничена, продление и найм дешевеют', () => {
    const s = StudioManager.newGame('Тест-Агенты', 'sandbox');
    s.seed = 7; s.cash = 2000000;
    StudioManager.state = s; StudioManager.init(null);
    assert.equal(PeopleSystem.agentPower(s), 0);
    const mk = (i) => {
        const a = PeopleSystem.randomPerson(get('Rng').create('ag' + i), { role: 'agent', minSkill: 4, maxSkill: 8 });
        s.market.push(a);
        StudioManager.hire(a, 'agent');
        return a;
    };
    mk(1); mk(2); mk(3);
    assert.equal(PeopleSystem.agentPower(s), 2, 'сила агентов не ограничена потолком');

    // Renewal: the same star asks less with an agent on staff.
    const star = PeopleSystem.randomPerson(get('Rng').create('star'), { role: 'actor', minSkill: 8, maxSkill: 9 });
    star.star = 4; star.loyalty = 40;
    s.roster.push(star);
    const askWithout = (() => {
        const st = StudioManager.newGame('Без агента', 'sandbox');
        st.seed = 7; StudioManager.state = st; StudioManager.init(null);
        const p = PeopleSystem.randomPerson(get('Rng').create('star'), { role: 'actor', minSkill: 8, maxSkill: 9 });
        p.star = 4; p.loyalty = 40;
        st.roster.push(p);
        p.contract = { salary: p.salary, term: 1, weeksLeft: 1 };
        StudioManager.tickWeek();
        return p.demand ? p.demand.raise : null;
    })();
    StudioManager.state = s;                 // the probe above left its own state current
    star.contract = { salary: star.salary, term: 1, weeksLeft: 1 };
    StudioManager.tickWeek();
    assert.ok(star.demand, 'требование продления не появилось');
    assert.ok(star.demand.raise < askWithout, 'агент не сбил цену продления: ' + star.demand.raise + ' >= ' + askWithout);

    // Hiring: an agent negotiates the new salary down.
    const s2 = StudioManager.newGame('Найм', 'sandbox');
    s2.seed = 7; s2.cash = 1000000;
    StudioManager.state = s2; StudioManager.init(null);
    const cand = PeopleSystem.randomPerson(get('Rng').create('cand'), { role: 'actor', minSkill: 6, maxSkill: 8 });
    const baseSalary = cand.salary;
    const ag = PeopleSystem.randomPerson(get('Rng').create('ag9'), { role: 'agent', minSkill: 4, maxSkill: 8 });
    s2.market.push(ag);
    StudioManager.hire(ag, 'agent');
    s2.market.push(cand);
    StudioManager.hire(cand, 'actor');
    assert.ok(cand.salary < baseSalary, 'агент не сбил зарплату найма: ' + cand.salary + ' >= ' + baseSalary);
});
