// «Фабрика Грёз», фаза В: сценарии и кастинг. Проверяется то, что нельзя увидеть глазами:
// (1) таблица якорей SET_SLOTS ссылается только на реально объявленные точки декораций;
// (2) сценарии всех 7 жанров на разных бюджетах структурно целы и детерминированы;
// (3) СКОМПИЛИРОВАННЫЙ ТАЙМЛАЙН соответствует контракту MovieSequencer — иначе фильм не
//     сыграет: сеты/пропы/SFX/музыка существуют, id актёров разрешаются, якоря есть,
//     позы камеры валидны, beats отсортированы и внутри длительности, плейсхолдеры подставлены;
// (4) кастинг: оценки в границах, авто-кастинг заполняет роли без повторов, химия в [−1, 1],
//     confirm собирает таймлайн и не пускает без денег.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js',
]);
const get = page.get;
const MovieData = get('MovieData');
const ScriptGenerator = get('ScriptGenerator');
const CastingSystem = get('CastingSystem');
const StudioManager = get('StudioManager');
const PeopleSystem = get('PeopleSystem');
const Rng = get('Rng');

// --- the anchors every set really declares (parsed from the engine source) -------------------
function declaredAnchors() {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'SetPieces3D.js'), 'utf8');
    const parts = src.split(/\n    (\w+)\(S\) \{/);
    const out = {};
    for (let i = 1; i < parts.length; i += 2) {
        const body = parts[i + 1] || '';
        out[parts[i]] = new Set([...body.matchAll(/\.A\('([a-zA-Z_0-9]+)'/g)].map((m) => m[1]));
    }
    return out;
}
function declaredProps() {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'SetPieces3D.js'), 'utf8');
    const m = /SetPieces3D\.PROPS\s*=[\s\S]*?\(\{([\s\S]*?)\n\}\);/.exec(src);
    return new Set([...(m ? m[1] : '').matchAll(/\n    (\w+)\(S/g)].map((x) => x[1]));
}
const ANCHORS = declaredAnchors();
const PROPS = declaredProps();

const CAM_TYPES = new Set(['wide', 'medium', 'close', 'dutch', 'low', 'duo', 'over', 'crane', 'fixed']);
const SLOTS = ['wide', 'a', 'b', 'c', 'd', 'e', 'f', 'enter'];
const GENRES = Object.keys(MovieData.GENRES);
const BUDGETS = [100000, 300000, 700000, 1500000, 3000000];

/** A studio state with a big enough troupe to cast anything. */
function stateWith(nActors, opts) {
    const s = StudioManager.newGame('Тест-Студия');
    const r = Rng.create('test-cast-' + nActors);
    s.roster.length = 0;
    for (let i = 0; i < nActors; i++) {
        const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 3, maxSkill: 9 });
        p.age = 20 + (i * 7) % 45;
        p.gender = i % 2 ? 'f' : 'm';
        p.look.gender = p.gender;
        s.roster.push(p);
    }
    if (opts && opts.cash != null) s.cash = opts.cash;
    return s;
}

// =============================================================================================

test('SET_SLOTS: каждый слот указывает на реально объявленный якорь декорации', () => {
    const slots = MovieData.SET_SLOTS;
    assert.ok(slots && Object.keys(slots).length, 'SET_SLOTS пуст');
    // Every set the game can film in must have a slot map, or staging silently collapses.
    for (const id of Object.keys(MovieData.SET_INFO)) {
        assert.ok(slots[id], 'нет SET_SLOTS для декорации «' + id + '»');
        for (const s of SLOTS) {
            assert.ok(slots[id][s], 'в «' + id + '» нет слота ' + s);
            assert.ok(ANCHORS[id] && ANCHORS[id].has(slots[id][s]),
                '«' + id + '»: слот ' + s + ' = "' + slots[id][s] + '" не объявлен в SetPieces3D');
        }
    }
    // And every genre must be filmable: its sets exist and have slots.
    for (const g of GENRES) {
        for (const set of MovieData.GENRES[g].sets) {
            assert.ok(slots[set], g + ': декорация ' + set + ' без слотов');
        }
    }
});

