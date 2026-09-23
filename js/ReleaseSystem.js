// ReleaseSystem.js — post-production, distribution and the yearly awards (Phase Д).
// A wrapped picture goes to the editing room (cut tempo + score), then premieres with a
// marketing campaign, then runs in theaters week by week: the gross decays as word of mouth
// (the audience score) dictates, the critics publish quotable verdicts, the fan base moves,
// and once a year the studio hands out the «Золотой Кадр». This is where the money comes back.
//
// Pure logic on Rng: no DOM, no pc.*. Screens are HTML for the 'screen' UI elements (skill ui);
// clicks arrive as data-act="rel:…" through StudioUI.onAction. StudioManager.tickWeek calls
// weekly() and, at the new year, awardsCeremony() — both behind typeof-guards.
//
//   ReleaseSystem.premiere(state, mgr, proj)   -> { ok, movie } | { ok:false, why }
//   ReleaseSystem.weekly(state, mgr)           -> toasts[]
//   ReleaseSystem.awardsCeremony(state)        -> toasts[]

/** @satisfies {Record<string, any>} */
const ReleaseSystem = {

    // Which cut tempo suits which genre: an action picture cuts fast, a melodrama lets the
    // silence work, and fighting the genre reads as bad editing in every review.
    EDIT_FIT: {
        fast: ['action', 'comedy', 'horror'],
        normal: ['western', 'scifi'],
        slow: ['drama', 'romance'],
    },
    EDIT_RU: { fast: 'Быстрый', normal: 'Ровный', slow: 'Медленный' },

    // Month multipliers of the gross: summer and the December holidays carry the year.
    SEASON: [0.9, 0.85, 0.9, 1.0, 1.05, 1.15, 1.2, 1.15, 1.0, 1.0, 1.1, 1.25],

    cfg() {
        const U = 'undefined';
        return {
            runWeeks: typeof RELEASE_RUN_WEEKS !== U ? RELEASE_RUN_WEEKS : 8,
            drop: typeof RELEASE_DROP !== U ? RELEASE_DROP : 0.42,
            openPerFan: typeof RELEASE_OPEN_PER_FAN !== U ? RELEASE_OPEN_PER_FAN : 900,
            openPerQuality: typeof RELEASE_OPEN_PER_QUALITY !== U ? RELEASE_OPEN_PER_QUALITY : 90000,
            openPerMarketing: typeof RELEASE_OPEN_PER_MARKETING !== U ? RELEASE_OPEN_PER_MARKETING : 0.9,
            starBonus: typeof RELEASE_STAR_BONUS !== U ? RELEASE_STAR_BONUS : 0.08,
            screenBase: typeof RELEASE_SCREEN_BASE !== U ? RELEASE_SCREEN_BASE : 150,
            marketingMax: typeof MARKETING_MAX_FRAC !== U ? MARKETING_MAX_FRAC : 1,
            share: typeof RELEASE_STUDIO_SHARE !== U ? RELEASE_STUDIO_SHARE : 0.55,
            editMatch: typeof RELEASE_EDIT_MATCH !== U ? RELEASE_EDIT_MATCH : 0.5,
            editMiss: typeof RELEASE_EDIT_MISMATCH !== U ? RELEASE_EDIT_MISMATCH : -0.6,
            musicFit: typeof RELEASE_MUSIC_FIT !== U ? RELEASE_MUSIC_FIT : 0.3,
            musicMiss: typeof RELEASE_MUSIC_MISS !== U ? RELEASE_MUSIC_MISS : -0.4,
            criticNoise: typeof RELEASE_CRITIC_NOISE !== U ? RELEASE_CRITIC_NOISE : 0.8,
            audienceStar: typeof RELEASE_AUDIENCE_STAR !== U ? RELEASE_AUDIENCE_STAR : 4,
            heatFactor: typeof RELEASE_HEAT_FACTOR !== U ? RELEASE_HEAT_FACTOR : 0.06,
            screenPerQuality: typeof RELEASE_SCREEN_PER_QUALITY !== U ? RELEASE_SCREEN_PER_QUALITY : 12,
            screenGross: typeof RELEASE_SCREEN_GROSS !== U ? RELEASE_SCREEN_GROSS : 9000,
            fansPerQuality: typeof RELEASE_FANS_PER_QUALITY !== U ? RELEASE_FANS_PER_QUALITY : 0.8,
            fansLoss: typeof RELEASE_FANS_LOSS !== U ? RELEASE_FANS_LOSS : 0.6,
            holdBonus: typeof RELEASE_HOLD_BONUS !== U ? RELEASE_HOLD_BONUS : 0.12,
            awardRep: typeof AWARD_REP !== U ? AWARD_REP : 6,
            awardFans: typeof AWARD_FANS !== U ? AWARD_FANS : 4,
            awardCash: typeof AWARD_CASH !== U ? AWARD_CASH : 25000,
        };
    },

    // --- the editing room ------------------------------------------------------------------------

    /** How well the chosen cut tempo suits the genre: +match / 0 / mismatch. */
    editDelta(genre, pace) {
        const c = this.cfg();
        const fit = this.EDIT_FIT[pace] || [];
        if (fit.indexOf(genre) >= 0) return c.editMatch;
        // The genre's own tempo is 0; anything else fights the picture.
        for (const k of Object.keys(this.EDIT_FIT)) {
            if (k !== pace && this.EDIT_FIT[k].indexOf(genre) >= 0) return c.editMiss;
        }
        return 0;
    },

    /** The score: the genre's own music fits, a foreign one reads as a mistake, studio theme is neutral. */
    musicDelta(genre, music) {
        const c = this.cfg();
        const own = (MovieData.GENRES[genre] || {}).music;
        if (music === own) return c.musicFit;
        if (music === 'studio') return 0;
        return c.musicMiss;
    },

    /** The final quality of the picture: what the floor shot, cut and scored to taste. */
    finalQuality(state, proj, opts) {
        const o = opts || {};
        const pq = ProductionSystem.projectedQuality(state, proj);
        const edit = this.editDelta(proj.genre, o.edit || proj.edit || 'normal');
        const music = this.musicDelta(proj.genre, o.music || proj.music || (MovieData.GENRES[proj.genre] || {}).music);
        return {
            quality: Math.round(Math.max(0.3, Math.min(10, pq.quality + edit + music)) * 100) / 100,
            base: pq.quality, edit: edit, music: music,
        };
    },

    // --- the premiere ------------------------------------------------------------------------------

    /** Stars of the leads at the moment of the premiere. */
    leadStars(state, proj) {
        const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
        const leadKeys = script ? (script.roles || []).filter((r) => r.tier === 'lead').map((r) => r.key) : [];
        let sum = 0, n = 0;
        for (const c of ProductionSystem.castPeople(state, proj)) {
            if (leadKeys.indexOf(c.key) < 0) continue;
            sum += c.person.star || 0; n++;
        }
        return { sum: sum, avg: n ? sum / n : 0, n: n };
    },

    /** The opening weekend and the screen count, explained line by line for the UI. */
    openingPlan(state, proj, marketing, quality) {
        const c = this.cfg();
        const heat = MovieData.heat ? MovieData.heat(proj.genre, state.year) : 6;
        const stars = this.leadStars(state, proj);
        const season = this.SEASON[Math.floor(((state.week || 1) - 1) * 12 / 52) % 12] || 1;
        const base = state.fans * c.openPerFan + quality * c.openPerQuality;
        const mFrac = Math.max(0, Math.min(c.marketingMax, marketing / (proj.budget || 1)));
        const mult = (1 + mFrac * c.openPerMarketing) * (1 + stars.sum * c.starBonus) *
            (1 + (heat - 5) * c.heatFactor) * season;
        const screens = Math.round(c.screenBase + quality * c.screenPerQuality);
        const cap = screens * c.screenGross;
        const opening = Math.min(base * mult, cap);
        return {
            opening: Math.round(opening), screens: screens, heat: heat, season: season,
            mFrac: mFrac, stars: stars.sum, cap: cap, capped: base * mult > cap,
        };
    },

    /** Cut, score, market, premiere. The picture leaves the studio and enters the market. */
    premiere(state, mgr, proj, opts) {
        const o = opts || {};
        if (!proj || proj.state !== 'post') return { ok: false, why: 'В монтажную отправляют только снятую картину.' };
        const c = this.cfg();
        const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
        if (!script || !script.timeline) return { ok: false, why: 'Материал картины потерян.' };
        const marketing = Math.max(0, Math.min(Math.round(proj.budget * c.marketingMax), Math.round(o.marketing != null ? o.marketing : proj.budget * 0.3)));
        if (!mgr.canAfford(marketing)) return { ok: false, why: 'На кампанию нужно ' + StudioUI_money(marketing) + ' — в кассе столько нет.' };

        const fq = this.finalQuality(state, proj, { edit: o.edit || 'normal', music: o.music || (MovieData.GENRES[proj.genre] || {}).music });
        mgr.pay(marketing, 'Маркетинг: «' + proj.title + '»');
        const plan = this.openingPlan(state, proj, marketing, fq.quality);

        // The critics and the audience form their opinions once, at the premiere.
        const r = Rng.create(((state.seed ^ Math.imul(state.weekIdx + 7, 2654435761) ^ Rng.hash(proj.id + 'rel')) >>> 0) || 1);
        const critic = Math.round(Math.max(0.3, Math.min(10, fq.quality + r.gauss() * c.criticNoise + (plan.heat - 5) * 0.05)) * 10) / 10;
        const stars = this.leadStars(state, proj);
        const audience = Math.round(Math.max(5, Math.min(100,
            fq.quality * 8 + stars.avg * c.audienceStar + (plan.heat - 5) * 1.5 + plan.mFrac * 6 + r.gauss() * 6)));

        /** @type {any} */
        const movie = {
            id: 'mv' + (state.weekIdx + 1) + '-' + (state.released || []).length,
            projectId: proj.id,
            scriptId: proj.scriptId,
            title: proj.title,
            genre: proj.genre,
            year: state.year,
            week: state.week,
            logline: script.logline,
            timeline: script.timeline,
            sequelOf: script.sequelOf || '',
            edit: o.edit || 'normal',
            music: o.music || (MovieData.GENRES[proj.genre] || {}).music,
            marketing: marketing,
            budget: proj.budget,
            spent: proj.spent,
            quality: fq.quality,
            qualityParts: fq,
            screens: plan.screens,
            score: critic,
            audience: audience,
            boxOffice: 0,
            takes: [],
            weeksLeft: c.runWeeks,
            take: plan.opening,
            opening: plan.opening,
            state: 'run',
            awards: [],
            directorId: proj.directorId,
            castIds: Object.assign({}, proj.cast),
            reviews: this._reviews(state, proj, critic),
        };
        state.released = state.released || [];
        state.released.push(movie);
        proj.state = 'released';
        proj.movieId = movie.id;

        // The people of the picture get their credit (and their star power starts compounding).
        for (const key of Object.keys(proj.cast)) {
            const p = ProductionSystem.person(state, proj.cast[key]);
            if (p) { p.films = (p.films || 0) + 1; }
        }
        const pairs = this._sharedFilmsBump(state, proj);
        mgr.pushNews('Премьера «' + proj.title + '»: ' + plan.screens + ' экранов, критики ' + critic.toFixed(1) +
            '/10, зрители ' + audience + '%, старт ' + StudioUI_money(plan.opening) + (pairs ? '' : '') + '.', critic >= 6.5 ? 'good' : '');
        return { ok: true, movie: movie, plan: plan };
    },

    /** Co-stars of a released picture remember each other (chemistry compounds, Phase В). */
    _sharedFilmsBump(state, proj) {
        const ids = Object.values(proj.cast || {});
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = ProductionSystem.person(state, ids[i]), b = ProductionSystem.person(state, ids[j]);
                if (!a || !b) continue;
                a.filmsWith = a.filmsWith || {}; b.filmsWith = b.filmsWith || {};
                a.filmsWith[b.id] = (a.filmsWith[b.id] || 0) + 1;
                b.filmsWith[a.id] = (a.filmsWith[b.id] || 0) + 1;
            }
        }
        return ids.length > 1;
    },

    /** Two or three quotable verdicts from the band the score landed in. */
    _reviews(state, proj, critic) {
        const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
        const band = (MovieData.REVIEWS || []).find((b) => critic >= b.min && critic < b.max) || (MovieData.REVIEWS || [])[2] || { quotes: [] };
        const G = (MovieData.GENRES[proj.genre] || {});
        const director = ProductionSystem.person(state, proj.directorId);
        const leads = ProductionSystem.leads(state, proj, script || { roles: [] });
        const star = leads.length ? leads.slice().sort((a, b) => (b.star || 0) - (a.star || 0))[0] : null;
        const vars = {
            t: proj.title, g: (G.ru || proj.genre).toLowerCase(),
            d: director ? director.name : 'режиссёр студии',
            s: star ? star.name : 'вся труппа',
        };
        const r = Rng.create((Rng.hash(proj.id + 'rev' + critic) >>> 0) || 1);
        const pool = r.shuffled(band.quotes || []);
        const out = [];
        for (let i = 0; i < Math.min(3, pool.length); i++) {
            out.push({
                text: String(pool[i]).replace(/\{t\}/g, vars.t).replace(/\{g\}/g, vars.g)
                    .replace(/\{d\}/g, vars.d).replace(/\{s\}/g, vars.s),
                score: Math.round(Math.max(0.3, Math.min(10, critic + r.gauss() * 0.7)) * 10) / 10,
            });
        }
        return out;
    },

    // --- the run ---------------------------------------------------------------------------------------

    weekly(state, mgr) {
        const c = this.cfg();
        const out = [];
        for (const m of (state.released || [])) {
            if (m.state !== 'run') continue;
            const season = this.SEASON[Math.floor(((state.week || 1) - 1) * 12 / 52) % 12] || 1;
            const gross = Math.round(m.take * season);
            const share = Math.round(gross * c.share);
            mgr.earn(share, 'Прокат: «' + m.title + '»');
            m.boxOffice += share;
            m.takes.push(share);
            m.weeksLeft--;
            // Word of mouth: a loved picture holds its screens, a hated one dies fast.
            const hold = Math.max(0.15, Math.min(0.9, 1 - c.drop + (m.audience - 60) / 100 * c.holdBonus));
            m.take = Math.round(m.take * hold);
            if (m.weeksLeft <= 0 || m.take < 5000) {
                m.state = 'done';
                this._wrap(state, mgr, m, out);
            }
        }
        return out;
    },

    _wrap(state, mgr, m, out) {
        const c = this.cfg();
        const profit = m.boxOffice - (m.spent || m.budget) - m.marketing;
        m.profit = profit;
        state.stats = state.stats || { films: 0, boxOffice: 0, bestScore: 0, awards: 0, weeks: 0 };
        state.stats.films++;
        state.stats.boxOffice += m.boxOffice;
        state.stats.bestScore = Math.max(state.stats.bestScore || 0, m.score);
        // The fan base moves with the picture's reputation.
        const q = m.quality;
        const dFans = q > 6 ? (q - 6) * c.fansPerQuality : q < 4.5 ? (q - 4.5) * c.fansLoss : 0;
        state.fans = Math.max(0, Math.min(100, state.fans + dFans));
        state.rep = Math.max(0, Math.min(100, (state.rep || 20) + (m.score - 5) * 0.4));
        // The people of a hit grow stars; the people of a flop grow experience and scars.
        for (const key of Object.keys(m.castIds || {})) {
            const p = ProductionSystem.person(state, m.castIds[key]);
            if (!p) continue;
            if (m.score >= 7) { p.hits = (p.hits || 0) + 1; p.mood = Math.min(100, p.mood + 10); }
            else if (m.score < 4) { p.mood = Math.max(5, p.mood - 8); }
            p.exp = (p.exp || 0) + 4;
            p.star = PeopleSystem.starOf(p);
            p.salary = PeopleSystem.fairSalary(p);
        }
        const dir = ProductionSystem.person(state, m.directorId);
        if (dir) { dir.exp = (dir.exp || 0) + 5; if (m.score >= 7) dir.hits = (dir.hits || 0) + 1; dir.star = PeopleSystem.starOf(dir); }
        out.push('🎟 «' + m.title + '» сошла с проката: касса ' + StudioUI_money(m.boxOffice) +
            ', ' + (profit >= 0 ? 'прибыль ' : 'убыток ') + StudioUI_money(Math.abs(profit)) +
            ', критики ' + m.score.toFixed(1) + ', зрители ' + m.audience + '%.');
        mgr.pushNews('«' + m.title + '»: прокат завершён (' + StudioUI_money(m.boxOffice) + ', ' +
            (profit >= 0 ? '+' : '−') + StudioUI_money(Math.abs(profit)) + ').', profit >= 0 ? 'good' : 'bad');
    },

    // --- the «Золотой Кадр» ------------------------------------------------------------------------------

    /** Once a year, for the films released in the year that just ended. */
    awardsCeremony(state) {
        const c = this.cfg();
        const year = state.year - 1;
        const films = (state.released || []).filter((m) => m.year === year && m.state === 'done');
        if (!films.length) return [];
        const out = [];
        const best = films.slice().sort((a, b) => b.score - a.score)[0];
        const give = (movie, cat, person) => {
            movie.awards = movie.awards || [];
            movie.awards.push(cat);
            state.stats.awards = (state.stats.awards || 0) + 1;
            state.rep = Math.min(100, (state.rep || 20) + c.awardRep);
            state.fans = Math.min(100, state.fans + c.awardFans);
            if (person) {
                person.awards = (person.awards || 0) + 1;
                person.star = PeopleSystem.starOf(person);
                person.mood = Math.min(100, person.mood + 12);
            }
        };
        mgrEarn(state, c.awardCash);
        out.push('🏆 «Золотой Кадр» за ' + year + ' год: «' + best.title + '» — лучший фильм (' + best.score.toFixed(1) + '/10).');

        const script = (state.scripts || []).find((x) => x.id === best.scriptId);
        const leads = script ? (script.roles || []).filter((r) => r.tier === 'lead') : [];
        let actor = null, actress = null;
        for (const role of leads) {
            const pid = (best.castIds || {})[role.key];
            const p = pid ? ProductionSystem.person(state, pid) : null;
            if (!p) continue;
            if (p.gender === 'm' && !actor) actor = p;
            if (p.gender === 'f' && !actress) actress = p;
        }
        if (actor) { give(best, 'Лучший актёр', actor); out.push('🏆 Лучший актёр: ' + actor.name + ' («' + best.title + '»).'); }
        if (actress) { give(best, 'Лучшая актриса', actress); out.push('🏆 Лучшая актриса: ' + actress.name + ' («' + best.title + '»).'); }
        const dir = ProductionSystem.person(state, best.directorId);
        if (dir) { give(best, 'Лучший режиссёр', dir); out.push('🏆 Лучший режиссёр: ' + dir.name + ' («' + best.title + '»).'); }
        // A second film of the year may take the audience prize.
        const loved = films.slice().sort((a, b) => b.audience - a.audience)[0];
        if (loved && loved.id !== best.id) {
            give(loved, 'Приз зрительских симпатий', null);
            out.push('🏆 Приз зрительских симпатий: «' + loved.title + '» (' + loved.audience + '%).');
        }
        state.news = state.news || [];
        state.news.unshift({ week: state.weekIdx, year: state.year, weekOfYear: state.week, text: 'Церемония «Золотой Кадр»: студия взяла наград за ' + year + ' год — ' + (best.awards || []).length + '.', kind: 'good' });
        return out;
    },

    // --- the screens ---------------------------------------------------------------------------------------

    _proj(state, id) {
        return (state.projects || []).find((p) => p.id === id) || null;
    },

    postScreen(game) {
        const s = StudioManager.state;
        const UIx = StudioUI;
        game.uiState = game.uiState || {};
        const posts = (s.projects || []).filter((p) => p.state === 'post');
        let proj = posts.find((p) => p.id === game.uiState.postOpen) || posts[0] || null;
        if (proj) game.uiState.postOpen = proj.id;      // the marketing slider needs this back
        if (!proj) {
            return '<div class="sc"><h1 class="title">МОНТАЖНАЯ</h1>' +
                '<p class="lead">Здесь картина обретает темп, музыку и афишу.</p>' +
                '<p class="hint">Сейчас в монтажной пусто: завершите съёмки, и материал приедет сюда.</p>' +
                '<div class="row" style="margin-top:14px"><span class="btn" data-act="nav:films">← К фильмам</span></div></div>';
        }
        game.uiState.postEdit = game.uiState.postEdit || {};
        const ed = game.uiState.postEdit[proj.id] = game.uiState.postEdit[proj.id] || { edit: 'normal', music: (MovieData.GENRES[proj.genre] || {}).music, marketing: Math.round(proj.budget * 0.3) };
        const script = (s.scripts || []).find((x) => x.id === proj.scriptId);
        const fq = this.finalQuality(s, proj, ed);
        const c = this.cfg();
        const plan = this.openingPlan(s, proj, ed.marketing, fq.quality);

        let h = '<div class="sc"><h1 class="title">МОНТАЖНАЯ<span class="sub">«' + UIx.esc(proj.title) + '» · ' +
            proj.scenesShot.length + ' сцен материала · черновик ' +
            (ProductionSystem.projectedQuality(s, proj).quality.toFixed(1)) + '/10</span></h1>';

        // The cut.
        h += '<div class="cols"><div class="col"><div class="h2">✂ Монтаж</div><div class="row tight">';
        for (const k of ['fast', 'normal', 'slow']) {
            const d = this.editDelta(proj.genre, k);
            h += '<span class="btn small' + (ed.edit === k ? ' gold' : '') + '" data-act="rel:edit:' + proj.id + ':' + k + '" title="' +
                UIx.esc((this.EDIT_FIT[k] || []).map((g) => (MovieData.GENRES[g] || {}).ru).join(', ')) + '">' +
                this.EDIT_RU[k] + (d > 0 ? ' +' + d : d < 0 ? ' ' + d : '') + '</span>';
        }
        h += '</div><div class="meta hint">Темп монтажа читается по жанру: ' +
            UIx.esc((this.EDIT_FIT.fast.indexOf(proj.genre) >= 0 ? 'этот фильм режут быстро' : this.EDIT_FIT.slow.indexOf(proj.genre) >= 0 ? 'этот фильм любит тишину и длину' : 'этому фильму идёт ровный темп')) +
            '. Сейчас: ' + (fq.edit > 0 ? '+' : '') + fq.edit + ' к качеству.</div>';

        // The score.
        h += '<div class="h2">🎼 Музыка</div><div class="row tight">';
        const own = (MovieData.GENRES[proj.genre] || {}).music;
        const musicChoices = [];
        for (const mk of [own, 'studio', 'drama', 'action', 'romance', 'horror', 'scifi', 'comedy', 'western']) {
            if (musicChoices.indexOf(mk) < 0) musicChoices.push(mk);
        }
        for (const mk of musicChoices) {
            const d = this.musicDelta(proj.genre, mk);
            h += '<span class="btn small' + (ed.music === mk ? ' gold' : '') + '" data-act="rel:music:' + proj.id + ':' + mk + '">' +
                (mk === own ? '🎼 ' : mk === 'studio' ? '🎹 ' : '♪ ') + mk + (d > 0 ? ' +' + d : d < 0 ? ' ' + d : '') + '</span>';
        }
        h += '</div><div class="meta hint">Родная музыка жанра льстит картине, чужая слышна в каждой рецензии.</div>';

        // Marketing.
        h += '<div class="h2">📣 Кампания</div><div class="panel" style="padding:12px">' +
            '<label class="fld">Бюджет кампании: <b>' + UIx.money(ed.marketing) + '</b> (' + Math.round(plan.mFrac * 100) + '% сметы)</label>' +
            '<input type="range" min="0" max="' + Math.round(proj.budget * c.marketingMax) + '" step="10000" value="' + ed.marketing + '" data-act="rel:marketing" style="width:100%">' +
            '<div class="meta">Старт: ' + UIx.money(plan.opening) + (plan.capped ? ' <span class="bad">(упор в экраны: ' + plan.screens + ')</span>' : '') +
            ' · экранов ' + plan.screens + ' · мода жанра ' + plan.heat.toFixed(1) + ' · сезон ×' + plan.season.toFixed(2) +
            ' · звёзды +' + plan.stars + '★</div></div>';
        h += '</div>';

        // The projection column.
        h += '<div class="col"><div class="h2">🔮 Прогноз премьеры</div><div class="panel" style="padding:12px">' +
            '<div class="row tight"><span class="tag gold big">итог ' + fq.quality.toFixed(1) + '/10</span></div>' +
            '<div class="meta" style="margin-top:6px">материал ' + fq.base.toFixed(1) +
            ' · монтаж ' + (fq.edit > 0 ? '+' : '') + fq.edit +
            ' · музыка ' + (fq.music > 0 ? '+' : '') + fq.music + '</div>' +
            '<div class="meta">Критики ждут ~' + Math.max(0.3, Math.min(10, fq.quality)).toFixed(1) + '/10, зрители ~' +
            Math.round(Math.max(5, Math.min(100, fq.quality * 8 + this.leadStars(s, proj).avg * c.audienceStar))) + '%.</div>' +
            '<div class="meta hint">Касса за ' + c.runWeeks + ' недель проката decay-ит по слову зрителей: любовь держит экраны, ненависть топит.</div>' +
            '</div>' +
            '<div class="h2">🎞 Материал</div><div class="row tight">' +
            '<span class="btn small" data-act="prod:cut:' + proj.id + '">Смотреть черновик</span>' +
            '<span class="btn small" data-act="prod:open:' + proj.id + '">К съёмочному листу</span></div>' +
            '<div class="row" style="margin-top:14px"><span class="sp"></span>' +
            '<span class="btn gold big" data-act="rel:premiere:' + proj.id + '">🎬 Премьера · ' + UIx.money(ed.marketing) + '</span></div>' +
            '</div></div></div>';
        return h;
    },

    reviewsScreen(game) {
        const s = StudioManager.state;
        const UIx = StudioUI;
        let h = '<div class="sc"><h1 class="title">КАССА И КРИТИКА<span class="sub">фильмография студии: сборы, рецензии, награды</span></h1>';
        const list = (s.released || []).slice().reverse();
        if (!list.length) {
            h += '<p class="hint">Премьер ещё не было. Доведите картину до монтажной и выпустите её.</p>';
        }
        for (const m of list) {
            const G = MovieData.GENRES[m.genre] || {};
            const badge = m.state === 'run' ? '<span class="tag blue">в прокате, нед. ' + m.takes.length + '</span>' : '<span class="tag">прокат завершён</span>';
            h += '<div class="card" style="cursor:default"><div class="row" style="align-items:flex-start">' +
                '<div class="poster ' + m.genre + '"><div class="p-emoji">' + (G.emoji || '🎬') + '</div>' +
                '<div class="p-score">' + m.score.toFixed(1) + '</div><div class="p-title">' + UIx.esc(m.title) + '</div></div>' +
                '<div style="flex:1;min-width:220px">' +
                '<div class="row tight"><span class="name">«' + UIx.esc(m.title) + '»</span><span class="tag">' + (G.ru || '') + '</span>' +
                '<span class="tag">' + m.year + '</span>' + badge +
                (m.awards && m.awards.length ? '<span class="tag gold">🏆 ' + m.awards.length + '</span>' : '') + '</div>' +
                '<div class="meta">Касса ' + UIx.money(m.boxOffice) + ' · зрители ' + m.audience + '% · экранов ' + m.screens +
                ' · маркетинг ' + UIx.money(m.marketing) + ' · монтаж ' + this.EDIT_RU[m.edit] + ' · музыка ' + m.music + '</div>' +
                (m.profit != null ? '<div class="meta ' + (m.profit >= 0 ? 'good' : 'bad') + '">' +
                    (m.profit >= 0 ? 'Прибыль ' : 'Убыток ') + UIx.money(Math.abs(m.profit)) + '</div>' : '') +
                // The weekly gross as a bar chart of plain divs.
                '<div class="row tight" style="margin-top:6px;align-items:flex-end;height:44px">' +
                (m.takes || []).map((t) => {
                    const max = Math.max.apply(null, m.takes.concat([1]));
                    const hh = Math.max(3, Math.round(t / max * 42));
                    return '<span title="' + UIx.money(t) + '" style="display:inline-block;width:14px;height:' + hh + 'px;background:#c8a24a88;border-radius:2px"></span>';
                }).join('') + '</div>' +
                '<div class="meta hint" style="margin-top:6px">недельные сборы студии (доля ' + Math.round(this.cfg().share * 100) + '%)</div>' +
                '</div><div style="flex:1;min-width:240px">' +
                (m.reviews || []).map((rv) => '<div class="dlg" style="margin:5px 0"><span class="tag gold" style="margin-right:8px">' + rv.score.toFixed(1) + '/10</span>' + UIx.esc(rv.text) + '</div>').join('') +
                (m.awards || []).map((a) => '<div class="meta gold">🏆 ' + UIx.esc(a) + '</div>').join('') +
                '<div class="row tight" style="margin-top:8px"><span class="btn small" data-act="watch:' + m.id + '">▶ Смотреть фильм</span></div>' +
                '</div></div></div>';
        }
        h += '<div class="row" style="margin-top:12px"><span class="btn" data-act="nav:cinema">← Кинотеатр</span>' +
            '<span class="btn" data-act="nav:studio">На студию</span></div></div>';
        return h;
    },

    // --- the dispatcher -------------------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        const S = StudioManager, s = S.state;
        const parts = String(act).split(':');
        if (parts[0] !== 'rel') return false;
        game.uiState = game.uiState || {};

        if (act === 'change:rel:marketing') {
            const proj = this._proj(s, game.uiState.postOpen || (game.uiState.postProj || ''));
            const ed = proj && game.uiState.postEdit ? game.uiState.postEdit[proj.id] : null;
            if (ed) ed.marketing = Math.max(0, Math.round(Number(el && el.value) || 0));
            game.showScreen('post');
            return true;
        }
        if (parts[1] === 'list') { game.showScreen('reviews'); return true; }
        if (parts[1] === 'open') { game.uiState.postOpen = parts[2]; game.showScreen('post'); return true; }

        const proj = this._proj(s, parts[2]);
        if (!proj) return true;
        game.uiState.postEdit = game.uiState.postEdit || {};
        const ed = game.uiState.postEdit[proj.id] = game.uiState.postEdit[proj.id] ||
            { edit: 'normal', music: (MovieData.GENRES[proj.genre] || {}).music, marketing: Math.round(proj.budget * 0.3) };

        if (parts[1] === 'edit') { ed.edit = this.EDIT_RU[parts[3]] ? parts[3] : ed.edit; game.showScreen('post'); return true; }
        if (parts[1] === 'music') { ed.music = parts[3] || ed.music; game.showScreen('post'); return true; }
        if (parts[1] === 'marketing') { ed.marketing = Math.max(0, Math.round(Number(parts[3]) || 0)); game.showScreen('post'); return true; }
        if (parts[1] === 'premiere') {
            const res = this.premiere(s, S, proj, ed);
            if (!res.ok) { game.toast(res.why); return true; }
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.applause, { volume: 0.6 });
            game.toast('🎬 Премьера «' + res.movie.title + '»: ' + res.movie.screens + ' экранов, старт ' +
                StudioUI_money(res.movie.opening || res.plan.opening) + '. Критики уже пишут…');
            game.showScreen('reviews');
            return true;
        }
        return true;
    },
};

/** Prize money of the ceremony lands in the studio's ledger. */
function mgrEarn(state, amount) {
    if (typeof StudioManager !== 'undefined' && StudioManager.earn) StudioManager.earn(amount, 'Премия «Золотой Кадр»');
}
