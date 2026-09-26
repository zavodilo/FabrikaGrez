// StudioUI.js — the management screens of «Фабрика Грёз»: HTML content for the 'screen' UI
// elements (screenMain / screenModal) and the data-act click dispatcher. Screens are pure
// functions of the state — no DOM is kept between renders; every action re-renders.
// Interactive nodes carry data-act="name"; UIElement delegates clicks/changes to onAction.

/** @satisfies {Record<string, any>} */
const StudioUI = {

    money(n) { return StudioUI_money(n); },

    dateLong(s) {
        if (!s) return '';
        const m = StudioManager.MONTHS[Math.floor((s.week - 1) * 12 / 52)];
        return m + ' ' + s.year + ' · неделя ' + s.week;
    },

    stars(p) {
        const n = p.star || 0;
        return '<span class="stars">' + '★'.repeat(n) + '<span class="dim">' + '☆'.repeat(5 - n) + '</span></span>';
    },

    bar(v, cls) {
        const w = Math.max(0, Math.min(100, Math.round(v * 10)));
        return '<span class="bar ' + (cls || '') + '" style="display:inline-block;width:74px;vertical-align:middle"><i style="width:' + w + '%"></i></span>';
    },

    esc(str) {
        return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /** The active graphics preset (0..3) — from CinePost3D when it is up, else the default. */
    gfxQuality() {
        if (typeof CinePost3D !== 'undefined' && CinePost3D.quality >= 0) return CinePost3D.quality;
        return typeof GFX_QUALITY_DEFAULT !== 'undefined' ? Math.max(0, Math.min(3, GFX_QUALITY_DEFAULT)) : 2;
    },

    gfxName() {
        return ['Низкое', 'Среднее', 'Высокое', 'Ультра'][this.gfxQuality()] || 'Среднее';
    },

    /**
     * A poster is the film's own palette: the leads' costumes and hair light the card, so no two
     * pictures in the filmography share a face. Pure inline CSS — the card stays a card.
     */
    posterStyle(m) {
        const cast = (m && m.timeline && m.timeline.cast) || [];
        const leads = cast.filter((c) => /^a/.test(c.id)).slice(0, 3);
        const look = (i) => (leads[i] && leads[i].look) || {};
        const c1 = look(0).shirt || '#3a4458';
        const c2 = look(1).shirt || '#58443a';
        const c3 = look(2).shirt || '#2e3a34';
        const hair = look(0).hair || '#1a120c';
        return 'style="background:' +
            'radial-gradient(120% 80% at 50% 0%, #ffffff26 0%, transparent 55%),' +
            'radial-gradient(90% 70% at 18% 100%, ' + c1 + 'cc 0%, transparent 62%),' +
            'radial-gradient(90% 70% at 82% 100%, ' + c2 + 'bb 0%, transparent 62%),' +
            'radial-gradient(60% 40% at 50% 78%, ' + c3 + '99 0%, transparent 70%),' +
            'linear-gradient(180deg, ' + hair + ' 0%, #0b0e15 72%)"';
    },

    avatar(p, size) {
        const L = p.look || {};
        const s = size || 46;
        // Модельные актёры каталога ActorModels показываются своей палитрой
        // (цвета их GLB) и бейджем типажа — аватар совпадает с тем, что в кадре.
        const rec = (L.model && typeof ActorModels !== 'undefined') ? ActorModels.get(L.model) : null;
        const skin = (rec && rec.palette.skin) || L.skin || '#d9996b';
        const hairC = (rec && rec.palette.hair) || L.hair || '#3a2a1a';
        const shirt = (rec && rec.palette.shirt) || L.shirt || '#3d639b';
        const hairH = L.hairStyle === 3 ? 0 : Math.round(s * 0.22);
        return '<span style="position:relative;display:inline-block;width:' + s + 'px;height:' + s + 'px;border-radius:10px;overflow:hidden;background:#0e1320;flex:none;border:1px solid #2a3446">' +
            (L.hat ? '<span style="position:absolute;left:8%;top:6%;width:84%;height:16%;background:' + L.hat + ';border-radius:3px"></span>' : '') +
            '<span style="position:absolute;left:22%;top:' + (L.hat ? 16 : 12) + '%;width:56%;height:40%;border-radius:40%;background:' + skin + '"></span>' +
            (hairH ? '<span style="position:absolute;left:20%;top:' + (L.hat ? 14 : 9) + '%;width:60%;height:' + (hairH + 8) + '%;border-radius:40% 40% 0 0;background:' + hairC + '"></span>' : '') +
            '<span style="position:absolute;left:14%;top:56%;width:72%;height:52%;border-radius:34% 34% 0 0;background:' + shirt + '"></span>' +
            (rec && rec.badge ? '<span style="position:absolute;right:1px;bottom:0;font-size:' + Math.round(s * 0.4) + 'px;line-height:1.1">' + rec.badge + '</span>' : '') +
            '</span>';
    },

    skillRow(p) {
        const S = PeopleSystem;
        let h = '';
        for (const k of S.SKILLS) {
            h += '<span class="hint" style="display:inline-block;width:74px">' + S.SKILL_RU[k] + '</span> ' +
                this.bar(p.skills[k] / 10, p.skills[k] >= 7 ? 'green' : '') +
                '<b style="margin-left:6px">' + p.skills[k] + '</b> &nbsp;';
        }
        return h;
    },

    // --- the main menu -----------------------------------------------------------------------

    menu(game) {
        const hasSave = typeof SaveSystem !== 'undefined' && SaveSystem.hasAny && SaveSystem.hasAny();
        return '<div class="menu-wrap">' +
            '<div class="menu-logo">ФАБРИКА ГРЁЗ</div>' +
            '<div class="menu-sub">симулятор киностудии · 3D-просмотр ваших фильмов</div>' +
            '<div class="menu-btns">' +
            '<span class="btn gold big" data-act="new">🎬 Новая игра</span>' +
            '<span class="btn big' + (hasSave ? '' : ' off') + '" data-act="continue">▶ Продолжить</span>' +
            '<span class="btn big" data-act="demo">🤠 Демо-сцена: «Полдень в Силвер-Крик»</span>' +
            '<span class="btn big" data-act="help">❔ Как играть</span>' +
            '</div>' +
            '<div class="menu-foot">Сделано на PlayArcEngine (PlayCanvas 2) · zavodilo · ' + (typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '') + '</div>' +
            '</div>';
    },

    help(game) {
        return '<div class="sc"><h1 class="title">Как играть<span class="sub">краткий курс mogul-магии</span></h1>' +
            '<div class="cols">' +
            '<div class="col panel"><div class="h3">🎥 Цикл студии</div>' +
            '<p>Каждая кнопка «Следующая неделя» двигает время: зарплаты списываются, съёмки идут, фильмы выходят в прокат. Следите за кассой — долги глубже −$500 000 означают банкротство.</p>' +
            '<div class="h3">🎞 Производство</div>' +
            '<p>«Снять фильм»: жанр и бюджет → сценарист пишет сценарий → кастинг ролей → съёмки неделями → монтаж, музыка, маркетинг → прокат, рецензии и награды.</p>' +
            '<div class="h3">🍿 Главная магия</div>' +
            '<p>Любой снятый фильм можно ПОСМОТРЕТЬ в 3D: камеры, актёры, субтитры, музыка — всё настоящее, сгенерированное из вашего сценария и каста. Дневники съёмок доступны прямо во время производства.</p></div>' +
            '<div class="col panel"><div class="h3">👥 Люди</div>' +
            '<p>Актёры несут жанр навыком (драма/комедия/экшн/романтика), звёздность ★ тянет кассу, настроение — качество дублей. Биржа талантов обновляется; обучение растит навыки за деньги и недели.</p>' +
            '<div class="h3">🏗 Декорации</div>' +
            '<p>Каждый жанр снимается в своих декорациях (вестерн-улица, космический корабль, особняк…). Построенная декорация поднимает качество сцен и остаётся у студии навсегда.</p>' +
            '<div class="h3">⌨ Горячие клавиши</div>' +
            '<p>Пробел — пауза в кино, Esc — выйти из просмотра/закрыть экран. Колесо — зум студии, WASD — полёт камеры, ПКМ — осмотреться.</p>' +
            '<p>Горячие клавиши студии: <b>1</b> Студия, <b>2</b> Люди, <b>3</b> Снять фильм, <b>4</b> Кинотеатр, <b>5</b> Ещё, <b>W</b> — следующая неделя (когда экраны закрыты).</p></div>' +
            '</div>' +
            '<div class="row" style="margin-top:16px"><span class="btn" data-act="back">← Назад</span></div></div>';
    },

    // --- the studio screen ---------------------------------------------------------------------

    studio(game) {
        const s = StudioManager.state;
        const M = MovieData;
        let sets = '';
        for (const id of Object.keys(M.SET_INFO)) {
            const info = M.SET_INFO[id];
            const owned = s.ownedSets[id];
            // A set is an ASSET: once built it can be rebuilt to a higher level, which lifts the
            // quality of every scene shot in it (ProductionSystem.upgradeSet).
            const upCost = owned && typeof ProductionSystem !== 'undefined' ? ProductionSystem.upgradeCost(s, id) : null;
            sets += '<div class="card' + (owned ? '' : '') + '" style="cursor:default">' +
                '<div class="row"><b>' + info.ru + '</b><span class="sp"></span>' +
                (owned ? '<span class="tag green">построена · ур. ' + owned.level + '</span>' +
                    (upCost != null ? '<span class="btn small' + (StudioManager.canAfford(upCost) ? '' : ' off') + '" data-act="prod:upgrade:' + id + '" title="Перестроить: сцены в этой декорации станут качественнее">🏗 ' + this.money(upCost) + '</span>' : '<span class="hint">макс.</span>')
                    : '<span class="btn gold small" data-act="set:buy:' + id + '"' + (StudioManager.canAfford(info.cost) ? '' : ' style="opacity:.45"') + '>Построить · ' + this.money(info.cost) + '</span>') +
                '</div>' +
                '<div class="meta">Жанры: ' + info.genres.map((g) => M.GENRES[g].ru).join(', ') + (info.indoor ? ' · павильон' : ' · открытая') + '</div></div>';
        }
        let news = '';
        for (const n of (s.news || []).slice(0, 12)) {
            news += '<div class="news ' + n.kind + '">' + n.text + ' <span class="hint">' + n.year + '</span></div>';
        }
        const proj = (typeof ProductionSystem !== 'undefined' && s.projects.length)
            ? ProductionSystem.briefList(s) : '<p class="hint">Нет активных производств. Нажмите «🎥 Снять фильм».</p>';
        return '<div class="sc"><h1 class="title">СТУДИЯ «' + this.esc(s.studioName).toUpperCase() + '»<span class="sub">' + this.dateLong(s) + '</span></h1>' +
            '<div class="row" style="margin:10px 0">' +
            '<span class="tag gold big">' + this.money(s.cash) + '</span>' +
            '<span class="tag">♥ поклонники ' + Math.round(s.fans) + '/100</span>' +
            '<span class="tag">репутация ' + Math.round(s.rep) + '</span>' +
            '<span class="tag">фильмов: ' + s.stats.films + '</span>' +
            '<span class="tag">касса всего: ' + this.money(s.stats.boxOffice) + '</span>' +
            '</div>' +
            '<div class="cols">' +
            '<div class="col"><div class="h2">🎬 В производстве</div>' + proj +
            '<div class="h2">📰 Хроника студии</div>' + (news || '<p class="hint">Пока тихо…</p>') + '</div>' +
            '<div class="col"><div class="h2">🏗 Декорации</div>' + sets + '</div>' +
            '</div>' +
            '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span><span class="sp"></span>' +
            '<span class="btn gold" data-act="newmovie">🎥 Снять фильм</span></div></div>';
    },

    // --- people ----------------------------------------------------------------------------------

    personCard(p, mode) {
        const S = PeopleSystem;
        const course = p.training ? S.courseInfo(p.training.skill) : null;
        const busy = p.training ? '<span class="tag blue">учёба: ' + this.esc(course.ru) + ', ещё ' + p.training.weeksLeft + ' нед.</span>' : '';
        const contract = p.contract ? '<span class="tag' + (p.contract.weeksLeft <= 8 ? ' red' : '') + '">контракт ' + p.contract.weeksLeft + ' нед.</span>' : '';
        const demand = p.demand ? '<span class="tag gold">ждёт продления: +' + this.money(p.demand.raise) + '/нед (' + p.demand.weeksLeft + ' нед.)</span>' : '';
        const offer = p.offer ? '<span class="tag red">манят конкуренты: ' + this.money(p.offer.salary) + '/нед</span>' : '';
        let btns = '';
        if (mode === 'market') {
            const term = S.makeContract(p).term;
            btns = '<span class="btn gold small" data-act="p:hire:' + p.id + '">Нанять · ' + StudioUI.money(p.salary) + '/нед</span>' +
                '<div class="hint" style="margin-top:4px;text-align:right">контракт на ' + term + ' нед.</div>';
        }
        if (mode === 'roster') {
            btns = '<span class="btn red small" data-act="p:fire:' + p.id + '">Уволить</span>';
            if (p.demand) btns += ' <span class="btn gold small" data-act="p:renew:' + p.id + '">📝 Продлить</span> <span class="btn small" data-act="p:letgo:' + p.id + '">Отказать</span>';
            if (p.offer) btns += ' <span class="btn gold small" data-act="p:counter:' + p.id + '">💰 Перебить</span>';
            if (!p.training) {
                for (const k of S.SKILLS) {
                    if ((p.skills[k] || 0) < 10) btns += ' <span class="btn small" data-act="p:train:' + p.id + ':' + k + '" title="Курс: ' + this.money(S.courseInfo(k).cost) + ', ' + S.courseInfo(k).weeks + ' нед.">🎓 ' + S.SKILL_RU[k] + '</span>';
                }
                if (p.charm < 10) btns += ' <span class="btn small" data-act="p:train:' + p.id + ':charm" title="Курс: ' + this.money(S.courseInfo('charm').cost) + ', 2 нед.">✨ Обаяние</span>';
                btns += ' <span class="btn small" data-act="p:train:' + p.id + ':media" title="Курс: ' + this.money(S.courseInfo('media').cost) + ', 1 нед., +опыт к звёздности">📰 Медиа</span>';
            }
        }
        const bonds = S.bondsOf(StudioManager.state, p).slice(0, 3);
        const bondsHtml = bonds.length ? '<div class="meta">' + bonds.map((b) =>
            '<span title="' + this.esc(b.person.name) + '">' + (S.REL_EMOJI[b.kind] || '·') + ' ' + this.esc(b.person.first) +
            ' ' + (b.value > 0 ? '+' : '') + b.value + '</span>').join(' · ') + '</div>' : '';
        return '<div class="card" style="cursor:default"><div class="row" style="align-items:flex-start">' +
            this.avatar(p, 52) +
            '<div style="flex:1;min-width:200px"><div class="row tight"><span class="name">' + this.esc(p.name) + '</span>' + this.stars(p) +
            '<span class="tag">' + S.ROLE_RU[p.role] + '</span><span class="tag">' + p.age + ' лет</span>' +
            '<span class="tag ' + (p.mood >= 60 ? 'green' : p.mood >= 35 ? '' : 'red') + '">' + S.moodWord(p.mood) + '</span>' +
            contract + demand + offer + busy + '</div>' +
            '<div class="meta" style="margin-top:4px">' + this.skillRow(p) + '</div>' +
            '<div class="meta">Обаяние ' + p.charm + '/10 · Надёжность ' + p.reliability + '/10 · Лояльность ' + this.bar((p.loyalty || 50) / 100, (p.loyalty || 50) >= 60 ? 'green' : '') + ' ' + Math.round(p.loyalty || 50) +
            ' · Зарплата ' + StudioUI.money(p.salary) + '/нед' +
            (p.films ? ' · Фильмов: ' + p.films : '') + (p.quirks.length ? ' · ' + p.quirks.join(', ') : '') + '</div>' +
            bondsHtml + '</div>' +
            '<div class="row tight" style="align-self:center;max-width:340px;justify-content:flex-end">' + btns + '</div></div></div>';
    },

    people(game) {
        const s = StudioManager.state;
        const ui = game.uiState;
        const tab = ui.peopleTab || 'roster';
        const S = PeopleSystem;
        const scandalN = (s.scandals || []).length;
        const tabs = [['roster', 'Актёры (' + s.roster.length + ')'], ['staff', 'Команда (' + s.staff.length + ')'],
        ['market', 'Биржа талантов'], ['bonds', 'Отношения' + (scandalN ? ' (' + scandalN + '⚔)' : '')]];
        let h = '<div class="sc"><h1 class="title">ЛЮДИ<span class="sub">труппа, команда, биржа и то, что между ними</span></h1><div class="tabs">';
        for (const t of tabs) h += '<span class="tab' + (tab === t[0] ? ' on' : '') + '" data-act="tab:people:' + t[0] + '">' + t[1] + '</span>';
        h += '</div>';
        if (tab === 'roster') {
            h += s.roster.length ? '' : '<p class="hint">В труппе пусто. Загляните на биржу талантов.</p>';
            for (const p of s.roster) h += this.personCard(p, 'roster');
        } else if (tab === 'staff') {
            h += s.staff.length ? '' : '<p class="hint">Без сценариста и режиссёра фильм не снять.</p>';
            for (const p of s.staff) h += this.personCard(p, 'roster');
        } else if (tab === 'bonds') {
            h += '<div class="cols"><div class="col"><div class="h2">💞 Дружба, романы и соперничество</div>';
            const seen = {};
            let any = false;
            for (const p of S.books(s)) {
                for (const b of S.bondsOf(s, p)) {
                    const key = [p.id, b.person.id].sort().join('-');
                    if (seen[key]) continue;
                    seen[key] = 1; any = true;
                    h += '<div class="card" style="cursor:default"><div class="row tight">' +
                        '<span style="font-size:18px">' + (S.REL_EMOJI[b.kind] || '·') + '</span>' +
                        '<b>' + this.esc(p.name) + '</b><span class="hint">и</span><b>' + this.esc(b.person.name) + '</b>' +
                        '<span class="tag">' + (S.REL_RU[b.kind] || 'связь') + '</span><span class="sp"></span>' +
                        '<span class="tag ' + (b.value > 0 ? 'green' : 'red') + '">' + (b.value > 0 ? '+' : '') + b.value + '</span></div>' +
                        '<div class="meta hint">' + (b.kind === 'rival' ? 'На одной площадке эта пара взрывоопасна: скандал бьёт по фанатам, репутации и качеству дублей.'
                            : b.kind === 'romance' ? 'Роман на площадке — это хорошая пресса и химия в кадре.'
                                : 'Друзья держат настроение группы и химию в кадре.') + '</div></div>';
                }
            }
            if (!any) h += '<p class="hint">Заметных связей пока нет: они рождаются на общих съёмках — от обаяния и надёжности пары зависит, дружбой или соперничеством.</p>';
            h += '</div><div class="col"><div class="h2">⚔ Хроника скандалов</div>';
            if ((s.scandals || []).length) {
                for (const sc of s.scandals.slice(0, 12)) {
                    h += '<div class="news bad">' + sc.year + ' · ' + this.esc(sc.a) + ' против ' + this.esc(sc.b) + ' на «' + this.esc(sc.project) + '»</div>';
                }
            } else h += '<p class="hint">Тишина в гримёрках. Подозрительно тихо.</p>';
            h += '<div class="h2">🎓 Школа мастерства</div>' +
                '<div class="meta">Курсы: ' + S.SKILLS.map((k) => S.SKILL_RU[k] + ' — ' + this.money(S.courseInfo(k).cost) + '/' + S.courseInfo(k).weeks + ' нед.').join(', ') +
                '; ✨ Обаяние — ' + this.money(S.courseInfo('charm').cost) + '/2 нед.; 📰 Медиа-тренинг — ' + this.money(S.courseInfo('media').cost) + '/1 нед. (опыт к звёздности).</div>' +
                '<div class="meta hint" style="margin-top:6px">Контракты: год у рабочих лошадок и полгода у звёзд. Не ответить на требование продления за ' +
                S.cfg().grace + ' нед. — значит потерять человека и немного репутации.</div>' +
                '</div></div>';
        } else {
            h += '<p class="hint">Обновление через ' + Math.max(0, s.marketIn) + ' нед. Кандидат подписывает контракт на свою запрашиваемую зарплату. На бирже ' + s.market.length + ' претендентов.</p>';
            // Биржа большая (PEOPLE_MARKET_SIZE): первая страница + экспандер,
            // иначе 90 карточек — стена текста.
            const page = typeof PEOPLE_MARKET_PAGE !== 'undefined' ? PEOPLE_MARKET_PAGE : 24;
            const full = !!(ui && ui.marketMore);
            const shown = full ? s.market : s.market.slice(0, page);
            for (const p of shown) h += this.personCard(p, 'market');
            if (s.market.length > page) {
                h += '<div class="row" style="margin-top:8px"><span class="btn" data-act="p:more">' +
                    (full ? '▲ Свернуть список' : '▼ Показать ещё ' + (s.market.length - shown.length) + ', всего ' + s.market.length) +
                    '</span></div>';
            }
        }
        h += '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span></div></div>';
        return h;
    },

    // --- films & cinema ---------------------------------------------------------------------------

    films(game) {
        const s = StudioManager.state;
        let prod = '';
        if (s.projects.length && typeof ProductionSystem !== 'undefined') prod = ProductionSystem.filmsScreen(s);
        else prod = '<p class="hint">Производств нет. Соберите каст по готовому сценарию — и фильм можно будет посмотреть.</p>';

        // Orders still on the writers' desks.
        let orders = '';
        for (const o of s.orders || []) {
            const wn = (s.staff || []).find((p) => p.id === o.writerId);
            orders += '<div class="card" style="cursor:default"><div class="row"><b>«' +
                this.esc(o.title || 'без названия') + '»</b><span class="tag">' +
                ((MovieData.GENRES[o.genre] || {}).ru || '') + '</span><span class="sp"></span>' +
                '<span class="tag blue">пишется, ещё ' + o.weeksLeft + ' нед.</span></div>' +
                '<div class="meta">' + this.money(o.budget) + ' · ' + (wn ? this.esc(wn.name) : 'без автора') + '</div></div>';
        }

        // Ready scripts, each one card.
        let scripts = '';
        for (const sc of s.scripts) {
            const casted = !!(sc.cast && typeof CastingSystem !== 'undefined' && CastingSystem.isComplete(s, sc));
            const G = MovieData.GENRES[sc.genre] || {};
            scripts += '<div class="card" style="cursor:default"><div class="row" style="align-items:flex-start">' +
                '<div class="poster ' + sc.genre + '"><div class="p-emoji">' + (G.emoji || '🎬') + '</div>' +
                '<div class="p-title">' + this.esc(sc.title) + '</div></div>' +
                '<div style="flex:1;min-width:200px"><div class="row tight"><b>«' + this.esc(sc.title) + '»</b>' +
                '<span class="tag">' + (G.ru || '') + '</span><span class="tag">' + sc.year + '</span>' +
                '<span class="tag gold">качество ' + sc.quality.toFixed(1) + '</span>' +
                (casted ? '<span class="tag green">каст собран</span>' : '<span class="tag">кастинг не пройден</span>') +
                (sc.sequelOf ? '<span class="tag blue">сиквел</span>' : '') + '</div>' +
                '<div class="meta">' + this.esc(sc.logline) + '</div>' +
                '<div class="meta">Автор: ' + this.esc(sc.writerName || '—') + ' · сцен: ' + sc.scenes.length +
                ' · бюджет ' + this.money(sc.budget) + (casted && sc.projected != null ? ' · прогноз ' + sc.projected.toFixed(1) + '/10' : '') + '</div>' +
                '<div class="row tight" style="margin-top:6px">' +
                '<span class="btn small" data-act="script:open:' + sc.id + '">📖 Читать</span>' +
                '<span class="btn gold small" data-act="cast:open:' + sc.id + '">🎭 ' + (casted ? 'Каст' : 'К кастингу') + '</span>' +
                (sc.timeline ? '<span class="btn small" data-act="script:watch:' + sc.id + '">▶ Смотреть</span>'
                    : '<span class="btn small" data-act="script:preview:' + sc.id + '">🎞 Черновик</span>') +
                (typeof ProductionSystem !== 'undefined' && casted
                    ? '<span class="btn small" data-act="prod:start:' + sc.id + '">🎬 В производство</span>' : '') +
                '<span class="sp"></span><span class="btn small red" data-act="script:drop:' + sc.id + '">В корзину</span>' +
                '</div></div></div></div>';
        }
        return '<div class="sc"><h1 class="title">ФИЛЬМЫ<span class="sub">заказы сценарного отдела, готовые сценарии и производства</span></h1>' +
            '<div class="h2">🎬 В производстве</div>' + prod +
            '<div class="h2">🖋 Пишутся</div>' + (orders || '<p class="hint">Сценарный отдел свободен.</p>') +
            '<div class="h2">📜 Готовые сценарии</div>' + (scripts || '<p class="hint">Сценариев нет. Нажмите «🎥 Новый фильм»: закажите сценарий у сценариста или напишите его сами — бесплатно, но слабее.</p>') +
            '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span><span class="sp"></span>' +
            '<span class="btn gold" data-act="newmovie">🎥 Новый фильм</span></div></div>';
    },

    cinema(game) {
        const s = StudioManager.state;
        let list = '';
        for (const m of s.released) {
            const g = MovieData.GENRES[m.genre] || {};
            list += '<div class="card" data-act="watch:' + m.id + '"><div class="row" style="align-items:flex-start">' +
                '<div class="poster ' + m.genre + '" ' + this.posterStyle(m) + '><div class="p-emoji">' + (g.emoji || '🎬') + '</div>' +
                (m.score != null ? '<div class="p-score">' + m.score.toFixed(1) + '</div>' : '') +
                '<div class="p-title">' + this.esc(m.title) + '</div></div>' +
                '<div style="flex:1"><div class="row tight"><span class="name">«' + this.esc(m.title) + '»</span>' +
                '<span class="tag">' + (g.ru || '') + '</span><span class="tag">' + m.year + '</span>' +
                (m.sequelOf ? '<span class="tag blue">сиквел</span>' : '') + '</div>' +
                '<div class="meta">Касса: ' + StudioUI.money(m.boxOffice) + ' · Критики: ' + (m.score != null ? m.score.toFixed(1) + '/10' : '—') +
                ' · Зрители: ' + Math.round(m.audience || 0) + '%</div>' +
                '<div class="meta">' + this.esc(m.logline || '') + '</div>' +
                '<div class="row tight" style="margin-top:6px"><span class="btn gold small">▶ Смотреть фильм</span>' +
                (typeof ProductionSystem !== 'undefined' && ProductionSystem.canSequel && ProductionSystem.canSequel(s, m)
                    ? '<span class="btn small" data-act="sequel:' + m.id + '">🎬 Снять сиквел</span>' : '') +
                '</div></div></div></div>';
        }
        return '<div class="sc"><h1 class="title">КИНОТЕАТР<span class="sub">фильмография студии — каждый фильм можно посмотреть</span></h1>' +
            (list || '<p class="hint">Показывать пока нечего. Снимите первый фильм — или посмотрите демо-сцену из главного меню.</p>') +
            '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span><span class="sp"></span>' +
            (typeof ReleaseSystem !== 'undefined' ? '<span class="btn" data-act="rel:list">📰 Касса и критика</span>' : '') +
            '<span class="btn" data-act="demo">🤠 Демо-сцена</span></div></div>';
    },

    more(game) {
        const s = StudioManager.state;
        const vol = (typeof Sound3D !== 'undefined' && Sound3D.master && Sound3D.master.gain) ? Math.round(Sound3D.master.gain.value * 100) : 80;
        return '<div class="sc"><h1 class="title">ЕЩЁ<span class="sub">настройки, сохранения, справка</span></h1>' +
            '<div class="cols"><div class="col panel"><div class="h3">🔊 Звук и темп жизни</div>' +
            '<label class="fld">Общая громкость: <b id="volVal">' + vol + '%</b></label>' +
            '<input type="range" min="0" max="100" value="' + vol + '" data-act="volume" style="width:100%">' +
            '<label class="fld" style="margin-top:8px">Авто-неделя (0 — вручную): <b>' + ((s.settings || {}).autoWeek || 0) + ' с</b></label>' +
            '<input type="range" min="0" max="12" step="2" value="' + ((s.settings || {}).autoWeek || 0) + '" data-act="autoweek" style="width:100%">' +
            '<div class="row tight" style="margin-top:8px">' +
            '<span class="btn small' + ((s.settings || {}).hints !== false ? ' gold' : '') + '" data-act="set:hints">💡 Подсказки ' + ((s.settings || {}).hints !== false ? 'включены' : 'выключены') + '</span>' +
            '</div>' +
            '<label class="fld" style="margin-top:10px">🎨 Качество графики: <b>' + this.gfxName() + '</b></label>' +
            '<div class="row tight">' + ['Низкое', 'Среднее', 'Высокое', 'Ультра'].map((nm, i) =>
                '<span class="btn small' + (this.gfxQuality() === i ? ' gold' : '') + '" data-act="set:gfx:' + i + '">' + nm + '</span>').join('') + '</div>' +
            '<p class="hint" style="margin-top:4px">Ультра — TAA и волюметрический туман; высокое — мягкие тени SSAO; низкое — без постобработки.</p>' +
            '</div>' +
            '<div class="col panel"><div class="h3">💾 Сохранения</div>' +
            '<div class="row tight"><span class="btn" data-act="save:1">Слот 1</span><span class="btn" data-act="save:2">Слот 2</span><span class="btn" data-act="save:3">Слот 3</span></div>' +
            '<div class="row tight" style="margin-top:8px"><span class="btn" data-act="load:1">Загрузить 1</span><span class="btn" data-act="load:2">Загрузить 2</span><span class="btn" data-act="load:3">Загрузить 3</span></div>' +
            '<p class="hint" style="margin-top:8px">' + (typeof SaveSystem !== 'undefined' && SaveSystem.slotsInfo ? SaveSystem.slotsInfo() : 'Автосохранение каждую неделю.') + '</p>' +
            '<div class="row tight"><span class="btn small" data-act="save:export">⬇ Экспорт .json</span>' +
            '<span class="btn small" data-act="save:import">⬆ Импорт .json</span></div>' +
            '</div>' +
            '<div class="col panel"><div class="h3">📊 Хроника</div><span class="btn" data-act="meta:stats">Статистика и достижения</span>' +
            '<div class="h3">❔ Справка</div><span class="btn" data-act="help">Как играть</span>' +
            '<div class="h3">🏳 Студия</div><p class="hint">«' + this.esc(s.studioName) + '» · основана в ' + s.year + ' · недель прошло: ' + s.stats.weeks + '</p></div>' +
            '</div>' +
            '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span><span class="btn" data-act="menu">В главное меню</span></div></div>';
    },

    // --- the screen router ------------------------------------------------------------------------

    render(game, name) {
        switch (name) {
            case 'menu': return this.menu(game);
            case 'studio': return this.studio(game);
            case 'people': return this.people(game);
            case 'films': return this.films(game);
            case 'cinema': return this.cinema(game);
            case 'more': return this.more(game);
            case 'help': return this.help(game);
            case 'newmovie': return typeof ScriptGenerator !== 'undefined' && ScriptGenerator.newMovieScreen
                ? ScriptGenerator.newMovieScreen(game) : this._soon('Мастер нового фильма');
            case 'script': return typeof ScriptGenerator !== 'undefined' && ScriptGenerator.detailScreen
                ? ScriptGenerator.detailScreen(game, (game.uiState || {}).scriptOpen) : this._soon('Сценарий');
            case 'casting': return typeof CastingSystem !== 'undefined' && CastingSystem.screen
                ? CastingSystem.screen(game) : this._soon('Кастинг');
            case 'production': return typeof ProductionSystem !== 'undefined' && ProductionSystem.screen
                ? ProductionSystem.screen(game) : this._soon('Производство');
            case 'post': return typeof ReleaseSystem !== 'undefined' && ReleaseSystem.postScreen
                ? ReleaseSystem.postScreen(game) : this._soon('Постпродакшн');
            case 'reviews': return typeof ReleaseSystem !== 'undefined' && ReleaseSystem.reviewsScreen
                ? ReleaseSystem.reviewsScreen(game) : this._soon('Премьера');
            case 'stats': return typeof MetaSystem !== 'undefined' && MetaSystem.statsScreen
                ? MetaSystem.statsScreen(game) : this._soon('Хроника студии');
            default: return this._soon(name);
        }
    },

    _soon(what) {
        return '<div class="sc"><h1 class="title">' + this.esc(what) + '</h1><p class="lead">Раздел открывается по мере готовности систем студии.</p>' +
            '<span class="btn" data-act="close">← Закрыть</span></div>';
    },

    // --- the dispatcher ----------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        // A soft tap under every action: the interface answers the finger, not the eye.
        if (typeof Sound3D !== 'undefined' && MovieData.SFX.click) {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            if (!this._lastClick || now - this._lastClick > 70) {
                this._lastClick = now;
                Sound3D.play(MovieData.SFX.click, { volume: 0.25 });
            }
        }
        const S = StudioManager, s = S.state;
        const parts = String(act).split(':');
        game.uiState = game.uiState || {};
        const rerender = () => game.showScreen(game.screen);

        if (act === 'demo') {
            game.playMovie(MovieData.DEMO_MOVIE, {});
            return;
        }
        if (act === 'new') {
            // The scenario decides what winning means here, so the player picks it first.
            if (typeof MetaSystem !== 'undefined' && MetaSystem.scenarioPicker) {
                game.modal(MetaSystem.scenarioPicker(game));
                return;
            }
            S.newGame('Фабрика Грёз', 'sandbox');
            game.started = true;
            game._setHud(true);
            game.showScreen('studio');
            game.toast('🎬 Добро пожаловать на «Фабрику Грёз»! Постройте декорации и снимите первый фильм.');
            Sound3D.play(MovieData.SFX.cash, { volume: 0.5 });
            return;
        }
        if (act === 'continue') {
            if (typeof SaveSystem !== 'undefined' && SaveSystem.loadAuto && SaveSystem.loadAuto()) {
                game.started = true;
                game._setHud(true);
                game.showScreen('studio');
            } else game.toast('Сохранений не найдено.');
            return;
        }
        if (act === 'menu') { game.closeModal(); game.toMenu(); return; }
        if (act === 'back') { game.showScreen(game.started ? 'studio' : 'menu'); return; }
        if (act === 'close') { game.closeModal(); game.showScreen('none'); return; }
        if (act === 'help') { game.showScreen('help'); return; }
        if (parts[0] === 'nav') { game.showScreen(parts[1]); return; }
        if (parts[0] === 'tab') { game.uiState[parts[1] + 'Tab'] = parts[2]; rerender(); return; }
        if (act === 'newmovie') {
            if (typeof ScriptGenerator !== 'undefined' && ScriptGenerator.newMovieScreen) { game.showScreen('newmovie'); return; }
            game.toast('Сценарный отдел откроется в следующей фазе разработки.');
            return;
        }
        if (parts[0] === 'set' && parts[1] === 'buy') {
            if (S.buySet(parts[2])) { Sound3D.play(MovieData.SFX.cash, { volume: 0.6 }); game.toast('🏗 Декорация построена!'); }
            else game.toast('Недостаточно денег.');
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'more') {
            game.uiState.marketMore = !game.uiState.marketMore;
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'hire') {
            const p = (s.market || []).find((x) => x.id === parts[2]);
            if (p && S.hire(p)) { Sound3D.play(MovieData.SFX.typewriter, { volume: 0.5 }); game.toast('🤝 ' + p.name + ' в команде!'); }
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'fire') {
            const p = s.roster.concat(s.staff).find((x) => x.id === parts[2]);
            if (p && typeof ProductionSystem !== 'undefined' && ProductionSystem.personBusy && ProductionSystem.personBusy(s, p)) {
                game.toast(p.name + ' сейчас на съёмках — увольнение сорвёт производство.');
                return;
            }
            if (p) { S.fire(p); game.toast(p.name + ' уволен(а).'); }
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'renew') {
            const p = s.roster.concat(s.staff).find((x) => x.id === parts[2]);
            if (p && S.renew(p)) { game.toast('📝 ' + p.name + ' продлевает контракт: ' + StudioUI.money(p.salary) + '/нед.'); }
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'counter') {
            const p = s.roster.concat(s.staff).find((x) => x.id === parts[2]);
            if (p && S.counter(p)) { Sound3D.play(MovieData.SFX.cash, { volume: 0.5 }); game.toast('💰 ' + p.name + ' остаётся: предложение перебито.'); }
            else if (p) game.toast('Не хватает денег на подписной бонус.');
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'letgo') {
            const p = s.roster.concat(s.staff).find((x) => x.id === parts[2]);
            if (p && S.letGo(p)) game.toast(' ' + p.name + ' покидает студию без продления.');
            rerender();
            return;
        }
        if (parts[0] === 'p' && parts[1] === 'train') {
            const p = s.roster.concat(s.staff).find((x) => x.id === parts[2]);
            if (p && S.startTraining(p, parts[3])) { Sound3D.play(MovieData.SFX.typewriter, { volume: 0.4 }); game.toast('🎓 ' + p.name + ' уходит на курсы: ' + PeopleSystem.SKILL_RU[parts[3]]); }
            else game.toast('Нельзя: нет денег, навык максимален или человек уже учится.');
            rerender();
            return;
        }
        if (parts[0] === 'watch') {
            const m = (s.released || []).find((x) => x.id === parts[1]);
            if (m && m.timeline) { game.playMovie(m.timeline, {}); return; }
            if (m) game.toast('Копия фильма утеряна при монтаже… (таймлайн не сохранён)');
            return;
        }
        if (parts[0] === 'sequel') {
            if (typeof ProductionSystem !== 'undefined' && ProductionSystem.startSequel) {
                const res = ProductionSystem.startSequel(s, parts[1]);
                if (res && res.ok) {
                    game.uiState.scriptOpen = res.script.id;
                    game.showScreen('script');
                    game.toast('🎬 Сиквел №' + res.number + ' написан: «' + res.script.title + '». Узнаваемость продаёт, несвежесть штрафует.');
                } else game.toast(res ? res.why : 'Сиквел не случился.');
            }
            return;
        }
        if (act === 'change:volume') {
            const v = Number(el.value) / 100;
            if (typeof Sound3D !== 'undefined' && Sound3D.master) Sound3D.master.gain.value = Math.max(0, Math.min(1, v));
            Store.set('fg.volume', String(Math.max(0, Math.min(1, v))));
            if (s && s.settings) s.settings.volume = Math.max(0, Math.min(1, v));
            const lbl = screenEl && screenEl.querySelector ? screenEl.querySelector('#volVal') : null;
            if (lbl) lbl.textContent = Math.round(v * 100) + '%';
            return;
        }
        if (parts[0] === 'save' || parts[0] === 'load') {
            if (typeof SaveSystem === 'undefined') { game.toast('Сохранения появятся в фазе З.'); return; }
            if (parts[0] === 'save') { SaveSystem.save(s, Number(parts[1])); game.toast('💾 Игра сохранена в слот ' + parts[1] + '.'); }
            else if (SaveSystem.load(Number(parts[1]))) { game.started = true; game._setHud(true); game.showScreen('studio'); game.toast('💾 Игра загружена.'); }
            else game.toast('Слот пуст.');
            rerender();
            return;
        }
        // The systems of the later phases handle their own verbs. NOTE: a system is a classic
        // top-level `const` — a lexical global binding, NOT a property of `window` — so they are
        // resolved here by direct reference behind typeof-guards (window[…] always missed them).
        const sys = {
            script: typeof ScriptGenerator !== 'undefined' ? ScriptGenerator : null,
            cast: typeof CastingSystem !== 'undefined' ? CastingSystem : null,
            prod: typeof ProductionSystem !== 'undefined' ? ProductionSystem : null,
            rel: typeof ReleaseSystem !== 'undefined' ? ReleaseSystem : null,
            meta: typeof MetaSystem !== 'undefined' ? MetaSystem : null,
        };
        if (act === 'change:autoweek') {
            if (s && s.settings) s.settings.autoWeek = Number(el.value) || 0;
            rerender();
            return;
        }
        if (parts[0] === 'set' && parts[1] === 'hints') {
            if (s && s.settings) s.settings.hints = s.settings.hints === false;
            rerender();
            return;
        }
        if (parts[0] === 'set' && parts[1] === 'gfx') {
            if (typeof CinePost3D !== 'undefined') CinePost3D.setQuality(Number(parts[2]));
            rerender();
            return;
        }
        if (act === 'save:export') {
            if (typeof SaveSystem !== 'undefined') { SaveSystem.exportJSON(s); game.toast('⬇ Файл сохранения скачан.'); }
            return;
        }
        if (act === 'save:import') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = () => {
                const f = input.files && input.files[0];
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => {
                    const ok = typeof SaveSystem !== 'undefined' && SaveSystem.importJSON(String(rd.result), game);
                    game.toast(ok ? '⬆ Сохранение загружено из файла.' : 'Файл не похож на сохранение «Фабрики Грёз».');
                };
                rd.readAsText(f);
            };
            input.click();
            return;
        }
        // A control change arrives as 'change:<system>:<verb>' — route it to its system too.
        const key = parts[0] === 'change' && parts.length > 2 ? parts[1] : parts[0];
        if (sys[key]) {
            const ns = sys[key];
            if (ns.onAction && ns.onAction(game, act, el, screenEl) !== false) {
                // An action may have STARTED A FILM (script:watch / script:dailies): re-rendering
                // the current screen here would put the management panel back on top of the
                // picture, because Game.playMovie has just hidden it.
                const movieOn = typeof MovieSequencer !== 'undefined' && MovieSequencer.playing;
                if (game.screen !== 'none' && !movieOn && !(ns === ScriptGenerator && act.indexOf('change:') === 0)) rerender();
                return;
            }
        }
    },
};
