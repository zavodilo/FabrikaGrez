// main.js — entry point: engine (PlayArcEngine UVP generation) -> location -> camera -> UI ->
// presentation bridge -> game -> frame loop. Sound3D hears from where the camera is.
//
//     World3D.init(canvas)                        the PlayCanvas backend (the only one)
//     new Location3D({ objects })                 ground + the editor's objects
//     new CameraController(view)                  camera rig
//     UI.init(canvas)                             the DOM HUD (STUDIO_CSS injected inside)
//     Visual3D.attach({ view, location, camera }) the bridge: semantic layer <-> engine
//     CinePost3D.attach(view) / Sky3D.attach(view) the cinema frame and the procedural sky
//     new Game(app)                               gameplay: the studio simulator
//
// The PlayArcRuntime/GAME_SPEC port of the studio simulator is a separate ROADMAP phase
// («Движок: UVP»): until then the runtime stays off and the game presents itself through its
// own engine-layer modules (MovieSequencer, SetPieces3D, ActorRig3D, CinePost3D, Sky3D).
// window.app = { location, camera, game, runtime } — for the console and for game code.

function updateLoadingProgress(percent) {
    const bar = /** @type {HTMLElement | null} */ (document.querySelector('.loading-progress'));
    if (bar) bar.style.width = percent + '%';
}

// The loading screen goes away when the location is ready.
function hideLoader() {
    updateLoadingProgress(100);
    setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        if (screen) screen.style.display = 'none';
    }, 300);
}

function showBootError(text) {
    console.error(text);
    const el = document.querySelector('.loading-text');
    if (el) el.textContent = text;
}

function startGame() {
    if (window.app) return;                 // guard against a repeated start
    if (typeof SimplexNoise === 'undefined') { showBootError('Нет libs/simplex-noise.js'); return; }
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world3d'));
    updateLoadingProgress(40);
    if (!World3D.init(canvas)) { showBootError('3D недоступен: нет libs/playcanvas.min.js или WebGL'); return; }

    const location = new Location3D({ objects: typeof LOCATION_OBJECTS !== 'undefined' ? LOCATION_OBJECTS : [] });
    const camera = new CameraController(location.view, {
        terrain: location.terrain,
        bounds: { w: location.width, h: location.height }
    });
    camera.attach(canvas);
    UI.init(canvas);
    window.app = { location, camera, game: null, runtime: null };
    // The presentation backend: from here on the semantic layer can actually show things.
    if (typeof Visual3D !== 'undefined') Visual3D.attach({ view: location.view, location: location, camera: camera, canvas: canvas });
    // The post-processing frame (ACES, bloom, SSAO, vignette, genre LUTs) hangs on the view's
    // camera; the stored preset is restored inside attach. The procedural sky dresses the lot.
    if (typeof CinePost3D !== 'undefined') CinePost3D.attach(location.view);
    if (typeof Sky3D !== 'undefined' && Sky3D.attach(location.view)) Sky3D.setLot();
    const game = window.app.game = new Game(window.app);
    console.log('ArcEngine: локация запущена, объектов ' + location.objects.length + '.');
    updateLoadingProgress(70);

    // The frame loop is ours (the engine draws on demand): game logic, location,
    // camera — then one World3D.renderFrame(), which steps and draws the app.
    let last = performance.now();
    const loop = () => {
        const now = performance.now(), dt = (now - last) / 1000;
        last = now;
        game.update(Math.min(0.1, dt));
        if (typeof GameModel !== 'undefined') GameModel.run(Math.min(0.1, dt));
        if (typeof GameAnimation !== 'undefined') GameAnimation.update(Math.min(0.1, dt));
        if (typeof Kit !== 'undefined') Kit._run(Math.min(0.1, dt));
        location.update(dt);
        camera.update(dt);
        if (typeof CineCam3D !== 'undefined' && CineCam3D.isActive()) CineCam3D.capture();
        if (typeof CinePost3D !== 'undefined') CinePost3D.tick(Math.min(0.1, dt));
        if (typeof Visual3D !== 'undefined') Visual3D.update(Math.min(0.1, dt), {});
        Sound3D.update(camera);
        World3D.renderFrame();
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.addEventListener('resize', () => World3D.resize());
    location.ready.then(hideLoader);
}

window.onload = () => startGame();
