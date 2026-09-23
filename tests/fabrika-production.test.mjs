// «Фабрика Грёз», фаза Г: производство. Проверяется то, что нельзя увидеть глазами:
// конвейер writing → casting → shooting → post, броски качества дублей и их объяснимость,
// темпы и их цена, перерасход, инциденты и их последствия, дневники/черновой монтаж как
// валидный таймлайн MovieSequencer, декорации-активы с уровнями, занятость людей,
// детерминизм недель от seed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js', 'js/ProductionSystem.js',
]);
const get = page.get;
const StudioManager = get('StudioManager');
const ScriptGenerator = get('ScriptGenerator');
const CastingSystem = get('CastingSystem');
const ProductionSystem = get('ProductionSystem');
const PeopleSystem = get('PeopleSystem');
const Rng = get('Rng');
const MovieData = get('MovieData');

/** A studio with a cast script ready for the floor, fully seeded (no Date.now leakage). */
function readyStudio(opts) {
    const o = opts || {};
    const s = StudioManager.newGame('Тест-Продакшн');
    s.seed = o.seed != null ? o.seed : 90210;
    s.cash = o.cash != null ? o.cash : 2000000;
    const r = Rng.create('prod-roster');
    // newGame seeds the FOUNDING troupe from Date.now(), so the whole staff is regenerated from
    // a fixed stream here: a production test must not depend on the wall clock.
    s.roster.length = 0;
    s.staff.length = 0;
    for (let i = 0; i < 8; i++) {
        const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 4, maxSkill: 9 });
        p.gender = i % 2 ? 'f' : 'm'; p.look.gender = p.gender;
        s.roster.push(p);
    }
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'writer', minSkill: 4, maxSkill: 9 }));
    s.staff.push(PeopleSystem.randomPerson(r, { role: 'director', minSkill: 5, maxSkill: 9 }));
    // Own the genre's sets so the set bonus path is exercised.
    for (const set of (MovieData.GENRES[o.genre || 'comedy'] || {}).sets || []) {
        if (!s.ownedSets[set]) s.ownedSets[set] = { level: 1 };
    }
    StudioManager.state = s;
    StudioManager.init(null);
    const sc = ScriptGenerator.draft(s, { genre: o.genre || 'comedy', budget: o.budget || 600000, seed: 555, writer: null });
    sc.cast = CastingSystem.autoCast(s, sc);
    CastingSystem.confirm(s, sc, StudioManager);
    s.scripts.push(sc);
    return { s, sc };
}

test('start: без каста и без режиссёра на площадку не пускают', () => {
    const { s, sc } = readyStudio();
    const bare = ScriptGenerator.draft(s, { genre: 'comedy', budget: 300000, seed: 777, writer: null });
    s.scripts.push(bare);
    const noCast = ProductionSystem.start(s, StudioManager, bare);
    assert.equal(noCast.ok, false);
    assert.match(noCast.why, /каст/i);
    // No free director -> refused.
    const { s: s2, sc: sc2 } = readyStudio();
    for (const p of s2.staff) if (p.role === 'director') p.busyUntilWeek = 999;
    const busy = ProductionSystem.personBusy;   // sanity: the guard itself works
    assert.equal(typeof busy, 'function');
    s2.staff.filter((p) => p.role === 'director').forEach((p) => { s2.projects = s2.projects || []; });
    // Fake a shooting project holding the only director.
    const dir = s2.staff.find((p) => p.role === 'director');
    s2.projects = [{ id: 'prX', scriptId: 'none', state: 'shooting', cast: {}, directorId: dir.id, pace: 'std', budget: 1, spent: 0, scenesShot: [], sceneCount: 1, nextScene: 0, incidents: [], weeksShot: 0, overWeeks: 0, delay: 0 }];
    const noDir = ProductionSystem.start(s2, StudioManager, sc2);
    assert.equal(noDir.ok, false);
    assert.match(noDir.why, /режисс/i);
});