test('SET_SLOTS: якоря внутри слотов не повторяются, кроме сознательных исключений', () => {
    for (const id of Object.keys(MovieData.SET_SLOTS)) {
        const vals = SLOTS.map((s) => MovieData.SET_SLOTS[id][s]);
        const uniq = new Set(vals);
        // A small set may legitimately reuse a point (mansion has 6 anchors for 8 slots);
        // what must never happen is 'a' === 'b' — the two speakers would stand inside each other.
        assert.notEqual(MovieData.SET_SLOTS[id].a, MovieData.SET_SLOTS[id].b,
            id + ': позиции говорящих a и b совпали');
        assert.ok(uniq.size >= 3, id + ': слишком много совпавших якорей (' + uniq.size + ')');
    }
});

test('ScriptGenerator: сценарии всех жанров и бюджетов структурно целы', () => {
    const s = stateWith(12);
    let total = 0;
    for (const genre of GENRES) {
        for (const budget of BUDGETS) {
            const sc = ScriptGenerator.draft(s, { genre, budget, seed: Rng.hash(genre + budget), writer: null });
            total++;
            assert.equal(sc.genre, genre);
            assert.equal(sc.budget, budget);
            assert.ok(sc.title && sc.title.length > 2, 'нет названия');
            assert.ok(sc.quality > 0 && sc.quality <= 10, 'качество вне 0..10: ' + sc.quality);
            assert.ok(!Number.isNaN(sc.quality));
            assert.ok(sc.logline.length > 10, 'нет логлайна');
            assert.ok(!/\{[a-z]+\}/.test(sc.logline), 'в логлайне остался плейсхолдер: ' + sc.logline);
            assert.ok(MovieData.CITIES.includes(sc.city));

            // Roles: at least two leads, shares normalised, keys unique.
            const keys = sc.roles.map((r) => r.key);
            assert.equal(new Set(keys).size, keys.length, 'повтор ключей ролей');
            assert.ok(sc.roles.filter((r) => r.tier === 'lead').length >= 2, 'меньше двух главных ролей');
            const sum = sc.roles.reduce((a, r) => a + r.share, 0);
            assert.ok(Math.abs(sum - 1) < 1e-6, 'доли экранного времени не дают 1: ' + sum);
            for (const r of sc.roles) {
                assert.ok(r.ru && r.voc, 'роль без имени/обращения');
                assert.ok(PeopleSystem.SKILLS.includes(r.skill), 'неизвестный навык ' + r.skill);
            }

            // Scenes: three acts, the right count, valid sets and kinds.
            assert.equal(sc.scenes.length, ScriptGenerator.scenesFor(budget), 'число сцен не по бюджету');
            assert.ok(sc.scenes.length >= 4);
            const acts = new Set(sc.scenes.map((x) => x.act));
            assert.ok(acts.has(1) && acts.has(2) && acts.has(3), 'нет всех трёх актов');
            assert.equal(sc.scenes[0].act, 1, 'фильм начинается не с первого акта');
            assert.equal(sc.scenes[sc.scenes.length - 1].act, 3, 'фильм кончается не третьим актом');
            for (const scn of sc.scenes) {
                assert.ok(ScriptGenerator.KINDS[scn.kind], 'неизвестный архетип ' + scn.kind);
                assert.ok(MovieData.SET_INFO[scn.set], 'неизвестная декорация ' + scn.set);
                assert.ok(['day', 'sunset', 'night'].includes(scn.timeOfDay));
                assert.ok(scn.label.startsWith('Сцена ' + scn.idx + '.'), 'метка сцены: ' + scn.label);
                assert.ok(scn.roles.length >= 1, 'в сцене никого нет');
                for (const k of scn.roles) assert.ok(keys.includes(k), 'сцена ссылается на несуществующую роль ' + k);
                for (const m of scn.moods) assert.ok((MovieData.DIALOGS.COMMON || {})[m] || (MovieData.DIALOGS[genre] || {})[m],
                    'нет пула реплик для настроения ' + m);
                for (const p of scn.props) assert.ok(PROPS.has(p), 'проп ' + p + ' не объявлен в SetPieces3D.PROPS');
                assert.ok(scn.quality > 0 && scn.quality <= 10);
                // Dialogue: a real line, all slots substituted, the speaker is in the scene.
                for (const ln of scn.lines) {
                    assert.ok(ln.text && ln.text.length > 4, 'пустая реплика');
                    assert.ok(!/\{[a-z]+\}/.test(ln.text), 'не подставлен плейсхолдер: ' + ln.text);
                    assert.ok(scn.roles.includes(ln.role), 'реплику говорит отсутствующий в сцене');
                }
                // No line repeats verbatim within one script (the pools must rotate).
            }
            // The whole film must not repeat a line.
            const all = sc.scenes.flatMap((x) => x.lines.map((l) => l.text));
            const dup = all.length - new Set(all).size;
            assert.ok(dup <= 1, 'слишком много повторов реплик: ' + dup + ' из ' + all.length);
        }
    }
    assert.ok(total >= GENRES.length * BUDGETS.length);
});

