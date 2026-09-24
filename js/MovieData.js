// MovieData.js — the game's content tables (RU): genres, sets, dialogue pools, names,
// title/review generators, era drift, sound paths and the handcrafted demo film.
// Pure data + pure functions: no DOM, no pc.*, no engine calls. The ScriptGenerator and the
// MovieSequencer read from here. Sound paths are quoted LITERALS — the builder's asset
// scanner archives exactly these files (tools/make-movie-sounds.mjs generates them).

/** @satisfies {Record<string, any>} */
const MovieData = {
    /** Genre heat 1..10 for a year (assigned below). @type {((genre: string, year: number) => number) | null} */
    heat: null,
    /** Focal length (mm) of a semantic shot size (assigned below). @type {((shotType: string) => number) | null} */
    lensMm: null,
    /** Vertical FOV (deg) of a focal length on the cine gate (assigned below). @type {((mm: number) => number) | null} */
    lensFov: null,
    /** The lens of a shot size, straight in degrees of vertical FOV (assigned below). @type {((shotType: string) => number) | null} */
    fovFor: null,
    /** Coarse plan class for DoF/shadows/lighting: 'close'|'mid'|'wide' (assigned below). @type {((tag: string) => string) | null} */
    planSize: null,
    /** The color-script accent table by scene kind (filled below). @type {Record<string, number[]> | null} */
    ACCENTS: null,
    /** The scene kind's dominant palette accent (assigned below). @type {((kind: string) => number[]) | null} */
    accentFor: null,
    /** Rule-of-thirds look-at offset in map px (assigned below). @type {((azDeg: number, dist: number, vfovDeg: number, side: number) => { dx: number, dy: number }) | null} */
    thirdsOffset: null,

    // --- sound -------------------------------------------------------------------------
    // SFX ids used by timeline beats -> asset paths (literals for the scanner).
    SFX: {
        cut: 'assets/sounds/cut.wav',
        click: 'assets/sounds/click.wav',
        gunshot: 'assets/sounds/gunshot.wav',
        punch: 'assets/sounds/punch.wav',
        sword: 'assets/sounds/sword.wav',
        door: 'assets/sounds/door.wav',
        thunder: 'assets/sounds/thunder.wav',
        typewriter: 'assets/sounds/typewriter.wav',
        clapper: 'assets/sounds/clapper.wav',
        cash: 'assets/sounds/cash.wav',
        phone: 'assets/sounds/phone.wav',
        applause: 'assets/sounds/applause.wav',
        laugh: 'assets/sounds/laugh.wav',
        gasp: 'assets/sounds/gasp.wav',
        carhorn: 'assets/sounds/carhorn.wav',
        hooves: 'assets/sounds/hooves.wav',
        glass: 'assets/sounds/glass.wav',
        explosion: 'assets/sounds/explosion.wav',
        laser: 'assets/sounds/laser.wav',
        kiss: 'assets/sounds/kiss.wav',
        projector: 'assets/sounds/projector.wav',
        step: 'assets/sounds/step.wav',
        sting_hit: 'assets/sounds/sting_hit.wav',
        sting_flop: 'assets/sounds/sting_flop.wav',
        sting_award: 'assets/sounds/sting_award.wav',
    },

    MUSIC: {
        studio: 'assets/sounds/music_studio.wav',
        noir: 'assets/sounds/music_noir.wav',
        war: 'assets/sounds/music_war.wav',
        adventure: 'assets/sounds/music_adventure.wav',
        musical: 'assets/sounds/music_musical.wav',
        western: 'assets/sounds/music_western.wav',
        drama: 'assets/sounds/music_drama.wav',
        comedy: 'assets/sounds/music_comedy.wav',
        action: 'assets/sounds/music_action.wav',
        horror: 'assets/sounds/music_horror.wav',
        scifi: 'assets/sounds/music_scifi.wav',
        romance: 'assets/sounds/music_romance.wav',
    },

    // --- genres ------------------------------------------------------------------------
    // skill — the actor skill that carries the genre; sets — the decorations it films in;
    // heat — base popularity (eras drift it, ERAS); moods — the dialogue mix of a script.
    GENRES: {
        western: {
            ru: 'Вестерн', emoji: '🤠', skill: 'action', music: 'western', heat: 8,
            sets: ['western', 'saloon', 'forest'], props: ['horse', 'barrel', 'crate', 'tomb'],
            moods: ['threat', 'hero', 'neutral', 'humor', 'parting'],
        },
        comedy: {
            ru: 'Комедия', emoji: '😂', skill: 'comedy', music: 'comedy', heat: 9,
            sets: ['diner', 'office', 'city', 'beach', 'mansion'], props: ['car', 'chair', 'table'],
            moods: ['humor', 'neutral', 'surprise', 'love', 'anger'],
        },
        drama: {
            ru: 'Драма', emoji: '🎭', skill: 'drama', music: 'drama', heat: 7,
            sets: ['mansion', 'office', 'city', 'rooftop', 'diner'], props: ['table', 'chair', 'bed'],
            moods: ['neutral', 'anger', 'love', 'fear', 'parting'],
        },
        action: {
            ru: 'Боевик', emoji: '💥', skill: 'action', music: 'action', heat: 9,
            sets: ['city', 'rooftop', 'western', 'lab'], props: ['car', 'crate', 'lamp'],
            moods: ['threat', 'hero', 'anger', 'surprise', 'neutral'],
        },
        horror: {
            ru: 'Ужасы', emoji: '👻', skill: 'drama', music: 'horror', heat: 6,
            sets: ['forest', 'mansion', 'lab', 'rooftop'], props: ['tomb', 'crate', 'lamp'],
            moods: ['fear', 'threat', 'surprise', 'neutral', 'villain'],
        },
        scifi: {
            ru: 'Фантастика', emoji: '🚀', skill: 'action', music: 'scifi', heat: 7,
            sets: ['space', 'lab', 'city', 'rooftop'], props: ['robot', 'saucer', 'crate'],
            moods: ['neutral', 'surprise', 'threat', 'hero', 'villain'],
        },
        romance: {
            ru: 'Мелодрама', emoji: '💋', skill: 'romance', music: 'romance', heat: 8,
            sets: ['beach', 'mansion', 'diner', 'city', 'stage'], props: ['bed', 'table', 'car'],
            moods: ['love', 'neutral', 'humor', 'parting', 'fear'],
        },
        noir: {
            ru: 'Нуар', emoji: '🌧', skill: 'drama', music: 'noir', heat: 7,
            sets: ['city', 'office', 'diner', 'rooftop', 'nightclub'], props: ['car', 'chair', 'lamp'],
            moods: ['threat', 'villain', 'neutral', 'fear', 'parting'],
        },
        war: {
            ru: 'Военный', emoji: '🎖', skill: 'action', music: 'war', heat: 8,
            sets: ['camp', 'forest', 'city', 'train', 'rooftop'], props: ['crate', 'barrel', 'car', 'tripod'],
            moods: ['threat', 'hero', 'parting', 'fear', 'neutral'],
        },
        adventure: {
            ru: 'Приключения', emoji: '🗺', skill: 'action', music: 'adventure', heat: 7,
            sets: ['jungle', 'beach', 'forest', 'train', 'city'], props: ['crate', 'barrel', 'car', 'horse'],
            moods: ['surprise', 'hero', 'humor', 'threat', 'neutral'],
        },
        musical: {
            ru: 'Мюзикл', emoji: '🎺', skill: 'romance', music: 'musical', heat: 7,
            sets: ['stage', 'nightclub', 'diner', 'city', 'beach'], props: ['chair', 'table', 'car'],
            moods: ['love', 'humor', 'neutral', 'surprise', 'parting'],
        },
    },

    // --- sets (SetPieces3D.SETS ids) ------------------------------------------------------
    SET_INFO: {
        western: { ru: 'Улица Дикого Запада', indoor: false, cost: 60000, genres: ['western', 'action'] },
        saloon: { ru: 'Салун', indoor: true, cost: 40000, genres: ['western', 'comedy'] },
        space: { ru: 'Космический корабль', indoor: true, cost: 120000, genres: ['scifi'] },
        city: { ru: 'Городская улица', indoor: false, cost: 90000, genres: ['action', 'comedy', 'drama', 'scifi', 'romance'] },
        mansion: { ru: 'Особняк', indoor: true, cost: 70000, genres: ['drama', 'romance', 'horror', 'comedy'] },
        forest: { ru: 'Лес', indoor: false, cost: 30000, genres: ['horror', 'western', 'romance'] },
        beach: { ru: 'Пляж', indoor: false, cost: 35000, genres: ['romance', 'comedy'] },
        lab: { ru: 'Лаборатория', indoor: true, cost: 80000, genres: ['scifi', 'horror'] },
        diner: { ru: 'Дайнер', indoor: true, cost: 45000, genres: ['comedy', 'romance', 'drama'] },
        office: { ru: 'Офис', indoor: true, cost: 45000, genres: ['drama', 'comedy', 'action'] },
        stage: { ru: 'Театральная сцена', indoor: true, cost: 65000, genres: ['romance', 'comedy', 'drama'] },
        rooftop: { ru: 'Крыша небоскрёба', indoor: false, cost: 75000, genres: ['action', 'drama', 'horror'] },
        nightclub: { ru: 'Ночной клуб', indoor: true, cost: 85000, genres: ['musical', 'noir', 'comedy', 'romance'] },
        train: { ru: 'Вокзал и вагон', indoor: false, cost: 70000, genres: ['romance', 'drama', 'noir', 'comedy'] },
        camp: { ru: 'Фронтовой лагерь', indoor: false, cost: 80000, genres: ['war', 'drama', 'action'] },
        jungle: { ru: 'Джунгли и храм', indoor: false, cost: 90000, genres: ['adventure', 'horror', 'action'] },
    },

    // --- set staging slots -----------------------------------------------------------------
    // The ScriptGenerator stages actors by ROLE of a point, not by its name: 'a' and 'b' are the
    // two speaking positions, 'wide' is where the establishing camera looks, 'enter' is the door
    // a late arrival comes through, c..f are the rest. Every value MUST be an anchor the matching
    // SetPieces3D set actually declares (tests/fabrika-script.test.mjs checks the file itself).
    ANCHOR_XY: {
        western: { duel_a: [-95, 34], duel_b: [95, 34], porch: [-140, -74], saloon_door: [-140, -90], store: [150, -70], street_w: [-250, 34], street_e: [250, 34], tower: [300, -120], south: [-60, 96] },
        saloon: { bar_in: [-100, -152], bar_out: [-100, -84], piano: [170, 108], table1: [-40, 140], table2: [100, 100], door: [0, 168], center: [0, 20], corner_l: [-210, 150], corner_r: [210, -60] },
        space: { console: [0, -104], chair: [0, 10], center: [0, 60], pod_l: [-200, 120], pod_r: [200, 120], door: [0, 170], window: [0, -170] },
        city: { road_w: [-260, 40], road_e: [260, -40], walk_n: [-60, -120], walk_s: [60, 120], alley: [330, 180], shop: [-160, 150], center: [0, 0] },
        mansion: { sofa: [170, 96], fireplace: [-180, -60], center: [20, 20], table: [60, 100], door: [-60, 190], painting: [-60, -160] },
        forest: { fire_a: [-70, 26], fire_b: [70, 26], fire_c: [0, -60], log: [0, 130], path_w: [-300, 160], deep_e: [300, -60], center: [0, 40] },
        beach: { shore: [-40, -120], sand_a: [-160, 40], sand_b: [100, 80], water: [40, -220], palm: [220, 60], umbrella: [-40, 70], center: [0, 40] },
        lab: { table: [0, 130], table2: [-60, 130], coil: [150, -40], desk: [-190, -20], center: [0, 20], door: [220, 190] },
        diner: { counter: [-35, -30], counter2: [35, -30], booth_l: [-170, 78], booth_r: [170, 78], juke: [200, -110], door: [-240, 60], center: [0, 40] },
        office: { boss: [0, -50], guest1: [-60, 60], guest2: [60, 60], door: [-200, 180], window: [60, -150], center: [0, 20] },
        stage: { mic: [0, 60], piano: [-150, -60], drums: [140, -70], center: [0, -40], curtain_l: [-200, 40], curtain_r: [200, 40], audience: [0, 240], stage_back: [0, -180] },
        rooftop: { edge_s: [0, 190], edge_n: [0, -190], tank: [-140, -20], center: [0, 0], door: [120, -100], ac: [200, 0], antenna: [-60, -160] },
        nightclub: { stage_l: [-90, -140], stage_r: [60, -140], bar: [-160, 40], booth: [200, 0], floor: [0, 60], door: [0, 190], center: [0, -20] },
        train: { platform_w: [-200, 20], platform_e: [160, 20], bench: [-120, 10], kiosk: [220, -40], door_w: [-280, 0], tracks: [0, 120], center: [0, -20] },
        camp: { tent_l: [-160, -40], tent_r: [140, -50], flag: [-20, 0], radio: [60, 70], crate_stack: [-90, 90], fire: [220, 90], center: [0, 20], gate: [0, 130] },
        jungle: { path: [40, 60], clearing: [-20, 0], rock: [100, -40], river: [0, 140], temple: [-200, -50], vine: [-250, -20], center: [20, 20] },
    },

    SET_SLOTS: {
        western: { wide: 'south', a: 'duel_a', b: 'duel_b', c: 'porch', d: 'store', e: 'street_w', f: 'street_e', enter: 'street_e' },
        saloon: { wide: 'center', a: 'table1', b: 'table2', c: 'bar_out', d: 'piano', e: 'corner_l', f: 'corner_r', enter: 'door' },
        space: { wide: 'center', a: 'console', b: 'chair', c: 'pod_l', d: 'pod_r', e: 'window', f: 'door', enter: 'door' },
        city: { wide: 'center', a: 'walk_s', b: 'walk_n', c: 'shop', d: 'alley', e: 'road_w', f: 'road_e', enter: 'road_e' },
        mansion: { wide: 'center', a: 'sofa', b: 'table', c: 'fireplace', d: 'painting', e: 'door', f: 'door', enter: 'door' },
        forest: { wide: 'center', a: 'fire_a', b: 'fire_b', c: 'log', d: 'fire_c', e: 'path_w', f: 'deep_e', enter: 'path_w' },
        beach: { wide: 'center', a: 'sand_a', b: 'sand_b', c: 'umbrella', d: 'palm', e: 'shore', f: 'water', enter: 'shore' },
        lab: { wide: 'center', a: 'desk', b: 'table', c: 'table2', d: 'coil', e: 'door', f: 'door', enter: 'door' },
        diner: { wide: 'center', a: 'booth_l', b: 'booth_r', c: 'counter', d: 'juke', e: 'counter2', f: 'door', enter: 'door' },
        office: { wide: 'center', a: 'boss', b: 'guest1', c: 'guest2', d: 'window', e: 'door', f: 'door', enter: 'door' },
        stage: { wide: 'center', a: 'mic', b: 'piano', c: 'drums', d: 'stage_back', e: 'curtain_l', f: 'curtain_r', enter: 'curtain_l' },
        rooftop: { wide: 'center', a: 'edge_s', b: 'edge_n', c: 'tank', d: 'ac', e: 'antenna', f: 'door', enter: 'door' },
        nightclub: { wide: 'center', a: 'stage_l', b: 'stage_r', c: 'bar', d: 'booth', e: 'floor', f: 'door', enter: 'door' },
        train: { wide: 'center', a: 'platform_w', b: 'platform_e', c: 'bench', d: 'kiosk', e: 'door_w', f: 'tracks', enter: 'door_w' },
        camp: { wide: 'center', a: 'tent_l', b: 'tent_r', c: 'flag', d: 'radio', e: 'crate_stack', f: 'fire', enter: 'gate' },
        jungle: { wide: 'center', a: 'path', b: 'clearing', c: 'rock', d: 'river', e: 'temple', f: 'vine', enter: 'path' },
    },

    // --- people ---------------------------------------------------------------------------
    NAMES_M: ['Рэй', 'Джон', 'Фрэнк', 'Генри', 'Джеймс', 'Уолт', 'Клинт', 'Сэм', 'Джек', 'Чак',
        'Арчи', 'Боб', 'Дин', 'Эд', 'Гэри', 'Хэнк', 'Ирвин', 'Джо', 'Кирк', 'Лео',
        'Марк', 'Нэт', 'Оскар', 'Пол', 'Рой', 'Сет', 'Тед', 'Винс', 'Уэйн', 'Зак',
        'Мартин', 'Дуглас', 'Эррол', 'Хамфри', 'Кэри', 'Спенсер', 'Грегори', 'Бастер', 'Орсон', 'Марлон'],
    NAMES_F: ['Мэри', 'Джейн', 'Лу', 'Роза', 'Энн', 'Китти', 'Долли', 'Вера', 'Элла', 'Флора',
        'Грета', 'Хэзел', 'Ида', 'Джуди', 'Клара', 'Лили', 'Мэй', 'Нора', 'Оливия', 'Перл',
        'Рут', 'Сью', 'Тесс', 'Уна', 'Вивьен', 'Уинни', 'Зельда', 'Айрис', 'Бетти', 'Дороти',
        'Ингрид', 'Одри', 'Мarilyn'.replace('Marilyn', 'Мэрилин'), 'Софи', 'Глория', 'Джинджер', 'Рита', 'Лорен', 'Ава', 'Клодетт'],
    NAMES_LAST: ['Харди', 'Блэквуд', 'Кольт', 'Мэлоун', 'Громов', 'Стил', 'Уокер', 'Донован', 'Фокс', 'Уэйн',
        'Брэддок', 'Квико', 'Мортон', 'Эшфорд', 'Блэк', 'Вулф', 'Кинг', 'Стоун', 'Фрост', 'Грей',
        'Марлоу', 'Оукс', 'Прайс', 'Рейдер', 'Свифт', 'Тейлор', 'Андервуд', 'Вайнс', 'Уинтерс', 'Янг',
        'Занетти', 'Кросби', 'Лейн', 'Мидоуз', 'Нэш', 'Орлов', 'Паркс', 'Ривз', 'Сойер', 'Трэвис'],

    // Appearance palettes for generated people (ActorRig3D looks).
    SKINS: ['#f0c8a0', '#e0b088', '#d9996b', '#c07848', '#a05e34', '#7a4426', '#5a341e'],
    HAIRS: ['#1a120c', '#3a2a1a', '#5a3a20', '#8a5a2a', '#b8823a', '#d6d1c6', '#8a2a1a', '#e8d8a0'],
    SHIRTS_M: ['#b8442f', '#3d639b', '#4a7a4a', '#7a6a52', '#2e3a4a', '#8a3a5a', '#c8b898', '#3a3a44', '#6a4a8a'],
    PANTS_M: ['#3d4a63', '#4a3a2a', '#2a2e38', '#5a5a44', '#3a3a44', '#6a5a44'],
    DRESSES_F: ['#a83a4a', '#3a6a8a', '#4a7a5a', '#8a5a9a', '#c87a3a', '#2e4a6a', '#9a3a6a', '#5a8a8a'],
    SHOES: ['#2a1a0e', '#4a3222', '#1a1a1e', '#5a4630'],
    HATS: ['', '', '', '#6a4a2a', '#3a3a3a', '#8a6a42', '#2a2a2e', '#a8884a'],

    // --- dialogue pools ---------------------------------------------------------------------
    // Slots: {other} — the scene partner's role name, {me} — own role name, {city} — a place,
    // {item} — a prop. Pools are per genre per mood; COMMON fills the gaps.
    DIALOGS: {
        COMMON: {
            neutral: ['Поговорим, {other}? Без свидетелей.', 'Я давно хотел тебе это сказать.',
                'В этом городе ничего не происходит просто так.', 'Ты меня слышишь, {other}?',
                'У нас мало времени. Говори по делу.', 'Иногда молчание дороже слов.',
                'Я не ищу правду, {other}. Я ищу, кто за неё заплатит.',
                'Дверь закрыта. Ключ у меня. Начнём с начала.',
                'Ты опоздал на час. За этот час всё изменилось.',
                'Не здесь. Здесь у стен есть уши, а у ушей — хозяева.'],
            surprise: ['Что?! Откуда ты здесь?', 'Не может быть… Это действительно ты?',
                'Стоп. Повтори, что ты сказал.', 'Я своими глазами не верю!'],
            anger: ['Хватит! Я сыт этим по горло!', 'Ты пожалеешь об этом, {other}.',
                'Ещё слово — и я за себя не отвечаю.', 'Кто тебе позволил?!'],
            fear: ['Мне страшно… Очень страшно.', 'Нам нужно уходить. Сейчас же.',
                'Я слышал шаги. Мы тут не одни.', 'Не оставляй меня здесь, {other}!'],
            love: ['Рядом с тобой я забываю обо всём.', 'Ты — лучшее, что случилось со мной.',
                'Обещай, что это не сон.', 'Я люблю тебя. И плевать, что подумают.'],
            humor: ['Ну конечно, гениальный план. Как всегда.', 'Если мы выживем — с меня обед.',
                'Я не трус. Я просто очень ценю свою жизнь.', 'Скажи, что ты шутишь, {other}…',
                'План отличный. Осталось придумать, как его пережить.',
                'Я бы сказал «всё под контролем», но контроль уволился первым.',
                'Ты ведёшь. Я буду громко соглашаться сзади.',
                'Если нас поймают — я немой. И глухой. И тебя не знаю.'],
            hero: ['Я не отступлю. Пусть попробуют.', 'Кто, если не мы?',
                'Держись за мной, {other}. Прорвёмся.', 'Это мой город. И мои правила.'],
            villain: ['Ты даже не представляешь, с кем связался.', 'Все в этом городе однажды мне заплатят.',
                'Улыбайся. Последний раз.', 'Я всегда получаю то, что хочу.'],
            threat: ['Один неверный шаг — и всё кончено.', 'Считай до трёх, {other}.',
                'Я бы на твоём месте не дёргался.', 'У тебя пять секунд.'],
            parting: ['Прощай, {other}. Не поминай лихом.', 'Мы ещё встретимся. Обязательно.',
                'Уходи. И не возвращайся.', 'Это не конец. Обещаю.'],
        },
        western: {
            neutral: ['Пыль да ветер. Другого тут не бывает.', 'Лошадь устала. И я вместе с ней.',
                'Шериф сказал: до заката успеем.', 'В Силвер-Крик новости приходят с пулей.'],
            threat: ['Убери руку от кобуры, {other}.', 'В этом городе слишком тесно для нас двоих.',
                'Твой ход. Только медленно.', 'Я считаю до трёх. Громко.',
                'Звезда на груди — не броня, шериф. Помни об этом.',
                'Твоя лошадь умнее тебя. Отпусти её и поговорим.',
                'Закат ещё не скоро. Успеем и поговорить, и закопать.',
                'Я не стреляю первым. Я стреляю точнее, {other}.'],
            hero: ['Закон здесь — это я.', 'Один выстрел — и ты труп, {other}.',
                'Я обещал этому городу покой. И я его верну.'],
            villain: ['Золото или кровь. Выбирай.', 'Весь этот городишко сгорит к утру.',
                'Твой значок ничего не стоит за рекой, шериф.'],
            humor: ['Бармен! Виски. И не вздумай разбавлять — я почувствую.',
                'Эта лошадь умнее половины города.', 'Стреляешь ты, конечно… интересно.'],
            parting: ['Поехали, {other}. Нас ждут в Абилин.', 'Солнце садится. Пора в седло.',
                'Я вернусь. Когда в городе будет тихо.'],
        },
        comedy: {
            neutral: ['Это была не моя идея. Совсем не моя.', 'Мы всё исправим. Наверное.',
                'Сосед снова видел нас с лестницей.', 'Улыбаемся и машем, {other}!'],
            humor: ['Ты серьёзно надел ЭТО на свидание?', 'План простой: ты отвлекаешь, я бегу.',
                'Я не толстый, я широкоформатный.', 'В прошлый раз всё тоже «почти получилось».',
                'Моя тёща — детектив. Любительский. Это хуже.',
                'Я спас ситуацию. Какую именно — уточним потом.',
                'Если загорится тревога — это не тревога, это мой будильник.',
                'Деньги не пахнут. Мои, судя по всему, ещё и не моются.'],
            surprise: ['КТО поставил сюда пианино?!', 'Это моя тёща. Беги, {other}, беги!',
                'Полиция?! На моем дне рождения?!'],
            love: ['Ты мне нравишься. Даже когда ты портишь всё.', 'Поцелуй меня, пока я не передумал.',
                'Я ради тебя даже посуду помыл. Дважды.'],
            anger: ['Верни мне мой котелок, {other}!', 'Я подам в суд! На себя! Но подам!'],
            parting: ['До вторника! Или до тюрьмы — как повезёт.', 'Не провожай. Я сам найду выход. Наверное.'],
        },
        drama: {
            neutral: ['Каждый вечер одно и то же. И так двадцать лет.', 'Документы подписаны. Назад дороги нет.',
                'Город спит, а я всё думаю о том дне.', 'Мы стали чужими, {other}. Когда это случилось?'],
            anger: ['Ты лгал мне. Все эти годы.', 'Я отдал тебе всё! А ты даже не спросил!',
                'Уходи. Сейчас же. И не звони больше.'],
            love: ['Я ждала этого слова всю жизнь.', 'Останься. Хотя бы до утра.',
                'Без тебя этот дом — просто стены.',
                'Ты пришёл под дождём. Значит, всё серьёзно.',
                'Не обещай навсегда. Обещай до вторника — и приди.',
                'Я не умею ждать. Но тебя я буду уметь.',
                'Свет не гаси: хочу видеть, что ты не шутишь.'],
            fear: ['Они придут за мной. Я знаю.', 'Если письмо всплывет — мы погибли, {other}.',
                'Я не смогу посмотреть им в глаза.'],
            parting: ['Поезд в шесть. Я не поеду с тобой.', 'Прости. Так будет лучше для всех.',
                'Помни меня таким. Каким я был этим летом.'],
            hero: ['Я скажу правду. Пусть весь город отвернётся.', 'Кто-то должен встать. Я встану.'],
        },
        action: {
            neutral: ['Группа на позиции. Ждём сигнала.', 'Две минуты до точки. Проверь снаряжение.',
                'Диспетчер, я на крыше. Вижу цель.'],
            threat: ['Брось оружие, {other}. Медленно.', 'У тебя десять секунд. Девять…',
                'Они уже здесь. Все выходы перекрыты.'],
            hero: ['Я разберусь. Один. Как всегда.', 'Уводи людей. Их задержу я.',
                'Этот город не упадёт. Не сегодня.'],
            villain: ['Думал, тебя не найдут? Наивный.', 'Взрывчатка уже на месте, {other}.',
                'Я купил эту полицию целиком.'],
            surprise: ['Засада! Уходим, уходим!', 'Вертолёт?! Откуда вертолёт?!',
                'Это ловушка. Мы влипли.'],
            parting: ['Увидимся на той стороне, {other}.', 'Уходи по крышам. Я их задержу.'],
        },
        horror: {
            neutral: ['Дом стоит пустой с тридцатых. И все об этом молчат.', 'Старый погост? Там не хоронят с войны.',
                'Часы остановились в три ночи. Опять.'],
            fear: ['Не оборачивайся, {other}. Умоляю, не оборачивайся.', 'Оно дышит. Я слышу, как оно дышит!',
                'Дверь была заперта. Я сам запирал!', 'Свет! Кто выключил свет?!'],
            threat: ['Ты зашёл слишком далеко, {other}.', 'Отсюда не возвращаются.',
                'Оно знает твоё имя. Уже знает.'],
            villain: ['Все вы — просто мясо для старых стен.', 'Я кормил это место задолго до тебя.'],
            surprise: ['Что это было на чердаке?!', 'Оно было здесь! Прямо за тобой!'],
            parting: ['Беги и не оглядывайся!', 'К рассвету отсюда должны уйти все. Живыми.'],
        },
        scifi: {
            neutral: ['Орбитальная коррекция через два цикла.', 'Реактор стабилен. Пока стабилен.',
                'Земля на связи с задержкой одиннадцать минут.', 'Анализ показал: сигнал искусственный.'],
            surprise: ['Это не астероид. Это корабль.', 'Оно… учится. Прямо сейчас.',
                'Экипаж, общий сбор! Немедленно!'],
            threat: ['Протокол самоуничтожения активирован.', 'Они заблокировали шлюзы, {other}.',
                'У нас шесть минут кислорода. Пять с половиной.'],
            hero: ['Я перепрограммирую ядро вручную. Держите коридор!',
                'Человечество не закончится здесь. Не сегодня.', 'Пристегнись, {other}. Будет жёстко.'],
            villain: ['Ваш вид — ошибка вычислений.', 'Сопротивление статистически бессмысленно.',
                'Я перепишу этот мир. Начну с тебя.'],
            humor: ['Инопланетяне, а ведут себя как туристы.', 'Космос большой. А кофе на борту закончился.'],
        },
        war: {
            neutral: ['Пайка на всех, сон по очереди, надежда по норме.',
                'Рация молчит с четырёх. Это хуже, чем если бы она кричала.',
                'Проверь ремни и шнурки: в бою спотыкаются о мелочи.',
                'Письмо напишешь после. Если будет «после», {other}.'],
            threat: ['Они подтянули миномёты к высоте. Считай до трёх и ложись.',
                'Ещё один патруль пройдёт — и мы не уйдём, {other}.',
                'Фланг открыт. Приказ не изменится. Держим.',
                'Если обойма кончится — держи приклад. Приклад не кончается.'],
            hero: ['Я иду первым. Спорить можно потом, после рубежа.',
                'Никто не остаётся. Ни человек, ни имя, ни флаг.',
                'Держим до темноты. Темнота наша, мы её знаем.',
                'Прикрой левый. Я возьму на себя всё остальное, {other}.'],
            parting: ['Отдай мне каску: у тебя дома её ждут больше.',
                'Договорим после. Это не прощание, это пауза, {other}.',
                'Скажешь моим, что я не геройствовал. Я работал.',
                'Поезд уходит без огней. Считай, что нас не было.'],
            fear: ['Земля гудит. Это не артиллерия, это колонна.',
                'Мальчишка с третьей роты не спит третью ночь. Держи его рядом.',
                'Тишина длиннее выстрела. Не выдерживай её первым.',
                'У меня кончились бинты. Осталась только злость, {other}.'],
        },
        adventure: {
            neutral: ['Компас врёт на три градуса. Карта — на все тридцать.',
                'Привал до темноты: джунгли ночью меняют тропы.',
                'Провизия на четыре дня, путь на шесть. Идём.',
                'За этим порогом кончаются чужие законы, {other}.'],
            surprise: ['Этот «миф» только что перешёл реку. Вверх по течению!',
                'Под плитой пустота. И в пустоте — сквозняк со стороны моря.',
                'След свежий. Значит, мы не первые. Значит, торопимся.',
                'Ключ подошёл. Замок старше ключа на триста лет!'],
            humor: ['Я не терялся. Я изучал местность задом наперёд.',
                'Обезьяна унесла компас. Технически она теперь штурман.',
                'В контракте не было пиявок, {other}. Ни слова.',
                'Если карта и местность не совпадают — верь местности.'],
            hero: ['Верёвку держу я. Спорить будешь наверху.',
                'Никто не идёт в храм один. Идём вдвоём, считаем до трёх.',
                'Груз бросаем, знания несём. Знания легче золота.',
                'Держись за мной: тропа узкая, а я уже падал здесь.'],
            threat: ['За нами идут с собаками. Собакам платят больше, чем нам.',
                'Отдай амулет, и, может быть, останешься легендой живым.',
                'Этот мост держит троих. Нас четверо. Думай, {other}.',
                'С закатом прилив поднимет воду и следы. Нас тоже.'],
        },
        noir: {
            neutral: ['Дождь идёт третью ночь. Улики смывает вместе с алиби.',
                'В этом городе честных хоронят быстрее, чем богатых.',
                'Оставь оружие в ящике, {other}. Разговор будет длинным.',
                'Мой гонорар — пятьдесят в день. Плюс расходы на совесть.'],
            threat: ['Ты копаешь не там, {other}. Там фундамент моего дома.',
                'Ещё один вопрос — и ты станешь частью пейзажа.',
                'Полиция куплена до участкового включительно. Думай головой.',
                'У тебя есть ночь уехать. Поезда ходят, пока горит вокзал.'],
            villain: ['Порядок в городе — это моя бухгалтерия, {other}.',
                'Я не злодей. Я просто раньше прочих прочитал договор.',
                'Свидетели стареют. Дела закрываются. Я остаюсь.',
                'За каждую правду кто-то платит. Сегодня платишь ты.'],
            fear: ['Кто-то поднял мою трубку и молчал. Дышал и молчал.',
                'За хвостом идёт третий день. Он даже не прячется.',
                'В моем сейфе лежит то, за что нас обоих закопают, {other}.',
                'Не гаси свет. В темноте они считают шаги.'],
            parting: ['Садись на поезд, {other}. Билет у кондуктора, фамилия чужая.',
                'Я вернусь, когда город станет дешевле моей совести.',
                'Не ищи меня. Я умею пропадать по документам.',
                'Если не вернусь к утру — сожги архив. Весь.'],
        },
        musical: {
            neutral: ['Оркестр играет до трёх. После трёх играет долг.',
                'Кулисы помнят всех, кого не помнит зал.',
                'Репетиция в шесть. Слава — в восемь. Сон — никогда.',
                'Танцуй так, будто аренда не грозит, {other}.'],
            love: ['Твой голос вытащил меня из третьего ряда.',
                'Спой ещё раз — и я поверю во всё, включая нас.',
                'Между тактами я успеваю тебя полюбить.',
                'Танец — это разговор, который не боится свидетелей, {other}.'],
            humor: ['У меня слух абсолютный: я абсолютно не слышу нот.',
                'Продюсер сказал «бюджет скромный». Скромный уже уволился.',
                'Если сорвём премьеру — сорвём её красиво, с оркестром.',
                'Я не путаю шаги. Я импровизирую сюжет, {other}.'],
            surprise: ['Зал встал! Зал, который не вставал даже на пожар!',
                'Критик улыбнулся. У него, оказывается, лицо работает.',
                'Третий выход на бис. У нас столько песен нет!',
                'Оркестр сыграл мою партию. Мою!'],
            parting: ['Гастроли уходят на рассвете. Aplodисменты остаются.',
                'Держи билет. Я останусь доиграть этот город.',
                'Кулисы смыкаются, {other}. Но занавес — не стена.',
                'Если вернёшься — начнём с той же ноты. С самой верхней.'],
        },
        romance: {
            neutral: ['Ты всегда заказываешь два кофе. Пьёшь один.', 'Этот вечер был почти идеальным.',
                'Мы знакомы три дня. Почему я всё о тебе знаю?'],
            love: ['Скажи это ещё раз. Медленно.', 'Я искала тебя во всех городах. Нашла в этом.',
                'Танцуй со мной, {other}. Пока играет оркестр.', 'Любовь не во время. Любовь — вопреки.'],
            humor: ['Ты наступил мне на платье. Романтично.', 'Свидание вслепую? Я хотя бы вижу.',
                'Если это провал — давай провалим это красиво.'],
            parting: ['Поезд уходит в полночь. Со мной или без меня.', 'Не провожай. Иначе я не уеду.',
                'Напиши мне. Хотя бы раз.'],
            fear: ['Отец никогда не согласится, {other}.', 'Что, если это последний вечер?',
                'Обещай, что не исчезнешь, как тогда.'],
        },
    },

    // Narration cards (silent-film flavor between scenes).
    NARR: {
        COMMON: ['Тем временем в {city}…', 'Прошло три дня…', 'Никто не знал, чем обернётся этот вечер…',
            'И тогда случилось неизбежное…', 'Вдали от любопытных глаз…', 'На следующее утро…'],
        western: ['Полдень палил нещадно…', 'Дилижанс ушёл без него…', 'В Силвер-Крик снова пахло порохом…'],
        horror: ['Ночь была безлунной…', 'Дом ждал новых гостей…', 'Тени в этом городе живут своей жизнью…'],
        scifi: ['Год 2147. Орбита Нептуна…', 'Сигнал пришёл из пустоты…', 'Бортовой журнал, запись последняя…'],
        romance: ['Тот вечер изменил всё…', 'Их разделял целый океан…', 'Судьба назначила встречу в семь…'],
        noir: ['Дождь смывал улики быстрее, чем память…', 'В этом городе правду продают оптом…', 'Она вошла, и где-то щёлкнул курок…'],
        musical: ['Оркестр настроился, и город затаил дыхание…', 'Кулисы пахли пудрой и удачей…', 'В этот вечер танцевали даже долги…'],
        war: ['На рассвете выступали тихо, без труб…', 'Письма домой писали между обстрелами…', 'Этот рубеж держали трое. Именовались — полк…'],
        adventure: ['Карта врала в трёх местах, и все три вели туда…', 'Проводник взял плату вперёд и не улыбнулся…', 'За этим горизонтом кончались чужие законы…'],
        comedy: ['Ничего не предвещало катастрофы…', 'Как обычно, всё пошло не по плану…'],
        action: ['До взрыва оставалось четыре минуты…', 'Операция «Полночь» началась…'],
        drama: ['Город хранил эту тайну сорок лет…', 'Всё решилось в тот тихий вечер…'],
    },

    // Title generator parts.
    TITLES: {
        western: { a: ['Дикий', 'Пыльный', 'Последний', 'Свирепый', 'Одинокий', 'Грозный'], n: ['Запад', 'Револьвер', 'Шериф', 'Каньон', 'Дилижанс', 'Полдень', 'Закон', 'След'] },
        comedy: { a: ['Безумный', 'Неуловимый', 'Весёлый', 'Ужасный', 'Совершенный', 'Полоумный'], n: ['Переполох', 'Котелок', 'Уик-энд', 'Родственник', 'Сосед', 'Обман', 'Тост'] },
        drama: { a: ['Тихий', 'Долгий', 'Последний', 'Стеклянный', 'Горький', 'Забытый'], n: ['Океан', 'Вечер', 'Свет', 'Выбор', 'Разрыв', 'Сад', 'Свидетель'] },
        action: { a: ['Стальной', 'Горячий', 'Крайний', 'Мёртвый', 'Высший', 'Двойной'], n: ['Удар', 'Рубеж', 'Протокол', 'Захват', 'Бросок', 'Эскорт', 'Шторм'] },
        horror: { a: ['Чёрный', 'Мёртвый', 'Старый', 'Безмолвный', 'Проклятый', 'Гнилой'], n: ['Дом', 'Подвал', 'Шёпот', 'Туман', 'Обряд', 'Склеп', 'Гость'] },
        scifi: { a: ['Нулевой', 'Ледяной', 'Дальний', 'Квантовый', 'Седьмой', 'Пустотный'], n: ['Орбит', 'Горизонт', 'Код', 'Сектор', 'Сигнал', 'Предел', 'Марс'] },
        romance: { a: ['Последний', 'Нежный', 'Случайный', 'Долгий', 'Тёплый', 'Первый'], n: ['Вальс', 'Поцелуй', 'Билет', 'Маяк', 'Романс', 'Дождь', 'Вокзал'] },
        noir: { a: ['Мокрый', 'Чужой', 'Поздний', 'Гнусный', 'Тихий', 'Кривой'], n: ['Свидетель', 'Переулок', 'Гонорар', 'След', 'Полуночник', 'Двойник', 'Пепел'] },
        musical: { a: 'Певучий,Весёлый,Звонкий,Танцующий,Праздничный,Голосистый'.split(','), n: 'Танец,Голос,Праздник,Дебют,Бенефис,Финал,Огонь'.split(',') },
        war: { a: ['Тихий', 'Железный', 'Последний', 'Безымянный', 'Первый', 'Долгий'], n: ['Полк', 'Рубеж', 'Конвой', 'Плацдарм', 'Патруль', 'Рассвет', 'Огонь'] },
        adventure: { a: ['Затерянный', 'Смелый', 'Дальний', 'Золотой', 'Тайный', 'Быстрый'], n: ['Маршрут', 'Клад', 'Компас', 'Караван', 'Остров', 'Путь', 'Портал'] },
    },
    CITIES: ['Силвер-Крик', 'Абилин', 'Тумстоун', 'Додж-Сити', 'Сан-Вера', 'Порто-Белло', 'Грайтон', 'Фэр-Оукс', 'Ривермут', 'Эльдорадо'],

    // Era drift: genre heat by decade (1950s start). Keys — decade start year.
    ERAS: {
        1950: { war: 9, adventure: 7, noir: 6, musical: 8, western: 10, comedy: 8, drama: 7, action: 6, horror: 5, scifi: 6, romance: 9 },
        1960: { war: 8, adventure: 7, noir: 7, musical: 8, western: 8, comedy: 9, drama: 8, action: 7, horror: 6, scifi: 7, romance: 8 },
        1970: { war: 7, adventure: 8, noir: 8, musical: 6, western: 5, comedy: 8, drama: 9, action: 9, horror: 8, scifi: 8, romance: 6 },
        1980: { war: 5, adventure: 9, noir: 6, musical: 5, western: 4, comedy: 9, drama: 7, action: 10, horror: 8, scifi: 10, romance: 7 },
        1990: { war: 4, adventure: 9, noir: 7, musical: 6, western: 5, comedy: 9, drama: 8, action: 9, horror: 7, scifi: 9, romance: 8 },
        2000: { war: 4, adventure: 8, noir: 7, musical: 6, western: 4, comedy: 10, drama: 7, action: 10, horror: 8, scifi: 9, romance: 8 },
    },

    // Review quote templates by score band. {t} — title, {g} — genre name, {d} — director, {s} — a lead.
    REVIEWS: [
        { min: 0, max: 3.5, quotes: [
            '«{t}» — два часа жизни, которые никто не вернёт.', 'Даже декорации в «{t}» играют лучше актёров.',
            'Я видел «{t}». Мне жаль. По-человечески жаль.', '{g} умер в тот день, когда вышел «{t}».',
            'Режиссёр «{t}» должен сдать лицензию и уехать в прерию.', '«{t}»: ни сюжета, ни смысла, ни стыда.'] },
        { min: 3.5, max: 5.5, quotes: [
            'В «{t}» есть одна удачная сцена. Найдите её сами.', '«{t}» — не провал, но и не кино.',
            'Смотреть «{t}» можно. Засыпать — нужно.', '{s} старается. Сценарий — нет.',
            '«{t}» собран из клише, но собран аккуратно.'] },
        { min: 5.5, max: 7.2, quotes: [
            '«{t}» — крепкая работа без чудес.', 'Хороший {g} на вечер: «{t}» именно таков.',
            '«{t}» держит темп и не позорит жанр.', '{s} вытягивает «{t}» на своих плечах.',
            'Не шедевр, но билет стоит своих денег. «{t}».'] },
        { min: 7.2, max: 8.7, quotes: [
            '«{t}» — лучшее, что случалось с жанром {g} за годы.', 'От «{t}» невозможно оторваться: монтаж, свет, игра — всё.',
            '{s} в «{t}» играет роль всей карьеры.', '«{t}» — кино, после которого выходишь другим.',
            'Рукоплещу. «{t}» — настоящий, живой, дерзкий.'] },
        { min: 8.7, max: 10.1, quotes: [
            '«{t}» — шедевр. Точка. Дальше только музей.', 'Сто лет кинематографа вели к «{t}».',
            '«{t}» переизобретает {g} и забирает все награды года.', 'Я плакал. Дважды. «{t}» — великое кино.',
            'Если увидите один фильм в этом году — пусть это будет «{t}».'] },
    ],

    // --- the demo film (Phase A showpiece): «Полдень в Силвер-Крик» -------------------------
    // Timeline contract of the MovieSequencer: scenes -> shots -> beats. Everything is plain
    // JSON — the ScriptGenerator emits exactly this shape for real films.
    DEMO_MOVIE: {
        id: 'demo-noon',
        title: 'Полдень в Силвер-Крик',
        genre: 'western',
        year: 1952,
        seed: 7,
        cast: [
            { id: 'a1', role: 'Шериф Коул', name: 'Генри Мэлоун',
                look: { skin: '#d9996b', hair: '#3a2a1a', shirt: '#4a6a8a', pants: '#3a3a44', shoes: '#2a1a0e', hat: '#6a4a2a', gender: 'm', hairStyle: 0, scale: 1.05, model: 'robot' } },
            { id: 'a2', role: 'Блэк Джек', name: 'Клинт Уокер',
                look: { skin: '#c07848', hair: '#1a120c', shirt: '#2a2a2e', pants: '#1a1a1e', shoes: '#1a1a1e', hat: '#2a2a2e', gender: 'm', hairStyle: 3, scale: 1.1 } },
            { id: 'a3', role: 'Роза', name: 'Мэри Фокс',
                look: { skin: '#f0c8a0', hair: '#8a2a1a', shirt: '#a83a4a', pants: '#a83a4a', shoes: '#4a3222', hat: '', gender: 'f', hairStyle: 1, scale: 0.95 } },
            { id: 'e1', role: 'Горожанин', name: 'Сэм Стоун',
                look: { skin: '#e0b088', hair: '#5a5a52', shirt: '#7a6a52', pants: '#4a3a2a', shoes: '#2a1a0e', hat: '#8a6a42', gender: 'm', hairStyle: 0, scale: 1 } },
            { id: 'e2', role: 'Горожанка', name: 'Лу Грей',
                look: { skin: '#d9996b', hair: '#1a120c', shirt: '#3a6a8a', pants: '#3a6a8a', shoes: '#2a1a0e', hat: '', gender: 'f', hairStyle: 2, scale: 0.93 } },
        ],
        credits: { director: 'Джон Форд-младший', writer: 'Уолт Мэлоун', composer: 'Оркестр студии' },
        scenes: [
            {
                set: 'western', timeOfDay: 'day', label: 'Сцена 1. Пыльная улица',
                music: 'western', tint: null,
                enter: [
                    { who: 'a1', anchor: 'street_w', heading: 0, act: 'idle' },
                    { who: 'a3', anchor: 'porch', heading: 90, act: 'idle' },
                    { who: 'e1', anchor: 'south', heading: 0, act: 'idle' },
                    { who: 'e2', anchor: 'south', heading: 0, act: 'idle' },
                ],
                shots: [
                    { dur: 7.0, trans: 'fade', cam: { type: 'wide', anchor: 'street_w', az: -90, pitch: 50, zoom: 0.8 },
                        beats: [
                            { t: 0.4, who: 'a1', to: 'duel_a', speed: 95 },
                            { t: 1.2, narr: 'Полдень палил нещадно…', dur: 2.6 },
                            { t: 4.4, who: 'a3', act: 'look', look: 'a1' },
                            { t: 5.2, who: 'e1', to: { x: 60, y: 96 }, speed: 70 },
                        ] },
                    { dur: 5.2, trans: 'cut', cam: { type: 'medium', who: 'a1', pitch: 12, zoom: 2.1 },
                        beats: [
                            { t: 0.4, who: 'a1', say: 'Спокойно, город. Он едет.', dur: 2.8 },
                            { t: 3.6, who: 'a1', act: 'look', look: 0 },
                        ] },
                    { dur: 4.2, trans: 'cut', cam: { type: 'close', who: 'a3', pitch: 8, zoom: 4.0 },
                        beats: [
                            { t: 0.3, who: 'a3', say: 'Осторожнее, шериф… он уже убивал.', dur: 3.0 },
                            { t: 0.3, who: 'a3', act: 'talk' },
                        ] },
                ],
            },
            {
                set: 'western', timeOfDay: 'day', label: 'Сцена 2. Приезд незнакомца',
                music: 'western', tint: null,
                enter: [],
                props: [{ id: 'horse', anchor: 'street_e', heading: 180 }],
                shots: [
                    { dur: 6.5, trans: 'fade', cam: { type: 'wide', anchor: 'street_e', az: -90, pitch: 48, zoom: 0.85 },
                        beats: [
                            { t: 0.2, sfx: 'hooves', vol: 0.9 },
                            { t: 0.3, who: 'a2', spawn: 'street_e', h: 62, act: 'ride' },
                            { t: 0.3, moveProp: 'horse', to: 'duel_b', speed: 300, heading: 180 },
                            { t: 0.3, who: 'a2', rideProp: 'horse', h: 62 },
                            { t: 2.6, sfx: 'gasp', vol: 0.7 },
                            { t: 3.4, who: 'a2', unride: true },
                            { t: 3.6, moveProp: 'horse', to: 'street_w', speed: 320, heading: 0 },
                            { t: 5.6, despawnProp: 'horse' },
                        ] },
                    { dur: 4.6, trans: 'cut', cam: { type: 'medium', who: 'a2', pitch: 10, zoom: 2.2 },
                        beats: [
                            { t: 0.4, who: 'a2', say: 'Городок-то мелковат для нас двоих, шериф.', dur: 3.4 },
                            { t: 0.4, who: 'a2', act: 'talk' },
                        ] },
                    { dur: 3.4, trans: 'cut', cam: { type: 'close', who: 'a1', pitch: 6, zoom: 4.2, fov: 40 },
                        beats: [{ t: 0.3, who: 'a1', say: 'Один выстрел — и ты труп, Блэк.', dur: 2.6 }, { t: 0.3, who: 'a1', act: 'talk' }] },
                    { dur: 3.2, trans: 'cut', cam: { type: 'close', who: 'a2', roll: 9, pitch: 4, zoom: 4.4, fov: 40 },
                        beats: [{ t: 0.3, who: 'a2', say: 'Проверим?', dur: 1.8 }, { t: 0.3, who: 'a2', act: 'talk' }] },
                ],
            },
            {
                set: 'saloon', timeOfDay: 'day', label: 'Сцена 3. В салуне',
                music: 'western', tint: null,
                enter: [{ who: 'a3', anchor: 'bar_out', heading: -90, act: 'idle' }],
                shots: [
                    { dur: 5.0, trans: 'fade', cam: { type: 'wide', anchor: 'center', az: -90, pitch: 44, zoom: 1.0 },
                        beats: [
                            { t: 0.3, who: 'a3', to: 'table1', speed: 80 },
                            { t: 1.6, narr: 'В салуне говорили только шёпотом…', dur: 2.4 },
                        ] },
                    { dur: 4.4, trans: 'cut', cam: { type: 'over', who: 'e1', who2: 'a3', zoom: 2.8 },
                        beats: [
                            { t: 0.2, who: 'e1', spawn: 'corner_l', act: 'idle' },
                            { t: 0.3, who: 'a3', say: 'Он убил моего брата. Уходите, шериф.', dur: 3.2 },
                            { t: 0.3, who: 'a3', act: 'talk' },
                        ] },
                    { dur: 3.6, trans: 'cut', cam: { type: 'close', who: 'a3', pitch: 8, zoom: 4.0 },
                        beats: [{ t: 0.3, who: 'a3', say: 'Но я знаю: вы не уйдёте.', dur: 2.6 }, { t: 0.3, who: 'a3', act: 'talk' }] },
                ],
            },
            {
                set: 'western', timeOfDay: 'sunset', label: 'Сцена 4. Дуэль',
                music: 'western', tint: 'sunset',
                enter: [
                    { who: 'a1', anchor: 'duel_a', heading: 0, act: 'idle' },
                    { who: 'a2', anchor: 'duel_b', heading: 180, act: 'idle' },
                    { who: 'a3', anchor: 'porch', heading: 90, act: 'idle' },
                    { who: 'e1', anchor: 'south', heading: 0, act: 'idle' },
                    { who: 'e2', anchor: 'south', heading: 0, act: 'idle' },
                ],
                shots: [
                    { dur: 5.5, trans: 'fade', cam: { type: 'wide', anchor: 'duel_a', az: -90, pitch: 46, zoom: 0.75 },
                        beats: [
                            { t: 0.5, narr: 'Двое. Одна улица. Один закат.', dur: 3.0 },
                            { t: 4.0, who: 'a3', act: 'fear' },
                        ] },
                    { dur: 1.4, trans: 'cut', cam: { type: 'close', who: 'a1', zoom: 4.6, fov: 38, pitch: 2 }, beats: [] },
                    { dur: 1.3, trans: 'cut', cam: { type: 'close', who: 'a2', zoom: 4.6, fov: 38, pitch: 2 }, beats: [] },
                    { dur: 1.2, trans: 'cut', cam: { type: 'close', who: 'a3', zoom: 4.2, fov: 38 }, beats: [{ t: 0.2, sfx: 'gasp', vol: 0.6 }] },
                    { dur: 4.2, trans: 'cut', cam: { type: 'duo', who: 'a1', who2: 'a2', pitch: 10, zoom: 1.8 },
                        beats: [
                            { t: 0.6, sfx: 'gunshot', who: 'a1' },
                            { t: 0.6, who: 'a1', act: 'punch' },
                            { t: 0.6, shake: 0.07, ms: 420 },
                            { t: 0.6, fx: 'flash' },
                            { t: 0.9, sfx: 'gunshot', who: 'a2', vol: 0.8 },
                            { t: 1.0, who: 'a2', act: 'fall' },
                            { t: 2.6, who: 'e1', act: 'cheer' },
                            { t: 2.8, who: 'e2', act: 'cheer' },
                            { t: 3.0, sfx: 'applause', vol: 0.5 },
                        ] },
                    { dur: 5.0, trans: 'cut', cam: { type: 'medium', who: 'a1', pitch: 12, zoom: 2.2 },
                        beats: [
                            { t: 0.5, who: 'a1', act: 'idle' },
                            { t: 0.8, who: 'a1', say: 'В этом городе слишком шумно по утрам.', dur: 3.2 },
                        ] },
                    { dur: 6.5, trans: 'cut', cam: { type: 'wide', anchor: 'porch', az: -90, pitch: 40, zoom: 1.05 },
                        beats: [
                            { t: 0.4, who: 'a1', to: 'porch', speed: 90 },
                            { t: 2.2, who: 'a3', to: { anchor: 'porch', dx: 40, dy: 26 }, speed: 80 },
                            { t: 3.4, who: 'a1', face: 'a3' },
                            { t: 3.9, who: 'a1', act: 'kiss' },
                            { t: 4.0, who: 'a3', act: 'kiss' },
                            { t: 4.1, sfx: 'kiss', vol: 0.8 },
                            { t: 5.0, sfx: 'laugh', vol: 0.35 },
                        ] },
                    { dur: 7.0, trans: 'fade', cam: { type: 'crane', anchor: 'porch', az: -90, pitch: 40, zoom: 1.0, to: { pitch: 62, zoom: 0.5, h: 160 } },
                        beats: [
                            { t: 2.0, who: 'e1', act: 'cheer' },
                            { t: 2.4, who: 'e2', act: 'cheer' },
                            { t: 3.0, endCard: 'КОНЕЦ' },
                        ] },
                ],
            },
        ],
    },
};

