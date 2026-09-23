// ============================================================================
//  «Фабрика Грёз» — gameplay verification gate (dev-only, needs puppeteer)
// ----------------------------------------------------------------------------
//  node tools/verify-gameplay.mjs            play the whole loop headlessly
//  node tools/verify-gameplay.mjs --shots=DIR  + screenshots of every step
//
//  Why this exists: the logic tests (tests/*.test.mjs) prove the DATA is well
//  formed, but only a real browser proves the game PLAYS — that a click on a
//  data-act node reaches the right system, that the screens re-render, that the
//  MovieSequencer actually stages the compiled timeline and shows subtitles.
//  This drives the full player journey and fails on the first console error.
//
//  Journey: new game → buy a set → order a script → weeks pass → read the script
//  → casting (auto + manual) → confirm → WATCH THE FILM → dailies → cinema list.
//  Exits 0 when the whole loop ran clean, 1 on any failure.
// ============================================================================
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const shotArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotArg ? path.resolve(shotArg.slice(8)) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let puppeteer;
try {
    puppeteer = createRequire(import.meta.url)('puppeteer');
} catch {
    try { puppeteer = createRequire(path.join(process.cwd(), 'noop.js'))('puppeteer'); } catch {
        console.error('verify-gameplay: puppeteer not found (dev-only). npm i puppeteer');
        process.exit(2);
    }
}

