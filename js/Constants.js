// Constants.js — ALL the kit's numbers: location, camera, render. Loaded FIRST:
// the other modules read these globals. Edited by the editor (_utils/editor): the server
// patches only lines of the form `const NAME = <number>;` — keep values as numeric
// literals (colors — 0xRRGGBB); the editor won't touch a formula.
const GAME_VERSION = '0.1.0'; // build version: ?v= on scripts (tools/build.mjs) and the archive name

// localStorage shim: in a sandbox iframe and when site data is blocked, direct access throws SecurityError.
// All storage access goes through Store only.
/** @satisfies {Record<string, any>} */
const Store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* nothing to remove */ }
    },
    // JSON parsing that never throws: a broken value = as if there were no save.
    getJSON(key, fallback = null) {
        const raw = Store.get(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            console.warn('Store: повреждённое значение "' + key + '", сбрасываю.');
            Store.remove(key);
            return fallback;
        }
    }
};

// Phone or tablet: user agent, iPad posing as a Mac, touch on a small screen.
const IS_MOBILE = (() => {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1366 &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024;
    const isiPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return userAgentMobile || isiPad || (hasTouchScreen && isSmallScreen);
})();

// --- LOCATION (Location3D.js, Terrain3D.js). World units are px: x to the right, y down
// the map, height up (skill world3d, §Coordinates). ---
const LOCATION_WIDTH = 4096;            // px: location width (the area the game camera stays within)
const LOCATION_HEIGHT = 4096;           // px: location height
const LOCATION_GROUND = 1;              // ground texture: 0 — grass, 1 — sand, 2 — snow (Location3D.GROUNDS)
const GROUND_TILE_SIZE = 512;           // world px per one repeat of the ground texture
const TERRAIN_NOISE_AMP = 0;            // px: hill amplitude (0 — flat ground) — a studio lot must be flat
const TERRAIN_NOISE_SCALE = 800;        // px: hill size
const TERRAIN_NOISE_SEED = 4;           // terrain noise seed
const TERRAIN_BASE = 0;                 // px: mean ground level
const TERRAIN_CELL = 8;                 // px: terrain grid step (mobile — no finer than 12)

// --- MODELS (Gltf3D.js) and UI (UI.js) ---
const MODEL_CLIP_BLEND_SEC = 0.2;       // s: cross-fade between animation clips of a .glb model (idle -> run); 0 — instant
const UI_REF_HEIGHT = 720;              // px: the screen height the UI layout (UILayout.js) is drawn for; the UI scales with the screen height, 0 — no scaling

// --- SOUND (Sound3D.js): channel volumes; a sound with a place on the map is heard from where
// the CAMERA is — its audible region is a sphere of AUDIO_FALLOFF_MAX around it ---
const AUDIO_MASTER_VOLUME = 0.8;        // 0..1: everything (0 — silence)
const AUDIO_MUSIC_VOLUME = 0.6;         // 0..1: the 'music' channel
const AUDIO_SFX_VOLUME = 1;             // 0..1: the 'sfx' channel — effects and object sounds
const AUDIO_FALLOFF_MIN = 150;          // px: full volume while the camera is this close to a sound (0 — it fades from the source itself)
const AUDIO_FALLOFF_MAX = 1024;         // px: from here on it is silent (fades linearly in between); an object may set its own pair. The camera stands ~800 px from its look-at point at zoom 1
const AUDIO_PAN = 0.7;                  // 0..1: how far a sound at the side of the screen goes into one ear (0 — mono)