// Content consistency: GENRES[g].sets and SET_INFO[set].genres are two views of ONE relation.
// Sync them at load so a half-wired set or genre can never ship: a set a genre films in is a
// set that claims the genre, and vice versa. Tests (fabrika-content) enforce the symmetry.
(() => {
    for (const g of Object.keys(MovieData.GENRES)) {
        for (const set of MovieData.GENRES[g].sets || []) {
            const info = MovieData.SET_INFO[set];
            if (info && (info.genres || []).indexOf(g) < 0) info.genres = (info.genres || []).concat(g);
        }
    }
    for (const set of Object.keys(MovieData.SET_INFO)) {
        for (const g of MovieData.SET_INFO[set].genres || []) {
            const G = MovieData.GENRES[g];
            if (G && (G.sets || []).indexOf(set) < 0) G.sets = (G.sets || []).concat(set);
        }
    }
})();

// The genre heat for a year (era drift): heat 1..10.
MovieData.heat = function (genre, year) {
    const decades = Object.keys(MovieData.ERAS).map(Number).sort((a, b) => a - b);
    let lo = decades[0], hi = decades[decades.length - 1];
    for (let i = 0; i < decades.length - 1; i++) {
        if (year >= decades[i] && year <= decades[i + 1]) { lo = decades[i]; hi = decades[i + 1]; break; }
    }
    if (year <= lo) return MovieData.ERAS[lo][genre];
    if (year >= hi) return MovieData.ERAS[hi][genre];
    const k = (year - lo) / (hi - lo);
    const a = MovieData.ERAS[lo][genre], b = MovieData.ERAS[hi][genre];
    return Math.round((a + (b - a) * k) * 10) / 10;
};