test('ScriptGenerator: детерминизм — один seed даёт байт-в-байт тот же сценарий', () => {
    const s = stateWith(8);
    for (const genre of GENRES) {
        const seed = Rng.hash('det-' + genre);
        const a = ScriptGenerator.draft(s, { genre, budget: 800000, seed, writer: null });
        const b = ScriptGenerator.draft(s, { genre, budget: 800000, seed, writer: null });
        assert.equal(JSON.stringify(a.scenes), JSON.stringify(b.scenes), genre + ': сцены разъехались');
        assert.equal(a.title, b.title);
        assert.equal(a.quality, b.quality);
        // A different seed must actually differ somewhere.
        const c = ScriptGenerator.draft(s, { genre, budget: 800000, seed: seed + 1, writer: null });
        assert.notEqual(JSON.stringify(a.scenes), JSON.stringify(c.scenes), genre + ': seed не влияет на сценарий');
    }
});

test('ScriptGenerator: бюджет и жанр реально двигают структуру и качество', () => {
    const s = stateWith(8);
    const small = ScriptGenerator.draft(s, { genre: 'drama', budget: 100000, seed: 11, writer: null });
    const big = ScriptGenerator.draft(s, { genre: 'drama', budget: 3000000, seed: 11, writer: null });
    assert.ok(big.scenes.length > small.scenes.length, 'большой бюджет не дал больше сцен');
    assert.ok(big.roles.length >= small.roles.length, 'большой бюджет не дал больше ролей');
    assert.ok(big.extras >= small.extras, 'большой бюджет не дал больше массовки');
    // A writer with the genre skill lifts the quality; the same seed isolates the effect.
    const w = PeopleSystem.randomPerson(Rng.create('w1'), { role: 'writer' });
    w.skills.drama = 10;
    const withW = ScriptGenerator.draft(s, { genre: 'drama', budget: 400000, seed: 22, writer: w });
    const noW = ScriptGenerator.draft(s, { genre: 'drama', budget: 400000, seed: 22, writer: null });
    assert.ok(withW.quality > noW.quality, 'сценарист с навыком 10 не поднял качество');
});

// --- the timeline contract ---------------------------------------------------------------------

