// «Фабрика Грёз»: оптика кадра без движка. Линзовая таблица (MovieData.lensMm/lensFov/fovFor),
// риг-солвер ScriptGenerator (K(fov), посадка камеры ровно на spot, кламп стекла по комнате),
// планы DoF (CinePost3D.dofFor) и бюджет теней по крупности плана (MovieSequencer.shadowPlanFor).
//
//  1) Линзы: 24 мм широкий, 50 мм средний, 85 мм портрет — FOV честный и монотонный.
//  2) rigK(52°) ≈ 738, rigK(40°) ≈ 989 (наследие RIG_K), K монотонно падает с ростом fov.
//  3) _rig сажает камеру ровно на spot: dist·zoom ≈ K(fov); zoom в границах; fov не уже
//     запрошенной линзы, а в тесной комнате стекло расширяется ровно до зум-пола.
//  4) Скомпилированные таймлайны всех жанров: у каждого кадра валидные fov/zoom,
//     крупные планы на улице несут портретное стекло (fov ≈ 16.7°), детерминизм сохранён.
//  5) dofFor: крупный план — узкая резкая зона + near blur, средний — шире, общий — глубокий фокус.
//  6) shadowPlanFor: крупный план → 4096, общий → 1024; мобильные — потолок 2048 без PCSS;
//     низкий пресет — без PCSS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js', 'js/ActorModels.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js',
    'js/CinePost3D.js', 'js/MovieSequencer.js',
]);
const get = page.get;
const MovieData = get('MovieData');
const ScriptGenerator = get('ScriptGenerator');
const StudioManager = get('StudioManager');
const PeopleSystem = get('PeopleSystem');
const Rng = get('Rng');
const CinePost3D = get('CinePost3D');
const MovieSequencer = get('MovieSequencer');

const GENRES = ['western', 'comedy', 'drama', 'action', 'horror', 'scifi', 'romance', 'noir', 'war', 'adventure', 'musical'];

function stateWith(nActors) {
    const s = StudioManager.newGame('Тест-Студия');
    const r = Rng.create('optics-cast-' + nActors);
    s.roster.length = 0;
    for (let i = 0; i < nActors; i++) {
        const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 3, maxSkill: 9 });
        p.age = 20 + (i * 7) % 45;
        p.gender = i % 2 ? 'f' : 'm';
        p.look.gender = p.gender;
        s.roster.push(p);
    }
    return s;
}

test('линзы: таблица покрывает каждый тип кадра, FOV честный и монотонный', () => {
    for (const t of ['wide', 'crane', 'medium', 'fixed', 'duo', 'over', 'close', 'dutch', 'low']) {
        const mm = MovieData.lensMm(t);
        assert.ok(mm >= 10 && mm <= 150, t + ': фокусное ' + mm + ' вне разумных границ');
        const fov = MovieData.fovFor(t);
        assert.ok(fov > 8 && fov < 110, t + ': fov ' + fov + ' вне 8..110');
    }
    // The classic ladder: the longer the glass, the narrower the angle.
    assert.ok(MovieData.fovFor('wide') > MovieData.fovFor('low'), '24 мм шире 28 мм');
    assert.ok(MovieData.fovFor('low') > MovieData.fovFor('duo'), '28 мм шире 40 мм');
    assert.ok(MovieData.fovFor('duo') > MovieData.fovFor('medium'), '40 мм шире 50 мм');
    assert.ok(MovieData.fovFor('medium') > MovieData.fovFor('close'), '50 мм шире 85 мм');
    // Super35 gate: 24 мм ≈ 54.8°, 85 мм ≈ 16.7°.
    assert.ok(Math.abs(MovieData.lensFov(24) - 54.8) < 1, '24 мм: ' + MovieData.lensFov(24));
    assert.ok(Math.abs(MovieData.lensFov(85) - 16.7) < 0.6, '85 мм: ' + MovieData.lensFov(85));
    // Degenerate input stays finite.
    for (const mm of [0, -5, NaN, null, undefined]) {
        assert.ok(Number.isFinite(MovieData.lensFov(mm)), 'lensFov(' + mm + ') обязан быть конечным');
    }
    assert.equal(MovieData.lensMm('nonsense'), MovieData.lensMm('medium'), 'неизвестный тип — стандартное стекло');
});