// --- «ФАБРИКА ГРЁЗ» (Fabrika Grez): the movie studio sim on top of the kit ---
// Studio lot placement (map px): the lot with the buildings, and the backlot far away,
// where MovieSequencer builds the sets of the films being shot/watched.
const STUDIO_LOT_X = 1000;              // px: lot center X
const STUDIO_LOT_Y = 1100;              // px: lot center Y
const STUDIO_BACKLOT_X = 3200;          // px: backlot center X (film sets)
const STUDIO_BACKLOT_Y = 3200;          // px: backlot center Y
const STUDIO_START_CASH = 1000000;      // $: money the player starts with
const STUDIO_START_FANS = 5;            // 0..100: starting fan base
const STUDIO_START_YEAR = 1950;         // the year the studio opens
const STUDIO_LOT_UPKEEP = 2500;         // $: weekly lot upkeep
// People: the talent market, training, salaries.
const PEOPLE_MARKET_SIZE = 10;          // candidates on the talent market
const PEOPLE_MARKET_REFRESH = 3;        // weeks: how often the market refreshes
const PEOPLE_SKILL_CAP = 10;            // max skill points (drama/comedy/action/romance)
const PEOPLE_TRAIN_COST = 4000;         // $: one training course
const PEOPLE_TRAIN_GAIN = 1;            // skill points per course
const PEOPLE_TRAIN_WEEKS = 3;           // weeks a course takes (the person is busy)
const PEOPLE_START_ACTORS = 3;          // actors on the roster at a new game
const PEOPLE_START_STAFF = 2;           // staff (writer/director) at a new game
// Contracts, bonds and the school (PeopleSystem): tenure, renewals, poaching, scandals, aging.
const PEOPLE_CONTRACT_WEEKS = 52;       // weeks of a standard contract
const PEOPLE_CONTRACT_STAR_WEEKS = 26;  // weeks a star signs for (stars want freedom)
const PEOPLE_RENEW_RAISE_PER_STAR = 0.1;// salary raise demanded per star at renewal
const PEOPLE_RENEW_GRACE = 4;           // weeks to answer a renewal demand before the person walks
const PEOPLE_POACH_CHANCE = 0.05;       // weekly chance a disloyal star hears a rival offer
const PEOPLE_POACH_MULT = 1.4;          // the rival offer as a fraction of the salary
const PEOPLE_BOND_CHANCE = 0.12;        // weekly chance co-stars shift their bond noticeably
const PEOPLE_SCANDAL_CHANCE = 0.25;     // weekly chance a rivalry on one floor blows up
const PEOPLE_SCANDAL_FANS = 2.5;        // fans lost in a scandal
const PEOPLE_SCANDAL_REP = 4;           // reputation lost in a scandal
const PEOPLE_ROMANCE_PRESS = 0.2;       // weekly chance a floor romance makes good press
const PEOPLE_DECLINE_AGE = 60;          // age when the body starts saying no (action declines)
const PEOPLE_RETIRE_AGE = 70;           // age of the retirement ceremony
const PEOPLE_YOUNG_AGE = 24;            // age until a talent grows on its own
const PEOPLE_COURSE_CHARM_MULT = 1.5;   // price of the charm course, in training costs
const PEOPLE_COURSE_MEDIA_MULT = 2;     // price of the media course
const PEOPLE_COURSE_MEDIA_EXP = 20;     // exp of the media course (a step toward a star)
// Scripts and shooting.
const SCRIPT_WRITE_WEEKS = 2;           // weeks a writer needs per script
const SCRIPT_QUALITY_BASE = 3.5;        // base script quality 0..10
const SCRIPT_WRITER_BONUS = 0.45;       // quality points per writer skill point (0..10)
const SCRIPT_QUALITY_SPREAD = 0.9;      // ±: luck of the draft (gaussian, quality points)
const SCRIPT_HEAT_BONUS = 0.12;         // quality points per genre-heat point above 5 (era drift)
const SCRIPT_CHEAP_PENALTY = 1.1;       // quality points lost at half the genre's ideal budget
const SCRIPT_RICH_PENALTY = 0.5;        // quality points lost per 2× overspend over the ideal
const SCRIPT_QUICK_PENALTY = 2.2;       // quality points lost writing in-house instead of commissioning
const SCRIPT_SCENES_MIN = 6;            // scenes at the smallest budget
const SCRIPT_SCENES_MAX = 18;           // scenes at the biggest budget
const SCRIPT_ORDER_FEE = 15000;         // $: flat fee for commissioning a script
const SCRIPT_ORDER_BUDGET_FRAC = 0.06;  // fraction of the movie budget added to the fee
const SCRIPT_MAX_ORDERS = 3;            // concurrent writing orders the department can run
// Casting: how a candidate scores for a role (the five weights sum to 1) and what chemistry does.
const CAST_W_SKILL = 0.5;               // weight of the genre skill (0..10)
const CAST_W_STAR = 0.16;               // weight of star power (0..5 ★)
const CAST_W_MOOD = 0.12;               // weight of the current mood (0..100)
const CAST_W_CHARM = 0.08;              // weight of charm (0..10)
const CAST_W_FIT = 0.14;                // weight of the age/sex fit for the role
const CAST_CHEM_REL = 0.6;              // chemistry from the relationship value (−100..100)
const CAST_CHEM_FILM = 0.08;            // chemistry per film the pair already made together
const CAST_CHEM_QUALITY = 0.9;          // quality points the film gains per +1 of cast chemistry
const CAST_FEE_PER_LEAD = 2500;         // $: casting session, per lead role
const CAST_AUDITIONS = 8;               // candidates shown per role on the audition list
const SHOOT_SCENES_PER_WEEK = 2;        // scenes shot per week at a normal pace
// Production paces (ProductionSystem): scenes per week, the weekly cost as a fraction of an
// even spread of the budget, and the quality delta of shooting the picture that way.
const PROD_PACE_CHEAP_SCENES = 1;       // scenes/week: «экономно»
const PROD_PACE_CHEAP_COST = 0.65;      // weekly cost fraction: «экономно»
const PROD_PACE_CHEAP_Q = -0.6;         // quality delta: saving on film stock and catering shows
const PROD_PACE_STD_SCENES = 2;         // scenes/week: «стандарт»
const PROD_PACE_STD_COST = 1.0;         // weekly cost fraction: «стандарт»
const PROD_PACE_STD_Q = 0;              // quality delta: «стандарт»
const PROD_PACE_RICH_SCENES = 2;        // scenes/week: «с размахом»
const PROD_PACE_RICH_COST = 1.5;        // weekly cost fraction: «с размахом» (can overspend)
const PROD_PACE_RICH_Q = 0.7;           // quality delta: extra takes, better crew, more light
const PROD_INCIDENT_CHANCE = 0.22;      // chance of a production incident per shooting week
const PROD_INCIDENT_RICH_MUL = 0.8;     // a rich production is better run: incident multiplier
const PROD_INCIDENT_CHEAP_MUL = 1.35;   // a cheap production cuts corners: incident multiplier
const PROD_OVERSPEND_Q = 0.4;           // quality lost per week once the budget is overspent
const PROD_MOOD_Q = 0.02;               // quality per mood point of the cast above 60
const PROD_SET_LEVEL_BONUS = 0.5;       // +fraction of SHOOT_SET_BONUS per set level above 1
const PROD_UPGRADE_FRAC = 0.6;          // upgrade price as a fraction of the set's build cost
const PROD_MAX_LEVEL = 3;               // highest level of a studio set
const PROD_SCRIPT_WEIGHT = 0.35;        // weight of the script quality in the final picture
const PROD_SHOT_WEIGHT = 0.5;           // weight of the shot scenes in the final picture
const PROD_CHEM_WEIGHT = 0.15;          // weight of the cast chemistry in the final picture
const SHOOT_QUALITY_BASE = 2.5;         // base shot-scene quality 0..10
const SHOOT_DIRECTOR_BONUS = 0.3;       // quality per director skill point
const SHOOT_ACTOR_BONUS = 0.3;          // quality per lead actor skill point
const SHOOT_SET_BONUS = 1.2;            // quality when the right set is owned
const SHOOT_RANDOM_SPREAD = 1.4;        // ±: luck of the take
const MOVIE_BUDGET_MIN = 100000;        // $: smallest production budget
const MOVIE_BUDGET_MAX = 3000000;       // $: biggest production budget
const MOVIE_BUDGET_DEFAULT = 400000;    // $: the slider starts here
// Release: box office, marketing, awards.
const RELEASE_RUN_WEEKS = 8;            // weeks a film stays in theaters
const RELEASE_DROP = 0.42;              // weekly box-office decay fraction
const RELEASE_OPEN_PER_FAN = 900;       // $: opening weekend per fan point
const RELEASE_OPEN_PER_QUALITY = 90000; // $: opening weekend per quality point (0..10)
const RELEASE_OPEN_PER_MARKETING = 0.9; // opening multiplier per marketing $ / budget $
const RELEASE_STAR_BONUS = 0.08;        // opening multiplier per star ★ of the leads
const RELEASE_SCREEN_BASE = 150;        // screens at a wide release
const MARKETING_MAX_FRAC = 1.0;         // marketing cap as a fraction of the movie budget
// Post-production and release (ReleaseSystem): the cut, the score, the premiere and the run.
const RELEASE_STUDIO_SHARE = 0.55;      // fraction of the gross the studio keeps
const RELEASE_EDIT_MATCH = 0.5;         // quality when the cut tempo suits the genre
const RELEASE_EDIT_MISMATCH = -0.6;     // quality when the cut tempo fights the genre
const RELEASE_MUSIC_FIT = 0.3;          // quality when the score is the genre's own
const RELEASE_MUSIC_MISS = -0.4;        // quality when the score is borrowed from a foreign genre
const RELEASE_CRITIC_NOISE = 0.8;       // ±: the critics' luck (gaussian, score points)
const RELEASE_AUDIENCE_STAR = 4;        // audience points per star of the leads
const RELEASE_HEAT_FACTOR = 0.06;       // gross multiplier per genre-heat point above 5
const RELEASE_SEASON_AMP = 1.0;         // season table is used as is (multipliers per month)
const RELEASE_SCREEN_PER_QUALITY = 12;  // screens added per point of the final quality
const RELEASE_SCREEN_GROSS = 9000;      // $ a screen yields on the opening weekend
const RELEASE_FANS_PER_QUALITY = 0.8;   // fans gained per quality point above 6 at the wrap
const RELEASE_FANS_LOSS = 0.6;          // fans lost per quality point below 4.5 at the wrap
const RELEASE_HOLD_BONUS = 0.12;        // weekly decay softened per 10 audience points above 60
const AWARD_REP = 6;                    // studio reputation per «Золотой Кадр»
const AWARD_FANS = 4;                   // fans per «Золотой Кадр»
const AWARD_CASH = 25000;               // $ prize of a «Золотой Кадр»
// MovieSequencer and the cinematic camera.
const MOVIE_CAM_LERP = 6;               // 1/s: camera glide speed toward the shot pose
const MOVIE_TITLE_SEC = 3.5;            // s: the title card holds
const MOVIE_CREDITS_SPEED = 46;         // px/s: the end credits crawl
const MOVIE_FOV_CLOSE = 40;             // °: FOV punch on close-ups (wide keeps CAMERA_FOV_DEG)
const MOVIE_GRAIN = 1;                  // 1 — film grain/vignette overlay in the cinema, 0 — clean