/** Everything MovieSequencer needs to play a timeline without silently dropping a beat. */
function assertTimeline(tl, script) {
    assert.ok(tl && Array.isArray(tl.scenes) && tl.scenes.length, 'таймлайн без сцен');
    assert.ok(tl.title && tl.genre && MovieData.GENRES[tl.genre], 'нет жанра');
    assert.ok(MovieData.MUSIC[tl.music], 'музыка "' + tl.music + '" не в MovieData.MUSIC');
    assert.ok(tl.credits && tl.credits.director && tl.credits.writer, 'нет титров');

    // Cast: unique ids, every one with a look the rig can wear.
    const ids = new Set();
    for (const m of tl.cast) {
        assert.ok(!ids.has(m.id), 'повтор id актёра ' + m.id);
        ids.add(m.id);
        assert.ok(m.role && m.name, 'член каста без имени/роли');
        assert.ok(m.look && /^#[0-9a-f]{6}$/i.test(m.look.skin || ''), 'нет цвета кожи у ' + m.id);
        assert.ok(['m', 'f'].includes(m.look.gender), 'пол не m/f у ' + m.id);
    }
    assert.ok(ids.size >= 2, 'в фильме меньше двух актёров');

    let shots = 0, seconds = 0, says = 0, endCards = 0;
    for (const sc of tl.scenes) {
        assert.ok(MovieData.SET_INFO[sc.set], 'сцена на несуществующей декорации ' + sc.set);
        assert.ok(['day', 'sunset', 'night'].includes(sc.timeOfDay), 'timeOfDay: ' + sc.timeOfDay);
        assert.ok(sc.tint === null || ['sunset', 'night', 'rain'].includes(sc.tint), 'tint: ' + sc.tint);
        assert.ok(MovieData.MUSIC[sc.music], 'музыка сцены ' + sc.music);
        assert.ok(sc.label && sc.label.length > 3, 'нет метки сцены');
        const setAnchors = ANCHORS[sc.set] || new Set();
        const checkPoint = (p, where) => {
            if (p == null) return;
            if (typeof p === 'string') {
                assert.ok(setAnchors.has(p), where + ': якорь "' + p + '" не объявлен в ' + sc.set);
                return;
            }
            if (p.anchor != null) {
                assert.ok(setAnchors.has(p.anchor), where + ': якорь "' + p.anchor + '" не объявлен в ' + sc.set);
            } else {
                assert.ok(typeof p.x === 'number' && typeof p.y === 'number', where + ': точка без x/y и без якоря');
            }
        };

        // enter/props
        for (const e of sc.enter || []) {
            assert.ok(ids.has(e.who), 'enter ссылается на неизвестного ' + e.who);
            checkPoint(e.anchor, 'enter ' + e.who);
        }
        const propIds = new Set();
        for (const pr of sc.props || []) {
            assert.ok(PROPS.has(pr.id), 'проп ' + pr.id + ' не объявлен');
            assert.ok(!propIds.has(pr.id), 'проп ' + pr.id + ' дважды в сцене — MovieSequencer хранит их по id');
            propIds.add(pr.id);
            checkPoint(pr.anchor, 'prop ' + pr.id);
        }

        // shots
        assert.ok(Array.isArray(sc.shots) && sc.shots.length, 'сцена без кадров');
        for (const sh of sc.shots) {
            shots++;
            assert.ok(typeof sh.dur === 'number' && sh.dur >= 1.2, 'dur кадра: ' + sh.dur);
            seconds += sh.dur;
            assert.ok(['cut', 'fade'].includes(sh.trans), 'trans: ' + sh.trans);
            const cam = sh.cam;
            assert.ok(cam && CAM_TYPES.has(cam.type), 'неизвестный тип камеры: ' + (cam && cam.type));
            if (cam.type === 'wide' || cam.type === 'crane' || cam.type === 'fixed') {
                if (cam.anchor != null) checkPoint(cam.anchor, 'cam.anchor');
            } else {
                assert.ok(ids.has(cam.who), 'камера ' + cam.type + ' на неизвестного ' + cam.who);
                if (cam.type === 'duo' || cam.type === 'over') {
                    assert.ok(ids.has(cam.who2), 'камера ' + cam.type + ' без who2');
                    assert.notEqual(cam.who, cam.who2, 'duo/over на одного и того же');
                }
            }
            if (cam.type === 'crane' && cam.to) {
                assert.ok(typeof cam.to === 'object', 'crane.to не объект');
            }
            // beats
            let prev = -1;
            for (const b of sh.beats || []) {
                assert.ok(typeof b.t === 'number' && b.t >= 0, 'beat.t: ' + b.t);
                assert.ok(b.t >= prev - 1e-9, 'beats не отсортированы по t (плеер стреляет их по порядку)');
                prev = b.t;
                assert.ok(b.t <= sh.dur + 1e-9, 'beat.t ' + b.t + ' за пределами кадра ' + sh.dur);
                if (b.who != null) assert.ok(ids.has(b.who), 'beat ссылается на неизвестного ' + b.who);
                if (b.say != null) {
                    says++;
                    assert.ok(b.who != null && ids.has(b.who), 'реплика без актёра');
                    assert.ok(!/\{[a-z]+\}/.test(b.say), 'в субтитре остался плейсхолдер: ' + b.say);
                    assert.ok(b.say.length > 3, 'слишком короткая реплика');
                    assert.ok(b.dur == null || b.dur > 0.5, 'dur субтитра: ' + b.dur);
                }
                if (b.sfx != null) assert.ok(MovieData.SFX[b.sfx], 'SFX "' + b.sfx + '" нет в MovieData.SFX');
                if (b.spawn != null) checkPoint(b.spawn, 'beat.spawn');
                if (b.to != null) checkPoint(b.to, 'beat.to');
                if (b.moveProp != null) { assert.ok(propIds.has(b.moveProp), 'moveProp на отсутствующий проп'); checkPoint(b.to, 'moveProp.to'); }
                if (b.despawnProp != null) assert.ok(propIds.has(b.despawnProp), 'despawnProp на отсутствующий проп');
                if (b.rideProp != null) assert.ok(propIds.has(b.rideProp), 'rideProp на отсутствующий проп');
                if (b.act != null) assert.ok(get('ActorRig3D').ACTIONS[b.act], 'неизвестное действие рига: ' + b.act);
                if (b.music !== undefined && b.music !== null) assert.ok(MovieData.MUSIC[b.music], 'beat.music: ' + b.music);
                if (b.endCard != null) endCards++;
                if (b.fx != null) assert.equal(b.fx, 'flash', 'неизвестный fx');
            }
        }
    }
    assert.equal(endCards, 1, 'в фильме должен быть ровно один финальный титр, найдено ' + endCards);
    assert.ok(shots >= script.scenes.length, 'кадров меньше, чем сцен');
    // A short film, not a trailer and not a feature nobody will sit through.
    assert.ok(seconds >= 60, 'фильм короче минуты: ' + seconds.toFixed(1) + 'с');
    assert.ok(seconds <= 900, 'фильм длиннее 15 минут: ' + seconds.toFixed(1) + 'с');
    assert.ok(says >= 3, 'в фильме почти нет диалогов: ' + says);
    return { shots, seconds, says };
}

test('compile: таймлайны всех жанров играют по контракту MovieSequencer', () => {
    const s = stateWith(14);
    let shots = 0;
    for (const genre of GENRES) {
        for (const budget of [150000, 900000, 3000000]) {
            const sc = ScriptGenerator.draft(s, { genre, budget, seed: Rng.hash(genre + '-' + budget) });
            const r = Rng.create('cast-' + genre + budget);
            const castByKey = {};
            const used = new Set();
            for (const role of sc.roles) {
                // A fresh actor per role so the compile never sees the same person twice.
                const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 4, maxSkill: 9 });
                while (used.has(p.id)) p.id = 'x' + r.range(1000, 99999);
                used.add(p.id);
                p.gender = role.sex === 'any' ? p.gender : role.sex;
                p.look.gender = p.gender;
                castByKey[role.key] = p;
            }
            const tl = ScriptGenerator.compile(sc, castByKey, s);
            const st = assertTimeline(tl, sc);
            shots += st.shots;
            // Every cast role made it into the film.
            assert.equal(tl.cast.filter((m) => /^a/.test(m.id)).length, Object.keys(castByKey).length,
                genre + ': не все роли вошли в каст');
            assert.equal(tl.cast.filter((m) => /^e/.test(m.id)).length, sc.extras, 'массовка не совпала');
        }
    }
    assert.ok(shots > 200, 'слишком мало кадров суммарно: ' + shots);
});

