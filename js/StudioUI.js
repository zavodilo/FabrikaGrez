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

    avatar(p, size) {
        const L = p.look || {};
        const s = size || 46;
        const hairH = L.hairStyle === 3 ? 0 : Math.round(s * 0.22);
        return '<span style="position:relative;display:inline-block;width:' + s + 'px;height:' + s + 'px;border-radius:10px;overflow:hidden;background:#0e1320;flex:none;border:1px solid #2a3446">' +
            (L.hat ? '<span style="position:absolute;left:8%;top:6%;width:84%;height:16%;background:' + L.hat + ';border-radius:3px"></span>' : '') +
            '<span style="position:absolute;left:22%;top:' + (L.hat ? 16 : 12) + '%;width:56%;height:40%;border-radius:40%;background:' + (L.skin || '#d9996b') + '"></span>' +
            (hairH ? '<span style="position:absolute;left:20%;top:' + (L.hat ? 14 : 9) + '%;width:60%;height:' + (hairH + 8) + '%;border-radius:40% 40% 0 0;background:' + (L.hair || '#3a2a1a') + '"></span>' : '') +
            '<span style="position:absolute;left:14%;top:56%;width:72%;height:52%;border-radius:34% 34% 0 0;background:' + (L.shirt || '#3d639b') + '"></span>' +
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
            '<p>Пробел — пауза в кино, Esc — выйти из просмотра/закрыть экран. Колесо — зум студии, WASD — полёт камеры, ПКМ — осмотреться.</p></div>' +
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
            sets += '<div class="card' + (owned ? '' : '') + '" style="cursor:default">' +
                '<div class="row"><b>' + info.ru + '</b><span class="sp"></span>' +
                (owned ? '<span class="tag green">построена · ур. ' + owned.level + '</span>'
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
        const busy = p.training ? '<span class="tag blue">учёба: ' + S.SKILL_RU[p.training.skill] + ', ещё ' + p.training.weeksLeft + ' нед.</span>' : '';
        let btns = '';
        if (mode === 'market') btns = '<span class="btn gold small" data-act="p:hire:' + p.id + '">Нанять · ' + StudioUI.money(p.salary) + '/нед</span>';
        if (mode === 'roster') {
            btns = '<span class="btn red small" data-act="p:fire:' + p.id + '">Уволить</span>';
            if (!p.training && p.role === 'actor') {
                for (const k of S.SKILLS) {
                    if (p.skills[k] < 10) btns += ' <span class="btn small" data-act="p:train:' + p.id + ':' + k + '">🎓 ' + S.SKILL_RU[k] + '</span>';
                }
            }
        }
        return '<div class="card" style="cursor:default"><div class="row" style="align-items:flex-start">' +
            this.avatar(p, 52) +
            '<div style="flex:1;min-width:200px"><div class="row tight"><span class="name">' + this.esc(p.name) + '</span>' + this.stars(p) +
            '<span class="tag">' + S.ROLE_RU[p.role] + '</span><span class="tag">' + p.age + ' лет</span>' +
            '<span class="tag ' + (p.mood >= 60 ? 'green' : p.mood >= 35 ? '' : 'red') + '">' + S.moodWord(p.mood) + '</span>' + busy + '</div>' +
            '<div class="meta" style="margin-top:4px">' + this.skillRow(p) + '</div>' +
            '<div class="meta">Обаяние ' + p.charm + '/10 · Надёжность ' + p.reliability + '/10 · Зарплата ' + StudioUI.money(p.salary) + '/нед' +
            (p.films ? ' · Фильмов: ' + p.films : '') + (p.quirks.length ? ' · ' + p.quirks.join(', ') : '') + '</div></div>' +
            '<div class="row tight" style="align-self:center">' + btns + '</div></div></div>';
    },

    people(game) {
        const s = StudioManager.state;
        const ui = game.uiState;
        const tab = ui.peopleTab || 'roster';
        const tabs = [['roster', 'Актёры (' + s.roster.length + ')'], ['staff', 'Команда (' + s.staff.length + ')'], ['market', 'Биржа талантов']];
        let h = '<div class="sc"><h1 class="title">ЛЮДИ<span class="sub">труппа, команда и биржа талантов</span></h1><div class="tabs">';
        for (const t of tabs) h += '<span class="tab' + (tab === t[0] ? ' on' : '') + '" data-act="tab:people:' + t[0] + '">' + t[1] + '</span>';
        h += '</div>';
        if (tab === 'roster') {
            h += s.roster.length ? '' : '<p class="hint">В труппе пусто. Загляните на биржу талантов.</p>';
            for (const p of s.roster) h += this.personCard(p, 'roster');
        } else if (tab === 'staff') {
            h += s.staff.length ? '' : '<p class="hint">Без сценариста и режиссёра фильм не снять.</p>';
            for (const p of s.staff) h += this.personCard(p, 'roster');
        } else {
            h += '<p class="hint">Обновление через ' + Math.max(0, s.marketIn) + ' нед. Кандидаты подписывают контракт на свою запрашиваемую зарплату.</p>';
            for (const p of s.market) h += this.personCard(p, 'market');
        }
        h += '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span></div></div>';
        return h;
    },

    // --- films & cinema ---------------------------------------------------------------------------

    films(game) {
        const s = StudioManager.state;
        let prod = '';
        if (s.projects.length && typeof ProductionSystem !== 'undefined') prod = ProductionSystem.filmsScreen(s);
        else prod = '<p class="hint">Производств нет.</p>';
        let scripts = '';
        for (const sc of s.scripts) {
            scripts += '<div class="card" style="cursor:default"><div class="row"><b>«' + this.esc(sc.title) + '»</b>' +
                '<span class="tag">' + MovieData.GENRES[sc.genre].ru + '</span><span class="sp"></span>' +
                '<span class="tag gold">качество ' + sc.quality.toFixed(1) + '</span>' +
                '<span class="btn gold small" data-act="prod:start:' + sc.id + '">В производство</span></div>' +
                '<div class="meta">Сценарист: ' + this.esc(sc.writerName || '—') + ' · сцен: ' + (sc.timeline ? sc.timeline.scenes.length : '?') + '</div></div>';
        }
        return '<div class="sc"><h1 class="title">ФИЛЬМЫ<span class="sub">производства и готовые сценарии</span></h1>' +
            '<div class="h2">🎬 В производстве</div>' + prod +
            '<div class="h2">📜 Готовые сценарии</div>' + (scripts || '<p class="hint">Сценарии появляются, когда сценарист дописывает заказ (или написаны вами в мастере нового фильма).</p>') +
            '<div class="row" style="margin-top:12px"><span class="btn" data-act="close">← Закрыть</span><span class="sp"></span>' +
            '<span class="btn gold" data-act="newmovie">🎥 Новый фильм</span></div></div>';
    },

    cinema(game) {
        const s = StudioManager.state;
        let list = '';
        for (const m of s.released) {
            const g = MovieData.GENRES[m.genre] || {};
            list += '<div class="card" data-act="watch:' + m.id + '"><div class="row" style="align-items:flex-start">' +
                '<div class="poster ' + m.genre + '"><div class="p-emoji">' + (g.emoji || '🎬') + '</div>' +
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
            '<span class="btn" data-act="demo">🤠 Демо-сцена</span></div></div>';
    },

    more(game) {
        const s = StudioManager.state;
        const vol = (typeof Sound3D !== 'undefined' && Sound3D.master && Sound3D.master.gain) ? Math.round(Sound3D.master.gain.value * 100) : 80;
        return '<div class="sc"><h1 class="title">ЕЩЁ<span class="sub">настройки, сохранения, справка</span></h1>' +
            '<div class="cols"><div class="col panel"><div class="h3">🔊 Звук</div>' +
            '<label class="fld">Общая громкость: <b id="volVal">' + vol + '%</b></label>' +
            '<input type="range" min="0" max="100" value="' + vol + '" data-act="volume" style="width:100%">' +
            '</div>' +
            '<div class="col panel"><div class="h3">💾 Сохранения</div>' +
            '<div class="row tight"><span class="btn" data-act="save:1">Слот 1</span><span class="btn" data-act="save:2">Слот 2</span><span class="btn" data-act="save:3">Слот 3</span></div>' +
            '<div class="row tight" style="margin-top:8px"><span class="btn" data-act="load:1">Загрузить 1</span><span class="btn" data-act="load:2">Загрузить 2</span><span class="btn" data-act="load:3">Загрузить 3</span></div>' +
            '<p class="hint" style="margin-top:8px">' + (typeof SaveSystem !== 'undefined' && SaveSystem.slotInfo ? SaveSystem.slotsInfo() : 'Автосохранение каждую неделю.') + '</p>' +
            '</div>' +
            '<div class="col panel"><div class="h3">❔ Справка</div><span class="btn" data-act="help">Как играть</span>' +
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
            case 'casting': return typeof CastingSystem !== 'undefined' && CastingSystem.screen
                ? CastingSystem.screen(game) : this._soon('Кастинг');
            case 'production': return typeof ProductionSystem !== 'undefined' && ProductionSystem.screen
                ? ProductionSystem.screen(game) : this._soon('Производство');
            case 'post': return typeof ReleaseSystem !== 'undefined' && ReleaseSystem.postScreen
                ? ReleaseSystem.postScreen(game) : this._soon('Постпродакшн');
            case 'reviews': return typeof ReleaseSystem !== 'undefined' && ReleaseSystem.reviewsScreen
                ? ReleaseSystem.reviewsScreen(game) : this._soon('Премьера');
            default: return this._soon(name);
        }
    },

    _soon(what) {
        return '<div class="sc"><h1 class="title">' + this.esc(what) + '</h1><p class="lead">Раздел открывается по мере готовности систем студии.</p>' +
            '<span class="btn" data-act="close">← Закрыть</span></div>';
    },

    // --- the dispatcher ----------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        const S = StudioManager, s = S.state;
        const parts = String(act).split(':');
        game.uiState = game.uiState || {};
        const rerender = () => game.showScreen(game.screen);

        if (act === 'demo') {
            game.playMovie(MovieData.DEMO_MOVIE, {});
            return;
        }
        if (act === 'new') {
            S.newGame('Фабрика Грёз');
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
                ProductionSystem.startSequel(s, parts[1]);
                game.showScreen('newmovie');
            }
            return;
        }
        if (act === 'change:volume') {
            const v = Number(el.value) / 100;
            if (typeof Sound3D !== 'undefined' && Sound3D.master) Sound3D.master.gain.value = Math.max(0, Math.min(1, v));
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
        // The systems of the later phases handle their own verbs.
        const sys = { script: 'ScriptGenerator', cast: 'CastingSystem', prod: 'ProductionSystem', rel: 'ReleaseSystem', meta: 'MetaSystem' };
        if (sys[parts[0]]) {
            const ns = /** @type {any} */ (window)[sys[parts[0]]];
            if (ns && ns.onAction && ns.onAction(game, act, el, screenEl) !== false) {
                if (game.screen !== 'none') rerender();
                return;
            }
        }
    },
};
