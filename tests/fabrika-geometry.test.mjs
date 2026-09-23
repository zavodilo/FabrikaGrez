// «Фабрика Грёз»: геометрия без бликов. Z-fighting (мерцание «бликов») рождается там, где две
// поверхности лежат в одной плоскости и перекрываются, или где два предмета поставлены в одну
// точку. Здесь оба класса проверяются без движка: строители декораций гонятся на коллекторе
// частей (S.B/S.C/S.G/S.A), а расстановка сцены — на собранном таймлайне.
//
//  1) Ни одна декорация не содержит двух частей с одинаковым трансформом и размером.
//  2) Ни одна пара частей не имеет совпадающих граней (низ/верх/бока) с перекрытием по остальным
//     осям — это и есть копланарность, дающая мерцание.
//  3) В каждой сцене фильма актёры, массовка и реквизит стоят в РАЗНЫХ точках: ни одна пара
//     enter/props не совпадает по якорю и смещению.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './browser-scripts.mjs';

const page = loadScripts([
    'js/Constants.js', 'js/Rng.js', 'js/MovieData.js',
    'js/ActorRig3D.js', 'js/SetPieces3D.js',
    'js/PeopleSystem.js', 'js/StudioManager.js',
    'js/ScriptGenerator.js', 'js/CastingSystem.js',
]);
const get = page.get;
const SetPieces3D = get('SetPieces3D');
const MovieData = get('MovieData');
const ScriptGenerator = get('ScriptGenerator');
const PeopleSystem = get('PeopleSystem');
const StudioManager = get('StudioManager');
const Rng = get('Rng');

const EPS = 0.5;

/** The finalized boxes of a set — after the builder's de-flicker pass, as the eye sees them. */
function collect(setId) { return SetPieces3D.partsOf(setId); }

const overlap1 = (a1, a2, b1, b2) => Math.abs(a1 - b1) < (a2 + b2) - EPS;

/** Pairs of parts sharing a coplanar face with overlap on the other two axes. */
function coplanarPairs(parts) {
    const bad = [];
    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i], b = parts[j];
            // exact duplicate transform+size: the same surface drawn twice
            if (a.m === b.m && a.lx === b.lx && a.ly === b.ly && a.cz === b.cz &&
                a.hx === b.hx && a.hy === b.hy && a.hz === b.hz) {
                bad.push({ i, j, kind: 'duplicate' });
                continue;
            }
            // Bottom faces sit on the ground and face down: buried, never seen, never flicker.
            // Tops and vertical sides are the visible ones — coplanar + overlapping = z-fighting.
            const faces = [
                { same: Math.abs((a.cz + a.hz) - (b.cz + b.hz)), o1: overlap1(a.lx, a.hx, b.lx, b.hx), o2: overlap1(a.ly, a.hy, b.ly, b.hy), kind: 'top' },
                // vertical faces: same x-plane with y/z overlap, same y-plane with x/z overlap
                { same: Math.abs((a.lx - a.hx) - (b.lx - b.hx)), o1: overlap1(a.ly, a.hy, b.ly, b.hy), o2: overlap1(a.cz, a.hz, b.cz, b.hz), kind: 'side-x-' },
                { same: Math.abs((a.lx + a.hx) - (b.lx + b.hx)), o1: overlap1(a.ly, a.hy, b.ly, b.hy), o2: overlap1(a.cz, a.hz, b.cz, b.hz), kind: 'side-x+' },
                { same: Math.abs((a.ly - a.hy) - (b.ly - b.hy)), o1: overlap1(a.lx, a.hx, b.lx, b.hx), o2: overlap1(a.cz, a.hz, b.cz, b.hz), kind: 'side-y-' },
                { same: Math.abs((a.ly + a.hy) - (b.ly + b.hy)), o1: overlap1(a.lx, a.hx, b.lx, b.hx), o2: overlap1(a.cz, a.hz, b.cz, b.hz), kind: 'side-y+' },
            ];
            for (const f of faces) {
                if (f.same < EPS && f.o1 && f.o2) { bad.push({ i, j, kind: f.kind }); break; }
            }
        }
    }
    return bad;
}

test('декорации: ни дубликатов трансформов, ни копланарных граней с перекрытием', () => {
    const report = [];
    for (const setId of Object.keys(SetPieces3D.SETS)) {
        const { parts } = collect(setId);
        assert.ok(parts.length > 3, setId + ': декорация пустая');
        const bad = coplanarPairs(parts);
        for (const b of bad) {
            report.push(setId + ' ' + b.kind + ': #' + b.i + ' (' + parts[b.i].m + ' ' + parts[b.i].lx + ',' + parts[b.i].ly + ',' + parts[b.i].cz + ') и #' + b.j + ' (' + parts[b.j].m + ' ' + parts[b.j].lx + ',' + parts[b.j].ly + ',' + parts[b.j].cz + ')');
        }
    }
    assert.deepEqual(report, [], 'блики: совпадающие или копланарные поверхности:\n' + report.join('\n'));
});

test('расстановка сцены: актёры, массовка и реквизит не стоят в одной точке', () => {
    const s = StudioManager.newGame('Геометрия', 'sandbox');
    s.seed = 5; StudioManager.state = s; StudioManager.init(null);
    let clashes = [];
    for (const genre of Object.keys(MovieData.GENRES)) {
        for (const budget of [300000, 1200000]) {
            const sc = ScriptGenerator.draft(s, { genre, budget, seed: Rng.hash('geo-' + genre + budget) });
            const cast = {}; const r = Rng.create('geo-cast-' + genre);
            for (const role of sc.roles) cast[role.key] = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 5, maxSkill: 9 });
            const tl = ScriptGenerator.compile(sc, cast, s);
            for (const scn of tl.scenes) {
                const spots = [];
                const pointOf = (p) => {
                    if (p == null) return null;
                    if (typeof p === 'string') return p;
                    return (p.anchor || '?') + ':' + (p.dx || 0) + ',' + (p.dy || 0);
                };
                for (const e of scn.enter || []) spots.push(['actor ' + e.who, pointOf(e.anchor)]);
                for (const pr of scn.props || []) spots.push(['prop ' + pr.id, pointOf(pr.anchor)]);
                const seen = {};
                for (const [who, key] of spots) {
                    if (seen[key]) clashes.push(scn.label + ': ' + seen[key] + ' и ' + who + ' в одной точке ' + key);
                    seen[key] = who;
                }
            }
        }
    }
    assert.deepEqual(clashes, [], 'предметы в одной точке:\n' + clashes.join('\n'));
});