// --- cinema optics (pure): the lens table every solver reads ---------------------------------
// A shot size means a focal length; a focal length means a vertical FOV for the Super35 gate.
// The rig solver (ScriptGenerator._rig) derives zoom from the FOV so the camera lands exactly
// on its spot, and MovieSequencer._poseFor defaults the same FOVs on hand-written poses — one
// table, two readers, no drift. Numbers come from Constants.js (CINE_LENS_*).
MovieData.lensMm = function (shotType) {
    const U = 'undefined';
    const wide = typeof CINE_LENS_WIDE_MM !== U ? CINE_LENS_WIDE_MM : 24;
    const med = typeof CINE_LENS_MED_MM !== U ? CINE_LENS_MED_MM : 50;
    const duo = typeof CINE_LENS_DUO_MM !== U ? CINE_LENS_DUO_MM : 40;
    const close = typeof CINE_LENS_CLOSE_MM !== U ? CINE_LENS_CLOSE_MM : 85;
    const low = typeof CINE_LENS_LOW_MM !== U ? CINE_LENS_LOW_MM : 28;
    switch (shotType) {
        case 'wide': case 'crane': return wide;
        case 'duo': case 'over': return duo;
        case 'close': case 'dutch': return close;
        case 'low': return low;
        case 'medium': case 'fixed': default: return med;
    }
};

