// MovieData.js — the game's content tables (RU): genres, sets, dialogue pools, names,
// title/review generators, era drift, sound paths and the handcrafted demo film.
// Pure data + pure functions: no DOM, no pc.*, no engine calls. The ScriptGenerator and the
// MovieSequencer read from here. Sound paths are quoted LITERALS — the builder's asset
// scanner archives exactly these files (tools/make-movie-sounds.mjs generates them).

/** @satisfies {Record<string, any>} */
const MovieData = {
    /** Genre heat 1..10 for a year (assigned below). @type {((genre: string, year: number) => number) | null} */
    heat: null,

    // --- sound -------------------------------------------------------------------------
    // SFX ids used by timeline beats -> asset paths (literals for the scanner).
    SFX: {
        cut: 'assets/sounds/cut.wav',
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
                'У нас мало времени. Говори по делу.', 'Иногда молчание дороже слов.'],
            surprise: ['Что?! Откуда ты здесь?', 'Не может быть… Это действительно ты?',
                'Стоп. Повтори, что ты сказал.', 'Я своими глазами не верю!'],
            anger: ['Хватит! Я сыт этим по горло!', 'Ты пожалеешь об этом, {other}.',
                'Ещё слово — и я за себя не отвечаю.', 'Кто тебе позволил?!'],
            fear: ['Мне страшно… Очень страшно.', 'Нам нужно уходить. Сейчас же.',
                'Я слышал шаги. Мы тут не одни.', 'Не оставляй меня здесь, {other}!'],
            love: ['Рядом с тобой я забываю обо всём.', 'Ты — лучшее, что случилось со мной.',
                'Обещай, что это не сон.', 'Я люблю тебя. И плевать, что подумают.'],
            humor: ['Ну конечно, гениальный план. Как всегда.', 'Если мы выживем — с меня обед.',
                'Я не трус. Я просто очень ценю свою жизнь.', 'Скажи, что ты шутишь, {other}…'],
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
                'Твой ход. Только медленно.', 'Я считаю до трёх. Громко.'],
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
                'Я не толстый, я широкоформатный.', 'В прошлый раз всё тоже «почти получилось».'],
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
                'Без тебя этот дом — просто стены.'],
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
        comedy: ['Ничего не предвещало катастрофы…', 'Как обычно, всё пошло не по плану…'],
        action: ['До взрыва оставалось четыре минуты…', 'Операция «Полночь» началась…'],
        drama: ['Город хранил эту тайну сорок лет…', 'Всё решилось в тот тихий вечер…'],
    },

    // Title generator parts.
    TITLES: {
        western: { a: ['Дикий', 'Пыльный', 'Последний', 'Свирепый', 'Одинокий', 'Грозный'], n: ['Запад', 'Револьвер', 'Шериф', 'Каньон', 'Дилижанс', 'Полдень', 'Закон', 'След'] },
        comedy: { a: ['Безумный', 'Неуловимый', 'Весёлый', 'Ужасно', 'Совершенно', 'Почти'], n: ['Переполох', 'Котелок', 'Уик-энд', 'Родственник', 'Сосед', 'Обман', 'Тост'] },
        drama: { a: ['Тихий', 'Долгий', 'Последний', 'Стеклянный', 'Горький', 'Забытый'], n: ['Океан', 'Вечер', 'Свет', 'Выбор', 'Разрыв', 'Сад', 'Свидетель'] },
        action: { a: ['Стальной', 'Горячий', 'Крайний', 'Мёртвый', 'Высший', 'Двойной'], n: ['Удар', 'Рубеж', 'Протокол', 'Захват', 'Бросок', 'Эскорт', 'Шторм'] },
        horror: { a: ['Чёрный', 'Мёртвый', 'Старый', 'Безмолвный', 'Проклятый', 'Гнилой'], n: ['Дом', 'Подвал', 'Шёпот', 'Туман', 'Обряд', 'Склеп', 'Гость'] },
        scifi: { a: ['Нулевой', 'Ледяной', 'Дальний', 'Квантовый', 'Седьмой', 'Пустотный'], n: ['Орбит', 'Горизонт', 'Код', 'Сектор', 'Сигнал', 'Предел', 'Марс'] },
        romance: { a: ['Последний', 'Нежный', 'Случайный', 'Долгий', 'Тёплый', 'Первый'], n: ['Вальс', 'Поцелуй', 'Билет', 'Маяк', 'Романс', 'Дождь', 'Вокзал'] },
    },
    CITIES: ['Силвер-Крик', 'Абилин', 'Тумстоун', 'Додж-Сити', 'Сан-Вера', 'Порто-Белло', 'Грайтон', 'Фэр-Оукс', 'Ривермут', 'Эльдорадо'],

    // Era drift: genre heat by decade (1950s start). Keys — decade start year.
    ERAS: {
        1950: { western: 10, comedy: 8, drama: 7, action: 6, horror: 5, scifi: 6, romance: 9 },
        1960: { western: 8, comedy: 9, drama: 8, action: 7, horror: 6, scifi: 7, romance: 8 },
        1970: { western: 5, comedy: 8, drama: 9, action: 9, horror: 8, scifi: 8, romance: 6 },
        1980: { western: 4, comedy: 9, drama: 7, action: 10, horror: 8, scifi: 10, romance: 7 },
        1990: { western: 5, comedy: 9, drama: 8, action: 9, horror: 7, scifi: 9, romance: 8 },
        2000: { western: 4, comedy: 10, drama: 7, action: 10, horror: 8, scifi: 9, romance: 8 },
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
                look: { skin: '#d9996b', hair: '#3a2a1a', shirt: '#4a6a8a', pants: '#3a3a44', shoes: '#2a1a0e', hat: '#6a4a2a', gender: 'm', hairStyle: 0, scale: 1.05 } },
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
