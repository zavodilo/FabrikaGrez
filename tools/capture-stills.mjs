// ============================================================================
//  tools/capture-stills.mjs — contact sheets of generated films (dev-only)
// ----------------------------------------------------------------------------
//  node tools/capture-stills.mjs DIR [genre ...]
//
//  Boots the game headlessly, compiles a film per genre from a fixed seed with a
//  synthetic cast, and screenshots a handful of playback moments (establishing,
//  a single, a two-shot, a late scene). This is how the cinematography gets
//  LOOKED AT: the logic tests prove the timeline is legal, pixels prove it reads.
// ============================================================================
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmpArg = args.find((a) => a.startsWith('--compare='));
const goldArg = args.find((a) => a.startsWith('--golden='));
const COMPARE = cmpArg ? path.resolve(cmpArg.slice(10)) : null;
const GOLDEN = goldArg ? path.resolve(goldArg.slice(9)) : null;
const rest = args.filter((a) => !a.startsWith('--'));
const DIR = path.resolve(rest[0] || 'stills');
const GENRES = rest.slice(1);
fs.mkdirSync(DIR, { recursive: true });
if (GOLDEN) fs.mkdirSync(GOLDEN, { recursive: true });
const SHOTS = [];

const puppeteer = createRequire(import.meta.url)('puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, ['tools/dev-server.mjs', '--port=8131', '--no-open'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => { srv.stdout.on('data', (d) => { if (String(d).includes('http://')) res(); }); setTimeout(res, 4000); });

const browser = await puppeteer.launch({
    headless: true, protocolTimeout: 900000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message).slice(0, 160)));
await page.goto('http://127.0.0.1:8131/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.app && app.game');
await sleep(2200);

const list = GENRES.length ? GENRES : ['western', 'comedy', 'drama', 'action', 'horror', 'scifi', 'romance'];
for (const genre of list) {
    // A fresh page per genre: under swiftshader a reused tab can keep showing the previous
    // film's last rendered frame while the next one plays (GPU-process artifact of the
    // headless gate, not a game state leak — the probe in PR notes shows state is clean).
    await page.goto('http://127.0.0.1:8131/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.app && app.game');
    await sleep(1800);
    const info = await page.evaluate((g) => {
        if (MovieSequencer.playing) MovieSequencer.stop(true);
        // A fresh studio without depending on the menu being on screen between films.
        if (!StudioManager.state || !document.querySelector('[data-act="new"]')) StudioManager.newGame('Стенды');
        else document.querySelector('[data-act="new"]').click();
        app.game.started = true;
        const s = StudioManager.state;
        for (let i = 0; i < 6; i++) { const m = (s.market || []).filter((p) => p.role === 'actor'); if (m.length) StudioManager.hire(m[0], 'actor'); }
        const sc = ScriptGenerator.draft(s, { genre: g, budget: 900000, seed: 4242, writer: null });
        const cast = {};
        const r = Rng.create('stills-' + g);
        for (const role of sc.roles) {
            const p = PeopleSystem.randomPerson(r, { role: 'actor', minSkill: 6, maxSkill: 9 });
            p.gender = role.sex === 'any' ? p.gender : role.sex; p.look.gender = p.gender;
            cast[role.key] = p;
        }
        const tl = ScriptGenerator.compile(sc, cast, s);
        app.game.playMovie(tl, { onEnd: () => {} });
        return { title: sc.title, scenes: tl.scenes.length };
    }, genre);

    // Capture moments: an establishing wide, then the first close/duo/over with a subtitle,
    // then a mid-film scene and a late one.
    // The predicates are re-created INSIDE the page, so the scene count is inlined, not closed over.
    const n = info.scenes;
    const marks = [
        { name: '1-wide', want: (st) => st.state === 'scene' && st.camType === 'wide' },
        { name: '2-single', want: (st) => st.state === 'scene' && ['close', 'medium', 'dutch'].includes(st.camType) && st.sub },
        { name: '3-two', want: (st) => st.state === 'scene' && ['duo', 'over'].includes(st.camType) },
        { name: '4-mid', want: new Function('st', 'return st.si >= ' + Math.floor(n / 2) + ' && st.state === "scene" && st.camType === "wide"') },
        { name: '5-late', want: new Function('st', 'return st.si >= ' + (n - 2) + ' && st.state === "scene" && ["close","duo","medium"].includes(st.camType)') },
    ];
    for (const mark of marks) {
        const hit = await page.evaluate((src) => {
            const want = new Function('st', 'return (' + src + ')(st)');   // arrow sources
            MovieSequencer.paused = false;      // unfreeze from the previous mark's freeze
            for (let i = 0; i < 1400 && MovieSequencer.playing; i++) {
                MovieSequencer.update(0.1);
                const sc = MovieSequencer.tl && MovieSequencer.tl.scenes[MovieSequencer.si];
                const sh = sc && (sc.shots || [])[MovieSequencer.shot];
                const sp = UI.get('subPanel');
                const st = {
                    state: MovieSequencer.state, si: MovieSequencer.si,
                    camType: sh ? (sh.tag || sh.cam.type) : '', sub: !!(sp && sp.visible),
                };
                if (want(st)) { MovieSequencer.paused = true; return st; }   // freeze in the same tick
            }
            return null;
        }, mark.want.toString());
        if (hit) {
            // Freeze every wall-clock driver so the sheet is reproducible bit for bit:
            // the picture pauses, CSS stock animations park on a fixed time, the adaptive
            // resolution scale stops breathing.
            await page.evaluate(() => {
                MovieSequencer.paused = true;
                if (document.getAnimations) {
                    for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 400; } catch (e) { /* noop */ } }
                }
                CinePost3D.tick = () => {};
                if (CinePost3D.frame) CinePost3D.frame.rendering.renderTargetScale = 1;
            });
            await sleep(250);
            const file = path.join(DIR, genre + '-' + mark.name + '.png');
            await page.screenshot({ path: file });
            SHOTS.push(file);
        } else {
            console.log('  ' + genre + ': момент ' + mark.name + ' не пойман');
        }
    }
    console.log('  ' + genre + ': «' + info.title + '» — ' + info.scenes + ' сцен, лист снят');
    await page.evaluate(() => { if (MovieSequencer.playing) MovieSequencer.stop(true); });
    await sleep(400);
}
if (GOLDEN) {
    for (const f of SHOTS) fs.copyFileSync(f, path.join(GOLDEN, path.basename(f)));
    console.log('Золотые листы: ' + GOLDEN + ' (' + SHOTS.length + ' кадров)');
}
if (COMPARE) {
    const { readPng, diffPngs } = await import('./png-diff.mjs');
    let fails = 0;
    for (const f of SHOTS) {
        const g = path.join(COMPARE, path.basename(f));
        if (!fs.existsSync(g)) { console.log('  нет золотого: ' + path.basename(f)); fails++; continue; }
        const d = diffPngs(readPng(f), readPng(g));
        const bad = d.mean > 6 || d.badShare > 0.12;
        if (bad) fails++;
        console.log('  ' + (bad ? 'DRIFT ' : 'ok    ') + path.basename(f) +
            ' — mean ' + d.mean.toFixed(2) + ', bad ' + (d.badShare * 100).toFixed(1) + '%, worst ' + d.worst);
    }
    if (fails) { console.log('Визуальная регрессия: ' + fails + ' кадров ушли от золотых.'); process.exitCode = 1; }
    else console.log('Золотые листы совпадают (в допуске).');
}
await browser.close();
srv.kill();