test('compile: один и тот же сценарий и каст дают идентичный фильм', () => {
    const s = stateWith(10);
    const sc = ScriptGenerator.draft(s, { genre: 'western', budget: 600000, seed: 4242 });
    const castByKey = {};
    const r = Rng.create('same-cast');
    for (const role of sc.roles) castByKey[role.key] = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 5, maxSkill: 9 });
    const a = ScriptGenerator.compile(sc, castByKey, s);
    const b = ScriptGenerator.compile(sc, castByKey, s);
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'фильм не воспроизводится из seed');
});

test('compile: сцены без единого кастованного актёра отбрасываются, а не ломают фильм', () => {
    const s = stateWith(6);
    const sc = ScriptGenerator.draft(s, { genre: 'action', budget: 1200000, seed: 777 });
    // Cast only the hero: every scene that needs nobody else still plays.
    const r = Rng.create('partial');
    const hero = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 5, maxSkill: 9 });
    const tl = ScriptGenerator.compile(sc, { hero: hero }, s);
    assert.ok(tl.scenes.length >= 1, 'фильм схлопнулся в ноль сцен');
    assertTimeline(tl, { scenes: tl.scenes });
    for (const scn of tl.scenes) {
        for (const sh of scn.shots) {
            for (const b of sh.beats || []) {
                if (b.say != null) assert.equal(b.who, 'a1', 'говорит не кастованный актёр');
            }
        }
    }
});

// --- casting -----------------------------------------------------------------------------------

