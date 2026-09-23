// MetaSystem.js — the meta-game (Phase Ж): the studio lives in a world that talks back.
// Weekly studio events (press, fire, festival, tax, grant…), the decades drifting genre
// fashion, sequels and franchises with recognition and fatigue, the scenario you play
// («Золотой Кадр за 10 лет», «Империя грёз», песочница) and the achievements that remember
// your studio's life. Everything is data + Rng: no DOM, no pc.*.
//
//   MetaSystem.weekly(state, mgr)          -> toasts[]   (StudioManager.tickWeek, guarded)
//   MetaSystem.canSequel(state, movie)     -> bool
//   MetaSystem.startSequel(state, movieId) -> { ok, script } | { ok:false, why }
//   MetaSystem.scenarioPicker(game)        -> HTML modal
//   MetaSystem.statsScreen(game)           -> HTML screen
//   MetaSystem.onAction(game, act, …)      -> meta:… verbs

/** @satisfies {Record<string, any>} */
const MetaSystem = {

    cfg() {
        const U = 'undefined';
        return {
            chance: typeof META_EVENT_CHANCE !== U ? META_EVENT_CHANCE : 0.18,
            sequelScore: typeof META_SEQUEL_MIN_SCORE !== U ? META_SEQUEL_MIN_SCORE : 6,
            sequelMax: typeof META_SEQUEL_MAX !== U ? META_SEQUEL_MAX : 3,
            freshPenalty: typeof META_SEQUEL_FRESH_PENALTY !== U ? META_SEQUEL_FRESH_PENALTY : 0.4,
            recognition: typeof META_SEQUEL_RECOGNITION !== U ? META_SEQUEL_RECOGNITION : 0.15,
            fatigue: typeof META_SEQUEL_FATIGUE !== U ? META_SEQUEL_FATIGUE : 0.12,
            kadrYears: typeof META_GOAL_KADR_YEARS !== U ? META_GOAL_KADR_YEARS : 10,
            empireGross: typeof META_GOAL_EMPIRE_GROSS !== U ? META_GOAL_EMPIRE_GROSS : 100000000,
        };
    },

    // --- scenarios -----------------------------------------------------------------------------------

    SCENARIOS: {
        kadr10: {
            ru: 'Золотой Кадр за 10 лет', emoji: '🏆',
            desc: 'Возьмите главную премию десятилетия в первые 10 лет студии. Не успеете — совет директоров продаёт лот.',
        },
        empire: {
            ru: 'Империя грёз', emoji: '👑',
            desc: 'Соберите $100 000 000 суммарных сборов. Медленно, дорого, великолепно.',
        },
        sandbox: {
            ru: 'Песочница', emoji: '🏖',
            desc: 'Никаких целей: студия, фильмы и зрители. Банкротство всё ещё настоящее.',
        },
    },

    /** Progress and completion of the studio's scenario. */
    scenario(state) {
        const c = this.cfg();
        const id = state.scenario || 'sandbox';
        const st = state.stats || {};
        const years = state.year - (state.foundedYear || state.year);
        if (id === 'kadr10') {
            const done = (st.awards || 0) >= 1;
            const failed = !done && years > c.kadrYears;
            return {
                id: id, ru: this.SCENARIOS[id].ru, done: done, failed: failed,
                progress: done ? 1 : Math.max(0, Math.min(1, years / c.kadrYears)),
                text: done ? 'Премия взята за ' + years + ' лет: совет директоров аплодирует.'
                    : failed ? 'Десять лет без главной премии: совет директоров продаёт лот.'
                        : 'Год ' + years + ' из ' + c.kadrYears + ', наград: ' + (st.awards || 0) + ' из 1',
            };
        }
        if (id === 'empire') {
            const gross = st.boxOffice || 0;
            return {
                id: id, ru: this.SCENARIOS[id].ru, done: gross >= c.empireGross, failed: false,
                progress: Math.max(0, Math.min(1, gross / c.empireGross)),
                text: 'Сборы ' + StudioUI_money(gross) + ' из ' + StudioUI_money(c.empireGross),
            };
        }
        return { id: id, ru: this.SCENARIOS[id].ru, done: false, failed: false, progress: 0, text: 'Целей нет: только кино и его последствия.' };
    },

    // --- achievements ----------------------------------------------------------------------------------

    ACHIEVEMENTS: [
        { id: 'first-script', ru: 'Первое слово', hint: 'Довести сценарий до готового', test: (s) => (s.scripts || []).length >= 1 || (s.released || []).length >= 1 },
        { id: 'first-premiere', ru: 'Мотор и премьера', hint: 'Выпустить первый фильм', test: (s) => (s.released || []).length >= 1 },
        { id: 'first-hit', ru: 'Хит сезона', hint: 'Фильм с оценкой критиков 7+', test: (s) => (s.released || []).some((m) => m.score >= 7) },
        { id: 'masterpiece', ru: 'Шедевр', hint: 'Фильм с оценкой 8.5+', test: (s) => (s.released || []).some((m) => m.score >= 8.5) },
        { id: 'laureate', ru: 'Лауреат', hint: 'Взять «Золотой Кадр»', test: (s) => (s.stats || {}).awards >= 1 },
        { id: 'five-films', ru: 'Фильмография', hint: 'Пять выпущенных фильмов', test: (s) => (s.released || []).length >= 5 },
        { id: 'ten-films', ru: 'Студия-конвейер', hint: 'Десять выпущенных фильмов', test: (s) => (s.released || []).length >= 10 },
        { id: 'beloved', ru: 'Народная любовь', hint: 'Фанбаза 50+', test: (s) => s.fans >= 50 },
        { id: 'idol', ru: 'Кумир поколения', hint: 'Фанбаза 100', test: (s) => s.fans >= 100 },
        { id: 'franchise', ru: 'Франшиза', hint: 'Выпустить сиквел', test: (s) => (s.released || []).some((m) => m.sequelOf) },
        { id: 'survivor', ru: 'Выживший', hint: 'Пережить скандал и остаться в плюсе', test: (s) => (s.scandals || []).length >= 1 && s.cash > 0 },
        { id: 'decade', ru: 'Декада', hint: 'Проработать 10 лет', test: (s) => s.year - (s.foundedYear || s.year) >= 10 },
        { id: 'profitable', ru: 'Продюсер года', hint: 'Один фильм с прибылью $1M+', test: (s) => (s.released || []).some((m) => (m.profit || 0) >= 1000000) },
    ],

    checkAchievements(state) {
        const out = [];
        state.achievements = state.achievements || [];
        for (const a of this.ACHIEVEMENTS) {
            if (state.achievements.indexOf(a.id) >= 0) continue;
            let ok = false;
            try { ok = !!a.test(state); } catch (e) { ok = false; }
            if (ok) { state.achievements.push(a.id); out.push(a); }
        }
        return out;
    },

    // --- weekly studio events ---------------------------------------------------------------------------

    EVENTS: [
        {
            id: 'viral', ru: 'Вирусный трейлер', w: 3,
            cond: (s) => (s.projects || []).some((p) => p.state === 'shooting' || p.state === 'post'),
            run(s, mgr, r) {
                s.fans = Math.min(100, s.fans + 3);
                return { toast: '📈 Черновой трейлер ушёл в народ: студия проснулась знаменитой (+3 поклонников).', kind: 'good' };
            },
        },
        {
            id: 'fire', ru: 'Пожар на складе реквизита', w: 2,
            cond: (s) => Object.keys(s.ownedSets || {}).length > 0,
            run(s, mgr, r) {
                const cost = 15000 + r.range(0, 4) * 5000;
                mgr.pay(cost, 'После пожара на складе');
                return { toast: '🔥 Пожар на складе реквизита: восстановление ' + StudioUI_money(cost) + '. Курить в декорациях — плохо.', kind: 'bad' };
            },
        },
        {
            id: 'festival', ru: 'Приглашение на фестиваль', w: 2,
            cond: (s) => (s.released || []).some((m) => m.score >= 6.5),
            run(s, mgr, r) {
                s.rep = Math.min(100, (s.rep || 20) + 5);
                mgr.earn(20000, 'Фестивальный показ');
                return { toast: '🎪 Фестиваль зовёт студию с ретроспективой: +репутация и $20 000 показа.', kind: 'good' };
            },
        },
        {
            id: 'tax', ru: 'Налоговая проверка', w: 2,
            cond: (s) => s.cash > 200000,
            run(s, mgr, r) {
                const cost = Math.round(s.cash * 0.03);
                mgr.pay(cost, 'Налоговая проверка');
                return { toast: '🧾 Налоговая нашла «творческую» бухгалтерию: доплата ' + StudioUI_money(cost) + '.', kind: 'bad' };
            },
        },
        {
            id: 'grant', ru: 'Грант на оборудование', w: 2,
            cond: (s) => (s.stats || {}).films >= 1,
            run(s, mgr, r) {
                mgr.earn(35000, 'Грант на оборудование');
                return { toast: '🎁 Фонд кино даёт грант на новые камеры: +$35 000.', kind: 'good' };
            },
        },
        {
            id: 'press', ru: 'Скандал в прессе', w: 2,
            cond: (s) => (s.scandals || []).length > 0 || s.rep < 30,
            run(s, mgr, r) {
                s.fans = Math.max(0, s.fans - 2);
                s.rep = Math.max(0, (s.rep || 20) - 3);
                return { toast: '🗞 Таблоиды раздувают старый скандал: −2 поклонников, −репутация.', kind: 'bad' };
            },
        },
        {
            id: 'strike', ru: 'Забастовка машинистов сцены', w: 2,
            cond: (s) => (s.projects || []).some((p) => p.state === 'shooting'),
            run(s, mgr, r) {
                const pr = (s.projects || []).find((p) => p.state === 'shooting');
                if (pr) pr.delay += 1;
                mgr.pay(8000, 'Мировая со забастовкой');
                return { toast: '🛠 Машинисты сцены бастуют: неделя простоя на «' + (pr ? pr.title : 'площадке') + '», мировая $8 000.', kind: 'bad' };
            },
        },
        {
            id: 'legend', ru: 'Ветеран заходит на огонёк', w: 1,
            cond: (s) => (s.roster || []).length > 0,
            run(s, mgr, r) {
                const p = r.pick(s.roster);
                p.exp = (p.exp || 0) + 15;
                p.star = PeopleSystem.starOf(p);
                p.mood = Math.min(100, p.mood + 10);
                return { toast: '🌟 Легenda немого кино даёт мастер-класс труппе: ' + p.name + ' растёт в звёздности.', kind: 'good' };
            },
        },
    ],

    weekly(state, mgr) {
        const c = this.cfg();
        const out = [];
        const r = Rng.create(((state.seed ^ Math.imul(state.weekIdx + 11, 2654435761)) >>> 0) || 1);

        // The decade drifts: on a new decade, announce what the world now loves.
        const decade = Math.floor(state.year / 10) * 10;
        if (state.lastDecade == null) state.lastDecade = decade;
        if (decade !== state.lastDecade) {
            state.lastDecade = decade;
            const heats = Object.keys(MovieData.GENRES)
                .map((g) => ({ g: g, h: MovieData.heat(g, state.year) }))
                .sort((a, b) => b.h - a.h);
            out.push(' Наступают ' + decade + '-е: мода любит ' +
                heats.slice(0, 3).map((x) => (MovieData.GENRES[x.g] || {}).ru).join(', ').toLowerCase() +
                '; остывает ' + (MovieData.GENRES[heats[heats.length - 1].g] || {}).ru.toLowerCase() + '.');
            mgr.pushNews(decade + '-е: зритель хочет ' +
                heats.slice(0, 3).map((x) => (MovieData.GENRES[x.g] || {}).ru).join(', ').toLowerCase() + '.', '');
        }

        // A studio-wide event.
        if (r.chance(c.chance)) {
            const pool = this.EVENTS.filter((e) => !e.cond || e.cond(state));
            if (pool.length) {
                const ev = r.weighted(pool, pool.map((e) => e.w));
                const res = ev.run(state, mgr, r);
                if (res) {
                    out.push(res.toast);
                    mgr.pushNews(ev.ru + ': ' + res.toast.replace(/^[^\s]+\s/, ''), res.kind);
                    state.events = state.events || [];
                    state.events.unshift({ week: state.weekIdx, year: state.year, id: ev.id, ru: ev.ru });
                    if (state.events.length > 40) state.events.length = 40;
                }
            }
        }

        // Achievements and the scenario verdict.
        for (const a of this.checkAchievements(state)) {
            out.push('🎖 Достижение: «' + a.ru + '» — ' + a.hint + '.');
            mgr.pushNews('Студия получает достижение «' + a.ru + '».', 'good');
        }
        const sc = this.scenario(state);
        if (sc.done && !state.scenarioDone) {
            state.scenarioDone = true;
            out.push('🏁 Сценарий «' + sc.ru + '» выполнен: ' + sc.text);
            mgr.pushNews('Сценарий «' + sc.ru + '» завершён победой.', 'good');
        }
        if (sc.failed && !state.scenarioFailed) {
            state.scenarioFailed = true;
            out.push('💀 Сценарий «' + sc.ru + '» провален: ' + sc.text);
            mgr.pushNews('Сценарий «' + sc.ru + '» провален.', 'bad');
        }
        return out;
    },

    // --- sequels and franchises ---------------------------------------------------------------------------

    sequelNumber(state, movie) {
        let n = 1, m = movie;
        const byId = {};
        for (const x of state.released || []) byId[x.id] = x;
        while (m && m.sequelOf && byId[m.sequelOf]) { n++; m = byId[m.sequelOf]; }
        return n;
    },

    canSequel(state, movie) {
        const c = this.cfg();
        if (!movie || movie.state !== 'done') return false;
        if ((movie.score || 0) < c.sequelScore) return false;
        if (this.sequelNumber(state, movie) > c.sequelMax) return false;
        // One franchise entry in the works at a time.
        for (const sc of state.scripts || []) {
            if (sc.sequelOf && this._rootOf(state, sc.sequelOf) === this._rootOf(state, movie.id)) return false;
        }
        for (const pr of state.projects || []) {
            const sc = (state.scripts || []).find((x) => x.id === pr.scriptId);
            if (sc && sc.sequelOf && this._rootOf(state, sc.sequelOf) === this._rootOf(state, movie.id)) return false;
        }
        return true;
    },

    _rootOf(state, id) {
        const byId = {};
        for (const x of state.released || []) byId[x.id] = x;
        for (const x of state.scripts || []) byId[x.id] = x;
        let cur = byId[id], guard = 0;
        while (cur && cur.sequelOf && byId[cur.sequelOf] && guard++ < 8) cur = byId[cur.sequelOf];
        return cur ? (cur.id || id) : id;
    },

    /** Draft the next franchise entry: numbered title, recognition bonus, freshness penalty. */
    startSequel(state, movieId) {
        const c = this.cfg();
        const movie = (state.released || []).find((m) => m.id === movieId);
        if (!movie) return { ok: false, why: 'Фильм не найден.' };
        if (!this.canSequel(state, movie)) return { ok: false, why: 'Этот фильм не тянет сиквел (оценка, номер или франшиза уже в работе).' };
        const number = this.sequelNumber(state, movie) + 1;
        const script = ScriptGenerator.draft(state, {
            genre: movie.genre,
            budget: Math.max(typeof MOVIE_BUDGET_MIN !== 'undefined' ? MOVIE_BUDGET_MIN : 100000, movie.budget),
            seed: (Rng.hash(movie.id + 'sequel' + number) >>> 0) || 1,
            writer: null,
            sequelOf: { id: movie.id, title: movie.title },
            penalty: c.freshPenalty * (number - 1),
        });
        script.franchise = {
            root: this._rootOf(state, movie.id),
            number: number,
            recognition: movie.audience || 50,
        };
        state.scripts.push(script);
        return { ok: true, script: script, number: number };
    },

    /** The opening multiplier of a franchise entry: recognition sells, fatigue kills. */
    franchiseMultiplier(script) {
        const c = this.cfg();
        const f = script && script.franchise;
        if (!f || f.number <= 1) return 1;
        return Math.max(0.4, (1 + (f.recognition / 100) * c.recognition) * (1 - c.fatigue * (f.number - 1)));
    },

    // --- the screens -------------------------------------------------------------------------------------------

    esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

    scenarioPicker(game) {
        let h = '<div class="modal"><h2>Новая студия</h2><p class="lead">Каким сценарием играем?</p>';
        for (const id of Object.keys(this.SCENARIOS)) {
            const sc = this.SCENARIOS[id];
            h += '<div class="card" data-act="meta:scenario:' + id + '" style="cursor:pointer">' +
                '<div class="row tight"><span style="font-size:20px">' + sc.emoji + '</span><b>' + this.esc(sc.ru) + '</b></div>' +
                '<div class="meta">' + this.esc(sc.desc) + '</div></div>';
        }
        h += '<div class="btns"><span class="btn" data-act="close">Отмена</span></div></div>';
        return h;
    },

    statsScreen(game) {
        const s = StudioManager.state;
        const st = s.stats || /** @type {any} */ ({});
        const sc = this.scenario(s);
        const decade = Math.floor(s.year / 10) * 10;
        const heats = Object.keys(MovieData.GENRES)
            .map((g) => ({ g: g, h: MovieData.heat(g, s.year) }))
            .sort((a, b) => b.h - a.h);
        let h = '<div class="sc"><h1 class="title">ХРОНИКА СТУДИИ<span class="sub">«' + this.esc(s.studioName) + '» · ' +
            (s.year - (s.foundedYear || s.year)) + ' лет в деле</span></h1>';
        h += '<div class="panel" style="padding:12px"><div class="row tight">' +
            '<span class="tag gold big">' + sc.emoji + ' ' + this.esc(sc.ru) + '</span>' +
            (sc.done ? '<span class="tag green">выполнен</span>' : sc.failed ? '<span class="tag red">провален</span>' : '<span class="tag">в процессе</span>') +
            '<span class="sp"></span><span class="hint">' + this.esc(sc.text) + '</span></div>' +
            '<div class="meta" style="margin-top:6px"><span class="bar green" style="display:inline-block;width:220px;vertical-align:middle">' +
            '<i style="width:' + Math.round(Math.max(0, Math.min(1, sc.progress)) * 100) + '%"></i></span></div></div>';
        h += '<div class="cols"><div class="col"><div class="h2">📊 Цифры жизни</div>' +
            '<div class="meta">Фильмов выпущено: <b>' + (st.films || 0) + '</b> · суммарные сборы: <b>' + StudioUI_money(st.boxOffice || 0) + '</b></div>' +
            '<div class="meta">Лучшая оценка: <b>' + (st.bestScore ? st.bestScore.toFixed(1) : '—') + '</b> · наград: <b>' + (st.awards || 0) + '</b> · недель в деле: <b>' + (st.weeks || 0) + '</b></div>' +
            '<div class="meta">Касса сейчас: <b>' + StudioUI_money(s.cash) + '</b> · фанбаза: <b>' + Math.round(s.fans) + '</b> · репутация: <b>' + Math.round(s.rep || 20) + '</b></div>' +
            '<div class="meta">Скандалов пережито: <b>' + (s.scandals || []).length + '</b> · событий студии: <b>' + (s.events || []).length + '</b></div>' +
            '<div class="h2">🕰 Эпоха: ' + decade + '-е</div>' +
            '<div class="meta">' + heats.map((x) => '<span class="tag' + (x.h >= 8 ? ' green' : x.h <= 5 ? ' red' : '') + '">' +
                this.esc((MovieData.GENRES[x.g] || {}).ru) + ' ' + x.h.toFixed(1) + '</span>').join(' ') + '</div>' +
            '<div class="meta hint">Мода жанров дрейфует по десятилетиям: сценарий, написанный против моды, продаётся хуже.</div>' +
            '</div><div class="col"><div class="h2">🎖 Достижения (' + (s.achievements || []).length + '/' + this.ACHIEVEMENTS.length + ')</div>';
        for (const a of this.ACHIEVEMENTS) {
            const got = (s.achievements || []).indexOf(a.id) >= 0;
            h += '<div class="row tight" style="padding:3px 0">' +
                '<span style="width:22px">' + (got ? '' : '·') + '</span>' +
                '<b style="' + (got ? '' : 'opacity:.5') + '">' + this.esc(a.ru) + '</b>' +
                '<span class="hint">' + this.esc(a.hint) + '</span></div>';
        }
        h += '<div class="h2">🗞 Последние события</div>';
        for (const e of (s.events || []).slice(0, 8)) {
            h += '<div class="news">' + e.year + ' · ' + this.esc(e.ru) + '</div>';
        }
        if (!(s.events || []).length) h += '<p class="hint">Мир пока молчит.</p>';
        h += '</div></div>';
        h += '<div class="row" style="margin-top:12px"><span class="btn" data-act="nav:more">← Ещё</span>' +
            '<span class="btn" data-act="nav:studio">На студию</span></div></div>';
        return h;
    },

    // --- the dispatcher -------------------------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        const S = StudioManager, s = S.state;
        const parts = String(act).split(':');
        if (parts[0] !== 'meta') return false;
        if (parts[1] === 'stats') { game.showScreen('stats'); return true; }
        if (parts[1] === 'scenario') {
            const id = this.SCENARIOS[parts[2]] ? parts[2] : 'sandbox';
            S.newGame(s && s.studioName ? s.studioName : 'Фабрика Грёз', id);
            game.started = true;
            game._setHud(true);
            game.closeModal();
            game.showScreen('studio');
            game.toast('🎬 Сценарий «' + this.SCENARIOS[id].ru + '»: ' + this.SCENARIOS[id].desc);
            return true;
        }
        return true;
    },
};