/** Vertical FOV (deg) of a focal length on the cine gate: 2·atan(sensor / (2·f)). */
MovieData.lensFov = function (mm) {
    const U = 'undefined';
    const sensor = Math.max(4, typeof CINE_LENS_SENSOR_MM !== U ? CINE_LENS_SENSOR_MM : 24.9);
    const f = Math.max(4, Number(mm) || 50);
    return 2 * Math.atan(sensor / (2 * f)) * 180 / Math.PI;
};

/** The lens of a semantic shot size, straight in degrees of vertical FOV. */
MovieData.fovFor = function (shotType) { return MovieData.lensFov(MovieData.lensMm(shotType)); };

/** The coarse plan class of a shot tag: what DoF, shadows and lighting key off. */
MovieData.planSize = function (tag) {
    switch (tag) {
        case 'close': case 'dutch': return 'close';
        case 'medium': case 'duo': case 'over': case 'low': return 'mid';
        case 'wide': case 'crane': case 'fixed': return 'wide';
        default: return 'mid';
    }
};

// --- color script: one dominant palette per scene kind ---------------------------------------
// The accent biases the LUT's highlight (and a little of the shadow) split-tone, so a
// romance scene keeps a rose gate and a crisis a cold steel one — the picture has one
// dominant color per scene, the way a color script promises. Numbers are content, like
// the genre tables; CINE_COLORSCRIPT masters the whole effect.
MovieData.ACCENTS = {
    intro: [0.02, 0.01, 0.0],
    meet: [0.05, 0.03, -0.01],
    setup: [0.0, 0.01, 0.02],
    threat: [-0.02, 0.01, 0.05],
    chase: [0.06, 0.02, -0.03],
    fight: [0.07, -0.02, -0.02],
    romance: [0.06, 0.01, 0.03],
    reveal: [-0.02, 0.04, 0.05],
    comic: [0.05, 0.03, 0.0],
    crisis: [-0.03, 0.0, 0.06],
    climax: [0.06, -0.01, 0.02],
    coda: [0.04, 0.02, 0.01],
};

