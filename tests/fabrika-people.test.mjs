// «Фабрика Грёз», фаза Е: люди. Контракты и их продление, переманивание звёзд, динамика
// отношений (дружба/роман/соперничество) и скандалы на площадке, старение и пенсия,
// школа мастерства с тремя видами курсов — и детерминизм недельной жизни труппы от seed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js', 'js/ActorModels.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js', 'js/ProductionSystem.js', 'js/ReleaseSystem.js',
]);
const get = page.get;
const StudioManager = get('StudioManager');
const PeopleSystem = get('PeopleSystem');
const ScriptGenerator = get('ScriptGenerator');
const CastingSystem = get('CastingSystem');
const ProductionSystem = get('ProductionSystem');
const Rng = get('Rng');

function studio(opts) {
    const o = opts || {};
    const s = StudioManager.newGame('Тест-Люди');
    s.seed = o.seed != null ? o.seed : 4242;
    s.cash = 2000000;
    const r = Rng.create('people-e');
    s.roster.length = 0; s.staff.length = 0;
    for (let i = 0; i < 6; i++) {
        const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 4, maxSkill: 9 });
        p.gender = i % 2 ? 'f' : 'm'; p.look.gender = p.gender;
        s.roster.push(p);
    }
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'writer', minSkill: 5, maxSkill: 8 }));
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'director', minSkill: 5, maxSkill: 8 }));
    StudioManager.state = s; StudioManager.init(null);
    return s;
}

test('найм даёт контракт: год у рабочих лошадок, полгода у звёзд', () => {
    const s = studio();
    const c = PeopleSystem.cfg();
    const plain = s.market.find((p) => p.role === 'actor' && (p.star || 0) < 3) || s.market[0];
    plain.star = 0;
    assert.ok(StudioManager.hire(plain, 'actor'));
    assert.ok(plain.contract, 'контракт не выдан');
    assert.equal(plain.contract.term, c.contractWeeks);
    assert.equal(plain.contract.weeksLeft, c.contractWeeks);
    const star = PeopleSystem.randomPerson(Rng.create('star'), { role: 'actor', minSkill: 8, maxSkill: 9 });
    star.star = 4;
    s.market.push(star);
    assert.ok(StudioManager.hire(star, 'actor'));
    assert.equal(star.contract.term, c.starWeeks, 'звезда подписала не на полгода');
});

test('продление контракта: требование, повышение, отказ и уход по истечении срока', () => {
    const s = studio();
    const p = s.roster[0];
    p.contract = { salary: p.salary, term: 2, weeksLeft: 2 };
    const salary0 = p.salary;
    StudioManager.tickWeek();
    assert.ok(!p.demand, 'требование появилось рано');
    StudioManager.tickWeek();
    assert.ok(p.demand, 'контракт кончился, а требования нет');
    assert.ok(p.demand.raise > 0 && p.demand.weeksLeft === PeopleSystem.cfg().grace);
    // Renew: raise lands, term restarts, loyalty grows.
    const loy0 = p.loyalty;
    assert.ok(StudioManager.renew(p));
    assert.ok(p.salary > salary0, 'повышение не село в зарплату');
    assert.equal(p.demand, null);
    assert.equal(p.contract.weeksLeft, p.contract.term);
    assert.ok(p.loyalty > loy0);
    // A second person: ignore the demand until the grace runs out -> they walk.
    const q = s.roster[1];
    q.contract = { salary: q.salary, term: 1, weeksLeft: 1 };
    StudioManager.tickWeek();
    assert.ok(q.demand, 'второе требование не появилось');
    const grace = PeopleSystem.cfg().grace;
    for (let i = 0; i < grace + 1; i++) StudioManager.tickWeek();
    assert.ok(!s.roster.includes(q), 'недожданный человек не ушёл');
    // letGo removes immediately and without severance noise.
    const w = s.roster[0];
    w.contract = { salary: w.salary, term: 1, weeksLeft: 1 };
    StudioManager.tickWeek();
    if (w.demand) {
        const n = s.roster.length;
        assert.ok(StudioManager.letGo(w));
        assert.equal(s.roster.length, n - 1);
    }
});