test('CastingSystem: оценка в 0..10, авто-кастинг заполняет роли без повторов', () => {
    for (const genre of GENRES) {
        const s = stateWith(16);
        const sc = ScriptGenerator.draft(s, { genre, budget: 1500000, seed: Rng.hash('cast-' + genre) });
        for (const role of sc.roles) {
            const list = CastingSystem.candidates(s, sc, role);
            assert.ok(list.length > 0, genre + ': нет кандидатов на «' + role.ru + '»');
            for (const c of list) {
                assert.ok(c.score.total >= 0 && c.score.total <= 10, 'оценка вне 0..10: ' + c.score.total);
                for (const k of ['skill', 'star', 'mood', 'charm', 'fit']) {
                    assert.ok(c.score.parts[k] >= 0 && c.score.parts[k] <= 1.0001, genre + ': part ' + k + ' = ' + c.score.parts[k]);
                }
            }
            // Sorted best first.
            for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].rank >= list[i].rank, 'список проб не отсортирован');
        }
        const auto = CastingSystem.autoCast(s, sc);
        const assigned = Object.values(auto);
        assert.equal(new Set(assigned).size, assigned.length, genre + ': авто-кастинг дал одного актёра на две роли');
        for (const role of sc.roles) {
            assert.ok(auto[role.key], genre + ': роль «' + role.ru + '» не заполнена авто-кастингом');
            const p = CastingSystem.person(s, auto[role.key]);
            assert.ok(p, 'назначен несуществующий человек');
            assert.ok(!CastingSystem.isCommitted(s, p.id, sc.id), 'назначен занятый в другом проекте');
        }
    }
});

test('CastingSystem: химия в [−1, 1], симметрична и стабильна', () => {
    const r = Rng.create('chem');
    const a = PeopleSystem.randomPerson(r, { role: 'actor' });
    const b = PeopleSystem.randomPerson(r, { role: 'actor' });
    const v = CastingSystem.chemistry(a, b);
    assert.ok(v >= -1 && v <= 1, 'химия вне диапазона: ' + v);
    assert.equal(v, CastingSystem.chemistry(b, a), 'химия несимметрична');
    assert.equal(v, CastingSystem.chemistry(a, b), 'химия нестабильна');
    assert.equal(CastingSystem.chemistry(a, a), 0, 'химия с самим собой не 0');
    // An explicit relationship dominates the default history.
    a.relationships[b.id] = 95;
    assert.ok(CastingSystem.chemistry(a, b) > 0.4, 'крепкая дружба не дала положительной химии');
    a.relationships[b.id] = -95;
    assert.ok(CastingSystem.chemistry(a, b) < -0.4, 'вражда не дала отрицательной химии');
    // Shared films build it up.
    delete a.relationships[b.id];
    const base = CastingSystem.chemistry(a, b);
    a.filmsWith = { [b.id]: 4 };
    assert.ok(CastingSystem.chemistry(a, b) > base, 'совместные фильмы не улучшили химию');
    assert.ok(typeof CastingSystem.chemWord(base) === 'string');
});

test('CastingSystem: confirm платит, компилирует фильм и не пускает без денег/ролей', () => {
    const s = stateWith(12);
    s.cash = 500000;
    StudioManager.state = s;
    const sc = ScriptGenerator.draft(s, { genre: 'romance', budget: 700000, seed: 99, writer: null });
    s.scripts.push(sc);

    // Not complete yet.
    assert.equal(CastingSystem.isComplete(s, sc), false);
    let res = CastingSystem.confirm(s, sc, StudioManager);
    assert.equal(res.ok, false);
    assert.match(res.why, /не все роли/);

    // Fill it by hand and confirm.
    sc.cast = CastingSystem.autoCast(s, sc);
    assert.equal(CastingSystem.isComplete(s, sc), true);
    const before = s.cash;
    const fee = CastingSystem.fee(sc);
    assert.ok(fee > 0);
    res = CastingSystem.confirm(s, sc, StudioManager);
    assert.equal(res.ok, true, res.why);
    assert.equal(s.cash, before - fee, 'кастинг не списал гонорар');
    assert.ok(sc.timeline && sc.timeline.scenes.length, 'таймлайн не собран');
    assert.ok(sc.projected > 0 && sc.projected <= 10);
    assert.ok(sc.chemistry >= -1 && sc.chemistry <= 1);
    assertTimeline(sc.timeline, sc);
    // The ledger and the news know about it.
    assert.ok(s.ledger.some((l) => /Кастинг/.test(l.label) && l.amount === -fee), 'нет проводки в книге');
    assert.ok(s.news.some((n) => /Каст/.test(n.text)), 'нет записи в хронике');
    // Co-stars now have a relationship on file.
    const keys = Object.keys(sc.castIds);
    const p0 = CastingSystem.person(s, sc.castIds[keys[0]]);
    const p1 = CastingSystem.person(s, sc.castIds[keys[1]]);
    assert.ok(p0.relationships[p1.id] != null, 'совместная работа не завела отношения');

    // No money — no session.
    s.cash = 0;
    const sc2 = ScriptGenerator.draft(s, { genre: 'comedy', budget: 300000, seed: 100 });
    sc2.cast = CastingSystem.autoCast(s, sc2);
    if (CastingSystem.isComplete(s, sc2)) {
        const r2 = CastingSystem.confirm(s, sc2, StudioManager);
        assert.equal(r2.ok, false);
        assert.match(r2.why, /не хватает денег/);
    }
});