/** The scene kind's accent (a 0..1 master lives in CINE_COLORSCRIPT); unknown kinds stay neutral. */
MovieData.accentFor = function (kind) {
    const U = 'undefined';
    const k = typeof CINE_COLORSCRIPT !== U ? CINE_COLORSCRIPT : 1;
    const a = MovieData.ACCENTS[kind || ''] || [0, 0, 0];
    return [a[0] * k, a[1] * k, a[2] * k];
};

/**
 * The rule of thirds (pure): how far to shift the look-at point sideways so the subject
 * lands on a thirds line instead of the center. The offset is perpendicular to the lens
 * axis in MAP space; side ±1 chooses the left/right third (coverage alternates it).
 * @returns {{ dx: number, dy: number }} map px
 */
MovieData.thirdsOffset = function (azDeg, dist, vfovDeg, side) {
    const U = 'undefined';
    const aspect = typeof CINE_FRAME_ASPECT !== U ? CINE_FRAME_ASPECT : 1.78;
    const half = Math.tan(Math.max(4, Math.min(110, vfovDeg || 52)) * Math.PI / 360) * Math.max(20, dist || 100);
    const off = (side < 0 ? -1 : 1) * (half * aspect) / 3;   // half-width / 3 puts the subject on the line
    const az = (azDeg || 0) * Math.PI / 180;
    return { dx: -Math.sin(az) * off, dy: Math.cos(az) * off };
};
