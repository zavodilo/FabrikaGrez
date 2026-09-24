// PeopleSystem.js — the people of «Фабрика Грёз»: actors, directors, writers and the rest.
// Generation (looks + stats), the talent market, training, moods and relationships.
// Pure logic on Rng — no DOM, no pc.*; the UI lives in StudioUI, the state in StudioManager.

/** @satisfies {Record<string, any>} */
const PeopleSystem = {
    ROLES: ['actor', 'director', 'writer', 'editor', 'marketer'],
    ROLE_RU: { actor: 'Актёр', director: 'Режиссёр', writer: 'Сценарист', editor: 'Монтажёр', marketer: 'Маркетолог' },
    SKILLS: ['drama', 'comedy', 'action', 'romance'],
    SKILL_RU: { drama: 'Драма', comedy: 'Комедия', action: 'Экшн', romance: 'Романтика' },

    _nextId: 1,

    /** A random appearance for ActorRig3D (MovieData palettes). */
    randomLook(r) {
        const M = MovieData;
        const gender = r.chance(0.5) ? 'm' : 'f';
        const look = {
            skin: r.pick(M.SKINS),
            hair: r.pick(M.HAIRS),
            shoes: r.pick(M.SHOES),
            gender: gender,
            hairStyle: gender === 'f' ? r.range(1, 2) : r.range(0, 3),
            scale: r.float(0.92, 1.1),
            hat: '',
        };
        if (gender === 'm') {
            look.shirt = r.pick(M.SHIRTS_M);
            look.pants = r.pick(M.PANTS_M);
            look.hat = r.chance(0.25) ? r.pick(M.HATS.filter((x) => x)) : '';
        } else {
            const dress = r.pick(M.DRESSES_F);
            look.shirt = dress;
            look.pants = r.chance(0.5) ? dress : r.pick(M.PANTS_M);
        }
        return look;
    },

    /** A costume for a film role: genre-flavored palette on top of the person's base look. */
    costumeFor(r, genre, gender) {
        const M = MovieData;
        const g = genre;
        if (g === 'western') {
            return {
                shirt: r.pick(['#8a5a32', '#4a6a8a', '#6a4a2a', '#a83a2a', '#3a3a30']),
                pants: r.pick(['#3a3026', '#4a3a2a', '#2a2620']),
                hat: r.pick(['#6a4a2a', '#3a2a1a', '#8a6a42', '#2a2a2e']),
            };
        }
        if (g === 'war') {
            return {
                shirt: r.pick(['#5a5a42', '#4a4a36', '#6a6a4a']),
                pants: r.pick(['#4a4a36', '#3a3a2a']),
                hat: r.chance(0.7) ? r.pick(['#5a5a42', '#4a4a36']) : '',
            };
        }
        if (g === 'adventure') {
            return {
                shirt: r.pick(['#c8b088', '#a89068', '#8a7a58']),
                pants: r.pick(['#6a5a3a', '#5a4a2e']),
                hat: r.chance(0.6) ? r.pick(['#c8b088', '#a89068']) : '',
            };
        }
        if (g === 'noir') {
            return {
                shirt: r.pick(['#3a3a42', '#4a4a52', '#2e2e36', '#5a5a62']),
                pants: r.pick(['#22222a', '#2a2a32']),
                hat: r.chance(0.6) ? r.pick(['#2a2a32', '#3a3a42', '#1c1c24']) : '',
            };
        }
        if (g === 'musical') {
            return gender === 'f'
                ? { shirt: r.pick(['#c84a6a', '#d8a03a', '#4aa0c8', '#a04ac8']), pants: r.pick(['#c84a6a', '#d8a03a', '#4aa0c8']), hat: '' }
                : { shirt: r.pick(['#e8e0d0', '#c8a24a', '#4a8ac8']), pants: r.pick(['#22262e', '#2e2438']), hat: '' };
        }
        if (g === 'scifi') return { shirt: r.pick(['#3a4a6a', '#5a6a7a', '#2e3a4a']), pants: '#2a3140', hat: '' };
        if (g === 'horror') return { shirt: r.pick(['#2a2e2a', '#3a2a34', '#1e2420']), pants: '#1a1c1a', hat: '' };
        if (g === 'romance') {
            return gender === 'f'
                ? { shirt: r.pick(M.DRESSES_F), pants: r.pick(M.DRESSES_F), hat: '' }
                : { shirt: r.pick(['#e8e0d0', '#2e3a4a', '#5a2a34']), pants: '#22262e', hat: '' };
        }
        if (g === 'action') return { shirt: r.pick(['#2e3a4a', '#3a3a3a', '#4a3a2a']), pants: '#22262e', hat: '' };
        if (g === 'comedy') return { shirt: r.pick(['#c8a24a', '#4a8a6a', '#c86a4a', '#7aa0d8']), pants: r.pick(M.PANTS_M), hat: r.chance(0.3) ? '#4a4a52' : '' };
        // drama
        return { shirt: r.pick(['#3a4450', '#584a3a', '#2e3a34', '#6a5a6a']), pants: '#262b33', hat: '' };
    },

    /**
     * A generated person. opts — { role, age, minSkill, maxSkill, year }.
     * @returns {Person}
     */
    randomPerson(r, opts) {
        const o = opts || {};
        const M = MovieData;
        const role = o.role || 'actor';
        const gender = r.chance(0.5) ? 'm' : 'f';
        const first = gender === 'm' ? r.pick(M.NAMES_M) : r.pick(M.NAMES_F);
        const last = r.pick(M.NAMES_LAST);
        const age = o.age != null ? o.age : role === 'actor' ? r.range(19, 46) : r.range(26, 60);
        const lo = o.minSkill != null ? o.minSkill : 1;
        const hi = o.maxSkill != null ? o.maxSkill : 7;
        /** @type {Record<string, number>} */
        const skills = { drama: 0, comedy: 0, action: 0, romance: 0 };
        const main = r.pick(this.SKILLS);
        for (const s of this.SKILLS) {
            skills[s] = s === main ? r.range(Math.max(lo, 3), hi) : r.range(lo, Math.max(lo + 1, hi - 2));
        }
        if (role === 'director' || role === 'writer') {
            // staff carry the same 4 skills as their craft affinities
            for (const s of this.SKILLS) skills[s] = Math.min(10, skills[s] + r.range(0, 2));
        }
        const talent = (skills.drama + skills.comedy + skills.action + skills.romance) / 4;
        const p = {
            id: 'p' + (this._nextId++),
            name: first + ' ' + last,
            first: first,
            last: last,
            gender: gender,
            age: age,
            role: role,
            skills: skills,
            charm: r.range(3, 9),
            reliability: r.range(3, 10),
            mood: r.range(60, 90),
            loyalty: r.range(30, 70),
            star: 0,
            exp: 0,
            salary: 0,
            look: this.randomLook(r),
            busyUntilWeek: 0,     // absolute week index while training/ill
            training: null,       // { skill, weeksLeft }
            relationships: {},    // personId -> -100..100
            films: 0,
            hits: 0,
            awards: 0,
            quirks: [],
        };
        p.salary = this.fairSalary(p, talent);
        // A quirk or two (flavor + small effects).
        const QUIRKS = ['перфекционист', 'душа компании', 'полуночник', 'сорвиголова', 'ценитель вина', 'благотворитель', 'коллекционер слухов'];
        if (r.chance(0.6)) p.quirks.push(r.pick(QUIRKS));
        if (r.chance(0.2)) p.quirks.push(r.pick(QUIRKS.filter((q) => p.quirks[0] !== q)));
        return p;
    },

    /** A weekly wage that matches the person's value (used at hire and on renegotiation). */
    fairSalary(p, talent) {
        const t = talent != null ? talent : (p.skills.drama + p.skills.comedy + p.skills.action + p.skills.romance) / 4;
        // Balance (Phase З): the old curve (t²·85 + star·500) made a decent troupe cost ~95k a
        // week — more than a whole film grosses — so every studio starved on its own payroll.
        // The curve now keeps a strong cast at ~25-35k/week: expensive, but payable by hits.
        const base = p.role === 'actor' ? 350 : 300;
        const ageFactor = p.age < 22 ? 0.75 : p.age > 55 ? 0.85 : 1;
        return Math.round((base + t * t * 45 + p.star * 300 + p.charm * 15) * ageFactor / 10) * 10;
    },

    /** 0..5 stars from fame (exp, hits, awards). */
    starOf(p) {
        const v = p.exp * 0.6 + p.hits * 9 + p.awards * 14 + p.films * 2;
        return v < 12 ? 0 : v < 40 ? 1 : v < 90 ? 2 : v < 170 ? 3 : v < 280 ? 4 : 5;
    },

    /** The skill that carries a genre, 0..10. */
    genreSkill(p, genre) {
        const g = MovieData.GENRES[genre];
        return p.skills[g ? g.skill : 'drama'] || 0;
    },

    /** Mood 0..100 -> a word for the UI. */
    moodWord(m) {
        return m >= 85 ? 'в восторге' : m >= 65 ? 'доволен' : m >= 45 ? 'ровно' : m >= 25 ? 'раздражён' : 'в ярости';
    },

    // =========================================================================================
    // Phase Е: contracts, bonds, scandals, aging, the school.
    // =========================================================================================

    cfg() {
        const U = 'undefined';
        return {
            contractWeeks: typeof PEOPLE_CONTRACT_WEEKS !== U ? PEOPLE_CONTRACT_WEEKS : 52,
            starWeeks: typeof PEOPLE_CONTRACT_STAR_WEEKS !== U ? PEOPLE_CONTRACT_STAR_WEEKS : 26,
            raisePerStar: typeof PEOPLE_RENEW_RAISE_PER_STAR !== U ? PEOPLE_RENEW_RAISE_PER_STAR : 0.1,
            grace: typeof PEOPLE_RENEW_GRACE !== U ? PEOPLE_RENEW_GRACE : 4,
            poachChance: typeof PEOPLE_POACH_CHANCE !== U ? PEOPLE_POACH_CHANCE : 0.05,
            poachMult: typeof PEOPLE_POACH_MULT !== U ? PEOPLE_POACH_MULT : 1.4,
            bondChance: typeof PEOPLE_BOND_CHANCE !== U ? PEOPLE_BOND_CHANCE : 0.12,
            scandalChance: typeof PEOPLE_SCANDAL_CHANCE !== U ? PEOPLE_SCANDAL_CHANCE : 0.25,
            scandalFans: typeof PEOPLE_SCANDAL_FANS !== U ? PEOPLE_SCANDAL_FANS : 2.5,
            scandalRep: typeof PEOPLE_SCANDAL_REP !== U ? PEOPLE_SCANDAL_REP : 4,
            romancePress: typeof PEOPLE_ROMANCE_PRESS !== U ? PEOPLE_ROMANCE_PRESS : 0.2,
            declineAge: typeof PEOPLE_DECLINE_AGE !== U ? PEOPLE_DECLINE_AGE : 60,
            retireAge: typeof PEOPLE_RETIRE_AGE !== U ? PEOPLE_RETIRE_AGE : 70,
            youngAge: typeof PEOPLE_YOUNG_AGE !== U ? PEOPLE_YOUNG_AGE : 24,
            charmMult: typeof PEOPLE_COURSE_CHARM_MULT !== U ? PEOPLE_COURSE_CHARM_MULT : 1.5,
            mediaMult: typeof PEOPLE_COURSE_MEDIA_MULT !== U ? PEOPLE_COURSE_MEDIA_MULT : 2,
            mediaExp: typeof PEOPLE_COURSE_MEDIA_EXP !== U ? PEOPLE_COURSE_MEDIA_EXP : 20,
            trainCost: typeof PEOPLE_TRAIN_COST !== U ? PEOPLE_TRAIN_COST : 4000,
            trainWeeks: typeof PEOPLE_TRAIN_WEEKS !== U ? PEOPLE_TRAIN_WEEKS : 3,
            trainGain: typeof PEOPLE_TRAIN_GAIN !== U ? PEOPLE_TRAIN_GAIN : 1,
        };
    },

    /** A contract for a hire: stars sign short, everyone else signs a year. */
    makeContract(p) {
        const c = this.cfg();
        const term = (p.star || 0) >= 3 ? c.starWeeks : c.contractWeeks;
        return { salary: p.salary, term: term, weeksLeft: term };
    },

    /** The named kind of a bond: romance, friendship or rivalry (null — just colleagues). */
    relKind(a, b) {
        const v = this.relValue(a, b);
        if (v <= -40) return 'rival';
        if (v >= 70 && a.gender !== b.gender) return 'romance';
        if (v >= 50) return 'friend';
        return null;
    },
    REL_RU: { friend: 'дружба', romance: 'роман', rival: 'соперничество' },
    REL_EMOJI: { friend: '🤝', romance: '💞', rival: '⚔' },

    relValue(a, b) {
        if (!a || !b || a.id === b.id) return 0;
        const x = (a.relationships || {})[b.id];
        const y = (b.relationships || {})[a.id];
        return x != null ? x : (y != null ? y : 0);
    },

    setRel(a, b, v) {
        const cl = Math.max(-100, Math.min(100, Math.round(v)));
        a.relationships = a.relationships || {}; b.relationships = b.relationships || {};
        a.relationships[b.id] = cl; b.relationships[a.id] = cl;
        return cl;
    },

    /** The notable bonds of a person, strongest first, for the card and the bonds tab. */
    bondsOf(state, person) {
        const out = [];
        const all = (state.roster || []).concat(state.staff || []);
        for (const o of all) {
            if (o.id === person.id) continue;
            const v = this.relValue(person, o);
            const kind = this.relKind(person, o);
            if (kind || Math.abs(v) >= 40) out.push({ person: o, value: v, kind: kind || (v > 0 ? 'friend' : 'rival') });
        }
        out.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
        return out;
    },

    /** Everyone on the studio's books. */
    books(state) { return (state.roster || []).concat(state.staff || []); },

    /** Remove a person from the books (leaves, poached, retired). */
    leave(state, mgr, person, reason) {
        let arr = state.roster || [], i = arr.indexOf(person);
        if (i < 0) { arr = state.staff || []; i = arr.indexOf(person); }
        if (i < 0) return false;
        arr.splice(i, 1);
        // A departing person takes their bonds off any active casting sheet.
        for (const pr of state.projects || []) {
            if (pr.state !== 'shooting') continue;
            for (const k of Object.keys(pr.cast || {})) {
                if (pr.cast[k] === person.id) delete pr.cast[k];
            }
            if (pr.directorId === person.id) pr.directorId = '';
        }
        mgr.pushNews(person.name + ' ' + reason, 'bad');
        return true;
    },

    /** The weekly life of the troupe: contracts, poaching, bonds, scandals, romances. */
    weekly(state, mgr) {
        const c = this.cfg();
        const out = [];
        const r = Rng.create(((state.seed ^ Math.imul(state.weekIdx + 3, 2654435761)) >>> 0) || 1);
        const books = this.books(state);

        // Contracts run down; an unanswered renewal demand walks out the door.
        for (const p of books.slice()) {
            if (p.contract) {
                p.contract.weeksLeft--;
                if (p.contract.weeksLeft <= 0 && !p.demand) {
                    const raise = Math.round(p.salary * (c.raisePerStar * (p.star || 0) + 0.1 + (100 - (p.loyalty || 50)) / 500) / 10) * 10;
                    p.demand = { raise: raise, weeksLeft: c.grace };
                    out.push('📝 ' + p.name + ' ждёт продления контракта: +' + StudioUI_money(raise) + '/нед (' + c.grace + ' нед. на ответ).');
                    continue;                       // the grace starts NEXT week, not inside this one
                }
            }
            if (p.demand) {
                p.demand.weeksLeft--;
                if (p.demand.weeksLeft <= 0) {
                    p.demand = null;
                    this.leave(state, mgr, p, 'не дождался(ась) продления контракта и ушёл(ла) к конкурентам.');
                    state.rep = Math.max(0, (state.rep || 20) - 2);
                    out.push('💼 ' + p.name + ' покидает студию: контракт не продлён.');
                    continue;
                }
            }
            // Poaching: a disloyal star hears money elsewhere.
            if (!p.offer && (p.star || 0) >= 3 && (p.loyalty || 50) < 60 && r.chance(c.poachChance)) {
                p.offer = { salary: Math.round(p.salary * c.poachMult), weeksLeft: 3 };
                out.push('🕵 Конкуренты манят ' + p.name + ': ' + StudioUI_money(p.offer.salary) + '/нед. Удержать — поднять зарплату.');
                mgr.pushNews('Слух: ' + p.name + ' ведёт переговоры с конкурентами.', 'bad');
            }
            if (p.offer) {
                p.offer.weeksLeft--;
                if (p.offer.weeksLeft <= 0) {
                    const stays = r.chance(0.35 + (p.loyalty || 50) / 200);
                    p.offer = null;
                    if (!stays) {
                        this.leave(state, mgr, p, 'ушёл(ла) к конкурентам на их условия.');
                        state.fans = Math.max(0, state.fans - 1.5);
                        out.push('💔 ' + p.name + ' снялся(ась) в фильме конкурентов.');
                    } else {
                        p.loyalty = Math.min(100, (p.loyalty || 50) + 5);
                        out.push('✊ ' + p.name + ' отклоняет предложение конкурентов: лояльность растёт.');
                    }
                }
            }
        }

        // Bonds deepen or sour on their own momentum.
        for (let i = 0; i < books.length; i++) {
            for (let j = i + 1; j < books.length; j++) {
                const a = books[i], b = books[j];
                const v = this.relValue(a, b);
                if (Math.abs(v) < 40) continue;
                this.setRel(a, b, v + (v > 0 ? 1 : -1));
            }
        }

        // Co-stars on one floor: bonds shift, rivalries blow up, romances make the papers.
        for (const pr of (state.projects || [])) {
            if (pr.state !== 'shooting') continue;
            const cast = [];
            for (const k of Object.keys(pr.cast || [])) {
                const p = this.personById(state, pr.cast[k]);
                if (p) cast.push(p);
            }
            const dir = this.personById(state, pr.directorId);
            if (dir) cast.push(dir);
            for (let i = 0; i < cast.length; i++) {
                for (let j = i + 1; j < cast.length; j++) {
                    const a = cast[i], b = cast[j];
                    const kind = this.relKind(a, b);
                    if (kind === 'rival' && r.chance(c.scandalChance)) {
                        const v = this.relValue(a, b);
                        this.setRel(a, b, v - 10);
                        a.mood = Math.max(5, a.mood - 12); b.mood = Math.max(5, b.mood - 12);
                        state.fans = Math.max(0, state.fans - c.scandalFans);
                        state.rep = Math.max(0, (state.rep || 20) - c.scandalRep);
                        pr.qualityPenalty = (pr.qualityPenalty || 0) + 0.3;
                        state.scandals = state.scandals || [];
                        state.scandals.unshift({ week: state.weekIdx, year: state.year, a: a.name, b: b.name, project: pr.title });
                        out.push('⚔ Скандал на площадке «' + pr.title + '»: ' + a.name + ' и ' + b.name + ' не поделили гримёрку. Пресса ликует, фанаты уходят.');
                        mgr.pushNews('Скандал: ' + a.name + ' против ' + b.name + ' на съёмках «' + pr.title + '».', 'bad');
                    } else if (kind === 'romance' && r.chance(c.romancePress)) {
                        state.fans = Math.min(100, state.fans + 1);
                        a.mood = Math.min(100, a.mood + 6); b.mood = Math.min(100, b.mood + 6);
                        out.push('💞 Пресса поймала ' + a.name + ' и ' + b.name + ' за ужином: студии +поклонники.');
                    } else if (!kind && r.chance(c.bondChance)) {
                        // A shared shift starts something: charm and reliability decide the sign.
                        const pull = ((a.charm + b.charm) / 2 - 5) + ((a.reliability + b.reliability) / 2 - 6);
                        const v = this.relValue(a, b);
                        this.setRel(a, b, v + (pull >= 0 ? 12 : -14));
                    }
                }
            }
        }
        return out;
    },

    personById(state, id) {
        if (!id) return null;
        return this.books(state).find((p) => p.id === id) || null;
    },

    /** Once a year: the young grow, the old decline, the elders retire. */
    yearly(state, mgr) {
        const c = this.cfg();
        const out = [];
        for (const p of this.books(state).slice()) {
            if (p.age >= c.retireAge) {
                this.leave(state, mgr, p, 'ушёл(ла) на покой: красивая карьера, тёплые титры.');
                state.rep = Math.min(100, (state.rep || 20) + 1);
                out.push('🎩 ' + p.name + ' провожает карьеру на пенсию: студия аплодирует стоя.');
                continue;
            }
            if (p.age >= c.declineAge) {
                const lost = Math.min(p.skills.action, 1);
                p.skills.action = Math.max(0, p.skills.action - lost);
                p.skills.drama = Math.min(10, p.skills.drama + (p.age % 2 === 0 ? 1 : 0));   // craft ripens
                if (lost) p.salary = this.fairSalary(p);
            } else if (p.age <= c.youngAge) {
                const main = this.SKILLS.slice().sort((x, y) => p.skills[y] - p.skills[x])[0];
                p.skills[main] = Math.min(8, p.skills[main] + 1);
                p.salary = this.fairSalary(p);
            }
        }
        return out;
    },

    /** The school: a genre skill, charm, or media training toward a star. */
    courseInfo(skill) {
        const c = this.cfg();
        if (skill === 'charm') return { ru: 'Обаяние и присутствие', cost: Math.round(c.trainCost * c.charmMult), weeks: 2 };
        if (skill === 'media') return { ru: 'Медиа-тренинг', cost: Math.round(c.trainCost * c.mediaMult), weeks: 1 };
        return { ru: this.SKILL_RU[skill] || skill, cost: c.trainCost, weeks: c.trainWeeks };
    },

    /** Finish a course: applies the gain of whatever was studied. */
    finishCourse(state, p) {
        const sk = p.training ? p.training.skill : null;
        const c = this.cfg();
        if (sk === 'charm') { p.charm = Math.min(10, p.charm + 1); return 'обаяние ' + p.charm; }
        if (sk === 'media') { p.exp = (p.exp || 0) + c.mediaExp; p.star = starOfPerson(p); return 'медиа-опыт +' + c.mediaExp; }
        p.skills[sk] = Math.min(10, (p.skills[sk] || 0) + c.trainGain);
        return (this.SKILL_RU[sk] || sk) + ' ' + p.skills[sk];
    },
};

/** starOf lives on the namespace; the school needs it without a this-binding. */
function starOfPerson(p) { return PeopleSystem.starOf(p); }