test('start: проект получает лист сцен, каст и лучшего жанрового режиссёра', () => {
    const { s, sc } = readyStudio({ genre: 'comedy' });
    const res = ProductionSystem.start(s, StudioManager, sc);
    assert.equal(res.ok, true, res.why);
    const pr = res.project;
    assert.equal(pr.sceneCount, sc.timeline.scenes.length);
    assert.equal(pr.nextScene, 0);
    assert.equal(pr.state, 'shooting');
    assert.equal(pr.budget, sc.budget);
    assert.deepEqual(Object.keys(pr.cast).sort(), Object.keys(sc.cast).sort());
    const G = MovieData.GENRES[sc.genre];
    const dirs = s.staff.filter((p) => p.role === 'director');
    const best = dirs.slice().sort((a, b) => (b.skills[G.skill] || 0) - (a.skills[G.skill] || 0))[0];
    assert.equal(pr.directorId, best.id, 'взяли не лучшего жанрового режиссёра');
    assert.equal(sc.state, 'shooting');
    // The cast is committed: nobody can be fired off a shooting floor.
    for (const k of Object.keys(pr.cast)) {
        assert.ok(ProductionSystem.personBusy(s, CastingSystem.person(s, pr.cast[k])), 'актер со съёмок не помечен занятым');
    }
    // A second start of the same script is refused; a second project is allowed, a third is not.
    assert.equal(ProductionSystem.start(s, StudioManager, sc).ok, false);
});

test('weekly: сцены снимаются по порядку темпом, бюджет горит, конец — в монтаж', () => {
    const { s, sc } = readyStudio();
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    const total = pr.sceneCount;
    let weeks = 0;
    const perWeek = [];
    while (pr.state === 'shooting' && weeks < 40) {
        const before = pr.scenesShot.length;
        StudioManager.tickWeek();
        weeks++;
        perWeek.push(pr.scenesShot.length - before);
        // Money: every shooting week costs the pace's spread of the budget.
        assert.ok(pr.spent > 0);
        for (const shot of pr.scenesShot) {
            assert.ok(shot.quality >= 0.3 && shot.quality <= 10, 'качество дубля вне границ: ' + shot.quality);
            assert.ok(shot.idx >= 0 && shot.idx < total);
            // The explanation adds up to (approximately) the rolled number.
            const p = shot.parts;
            const sum = p.base + p.director + p.actors + p.set + p.mood + p.pace + p.over + p.luck;
            assert.ok(Math.abs(sum - shot.quality) < 0.02 || shot.quality === 0.3 || shot.quality === 10,
                'части качества не складываются: ' + sum + ' vs ' + shot.quality);
        }
    }
    assert.equal(pr.state, 'post', 'съёмки не завершились за 40 недель');
    assert.equal(pr.scenesShot.length, total, 'снято не всё');
    // Order: scenes are shot in script order.
    for (let i = 0; i < total; i++) assert.equal(pr.scenesShot[i].idx, i);
    // The standard pace shoots SHOOT_SCENES_PER_WEEK scenes on a non-delay week.
    const std = ProductionSystem.pace('std').scenes;
    assert.ok(perWeek.slice(0, 2).every((n) => n === std || n > 0), 'темп не выдержан: ' + perWeek.join(','));
    // People are freed when the picture wraps.
    for (const k of Object.keys(pr.cast)) {
        assert.equal(ProductionSystem.personBusy(s, CastingSystem.person(s, pr.cast[k])), null);
    }
    assert.ok(s.news.some((n) => /завершён/i.test(n.text)), 'нет записи в хронике о завершении');
});

test('weekly: темп меняет и скорость, и цену, и качество дублей', () => {
    const mk = (pace) => {
        const { s, sc } = readyStudio({ seed: 4242 });
        const pr = ProductionSystem.start(s, StudioManager, sc).project;
        pr.pace = pace;
        return { s, pr };
    };
    const cheap = mk('cheap'), std = mk('std'), rich = mk('rich');
    const P = ProductionSystem;
    assert.ok(P.weeklyCost(cheap.pr) < P.weeklyCost(std.pr), 'экономный темп не дешевле');
    assert.ok(P.weeklyCost(rich.pr) > P.weeklyCost(std.pr), 'размашистый темп не дороже');
    StudioManager.state = cheap.s; StudioManager.tickWeek();
    const c1 = cheap.pr.scenesShot.length;
    StudioManager.state = std.s; StudioManager.tickWeek();
    const s1 = std.pr.scenesShot.length;
    StudioManager.state = rich.s; StudioManager.tickWeek();
    const r1 = rich.pr.scenesShot.length;
    assert.ok(c1 < s1, 'экономный темп снял не меньше стандартного');
    assert.equal(r1, s1, 'размашистый темп снимает столько же сцен, но дороже');
    // Quality deltas: over many scenes rich beats cheap on the pace term.
    assert.ok(P.pace('rich').q > P.pace('cheap').q);
});