// --- CAMERA (CameraControl.js): target on the map, azimuth, pitch and zoom. Zoom is
// screen px per world px at the look-at point; distance is derived from it. Flight
// (WASD, Q/E) lifts the look-at point off the ground. ---
const CAMERA_FOV_DEG = 52;              // vertical field of view
const CAMERA_AZIMUTH_DEG = -90;         // where the camera looks on the map: −90 — north up, 0 — east up
const CAMERA_PITCH_DEG = 57;            // pitch toward the ground: 90 — straight from above, less — more perspective
const CAMERA_ZOOM = 1;                  // starting zoom: PC and tablets
const CAMERA_ZOOM_MOBILE = 0.7;         // starting zoom: phones (longer screen side < 1024)
const CAMERA_ZOOM_MIN = 0.5;            // wheel and pinch won't zoom out further (below this the ground edge gets into the frame)
const CAMERA_ZOOM_MAX = 3;              // won't zoom in closer
const CAMERA_ZOOM_WHEEL_STEP = 0.12;    // fraction of zoom per one wheel notch
const CAMERA_ZOOM_LERP = 0.18;          // zoom smoothing: fraction of the remainder per frame
const CAMERA_FOLLOW_LERP = 0.05;        // following an object (follow): fraction of the remainder per frame
const CAMERA_FLY_SPEED = 900;           // flight on WASD, arrows and Q/E: screen px/s (over the world — divided by zoom)
const CAMERA_LIMITS = 0;                // game camera limits: 0 — free flight, 1 — pitch within CAMERA_ORBIT_PITCH_*, target inside the location, flight ceiling; the ground edge stays out of the frame
const CAMERA_LIFT_MAX = 600;            // px, with limits: how high above the ground flight lifts the look-at point (higher — the ground edge gets into the frame)
const CAMERA_ORBIT = 1;                 // camera rotation by the player (RMB: look-around, orbit while following an object): 0 — orientation fixed, 1 — allowed
const CAMERA_ORBIT_DEG_PER_PX = 0.3;    // degrees of rotation per screen px of drag
const CAMERA_ORBIT_PITCH_MIN_DEG = 35;  // with limits: won't go lower toward the ground (the limit also rises on its own — ground edge stays out of the frame)
const CAMERA_ORBIT_PITCH_MAX_DEG = 88;  // with limits: higher — almost straight from above

