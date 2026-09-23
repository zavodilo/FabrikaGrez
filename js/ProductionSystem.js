// ProductionSystem.js — the shooting floor (Phase Г). A cast script becomes a project:
// scenes are shot week by week in order, each with an honest quality roll (script + director
// + the leads' genre skill + the studio's sets + cast mood + pace + luck), the budget burns
// and can be overspent, incidents happen to productions the way they happen to productions,
// and every SHOT scene can be watched in the cinema as dailies — the player sees the film
// growing before the release.
//
// Pure logic on Rng: no DOM, no pc.*. Screens are HTML for the 'screen' UI elements (skill ui);
// clicks arrive as data-act="prod:…" through StudioUI.onAction. StudioManager.tickWeek calls
// weekly() behind a typeof-guard, StudioUI routes the 'production' screen here.
//
//   ProductionSystem.start(state, mgr, script)      -> { ok, project } | { ok:false, why }
//   ProductionSystem.weekly(state, mgr)             -> toasts[]
//   ProductionSystem.projectedQuality(state, proj)  -> 0..10 (explainable)
//   ProductionSystem.roughCut(state, proj)          -> MovieSequencer timeline of shot scenes

/** @satisfies {Record<string, any>} */
const ProductionSystem = {

    PACES: {
        cheap: { ru: 'Экономно', scenes: 'PROD_PACE_CHEAP_SCENES', cost: 'PROD_PACE_CHEAP_COST', q: 'PROD_PACE_CHEAP_Q', mul: 'PROD_INCIDENT_CHEAP_MUL', hint: '1 сцена/нед, −35% расходов, качество страдает' },
        std: { ru: 'Стандарт', scenes: 'PROD_PACE_STD_SCENES', cost: 'PROD_PACE_STD_COST', q: 'PROD_PACE_STD_Q', mul: null, hint: '2 сцены/нед, ровные расходы' },
        rich: { ru: 'С размахом', scenes: 'PROD_PACE_RICH_SCENES', cost: 'PROD_PACE_RICH_COST', q: 'PROD_PACE_RICH_Q', mul: 'PROD_INCIDENT_RICH_MUL', hint: '2 сцены/нед, +50% расходов, дубли и свет' },
    },

    cfg() {
        const U = 'undefined';
        return {
            scenesPerWeek: typeof SHOOT_SCENES_PER_WEEK !== U ? SHOOT_SCENES_PER_WEEK : 2,
            qBase: typeof SHOOT_QUALITY_BASE !== U ? SHOOT_QUALITY_BASE : 2.5,
            qDirector: typeof SHOOT_DIRECTOR_BONUS !== U ? SHOOT_DIRECTOR_BONUS : 0.3,
            qActor: typeof SHOOT_ACTOR_BONUS !== U ? SHOOT_ACTOR_BONUS : 0.3,
            qSet: typeof SHOOT_SET_BONUS !== U ? SHOOT_SET_BONUS : 1.2,
            qSpread: typeof SHOOT_RANDOM_SPREAD !== U ? SHOOT_RANDOM_SPREAD : 1.4,
            incident: typeof PROD_INCIDENT_CHANCE !== U ? PROD_INCIDENT_CHANCE : 0.22,
            overQ: typeof PROD_OVERSPEND_Q !== U ? PROD_OVERSPEND_Q : 0.4,
            moodQ: typeof PROD_MOOD_Q !== U ? PROD_MOOD_Q : 0.02,
            setLevel: typeof PROD_SET_LEVEL_BONUS !== U ? PROD_SET_LEVEL_BONUS : 0.5,
            upgradeFrac: typeof PROD_UPGRADE_FRAC !== U ? PROD_UPGRADE_FRAC : 0.6,
            maxLevel: typeof PROD_MAX_LEVEL !== U ? PROD_MAX_LEVEL : 3,
            wScript: typeof PROD_SCRIPT_WEIGHT !== U ? PROD_SCRIPT_WEIGHT : 0.35,
            wShot: typeof PROD_SHOT_WEIGHT !== U ? PROD_SHOT_WEIGHT : 0.5,
            wChem: typeof PROD_CHEM_WEIGHT !== U ? PROD_CHEM_WEIGHT : 0.15,
        };
    },

    /** The pace record resolved against Constants.js. The constant NAMES live in PACES so the
     *  editor schema can point at them, but the values are read by direct typeof-guarded
     *  reference: they are classic top-level `const`s, i.e. lexical globals, never window props. */
    pace(paceKey) {
        const U = 'undefined';
        const k = paceKey === 'cheap' ? 'CHEAP' : paceKey === 'rich' ? 'RICH' : 'STD';
        const scenes = k === 'CHEAP' ? (typeof PROD_PACE_CHEAP_SCENES !== U ? PROD_PACE_CHEAP_SCENES : 1)
            : k === 'RICH' ? (typeof PROD_PACE_RICH_SCENES !== U ? PROD_PACE_RICH_SCENES : 2)
                : (typeof PROD_PACE_STD_SCENES !== U ? PROD_PACE_STD_SCENES : 2);
        const cost = k === 'CHEAP' ? (typeof PROD_PACE_CHEAP_COST !== U ? PROD_PACE_CHEAP_COST : 0.65)
            : k === 'RICH' ? (typeof PROD_PACE_RICH_COST !== U ? PROD_PACE_RICH_COST : 1.5)
                : (typeof PROD_PACE_STD_COST !== U ? PROD_PACE_STD_COST : 1);
        const q = k === 'CHEAP' ? (typeof PROD_PACE_CHEAP_Q !== U ? PROD_PACE_CHEAP_Q : -0.6)
            : k === 'RICH' ? (typeof PROD_PACE_RICH_Q !== U ? PROD_PACE_RICH_Q : 0.7)
                : (typeof PROD_PACE_STD_Q !== U ? PROD_PACE_STD_Q : 0);
        const mul = k === 'CHEAP' ? (typeof PROD_INCIDENT_CHEAP_MUL !== U ? PROD_INCIDENT_CHEAP_MUL : 1.35)
            : k === 'RICH' ? (typeof PROD_INCIDENT_RICH_MUL !== U ? PROD_INCIDENT_RICH_MUL : 0.8) : 1;
        const P = this.PACES[paceKey] || this.PACES.std;
        return { key: paceKey, ru: P.ru, hint: P.hint, scenes: scenes, cost: cost, q: q, incidentMul: mul };
    },

    // --- people of a project ------------------------------------------------------------------

    person(state, id) {
        return (state.roster || []).concat(state.staff || []).find((p) => p.id === id) || null;
    },

    directorOf(state, proj) {
        return this.person(state, proj.directorId);
    },

    castPeople(state, proj) {
        const out = [];
        const cast = proj.cast || {};
        for (const k of Object.keys(cast)) {
            const p = this.person(state, cast[k]);
            if (p) out.push({ key: k, person: p });
        }
        return out;
    },

    leads(state, proj, script) {
        const leadKeys = (script.roles || []).filter((r) => r.tier === 'lead').map((r) => r.key);
        return this.castPeople(state, proj).filter((c) => leadKeys.indexOf(c.key) >= 0).map((c) => c.person);
    },

    /** Is this person on a shooting floor right now? (StudioUI refuses to fire them.) */
    personBusy(state, person) {
        for (const pr of state.projects || []) {
            if (pr.state !== 'shooting') continue;
            if (pr.directorId === person.id || pr.writerId === person.id) return pr;
            const cast = pr.cast || {};
            for (const k of Object.keys(cast)) if (cast[k] === person.id) return pr;
        }
        return null;
    },

    // --- money ----------------------------------------------------------------------------------

    /** The even weekly spread of the budget at the project's pace. */
    weeklyCost(proj) {
        const pace = this.pace(proj.pace);
        const planned = Math.max(1, Math.ceil((proj.sceneCount || 1) / (this.cfg().scenesPerWeek || 2)));
        return Math.round((proj.budget / planned) * pace.cost);
    },

    upgradeCost(state, setId) {
        const info = (MovieData.SET_INFO || {})[setId];
        const owned = (state.ownedSets || {})[setId];
        if (!info || !owned) return null;
        if (owned.level >= this.cfg().maxLevel) return null;
        return Math.round(info.cost * this.cfg().upgradeFrac * owned.level);
    },

    // --- starting -------------------------------------------------------------------------------

    /** Put a cast script on the shooting floor. */
    start(state, mgr, script) {
        if (!script) return { ok: false, why: 'Нет такого сценария.' };
        if (!script.timeline) return { ok: false, why: 'Сначала соберите каст: без каста нет фильма.' };
        if ((state.projects || []).some((p) => p.scriptId === script.id && p.state !== 'shelf')) {
            return { ok: false, why: '«' + script.title + '» уже в производстве.' };
        }
        if ((state.projects || []).filter((p) => p.state === 'shooting').length >= 2) {
            return { ok: false, why: 'Две съёмочные группы сразу студия не тянет.' };
        }
        const directors = (state.staff || []).filter((p) => p.role === 'director' && !this.personBusy(state, p));
        if (!directors.length) return { ok: false, why: 'Нет свободного режиссёра в штате.' };
        const G = (MovieData.GENRES[script.genre] || {});
        directors.sort((a, b) => (b.skills[G.skill] || 0) - (a.skills[G.skill] || 0));
        const director = directors[0];

        /** @type {any} */
        const proj = {
            id: 'pr' + (state.weekIdx + 1) + '-' + (state.projects || []).length,
            scriptId: script.id,
            title: script.title,
            genre: script.genre,
            year: state.year,
            budget: script.budget,
            spent: 0,
            pace: 'std',
            state: 'shooting',
            weekStarted: state.weekIdx,
            weeksShot: 0,
            overWeeks: 0,
            delay: 0,
            nextScene: 0,
            sceneCount: (script.timeline.scenes || []).length,
            scenesShot: [],
            incidents: [],
            cast: Object.assign({}, script.cast),
            directorId: director.id,
            writerId: script.writerId || '',
            quality: script.quality,
        };
        state.projects = state.projects || [];
        state.projects.push(proj);
        script.state = 'shooting';
        // The cast and the director are committed to the floor.
        for (const c of this.castPeople(state, proj)) c.person.busyUntilWeek = state.weekIdx + 1;
        director.busyUntilWeek = state.weekIdx + 1;
        mgr.pushNews('«' + proj.title + '» — мотор! Режиссёр ' + director.name + ', бюджет ' +
            StudioUI_money(proj.budget) + ', сцен: ' + proj.sceneCount + '.', 'good');
        return { ok: true, project: proj };
    },

    // --- the quality of a shot scene --------------------------------------------------------------

    /**
     * One take's worth: base + director + the leads' genre skill + the studio's set for this
     * scene + cast mood + pace + luck. Everything is a named constant, so the number can be
     * explained to the player line by line.
     */
    rollSceneQuality(state, proj, script, scene, r) {
        const c = this.cfg();
        const G = (MovieData.GENRES[script.genre] || {});
        const director = this.directorOf(state, proj);
        const dSkill = director ? (director.skills[G.skill] || 0) : 0;
        // The actors THIS scene actually uses carry its take quality.
        const castMap = {};
        for (const c of this.castPeople(state, proj)) castMap[c.key] = c.person;
        const here = (scene.roles || []).map((k) => castMap[k]).filter(Boolean);
        let aSkill = 0;
        if (here.length) {
            let sum = 0;
            for (const p of here) sum += p.skills[G.skill] || 0;
            aSkill = sum / here.length;
        }
        const owned = (state.ownedSets || {})[scene.set];
        const setQ = owned ? c.qSet * (1 + c.setLevel * ((owned.level || 1) - 1)) : 0;
        const cast = this.castPeople(state, proj).map((x) => x.person);
        let mood = 60;
        if (cast.length) { let s = 0; for (const p of cast) s += p.mood || 60; mood = s / cast.length; }
        const moodQ = (mood - 60) * c.moodQ;
        const pace = this.pace(proj.pace);
        const over = proj.spent > proj.budget ? -c.overQ : 0;
        const luck = r.gauss() * c.qSpread;
        const q = c.qBase + dSkill * c.qDirector + aSkill * c.qActor + setQ + moodQ + pace.q + over + luck;
        return {
            quality: Math.round(Math.max(0.3, Math.min(10, q)) * 100) / 100,
            parts: {
                base: c.qBase, director: Math.round(dSkill * c.qDirector * 100) / 100,
                actors: Math.round(aSkill * c.qActor * 100) / 100, set: Math.round(setQ * 100) / 100,
                mood: Math.round(moodQ * 100) / 100, pace: pace.q, over: over,
                luck: Math.round(luck * 100) / 100,
            },
            hadSet: !!owned,
        };
    },

    /** The picture so far: script, shot scenes and the cast chemistry, weighted and explainable. */
    projectedQuality(state, proj) {
        const c = this.cfg();
        const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
        const chem = script && script.chemistry != null ? script.chemistry : 0;
        const chemQ = 5 + chem * 5;
        let shot = null;
        if (proj.scenesShot.length) {
            let s = 0;
            for (const sc of proj.scenesShot) s += sc.quality;
            shot = s / proj.scenesShot.length;
        }
        const wShot = shot == null ? 0 : c.wShot;
        const wChem = shot == null ? c.wChem + c.wShot * 0.5 : c.wChem;
        const wScript = 1 - wShot - wChem;
        const q = wScript * (script ? script.quality : 5) + wShot * (shot || 0) + wChem * chemQ;
        return {
            quality: Math.round(Math.max(0.3, Math.min(10, q)) * 100) / 100,
            shot: shot, chem: chem, chemQ: Math.round(chemQ * 100) / 100,
            weights: { script: Math.round(wScript * 100) / 100, shot: Math.round(wShot * 100) / 100, chem: Math.round(wChem * 100) / 100 },
        };
    },

    // --- incidents ----------------------------------------------------------------------------------

    INCIDENTS: [
        {
            id: 'injury', ru: 'Травма на площадке', w: 3,
            run(S, state, proj, r, mgr) {
                const cast = S.castPeople(state, proj);
                if (!cast.length) return null;
                const p = r.pick(cast).person;
                p.mood = Math.max(5, p.mood - 20);
                p.busyUntilWeek = state.weekIdx + 2;
                proj.delay += 1;
                mgr.pay(Math.round(proj.budget * 0.02), 'Врач и простой: ' + p.name);
                return { toast: '🤕 ' + p.name + ' травмирован(а) на трюке: неделя простоя, −настроение.', kind: 'bad' };
            },
        },
        {
            id: 'tantrum', ru: 'Каприз звезды', w: 3,
            run(S, state, proj, r, mgr) {
                const stars = S.castPeople(state, proj).filter((c) => (c.person.star || 0) >= 2);
                const pool = stars.length ? stars : S.castPeople(state, proj);
                if (!pool.length) return null;
                const p = r.pick(pool).person;
                const demand = Math.round((p.salary || 1000) * 6);
                if (mgr.canAfford(demand)) {
                    mgr.pay(demand, 'Каприз: ' + p.name);
                    p.mood = Math.min(100, p.mood + 15);
                    return { toast: '💅 ' + p.name + ' требует трейлер получше. Оплачено (' + StudioUI_money(demand) + '), настроение выросло.', kind: '' };
                }
                p.mood = Math.max(5, p.mood - 25);
                proj.qualityPenalty = (proj.qualityPenalty || 0) + 0.4;
                return { toast: '💢 ' + p.name + ' не получил(а) трейлер: настроение и дубли вниз.', kind: 'bad' };
            },
        },
        {
            id: 'weather', ru: 'Плохая погода', w: 3,
            run(S, state, proj, r, mgr) {
                const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
                const sc = script && script.timeline ? script.timeline.scenes[proj.nextScene] : null;
                const outdoor = sc && MovieData.SET_INFO[sc.set] && !MovieData.SET_INFO[sc.set].indoor;
                if (!outdoor) return null;
                proj.delay += 1;
                return { toast: '🌧 Дождь сорвал смену на открытой площадке («' + (MovieData.SET_INFO[sc.set] || {}).ru + '»): неделя простоя.', kind: 'bad' };
            },
        },
        {
            id: 'prop', ru: 'Поломка реквизита', w: 3,
            run(S, state, proj, r, mgr) {
                const cost = Math.round(proj.budget * 0.015) + 2000;
                mgr.pay(cost, 'Ремонт реквизита');
                return { toast: '🔧 Реквизит разбит в дубле: ремонт ' + StudioUI_money(cost) + '.', kind: '' };
            },
        },
        {
            id: 'press', ru: 'Пресса на площадке', w: 2,
            run(S, state, proj, r, mgr) {
                state.fans = Math.min(100, state.fans + 1.5);
                return { toast: '📸 Фотограф поймал удачный кадр со съёмок: +поклонники.', kind: 'good' };
            },
        },
        {
            id: 'bond', ru: 'Группа сработалась', w: 2,
            run(S, state, proj, r, mgr) {
                for (const c of S.castPeople(state, proj)) c.person.mood = Math.min(100, c.person.mood + 8);
                const dir = S.directorOf(state, proj);
                if (dir) dir.mood = Math.min(100, dir.mood + 8);
                return { toast: '🎉 После смены группа поёт в дайнерe: настроение всей площадки вверх.', kind: 'good' };
            },
        },
    ],

    _incident(state, proj, r, mgr) {
        const c = this.cfg();
        const pace = this.pace(proj.pace);
        const cast = this.castPeople(state, proj).map((x) => x.person);
        let rel = 7;
        if (cast.length) { let s = 0; for (const p of cast) s += p.reliability || 7; rel = s / cast.length; }
        const chance = c.incident * pace.incidentMul * (1 - (rel - 7) * 0.05);
        if (!r.chance(Math.max(0.03, chance))) return null;
        const pool = this.INCIDENTS.map((i) => i);
        const picked = r.weighted(pool, pool.map((i) => i.w));
        const res = picked.run(this, state, proj, r, mgr);
        if (!res) return null;
        proj.incidents.push({ week: state.weekIdx, id: picked.id, ru: picked.ru, text: res.toast });
        return { toast: res.toast, kind: res.kind, id: picked.id, ru: picked.ru };
    },

    // --- the week -------------------------------------------------------------------------------------

    weekly(state, mgr) {
        const out = [];
        for (const proj of (state.projects || [])) {
            if (proj.state !== 'shooting') continue;
            const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
            if (!script || !script.timeline) { proj.state = 'shelf'; continue; }
            const scenes = script.timeline.scenes || [];
            const r = Rng.create(((state.seed ^ Math.imul(state.weekIdx + 1, 2654435761) ^ Rng.hash(proj.id)) >>> 0) || 1);

            // Money first: the floor costs whether or not a take lands.
            const cost = this.weeklyCost(proj);
            mgr.pay(cost, 'Съёмки: «' + proj.title + '»');
            proj.spent += cost;
            if (proj.spent > proj.budget && proj.overWeeks === 0) {
                out.push('💸 «' + proj.title + '»: бюджет исчерпан, начался перерасход — качество тает.');
                mgr.pushNews('«' + proj.title + '»: смета превышена на ' + StudioUI_money(proj.spent - proj.budget) + '.', 'bad');
            }
            if (proj.spent > proj.budget) proj.overWeeks++;
            proj.weeksShot++;

            // A delay week buys nothing but calendar.
            if (proj.delay > 0) {
                proj.delay--;
                out.push('⏸ «' + proj.title + '»: простой, съёмки стоят (' + (proj.delay + 1) + ' нед. осталось).');
                continue;
            }

            // Shoot the pace's worth of scenes, in order.
            const pace = this.pace(proj.pace);
            for (let i = 0; i < pace.scenes && proj.nextScene < scenes.length; i++) {
                const scene = scenes[proj.nextScene];
                const roll = this.rollSceneQuality(state, proj, script, scene, r);
                proj.scenesShot.push({
                    idx: proj.nextScene, label: scene.label, set: scene.set,
                    quality: roll.quality, parts: roll.parts, hadSet: roll.hadSet, week: state.weekIdx,
                });
                proj.nextScene++;
                // The people on the floor grow a little with every wrapped scene.
                for (const c of this.castPeople(state, proj)) {
                    c.person.exp = (c.person.exp || 0) + 1;
                    c.person.mood = Math.max(5, Math.min(100, c.person.mood + (roll.quality >= 7 ? 1 : -1)));
                }
            }
            const lastShot = proj.scenesShot[proj.scenesShot.length - 1];
            if (lastShot && lastShot.week === state.weekIdx) {
                out.push('🎬 «' + proj.title + '»: снята сцена ' + proj.nextScene + '/' + scenes.length +
                    ' («' + (lastShot.label || '').replace(/^Сцена \d+\. /, '') + '») — качество ' + lastShot.quality.toFixed(1));
            }

            // Incidents happen to productions.
            const inc = this._incident(state, proj, r, mgr);
            if (inc) { out.push(inc.toast); mgr.pushNews('«' + proj.title + '»: ' + inc.ru.toLowerCase() + '.', inc.kind); }

            // Wrapped?
            if (proj.nextScene >= scenes.length) {
                proj.state = 'post';
                for (const c of this.castPeople(state, proj)) c.person.busyUntilWeek = 0;
                const dir = this.directorOf(state, proj);
                if (dir) dir.busyUntilWeek = 0;
                const pq = this.projectedQuality(state, proj);
                out.push('🏁 «' + proj.title + '»: съёмки завершены за ' + proj.weeksShot + ' нед. Материал в монтажной, прогноз ' + pq.quality.toFixed(1) + '/10.');
                mgr.pushNews('«' + proj.title + '»: съёмочный период завершён (' + proj.scenesShot.length + ' сцен, ' +
                    StudioUI_money(proj.spent) + ' потрачено).', 'good');
            }
        }
        return out;
    },

    /** Stop shooting early and take what there is to post. */
    wrap(state, mgr, proj) {
        if (proj.state !== 'shooting') return { ok: false, why: 'Этот проект не снимается.' };
        if (!proj.scenesShot.length) return { ok: false, why: 'Нельзя сдать в монтаж пустую картину.' };
        proj.state = 'post';
        proj.wrappedEarly = true;
        for (const c of this.castPeople(state, proj)) c.person.busyUntilWeek = 0;
        const dir = this.directorOf(state, proj);
        if (dir) dir.busyUntilWeek = 0;
        mgr.pushNews('«' + proj.title + '»: съёмки свёрнуты досрочно, в монтажной ' + proj.scenesShot.length + ' сцен.', '');
        return { ok: true };
    },

    // --- watching what was shot ------------------------------------------------------------------------

    /** A timeline of only the shot scenes: the rough cut. */
    roughCut(state, proj) {
        const script = (state.scripts || []).find((x) => x.id === proj.scriptId);
        if (!script || !script.timeline) return null;
        const shotIdx = {};
        for (const sc of proj.scenesShot) shotIdx[sc.idx] = true;
        const scenes = (script.timeline.scenes || []).filter((sc, i) => shotIdx[i]);
        if (!scenes.length) return null;
        const tl = Object.assign({}, script.timeline, { scenes: scenes });
        tl.title = script.title + ' (черновой монтаж)';
        return tl;
    },

    // --- sets as assets ----------------------------------------------------------------------------------

    upgradeSet(state, mgr, setId) {
        const cost = this.upgradeCost(state, setId);
        if (cost == null) return { ok: false, why: 'Эту декорацию нельзя улучшить (нет её или максимум).' };
        if (!mgr.canAfford(cost)) return { ok: false, why: 'Нужно ' + StudioUI_money(cost) + ' на перестройку.' };
        mgr.pay(cost, 'Перестройка декорации: ' + ((MovieData.SET_INFO[setId] || {}).ru || setId));
        state.ownedSets[setId].level = (state.ownedSets[setId].level || 1) + 1;
        mgr.pushNews('Декорация «' + (MovieData.SET_INFO[setId] || {}).ru + '» перестроена: уровень ' +
            state.ownedSets[setId].level + '.', 'good');
        return { ok: true, level: state.ownedSets[setId].level };
    },

    // --- the screens ----------------------------------------------------------------------------------------

    _bar(value, cls) { return StudioUI.bar(value, cls); },

    briefList(state) {
        let h = '';
        for (const p of (state.projects || [])) {
            if (p.state === 'shelf') continue;
            const badge = p.state === 'shooting' ? '<span class="tag blue">съёмки</span>'
                : p.state === 'post' ? '<span class="tag gold">монтаж</span>'
                    : p.state === 'released' ? '<span class="tag green">прокат</span>' : '<span class="tag">полка</span>';
            h += '<div class="card" data-act="prod:open:' + p.id + '" style="cursor:pointer"><div class="row tight">' +
                '<b>«' + StudioUI.esc(p.title) + '»</b>' + badge +
                '<span class="tag">сцен ' + p.scenesShot.length + '/' + p.sceneCount + '</span>' +
                '<span class="sp"></span><span class="tag ' + (p.spent > p.budget ? 'red' : '') + '">' +
                StudioUI.money(p.spent) + ' / ' + StudioUI.money(p.budget) + '</span></div></div>';
        }
        return h || '<p class="hint">Производств нет. Соберите каст по готовому сценарию и нажмите «В производство».</p>';
    },

    filmsScreen(state) {
        let h = '';
        for (const p of (state.projects || [])) {
            const badge = p.state === 'shooting' ? '<span class="tag blue">съёмки · нед. ' + p.weeksShot + '</span>'
                : p.state === 'post' ? '<span class="tag gold">ждёт монтажа</span>'
                    : p.state === 'released' ? '<span class="tag green">в прокате</span>' : '<span class="tag">полка</span>';
            const pq = this.projectedQuality(state, p);
            h += '<div class="card" data-act="prod:open:' + p.id + '" style="cursor:pointer">' +
                '<div class="row tight"><b>«' + StudioUI.esc(p.title) + '»</b>' + badge +
                '<span class="tag">' + this.pace(p.pace).ru + '</span>' +
                '<span class="sp"></span><span class="tag gold">прогноз ' + pq.quality.toFixed(1) + '</span></div>' +
                '<div class="meta">Сцены: ' + p.scenesShot.length + '/' + p.sceneCount +
                (p.delay ? ' · простой ' + p.delay + ' нед.' : '') +
                (p.spent > p.budget ? ' · <span class="bad">перерасход ' + StudioUI.money(p.spent - p.budget) + '</span>' : '') +
                (p.incidents.length ? ' · инцидентов: ' + p.incidents.length : '') + '</div></div>';
        }
        return h;
    },

    screen(game) {
        const s = StudioManager.state;
        const UIx = StudioUI;
        game.uiState = game.uiState || {};
        const list = (s.projects || []).filter((p) => p.state !== 'shelf');
        let proj = list.find((p) => p.id === game.uiState.prodOpen) || list[0] || null;
        if (!proj) {
            return '<div class="sc"><h1 class="title">ПРОИЗВОДСТВО</h1>' +
                '<p class="lead">Здесь снимают кино: недели смен, броски качества дублей, инциденты и дневники съёмок.</p>' +
                '<p class="hint">Производств пока нет. Закажите сценарий, соберите каст — и нажмите «В производство» на экране «Фильмы».</p>' +
                '<div class="row" style="margin-top:14px"><span class="btn" data-act="nav:films">← К фильмам</span>' +
                '<span class="btn gold" data-act="newmovie">🎥 Новый фильм</span></div></div>';
        }
        const script = (s.scripts || []).find((x) => x.id === proj.scriptId);
        const pq = this.projectedQuality(s, proj);
        const director = this.directorOf(s, proj);
        const budgetFrac = Math.max(0, Math.min(1, proj.spent / (proj.budget || 1)));

        // Header.
        let h = '<div class="sc"><h1 class="title">«' + UIx.esc(proj.title).toUpperCase() + '»' +
            '<span class="sub">' + ((MovieData.GENRES[proj.genre] || {}).emoji || '') + ' ' +
            ((MovieData.GENRES[proj.genre] || {}).ru || '') + ' · режиссёр ' + UIx.esc(director ? director.name : '—') +
            ' · ' + (proj.state === 'shooting' ? 'съёмочная неделя ' + proj.weeksShot : 'монтажный период') + '</span></h1>';
        h += '<div class="panel" style="padding:12px"><div class="row tight">' +
            '<span class="tag gold big">прогноз ' + pq.quality.toFixed(1) + '/10</span>' +
            '<span class="tag">сценарий ' + (script ? script.quality.toFixed(1) : '—') + ' (' + Math.round(pq.weights.script * 100) + '%)</span>' +
            (pq.shot != null ? '<span class="tag">дубли ' + pq.shot.toFixed(1) + ' (' + Math.round(pq.weights.shot * 100) + '%)</span>' : '') +
            '<span class="tag">химия ' + (pq.chem >= 0 ? '+' : '') + pq.chem.toFixed(2) + ' (' + Math.round(pq.weights.chem * 100) + '%)</span>' +
            '<span class="sp"></span>' +
            '<span class="tag ' + (proj.spent > proj.budget ? 'red' : '') + '">' + UIx.money(proj.spent) + ' / ' + UIx.money(proj.budget) + '</span>' +
            '</div>' +
            '<div class="meta" style="margin-top:6px">' + this._bar(budgetFrac, proj.spent > proj.budget ? 'red' : '') +
            ' бюджет · неделя ' + UIx.money(this.weeklyCost(proj)) + '/нед при темпе «' + this.pace(proj.pace).ru + '»</div>';
        if (proj.state === 'shooting') {
            h += '<div class="row tight" style="margin-top:10px"><span class="hint">Темп съёмок:</span>';
            for (const k of ['cheap', 'std', 'rich']) {
                const P = this.pace(k);
                h += '<span class="btn small' + (proj.pace === k ? ' gold' : '') + '" data-act="prod:pace:' + proj.id + ':' + k + '" title="' + UIx.esc(P.hint) + '">' + P.ru + '</span>';
            }
            h += '<span class="sp"></span>' +
                '<span class="btn small red" data-act="prod:wrap:' + proj.id + '">🏁 Свернуть съёмки</span></div>' +
                '<div class="meta hint" style="margin-top:6px">' + UIx.esc(this.pace(proj.pace).hint) +
                (proj.delay ? ' · <span class="bad">простой: ' + proj.delay + ' нед.</span>' : '') +
                (proj.spent > proj.budget ? ' · <span class="bad">перерасход ' + UIx.money(proj.spent - proj.budget) + ': −' + this.cfg().overQ + ' качества за неделю</span>' : '') +
                '</div>';
        }
        // The rough cut of everything shot so far: the point of dailies is to WATCH the film
        // growing, and in post it is the material the editor will cut (Phase Д).
        h += '<div class="row tight" style="margin-top:10px"><span class="btn small" data-act="prod:cut:' + proj.id + '">🎞 Черновой монтаж (' + proj.scenesShot.length + ' сцен)</span>' +
            (proj.state === 'post' ? '<span class="hint">материал в монтажной: ' + proj.scenesShot.length + ' сцен ждут фазы постпродакшна</span>' : '') +
            '</div>';
        h += '</div>';

        // The shot board: every scene of the script with its take quality or its place in line.
        h += '<div class="cols"><div class="col"><div class="h2">🎬 Съёмочный лист</div>';
        const scenes = script && script.timeline ? script.timeline.scenes : [];
        for (let i = 0; i < scenes.length; i++) {
            const shot = proj.scenesShot.find((x) => x.idx === i);
            const sc = scenes[i];
            const setInfo = (MovieData.SET_INFO[sc.set] || {});
            h += '<div class="card" style="cursor:default"><div class="row tight">' +
                '<span class="hint" style="width:26px">' + (i + 1) + '</span><b>' + UIx.esc(String(sc.label || '').replace(/^Сцена \d+\. /, '')) + '</b>' +
                '<span class="tag">' + UIx.esc(setInfo.ru || sc.set) + (setInfo.indoor ? '' : ' · улица') + '</span>' +
                (shot ? '<span class="tag ' + (shot.quality >= 7 ? 'green' : shot.quality >= 5 ? '' : 'red') + '">дубль ' + shot.quality.toFixed(1) + '</span>' +
                    '<span class="sp"></span><span class="btn small" data-act="prod:dailies:' + proj.id + ':' + i + '">🎞 смотреть</span>'
                    : i === proj.nextScene && proj.state === 'shooting' ? '<span class="tag blue">следующая</span><span class="sp"></span>'
                        : '<span class="sp"></span><span class="hint">в очереди</span>') +
                '</div>' +
                (shot ? '<div class="meta hint">режиссёр +' + shot.parts.director + ' · актёры +' + shot.parts.actors +
                    ' · декорация +' + shot.parts.set + (shot.hadSet ? '' : ' (нет своей!)') +
                    ' · настроение ' + (shot.parts.mood >= 0 ? '+' : '') + shot.parts.mood +
                    ' · удача ' + (shot.parts.luck >= 0 ? '+' : '') + shot.parts.luck + '</div>' : '') +
                '</div>';
        }
        h += '</div>';

        // Incidents and the cast on the floor.
        h += '<div class="col"><div class="h2">⚠ Хроника съёмок</div>';
        if (proj.incidents.length) {
            for (const inc of proj.incidents.slice().reverse()) {
                h += '<div class="news bad">нед. ' + inc.week + ' · ' + UIx.esc(inc.text) + '</div>';
            }
        } else h += '<p class="hint">Пока без происшествий. Это подозрительно.</p>';
        h += '<div class="h2">👥 На площадке</div>';
        const dir = this.directorOf(s, proj);
        if (dir) h += '<div class="row tight" style="padding:3px 0">' + UIx.avatar(dir, 34) + '<span class="name">' + UIx.esc(dir.name) + '</span>' +
            '<span class="tag">режиссёр</span>' + UIx.stars(dir) + '<span class="hint">' + PeopleSystem.moodWord(dir.mood) + '</span></div>';
        for (const c of this.castPeople(s, proj)) {
            const role = script ? (script.roles || []).find((r) => r.key === c.key) : null;
            h += '<div class="row tight" style="padding:3px 0">' + UIx.avatar(c.person, 34) + '<span class="name">' + UIx.esc(c.person.name) + '</span>' +
                '<span class="tag">' + UIx.esc(role ? role.ru : c.key) + '</span>' + UIx.stars(c.person) +
                '<span class="hint">' + PeopleSystem.moodWord(c.person.mood) + '</span></div>';
        }
        h += '<div class="h2">🏗 Декорации-активы</div>';
        for (const id of Object.keys(s.ownedSets || {})) {
            const info = (MovieData.SET_INFO || {})[id] || {};
            const lvl = (s.ownedSets[id] || {}).level || 1;
            const cost = this.upgradeCost(s, id);
            const used = scenes.some((sc) => sc.set === id);
            h += '<div class="row tight" style="padding:3px 0"><b style="flex:1">' + UIx.esc(info.ru || id) + '</b>' +
                '<span class="tag ' + (lvl >= this.cfg().maxLevel ? 'green' : '') + '">ур. ' + lvl + '</span>' +
                (used ? '<span class="tag blue">в этом фильме</span>' : '') +
                (cost != null ? '<span class="btn small' + (StudioManager.canAfford(cost) ? '' : ' off') + '" data-act="prod:upgrade:' + id + '">🏗 ' + UIx.money(cost) + '</span>' : '<span class="hint">максимум</span>') +
                '</div>';
        }
        h += '</div></div>';

        // Other projects as tabs.
        if (list.length > 1) {
            h += '<div class="row tight" style="margin-top:10px">';
            for (const p of list) {
                h += '<span class="btn small' + (p.id === proj.id ? ' gold' : '') + '" data-act="prod:open:' + p.id + '">«' + UIx.esc(p.title) + '»</span>';
            }
            h += '</div>';
        }
        h += '<div class="row" style="margin-top:14px"><span class="btn" data-act="nav:films">← К фильмам</span>' +
            '<span class="btn" data-act="nav:studio">На студию</span><span class="sp"></span>' +
            '<span class="btn gold" data-act="prod:week:' + proj.id + '">Следующая неделя ▶</span></div></div>';
        return h;
    },

    // --- sequels: Phase Ж (мета-игра) ----------------------------------------------------------------------------
    // The cinema screen asks for these behind a typeof-guard; until the franchise phase lands,
    // a released film simply cannot be sequelled, so the button stays hidden rather than lying.
    canSequel(state, movie) { return false; },
    startSequel(state, movieId) { return null; },

    // --- the dispatcher ---------------------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        const S = StudioManager, s = S.state;
        const parts = String(act).split(':');
        if (parts[0] !== 'prod') return false;

        if (parts[1] === 'start') {
            const script = (s.scripts || []).find((x) => x.id === parts[2]);
            if (!script) { game.toast('Сценарий не найден.'); return true; }
            if (!CastingSystem || !CastingSystem.isComplete(s, script) || !script.timeline) {
                game.toast('Сначала кастинг: «' + script.title + '» без каста не снимается.');
                game.uiState.castScript = script.id;
                game.showScreen('casting');
                return true;
            }
            const res = this.start(s, S, script);
            if (!res.ok) { game.toast(res.why); return true; }
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.clapper, { volume: 0.7 });
            game.toast('🎬 Мотор! «' + res.project.title + '» — съёмки начались, ' + res.project.sceneCount + ' сцен в листе.');
            game.uiState.prodOpen = res.project.id;
            game.showScreen('production');
            return true;
        }
        const proj = (s.projects || []).find((p) => p.id === parts[2]);
        if (parts[1] === 'open') { game.uiState.prodOpen = parts[2]; game.showScreen('production'); return true; }
        if (!proj) return true;

        if (parts[1] === 'week') { game.nextWeek(); return true; }
        if (parts[1] === 'pace') {
            if (proj.state !== 'shooting') { game.toast('Темп можно менять только пока идут съёмки.'); return true; }
            proj.pace = this.PACES[parts[3]] ? parts[3] : proj.pace;
            game.toast('Темп съёмок: «' + this.pace(proj.pace).ru + '» — ' + this.pace(proj.pace).hint);
            game.showScreen('production');
            return true;
        }
        if (parts[1] === 'dailies') {
            const script = (s.scripts || []).find((x) => x.id === proj.scriptId);
            if (!script || !script.timeline) return true;
            const idx = Number(parts[3]) || 0;
            if (!proj.scenesShot.some((x) => x.idx === idx)) { game.toast('Эта сцена ещё не снята.'); return true; }
            game.playMovie(script.timeline, { dailies: idx });
            return true;
        }
        if (parts[1] === 'cut') {
            const tl = this.roughCut(s, proj);
            if (!tl) { game.toast('Ещё ни одна сцена не снята.'); return true; }
            game.playMovie(tl, {});
            return true;
        }
        if (parts[1] === 'wrap') {
            const res = this.wrap(s, S, proj);
            if (!res.ok) { game.toast(res.why); return true; }
            game.toast('🏁 Съёмки свёрнуты: ' + proj.scenesShot.length + ' сцен уехало в монтажную.');
            game.showScreen('production');
            return true;
        }
        if (parts[1] === 'upgrade') {
            const res = this.upgradeSet(s, S, parts[2]);
            if (!res.ok) { game.toast(res.why); return true; }
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.cash, { volume: 0.5 });
            game.toast('🏗 Декорация перестроена до уровня ' + res.level + ': сцены в ней будут сочнее.');
            game.showScreen('production');
            return true;
        }
        return true;
    },
};
