// CastingSystem.js — the casting office (Phase В). A script asks for roles; the player fills
// them from the roster and the talent market. Every candidate gets an honest score (genre
// skill, star power, mood, charm, age/sex fit) and every pair gets a chemistry value that
// later moves the film's quality. When the cast is complete the script is COMPILED into a
// MovieSequencer timeline — the moment the game stops being a spreadsheet and becomes a film.
//
// Pure logic on Rng: no DOM, no pc.*. Screens are HTML strings for the 'screen' UI elements
// (skill ui); clicks come back as data-act="cast:…" through StudioUI.onAction.
//
//   CastingSystem.score(person, role, script, state)   -> { total, parts, notes }
//   CastingSystem.autoCast(state, script)              -> { roleKey: personId }
//   CastingSystem.confirm(state, script, mgr)          -> { ok, timeline, chemistry }

/** @satisfies {Record<string, any>} */
const CastingSystem = {

    cfg() {
        const U = 'undefined';
        return {
            wSkill: typeof CAST_W_SKILL !== U ? CAST_W_SKILL : 0.5,
            wStar: typeof CAST_W_STAR !== U ? CAST_W_STAR : 0.16,
            wMood: typeof CAST_W_MOOD !== U ? CAST_W_MOOD : 0.12,
            wCharm: typeof CAST_W_CHARM !== U ? CAST_W_CHARM : 0.08,
            wFit: typeof CAST_W_FIT !== U ? CAST_W_FIT : 0.14,
            chemRel: typeof CAST_CHEM_REL !== U ? CAST_CHEM_REL : 0.6,
            chemFilm: typeof CAST_CHEM_FILM !== U ? CAST_CHEM_FILM : 0.08,
            chemQuality: typeof CAST_CHEM_QUALITY !== U ? CAST_CHEM_QUALITY : 0.9,
            feePerLead: typeof CAST_FEE_PER_LEAD !== U ? CAST_FEE_PER_LEAD : 2500,
            auditions: typeof CAST_AUDITIONS !== U ? CAST_AUDITIONS : 8,
        };
    },

    // --- people --------------------------------------------------------------------------------

    /** Every person the office may offer: the roster plus the market (actors only). */
    pool(state) {
        const out = [];
        for (const p of state.roster || []) if (p.role === 'actor') out.push(p);
        for (const p of state.market || []) if (p.role === 'actor') out.push(p);
        return out;
    },

    person(state, id) {
        return this.pool(state).find((p) => p.id === id)
            || (state.roster || []).concat(state.staff || []).find((p) => p.id === id) || null;
    },

    /** Is this actor already committed to another script in development? A released picture
     *  frees its cast: commitment ends at the premiere, not with the credits. */
    isCommitted(state, personId, exceptScriptId) {
        for (const sc of state.scripts || []) {
            if (sc.id === exceptScriptId || !sc.cast) continue;
            if (sc.state === 'released') continue;
            for (const k of Object.keys(sc.cast)) if (sc.cast[k] === personId) return sc;
        }
        return null;
    },

    /** A hired actor is free; a market candidate must be signed first (the screen says so). */
    isRoster(state, personId) {
        return !!(state.roster || []).some((p) => p.id === personId);
    },

    // --- scoring ---------------------------------------------------------------------------------

    /**
     * How well a person fits a role, 0..10. The five weighted parts are returned too, so the
     * UI can show WHY the office likes or dislikes a candidate instead of a bare number.
     */
    score(person, role, script, state) {
        const c = this.cfg();
        const G = (MovieData.GENRES[script.genre] || {});
        const skillKey = role.skill || G.skill || 'drama';
        const skill = person.skills[skillKey] || 0;

        // Age fit: inside the role's range — 1, outside — falling off gently.
        const range = role.age || [18, 70];
        let ageFit = 1;
        if (person.age < range[0]) ageFit = Math.max(0.35, 1 - (range[0] - person.age) * 0.07);
        else if (person.age > range[1]) ageFit = Math.max(0.35, 1 - (person.age - range[1]) * 0.06);

        // Sex fit: a soft preference, never a wall — the player may cast against it.
        const sexFit = !role.sex || role.sex === 'any' || role.sex === person.gender ? 1 : 0.55;
        const fit = ageFit * 0.55 + sexFit * 0.45;

        const parts = {
            skill: skill / 10,
            star: (person.star || 0) / 5,
            mood: Math.max(0, Math.min(100, person.mood || 50)) / 100,
            charm: (person.charm || 5) / 10,
            fit: fit,
        };
        const w = c.wSkill * parts.skill + c.wStar * parts.star + c.wMood * parts.mood +
            c.wCharm * parts.charm + c.wFit * parts.fit;

        const notes = [];
        if (parts.skill >= 0.8) notes.push('роль как влитая: ' + PeopleSystem.SKILL_RU[skillKey] + ' ' + skill);
        else if (parts.skill <= 0.35) notes.push('слабо тянет ' + PeopleSystem.SKILL_RU[skillKey].toLowerCase() + ' (' + skill + ')');
        if ((person.star || 0) >= 3) notes.push('звезда ★' + person.star + ' — имя продаёт билеты');
        if ((person.mood || 50) < 35) notes.push('в плохом настроении: дубли будут хуже');
        if (sexFit < 1) notes.push('не по амплуа (' + (role.sex === 'm' ? 'роль мужская' : 'роль женская') + ')');
        if (ageFit < 0.9) notes.push('возраст ' + person.age + ' против ' + range[0] + '–' + range[1]);
        const committed = this.isCommitted(state, person.id, script.id);
        if (committed) notes.push('занят(а) в «' + committed.title + '»');

        return {
            total: Math.round(w * 10 * 10) / 10,
            parts: parts,
            notes: notes,
            busy: !!committed,
            roster: this.isRoster(state, person.id),
            skillKey: skillKey,
        };
    },

    /** Audition list for a role: the pool scored and sorted, truncated to CAST_AUDITIONS. */
    candidates(state, script, role) {
        const out = [];
        for (const p of this.pool(state)) {
            const sc = this.score(p, role, script, state);
            // Committed actors stay on the list (the player may want to see why) but sink.
            out.push({ person: p, score: sc, rank: sc.total - (sc.busy ? 6 : 0) - (sc.roster ? 0 : 0.25) });
        }
        out.sort((a, b) => b.rank - a.rank || a.person.salary - b.person.salary);
        return out;
    },

    // --- chemistry -------------------------------------------------------------------------------

    /**
     * Pair chemistry −1..1. An explicit relationship wins; otherwise a stable pseudo-history
     * derived from both ids ("they have crossed paths before") — deterministic, so a save
     * replays the same film. Positive chemistry lifts quality, negative invites scandals.
     */
    chemistry(a, b) {
        if (!a || !b || a.id === b.id) return 0;
        const c = this.cfg();
        const rel = (a.relationships && a.relationships[b.id] != null) ? a.relationships[b.id]
            : (b.relationships && b.relationships[a.id] != null) ? b.relationships[a.id] : null;
        let v;
        if (rel != null) v = (rel / 100) * c.chemRel;
        else {
            // Sorted by a STABLE person key: ids come from a global counter and differ
            // between otherwise identical games, which would break seed determinism.
            const ka = a.name + '/' + a.age, kb = b.name + '/' + b.age;
            const lo = ka < kb ? ka : kb, hi = ka < kb ? kb : ka;
            const h = Rng.hash(lo + '×' + hi);
            v = (((h % 5000) / 5000) * 2 - 1) * 0.28;      // a mild ±0.28 of unspoken history
        }
        const shared = Math.max((a.filmsWith && a.filmsWith[b.id]) || 0, (b.filmsWith && b.filmsWith[a.id]) || 0);
        v += Math.min(5, shared) * c.chemFilm;
        return Math.max(-1, Math.min(1, Math.round(v * 1000) / 1000));
    },

    chemWord(v) {
        return v >= 0.5 ? 'искрит' : v >= 0.2 ? 'тепло' : v >= -0.05 ? 'ровно' : v >= -0.35 ? 'холодно' : 'вражда';
    },

    /**
     * The chemistry of the whole cast: pairs weighted by how much screen time they share,
     * so two leads who never meet barely matter.
     */
    castChemistry(state, script, castByKey) {
        const roles = script.roles || [];
        let sum = 0, wsum = 0;
        for (let i = 0; i < roles.length; i++) {
            for (let j = i + 1; j < roles.length; j++) {
                const a = castByKey[roles[i].key], b = castByKey[roles[j].key];
                if (!a || !b) continue;
                // Do they actually share scenes?
                let shared = 0;
                for (const sc of script.scenes || []) {
                    if ((sc.roles || []).indexOf(roles[i].key) >= 0 && (sc.roles || []).indexOf(roles[j].key) >= 0) shared++;
                }
                const w = (roles[i].share + roles[j].share) * (shared ? 1 + shared * 0.25 : 0.15);
                sum += this.chemistry(a, b) * w;
                wsum += w;
            }
        }
        return wsum > 0 ? Math.round((sum / wsum) * 1000) / 1000 : 0;
    },

    /** The film's quality after the cast: the script plus what the actors bring to it. */
    projectedQuality(state, script, castByKey) {
        const chem = this.castChemistry(state, script, castByKey);
        const c = this.cfg();
        // Average role fit of the leads pulls the picture up or down.
        let fitSum = 0, fitN = 0;
        for (const role of script.roles || []) {
            const p = castByKey[role.key];
            if (!p) continue;
            fitSum += this.score(p, role, script, state).total * role.share;
            fitN += role.share;
        }
        const castFit = fitN > 0 ? fitSum / fitN : 0;            // 0..10
        const q = script.quality + (castFit - 5) * 0.22 + chem * c.chemQuality;
        return { quality: Math.round(Math.max(0.4, Math.min(10, q)) * 100) / 100, chemistry: chem, castFit: Math.round(castFit * 10) / 10 };
    },

    // --- assignment -------------------------------------------------------------------------------

    /** Greedy by scarcity: the roles with the fewest good candidates pick first. */
    autoCast(state, script) {
        const roles = (script.roles || []).slice();
        const lists = {};
        for (const role of roles) {
            lists[role.key] = this.candidates(state, script, role)
                .filter((x) => !x.score.busy && x.score.roster)
                .map((x) => ({ id: x.person.id, rank: x.rank }));
        }
        const taken = {};
        const out = {};
        // Only SIGNED actors can be put in a film: a market candidate must be hired first,
        // otherwise the studio would get free stars off the talent exchange.
        const signed = (id) => this.isRoster(state, id);
        // Keep what is already cast and still legal.
        if (script.cast) {
            for (const k of Object.keys(script.cast)) {
                const pid = script.cast[k];
                const role = roles.find((r) => r.key === k);
                const p = pid ? this.person(state, pid) : null;
                if (role && p && signed(pid) && !this.isCommitted(state, pid, script.id)) { out[k] = pid; taken[pid] = k; }
            }
        }
        const order = roles.slice().sort((a, b) => (lists[a.key] || []).length - (lists[b.key] || []).length);
        for (const role of order) {
            if (out[role.key]) continue;
            const list = lists[role.key] || [];
            for (const cand of list) {
                if (taken[cand.id]) continue;
                out[role.key] = cand.id;
                taken[cand.id] = role.key;
                break;
            }
        }
        // A PARTIAL auto-cast is a trap: every name in it reads as committed, so three half-cast
        // scripts fragment the troupe and none can ever finish. Auto-casting is all-or-nothing;
        // a hand-picked partial cast remains the player's prerogative.
        for (const role of roles) if (!out[role.key]) return Object.assign({}, script.cast || {});
        return out;
    },

    /**
     * Put a person on a role. Only a SIGNED actor may be cast — a market candidate has to be
     * hired first (see hireAndCast). Returns the roles this move vacated, so the UI can say so
     * out loud instead of leaving the player wondering why the cast is suddenly incomplete.
     */
    pick(state, script, roleKey, personId) {
        script.cast = script.cast || {};
        if (!personId) { delete script.cast[roleKey]; return { ok: true, displaced: [] }; }
        const p = this.person(state, personId);
        if (!p) return { ok: false, why: 'Такого человека нет в списке.' };
        if (!this.isRoster(state, personId)) {
            return { ok: false, why: p.name + ' не в штате: сначала наймите актёра (кнопка «Нанять и взять»).', needHire: p };
        }
        if (this.isCommitted(state, personId, script.id)) return { ok: false, why: p.name + ' уже занят(а) в другом проекте.' };
        // One person cannot play two roles in the same film: the previous one is vacated.
        const displaced = [];
        for (const k of Object.keys(script.cast)) {
            if (k !== roleKey && script.cast[k] === personId) {
                const r = (script.roles || []).find((x) => x.key === k);
                displaced.push({ key: k, ru: r ? r.ru : k });
                delete script.cast[k];
            }
        }
        script.cast[roleKey] = personId;
        return { ok: true, person: p, displaced: displaced };
    },

    /** Sign a market candidate and put them on the role in one move. */
    hireAndCast(state, mgr, script, roleKey, personId) {
        const p = (state.market || []).find((x) => x.id === personId);
        if (!p) return { ok: false, why: 'Этого кандидата уже нет на бирже.' };
        if (p.role !== 'actor') return { ok: false, why: p.name + ' — не актёр.' };
        if (!mgr.hire(p, 'actor')) return { ok: false, why: 'Не удалось подписать ' + p.name + '.' };
        const res = this.pick(state, script, roleKey, personId);
        res.hired = p;
        return res;
    },

    /** Every lead and support role filled? */
    isComplete(state, script) {
        if (!script.cast) return false;
        for (const role of script.roles || []) if (!script.cast[role.key]) return false;
        return true;
    },

    missing(state, script) {
        const out = [];
        for (const role of script.roles || []) if (!script.cast || !script.cast[role.key]) out.push(role);
        return out;
    },

    /** The casting fee: per lead role. */
    fee(script) {
        const c = this.cfg();
        let leads = 0;
        for (const r of script.roles || []) if (r.tier === 'lead') leads++;
        return leads * c.feePerLead;
    },

    /**
     * Lock the cast: pay the fee, resolve the people, compile the timeline. From here the film
     * exists as data — Phase Г shoots it, Phase Д releases it, the player watches it.
     */
    confirm(state, script, mgr) {
        if (!this.isComplete(state, script)) {
            return { ok: false, why: 'Заполнены не все роли: ' + this.missing(state, script).map((r) => r.ru).join(', ') + '.' };
        }
        const fee = this.fee(script);
        if (mgr && !mgr.canAfford(fee)) return { ok: false, why: 'Кастинг-сессия стоит ' + StudioUI_money(fee) + ' — не хватает денег.' };

        const castByKey = {};
        for (const role of script.roles || []) {
            const p = this.person(state, script.cast[role.key]);
            if (!p) return { ok: false, why: 'Роль «' + role.ru + '» указывает на отсутствующего человека.' };
            castByKey[role.key] = p;
        }
        if (mgr) mgr.pay(fee, 'Кастинг: «' + script.title + '»');

        const proj = this.projectedQuality(state, script, castByKey);
        script.castQuality = proj.castFit;
        script.chemistry = proj.chemistry;
        script.projected = proj.quality;
        script.castIds = {};
        for (const k of Object.keys(castByKey)) script.castIds[k] = castByKey[k].id;
        script.timeline = ScriptGenerator.compile(script, castByKey, state);
        script.state = 'cast';
        script.castWeek = state.weekIdx;

        // Co-stars remember each other: chemistry grows with every shared picture.
        const keys = Object.keys(castByKey);
        for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
                const a = castByKey[keys[i]], b = castByKey[keys[j]];
                a.relationships = a.relationships || {}; b.relationships = b.relationships || {};
                const ch = this.chemistry(a, b);
                a.relationships[b.id] = Math.max(-100, Math.min(100, (a.relationships[b.id] || 0) + (ch >= 0 ? 4 : -5)));
                b.relationships[a.id] = a.relationships[b.id];
                a.filmsWith = a.filmsWith || {}; b.filmsWith = b.filmsWith || {};
                a.filmsWith[b.id] = (a.filmsWith[b.id] || 0);       // ProductionSystem bumps it on release
            }
        }
        if (mgr) {
            mgr.pushNews('Каст «' + script.title + '» утверждён: ' + keys.map((k) => castByKey[k].name).join(', ') +
                '. Химия ' + this.chemWord(script.chemistry) + '.', script.chemistry >= 0.2 ? 'good' : '');
        }
        return { ok: true, timeline: script.timeline, chemistry: script.chemistry, projected: proj.quality, fee: fee };
    },

    // --- the screen ---------------------------------------------------------------------------------

    screen(game) {
        const s = StudioManager.state;
        const UIx = StudioUI;
        game.uiState = game.uiState || {};
        const scriptId = game.uiState.castScript;
        const script = (s.scripts || []).find((x) => x.id === scriptId);
        if (!script) {
            return '<div class="sc"><h1 class="title">КАСТИНГ</h1><p class="lead">Сначала нужен сценарий: закажите его в сценарном отделе.</p>' +
                '<span class="btn" data-act="nav:films">← К фильмам</span></div>';
        }
        const G = MovieData.GENRES[script.genre] || {};
        const roleKey = game.uiState.castRole && (script.roles || []).some((r) => r.key === game.uiState.castRole)
            ? game.uiState.castRole : (this.missing(s, script)[0] || (script.roles || [])[0] || {}).key;
        const role = (script.roles || []).find((r) => r.key === roleKey) || null;

        // The role sheet.
        let roleList = '';
        for (const r of script.roles || []) {
            const pid = script.cast ? script.cast[r.key] : null;
            const p = pid ? this.person(s, pid) : null;
            const on = r.key === roleKey;
            roleList += '<div class="card' + (on ? ' sel' : '') + '" data-act="cast:role:' + r.key + '" style="cursor:pointer">' +
                '<div class="row tight">' +
                (p ? UIx.avatar(p, 40) : '<span style="display:inline-block;width:40px;height:40px;border-radius:10px;background:#0e1320;border:1px dashed #33405a;flex:none"></span>') +
                '<div style="flex:1;min-width:0"><div class="row tight"><span class="name">' + UIx.esc(r.ru) + '</span>' +
                '<span class="tag' + (r.tier === 'lead' ? ' gold' : '') + '">' + (r.tier === 'lead' ? 'главная' : 'второст.') + '</span>' +
                (on ? '<span class="tag blue">выбираем</span>' : '') + '</div>' +
                '<div class="meta">' + (p ? UIx.esc(p.name) + ' · ' + UIx.stars(p) : '<span class="bad">не выбран</span>') +
                ' · ' + PeopleSystem.SKILL_RU[r.skill] + ' · ' + Math.round(r.share * 100) + '% времени</div></div>' +
                (p ? '<span class="btn small red" data-act="cast:clear:' + r.key + '">✕</span>' : '') +
                '</div></div>';
        }

        // The audition list for the selected role: a shortlist (CAST_AUDITIONS)
        // with an expander to the full pool — the studio's market is big now.
        let aud = '';
        if (role) {
            const all = this.candidates(s, script, role);
            const expanded = game.uiState.castMore === role.key;
            const list = expanded ? all : all.slice(0, this.cfg().auditions);
            if (!list.length) aud = '<p class="hint bad">Нет ни одного актёра. Наймите кого-нибудь на бирже талантов.</p>';
            for (const cand of list) {
                const p = cand.person;
                const sc = cand.score;
                const picked = script.cast && script.cast[role.key] === p.id;
                // The verdict column: the score and the action stay at the card's right edge,
                // the reasoning (bars, notes) flows under the name — the row never wraps into
                // a pile of tags.
                aud += '<div class="card' + (picked ? ' sel' : '') + '" style="cursor:default">' +
                    '<div class="row" style="align-items:flex-start">' + UIx.avatar(p, 48) +
                    '<div style="flex:1;min-width:200px">' +
                    '<div class="row tight"><span class="name">' + UIx.esc(p.name) + '</span>' + UIx.stars(p) +
                    '<span class="tag">' + p.age + ' лет</span>' +
                    '<span class="tag ' + (p.mood >= 60 ? 'green' : p.mood >= 35 ? '' : 'red') + '">' + PeopleSystem.moodWord(p.mood) + '</span>' +
                    (!sc.roster ? '<span class="tag blue">на бирже — не в штате</span>' : '') +
                    (sc.busy ? '<span class="tag red">занят(а) в другом фильме</span>' : '') +
                    '</div>' +
                    '<div class="meta" style="margin-top:6px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 18px">' +
                    '<span><span class="hint">' + UIx.esc(PeopleSystem.SKILL_RU[sc.skillKey]) + '</span> ' + UIx.bar(sc.parts.skill, sc.parts.skill >= 0.7 ? 'green' : '') + '</span>' +
                    '<span><span class="hint">звёздность</span> ' + UIx.bar(sc.parts.star) + '</span>' +
                    '<span><span class="hint">настроение</span> ' + UIx.bar(sc.parts.mood) + '</span>' +
                    '<span><span class="hint">обаяние</span> ' + UIx.bar(sc.parts.charm) + '</span>' +
                    '<span><span class="hint">амплуа</span> ' + UIx.bar(sc.parts.fit) + '</span>' +
                    '</div>' +
                    '<div class="meta">' + UIx.money(p.salary) + '/нед' + (p.quirks.length ? ' · ' + UIx.esc(p.quirks.join(', ')) : '') + '</div>' +
                    (sc.notes.length ? '<div class="meta hint">' + sc.notes.map(UIx.esc).join(' · ') + '</div>' : '') +
                    '</div>' +
                    '<div style="flex:none;text-align:right;min-width:150px">' +
                    '<div class="tag gold big" title="оценка соответствия роли">' + sc.total.toFixed(1) + '</div>' +
                    '<div style="margin-top:8px">' +
                    (sc.busy ? '<span class="btn small off">занят(а)</span>'
                        : !sc.roster ? '<span class="btn small' + (StudioManager.canAfford(p.salary * 4) ? '' : ' off') + '" data-act="cast:hire:' + role.key + ':' + p.id + '">🤝 Нанять и взять</span>'
                            : '<span class="btn gold small" data-act="cast:pick:' + role.key + ':' + p.id + '">' + (picked ? '✓ Выбран' : 'Взять на роль') + '</span>') +
                    '</div>' +
                    '<div class="hint" style="margin-top:4px">' + UIx.money(p.salary) + '/нед</div>' +
                    '</div>' +
                    '</div></div>';
            }
            if (all.length > this.cfg().auditions) {
                aud += '<div class="row" style="margin-top:8px"><span class="btn" data-act="cast:more:' + role.key + '">' +
                    (expanded ? '▲ Свернуть список' : '▼ Показать всех: ещё ' + (all.length - list.length) + ', всего ' + all.length) +
                    '</span></div>';
            }
        }

        // Chemistry and the projection.
        let chem = '', proj = '';
        if (this.isComplete(s, script)) {
            const byKey = {};
            for (const r of script.roles) byKey[r.key] = this.person(s, script.cast[r.key]);
            const pr = this.projectedQuality(s, script, byKey);
            proj = '<div class="row tight"><span class="tag gold big">прогноз качества ' + pr.quality.toFixed(1) + '/10</span>' +
                '<span class="tag">химия ' + this.chemWord(pr.chemistry) + ' (' + (pr.chemistry >= 0 ? '+' : '') + pr.chemistry.toFixed(2) + ')</span>' +
                '<span class="tag">попадание в роли ' + pr.castFit.toFixed(1) + '</span></div>';
            // The pair matrix, leads only.
            const leads = (script.roles || []).filter((r) => r.tier === 'lead');
            chem = '<table class="tbl"><tr><th></th>' + leads.map((r) => '<th>' + UIx.esc(r.ru) + '</th>').join('') + '</tr>';
            for (const a of leads) {
                chem += '<tr><td class="hint">' + UIx.esc(a.ru) + '</td>';
                for (const b of leads) {
                    if (a.key === b.key) { chem += '<td class="hint">—</td>'; continue; }
                    const v = this.chemistry(byKey[a.key], byKey[b.key]);
                    const cls = v >= 0.2 ? 'good' : v <= -0.1 ? 'bad' : 'hint';
                    chem += '<td class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '</td>';
                }
                chem += '</tr>';
            }
            chem += '</table>';
        } else {
            const miss = this.missing(s, script);
            proj = '<div class="meta bad">Не заполнено ролей: ' + miss.length + ' — ' + miss.map((r) => UIx.esc(r.ru)).join(', ') + '</div>';
        }

        const fee = this.fee(script);
        const done = this.isComplete(s, script);
        const afford = StudioManager.canAfford(fee);

        return '<div class="sc"><h1 class="title">КАСТИНГ<span class="sub">«' + UIx.esc(script.title) + '» · ' +
            (G.emoji || '') + ' ' + (G.ru || '') + ' · сценарий ' + script.quality.toFixed(1) + '/10</span></h1>' +
            '<div class="panel" style="padding:10px;margin-bottom:10px"><div class="meta">' + UIx.esc(script.logline) + '</div></div>' +
            '<div class="cols">' +
            '<div class="col"><div class="h2">🎭 Роли</div><div class="scroll">' + roleList + '</div>' +
            '<div class="h2">💞 Химия</div><div class="panel" style="padding:10px">' + (chem || '<p class="hint">Соберите весь каст — покажем, кто с кем играет.</p>') + '</div></div>' +
            '<div class="col"><div class="h2">🎬 Проб' + (role ? 'ы: ' + UIx.esc(role.ru) : '') + '</div><div class="scroll">' + aud + '</div></div>' +
            '</div>' +
            '<div class="panel" style="margin-top:10px;padding:10px">' + proj + '</div>' +
            '<div class="row" style="margin-top:12px">' +
            '<span class="btn" data-act="script:open:' + script.id + '">← Сценарий</span>' +
            '<span class="btn" data-act="cast:auto:' + script.id + '">🎲 Авто-кастинг</span>' +
            '<span class="sp"></span>' +
            (script.timeline ? '<span class="btn" data-act="script:watch:' + script.id + '">▶ Смотреть фильм</span>' : '') +
            '<span class="btn gold' + (done && afford ? '' : ' off') + '" data-act="cast:confirm:' + script.id + '">✅ Утвердить каст · ' + UIx.money(fee) + '</span>' +
            '</div></div>';
    },

    // --- the dispatcher ------------------------------------------------------------------------------

    onAction(game, act, el, screenEl) {
        const S = StudioManager, s = S.state;
        const parts = String(act).split(':');
        if (parts[0] !== 'cast') return false;
        game.uiState = game.uiState || {};
        const script = (s.scripts || []).find((x) => x.id === (game.uiState.castScript || parts[2]));

        if (parts[1] === 'open') {
            game.uiState.castScript = parts[2];
            const sc = (s.scripts || []).find((x) => x.id === parts[2]);
            game.uiState.castRole = sc && sc.roles && sc.roles.length ? (this.missing(s, sc)[0] || sc.roles[0]).key : '';
            game.showScreen('casting');
            return true;
        }
        if (!script) return true;
        if (parts[1] === 'role') { game.uiState.castRole = parts[2]; game.uiState.castMore = ''; game.showScreen('casting'); return true; }
        if (parts[1] === 'more') {
            game.uiState.castMore = game.uiState.castMore === parts[2] ? '' : parts[2];
            game.showScreen('casting');
            return true;
        }
        if (parts[1] === 'clear') { this.pick(s, script, parts[2], null); game.showScreen('casting'); return true; }
        if (parts[1] === 'pick' || parts[1] === 'hire') {
            const roleKey = parts[2], personId = parts[3];
            const roleRu = ((script.roles || []).find((r) => r.key === roleKey) || {}).ru || roleKey;
            const res = parts[1] === 'hire' ? this.hireAndCast(s, S, script, roleKey, personId) : this.pick(s, script, roleKey, personId);
            if (!res.ok) { game.toast(res.why); return true; }
            if (typeof Sound3D !== 'undefined') Sound3D.play(res.hired ? MovieData.SFX.cash : MovieData.SFX.typewriter, { volume: 0.45 });
            if (res.hired) game.toast('🤝 ' + res.hired.name + ' подписан(а) и взят(а) на роль «' + roleRu + '».');
            else game.toast('✓ ' + res.person.name + ' — «' + roleRu + '».');
            // Say out loud that the move vacated another role, or the player will not understand
            // why «Утвердить каст» suddenly refuses to work.
            for (const d of res.displaced || []) {
                game.toast('⚠ Роль «' + d.ru + '» освободилась: ' + res.person.name + ' не может играть двоих.');
            }
            // Move on to the next empty role so the player is never stuck.
            const miss = this.missing(s, script);
            if (miss.length) game.uiState.castRole = miss[0].key;
            game.showScreen('casting');
            return true;
        }
        if (parts[1] === 'auto') {
            script.cast = this.autoCast(s, script);
            const miss = this.missing(s, script);
            game.uiState.castRole = miss.length ? miss[0].key : ((script.roles || [])[0] || {}).key;
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.clapper, { volume: 0.5 });
            game.toast(miss.length ? '🎲 Авто-кастинг: не хватает ' + miss.length + ' — доберите вручную.' : '🎲 Авто-кастинг собрал весь каст.');
            game.showScreen('casting');
            return true;
        }
        if (parts[1] === 'confirm') {
            const res = this.confirm(s, script, S);
            if (!res.ok) { game.toast(res.why); game.showScreen('casting'); return true; }
            if (typeof Sound3D !== 'undefined') Sound3D.play(MovieData.SFX.clapper, { volume: 0.7 });
            game.toast('🎬 Каст утверждён! Прогноз качества ' + res.projected.toFixed(1) + '/10, химия «' + this.chemWord(res.chemistry) + '». Фильм смонтирован — можно смотреть.');
            game.showScreen('casting');
            return true;
        }
        return true;
    },
};