// --- RENDER (World3D.js): light, shadows, sky, materials, toon and ink edges. Read by
// World3D.cfg(); the editor applies edits to the live scene. ---
// One sun for the whole world. Azimuth — WHERE the shadow falls on the map (0 — right, 90 — down).
const WORLD3D_SUN_AZIMUTH_DEG = 32;
const WORLD3D_SUN_ELEVATION_DEG = 41;   // sun elevation above the horizon
const WORLD3D_SUN_INTENSITY = 0.8;      // sun strength (with the sky it sums to ~1.0 on flat ground — texture colors unchanged)
const WORLD3D_SUN_COLOR = 0xffedc7;     // sun color
const WORLD3D_SKYLIGHT_INTENSITY = 0.45; // diffuse sky light (hemispheric light source)
const WORLD3D_SKYLIGHT_COLOR = 0xb1d8f7; // sky light color (faces looking up)
const WORLD3D_GROUNDLIGHT_COLOR = 0xc2c7ad; // fill light from below (reflection off the ground)
const WORLD3D_SKY_COLOR = 0x8fc3e0;     // sky and fog color
const WORLD3D_FOG_DENSITY = 0.00032;    // exponential fog toward the horizon (0 — off)
// Shadows: one color for all (painted by the toon chunks, the sun only provides visibility)
const WORLD3D_SHADOW_COLOR = 0x0f3a4d;  // shadow color
const WORLD3D_SHADOW_STRENGTH = 0.52;    // shadow strength 0..1: a surface in shadow is multiplied by a blend of white and the shadow color
const WORLD3D_SHADOW_SOFT = 2;          // edge: 0 — hard (for toon), 1..3 — PCF low/medium/high (mobile — no higher than 1)
const WORLD3D_SHADOW_MAP = 1024;        // shadow map size (mobile — half as large); takes effect with a new scene
const WORLD3D_SHADOW_RADIUS = 840;      // px: LIMIT of the shadow ortho frustum half-size; the frustum itself shrinks to the objects in the frame
const WORLD3D_SHADOW_BIAS = 0.001;     // depth bias against shadow acne (shadow stripes on lit faces)
const WORLD3D_SHADOW_NORMAL_BIAS = 0.8; // bias along the normal against shadow acne (stripes and sawtooth on faces at an acute angle to the sun), in shadow map texels on top of the edge smoothing radius (the engine adds it)
// Materials by group (specular highlight — fraction 0..1, size — exponent: larger — smaller highlight)
const WORLD3D_GROUND_SPECULAR = 0;      // ground specular highlight (0 — matte)
const WORLD3D_GROUND_SPEC_POWER = 1;    // ground specular highlight size
const WORLD3D_OUTER_TINT = 1;           // ground brightness BEYOND the location edge (less than 1 — the location boundary is visible)
const WORLD3D_PROP_SPECULAR = 0.05;     // environment specular highlight (group 'prop')
const WORLD3D_PROP_SPEC_POWER = 7;     // environment specular highlight size
const WORLD3D_ACTOR_SPECULAR = 0;       // main objects specular highlight (group 'actor'); with toon — toon glint brightness
const WORLD3D_ACTOR_SPEC_POWER = 23;    // main objects specular highlight size
// Toon shader (ArcToonPlugin): light from all sources (sun + sky, with shadow) is quantized into bands
const WORLD3D_TOON = 1;                 // 1 — toon shading and silhouette outline, 0 — regular smooth shading without outline
const WORLD3D_TOON_BANDS = 4;           // number of light bands (2..6)
const WORLD3D_TOON_SOFT = 0.02;         // band boundary softness (0 — sharp, 0.5 — almost smooth)
const WORLD3D_TOON_LOW = 0.48;          // brightness of the darkest band (fraction of full)
const WORLD3D_TOON_GROUND = 1;          // 1 — bands on the ground too, 0 — ground is shaded smoothly
const WORLD3D_TOON_SPEC = 0.25;            // toon glint highlight strength (0 — no highlight)
const WORLD3D_TOON_SPEC_SIZE = 0.075;    // highlight threshold (smaller — larger spot)
const WORLD3D_TOON_RIM = 0.28;           // bright rim light along the objects' silhouette edge (0 — none)
const WORLD3D_TOON_RIM_WIDTH = 0.24;    // rim light width
// Ink edges (EdgesRenderer): edges creased more sharply than the threshold
const WORLD3D_TOON_INK = 2;             // 0 — none, 1 — main objects, 2 — environment too
const WORLD3D_TOON_INK_WIDTH = 25;      // line thickness (≈ world px × 100; thinner as the camera moves away)
const WORLD3D_TOON_INK_COLOR = 0x171717; // ink color: ink edges and silhouette outline
const WORLD3D_TOON_INK_ANGLE = 40;      // °: an edge is drawn if the faces are creased more sharply
// Outer silhouette outline: post-effect (HighlightLayer, isStroke), thickness — in screen px
const WORLD3D_TOON_OUTLINE = 2;         // 0 — none, 1 — main objects, 2 — environment too (only when WORLD3D_TOON = 1)
const WORLD3D_TOON_OUTLINE_ACTOR_WIDTH = 1.5;   // screen px: main objects outline
const WORLD3D_TOON_OUTLINE_PROP_WIDTH = 1;  // screen px: environment outline (there is a lot of it in the frame — thinner)