test('planSize: каждый тег кадра попадает в свой класс крупности', () => {
    assert.equal(MovieData.planSize('close'), 'close');
    assert.equal(MovieData.planSize('dutch'), 'close');
    for (const t of ['medium', 'duo', 'over', 'low']) assert.equal(MovieData.planSize(t), 'mid', t);
    for (const t of ['wide', 'crane', 'fixed']) assert.equal(MovieData.planSize(t), 'wide', t);
    assert.equal(MovieData.planSize(null), 'mid', 'без тега — средний класс');
});

test('rigK: K(52°) ≈ 738, K(40°) ≈ 989, K монотонно падает с ростом угла', () => {
    assert.ok(Math.abs(ScriptGenerator.rigK(52) - 738) < 3, 'K(52) = ' + ScriptGenerator.rigK(52));
    assert.ok(Math.abs(ScriptGenerator.rigK(40) - 989) < 4, 'K(40) = ' + ScriptGenerator.rigK(40));
    assert.ok(Math.abs(ScriptGenerator.rigK(MovieData.fovFor('close')) - 2457) < 20, 'K(85 мм) = ' + ScriptGenerator.rigK(16.67));
    let prev = ScriptGenerator.rigK(10);
    for (let fov = 20; fov <= 100; fov += 5) {
        const k = ScriptGenerator.rigK(fov);
        assert.ok(k < prev, 'K не падает на ' + fov + '°');
        prev = k;
    }
});

test('_rig: камера садится ровно на spot, fov не уже линзы, zoom в границах', () => {
    const cases = [
        { look: [0, 0, 150], spot: [0, 105, 152], fov: 16.7, zoom: 9, name: 'интерьерный крупный (тесно)' },
        { look: [0, 0, 150], spot: [0, 534, 152], fov: 16.7, zoom: 4.6, name: 'уличный крупный 85 мм' },
        { look: [0, 0, 128], spot: [0, 195, 150], fov: 28, zoom: 3.8, name: 'интерьерный средний' },
        { look: [0, 0, 128], spot: [0, 463, 150], fov: 28, zoom: 3.1, name: 'уличный средний 50 мм' },
        { look: [0, 0, 70], spot: [0, 150, 330], fov: 54.8, zoom: 2.2, name: 'кукольный мастер' },
    ];
    for (const c of cases) {
        const cam = ScriptGenerator._rig(c.look, c.spot, { fov: c.fov, zoom: c.zoom });
        assert.equal(cam.type, 'fixed', c.name + ': тип');
        // The solved pose must land the eye back on the spot: dist·zoom ≈ K(fov) на 720-кадре.
        // dist repeats the solver's own measure: from the look-at point to the spot.
        const dx = c.look[0] - c.spot[0], dy = c.look[1] - c.spot[1];
        const hd = Math.max(24, Math.hypot(dx, dy));
        const vd = (c.spot[2] != null ? c.spot[2] : 140) - c.look[2];
        const dist = Math.max(40, Math.hypot(hd, vd));
        const k = ScriptGenerator.rigK(cam.fov);
        assert.ok(Math.abs(dist * cam.zoom - k) / k < 0.06,
            c.name + ': камера ушла со spot — dist·zoom ' + (dist * cam.zoom).toFixed(1) + ' vs K ' + k.toFixed(1));
        assert.ok(cam.zoom >= 1.05 && cam.zoom <= 30, c.name + ': zoom ' + cam.zoom + ' вне границ');
        assert.ok(cam.fov >= c.fov - 0.001, c.name + ': стекло уже запрошенной линзы (' + cam.fov + ' < ' + c.fov + ')');
        assert.ok(Number.isFinite(cam.az) && Number.isFinite(cam.pitch), c.name + ': углы конечны');
    }
    // A tight room widens the glass: at 105 px an 85 mm cannot hold zoom ≤ 9 — the floor kicks in.
    const tight = ScriptGenerator._rig([0, 0, 150], [0, 105, 152], { fov: 16.7, zoom: 9 });
    assert.ok(tight.fov > 40, 'в тесной комнате стекло обязано расшириться: ' + tight.fov);
    assert.ok(tight.zoom <= 9.01, 'кламп зума в интерьере: ' + tight.zoom);
});