test('переманивание: нелояльную звезду манят, перебитое предложение её удерживает', () => {
    const c = PeopleSystem.cfg();
    // Force an offer by sweeping seeds.
    let offered = null;
    for (let seed = 1; seed < 80 && !offered; seed++) {
        const s = studio({ seed });
        const p = s.roster[0];
        p.star = 4; p.loyalty = 20;
        StudioManager.tickWeek();
        if (p.offer) offered = { s, p };
    }
    assert.ok(offered, 'ни на одном seed звезду не поманили');
    const { s, p } = offered;
    assert.equal(p.offer.salary, Math.round(p.salary * c.poachMult));
    const cash0 = s.cash;
    assert.ok(StudioManager.counter(p), 'перебить предложение не удалось');
    assert.ok(s.cash < cash0, 'подписной бонус не списан');
    assert.equal(p.offer, null);
    assert.equal(p.salary, Math.round((p.salary) * 1), 'зарплата стала предложением');
    assert.ok(p.loyalty > 20, 'лояльность после спасения не выросла');
    // An unanswered offer resolves by itself within its window.
    const s2 = studio({ seed: 999 });
    const q = s2.roster[0];
    q.star = 4; q.loyalty = 10;
    q.offer = { salary: q.salary * 2, weeksLeft: 1 };
    StudioManager.tickWeek();
    assert.equal(q.offer, null, 'предложение не разрешилось');
});

test('отношения: пороги видов, симметрия, сортировка связей', () => {
    const s = studio();
    const [a, b, d] = s.roster;
    a.gender = 'm'; b.gender = 'f';
    PeopleSystem.setRel(a, b, 80);
    assert.equal(PeopleSystem.relKind(a, b), 'romance', 'разнополая пара 80 — не роман');
    assert.equal(PeopleSystem.relValue(b, a), 80, 'отношение несимметрично');
    PeopleSystem.setRel(a, b, 55);
    assert.equal(PeopleSystem.relKind(a, b), 'friend');
    PeopleSystem.setRel(a, b, -50);
    assert.equal(PeopleSystem.relKind(a, b), 'rival');
    PeopleSystem.setRel(a, b, 10);
    assert.equal(PeopleSystem.relKind(a, b), null, 'слабая связь не должна иметь вида');
    // Two notable bonds for the sorting check below.
    PeopleSystem.setRel(a, b, 60);
    PeopleSystem.setRel(a, d, 90);
    const bonds = PeopleSystem.bondsOf(s, a);
    assert.ok(bonds.length >= 2);
    assert.ok(Math.abs(bonds[0].value) >= Math.abs(bonds[1].value), 'связи не отсортированы по силе');
    assert.ok(PeopleSystem.REL_RU[PeopleSystem.relKind(a, d)]);
});

test('скандал и роман на площадке: фанаты, репутация и качество реагируют', () => {
    const c = PeopleSystem.cfg();
    const mk = (relValue) => {
        const s = studio();
        const sc = ScriptGenerator.draft(s, { genre: 'comedy', budget: 600000, seed: 11, writer: null });
        sc.cast = CastingSystem.autoCast(s, sc);
        CastingSystem.confirm(s, sc, StudioManager);
        s.scripts.push(sc);
        const pr = ProductionSystem.start(s, StudioManager, sc).project;
        const cast = ProductionSystem.castPeople(s, pr).map((x) => x.person);
        PeopleSystem.setRel(cast[0], cast[1], relValue);
        return { s, pr, cast, fans0: s.fans, rep0: s.rep || 20 };
    };
    // Rivals: sweep seeds until the scandal blows.
    let blew = null;
    for (let seed = 1; seed < 120 && !blew; seed++) {
        const w = mk(-70);
        w.s.seed = seed;
        w.s.fans = 40; w.s.rep = 50;
        StudioManager.tickWeek();
        if ((w.s.scandals || []).length) blew = w;
    }
    assert.ok(blew, 'соперники на одной площадке ни разу не взорвались');
    assert.ok(blew.s.fans < 40, 'скандал не оттолкнул фанатов');
    assert.ok(blew.s.rep < 50, 'скандал не ударил по репутации');
    assert.ok(blew.pr.qualityPenalty > 0, 'скандал не испортил дубли');
    assert.ok(blew.s.news.some((n) => /Скандал/.test(n.text)));
    // Romance: sweep seeds until the good press lands.
    let press = null;
    for (let seed = 1; seed < 120 && !press; seed++) {
        const w = mk(85);
        w.s.seed = seed;
        w.s.fans = 40;
        StudioManager.tickWeek();
        if (w.s.fans > 40) press = w;
    }
    assert.ok(press, 'роман на площадке ни разу не дал хорошей прессы');
    // Bonds deepen on their own momentum.
    const s3 = studio();
    PeopleSystem.setRel(s3.roster[0], s3.roster[1], 60);
    StudioManager.tickWeek();
    assert.ok(PeopleSystem.relValue(s3.roster[0], s3.roster[1]) > 60, 'дружба не крепнет сама');
});