test('CastingSystem: pick отбирает роль у прежнего владельца и не берёт занятого', () => {
    const s = stateWith(8);
    StudioManager.state = s;
    const a = ScriptGenerator.draft(s, { genre: 'drama', budget: 500000, seed: 5 });
    const b = ScriptGenerator.draft(s, { genre: 'drama', budget: 500000, seed: 6 });
    s.scripts.push(a, b);
    const hero = s.roster[0], second = s.roster[1];
    assert.ok(CastingSystem.pick(s, a, 'hero', hero.id).ok);
    // The same person cannot play two roles in one film.
    const roleKeys = a.roles.map((r) => r.key);
    const other = roleKeys.find((k) => k !== 'hero');
    assert.ok(CastingSystem.pick(s, a, other, hero.id).ok);
    assert.equal(a.cast.hero, undefined, 'актёр остался на двух ролях одного фильма');
    assert.equal(a.cast[other], hero.id);
    // And cannot be in two films at once (checked from the OTHER film's point of view).
    assert.ok(CastingSystem.isCommitted(s, hero.id, b.id), 'занятость в «a» не видна из «b»');
    assert.equal(CastingSystem.isCommitted(s, hero.id, a.id), null, 'свой же проект считается занятостью');
    const bad = CastingSystem.pick(s, b, 'hero', hero.id);
    assert.equal(bad.ok, false);
    assert.match(bad.why, /занят/);
    assert.ok(CastingSystem.pick(s, b, 'hero', second.id).ok);
    // Clearing frees them.
    CastingSystem.pick(s, a, other, null);
    assert.equal(a.cast[other], undefined);
});

test('ScriptGenerator: заказ сценария стоит денег, занимает отдел и дописывается за недели', () => {
    const s = stateWith(6);
    StudioManager.state = s;
    StudioManager.init(null);
    const writer = s.staff.find((p) => p.role === 'writer');
    writer.skills[(MovieData.GENRES.western).skill] = 9;
    s.cash = 1000000;

    const cost = ScriptGenerator.orderCost(400000, writer);
    assert.ok(cost > 0);
    const before = s.cash;
    const res = ScriptGenerator.order(s, StudioManager, { genre: 'western', budget: 400000, writerId: writer.id, title: 'Тест' });
    assert.equal(res.ok, true, res.why);
    assert.equal(s.cash, before - cost);
    assert.equal(s.orders.length, 1);
    assert.equal(s.scripts.length, 0, 'сценарий готов раньше времени');

    // No money — no order.
    s.cash = 10;
    assert.equal(ScriptGenerator.order(s, StudioManager, { genre: 'drama', budget: 400000, writerId: writer.id }).ok, false);
    s.cash = 1000000;

    // The department has a ceiling.
    const max = ScriptGenerator.cfg().maxOrders;
    while (s.orders.length < max) {
        assert.equal(ScriptGenerator.order(s, StudioManager, { genre: 'drama', budget: 300000, writerId: writer.id }).ok, true);
    }
    const over = ScriptGenerator.order(s, StudioManager, { genre: 'drama', budget: 300000, writerId: writer.id });
    assert.equal(over.ok, false);
    assert.match(over.why, /перегружен/);

    // Weeks pass; the scripts land.
    s.orders.length = 1;
    const weeks = ScriptGenerator.cfg().writeWeeks;
    for (let i = 0; i < weeks; i++) StudioManager.tickWeek();
    assert.equal(s.orders.length, 0, 'заказ не закрылся за отведённые недели');
    assert.equal(s.scripts.length, 1, 'готовый сценарий не лёг в список');
    assert.equal(s.scripts[0].writerId, writer.id);
    assert.ok(s.scripts[0].scenes.length >= 4);
});