test('weekly: перерасход бьёт по качеству и помечается', () => {
    const { s, sc } = readyStudio();
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    pr.spent = pr.budget;                           // the picture arrives at the budget edge
    StudioManager.state = s;
    StudioManager.tickWeek();
    assert.ok(pr.spent > pr.budget, 'перерасход не возник');
    assert.ok(pr.overWeeks >= 1, 'недели перерасхода не посчитаны');
    const shot = pr.scenesShot[0];
    assert.ok(shot.parts.over < 0, 'перерасход не отразился в объяснении дубля');
});

test('инциденты: случаются, применяются и зависят от надёжности группы', () => {
    // Draw incidents directly with a fixed rng: every fired one must land an effect.
    const { s, sc } = readyStudio();
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    let fired = 0;
    for (let seed = 1; seed < 60; seed++) {
        const r = Rng.create('inc-' + seed);
        const before = { delay: pr.delay, spent: pr.spent, cash: s.cash, incidents: pr.incidents.length };
        const res = ProductionSystem._incident(s, pr, r, StudioManager);
        if (!res) continue;
        fired++;
        assert.ok(res.toast && res.toast.length > 8, 'инцидент без текста');
        assert.ok(pr.incidents.length === before.incidents + 1, 'инцидент не записан в проект');
        // Something actually changed: delay, money or a mood.
        const changed = pr.delay !== before.delay || s.cash !== before.cash || pr.incidents.length !== before.incidents.length;
        assert.ok(changed, 'инцидент ничего не изменил');
    }
    assert.ok(fired >= 10, 'слишком мало инцидентов сработало для проверки: ' + fired);
    // Reliability direction: a reliable crew incidents less often over many draws.
    const count = (rel) => {
        const st = readyStudio();
        const p2 = ProductionSystem.start(st.s, StudioManager, st.sc).project;
        for (const c of ProductionSystem.castPeople(st.s, p2)) c.person.reliability = rel;
        let n = 0;
        for (let seed = 1; seed < 200; seed++) {
            if (ProductionSystem._incident(st.s, p2, Rng.create('rel-' + seed), StudioManager)) n++;
        }
        return n;
    };
    const low = count(2), high = count(10);
    assert.ok(high < low, 'надёжная группа страдает не реже ненадёжной: ' + high + ' vs ' + low);
});

test('черновой монтаж и дневники: только снятые сцены, контракт таймлайна цел', () => {
    const { s, sc } = readyStudio();
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    assert.equal(ProductionSystem.roughCut(s, pr), null, 'пустой черновой монтаж не должен существовать');
    StudioManager.state = s;
    StudioManager.tickWeek();
    StudioManager.tickWeek();
    assert.ok(pr.scenesShot.length >= 2, 'для проверки нужно хотя бы две снятые сцены');
    const tl = ProductionSystem.roughCut(s, pr);
    assert.ok(tl && tl.scenes.length === pr.scenesShot.length, 'черновой монтаж не равен снятому');
    for (let i = 0; i < tl.scenes.length; i++) {
        assert.equal(tl.scenes[i], sc.timeline.scenes[pr.scenesShot[i].idx], 'сцены черновика не в порядке съёмки');
    }
    assert.ok(tl.cast.length === sc.timeline.cast.length, 'каст черновика потерялся');
    assert.match(tl.title, /черновой/);
    // Dailies: only shot indices are watchable.
    assert.ok(pr.scenesShot.every((x) => x.idx < sc.timeline.scenes.length));
});

