// ============================================================================
//  tools/deploy-pages.mjs — one-command publish of the playable build
// ----------------------------------------------------------------------------
//  node tools/deploy-pages.mjs            build dist and publish to gh-pages
//  node tools/deploy-pages.mjs --check    only smoke-test the live Pages site
//
//  The game is a static site, so GitHub Pages serves the built dist as-is:
//  the archive is unpacked into an orphan gh-pages branch (with .nojekyll) and
//  pushed. The Pages source is configured once (branch gh-pages, path /); this
//  tool only refreshes the content. A headless-Chrome smoke test of the LIVE url
//  runs afterwards: the deployment is not "done" until the site boots clean.
// ============================================================================
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/zavodilo/FabrikaGrez.git';
const LIVE = 'https://zavodilo.github.io/FabrikaGrez/';
const CHECK_ONLY = process.argv.includes('--check');

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { cwd: opts.cwd || ROOT, encoding: 'utf8', shell: opts.shell || false });
    if (r.status !== 0 && opts.fatal !== false) {
        console.error((r.stderr || r.stdout || '').slice(-2000));
        process.exit(r.status == null ? 1 : r.status);
    }
    return r;
}

// --- the live smoke test: the site must boot the game without console errors ---------------
async function smokeLive() {
    let puppeteer;
    try { puppeteer = (await import('puppeteer')).default; } catch {
        try { puppeteer = (await import(path.join(ROOT, 'node_modules', 'puppeteer', 'index.js'))).default; } catch {
            console.error('deploy-pages: нужен puppeteer для smoke-теста живого сайта (npm i puppeteer)');
            process.exit(2);
        }
    }
    const browser = await puppeteer.launch({
        headless: true, protocolTimeout: 300000,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 160)); });
    await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.app && app.game && app.location', { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));
    const state = await page.evaluate(() => ({
        version: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '?',
        menu: !!document.querySelector('[data-act="new"]'),
        ui: document.querySelector('.arc-ui') ? document.querySelector('.arc-ui').children.length : 0,
    }));
    await browser.close();
    const ok = state.menu && state.ui > 10 && errors.length === 0;
    console.log('deploy-pages: живой сайт ' + LIVE);
    console.log('  версия ' + state.version + ', меню ' + (state.menu ? 'есть' : 'НЕТ') + ', UI-элементов ' + state.ui + ', ошибок консоли ' + errors.length);
    for (const e of errors.slice(0, 5)) console.log('  ' + e);
    if (!ok) process.exit(1);
    console.log('deploy-pages: smoke-тест пройден');
}

if (CHECK_ONLY) { await smokeLive(); process.exit(0); }

// --- build ------------------------------------------------------------------------------------
console.log('deploy-pages: сборка dist…');
run(process.execPath, ['tools/arc.mjs', 'build']);
const zip = fs.readdirSync(path.join(ROOT, 'dist')).find((f) => /^arcengine-.*\.zip$/.test(f));
if (!zip) { console.error('deploy-pages: архив не найден'); process.exit(1); }

// --- unpack into a worktree-less orphan branch -------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-pages-'));
console.log('deploy-pages: распаковка ' + zip + ' → ветка gh-pages…');
run('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', path.join(ROOT, 'dist', zip), tmp]);
fs.writeFileSync(path.join(tmp, '.nojekyll'), '');
const token = process.env.FG_GITHUB_TOKEN;
const remote = token ? remoteWith(token) : REPO;
function remoteWith(t) { return REPO.replace('https://github.com/', 'https://x-access-token:' + t + '@github.com/'); }
run('git', ['init', '-q'], { cwd: tmp });
run('git', ['checkout', '-q', '-b', 'gh-pages'], { cwd: tmp });
run('git', ['config', 'user.name', 'zavodilo'], { cwd: tmp });
run('git', ['config', 'user.email', 'zavodilo@users.noreply.github.com'], { cwd: tmp });
run('git', ['add', '-A'], { cwd: tmp });
run('git', ['commit', '-q', '-m', 'docs(pages): играбельная сборка ' + zip.replace(/^arcengine-|\.zip$/g, '') + ' для GitHub Pages'], { cwd: tmp });
const push = run('git', ['push', '-f', remote, 'gh-pages'], { cwd: tmp, fatal: false });
if (push.status !== 0) {
    console.error((push.stderr || '').replace(/https:\/\/x-access-token:[^@]+@/, 'https://<TOKEN>@').slice(-800));
    process.exit(1);
}
console.log('deploy-pages: gh-pages обновлена. Pages публикует ветку gh-pages от корня.');
fs.rmSync(tmp, { recursive: true, force: true });

// --- the live site must boot ---------------------------------------------------------------------
await new Promise((r) => setTimeout(r, 6000));
await smokeLive();
console.log('deploy-pages: готово. Игра: ' + LIVE);