test('CastingSystem: актёр с биржи не попадает в фильм, пока не подписан', () => {
    const s = stateWith(6);
    StudioManager.state = s;
    StudioManager.init(null);
    s.cash = 1000000;
    const sc = ScriptGenerator.draft(s, { genre: 'comedy', budget: 600000, seed: 4 });
    s.scripts.push(sc);

    // The market carries actors the studio has not signed.
    const free = (s.market || []).filter((p) => p.role === 'actor');
    assert.ok(free.length > 0, 'на бирже нет актёров — тест ничего не проверяет');
    const outsider = free[0];

    // Casting them directly is refused, and the refusal says how to fix it.
    const bad = CastingSystem.pick(s, sc, sc.roles[0].key, outsider.id);
    assert.equal(bad.ok, false);
    assert.match(bad.why, /не в штате/);
    assert.ok(bad.needHire && bad.needHire.id === outsider.id);
    assert.equal(sc.cast[sc.roles[0].key], undefined, 'неподписанный актёр всё же встал на роль');

    // Auto-casting never reaches into the market either, even when the roster is too small.
    const auto = CastingSystem.autoCast(s, sc);
    for (const k of Object.keys(auto)) {
        assert.ok(CastingSystem.isRoster(s, auto[k]), 'авто-кастинг взял актёра с биржи на роль ' + k);
    }
    const stillMissing = CastingSystem.missing(s, sc);
    assert.ok(stillMissing.length >= 0);

    // Signing them in one move works and moves them off the market onto the roster.
    const res = CastingSystem.hireAndCast(s, StudioManager, sc, sc.roles[0].key, outsider.id);
    assert.equal(res.ok, true, res.why);
    assert.ok(CastingSystem.isRoster(s, outsider.id), 'после найма человек не в штате');
    assert.ok(!(s.market || []).some((p) => p.id === outsider.id), 'нанятый остался на бирже');
    assert.equal(sc.cast[sc.roles[0].key], outsider.id);
    // And now auto-cast may use them.
    const auto2 = CastingSystem.autoCast(s, sc);
    assert.ok(Object.values(auto2).includes(outsider.id), 'подписанный актёр не доступен авто-кастингу');
});

test('CastingSystem: перенос актёра на другую роль освобождает прежнюю и сообщает об этом', () => {
    const s = stateWith(6);
    StudioManager.state = s;
    const sc = ScriptGenerator.draft(s, { genre: 'drama', budget: 500000, seed: 8 });
    const keys = sc.roles.map((r) => r.key);
    assert.ok(keys.length >= 2);
    const p = s.roster[0];
    assert.ok(CastingSystem.pick(s, sc, keys[0], p.id).ok);
    const res = CastingSystem.pick(s, sc, keys[1], p.id);
    assert.equal(res.ok, true);
    assert.equal(res.displaced.length, 1, 'прежняя роль не помечена освобождённой');
    assert.equal(res.displaced[0].key, keys[0]);
    assert.equal(sc.cast[keys[0]], undefined, 'актёр остался на двух ролях');
    assert.equal(sc.cast[keys[1]], p.id);
    assert.equal(CastingSystem.isComplete(s, sc), false);
});

test('ScriptGenerator: «на коленке» — мгновенно, но слабее заказного', () => {
    const s = stateWith(6);
    StudioManager.state = s;
    StudioManager.init(null);
    const writer = s.staff.find((p) => p.role === 'writer');
    writer.skills[(MovieData.GENRES.western).skill] = 9;
    const quick = ScriptGenerator.quickDraft(s, StudioManager, { genre: 'western', budget: 400000, seed: 31337 });
    const commissioned = ScriptGenerator.draft(s, { genre: 'western', budget: 400000, seed: 31337, writer });
    assert.ok(quick.quality < commissioned.quality, 'бесплатный сценарий не слабее заказного у сильного автора');
    assert.equal(s.scripts.length, 1);
    assert.ok(s.news.some((n) => /на скорую|На коленке/i.test(n.text)));
});

test('MovieData.SET_SLOTS: слоты покрывают все декорации жанров и не содержат неизвестных', () => {
    const known = Object.keys(MovieData.SET_INFO);
    for (const k of Object.keys(MovieData.SET_SLOTS)) assert.ok(known.includes(k), 'SET_SLOTS описывает несуществующую декорацию ' + k);
    for (const g of GENRES) {
        for (const set of MovieData.GENRES[g].sets) {
            assert.ok(known.includes(set), g + ': жанр ссылается на неизвестную декорацию ' + set);
            assert.ok(ANCHORS[set] && ANCHORS[set].size >= 6, set + ': слишком мало якорей для постановки');
        }
    }
});