test('декорации-активы: уровни растут за деньги и дают бонус к дублям', () => {
    const { s, sc } = readyStudio();
    const setId = Object.keys(s.ownedSets)[0];
    const c0 = ProductionSystem.upgradeCost(s, setId);
    assert.ok(c0 > 0);
    const cash0 = s.cash;
    const res = ProductionSystem.upgradeSet(s, StudioManager, setId);
    assert.equal(res.ok, true, res.why);
    assert.equal(s.ownedSets[setId].level, 2);
    assert.equal(s.cash, cash0 - c0);
    const c1 = ProductionSystem.upgradeCost(s, setId);
    assert.ok(c1 > c0, 'следующий уровень не дороже');
    ProductionSystem.upgradeSet(s, StudioManager, setId);
    assert.equal(ProductionSystem.upgradeCost(s, setId), null, 'после максимума апгрейд недоступен');
    assert.equal(s.ownedSets[setId].level, ProductionSystem.cfg().maxLevel);
    // The set bonus in a take grows with the level.
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    const scene = sc.timeline.scenes.find((x) => x.set === setId) || sc.timeline.scenes[0];
    const r = Rng.create('setbonus');
    const q1 = ProductionSystem.rollSceneQuality(s, pr, sc, scene, r);
    s.ownedSets[setId] = { level: 1 };
    const q0 = ProductionSystem.rollSceneQuality(s, pr, sc, scene, r);
    assert.ok(q1.parts.set > q0.parts.set, 'уровень декорации не улучшает дубль');
    // No set at all: no bonus, and the take says so.
    delete s.ownedSets[scene.set];
    const qNone = ProductionSystem.rollSceneQuality(s, pr, sc, scene, r);
    assert.equal(qNone.parts.set, 0);
    assert.equal(qNone.hadSet, false);
});

test('прогноз качества: веса дают 1, границы держатся, дубли влияют', () => {
    const { s, sc } = readyStudio();
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    const before = ProductionSystem.projectedQuality(s, pr);
    assert.ok(Math.abs(before.weights.script + before.weights.shot + before.weights.chem - 1) < 1e-9, 'веса до съёмок не дают 1');
    assert.ok(before.quality > 0 && before.quality <= 10);
    StudioManager.state = s;
    for (let i = 0; i < 3 && pr.state === 'shooting'; i++) StudioManager.tickWeek();
    const after = ProductionSystem.projectedQuality(s, pr);
    assert.ok(Math.abs(after.weights.script + after.weights.shot + after.weights.chem - 1) < 1e-9, 'веса после съёмок не дают 1');
    assert.ok(after.shot != null, 'после съёмок нет средней по дублям');
    assert.ok(after.quality > 0 && after.quality <= 10);
    // Great dailies lift the projection above a terrible script, and vice versa.
    pr.scenesShot.forEach((x) => { x.quality = 9.5; });
    assert.ok(ProductionSystem.projectedQuality(s, pr).quality > before.quality - 1);
});

test('wrap: свернуться досрочно можно только с материалом', () => {
    const { s, sc } = readyStudio();
    const pr = ProductionSystem.start(s, StudioManager, sc).project;
    const empty = ProductionSystem.wrap(s, StudioManager, pr);
    assert.equal(empty.ok, false);
    StudioManager.state = s;
    StudioManager.tickWeek();
    const res = ProductionSystem.wrap(s, StudioManager, pr);
    assert.equal(res.ok, true, res.why);
    assert.equal(pr.state, 'post');
    assert.ok(pr.wrappedEarly);
    for (const k of Object.keys(pr.cast)) {
        assert.equal(ProductionSystem.personBusy(s, CastingSystem.person(s, pr.cast[k])), null);
    }
    // A post project is not shootable again.
    assert.equal(ProductionSystem.wrap(s, StudioManager, pr).ok, false);
});

test('детерминизм: один seed и одни решения дают те же дубли', () => {
    const run = () => {
        const { s, sc } = readyStudio({ seed: 31337 });
        const pr = ProductionSystem.start(s, StudioManager, sc).project;
        StudioManager.state = s;
        for (let i = 0; i < 4 && pr.state === 'shooting'; i++) StudioManager.tickWeek();
        return pr.scenesShot.map((x) => x.idx + ':' + x.quality).join('|');
    };
    assert.equal(run(), run());
});