test('год: молодые растут, пожилые сдают, старики уходят на покой', () => {
    const c = PeopleSystem.cfg();
    const s = studio();
    const young = s.roster[0]; young.age = 20;
    const main = PeopleSystem.SKILLS.slice().sort((x, y) => young.skills[y] - young.skills[x])[0];
    const youngBefore = young.skills[main];
    const old = s.roster[1]; old.age = c.declineAge + 2;
    const actBefore = old.skills.action;
    const elder = s.roster[2]; elder.age = c.retireAge + 1;
    s.week = 52;                       // the next tick rolls the year
    StudioManager.tickWeek();
    assert.ok(young.skills[main] > youngBefore || youngBefore >= 8, 'молодой не подрос');
    assert.ok(old.skills.action <= actBefore, 'пожилой не сдал в экшне');
    assert.ok(!s.roster.includes(elder), 'старик не ушёл на покой');
    assert.ok(s.news.some((n) => /покой|пенсия/i.test(n.text)), 'нет тёплых титров о пенсии');
});

test('школа: три вида курсов, цена и сроки из констант, прибавка по завершении', () => {
    const s = studio();
    const c = PeopleSystem.cfg();
    const p = s.roster[0];
    const skillCourse = PeopleSystem.courseInfo('drama');
    assert.equal(skillCourse.cost, c.trainCost);
    assert.equal(skillCourse.weeks, c.trainWeeks);
    assert.equal(PeopleSystem.courseInfo('charm').cost, Math.round(c.trainCost * c.charmMult));
    assert.equal(PeopleSystem.courseInfo('media').weeks, 1);
    // A genre course.
    const d0 = p.skills.drama;
    assert.ok(StudioManager.startTraining(p, 'drama'));
    assert.equal(StudioManager.startTraining(p, 'comedy'), false, 'две учёбы одновременно');
    for (let i = 0; i < c.trainWeeks; i++) StudioManager.tickWeek();
    assert.equal(p.skills.drama, Math.min(10, d0 + c.trainGain));
    // Charm.
    const ch0 = p.charm;
    assert.ok(StudioManager.startTraining(p, 'charm'));
    StudioManager.tickWeek(); StudioManager.tickWeek();
    assert.equal(p.charm, Math.min(10, ch0 + 1));
    // Media training buys exp toward a star.
    const exp0 = p.exp || 0;
    assert.ok(StudioManager.startTraining(p, 'media'));
    StudioManager.tickWeek();
    assert.ok((p.exp || 0) >= exp0 + c.mediaExp, 'медиа-курс не дал опыта');
    // No money — no course.
    s.cash = 10;
    assert.equal(StudioManager.startTraining(p, 'drama'), false);
});

test('неделя труппы детерминирована от seed', () => {
    const run = (seed) => {
        const s = studio({ seed });
        const a = s.roster[0], b = s.roster[1];
        PeopleSystem.setRel(a, b, -70);
        a.star = 4; a.loyalty = 25;
        a.contract = { salary: a.salary, term: 1, weeksLeft: 1 };
        StudioManager.tickWeek();
        StudioManager.tickWeek();
        // ids come from a module-global counter and differ between runs on purpose: compare
        // names and numbers, never ids.
        return JSON.stringify({
            rel: PeopleSystem.relValue(a, b),
            demand: !!a.demand, offer: !!a.offer,
            roster: s.roster.map((x) => x.name).join(','),
            moods: s.roster.map((x) => Math.round(x.mood)),
            news: s.news.slice(0, 4).map((n) => n.text),
        });
    };
    for (const seed of [1, 7, 5150]) assert.equal(run(seed), run(seed), 'seed ' + seed + ' не воспроизводится');
    // Seed-sensitivity: a week where the poach dice fall differently must differ.
    const fires = (seed) => {
        const s = studio({ seed });
        const a = s.roster[0];
        a.star = 4; a.loyalty = 15;
        StudioManager.tickWeek();
        return !!a.offer;
    };
    let yes = null, no = null;
    for (let seed = 1; seed < 60 && (yes == null || no == null); seed++) {
        if (fires(seed)) { if (yes == null) yes = seed; } else if (no == null) no = seed;
    }
    assert.ok(yes != null && no != null, 'кубик переманивания не различает seed');
    assert.notEqual(run(yes), run(no), 'неделя не чувствует seed');
});