test('compile: каждый кадр несет валидные fov/zoom, уличные крупные — портретное стекло', () => {
    const s = stateWith(14);
    let shots = 0, portraits = 0;
    for (const genre of GENRES) {
        const sc = ScriptGenerator.draft(s, { genre, budget: 900000, seed: Rng.hash('optics-' + genre) });
        const r = Rng.create('cast-optics-' + genre);
        const castByKey = {};
        const used = new Set();
        for (const role of sc.roles) {
            const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 4, maxSkill: 9 });
            while (used.has(p.id)) p.id = 'x' + r.range(1000, 99999);
            used.add(p.id);
            p.gender = role.sex === 'any' ? p.gender : role.sex;
            p.look.gender = p.gender;
            castByKey[role.key] = p;
        }
        const tl = ScriptGenerator.compile(sc, castByKey, s);
        for (const scn of tl.scenes) {
            const indoor = !!(MovieData.SET_INFO[scn.set] || {}).indoor;
            for (const sh of scn.shots || []) {
                shots++;
                const cam = sh.cam || {};
                if (cam.fov != null) {
                    assert.ok(cam.fov >= 12 && cam.fov <= 110, genre + ': fov ' + cam.fov + ' вне 12..110');
                }
                if (cam.zoom != null) {
                    assert.ok(cam.zoom >= 0.5 && cam.zoom <= 30, genre + ': zoom ' + cam.zoom + ' вне границ');
                }
                if (cam.type === 'fixed') {
                    assert.equal(typeof cam.fov, 'number', genre + ': риг без fov');
                }
                // Outdoor close-ups ride the portrait lens: narrow glass, camera backed off.
                if (!indoor && (sh.tag === 'close' || sh.tag === 'dutch') && cam.type === 'fixed') {
                    if (cam.fov < 20) portraits++;
                }
            }
        }
    }
    assert.ok(shots > 300, 'мало кадров: ' + shots);
    assert.ok(portraits >= 10, 'уличные крупные планы не получили портретное стекло: ' + portraits);
});

test('compile детерминирован с новой оптикой: один seed — один фильм', () => {
    const s = stateWith(10);
    const sc = ScriptGenerator.draft(s, { genre: 'noir', budget: 700000, seed: 99 });
    const castByKey = {};
    const r = Rng.create('optics-same');
    for (const role of sc.roles) castByKey[role.key] = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 5, maxSkill: 9 });
    const a = ScriptGenerator.compile(sc, castByKey, s);
    const b = ScriptGenerator.compile(sc, castByKey, s);
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'фильм не воспроизводится из seed');
});

test('dofFor: крупный план узкий и с near blur, средний шире, общий — глубокий фокус', () => {
    const close = CinePost3D.dofFor('close');
    const mid = CinePost3D.dofFor('medium');
    const wide = CinePost3D.dofFor('wide');
    assert.ok(close.on && mid.on, 'крупный и средний планы с DoF');
    assert.equal(wide.on, false, 'общий план — глубокий фокус');
    assert.ok(close.range < mid.range, 'резкая зона крупного плана уже средней');
    assert.ok(close.near, 'крупный план блюрит и передний план');
    assert.ok(close.radius >= 2 && close.radius <= 10, 'радиус в диапазоне движка');
    // Dutch reads as a close-up, crane as a wide.
    assert.deepEqual(CinePost3D.dofFor('dutch'), close, 'dutch — тот же план');
    assert.deepEqual(CinePost3D.dofFor('crane'), wide, 'crane — тот же план');
    // Deterministic.
    assert.deepEqual(CinePost3D.dofFor('over'), CinePost3D.dofFor('over'), 'план стабилен между вызовами');
});