const VIEWPORT = { width: 1440, height: 810 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const steps = [];
const ok = (m) => { steps.push('  ok   ' + m); };
const bad = (m) => { failures.push(m); steps.push('  FAIL ' + m); };

const serve = (script, port) => {
    const srv = spawn(process.execPath, [script, '--port=' + port, '--no-open'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((res) => {
        srv.stdout.on('data', (d) => { if (String(d).includes('http://')) res(srv); });
        setTimeout(() => res(srv), 4000);
    });
};

const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 900000,        // building 12 sets under swiftshader is slow, not hung
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});

let srv = null, code = 1;
try {
    srv = await serve('tools/dev-server.mjs', 8123);
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.stack || e.message).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 300)); });

    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction('window.app && app.game && app.location', { timeout: 40000 });
    await sleep(2500);                                    // let the lot build and the crowd spawn

    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

    // Every toast the game shows, so a refusal is visible instead of silent.
    await page.evaluate(() => {
        window.__toasts = [];
        const orig = app.game.toast.bind(app.game);
        app.game.toast = (m) => { window.__toasts.push(String(m)); orig(m); };
    });
    const toasts = () => page.evaluate(() => window.__toasts);

    // A click on a [data-act] node, through the real delegated listener.
    const click = async (act) => {
        const found = await page.evaluate((a) => {
            const el = document.querySelector('.arc-ui [data-act="' + a + '"]');
            if (!el) return false;
            el.click();
            return true;
        }, act);
        if (!found) bad('нет кликабельного узла data-act="' + act + '"');
        await sleep(220);
        return found;
    };
    const st = (fn, ...args) => page.evaluate(fn, ...args);
    const check = (label, cond, extra) => { if (cond) ok(label + (extra ? ' — ' + extra : '')); else bad(label + (extra ? ' — ' + extra : '')); };

    // --- 0. every set and every prop must actually build ------------------------------------
    // buildSet/buildProp forget their begin() and the whole cinema feature dies on frame one;
    // the logic tests cannot see that, so the builders are exercised here for real.
    const built = await st(() => {
        const view = app.location.view;
        const sets = [], props = [];
        for (const id of Object.keys(SetPieces3D.SETS)) {
            try {
                const h = SetPieces3D.buildSet(view, id, 3200, 3200, 0);
                if (!h) sets.push(id + ': null');
                else {
                    const n = Object.keys(h.anchors || {}).length;
                    if (n < 2) sets.push(id + ': только ' + n + ' якорей');
                    SetPieces3D.dispose(h);
                }
            } catch (e) { sets.push(id + ': ' + String(e.message).slice(0, 70)); }
        }
        for (const id of Object.keys(SetPieces3D.PROPS)) {
            try {
                const h = SetPieces3D.buildProp(view, id, 3200, 3400, 0, 0);
                if (!h) props.push(id + ': null'); else SetPieces3D.dispose(h);
            } catch (e) { props.push(id + ': ' + String(e.message).slice(0, 70)); }
        }
        return { sets: sets, props: props, nSets: Object.keys(SetPieces3D.SETS).length, nProps: Object.keys(SetPieces3D.PROPS).length };
    });
    check('строятся все декорации', built.sets.length === 0, built.nSets + ' шт.' + (built.sets.length ? ' → ' + built.sets.join('; ') : ''));
    check('строится весь реквизит', built.props.length === 0, built.nProps + ' шт.' + (built.props.length ? ' → ' + built.props.join('; ') : ''));

    // --- 1. the main menu boots clean -----------------------------------------------------
    await shot('01-menu');
    check('главное меню отрисовано', await st(() => !!document.querySelector('[data-act="new"]')));
    check('на меню нет ошибок консоли', errors.length === 0, errors.slice(0, 3).join(' | '));

    // --- 2. a demo film plays from the menu (Phase А regression) ---------------------------
    await click('demo');
    await sleep(1200);
    check('демо-фильм запустился из меню', await st(() => MovieSequencer.playing));
    await shot('02-demo-film');
    await st(() => { MovieSequencer.stop(false); });
    await sleep(600);
    check('демо-фильм остановлен и вернул камеру', await st(() => !MovieSequencer.playing));

    // --- 3. new game -------------------------------------------------------------------------
    await click('new');
    await sleep(400);
    const s0 = await st(() => ({ cash: StudioManager.state.cash, year: StudioManager.state.year, started: app.game.started, roster: StudioManager.state.roster.length }));
    check('новая игра: студия создана', s0.started && s0.cash > 0, '$' + s0.cash + ', ' + s0.year + ', актёров ' + s0.roster);
    await shot('03-studio');

    // --- 4. sign enough actors, then buy a set so the genre has somewhere to film ----------------
    // A 600k comedy asks for ~4 roles; a new studio has 3 actors, so the player MUST hire.
    await page.evaluate(() => { app.game.showScreen('people'); });
    await sleep(300);
    await click('tab:people:market');
    await sleep(300);
    check('биржа талантов открывается вкладкой', await st(() => app.game.uiState.peopleTab === 'market'));
    for (let i = 0; i < 4; i++) {
        const need = await st(() => {
            const roles = ScriptGenerator.rolesFor('comedy', 600000).length;
            return StudioManager.state.roster.length < roles;
        });
        if (!need) break;
        const id = await st(() => {
            const m = (StudioManager.state.market || []).filter((p) => p.role === 'actor' && StudioManager.canAfford(p.salary * 4));
            return m.length ? m[0].id : null;
        });
        if (!id) break;
        await click('p:hire:' + id);
        await sleep(200);
    }
    // One spare on top of the role count, so the manual override below has somebody to take.
    const spare = await st(() => {
        const m = (StudioManager.state.market || []).filter((p) => p.role === 'actor');
        return m.length ? m[0].id : null;
    });
    if (spare) { await click('p:hire:' + spare); await sleep(200); }
    const rosterNow = await st(() => ({ n: StudioManager.state.roster.length, need: ScriptGenerator.rolesFor('comedy', 600000).length }));
    check('студия наняла актёров под роли', rosterNow.n > rosterNow.need, 'в штате ' + rosterNow.n + ', ролей нужно ' + rosterNow.need);
    await page.evaluate(() => app.game.showScreen('studio'));
    await sleep(300);
    await click('set:buy:diner');
    await sleep(300);
    check('декорация куплена', await st(() => !!StudioManager.state.ownedSets.diner));

    // --- 5. the new-film wizard ------------------------------------------------------------------
    await click('newmovie');
    await sleep(400);
    check('мастер нового фильма открыт', await st(() => app.game.screen === 'newmovie'));
    await click('script:genre:comedy');
    await sleep(250);
    check('жанр переключается', await st(() => ScriptGenerator.wizard && ScriptGenerator.wizard.genre === 'comedy'));
    await st(() => {
        const el = document.querySelector('[data-act="script:budget"]');
        el.value = '600000';
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(350);
    check('слайдер бюджета меняет проект', await st(() => ScriptGenerator.wizard.budget === 600000),
        'сцен ~' + await st(() => ScriptGenerator.scenesFor(ScriptGenerator.wizard.budget)));
    await shot('04-newmovie-wizard');

    // --- 6. commission the script, then let the weeks run ------------------------------------------
    const cashBefore = await st(() => StudioManager.state.cash);
    await click('script:order');
    await sleep(400);
    const ord = await st(() => ({ n: StudioManager.state.orders.length, cash: StudioManager.state.cash, left: (StudioManager.state.orders[0] || {}).weeksLeft }));
    check('сценарий заказан и оплачен', ord.n === 1 && ord.cash < cashBefore, 'списано $' + (cashBefore - ord.cash) + ', недель ' + ord.left);
    let weeks = 0;
    while (weeks < 12) {
        const done = await st(() => StudioManager.state.scripts.length > 0);
        if (done) break;
        await page.evaluate(() => app.game.nextWeek());
        await sleep(120);
        weeks++;
    }
    const sc = await st(() => {
        const s = StudioManager.state.scripts[0];
        return s ? { id: s.id, title: s.title, genre: s.genre, quality: s.quality, scenes: s.scenes.length, roles: s.roles.length, lines: s.scenes.reduce((a, x) => a + x.lines.length, 0), logline: s.logline } : null;
    });
    check('сценарий дописан за ' + weeks + ' нед.', !!sc, sc ? '«' + sc.title + '» ' + sc.genre + ' q=' + sc.quality.toFixed(1) + ', сцен ' + sc.scenes + ', реплик ' + sc.lines : '');
    if (!sc) throw new Error('сценарий не появился — дальше идти некуда');

    // --- 7. read the screenplay -----------------------------------------------------------------------
    await page.evaluate((id) => app.game.uiState.scriptOpen = id, sc.id);
    await page.evaluate(() => app.game.showScreen('script'));
    await sleep(400);
    const reader = await st(() => {
        const html = document.querySelector('.arc-ui #screenMain, .arc-ui')?.innerHTML || '';
        return { hasLogline: html.includes('logline') || html.length > 2000, scenes: (html.match(/Сцена \d+\./g) || []).length, dlg: (html.match(/class="dlg"/g) || []).length };
    });
    check('читалка сценария показывает сцены и диалоги', reader.scenes >= 3 && reader.dlg >= 3, 'сцен ' + reader.scenes + ', реплик в разметке ' + reader.dlg);
    await shot('05-script-reader');

    // --- 8. casting ------------------------------------------------------------------------------------
    await click('cast:open:' + sc.id);
    await sleep(400);
    check('экран кастинга открыт', await st(() => app.game.screen === 'casting'));
    const cands = await st(() => (document.querySelector('.arc-ui')?.innerHTML.match(/data-act="cast:pick:/g) || []).length);
    check('список проб не пуст', cands > 0, 'кнопок «Взять»: ' + cands);
    await shot('06-casting');
    await click('cast:auto:' + sc.id);
    await sleep(350);
    const auto = await st(() => {
        const s = StudioManager.state.scripts[0];
        return { filled: Object.keys(s.cast || {}).length, need: s.roles.length, complete: CastingSystem.isComplete(StudioManager.state, s) };
    });
    check('авто-кастинг заполнил все роли', auto.complete, auto.filled + '/' + auto.need);
    // A manual override on top of the auto-cast.
    const pickInfo = await st(() => {
        const s = StudioManager.state.scripts[0];
        const role = s.roles[0].key;
        const taken = new Set(Object.values(s.cast || {}));
        const list = CastingSystem.candidates(StudioManager.state, s, s.roles[0]);
        const free = list.find((c) => c.score.roster && !c.score.busy && !taken.has(c.person.id));
        return free ? { role: role, id: free.person.id, name: free.person.name } : null;
    });
    if (pickInfo) {
        await click('cast:pick:' + pickInfo.role + ':' + pickInfo.id);
        await sleep(300);
        const now = await st((k) => StudioManager.state.scripts[0].cast[k], pickInfo.role);
        check('ручной выбор перезаписывает роль', now === pickInfo.id, pickInfo.name);
    } else bad('не нашлось свободного подписанного актёра для ручной пробы');
    const chem = await st(() => {
        const s = StudioManager.state.scripts[0];
        const byKey = {};
        for (const r of s.roles) byKey[r.key] = CastingSystem.person(StudioManager.state, s.cast[r.key]);
        return CastingSystem.projectedQuality(StudioManager.state, s, byKey);
    });
    check('химия и прогноз качества считаются', chem && Number.isFinite(chem.chemistry) && chem.chemistry >= -1 && chem.chemistry <= 1 && chem.quality > 0 && chem.quality <= 10,
        'химия ' + (chem.chemistry >= 0 ? '+' : '') + chem.chemistry.toFixed(2) + ', прогноз ' + chem.quality.toFixed(1) + '/10');
    await shot('07-casting-full');

    // --- 9. confirm: the script becomes a film --------------------------------------------------------------
    const cashPre = await st(() => StudioManager.state.cash);
    await click('cast:confirm:' + sc.id);
    await sleep(600);
    const conf = await st(() => {
        const s = StudioManager.state.scripts[0];
        return { hasTl: !!s.timeline, scenes: s.timeline ? s.timeline.scenes.length : 0, cast: s.timeline ? s.timeline.cast.length : 0, state: s.state, cash: StudioManager.state.cash, projected: s.projected };
    });
    check('каст утверждён и таймлайн скомпилирован', conf.hasTl && conf.scenes >= 3 && conf.cash < cashPre,
        'сцен ' + conf.scenes + ', в кадре ' + conf.cast + ', гонорар $' + (cashPre - conf.cash));
    if (!conf.hasTl) steps.push('       тосты: ' + (await toasts()).slice(-4).join(' | '));

    // --- 10. THE MOMENT: watch the film the player made -------------------------------------------------------
    await click('script:watch:' + sc.id);
    await sleep(2500);
    const play1 = await st(() => ({ playing: MovieSequencer.playing, state: MovieSequencer.state, si: MovieSequencer.si, t: MovieSequencer.t, actors: Object.keys(MovieSequencer.actors).length, total: MovieSequencer.totalDur }));
    check('фильм играется', play1.playing && play1.actors > 0, 'state=' + play1.state + ', актёров на площадке ' + play1.actors + ', хронометраж ' + play1.total.toFixed(0) + 'с');
    await shot('08-watching-title');

    // A still of an actual staged scene: walk the sim into the middle of scene 2 before the
    // full run, so the evidence shows actors on a set with a subtitle, not the title card.
    await st(() => {
        const sp = () => UI.get('subPanel') && UI.get('subPanel').visible;
        for (let i = 0; i < 900 && MovieSequencer.playing; i++) {
            MovieSequencer.update(0.1);
            const sc = MovieSequencer.tl && MovieSequencer.tl.scenes[MovieSequencer.si];
            const sh = sc && (sc.shots || [])[MovieSequencer.shot];
            if (MovieSequencer.state === 'scene' && sh && ['close', 'duo', 'over', 'medium'].includes(sh.tag || sh.cam.type) && sp()) break;
        }
    });
    await sleep(400);
    await shot('08b-film-still');
    // A very short film may already have ended inside the still-capture loop above, in which
    // case onEnd has legitimately put the screen back — only assert while the picture runs.
    const panel = await st(() => ({ playing: MovieSequencer.playing, hidden: (() => { const m = UI.get('screenMain'); return !!m && !m.visible; })() }));
    check('панель управления скрыта под плёнкой', panel.playing ? panel.hidden : true,
        panel.playing ? 'иначе экран кастинга лежит поверх картины' : 'фильм короче захвата кадра — нечего проверять');

    // Run the WHOLE picture deterministically: main.js clamps dt to 0.1 s and swiftshader gives a
    // handful of FPS, so wall-clock sampling would under-report. Driving update(dt) by hand plays
    // the film start to finish regardless of the renderer, which is a far stronger check.
    const run = await st(() => {
        const seen = { maxSi: 0, states: {}, subs: [], sets: {}, maxActors: 0, moved: 0, steps: 0 };
        const lastPos = {};
        for (let i = 0; i < 1200 && MovieSequencer.playing; i++) {
            MovieSequencer.update(0.5);
            seen.steps = i + 1; seen.filmT = MovieSequencer.t;
            seen.maxSi = Math.max(seen.maxSi, MovieSequencer.si);
            seen.states[MovieSequencer.state] = (seen.states[MovieSequencer.state] || 0) + 1;
            if (!MovieSequencer.playing) break;            // the teardown nulls the set on purpose
            // UIElement.setText writes _text (def.text keeps the authored record), so read that.
            const sp = UI.get('subPanel'), stx = UI.get('subText');
            const line = stx ? (stx._text != null ? stx._text : (stx.def && stx.def.text) || '') : '';
            if (sp && sp.visible && line) seen.subs.push(line);
            seen.sets[MovieSequencer.si] = !!MovieSequencer.set;
            seen.maxActors = Math.max(seen.maxActors, Object.keys(MovieSequencer.actors).length);
            // Actors must actually move: staging is not a still photo.
            for (const id of Object.keys(MovieSequencer.actors)) {
                const a = MovieSequencer.actors[id];
                const k = id, prev = lastPos[k];
                if (prev && (Math.abs(prev.x - a.x) > 1 || Math.abs(prev.y - a.y) > 1)) seen.moved++;
                lastPos[k] = { x: a.x, y: a.y };
            }
        }
        return {
            maxSi: seen.maxSi, states: Object.keys(seen.states), subs: seen.subs.length,
            firstSubs: seen.subs.slice(0, 4), maxActors: seen.maxActors, moved: seen.moved,
            steps: seen.steps, ended: !MovieSequencer.playing, t: MovieSequencer.t,
            setsBuilt: Object.values(seen.sets).every(Boolean),
        };
    });
    const totalScenes = await st(() => StudioManager.state.scripts[0].timeline.scenes.length);
    check('фильм проигран целиком и закончился сам', run.ended && run.states.includes('credits'),
        'состояния: ' + run.states.join('→') + ', t=' + run.t.toFixed(0) + 'с, шагов ' + run.steps);
    check('пройдены все сцены', run.maxSi >= totalScenes - 1, 'дошли до ' + (run.maxSi + 1) + ' из ' + totalScenes);
    check('в фильме есть субтитры', run.subs >= 5, 'реплик показано ' + run.subs + ', напр.: «' + run.firstSubs[0] + '»');
    check('актёры на площадке и они двигаются', run.maxActors >= 3 && run.moved > 10, 'в кадре ' + run.maxActors + ', перемещений ' + run.moved);
    check('декорация построена в каждой сцене', run.setsBuilt);
    await shot('09-watching-scene');

    // --- 11. dailies: watch a single scene straight from the script ---------------------------------------------
    await st(() => { if (MovieSequencer.playing) MovieSequencer.stop(true); });
    await sleep(800);
    await page.evaluate(() => app.game.showScreen('script'));
    await sleep(300);
    await click('script:dailies:' + sc.id + ':0');
    await sleep(1800);
    check('дневники съёмок играют одну сцену', await st(() => MovieSequencer.playing && MovieSequencer.opts && MovieSequencer.opts.dailies === 0));
    await shot('10-dailies');
    await st(() => { if (MovieSequencer.playing) MovieSequencer.stop(false); });
    await sleep(800);

    // --- 11b. Phase Г: the shooting floor ---------------------------------------------------------------
    await page.evaluate(() => app.game.showScreen('films'));
    await sleep(300);
    const scriptId = await st(() => StudioManager.state.scripts[0].id);
    await click('prod:start:' + scriptId);
    await sleep(400);
    const pr0 = await st(() => {
        const p = (StudioManager.state.projects || [])[0];
        return p ? { id: p.id, state: p.state, scenes: p.sceneCount, screen: app.game.screen } : null;
    });
    check('фильм встал на съёмочную площадку', !!pr0 && pr0.state === 'shooting' && pr0.screen === 'production',
        pr0 ? pr0.id + ', сцен в листе ' + pr0.scenes : 'проект не создался');
    await shot('12-production');
    await click('prod:pace:' + pr0.id + ':rich');
    await sleep(250);
    check('темп съёмок переключается', await st((id) => (StudioManager.state.projects.find((p) => p.id === id) || {}).pace === 'rich', pr0.id));

    // Shoot to wrap, watching dailies on the way.
    let guard = 0;
    while (guard++ < 30) {
        const stt = await st((id) => (StudioManager.state.projects.find((p) => p.id === id) || {}).state, pr0.id);
        if (stt !== 'shooting') break;
        await page.evaluate((id) => {
            const p = StudioManager.state.projects.find((x) => x.id === id);
            if (p && p.scenesShot.length >= 2 && !window.__dailiesSeen) { window.__dailiesSeen = p.scenesShot[0].idx; }
        }, pr0.id);
        await click('prod:week:' + pr0.id);
        await sleep(120);
    }
    const pr1 = await st((id) => {
        const p = StudioManager.state.projects.find((x) => x.id === id);
        return { state: p.state, shot: p.scenesShot.length, total: p.sceneCount, spent: p.spent, budget: p.budget, incidents: p.incidents.length, weeks: p.weeksShot };
    }, pr0.id);
    check('съёмки дошли до монтажной', pr1.state === 'post' && pr1.shot === pr1.total,
        'снято ' + pr1.shot + '/' + pr1.total + ' за ' + pr1.weeks + ' нед., потрачено ' + Math.round(pr1.spent / 1000) + 'k из ' + Math.round(pr1.budget / 1000) + 'k, инцидентов ' + pr1.incidents);
    check('каждый дубль в границах и с объяснением', await st((id) => {
        const p = StudioManager.state.projects.find((x) => x.id === id);
        return p.scenesShot.every((x) => x.quality > 0 && x.quality <= 10 && x.parts && typeof x.parts.director === 'number');
    }, pr0.id));

    // Dailies: a shot scene plays in the cinema.
    await page.evaluate(() => app.game.showScreen('production'));
    await sleep(300);
    await click('prod:dailies:' + pr0.id + ':0');
    await sleep(1500);
    check('дневники снятой сцены играются', await st(() => MovieSequencer.playing && MovieSequencer.opts && MovieSequencer.opts.dailies === 0));
    await shot('13-dailies');
    await st(() => { if (MovieSequencer.playing) MovieSequencer.stop(true); });
    await sleep(600);

    // The rough cut of everything shot.
    await page.evaluate(() => app.game.showScreen('production'));
    await sleep(300);
    await click('prod:cut:' + pr0.id);
    await sleep(1500);
    const cut = await st(() => ({ playing: MovieSequencer.playing, scenes: MovieSequencer.tl ? MovieSequencer.tl.scenes.length : 0 }));
    check('черновой монтаж снятого играется', cut.playing && cut.scenes === pr1.shot, 'сцен в черновике ' + cut.scenes);
    await st(() => { if (MovieSequencer.playing) MovieSequencer.stop(true); });
    await sleep(600);

    // A set is an asset: rebuild it one level up.
    const up = await st(() => {
        StudioManager.state.cash += 500000;      // capability check, not an economy check
        const id = Object.keys(StudioManager.state.ownedSets)[0];
        const before = StudioManager.state.ownedSets[id].level;
        const res = ProductionSystem.upgradeSet(StudioManager.state, StudioManager, id);
        return { ok: res.ok, before: before, after: StudioManager.state.ownedSets[id].level };
    });
    check('декорация-актив перестраивается выше', up.ok && up.after === up.before + 1, 'уровень ' + up.before + ' → ' + up.after);

    // --- 12. no console errors across the whole journey -------------------------------------------------------------
    await shot('11-back-to-studio');
    check('за весь прогон ни одной ошибки консоли', errors.length === 0, errors.slice(0, 5).join(' | '));

    // --- 13. a full year of ticks stays finite (economy smoke) ---------------------------------------------------------
    const econ = await st(() => {
        app.game.showScreen('none');
        for (let i = 0; i < 104; i++) StudioManager.tickWeek();
        const s = StudioManager.state;
        return { cash: s.cash, fans: s.fans, year: s.year, weeks: s.stats.weeks, bad: [s.cash, s.fans, s.rep].some((v) => !Number.isFinite(v)) };
    });
    check('104 недели тикают без NaN и Infinity', !econ.bad, 'год ' + econ.year + ', касса $' + Math.round(econ.cash) + ', фанаты ' + econ.fans.toFixed(1));
} catch (e) {
    bad('исключение в прогоне: ' + (e && e.message ? e.message : e));
} finally {
    await browser.close();
    if (srv) srv.kill();
}

console.log('\n«Фабрика Грёз» — прогон игрового цикла');
for (const l of steps) console.log(l);
code = failures.length ? 1 : 0;
console.log(failures.length ? '\nПРОВАЛ: ' + failures.length + '\n' : '\nВесь цикл прошёл.\n');
process.exit(code);
