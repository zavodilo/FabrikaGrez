// ScriptGenerator.js — the script department (Phase В). Genre + budget + writer become a
// screenplay: three acts, scene archetypes, RU dialogue from the MovieData pools, a role
// sheet for casting — and finally the script is COMPILED into a MovieSequencer timeline,
// so the film the player greenlit is the film the player watches.
//
// Pure logic on Rng: no DOM, no pc.*, no engine calls. The screens are HTML strings for the
// 'screen' UI elements (skill ui); clicks come back as data-act="script:…" through
// StudioUI.onAction -> ScriptGenerator.onAction. Every number lives in Constants.js.
//
//   ScriptGenerator.draft(state, { genre, budget, writer, title, sequelOf })  -> Script
//   ScriptGenerator.compile(script, castByKey)                               -> Timeline
//   ScriptGenerator.weekly(state, mgr)                                       -> toasts[]

/** @satisfies {Record<string, any>} */
const ScriptGenerator = {

    // --- content: who is in a film of this genre ------------------------------------------------
    // key — the stable role id used by scenes and by the timeline cast; ru — the credit name;
    // voc — how other characters address them in dialogue ({other}); tier — lead | sup;
    // skill — the PeopleSystem skill that carries the role; w — the share of screen time;
    // sex — a soft preference for casting (never a hard block).
    ROLES: {
        western: [
            { key: 'hero', ru: 'Шериф', voc: 'шериф', tier: 'lead', skill: 'action', w: 1.0, sex: 'm', age: [30, 58] },
            { key: 'villain', ru: 'Бандит', voc: 'незнакомец', tier: 'lead', skill: 'action', w: 0.9, sex: 'm', age: [26, 60] },
            { key: 'love', ru: 'Дочь фермера', voc: 'мисс', tier: 'lead', skill: 'romance', w: 0.7, sex: 'f', age: [19, 40] },
            { key: 'side', ru: 'Бармен', voc: 'бармен', tier: 'sup', skill: 'comedy', w: 0.5, sex: 'm', age: [30, 65] },
            { key: 'mentor', ru: 'Старый ковбой', voc: 'старик', tier: 'sup', skill: 'drama', w: 0.45, sex: 'm', age: [45, 75] },
        ],
        comedy: [
            { key: 'hero', ru: 'Недотёпа', voc: 'дружок', tier: 'lead', skill: 'comedy', w: 1.0, sex: 'm', age: [22, 50] },
            { key: 'villain', ru: 'Строгая тёща', voc: 'сударыня', tier: 'lead', skill: 'drama', w: 0.8, sex: 'f', age: [40, 72] },
            { key: 'love', ru: 'Соседка', voc: 'дорогая', tier: 'lead', skill: 'romance', w: 0.75, sex: 'f', age: [20, 42] },
            { key: 'side', ru: 'Лучший друг', voc: 'приятель', tier: 'sup', skill: 'comedy', w: 0.55, sex: 'm', age: [20, 48] },
            { key: 'mentor', ru: 'Участковый', voc: 'офицер', tier: 'sup', skill: 'drama', w: 0.4, sex: 'm', age: [35, 62] },
        ],
        drama: [
            { key: 'hero', ru: 'Глава семьи', voc: 'отец', tier: 'lead', skill: 'drama', w: 1.0, sex: 'any', age: [32, 66] },
            { key: 'villain', ru: 'Соперник', voc: 'господин', tier: 'lead', skill: 'drama', w: 0.85, sex: 'any', age: [28, 60] },
            { key: 'love', ru: 'Та самая', voc: 'милая', tier: 'lead', skill: 'romance', w: 0.7, sex: 'f', age: [22, 50] },
            { key: 'side', ru: 'Старый друг', voc: 'дружище', tier: 'sup', skill: 'comedy', w: 0.5, sex: 'm', age: [30, 64] },
            { key: 'mentor', ru: 'Свидетель', voc: 'сударь', tier: 'sup', skill: 'drama', w: 0.45, sex: 'any', age: [45, 78] },
        ],
        action: [
            { key: 'hero', ru: 'Агент', voc: 'напарник', tier: 'lead', skill: 'action', w: 1.0, sex: 'm', age: [26, 52] },
            { key: 'villain', ru: 'Террорист', voc: 'мister'.replace('mister', 'господин'), tier: 'lead', skill: 'action', w: 0.9, sex: 'm', age: [28, 58] },
            { key: 'love', ru: 'Заложница', voc: 'мисс', tier: 'lead', skill: 'romance', w: 0.65, sex: 'f', age: [20, 44] },
            { key: 'side', ru: 'Напарник', voc: 'брат', tier: 'sup', skill: 'action', w: 0.55, sex: 'm', age: [24, 50] },
            { key: 'mentor', ru: 'Диспетчер', voc: 'шеф', tier: 'sup', skill: 'drama', w: 0.4, sex: 'any', age: [38, 66] },
        ],
        horror: [
            { key: 'hero', ru: 'Исследователь', voc: 'дружок', tier: 'lead', skill: 'drama', w: 1.0, sex: 'any', age: [24, 50] },
            { key: 'villain', ru: 'Хозяин дома', voc: 'незнакомец', tier: 'lead', skill: 'drama', w: 0.85, sex: 'm', age: [40, 80] },
            { key: 'love', ru: 'Спутница', voc: 'милая', tier: 'lead', skill: 'romance', w: 0.65, sex: 'f', age: [19, 42] },
            { key: 'side', ru: 'Скептик', voc: 'приятель', tier: 'sup', skill: 'comedy', w: 0.5, sex: 'm', age: [22, 48] },
            { key: 'mentor', ru: 'Священник', voc: 'отец', tier: 'sup', skill: 'drama', w: 0.45, sex: 'm', age: [45, 78] },
        ],
        scifi: [
            { key: 'hero', ru: 'Капитан', voc: 'капитан', tier: 'lead', skill: 'action', w: 1.0, sex: 'any', age: [28, 56] },
            { key: 'villain', ru: 'Бортовой ИИ', voc: 'машина', tier: 'lead', skill: 'drama', w: 0.85, sex: 'any', age: [1, 99] },
            { key: 'love', ru: 'Врач корабля', voc: 'доктор', tier: 'lead', skill: 'romance', w: 0.65, sex: 'f', age: [24, 48] },
            { key: 'side', ru: 'Инженер', voc: 'приятель', tier: 'sup', skill: 'comedy', w: 0.55, sex: 'm', age: [22, 52] },
            { key: 'mentor', ru: 'Учёный', voc: 'профессор', tier: 'sup', skill: 'drama', w: 0.45, sex: 'any', age: [40, 74] },
        ],
        war: [
            { key: 'hero', ru: 'Командир', voc: 'командир', tier: 'lead', skill: 'action', w: 1.0, sex: 'any', age: [28, 52] },
            { key: 'villain', ru: 'Офицер противника', voc: 'господин', tier: 'lead', skill: 'action', w: 0.85, sex: 'm', age: [32, 58] },
            { key: 'love', ru: 'Санитарка', voc: 'сестра', tier: 'lead', skill: 'romance', w: 0.7, sex: 'f', age: [20, 42] },
            { key: 'side', ru: 'Радист', voc: 'радист', tier: 'sup', skill: 'comedy', w: 0.55, sex: 'm', age: [19, 40] },
            { key: 'mentor', ru: 'Ветеран', voc: 'отец', tier: 'sup', skill: 'drama', w: 0.5, sex: 'm', age: [45, 70] },
        ],
        adventure: [
            { key: 'hero', ru: 'Искатель', voc: 'капитан', tier: 'lead', skill: 'action', w: 1.0, sex: 'any', age: [24, 50] },
            { key: 'villain', ru: 'Коллекционер', voc: 'господин', tier: 'lead', skill: 'drama', w: 0.85, sex: 'm', age: [35, 65] },
            { key: 'love', ru: 'Проводница', voc: 'мисс', tier: 'lead', skill: 'romance', w: 0.75, sex: 'f', age: [20, 44] },
            { key: 'side', ru: 'Штурман', voc: 'штурман', tier: 'sup', skill: 'comedy', w: 0.55, sex: 'm', age: [22, 50] },
            { key: 'mentor', ru: 'Профессор', voc: 'профессор', tier: 'sup', skill: 'drama', w: 0.45, sex: 'any', age: [45, 75] },
        ],
        noir: [
            { key: 'hero', ru: 'Частный детектив', voc: 'детектив', tier: 'lead', skill: 'drama', w: 1.0, sex: 'any', age: [30, 58] },
            { key: 'villain', ru: 'Хозяин города', voc: 'господин', tier: 'lead', skill: 'drama', w: 0.9, sex: 'm', age: [38, 70] },
            { key: 'love', ru: 'Роковая клиентка', voc: 'мадам', tier: 'lead', skill: 'romance', w: 0.8, sex: 'f', age: [24, 46] },
            { key: 'side', ru: 'Информатор', voc: 'приятель', tier: 'sup', skill: 'comedy', w: 0.5, sex: 'm', age: [20, 50] },
            { key: 'mentor', ru: 'Редактор', voc: 'шеф', tier: 'sup', skill: 'drama', w: 0.45, sex: 'any', age: [45, 72] },
        ],
        musical: [
            { key: 'hero', ru: 'Солист', voc: 'дорогой', tier: 'lead', skill: 'romance', w: 1.0, sex: 'any', age: [20, 42] },
            { key: 'love', ru: 'Прима', voc: 'мисс', tier: 'lead', skill: 'romance', w: 0.95, sex: 'f', age: [19, 40] },
            { key: 'villain', ru: 'Продюсер', voc: 'босс', tier: 'lead', skill: 'drama', w: 0.75, sex: 'm', age: [35, 66] },
            { key: 'side', ru: 'Тапёр', voc: 'маэстро', tier: 'sup', skill: 'comedy', w: 0.55, sex: 'm', age: [22, 55] },
            { key: 'mentor', ru: 'Балетмейстер', voc: 'учитель', tier: 'sup', skill: 'drama', w: 0.45, sex: 'any', age: [40, 70] },
        ],
        romance: [
            { key: 'hero', ru: 'Он', voc: 'милый', tier: 'lead', skill: 'romance', w: 0.95, sex: 'm', age: [22, 48] },
            { key: 'love', ru: 'Она', voc: 'милая', tier: 'lead', skill: 'romance', w: 1.0, sex: 'f', age: [20, 46] },
            { key: 'villain', ru: 'Соперник', voc: 'господин', tier: 'lead', skill: 'drama', w: 0.7, sex: 'm', age: [26, 55] },
            { key: 'side', ru: 'Подруга', voc: 'дорогая', tier: 'sup', skill: 'comedy', w: 0.5, sex: 'f', age: [20, 44] },
            { key: 'mentor', ru: 'Отец невесты', voc: 'сударь', tier: 'sup', skill: 'drama', w: 0.4, sex: 'm', age: [48, 76] },
        ],
    },

    // --- content: scene archetypes ---------------------------------------------------------------
    // act — where the archetype may appear; needs — role keys the scene wants (a = speaker one,
    // b = the partner); moods — which dialogue pools it draws from; sets — preferred slot of the
    // set (see MovieData.SET_SLOTS); tod — time of day; recipe — the shot list (see RECIPES).
    KINDS: {
        intro: { ru: 'Экспозиция', act: 1, needs: ['hero'], moods: ['neutral'], slot: 'wide', tod: 'day', recipe: 'intro' },
        meet: { ru: 'Знакомство', act: 1, needs: ['hero', 'love'], moods: ['neutral', 'surprise'], slot: 'c', tod: 'day', recipe: 'meet' },
        setup: { ru: 'Разговор о главном', act: 1, needs: ['hero', 'mentor'], moods: ['neutral', 'parting'], slot: 'a', tod: 'day', recipe: 'talk' },
        threat: { ru: 'Угроза', act: 2, needs: ['hero', 'villain'], moods: ['threat', 'villain'], slot: 'c', tod: 'day', recipe: 'threat' },
        chase: { ru: 'Погоня', act: 2, needs: ['hero', 'villain'], moods: ['threat', 'surprise'], slot: 'wide', tod: 'day', recipe: 'chase' },
        fight: { ru: 'Драка', act: 2, needs: ['hero', 'villain'], moods: ['anger', 'hero'], slot: 'c', tod: 'day', recipe: 'fight' },
        romance: { ru: 'Романтика', act: 2, needs: ['hero', 'love'], moods: ['love', 'humor'], slot: 'a', tod: 'sunset', recipe: 'romance' },
        reveal: { ru: 'Разоблачение', act: 2, needs: ['hero', 'side'], moods: ['surprise', 'fear'], slot: 'b', tod: 'night', recipe: 'reveal' },
        comic: { ru: 'Передышка', act: 2, needs: ['side', 'hero'], moods: ['humor', 'neutral'], slot: 'c', tod: 'day', recipe: 'comic' },
        crisis: { ru: 'Кризис', act: 2, needs: ['hero', 'mentor'], moods: ['fear', 'parting'], slot: 'a', tod: 'night', recipe: 'crisis' },
        climax: { ru: 'Кульминация', act: 3, needs: ['hero', 'villain'], moods: ['threat', 'hero'], slot: 'wide', tod: 'sunset', recipe: 'climax' },
        coda: { ru: 'Финал', act: 3, needs: ['hero', 'love'], moods: ['love', 'parting'], slot: 'wide', tod: 'day', recipe: 'coda' },
    },

    // Genre flavour: which act-2 archetypes the film leans on, and how often.
    MIX: {
        western: { threat: 3, chase: 3, fight: 3, romance: 2, comic: 1, reveal: 1, crisis: 1 },
        comedy: { comic: 4, romance: 2, reveal: 2, chase: 2, threat: 1, crisis: 1, fight: 1 },
        drama: { talk: 0, reveal: 3, crisis: 3, romance: 2, comic: 1, threat: 2, fight: 1 },
        action: { chase: 4, fight: 4, threat: 2, reveal: 2, crisis: 1, romance: 1, comic: 1 },
        horror: { reveal: 4, crisis: 3, threat: 3, chase: 2, fight: 1, romance: 1, comic: 1 },
        scifi: { reveal: 3, threat: 3, chase: 2, crisis: 2, fight: 2, comic: 1, romance: 1 },
        romance: { romance: 4, comic: 3, reveal: 2, crisis: 2, threat: 1, chase: 1, talk: 0 },
        noir: { threat: 4, reveal: 4, crisis: 3, talk: 0, chase: 2, comic: 1, romance: 1 },
        war: { threat: 4, crisis: 3, chase: 3, fight: 3, comic: 1, romance: 1, reveal: 1 },
        adventure: { chase: 4, reveal: 3, comic: 3, fight: 2, crisis: 2, romance: 1, threat: 2 },
        musical: { romance: 4, comic: 4, reveal: 2, crisis: 2, chase: 1, threat: 1, talk: 0 },
    },

    // Shot lists per recipe: [camera type, subject] where subject is 'a' | 'b' | 'ab' | 'c'
    // (a — the speaker role, b — the partner, ab — both, c — a set anchor, i.e. a wide).
    RECIPES: {
        intro: [['wide', 'c'], ['wide', 'c'], ['medium', 'a']],
        meet: [['wide', 'c'], ['duo', 'ab'], ['close', 'a'], ['close', 'b']],
        talk: [['medium', 'a'], ['over', 'ab'], ['over', 'ba'], ['close', 'b']],
        threat: [['wide', 'c'], ['duo', 'ab'], ['dutch', 'a'], ['close', 'b']],
        chase: [['wide', 'c'], ['medium', 'a'], ['wide', 'c'], ['low', 'b']],
        fight: [['wide', 'c'], ['duo', 'ab'], ['close', 'a'], ['medium', 'b'], ['duo', 'ab']],
        romance: [['wide', 'c'], ['duo', 'ab'], ['close', 'a'], ['close', 'b']],
        reveal: [['medium', 'a'], ['close', 'a'], ['close', 'b']],
        comic: [['medium', 'a'], ['over', 'ab'], ['close', 'b']],
        crisis: [['low', 'a'], ['close', 'a'], ['duo', 'ab']],
        climax: [['wide', 'c'], ['close', 'a'], ['close', 'b'], ['duo', 'ab'], ['crane', 'c']],
        coda: [['medium', 'a'], ['wide', 'c'], ['crane', 'c']],
    },

    // Seconds per camera type: the cutting rhythm of the film.
    SHOT_DUR: { wide: 6.2, crane: 6.8, medium: 4.6, close: 3.5, dutch: 3.1, low: 4.1, duo: 4.3, over: 4.4 },

    // SFX by scene archetype (ids of MovieData.SFX).
    KIND_SFX: {
        intro: [], meet: ['step'], setup: ['door'], threat: ['sting_hit'], chase: ['carhorn', 'step'],
        fight: ['punch', 'glass'], romance: ['kiss'], reveal: ['gasp', 'thunder'], comic: ['laugh'],
        crisis: ['thunder'], climax: ['gunshot', 'explosion'], coda: ['applause'],
    },

    // Time of day in RU for the script reader.
    TOD_RU: { day: 'день', sunset: 'закат', night: 'ночь' },

    // The ideal budget of a genre (quality peaks around it; below it the film looks cheap).
    IDEAL_BUDGET: { western: 350000, comedy: 300000, drama: 400000, action: 900000, horror: 450000, scifi: 1200000, romance: 350000, noir: 400000, musical: 550000, war: 700000, adventure: 600000 },

    // Logline templates: {hero}, {villain}, {love}, {city}, {g} — genre name.
    LOGLINES: [
        'В городе {city} {hero} бросает вызов тому, кого все боятся: {villain}.',
        '{hero} и {love} встречаются там, где не должны были, — и {city} уже не будет прежним.',
        'Пока {villain} тянет время, {hero} решает: закон или совесть.',
        'Одна ночь в {city} меняет всё для {hero} — и для {love}.',
        '{hero} возвращался домой. Вместо дома нашёл тайну, которую {city} прятал сорок лет.',
        '{villain} думал, что купил этот город. {hero} думает иначе.',
        'Между долгом и чувством {hero} выбирает {city}. Город запомнит этот выбор.',
    ],

    _nextId: 1,

    // Every number comes from Constants.js (kit invariant). The typeof-guarded reads keep the
    // module loadable on its own in the node tests, exactly like the other game modules do it.
    cfg() {
        const U = 'undefined';
        return {
            writeWeeks: typeof SCRIPT_WRITE_WEEKS !== U ? SCRIPT_WRITE_WEEKS : 2,
            qualityBase: typeof SCRIPT_QUALITY_BASE !== U ? SCRIPT_QUALITY_BASE : 3.5,
            writerBonus: typeof SCRIPT_WRITER_BONUS !== U ? SCRIPT_WRITER_BONUS : 0.45,
            qualitySpread: typeof SCRIPT_QUALITY_SPREAD !== U ? SCRIPT_QUALITY_SPREAD : 0.9,
            heatBonus: typeof SCRIPT_HEAT_BONUS !== U ? SCRIPT_HEAT_BONUS : 0.12,
            cheapPenalty: typeof SCRIPT_CHEAP_PENALTY !== U ? SCRIPT_CHEAP_PENALTY : 1.1,
            richPenalty: typeof SCRIPT_RICH_PENALTY !== U ? SCRIPT_RICH_PENALTY : 0.5,
            quickPenalty: typeof SCRIPT_QUICK_PENALTY !== U ? SCRIPT_QUICK_PENALTY : 2.2,
            scenesMin: typeof SCRIPT_SCENES_MIN !== U ? SCRIPT_SCENES_MIN : 6,
            scenesMax: typeof SCRIPT_SCENES_MAX !== U ? SCRIPT_SCENES_MAX : 18,
            orderFee: typeof SCRIPT_ORDER_FEE !== U ? SCRIPT_ORDER_FEE : 15000,
            orderFrac: typeof SCRIPT_ORDER_BUDGET_FRAC !== U ? SCRIPT_ORDER_BUDGET_FRAC : 0.06,
            maxOrders: typeof SCRIPT_MAX_ORDERS !== U ? SCRIPT_MAX_ORDERS : 3,
            scenesPerWeek: typeof SHOOT_SCENES_PER_WEEK !== U ? SHOOT_SCENES_PER_WEEK : 2,
            budgetMin: typeof MOVIE_BUDGET_MIN !== U ? MOVIE_BUDGET_MIN : 100000,
            budgetMax: typeof MOVIE_BUDGET_MAX !== U ? MOVIE_BUDGET_MAX : 3000000,
            budgetDefault: typeof MOVIE_BUDGET_DEFAULT !== U ? MOVIE_BUDGET_DEFAULT : 400000,
        };
    },

    // --- the wizard state (screen-local, never saved) ---------------------------------------------

    /** @type {{ genre: string, budget: number, writerId: string, title: string, sequelOf: string }} */
    wizard: null,

    _wiz(state) {
        if (!this.wizard) {
            const c = this.cfg();
            const w = (state.staff || []).find((p) => p.role === 'writer') || null;
            this.wizard = {
                genre: 'western',
                budget: Math.min(c.budgetMax, Math.max(c.budgetMin, c.budgetDefault)),
                writerId: w ? w.id : '',
                title: '',
                sequelOf: '',
            };
        }
        return this.wizard;
    },

    resetWizard() { this.wizard = null; },

    // --- generation ------------------------------------------------------------------------------

    /** The roles a script of this genre and budget asks for (leads first, then supports). */
    rolesFor(genre, budget) {
        const all = (this.ROLES[genre] || this.ROLES.drama).slice();
        const c = this.cfg();
        // Budget decides how many supports the film can carry; two leads are the floor.
        let leads = 2, sups = 1;
        if (budget >= 250000) { leads = 3; sups = 1; }
        if (budget >= 700000) { leads = 3; sups = 2; }
        if (budget >= 1500000) { leads = 4; sups = 2; }
        if (budget >= 2400000) { leads = 5; sups = 3; }
        leads = Math.min(leads, all.filter((r) => r.tier === 'lead').length);
        sups = Math.min(sups, all.filter((r) => r.tier === 'sup').length);
        const out = [];
        for (const r of all) if (r.tier === 'lead' && out.length < leads) out.push(r);
        const supStart = out.length;
        for (const r of all) if (r.tier === 'sup' && out.length < supStart + sups) out.push(r);
        // Screen time normalised so the shares sum to 1.
        let tot = 0;
        for (const r of out) tot += r.w;
        return out.map((r) => Object.assign({}, r, { share: r.w / (tot || 1) }));
    },

    /** How many scenes a budget buys. */
    scenesFor(budget) {
        const c = this.cfg();
        const t = Math.max(0, Math.min(1, (budget - c.budgetMin) / ((c.budgetMax - c.budgetMin) || 1)));
        return Math.round(c.scenesMin + t * (c.scenesMax - c.scenesMin));
    },

    /** Extras (non-speaking background) — 2..6 by budget. */
    extrasFor(budget) {
        return budget < 250000 ? 2 : budget < 700000 ? 3 : budget < 1500000 ? 4 : 6;
    },

    /**
     * The script quality 0..10: writer skill carries it, the budget must fit the genre,
     * a hot genre is easier to sell, luck adds spread.
     */
    qualityOf(genre, budget, writerSkill, year, r, penalty) {
        const c = this.cfg();
        const ideal = this.IDEAL_BUDGET[genre] || 400000;
        const ratio = budget / ideal;
        // Cheap looks cheap; overspending on a small story wastes money without adding quality.
        let fit = 0;
        if (ratio < 0.55) fit = -c.cheapPenalty * (1 - ratio / 0.55);
        else if (ratio <= 1.9) fit = 0.35 * Math.sin(Math.PI * Math.min(1, (ratio - 0.55) / 1.35));
        else fit = -c.richPenalty * Math.min(1, (ratio - 1.9) / 2);
        const heat = MovieData.heat ? MovieData.heat(genre, year) : 6;
        const heatFit = (heat - 5) * c.heatBonus;
        const luck = r ? r.gauss() * c.qualitySpread : 0;
        const q = c.qualityBase + writerSkill * c.writerBonus + fit + heatFit + luck - (penalty || 0);
        return Math.round(Math.max(0.4, Math.min(10, q)) * 100) / 100;
    },

    /** A title from the genre's word bank (or the player's own). */
    titleFor(genre, r, sequelOf) {
        const T = (MovieData.TITLES[genre] || MovieData.TITLES.drama);
        const base = r.pick(T.a) + ' ' + r.pick(T.n);
        if (!sequelOf) return base;
        const m = /(\d+)$/.exec(sequelOf.title || '');
        const n = m ? Number(m[1]) + 1 : 2;
        return (sequelOf.title || base).replace(/\s*\d+$/, '') + ' ' + n;
    },

    loglineFor(genre, roles, city, r) {
        const byKey = {};
        for (const ro of roles) byKey[ro.key] = ro.ru;
        const t = r.pick(this.LOGLINES);
        return t
            .replace(/\{city\}/g, city)
            .replace(/\{hero\}/g, (byKey.hero || 'герой').toLowerCase())
            .replace(/\{villain\}/g, (byKey.villain || 'злодей').toLowerCase())
            .replace(/\{love\}/g, (byKey.love || 'та самая').toLowerCase())
            .replace(/\{g\}/g, (MovieData.GENRES[genre] || {}).ru || genre);
    },

    /** The act structure: act 1 sets the table, act 2 escalates, act 3 pays off. */
    _structure(genre, sceneCount, r) {
        const mix = this.MIX[genre] || this.MIX.drama;
        const kinds = Object.keys(this.KINDS).filter((k) => this.KINDS[k].act === 2 && (mix[k] || 0) > 0);
        const weights = kinds.map((k) => mix[k] || 1);
        const mid = Math.max(2, sceneCount - 4);      // act 2 length
        const out = ['intro'];
        // Act 1: a meeting and a statement of the stakes.
        out.push(r.chance(0.6) ? 'meet' : 'setup');
        out.push('threat');
        // Act 2: escalation, never the same archetype twice in a row.
        let prev = 'threat';
        for (let i = 0; i < mid; i++) {
            let k = r.weighted(kinds, weights);
            let guard = 0;
            while (k === prev && guard++ < 6) k = r.weighted(kinds, weights);
            out.push(k);
            prev = k;
        }
        // Act 3.
        out.push('climax');
        out.push('coda');
        return out.slice(0, Math.max(4, sceneCount));
    },

    /**
     * Draft the whole screenplay: roles, scenes with dialogue, quality. Deterministic from the
     * seed — the same seed and the same inputs give the same film, so a save replays it exactly.
     * @returns {Script}
     */
    draft(state, opts) {
        const o = opts || {};
        const c = this.cfg();
        const genre = o.genre && MovieData.GENRES[o.genre] ? o.genre : 'western';
        const budget = Math.max(c.budgetMin, Math.min(c.budgetMax, Math.round(o.budget || c.budgetDefault)));
        const r = Rng.create(o.seed != null ? o.seed : ('script-' + Date.now() + '-' + Math.floor(Math.random() * 1e9)));
        const roles = this.rolesFor(genre, budget);
        const city = r.pick(MovieData.CITIES);
        const title = (o.title && String(o.title).trim()) || this.titleFor(genre, r, o.sequelOf);
        const writer = o.writer || null;
        const wSkill = writer ? (writer.skills[(MovieData.GENRES[genre] || {}).skill] || 0) : 0;
        const quality = this.qualityOf(genre, budget, wSkill, state ? state.year : 1950, r, o.penalty || 0);

        /** @type {Script} */
        const sc = {
            id: 'sc' + (this._nextId++) + '-' + r.range(1000, 9999),
            title: title,
            genre: genre,
            year: state ? state.year : 1950,
            city: city,
            budget: budget,
            seed: r.seed >>> 0,
            quality: quality,
            logline: this.loglineFor(genre, roles, city, r),
            writerId: writer ? writer.id : '',
            writerName: writer ? writer.name : 'студийный сценарист',
            writerSkill: wSkill,
            sequelOf: o.sequelOf ? o.sequelOf.id : '',
            roles: roles,
            extras: this.extrasFor(budget),
            scenes: [],
            cast: null,          // roleKey -> personId (CastingSystem fills it)
            timeline: null,      // compiled after the cast is complete
            draftedWeek: state ? state.weekIdx : 0,
            state: 'ready',
        };

        // The scenes. `usedLines` is shared by the whole film: a line said in act 1 must not
        // come back in act 3 — repetition is the first thing a viewer notices in a cheap picture.
        const kinds = this._structure(genre, this.scenesFor(budget), r);
        const G = MovieData.GENRES[genre];
        const usedLines = {};
        let n = 0;
        for (const kind of kinds) {
            n++;
            const K = this.KINDS[kind] || this.KINDS.intro;
            const set = this._pickSet(G, kind, r, state);
            const scene = {
                idx: n,
                act: K.act,
                kind: kind,
                set: set,
                timeOfDay: K.tod,
                tint: K.tod === 'night' ? 'night' : K.tod === 'sunset' ? 'sunset' : null,
                label: 'Сцена ' + n + '. ' + K.ru + ' — ' + (MovieData.SET_INFO[set] ? MovieData.SET_INFO[set].ru : set),
                roles: this._sceneRoles(sc.roles, K, r),
                moods: K.moods,
                lines: [],
                quality: Math.round(Math.max(0.4, Math.min(10, quality + r.gauss() * 0.7)) * 100) / 100,
                narr: kind === 'intro' || (kind === 'climax' && r.chance(0.4)) ? this._narr(genre, city, r) : '',
                props: this._sceneProps(G, kind, r),
            };
            scene.lines = this._lines(scene, sc, r, usedLines);
            sc.scenes.push(scene);
        }
        return sc;
    },

    /** Which set the scene films in: a genre set the studio owns is preferred, but a great
     *  scene is not cancelled because the lot lacks the decoration (quality pays for it later). */
    _pickSet(G, kind, r, state) {
        const owned = state && state.ownedSets ? state.ownedSets : {};
        const pool = (G.sets || ['western']).slice();
        const own = pool.filter((s) => owned[s]);
        // Interior archetypes want an interior set when one is available.
        const indoor = (kind === 'reveal' || kind === 'romance' || kind === 'crisis' || kind === 'comic');
        const pref = (own.length ? own : pool).filter((s) => indoor ? (MovieData.SET_INFO[s] || {}).indoor : true);
        const list = pref.length ? pref : (own.length ? own : pool);
        return r.pick(list);
    },

    _sceneRoles(roles, K, r) {
        const out = [];
        for (const need of K.needs) {
            const ro = roles.find((x) => x.key === need);
            if (ro && out.indexOf(ro.key) < 0) out.push(ro.key);
        }
        // A support role drops in now and then so the film does not feel like a duet.
        if (out.length < 3 && r.chance(0.45)) {
            const spare = roles.filter((x) => out.indexOf(x.key) < 0 && x.tier === 'sup');
            if (spare.length) out.push(r.pick(spare).key);
        }
        return out;
    },

    _sceneProps(G, kind, r) {
        const pool = (G.props || []).slice();
        if (!pool.length) return [];
        const out = [];
        const n = kind === 'chase' ? 2 : r.chance(0.55) ? 1 : 0;
        for (let i = 0; i < n && pool.length; i++) {
            const id = pool.splice(r.range(0, pool.length - 1), 1)[0];
            if (id === 'dchair') continue;              // the director's chair is a lot prop
            out.push(id);
        }
        return out;
    },

    _narr(genre, city, r) {
        const pool = (MovieData.NARR[genre] || []).concat(MovieData.NARR.COMMON || []);
        return String(r.pick(pool) || '').replace(/\{city\}/g, city);
    },

    /** Dialogue for a scene: alternating speakers from the genre/mood pools, slots filled.
     *  used — lines already spent ANYWHERE in the film, so nothing repeats. */
    _lines(scene, script, r, used) {
        const G = script.genre;
        const byKey = {};
        for (const ro of script.roles) byKey[ro.key] = ro;
        const speakers = scene.roles.filter((k) => byKey[k]);
        if (!speakers.length) return [];
        const item = (MovieData.SET_INFO[scene.set] || {}).ru || 'это место';
        const want = scene.kind === 'intro' ? 1 : scene.kind === 'climax' ? 4 : r.range(2, 4);
        used = used || {};
        const out = [];
        let turn = r.range(0, speakers.length - 1);
        for (let i = 0; i < want; i++) {
            const key = speakers[turn % speakers.length];
            turn++;
            // Try the scene's own moods first, then any mood of the genre, then COMMON:
            // the film keeps talking instead of falling silent when a pool runs dry.
            let mood = null, pool = [];
            for (const attempt of [0, 1, 2]) {
                mood = attempt === 0 ? r.pick(scene.moods)
                    : attempt === 1 ? r.pick(Object.keys((MovieData.DIALOGS[G] || {})))
                        : r.pick(Object.keys(MovieData.DIALOGS.COMMON || {}));
                if (!mood) continue;
                pool = this._pool(G, mood, used);
                if (pool.length) break;
            }
            if (!pool.length) continue;
            const raw = r.pick(pool);
            used[mood + '|' + raw] = 1;
            const other = speakers.find((k) => k !== key);
            out.push({
                role: key,
                mood: mood,
                text: this._fill(raw, {
                    other: other && byKey[other] ? byKey[other].voc : 'друг',
                    me: byKey[key] ? byKey[key].voc : 'я',
                    city: script.city,
                    item: item,
                }),
            });
        }
        return out;
    },

    _pool(genre, mood, used) {
        const g = (MovieData.DIALOGS[genre] || {})[mood] || [];
        const c = (MovieData.DIALOGS.COMMON || {})[mood] || [];
        const all = g.concat(c);
        const spent = (t) => {
            for (const k of Object.keys(used)) if (k.slice(k.indexOf('|') + 1) === t) return true;
            return false;
        };
        const fresh = all.filter((t) => !spent(t));
        return fresh;
    },

    _fill(text, vars) {
        return String(text)
            .replace(/\{other\}/g, vars.other)
            .replace(/\{me\}/g, vars.me)
            .replace(/\{city\}/g, vars.city)
            .replace(/\{item\}/g, vars.item);
    },

    // --- orders: a writer needs weeks --------------------------------------------------------------

    /** The price of commissioning a script. */
    orderCost(budget, writer) {
        const c = this.cfg();
        const fee = c.orderFee + Math.round(budget * c.orderFrac);
        const w = writer ? Math.round(writer.salary * c.writeWeeks) : 0;
        return fee + w;
    },

    /** Commission a writer: the order lands in state.orders and finishes after N weeks. */
    order(state, mgr, opts) {
        const c = this.cfg();
        const o = opts || {};
        state.orders = state.orders || [];
        if (state.orders.length >= c.maxOrders) return { ok: false, why: 'Сценарный отдел перегружен (максимум ' + c.maxOrders + ' заказа).' };
        const writer = (state.staff || []).find((p) => p.id === o.writerId && p.role === 'writer') || null;
        const cost = this.orderCost(o.budget, writer);
        if (!mgr.canAfford(cost)) return { ok: false, why: 'Не хватает денег: нужно ' + StudioUI_money(cost) + '.' };
        mgr.pay(cost, 'Заказ сценария');
        const order = {
            id: 'ord' + (state.weekIdx) + '-' + state.orders.length,
            genre: o.genre, budget: o.budget, writerId: writer ? writer.id : '',
            title: o.title || '', sequelOf: o.sequelOf || null,
            weeksLeft: c.writeWeeks, cost: cost, quick: false,
        };
        state.orders.push(order);
        mgr.pushNews('Заказан сценарий: ' + (MovieData.GENRES[o.genre] || {}).ru + ' «' + (order.title || 'без названия') + '» за ' + StudioUI_money(cost) + '.', '');
        return { ok: true, order: order };
    },

    /** Write it in-house right now: free of waiting, weaker on the page. */
    quickDraft(state, mgr, opts) {
        const c = this.cfg();
        const sc = this.draft(state, Object.assign({}, opts, { penalty: c.quickPenalty, seed: (state.seed + state.weekIdx * 7919) >>> 0 }));
        sc.state = 'ready';
        sc.writerName = 'на скорую руку';
        state.scripts.push(sc);
        mgr.pushNews('На коленке написан сценарий «' + sc.title + '» (качество ' + sc.quality.toFixed(1) + ').', '');
        return sc;
    },

    /** Called from StudioManager.tickWeek: advance the orders, hand back the toasts. */
    weekly(state, mgr) {
        const out = [];
        if (!state.orders || !state.orders.length) return out;
        for (let i = state.orders.length - 1; i >= 0; i--) {
            const o = state.orders[i];
            o.weeksLeft--;
            if (o.weeksLeft > 0) continue;
            state.orders.splice(i, 1);
            const writer = (state.staff || []).find((p) => p.id === o.writerId) || null;
            const sc = this.draft(state, {
                genre: o.genre, budget: o.budget, writer: writer, title: o.title,
                sequelOf: o.sequelOf, seed: ((state.seed ^ Math.imul(state.weekIdx + 1, 40503)) >>> 0) || 1,
            });
            sc.orderId = o.id;
            state.scripts.push(sc);
            out.push('📜 Сценарий готов: «' + sc.title + '» — ' + (MovieData.GENRES[sc.genre] || {}).ru + ', качество ' + sc.quality.toFixed(1));
            mgr.pushNews('Сценарист ' + sc.writerName + ' сдал «' + sc.title + '»: ' + sc.scenes.length + ' сцен, качество ' + sc.quality.toFixed(1) + '.', sc.quality >= 7 ? 'good' : '');
            if (writer) { writer.exp = (writer.exp || 0) + 3; writer.mood = Math.min(100, writer.mood + 4); }
        }
        return out;
    },

    // --- compilation: script + cast -> MovieSequencer timeline ----------------------------------------

    /**
     * Build the watchable film. castByKey maps a role key to a Person; extras are generated
     * deterministically from the script seed. The result is plain JSON of the timeline contract.
     * @param {Script} script
     * @param {Record<string, Person>} castByKey
     * @param {StudioState} state
     * @returns {any} timeline
     */
    compile(script, castByKey, state) {
        const r = Rng.create((script.seed ^ 0x5eed) >>> 0);
        const cast = [];
        const idOf = {};        // roleKey -> actor id
        let li = 0;
        for (const role of script.roles) {
            const p = castByKey ? castByKey[role.key] : null;
            if (!p) continue;
            li++;
            const id = 'a' + li;
            idOf[role.key] = id;
            cast.push({
                id: id, role: role.ru, name: p.name, personId: p.id,
                look: this._look(p, r, script.genre),
            });
        }
        // Background: generated faces, no Person behind them (they never speak).
        const ex = script.extras || 2;
        for (let i = 0; i < ex; i++) {
            const look = PeopleSystem.randomLook(r);
            const nm = (look.gender === 'm' ? r.pick(MovieData.NAMES_M) : r.pick(MovieData.NAMES_F)) + ' ' + r.pick(MovieData.NAMES_LAST);
            cast.push({ id: 'e' + (i + 1), role: 'Массовка', name: nm, look: this._costume(look, r, script.genre) });
        }
        const extraIds = cast.filter((m) => /^e/.test(m.id)).map((m) => m.id);

        const scenes = [];
        const n = script.scenes.length;
        for (let i = 0; i < n; i++) {
            const sc = script.scenes[i];
            const slots = (MovieData.SET_SLOTS || {})[sc.set] || null;
            const tl = this._scene(sc, script, idOf, extraIds, slots, r, i === n - 1);
            if (tl) scenes.push(tl);
        }

        return {
            title: script.title,
            genre: script.genre,
            year: script.year,
            studio: state ? state.studioName : 'Фабрика Грёз',
            seed: script.seed,
            music: (MovieData.GENRES[script.genre] || {}).music,
            cast: cast,
            credits: {
                director: this._creditName(state, 'director'),
                writer: script.writerName || '—',
                composer: 'Оркестр студии «' + (state ? state.studioName : 'Фабрика Грёз') + '»',
            },
            scenes: scenes,
        };
    },

    _creditName(state, role) {
        const p = state && state.staff ? state.staff.find((x) => x.role === role) : null;
        return p ? p.name : role === 'director' ? 'Режиссёр студии' : '—';
    },

    /** Base look + a genre costume: the same actor reads differently in a western and in sci-fi. */
    _look(person, r, genre) {
        return this._costume(Object.assign({}, person.look || {}), r, genre, person.gender);
    },

    _costume(look, r, genre, gender) {
        const g = gender || look.gender || 'm';
        const cos = PeopleSystem.costumeFor(r, genre, g);
        const out = Object.assign({}, look, cos);
        out.gender = g;
        // A hat only survives the genres that wear one.
        if (genre !== 'western' && r.chance(0.7)) out.hat = '';
        return out;
    },

    /** Local (lx, ly) of a slot's anchor, or null when the set has no table for it. */
    _slotXY(set, slots, slotName) {
        const name = (slots || {})[slotName] || slotName;
        const xy = ((MovieData.ANCHOR_XY || {})[set] || {})[name];
        return Array.isArray(xy) ? xy : null;
    },

    /** Map-space bearing in degrees (x right, y down): the direction from one point to another. */
    _bearing(fromXY, toXY) {
        return Math.atan2(toXY[1] - fromXY[1], toXY[0] - fromXY[0]) * 180 / Math.PI;
    },

    /**
     * Staging headings and camera azimuths. Actors are turned to FACE their scene partner and
     * the close/medium cameras are pinned to the acting axis (az = bearing from the partner to
     * the speaker), so a close-up sits BETWEEN the two speakers — inside the set. Deriving them
     * from an anchor's stored heading put the camera behind an interior wall, and the wall
     * filled the whole frame.
     */
    _facing(set, slots, ids, xyOf) {
        const out = {};
        const a = ids[0], b = ids[1];
        const pa = xyOf(a), pb = b ? xyOf(b) : null;
        if (pa && pb) {
            out[a] = Math.round(this._bearing(pa, pb));
            out[b] = Math.round(this._bearing(pb, pa));
            for (let i = 2; i < ids.length; i++) {
                const px = xyOf(ids[i]);
                if (px) out[ids[i]] = Math.round(this._bearing(px, pa));
            }
        } else if (pa) {
            // A lone speaker addresses the set's open side — which is exactly where their singles
            // are shot from, so the lens always catches the face, never the back.
            const w = this._slotXY(set, slots, 'enter') || this._slotXY(set, slots, 'wide') || this._slotXY(set, slots, 'center');
            out[a] = w ? Math.round(this._bearing(pa, w)) : 0;
        }
        return out;
    },

    /** One script scene -> one timeline scene. */
    _scene(sc, script, idOf, extraIds, slots, r, isLast) {
        const K = this.KINDS[sc.kind] || this.KINDS.intro;
        const S = slots || { wide: 'center', a: 'center', b: 'center', c: 'center', d: 'center', e: 'center', f: 'center', enter: 'center' };
        // The speaking parts of this scene, resolved to actor ids.
        const keys = (sc.roles || []).filter((k) => idOf[k]);
        if (!keys.length) return null;
        const A = idOf[keys[0]];
        const B = keys.length > 1 ? idOf[keys[1]] : null;

        // Staging: distinct anchors so nobody stands inside anybody.
        const order = ['a', 'b', 'c', 'd', 'e', 'f'];
        const at = {};
        // Two things in one staging point z-fight and read as a bug: actors, crowd and props all
        // draw from ONE registry of taken anchors, so no pair ever shares a spot.
        const taken = {};
        // The pool is every anchor the set actually declares, not just the seven slots: a big
        // cast plus crowd plus props needs more points than the slot table has.
        // Never stage anyone on the master shot's look-at point (or the room centre): an object
        // there sits between the lens and the whole set and blocks the establishing frame.
        const blocked = {};
        if (S.wide) blocked[S.wide] = 1;
        if (S.center) blocked[S.center] = 1;
        const pool = Object.keys((MovieData.ANCHOR_XY || {})[sc.set] || {}).filter((n) => !blocked[n]);
        const prefer = order.map((o) => S[o]).filter((n) => n && !blocked[n]);
        const pickSlot = () => {
            for (const name of prefer) if (!taken[name]) { taken[name] = 1; return name; }
            for (const name of pool) if (!taken[name]) { taken[name] = 1; return name; }
            return null;                       // no free point: better absent than overlapping
        };
        for (const k of keys) { at[idOf[k]] = pickSlot() || S.a; }
        const ids = keys.map((k) => idOf[k]);
        const anchorXY = (id) => this._slotXY(sc.set, S, at[id]);
        // Cinema spacing: two speakers ~140 px apart leave no room for a single — the partner's
        // body clips the frame. Push the pair apart along their axis to a working distance and
        // stage everyone from those ADJUSTED points (enter carries the offset as dx/dy).
        const pos = {};
        for (const id of ids) pos[id] = anchorXY(id);
        const T = 215;
        if (pos[ids[0]] && pos[ids[1]]) {
            const a = pos[ids[0]], b = pos[ids[1]];
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const L = Math.hypot(dx, dy) || 1;
            if (L < T) {
                const push = (T - L) / 2, ux = dx / L, uy = dy / L;
                pos[ids[0]] = [a[0] - ux * push, a[1] - uy * push];
                pos[ids[1]] = [b[0] + ux * push, b[1] + uy * push];
            }
        }
        const xyOf = (id) => pos[id] || anchorXY(id);
        const facing = this._facing(sc.set, S, ids, xyOf);
        const enter = [];
        for (const k of keys) {
            const id = idOf[k];
            const raw = anchorXY(id), adj = pos[id];
            const e = { who: id, anchor: at[id], heading: facing[id] != null ? facing[id] : null, act: 'idle' };
            if (raw && adj && (Math.abs(adj[0] - raw[0]) > 1 || Math.abs(adj[1] - raw[1]) > 1)) {
                e.anchor = { anchor: at[id], dx: Math.round(adj[0] - raw[0]), dy: Math.round(adj[1] - raw[1]) };
            }
            enter.push(e);
        }
        // A couple of background faces in the wide shots, turned toward the action.
        const crowdN = Math.min(extraIds.length, sc.kind === 'intro' || sc.kind === 'climax' || sc.kind === 'coda' ? 3 : 1);
        for (let i = 0; i < crowdN; i++) {
            const slotName = pickSlot();
            if (!slotName) break;              // the set has no free point left for an extra
            const anchor = slotName;
            const exy = this._slotXY(sc.set, S, slotName);
            const axy = xyOf(ids[0]);
            enter.push({
                who: extraIds[i], anchor: anchor, act: i % 2 ? 'idle' : 'talk',
                heading: exy && axy ? Math.round(this._bearing(exy, axy)) : null,
            });
        }

        // Props: staged off the acting line.
        const props = [];
        for (let i = 0; i < (sc.props || []).length; i++) {
            const id = sc.props[i];
            // A free side anchor away from the acting line; no nudge toward the centre — props
            // pushed into the middle end up between the lens and the actor.
            const propName = pickSlot();
            if (!propName) break;              // never stack a prop on a person or a prop
            props.push({ id: id, anchor: propName, heading: r.range(0, 359) });
        }

        // Shots from the recipe.
        const recipe = this.RECIPES[K.recipe] || this.RECIPES.talk;
        const side = r.chance(0.5) ? 1 : -1;
        const indoor = !!(MovieData.SET_INFO[sc.set] || {}).indoor;
        const shots = [];
        let lineIdx = 0;
        const lines = sc.lines || [];
        for (let si = 0; si < recipe.length; si++) {
            const [camType, subj] = recipe[si];
            const dur = this._dur(camType, script, r);
            // Singles step off the acting axis by a third of a right angle, alternating sides:
            // straight down the axis puts the partner's back across the lens.
            // A single looks straight down the acting axis (the partner ends up behind the lens —
            // a clean single, and indoors the camera stays inside the room); a medium steps a
            // little to the side for a less flat, three-quarter feel.
            // The 180-degree rule: one side of the acting axis per scene, chosen once. Alternating
            // the off-axis sign shot by shot makes the partners jump across the frame.
            const off = camType === 'medium' ? 14 * side
                : camType === 'dutch' ? 18 * side : 0;
            const cam = this._cam(camType, subj, A, B, S, at, sc.set, xyOf, off, indoor);
            if (!cam) continue;
            const beats = [];
            const first = si === 0;
            // Narration card on the opening shot of an intro/climax.
            if (first && sc.narr) beats.push({ t: 0.5, narr: sc.narr, dur: Math.min(3.2, dur - 1.2) });
            // Dialogue: one line per speaking shot, in scene order.
            const speaks = camType === 'close' || camType === 'medium' || camType === 'over' || camType === 'duo' || camType === 'dutch';
            let sayWho = null;
            if (speaks && lineIdx < lines.length) {
                const ln = lines[lineIdx++];
                const who = idOf[ln.role];
                if (who && (who === A || who === B || camType === 'duo' || camType === 'over')) {
                    const t = first && sc.narr ? Math.min(3.6, dur * 0.55) : 0.45;
                    beats.push({ t: t, who: who, say: ln.text, dur: Math.max(1.6, dur - t - 0.5) });
                    sayWho = who;
                }
            }
            // Action beats by archetype.
            this._actionBeats(beats, sc, script, camType, si, A, B, dur, r, at, S, extraIds, crowdN);
            beats.sort((x, y) => x.t - y.t);
            // tag — the semantic framing ('wide', 'close', 'over'…): the rig may realise it as a
            // 'fixed' pose, but tools and tests reason in the language of the cutting room.
            // role — the cutting-room job of the shot: master / two / single.
            shots.push({
                dur: dur, trans: si === 0 ? 'fade' : 'cut', cam: cam, beats: beats, tag: camType,
                role: (camType === 'wide' || camType === 'crane') ? 'master' : (camType === 'duo' || camType === 'over') ? 'two' : 'single',
                sayWho: sayWho || null, side: side,
            });
        }
        this._coverage(shots, sc, script, ids, S, at, xyOf, side, r, indoor, props);
        // The end card rides on the VERY LAST shot of the film, after coverage is cut in.
        if (isLast && shots.length) {
            const lastSh = shots[shots.length - 1];
            lastSh.beats.push({ t: Math.max(1.2, lastSh.dur * 0.45), endCard: 'КОНЕЦ' });
            lastSh.beats.sort((x, y) => x.t - y.t);
        }
        if (!shots.length) return null;
        return {
            set: sc.set, timeOfDay: sc.timeOfDay, label: sc.label,
            music: (MovieData.GENRES[script.genre] || {}).music, tint: sc.tint,
            enter: enter, props: props, shots: shots,
        };
    },

    /**
     * The cutting-room pass: every scene opens on a master, dialogue gets reaction shots of the
     * listener, a prop earns one insert, and the end card stays last. This is what makes the
     * generated film read as COVERAGE instead of a slide show of the same frame.
     */
    _coverage(shots, sc, script, ids, S, at, xyOf, side, r, indoor, tlProps) {
        const A = ids[0], B = ids[1] || null;
        // 1) An establishing master first: the viewer must know where they are.
        if (!shots.length || (shots[0].tag !== 'wide' && shots[0].tag !== 'crane')) {
            const cam = this._cam('wide', 'c', A, B, S, at, sc.set, xyOf, 0, indoor);
            if (cam) shots.unshift({ dur: this._dur('wide', script, r), trans: 'fade', cam: cam, beats: [], tag: 'wide', role: 'master', sayWho: null });
            if (shots[1]) shots[1].trans = 'cut';
        }
        // 2) Reaction shots: after a speaking shot, a short close of whoever listens. A line
        //    delivered over a shoulder still deserves the listener's face — that cut is half
        //    of what makes dialogue read as dialogue.
        const listener = (who) => ids.find((id) => id !== who) || null;
        for (let i = shots.length - 1; i >= 0; i--) {
            const sh = shots[i];
            if ((sh.role !== 'single' && sh.role !== 'two') || !sh.sayWho) continue;
            const other = listener(sh.sayWho);
            if (!other) continue;
            const cam = this._cam('close', sh.sayWho === A ? 'b' : 'a', A, B, S, at, sc.set, xyOf, 0, indoor);
            if (!cam) continue;
            const dur = Math.round(Math.max(1.1, this._dur('close', script, r) * 0.42) * 10) / 10;
            shots.splice(i + 1, 0, {
                dur: dur, trans: 'cut', cam: cam, tag: 'close', role: 'reaction', sayWho: null,
                beats: [{ t: 0.15, who: other, act: 'look', look: sh.sayWho, dur: dur - 0.2 }],
            });
        }
        // 3) One insert on a prop: hands, steel and glass sell the scene without a word.
        //    The anchor names live on the TIMELINE props (the script scene carries bare ids).
        const pEntry = (tlProps || [])[0];
        const prop = pEntry ? pEntry.id : null;
        if (prop && shots.length > 2 && r.chance(0.65)) {
            const name = pEntry && pEntry.anchor ? pEntry.anchor : null;
            const xy = name ? ((MovieData.ANCHOR_XY[sc.set] || {})[name]) : null;
            if (xy) {
                const sfx = { horse: 'hooves', car: 'carhorn', robot: 'laser', coffin: 'thunder', tomb: 'thunder', saucer: 'laser' }[prop];
                // The insert is a detail: the portrait lens close on the prop. Indoors the spot
                // stays inside the room and the glass widens to the zoom floor, outdoors the
                // 85 mm gets its distance — the old canned pose parked the eye outside the
                // four walls and handed the frame to a wall face.
                const cxyI = this._slotXY(sc.set, S, 'center') || this._slotXY(sc.set, S, 'wide');
                const from = cxyI || [xy[0] + 120, xy[1]];
                const spot = this._toward([xy[0], xy[1], indoor ? 140 : 120], from, indoor ? 105 : 240);
                const cam = this._rig([xy[0], xy[1], 60], spot, { fov: MovieData.fovFor('close'), zoom: indoor ? 9 : 10.2 });
                shots.splice(2, 0, {
                    dur: 1.3, trans: 'cut', tag: 'fixed', role: 'insert', sayWho: null,
                    cam: cam,
                    beats: sfx ? [{ t: 0.2, sfx: sfx, vol: 0.5 }] : [],
                });
            }
        }
    },

    _dur(camType, script, r) {
        const base = this.SHOT_DUR[camType] || 4.5;
        // Editing pace: a big-budget action film cuts faster than a chamber drama.
        const pace = script.genre === 'action' || script.genre === 'horror' ? 0.86
            : script.genre === 'drama' || script.genre === 'romance' ? 1.14 : 1;
        return Math.round(Math.max(1.6, base * pace * r.float(0.92, 1.1)) * 10) / 10;
    },

    // The engine derives camera DISTANCE from zoom (zoom = screen px per world px at the look-at
    // point), so a pose is fully determined by look-at + az + pitch + zoom. The rig below picks a
    // camera SPOT first (always inside the four walls of an interior), then solves az/pitch/zoom
    // so the lens lands exactly there — on the shot's CINE LENS (MovieData.fovFor): a portrait
    // gets its 85 mm compression outdoors, and indoors, where the spot cannot back up, the glass
    // widens just enough to hold the framing (zoom) the shot size asks for. K = distance·zoom
    // for a vertical fov on a 720 px tall layout frame: K(fov) = 720 / (2·tan(fov/2));
    // K(52°) ≈ 738, K(40°) ≈ 989, K(85 mm) ≈ 2457.
    rigK(fovDeg) {
        const f = Math.max(8, Math.min(110, Number(fovDeg) || 52));
        return 720 / (2 * Math.tan(f * Math.PI / 360));
    },

    /** The widest FOV (deg) that still holds zoom ≤ maxZoom at `dist` px on the 720 px frame. */
    _fovFloor(dist, maxZoom) {
        const d = Math.max(12, Number(dist) || 100), z = Math.max(0.5, Number(maxZoom) || 9);
        return 2 * Math.atan(720 / (2 * d * z)) * 180 / Math.PI;
    },

    /**
     * Solve a pose that puts the camera at `spot` looking at `look` (both set-local, h in px).
     * opts: { fov — the wanted cine lens in deg, zoom — the framing the shot size asks for,
     * roll }. When the spot is too close for the lens, the FOV widens to the zoom floor.
     */
    _rig(look, spot, opts) {
        const o = opts || {};
        const dx = look[0] - spot[0], dy = look[1] - spot[1];
        const hd = Math.max(24, Math.hypot(dx, dy));
        const vd = (spot[2] != null ? spot[2] : 140) - (look[2] != null ? look[2] : 120);
        const dist = Math.max(40, Math.hypot(hd, vd));
        const fov = Math.max(o.fov || 52, this._fovFloor(dist, o.zoom || 9));
        const zoom = Math.max(1.05, Math.min(30, this.rigK(fov) / dist));
        const cam = {
            type: 'fixed', local: true,
            x: Math.round(look[0]), y: Math.round(look[1]), h: Math.round(look[2] != null ? look[2] : 120),
            az: Math.round(Math.atan2(dy, dx) * 180 / Math.PI),
            pitch: Math.round(Math.atan2(vd, hd) * 180 / Math.PI),
            zoom: Math.round(zoom * 100) / 100,
            fov: Math.round(fov * 10) / 10,
        };
        if (o.roll) cam.roll = o.roll;
        return cam;
    },

    /** A point `d` px from `from` toward `to` (set-local). */
    _toward(from, to, d, fbH) {
        if (!from) return [0, 0, fbH || 140];
        if (!to) return [from[0] + d, from[1], fbH || 140];
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const L = Math.hypot(dx, dy) || 1;
        return [from[0] + dx / L * d, from[1] + dy / L * d, fbH || 140];
    },

    /**
     * Interior coverage. Every camera spot is chosen INSIDE the room — in front of the speaker
     * along the acting axis, over their shoulder, or on the centre side of a pair — because a
     * zoom-derived distance left to itself walks the lens out through a wall.
     * @param {(id: string) => number[] | null} xyOf local coords of an actor's staging anchor
     */
    _rigScene(type, subj, A, B, S, set, xyOf, indoor) {
        const sxy = xyOf(subj === 'b' && B ? B : A);
        const pxy = xyOf(subj === 'b' && B ? A : B);
        const cxy = this._slotXY(set, S, 'center') || this._slotXY(set, S, 'wide');
        const dxy = this._slotXY(set, S, 'enter') || cxy;
        const H = 150;                                  // a procedural actor's eye line
        if (!sxy || !cxy) return null;
        // The direction the camera side comes from: the partner when there is one (the acting
        // axis is open by construction — the pair was spread apart), otherwise the set's open
        // side (its door/wide anchor), so the lens never stands among the props.
        // Outdoors a lone subject is shot from the SUN side (WORLD3D_SUN_AZIMUTH_DEG) so the face
        // is lit instead of silhouetted; indoors the door side stays the camera side; a dialogue
        // keeps its acting axis.
        // The camera side for a lone subject is the side they face (their open side), so singles
        // are frontal; a dialogue keeps its acting axis.
        const openXY = pxy || this._slotXY(set, S, 'enter') || this._slotXY(set, S, 'wide') || cxy;
        if (type === 'close' || type === 'dutch') {
            // In front of the speaker: a clean single, the partner (or the room) behind the lens.
            // Outdoors the portrait lens gets its working distance (the 85 mm wants ~530 px for
            // the classic framing); indoors the spot stays inside the room and _rig widens the
            // glass to hold the face — exactly what a real unit does in a tight interior.
            const lens = MovieData.fovFor(type);
            const back = Math.min(620, Math.round(this.rigK(lens) / 4.6));
            const spot = this._toward(sxy, openXY, indoor ? 105 : back, 152);
            return this._rig([sxy[0], sxy[1], H], spot, { fov: lens, zoom: indoor ? 9 : 4.6, roll: type === 'dutch' ? 9 : 0 });
        }
        if (type === 'medium' || type === 'low') {
            const low = type === 'low';
            const lens = MovieData.fovFor(type);
            const d = indoor ? (low ? 150 : 195) : (low ? 190 : Math.min(560, Math.round(this.rigK(lens) / 3.1)));
            const spot = this._toward(sxy, openXY, d, low ? (indoor ? 70 : 60) : 150);
            return this._rig([sxy[0], sxy[1], low ? 110 : 128], spot, { fov: lens, zoom: low ? 4.8 : 3.8 });
        }
        if (type === 'over' || type === 'duo') {
            if (!pxy) return this._rigScene('medium', subj, A, B, S, set, xyOf, indoor);
            // Over the speaker's shoulder at the partner: the spot sits just behind the speaker,
            // a third of the way along the axis, so the shoulder edges the frame.
            const gap = Math.hypot(pxy[0] - sxy[0], pxy[1] - sxy[1]) || 140;
            const spot = this._toward(sxy, pxy, Math.min(indoor ? 55 : 70, gap * 0.35), 165);
            return this._rig([pxy[0], pxy[1], 140], spot, { fov: MovieData.fovFor('over'), zoom: 9 });
        }
        // wide / crane: indoors a dollhouse master from the door side above the walls; outdoors
        // a classic establishing shot from the entrance side at eye-and-a-half height.
        if (indoor) {
            const spot = this._toward(cxy, dxy, 150, 330);
            const cam = this._rig([cxy[0], cxy[1], 70], spot, { fov: MovieData.fovFor(type), zoom: 2.2 });
            if (type === 'crane') cam.to = { pitch: cam.pitch + 12, zoom: Math.max(1.1, Math.round(cam.zoom * 0.72 * 100) / 100), h: 130 };
            return cam;
        }
        const spot = this._toward(cxy, dxy, 620, 430);
        const cam = this._rig([cxy[0], cxy[1], 80], spot, { fov: MovieData.fovFor(type), zoom: 2.2 });
        if (type === 'crane') cam.to = { pitch: Math.max(18, cam.pitch - 16), zoom: Math.max(0.6, Math.round(cam.zoom * 0.6 * 100) / 100), h: 210 };
        return cam;
    },

    /**
     * @param {string} set the set id — only used to look anchor coordinates up
     * @param {(id: string) => number[] | null} xyOf local coords of an actor's staging anchor
     * @param {boolean} indoor interiors are shot as a dollhouse: the shell is off (MovieSequencer)
     *   and every camera stays close enough to the action to remain inside the four walls.
     */
    _cam(type, subj, A, B, S, at, set, xyOf, azOff, indoor) {
        const rigged = this._rigScene(type, subj, A, B, S, set, xyOf, indoor);
        if (rigged) return rigged;
        if (type === 'wide' || type === 'crane') {
            const anchor = S.wide || S.c;
            if (indoor) {
                // Look in from the door side, steep enough to clear the walls: a dollhouse master.
                const door = this._slotXY(set, S, 'enter') || this._slotXY(set, S, 'wide');
                const ctr = this._slotXY(set, S, 'center') || this._slotXY(set, S, 'wide');
                const az = door && ctr ? Math.round(this._bearing(door, ctr)) : -90;
                const cam = { type: 'wide', anchor: anchor, az: az, pitch: 60, zoom: 1.7 };
                if (type === 'crane') cam.to = { pitch: 70, zoom: 1.2, h: 120 };
                return cam;
            }
            const cam = { type: type, anchor: anchor, az: -90, pitch: type === 'crane' ? 40 : 47, zoom: type === 'crane' ? 0.95 : 0.85 };
            if (type === 'crane') cam.to = { pitch: 62, zoom: 0.5, h: 170 };
            return cam;
        }
        if (type === 'duo') {
            // Interiors cover two-shots over the shoulder: the lens stands exactly at the
            // partner's mark, which is always inside the four walls, and reads as dialogue.
            if (indoor && B) {
                const oz = 3.2;
                return subj === 'ba' ? { type: 'over', who: B, who2: A, zoom: oz } : { type: 'over', who: A, who2: B, zoom: oz };
            }
            if (!B) return this._cam('medium', 'a', A, B, S, at, set, xyOf, azOff, indoor);
            // Two-shots look from the room's open side: an azimuth perpendicular to the actors'
            // line (the engine default) puts the camera OUTSIDE an interior set, and the frame
            // becomes a wall. Look from the set's centre toward the pair instead.
            const pa = xyOf(A), pb = xyOf(B);
            let az = null;
            if (pa && pb) {
                const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
                const c = this._slotXY(set, S, 'center') || this._slotXY(set, S, 'wide');
                if (c) az = Math.round(this._bearing(c, mid));
            }
            return { type: 'duo', who: A, who2: B, pitch: indoor ? 22 : 11, zoom: indoor ? 3.4 : 1.9, az: az };
        }
        if (type === 'over') {
            if (!B) return { type: 'medium', who: A, pitch: 10, zoom: 2.2 };
            // 'ab' — over B's shoulder at A; 'ba' — the reverse.
            const oz = indoor ? 3.2 : 2.8;
            return subj === 'ba' ? { type: 'over', who: B, who2: A, zoom: oz } : { type: 'over', who: A, who2: B, zoom: oz };
        }
        const who = subj === 'b' && B ? B : A;
        // Camera azimuth on the acting axis: from the partner toward the speaker, so the lens
        // stands between them (indoors: inside the room, never behind its walls).
        const partner = who === A ? B : A;
        const pw = partner ? xyOf(partner) : null, sw = xyOf(who);
        let az = null;
        if (pw && sw) az = this._bearing(pw, sw);
        else {
            const w = this._slotXY(set, S, 'wide') || this._slotXY(set, S, 'center');
            if (w && sw) az = this._bearing(w, sw);
        }
        if (az != null && azOff) az += azOff;
        if (az != null) az = Math.round(az);
        // Interiors keep the lens inside the room: distance comes from zoom, so the framing
        // tightens instead of walking the camera out through a wall.
        if (type === 'close') return { type: 'close', who: who, pitch: 4, zoom: indoor ? 5.0 : 3.1, az: az };
        if (type === 'dutch') return { type: 'dutch', who: who, pitch: 4, zoom: indoor ? 5.0 : 3.3, roll: 9, az: az };
        if (type === 'low') return { type: 'low', who: who, pitch: indoor ? 2 : -5, zoom: indoor ? 3.6 : 2.5, az: az };
        return { type: 'medium', who: who, pitch: indoor ? 24 : 10, zoom: indoor ? 3.0 : 1.9, az: az };
    },

    /** Archetype-driven physical business: what the bodies do while the camera rolls. */
    _actionBeats(beats, sc, script, camType, si, A, B, dur, r, at, S, extraIds, crowdN) {
        const kind = sc.kind;
        const G = script.genre;
        const sfx = this.KIND_SFX[kind] || [];
        const wide = camType === 'wide' || camType === 'crane' || camType === 'duo' || camType === 'medium';
        const t0 = 0.3;

        if (kind === 'intro' && si === 0) {
            beats.push({ t: t0 + 0.6, who: A, act: 'look', look: 0, dur: 2.4 });
            if (crowdN && extraIds[0]) beats.push({ t: t0 + 1.4, who: extraIds[0], to: S.f || S.e, speed: 72 });
        }

        if (kind === 'meet' || kind === 'romance') {
            if (si === 0 && B) beats.push({ t: t0, who: B, to: S.b || S.a, speed: 88, arriveAct: 'idle' });
            if (kind === 'romance' && B && camType === 'duo') {
                const tk = Math.max(1.2, dur * 0.55);
                beats.push({ t: tk, who: A, act: 'kiss' });
                beats.push({ t: tk + 0.1, who: B, act: 'kiss' });
                beats.push({ t: tk + 0.2, sfx: 'kiss', vol: 0.75 });
                if (G === 'romance' && extraIds[0]) beats.push({ t: tk + 0.9, sfx: 'laugh', vol: 0.22 });
            }
        }

        if (kind === 'threat') {
            if (B && si === 0) beats.push({ t: t0, who: B, face: A });
            if (B && camType === 'duo') beats.push({ t: t0 + 0.5, who: A, act: 'gesture' });
            if (camType === 'dutch') beats.push({ t: t0, shake: 0.02, ms: 260 });
            if (si === 1 && sfx.length) beats.push({ t: t0 + 0.2, sfx: r.pick(sfx), vol: 0.5 });
        }

        if (kind === 'chase') {
            // The chase reads as movement: run across the set, camera chasing.
            const from = si % 2 ? S.e || S.f : S.f || S.e;
            const to = si % 2 ? S.f || S.e : S.e || S.f;
            beats.push({ t: t0, who: A, spawn: from, act: 'run' });
            beats.push({ t: t0 + 0.05, who: A, to: to, speed: 235, arriveAct: 'idle' });
            if (B) {
                beats.push({ t: t0 + 0.35, who: B, spawn: from, act: 'run' });
                beats.push({ t: t0 + 0.4, who: B, to: to, speed: 210, arriveAct: 'idle' });
            }
            beats.push({ t: t0 + 0.1, sfx: 'step', vol: 0.5 });
            if (si === 1) beats.push({ t: t0 + 0.2, shake: 0.035, ms: 420 });
            // A car or a horse when the genre has one and the set can carry it.
            if (si === 2 && (G === 'action' || G === 'western') && (sc.props || []).length) {
                const pid = sc.props[0];
                beats.push({ t: t0, moveProp: pid, to: to, speed: 320, heading: 0 });
                beats.push({ t: t0 + 0.1, sfx: G === 'western' ? 'hooves' : 'carhorn', vol: 0.7 });
            }
        }

        if (kind === 'fight') {
            if (B && camType === 'duo') {
                const tk = Math.max(0.8, dur * 0.4);
                beats.push({ t: tk, who: A, act: 'punch' });
                beats.push({ t: tk + 0.05, sfx: 'punch', who: A, vol: 0.9 });
                beats.push({ t: tk + 0.05, shake: 0.055, ms: 340 });
                beats.push({ t: tk + 0.5, who: B, act: 'fall' });
                beats.push({ t: tk + 1.5, who: B, act: 'idle' });
            }
            if (B && camType === 'close' && si >= 2) beats.push({ t: t0, who: B, act: 'kick' });
            if (si === 1) beats.push({ t: t0 + 0.3, sfx: 'glass', vol: 0.55 });
        }

        if (kind === 'reveal') {
            if (camType === 'close' && si >= 1) {
                beats.push({ t: t0, sfx: 'gasp', vol: 0.7 });
                beats.push({ t: t0 + 0.1, who: A, act: 'look', look: B || 0, dur: 2 });
            }
            if (si === 0) beats.push({ t: t0, who: A, act: 'gesture' });
            if (sc.timeOfDay === 'night' && si === 1) beats.push({ t: t0 + 0.6, sfx: 'thunder', vol: 0.6 });
        }

        if (kind === 'comic') {
            if (camType === 'medium' || camType === 'over') beats.push({ t: t0 + 0.2, who: A, act: 'gesture' });
            if (si === recipeLen(this, sc) - 1) beats.push({ t: Math.max(0.8, dur * 0.6), sfx: 'laugh', vol: 0.5 });
            if (B && si === 1) beats.push({ t: t0 + 0.3, who: B, act: 'wave' });
        }

        if (kind === 'crisis') {
            if (si === 0) beats.push({ t: t0, who: A, act: 'sneak' });
            if (camType === 'close') beats.push({ t: t0 + 0.2, who: A, act: 'look', look: B || 0, dur: 2.2 });
            if (si === 1) beats.push({ t: t0 + 0.5, sfx: 'thunder', vol: 0.5 });
        }

        if (kind === 'climax') {
            if (B && si === 0) beats.push({ t: t0, who: B, face: A });
            if (B && camType === 'duo') {
                const tk = Math.max(0.7, dur * 0.35);
                const gun = G === 'western' || G === 'action' || G === 'scifi';
                beats.push({ t: tk, who: A, act: 'punch' });
                beats.push({ t: tk, sfx: gun ? (G === 'scifi' ? 'laser' : 'gunshot') : 'punch', who: A, vol: 0.95 });
                beats.push({ t: tk, shake: 0.08, ms: 460 });
                beats.push({ t: tk + 0.05, fx: 'flash' });
                beats.push({ t: tk + 0.45, who: B, act: 'fall' });
                if (G === 'action' || G === 'scifi') beats.push({ t: tk + 0.9, sfx: 'explosion', vol: 0.7 });
            }
            if (camType === 'crane') {
                beats.push({ t: t0 + 1.2, who: A, act: 'cheer' });
                for (let i = 0; i < Math.min(2, extraIds.length); i++) {
                    beats.push({ t: t0 + 1.5 + i * 0.3, who: extraIds[i], act: 'cheer' });
                }
                beats.push({ t: t0 + 2.0, sfx: 'applause', vol: 0.55 });
            }
        }

        if (kind === 'coda') {
            if (B && camType === 'medium') {
                beats.push({ t: t0 + 0.6, who: A, act: 'kiss' });
                beats.push({ t: t0 + 0.7, who: B, act: 'kiss' });
                beats.push({ t: t0 + 0.8, sfx: 'kiss', vol: 0.6 });
            }
            if (camType === 'crane') {
                beats.push({ t: t0 + 0.8, sfx: 'applause', vol: 0.4 });
                for (let i = 0; i < Math.min(2, extraIds.length); i++) {
                    beats.push({ t: t0 + 1 + i * 0.35, who: extraIds[i], act: 'cheer' });
                }
            }
        }

        // A touch of life in the background of any wide shot.
        if (wide && crowdN && si % 2 === 0) {
            const eid = extraIds[Math.min(crowdN - 1, extraIds.length - 1)];
            if (eid && r.chance(0.5)) beats.push({ t: t0 + 1.2, who: eid, act: r.pick(['talk', 'gesture', 'idle', 'wave']) });
        }
    },

    // --- the screens ----------------------------------------------------------------------------------

    /** The "new film" wizard: genre, budget, writer, title. */
    newMovieScreen(game) {
        const s = StudioManager.state;
        const c = this.cfg();
        const w = this._wiz(s);
        const M = MovieData;
        const UIx = StudioUI;

        // Genre cards.
        let genres = '';
        for (const id of Object.keys(M.GENRES)) {
            const g = M.GENRES[id];
            const heat = M.heat ? M.heat(id, s.year) : g.heat;
            const on = w.genre === id;
            const missing = (g.sets || []).filter((x) => !s.ownedSets[x]);
            genres += '<div class="card' + (on ? ' sel' : '') + '" data-act="script:genre:' + id + '" style="cursor:pointer">' +
                '<div class="row tight"><span style="font-size:22px">' + g.emoji + '</span><b>' + g.ru + '</b><span class="sp"></span>' +
                '<span class="tag ' + (heat >= 8 ? 'green' : heat >= 6 ? '' : 'red') + '">мода ' + heat.toFixed(1) + '</span></div>' +
                '<div class="meta">Навык: ' + PeopleSystem.SKILL_RU[g.skill] + ' · Декорации: ' + (g.sets || []).map((x) => (M.SET_INFO[x] || {}).ru).join(', ') + '</div>' +
                (missing.length ? '<div class="meta bad">Нет декораций: ' + missing.map((x) => (M.SET_INFO[x] || {}).ru).join(', ') + ' — качество сцен пострадает</div>' : '<div class="meta good">Все декорации жанра построены</div>') +
                '</div>';
        }

        // Writers on staff.
        const writers = (s.staff || []).filter((p) => p.role === 'writer');
        let wopt = '';
        for (const p of writers) {
            const sk = p.skills[(M.GENRES[w.genre] || {}).skill] || 0;
            wopt += '<div class="card' + (w.writerId === p.id ? ' sel' : '') + '" data-act="script:writer:' + p.id + '" style="cursor:pointer">' +
                '<div class="row tight">' + UIx.avatar(p, 40) + '<span class="name">' + UIx.esc(p.name) + '</span><span class="sp"></span>' +
                '<span class="tag gold">' + PeopleSystem.SKILL_RU[(M.GENRES[w.genre] || {}).skill] + ' ' + sk + '/10</span></div>' +
                '<div class="meta">' + p.age + ' лет · ' + PeopleSystem.moodWord(p.mood) + ' · ' + UIx.money(p.salary) + '/нед' +
                (p.training ? ' · <span class="bad">учится, ещё ' + p.training.weeksLeft + ' нед.</span>' : '') + '</div></div>';
        }
        if (!writers.length) wopt = '<p class="hint bad">В штате нет сценариста. Наймите его на бирже талантов — или напишите сценарий «на коленке».</p>';

        // Sequels of released films.
        let seq = '<div class="card' + (w.sequelOf === '' ? ' sel' : '') + '" data-act="script:sequel:" style="cursor:pointer"><b>Оригинальный фильм</b></div>';
        for (const m of (s.released || [])) {
            if (m.genre !== w.genre) continue;
            seq += '<div class="card' + (w.sequelOf === m.id ? ' sel' : '') + '" data-act="script:sequel:' + m.id + '" style="cursor:pointer">' +
                '<b>Сиквел: «' + UIx.esc(m.title) + '»</b><div class="meta">касса ' + UIx.money(m.boxOffice || 0) + (m.score != null ? ' · критики ' + m.score.toFixed(1) : '') + '</div></div>';
        }

        // The estimate.
        const writer = writers.find((p) => p.id === w.writerId) || null;
        const est = this._estimate(s, w, writer);
        const cost = this.orderCost(w.budget, writer);
        const afford = StudioManager.canAfford(cost);

        let orders = '';
        if ((s.orders || []).length) {
            orders = '<div class="h2">🖋 В работе у сценарного отдела</div>';
            for (const o of s.orders) {
                const wn = (s.staff || []).find((p) => p.id === o.writerId);
                orders += '<div class="card" style="cursor:default"><div class="row"><b>«' + UIx.esc(o.title || 'без названия') + '»</b>' +
                    '<span class="tag">' + (M.GENRES[o.genre] || {}).ru + '</span><span class="sp"></span>' +
                    '<span class="tag blue">ещё ' + o.weeksLeft + ' нед.</span></div>' +
                    '<div class="meta">' + UIx.money(o.budget) + ' · ' + (wn ? UIx.esc(wn.name) : 'без автора') + '</div></div>';
            }
        }

        const suggested = this.titleFor(w.genre, Rng.create('suggest-' + w.genre + '-' + s.weekIdx), w.sequelOf ? (s.released || []).find((m) => m.id === w.sequelOf) : null);

        return '<div class="sc"><h1 class="title">НОВЫЙ ФИЛЬМ<span class="sub">шаг 1 из 3: жанр, бюджет и сценарий</span></h1>' +
            '<div class="cols">' +
            '<div class="col"><div class="h2">🎭 Жанр</div><div class="scroll">' + genres + '</div>' +
            '<div class="h2">🎬 Сиквел</div><div class="scroll">' + seq + '</div></div>' +
            '<div class="col">' +
            '<div class="h2">💰 Бюджет</div>' +
            '<div class="panel" style="padding:12px">' +
            '<label class="fld">Производственный бюджет: <b>' + UIx.money(w.budget) + '</b></label>' +
            '<input type="range" min="' + c.budgetMin + '" max="' + c.budgetMax + '" step="50000" value="' + w.budget + '" data-act="script:budget" style="width:100%">' +
            '<div class="meta">Идеальный бюджет жанра: ' + UIx.money(this.IDEAL_BUDGET[w.genre] || 400000) + ' · сцен: ~' + this.scenesFor(w.budget) + ' · массовка: ' + this.extrasFor(w.budget) + '</div>' +
            '</div>' +
            '<div class="h2">🖋 Сценарист</div><div class="scroll">' + wopt + '</div>' +
            '<div class="h2">📝 Название</div>' +
            '<div class="panel" style="padding:12px">' +
            '<input type="text" value="' + UIx.esc(w.title) + '" placeholder="' + UIx.esc(suggested) + '" data-act="script:title" style="width:100%">' +
            '<div class="meta">Пусто — сгенерируем: «' + UIx.esc(suggested) + '»</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            orders +
            '<div class="panel" style="margin-top:12px;padding:12px">' +
            '<div class="row tight"><b>Прогноз</b><span class="sp"></span>' +
            '<span class="tag gold">качество ~' + est.quality.toFixed(1) + '/10</span>' +
            '<span class="tag">ролей: ' + est.roles + '</span>' +
            '<span class="tag">сцен: ' + est.scenes + '</span>' +
            '<span class="tag">съёмки ~' + est.shootWeeks + ' нед.</span>' +
            '</div>' +
            '<div class="meta" style="margin-top:6px">' + UIx.esc(est.note) + '</div>' +
            '</div>' +
            '<div class="row" style="margin-top:12px">' +
            '<span class="btn" data-act="close">← Закрыть</span><span class="sp"></span>' +
            '<span class="btn' + (afford ? '' : ' off') + '" data-act="script:quick">✍ Написать самим · бесплатно · ' + c.writeWeeks + '× быстрее, но слабее</span>' +
            '<span class="btn gold' + (afford ? '' : ' off') + '" data-act="script:order">📜 Заказать сценарий · ' + UIx.money(cost) + ' · ' + c.writeWeeks + ' нед.</span>' +
            '</div></div>';
    },

    _estimate(state, w, writer) {
        const roles = this.rolesFor(w.genre, w.budget);
        const scenes = this.scenesFor(w.budget);
        const sk = writer ? (writer.skills[(MovieData.GENRES[w.genre] || {}).skill] || 0) : 0;
        const q = this.qualityOf(w.genre, w.budget, sk, state.year, null, 0);
        const notes = [];
        if (!writer) notes.push('Без сценариста качество упрётся в пол.');
        const G = MovieData.GENRES[w.genre] || {};
        const missing = (G.sets || []).filter((x) => !state.ownedSets[x]);
        if (missing.length) notes.push('Нет ' + missing.length + ' декораций жанра — сцены потеряют в качестве на съёмках.');
        const ideal = this.IDEAL_BUDGET[w.genre] || 400000;
        if (w.budget < ideal * 0.55) notes.push('Бюджет заметно ниже жанровой нормы: картинка будет дешёвой.');
        if (w.budget > ideal * 1.9) notes.push('Бюджет избыточен: лишние деньги не превратятся в качество.');
        const heat = MovieData.heat ? MovieData.heat(w.genre, state.year) : 6;
        if (heat <= 4) notes.push('Жанр выходит из моды (' + heat.toFixed(1) + ') — прокат будет тяжёлым.');
        if (heat >= 8) notes.push('Жанр на пике моды (' + heat.toFixed(1) + ') — зритель пойдёт.');
        return {
            quality: q, roles: roles.length, scenes: scenes,
            shootWeeks: Math.max(2, Math.ceil(scenes / (typeof SHOOT_SCENES_PER_WEEK !== 'undefined' ? SHOOT_SCENES_PER_WEEK : 2))),
            note: notes.length ? notes.join(' ') : 'Сбалансированный проект: бюджет в жанровой норме, декорации есть, жанр в моде.',
        };
    },

    /** The script reader: the full screenplay, scene by scene, with a preview of the film. */
    detailScreen(game, scriptId) {
        const s = StudioManager.state;
        const UIx = StudioUI;
        const sc = (s.scripts || []).find((x) => x.id === scriptId);
        if (!sc) return UIx._soon('Сценарий не найден');
        const G = MovieData.GENRES[sc.genre] || {};
        const CS = typeof CastingSystem !== 'undefined' ? CastingSystem : null;
        let cast = '';
        for (const role of sc.roles) {
            const pid = sc.cast ? sc.cast[role.key] : null;
            const p = pid ? this._person(s, pid) : null;
            cast += '<div class="row tight" style="padding:4px 0;border-bottom:1px solid #1b2436">' +
                '<span class="tag" style="width:130px">' + UIx.esc(role.ru) + '</span>' +
                (p ? UIx.avatar(p, 34) + '<span class="name">' + UIx.esc(p.name) + '</span>' + UIx.stars(p) +
                    '<span class="tag">' + p.skills[role.skill] + '/10 ' + PeopleSystem.SKILL_RU[role.skill] + '</span>'
                    : '<span class="hint">— не выбран —</span>') +
                '<span class="sp"></span><span class="hint">экранное время ' + Math.round(role.share * 100) + '%</span></div>';
        }
        let scenes = '';
        for (const scn of sc.scenes) {
            const K = this.KINDS[scn.kind] || {};
            let lines = '';
            for (const ln of (scn.lines || [])) {
                const role = sc.roles.find((x) => x.key === ln.role);
                lines += '<div class="dlg"><span class="nm">' + UIx.esc(role ? role.ru : ln.role) + '</span>' + UIx.esc(ln.text) + '</div>';
            }
            scenes += '<div class="card" style="cursor:default">' +
                '<div class="row tight"><b>' + UIx.esc(scn.label) + '</b><span class="sp"></span>' +
                '<span class="tag">' + (K.ru || scn.kind) + '</span>' +
                '<span class="tag blue">Акт ' + scn.act + '</span>' +
                '<span class="tag">' + (this.TOD_RU[scn.timeOfDay] || scn.timeOfDay) + '</span>' +
                '<span class="tag gold">' + scn.quality.toFixed(1) + '</span></div>' +
                (scn.narr ? '<div class="meta"><i>' + UIx.esc(scn.narr) + '</i></div>' : '') +
                (lines || '<div class="hint">Без диалогов — чистая визуальная сцена.</div>') +
                '<div class="row tight" style="margin-top:6px"><span class="btn small" data-act="script:dailies:' + sc.id + ':' + (scn.idx - 1) + '">🎞 Дневники: посмотреть сцену</span></div>' +
                '</div>';
        }
        const fullCast = !!(CS && CS.isComplete && CS.isComplete(s, sc));
        return '<div class="sc"><h1 class="title">«' + UIx.esc(sc.title).toUpperCase() + '»<span class="sub">' +
            (G.emoji || '') + ' ' + (G.ru || '') + ' · ' + sc.year + ' · ' + UIx.money(sc.budget) + '</span></h1>' +
            '<div class="panel" style="padding:12px;margin-bottom:10px">' +
            '<div class="row tight"><span class="tag gold big">качество ' + sc.quality.toFixed(1) + '/10</span>' +
            '<span class="tag">сцен: ' + sc.scenes.length + '</span><span class="tag">ролей: ' + sc.roles.length + '</span>' +
            '<span class="tag">массовка: ' + sc.extras + '</span><span class="sp"></span>' +
            '<span class="tag">автор: ' + UIx.esc(sc.writerName) + '</span></div>' +
            '<p class="lead" style="margin-top:8px">' + UIx.esc(sc.logline) + '</p>' +
            '</div>' +
            '<div class="cols"><div class="col"><div class="h2">🎭 Роли</div>' + cast + '</div>' +
            '<div class="col"><div class="h2">📖 Сцены</div><div class="scroll">' + scenes + '</div></div></div>' +
            '<div class="row" style="margin-top:12px">' +
            '<span class="btn" data-act="script:list">← К сценариям</span><span class="sp"></span>' +
            (sc.timeline ? '<span class="btn" data-act="script:watch:' + sc.id + '">▶ Смотреть фильм</span>' : '') +
            '<span class="btn gold" data-act="cast:open:' + sc.id + '">🎭 ' + (fullCast ? 'Пересобрать каст' : 'К кастингу →') + '</span>' +
            '</div></div>';
    },

    _person(state, id) {
        return (state.roster || []).concat(state.staff || []).find((p) => p.id === id) || null;
    },

    /** The list of ready scripts (the «Фильмы» screen asks for it). */
    scriptsScreen(state) {
        let h = '';
        for (const sc of state.scripts || []) {
            h += '<div class="card" data-act="script:open:' + sc.id + '" style="cursor:pointer">' +
                '<div class="row"><b>«' + StudioUI.esc(sc.title) + '»</b>' +
                '<span class="tag">' + (MovieData.GENRES[sc.genre] || {}).ru + '</span>' +
                '<span class="sp"></span><span class="tag gold">качество ' + sc.quality.toFixed(1) + '</span>' +
                (sc.cast ? '<span class="tag green">каст собран</span>' : '<span class="tag">кастинг не пройден</span>') + '</div>' +
                '<div class="meta">' + StudioUI.esc(sc.logline) + '</div>' +
                '<div class="meta">Автор: ' + StudioUI.esc(sc.writerName) + ' · сцен: ' + sc.scenes.length + ' · бюджет ' + StudioUI.money(sc.budget) + '</div>' +
                '</div>';
        }
        return h;
    },

    // --- the dispatcher -------------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        const S = StudioManager, s = S.state;
        const A = String(act);
        const w = this._wiz(s);
        const rerender = () => game.showScreen(game.screen);

        // Control changes arrive prefixed: 'change:script:budget' (UI.js delegates `change`).
        if (A.indexOf('change:script:') === 0) {
            const verb = A.slice('change:script:'.length);
            if (verb === 'budget') {
                const v = Number(el && el.value);
                if (Number.isFinite(v)) w.budget = Math.round(v);
            } else if (verb === 'title') {
                w.title = el && el.value != null ? String(el.value) : '';
            }
            rerender();
            return true;
        }

        const parts = A.split(':');
        if (parts[0] !== 'script') return false;

        if (parts[1] === 'genre') { w.genre = parts[2]; w.sequelOf = ''; rerender(); return true; }
        if (parts[1] === 'writer') { w.writerId = parts[2]; rerender(); return true; }
        if (parts[1] === 'sequel') { w.sequelOf = parts[2] || ''; rerender(); return true; }
        if (parts[1] === 'list') { this.resetWizard(); game.showScreen('films'); return true; }
        if (parts[1] === 'open') { game.uiState.scriptOpen = parts[2]; game.showScreen('script'); return true; }
        if (parts[1] === 'back') { game.uiState.scriptOpen = ''; game.showScreen('films'); return true; }

        if (parts[1] === 'order') {
            const writer = (s.staff || []).find((p) => p.id === w.writerId && p.role === 'writer') || null;
            const seq = w.sequelOf ? (s.released || []).find((m) => m.id === w.sequelOf) : null;
            const res = this.order(s, S, {
                genre: w.genre, budget: w.budget, writerId: w.writerId, title: w.title,
                sequelOf: seq ? { id: seq.id, title: seq.title } : null,
            });
            if (!res.ok) { game.toast(res.why); return true; }
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.typewriter, { volume: 0.6 });
            game.toast('📜 Сценарий заказан. ' + (writer ? writer.name + ' сядет за машинку.' : 'Ищем автора…') + ' Готово через ' + res.order.weeksLeft + ' нед.');
            this.resetWizard();
            rerender();
            return true;
        }

        if (parts[1] === 'quick') {
            const seq = w.sequelOf ? (s.released || []).find((m) => m.id === w.sequelOf) : null;
            const sc = this.quickDraft(s, S, {
                genre: w.genre, budget: w.budget, writer: null, title: w.title,
                sequelOf: seq ? { id: seq.id, title: seq.title } : null,
            });
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.typewriter, { volume: 0.5 });
            game.toast('✍ «' + sc.title + '» готов — качество ' + sc.quality.toFixed(1) + '. Скорее в кастинг.');
            this.resetWizard();
            game.uiState.scriptOpen = sc.id;
            game.showScreen('script');
            return true;
        }

        if (parts[1] === 'watch') {
            const sc = (s.scripts || []).find((x) => x.id === parts[2]);
            if (sc && sc.timeline) { game.playMovie(sc.timeline, {}); return true; }
            game.toast('Фильм ещё не смонтирован: соберите каст.');
            return true;
        }

        if (parts[1] === 'dailies') {
            const sc = (s.scripts || []).find((x) => x.id === parts[2]);
            if (!sc) return true;
            const tl = sc.timeline || this._previewTimeline(s, sc);
            game.playMovie(tl, { dailies: Number(parts[3]) || 0 });
            return true;
        }

        if (parts[1] === 'preview') {
            const sc = (s.scripts || []).find((x) => x.id === parts[2]);
            if (!sc) return true;
            game.playMovie(this._previewTimeline(s, sc), {});
            return true;
        }

        if (parts[1] === 'drop') {
            const i = (s.scripts || []).findIndex((x) => x.id === parts[2]);
            if (i >= 0) { s.scripts.splice(i, 1); game.toast('Сценарий отправлен в корзину.'); }
            game.showScreen('films');
            return true;
        }
        return true;
    },

    /** A throwaway timeline with generated stand-ins, so any scene can be previewed before casting. */
    _previewTimeline(state, script) {
        const r = Rng.create((script.seed ^ 0xbeef) >>> 0);
        const fake = {};
        for (const role of script.roles) {
            const look = PeopleSystem.randomLook(r);
            const cos = this._costume(look, r, script.genre, look.gender);
            fake[role.key] = {
                id: 'tmp-' + role.key, name: role.ru, gender: look.gender,
                look: cos, skills: { drama: 5, comedy: 5, action: 5, romance: 5 },
            };
        }
        const tl = this.compile(script, fake, state);
        tl.title = script.title + ' (черновик)';
        return tl;
    },
};

/** The length of a scene's recipe (used by the beat filler for "the last shot" business). */
function recipeLen(SG, sc) {
    const K = SG.KINDS[sc.kind] || SG.KINDS.intro;
    return (SG.RECIPES[K.recipe] || SG.RECIPES.talk).length;
}