test('shadowPlanFor: карта теней по крупности плана, PCSS по пресету и устройству', () => {
    const close = MovieSequencer.shadowPlanFor('close', false, 3);
    const mid = MovieSequencer.shadowPlanFor('medium', false, 2);
    const wide = MovieSequencer.shadowPlanFor('wide', false, 2);
    assert.ok(close.map > mid.map && mid.map > wide.map, 'крупный план получает самую плотную карту');
    assert.equal(close.map, 4096, 'крупный план — 4096');
    assert.equal(wide.map, 1024, 'общий план — 1024');
    assert.ok(close.pcss && mid.pcss, 'PCSS на высоком пресете');
    const lowQ = MovieSequencer.shadowPlanFor('close', false, 1);
    assert.equal(lowQ.pcss, false, 'низкий пресет — без PCSS');
    const mob = MovieSequencer.shadowPlanFor('close', true, 3);
    assert.ok(mob.map <= 2048, 'мобильные: потолок карты 2048');
    assert.equal(mob.pcss, false, 'мобильные: без PCSS');
    const unknown = MovieSequencer.shadowPlanFor(null, false, 2);
    assert.equal(unknown.map, mid.map, 'неизвестный тег — средний класс');
});

test('color script: у каждого вида сцены своя доминирующая палитра, детерминированная', () => {
    const kinds = ['intro', 'meet', 'setup', 'threat', 'chase', 'fight', 'romance', 'reveal', 'comic', 'crisis', 'climax', 'coda'];
    const seen = new Set();
    for (const k of kinds) {
        const a = MovieData.accentFor(k);
        assert.equal(a.length, 3, k + ': три канала');
        assert.ok(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.12), k + ': акцент в разумных границах');
        seen.add(JSON.stringify(a));
    }
    assert.ok(seen.size >= 8, 'палитры видов различаются: ' + seen.size);
    assert.deepEqual([...MovieData.accentFor('nope')], [0, 0, 0], 'неизвестный вид — нейтрально');
    assert.equal(JSON.stringify(MovieData.accentFor('romance')), JSON.stringify(MovieData.accentFor('romance')), 'детерминизм');
    // The accent must actually move the baked LUT.
    const plain = CinePost3D.lutBytes(CinePost3D.styleFor('drama', 'era-clean', 'day', null));
    const rose = CinePost3D.lutBytes(CinePost3D.styleFor('drama', 'era-clean', 'day', MovieData.accentFor('romance')));
    let diff = 0;
    for (let i = 0; i < plain.length; i += 4) diff += Math.abs(plain[i] - rose[i]) + Math.abs(plain[i + 1] - rose[i + 1]) + Math.abs(plain[i + 2] - rose[i + 2]);
    assert.ok(diff > 500, 'акцент меняет LUT: суммарная дельта ' + diff);
});

test('правило третей: офсет перпендикулярен оси объектива и растёт с дистанцией', () => {
    for (const az of [0, 37, -90, 180]) {
        const a = MovieData.thirdsOffset(az, 300, 28, 1);
        const b = MovieData.thirdsOffset(az, 300, 28, -1);
        assert.equal(a.dx, -b.dx, 'стороны зеркальны');
        const dir = { x: Math.cos(az * Math.PI / 180), y: Math.sin(az * Math.PI / 180) };
        const dot = a.dx * dir.x + a.dy * dir.y;
        assert.ok(Math.abs(dot) < 1e-6, 'офсет перпендикулярен взгляду: ' + dot);
        const len = Math.hypot(a.dx, a.dy);
        const wide = Math.hypot(...Object.values(MovieData.thirdsOffset(az, 600, 28, 1)));
        assert.ok(wide > len * 1.9, 'дальше кадр — шире треть: ' + len + ' -> ' + wide);
    }
});

test('композиционный план: крупный план поднимает ключ и виньетку, общий копит дымку', () => {
    const close = MovieSequencer.compPlanFor('close');
    const mid = MovieSequencer.compPlanFor('medium');
    const wide = MovieSequencer.compPlanFor('wide');
    assert.ok(close.keyBoost > mid.keyBoost && mid.keyBoost > wide.keyBoost, 'ключ по крупности');
    assert.ok(close.vignette > wide.vignette, 'виньетка крупнее на крупных');
    assert.ok(wide.haze > close.haze, 'общие планы дышат воздухом');
    assert.ok(close.haze > 0 && close.haze <= 1, 'крупный план держит воздух чистым');
});
