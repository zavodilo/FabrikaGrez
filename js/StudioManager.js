// StudioManager.js — the studio's heart: money, fans, the calendar and the weekly tick that
// drives everything (salaries, productions, releases, events). Pure state + numbers; the
// screens are StudioUI, the films are ProductionSystem/ReleaseSystem, the people PeopleSystem.
// Systems that arrive in later phases are called through typeof-guards, so the manager runs
// (and saves) with any subset of them present.

/** @satisfies {Record<string, any>} */
const StudioManager = {
    MONTHS: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],

    /** @type {Game | null} */
    game: null,
    /** @type {StudioState | null} */
    state: null,

    init(game) {
        this.game = game;
    },

    cfg() {
        const U = 'undefined';
        return {
            startCash: typeof STUDIO_START_CASH !== U ? STUDIO_START_CASH : 1000000,
            startFans: typeof STUDIO_START_FANS !== U ? STUDIO_START_FANS : 5,
            startYear: typeof STUDIO_START_YEAR !== U ? STUDIO_START_YEAR : 1950,
            upkeep: typeof STUDIO_LOT_UPKEEP !== U ? STUDIO_LOT_UPKEEP : 2500,
            marketSize: typeof PEOPLE_MARKET_SIZE !== U ? PEOPLE_MARKET_SIZE : 10,
            marketRefresh: typeof PEOPLE_MARKET_REFRESH !== U ? PEOPLE_MARKET_REFRESH : 3,
            startActors: typeof PEOPLE_START_ACTORS !== U ? PEOPLE_START_ACTORS : 3,
            startStaff: typeof PEOPLE_START_STAFF !== U ? PEOPLE_START_STAFF : 2,
            trainCost: typeof PEOPLE_TRAIN_COST !== U ? PEOPLE_TRAIN_COST : 4000,
            trainWeeks: typeof PEOPLE_TRAIN_WEEKS !== U ? PEOPLE_TRAIN_WEEKS : 3,
            trainGain: typeof PEOPLE_TRAIN_GAIN !== U ? PEOPLE_TRAIN_GAIN : 1,
        };
    },

    // --- new game ---------------------------------------------------------------------------

    newGame(studioName) {
        const c = this.cfg();
        const r = Rng.create('fabrika-' + Date.now());
        /** @type {StudioState} */
        const s = {
            studioName: studioName || 'Фабрика Грёз',
            cash: c.startCash,
            fans: c.startFans,
            rep: 20,
            weekIdx: 0,
            year: c.startYear,
            week: 1,
            seed: r.seed >>> 0,
            rngState: (r.seed >>> 0) + 1,
            roster: [],
            staff: [],
            market: [],
            marketIn: 0,
            ownedSets: {},
            orders: [],
            scripts: [],
            projects: [],
            released: [],
            awards: [],
            news: [],
            goals: [],
            stats: { films: 0, boxOffice: 0, bestScore: 0, awards: 0, weeks: 0 },
            settings: { speed: 1 },
            tutorialStep: 0,
        };
        this.state = s;
        this.rng = Rng.create(s.seed);
        // The founding troupe.
        for (let i = 0; i < c.startActors; i++) {
            s.roster.push(PeopleSystem.randomPerson(this.rng, { role: 'actor', minSkill: 2, maxSkill: i === 0 ? 8 : 6 }));
        }
        s.staff.push(PeopleSystem.randomPerson(this.rng, { role: 'writer', age: this.rng.range(30, 55), minSkill: 2, maxSkill: 7 }));
        s.staff.push(PeopleSystem.randomPerson(this.rng, { role: 'director', age: this.rng.range(28, 55), minSkill: 2, maxSkill: 7 }));
        for (const p of s.roster.concat(s.staff)) { p.loyalty = Math.max(p.loyalty, 55); }
        this.refreshMarket(true);
        this.pushNews('Студия «' + s.studioName + '» открыта! Город ждёт премьер.', 'good');
        return s;
    },

    /** A stable per-game random stream (saves carry rngState). */
    rand() {
        if (!this.rng) this.rng = Rng.create((this.state ? this.state.seed : 7) + (this.state ? this.state.weekIdx : 0));
        return this.rng.next();
    },

    rngObj() {
        if (!this.rng) this.rng = Rng.create(7);
        return this.rng;
    },

    // --- the weekly tick ----------------------------------------------------------------------

    tickWeek() {
        const s = this.state;
        const toasts = [];
        if (!s) return { toasts: toasts };
        const c = this.cfg();

        // The calendar.
        s.weekIdx++;
        s.week++;
        s.stats.weeks++;
        // A reproducible random stream per week: the same save -> the same events/market.
        this.rng = Rng.create(((s.seed ^ Math.imul(s.weekIdx + 1, 2654435761)) >>> 0) || 1);
        if (s.week > 52) {
            s.week = 1;
            s.year++;
            toasts.push('🎆 Наступил ' + s.year + ' год!');
            if (typeof PeopleSystem !== 'undefined' && PeopleSystem.yearly) {
                for (const t of PeopleSystem.yearly(s, this)) toasts.push(t);
            }
            if (typeof ReleaseSystem !== 'undefined' && ReleaseSystem.awardsCeremony) {
                const aw = ReleaseSystem.awardsCeremony(s);
                for (const a of aw) toasts.push(a);
            }
        }

        // Money out: salaries + upkeep + set maintenance.
        let wages = 0;
        for (const p of s.roster) wages += p.salary;
        for (const p of s.staff) wages += p.salary;
        const setCount = Object.keys(s.ownedSets).length;
        const upkeep = c.upkeep + setCount * 350;
        this.pay(wages + upkeep, 'Зарплаты и содержание');

        // People: moods settle, the school finishes courses, contracts and bonds live their life.
        if (typeof PeopleSystem !== 'undefined') {
            for (const p of s.roster.concat(s.staff)) {
                p.mood += (62 - p.mood) * 0.08;
                if (p.training) {
                    p.training.weeksLeft--;
                    if (p.training.weeksLeft <= 0) {
                        const gain = PeopleSystem.finishCourse(s, p);
                        p.training = null;
                        toasts.push('🎓 ' + p.name + ' заканчивает курс: ' + gain + '.');
                    }
                }
                p.age = this._ageFor(p);
            }
            for (const t of PeopleSystem.weekly(s, this)) toasts.push(t);
        }
        s.marketIn--;
        if (s.marketIn <= 0) this.refreshMarket(false);

        // The systems of the later phases (guarded so any subset boots).
        if (typeof ScriptGenerator !== 'undefined' && ScriptGenerator.weekly) {
            for (const t of ScriptGenerator.weekly(s, this)) toasts.push(t);
        }
        if (typeof ProductionSystem !== 'undefined' && ProductionSystem.weekly) {
            for (const t of ProductionSystem.weekly(s, this)) toasts.push(t);
        }
        if (typeof ReleaseSystem !== 'undefined' && ReleaseSystem.weekly) {
            for (const t of ReleaseSystem.weekly(s, this)) toasts.push(t);
        }
        if (typeof MetaSystem !== 'undefined' && MetaSystem.weekly) {
            for (const t of MetaSystem.weekly(s, this)) toasts.push(t);
        }

        // Fans drift toward the studio's recent worth.
        const target = Math.max(2, Math.min(100, 6 + s.stats.films * 2 + (s.stats.bestScore - 5) * 6 + s.rep * 0.3));
        s.fans += (target - s.fans) * 0.04;

        // The red zone.
        if (s.cash < 0) {
            toasts.push('🏦 Касса пуста! Студия в долгах: ' + StudioUI_money(s.cash));
            if (s.cash < -500000 && this.game) {
                this.game.modal(StudioUI_modalGameOver(s));
            }
        }
        if (typeof SaveSystem !== 'undefined' && SaveSystem.autosave) SaveSystem.autosave(s);
        return { toasts: toasts };
    },

    _ageFor(p) {
        // A person ages a year every 52 weeks from their debut — approximated by the calendar.
        const s = this.state;
        if (p._birthYear == null) p._birthYear = s.year - p.age;
        return s.year - p._birthYear;
    },

    refreshMarket(force) {
        const s = this.state;
        const c = this.cfg();
        s.market = [];
        const n = c.marketSize;
        for (let i = 0; i < n; i++) {
            const roll = this.rand();
            const role = roll < 0.62 ? 'actor' : roll < 0.78 ? 'director' : roll < 0.92 ? 'writer' : (roll < 0.97 ? 'editor' : 'marketer');
            const tier = this.rand();
            s.market.push(PeopleSystem.randomPerson(this.rngObj(), {
                role: role,
                minSkill: tier > 0.85 ? 4 : 1,
                maxSkill: tier > 0.85 ? 9 : tier > 0.5 ? 7 : 5,
            }));
        }
        s.marketIn = c.marketRefresh;
        if (force) { /* silent on a new game */ }
    },

    // --- money ---------------------------------------------------------------------------------

    pay(amount, label) {
        const s = this.state;
        s.cash -= amount;
        s.ledger = s.ledger || [];
        s.ledger.push({ week: s.weekIdx, amount: -amount, label: label });
        if (s.ledger.length > 200) s.ledger.shift();
        return s.cash >= 0;
    },

    earn(amount, label) {
        const s = this.state;
        s.cash += amount;
        s.ledger = s.ledger || [];
        s.ledger.push({ week: s.weekIdx, amount: amount, label: label });
        if (s.ledger.length > 200) s.ledger.shift();
    },

    canAfford(amount) { return this.state && this.state.cash >= amount; },

    // --- people ops ------------------------------------------------------------------------------

    hire(person, asRole) {
        const s = this.state;
        const i = s.market.indexOf(person);
        if (i < 0) return false;
        s.market.splice(i, 1);
        person.role = asRole || person.role;
        person.mood = Math.min(100, person.mood + 10);
        person.loyalty = Math.min(100, person.loyalty + 5);
        person.demand = null; person.offer = null;
        person.contract = PeopleSystem.makeContract(person);
        if (person.role === 'actor') s.roster.push(person);
        else s.staff.push(person);
        this.pushNews(person.name + ' (' + PeopleSystem.ROLE_RU[person.role] + ') подписывает контракт: ' + StudioUI_money(person.salary) + '/нед.', 'good');
        return true;
    },

    fire(person) {
        const s = this.state;
        let arr = s.roster, i = arr.indexOf(person);
        if (i < 0) { arr = s.staff; i = arr.indexOf(person); }
        if (i < 0) return false;
        arr.splice(i, 1);
        const severance = Math.round(person.salary * 4);
        this.pay(severance, 'Выходное пособие ' + person.name);
        person.mood = Math.max(0, person.mood - 30);
        this.pushNews(person.name + ' покидает студию (пособие ' + StudioUI_money(severance) + ').', 'bad');
        return true;
    },

    startTraining(person, skill) {
        const s = this.state;
        const course = PeopleSystem.courseInfo(skill);
        const known = PeopleSystem.SKILLS.indexOf(skill) >= 0;
        if (person.training) return false;
        if (known && (person.skills[skill] || 0) >= 10) return false;
        if (skill === 'charm' && person.charm >= 10) return false;
        if (!this.canAfford(course.cost)) return false;
        this.pay(course.cost, 'Курс «' + course.ru + '»: ' + person.name);
        person.training = { skill: skill, weeksLeft: course.weeks };
        return true;
    },

    // --- contracts: renew, counter a poach, let go -------------------------------------------------

    /** Accept the renewal demand: the raise lands in the salary and the term restarts. */
    renew(person) {
        const s = this.state;
        if (!person || !person.demand) return false;
        const raise = person.demand.raise;
        person.salary += raise;
        if (person.contract) person.contract.salary = person.salary;
        person.contract = PeopleSystem.makeContract(person);
        person.contract.salary = person.salary;
        person.demand = null;
        person.loyalty = Math.min(100, (person.loyalty || 50) + 10);
        person.mood = Math.min(100, person.mood + 8);
        this.pushNews(person.name + ' продлевает контракт: ' + StudioUI_money(person.salary) + '/нед.', '');
        return true;
    },

    /** Match the rival offer: expensive, but the star stays and remembers it. */
    counter(person) {
        const s = this.state;
        if (!person || !person.offer) return false;
        const want = person.offer.salary;
        const cost = Math.round((want - person.salary) * 8);   // a signing bonus of the difference
        if (!this.canAfford(cost)) return false;
        this.pay(cost, 'Подписной бонус: ' + person.name);
        person.salary = want;
        if (person.contract) person.contract.salary = want;
        person.offer = null;
        person.loyalty = Math.min(100, (person.loyalty || 50) + 15);
        this.pushNews(person.name + ' остаётся: студия перебила предложение конкурентов.', 'good');
        return true;
    },

    /** Decline the renewal: the person leaves without severance, but with a grudge. */
    letGo(person) {
        const s = this.state;
        if (!person || !person.demand) return false;
        person.demand = null;
        PeopleSystem.leave(s, this, person, 'отклонил(а) условия продления: студия отпустила.');
        return true;
    },

    // --- assets -----------------------------------------------------------------------------------

    buySet(setId) {
        const s = this.state;
        const info = MovieData.SET_INFO[setId];
        if (!info || s.ownedSets[setId]) return false;
        if (!this.canAfford(info.cost)) return false;
        this.pay(info.cost, 'Декорация: ' + info.ru);
        s.ownedSets[setId] = { level: 1 };
        this.pushNews('Построена декорация «' + info.ru + '» за ' + StudioUI_money(info.cost) + '.', 'good');
        return true;
    },

    pushNews(text, kind) {
        const s = this.state;
        if (!s) return;
        s.news.unshift({ week: s.weekIdx, year: s.year, weekOfYear: s.week, text: text, kind: kind || '' });
        if (s.news.length > 60) s.news.pop();
    },

    update(dt) {
        // Reserved: auto-advance and background sim smoothing live here (later phases).
    },
};

// Small formatting helpers used by the manager and the screens (defined once, guarded so the
// manager also runs in node tests without StudioUI).
function StudioUI_money(n) {
    const v = Math.round(n);
    const sign = v < 0 ? '−' : '';
    const a = Math.abs(v);
    if (a >= 1000000) return sign + '$' + (a / 1000000).toFixed(a >= 10000000 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    return sign + '$' + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function StudioUI_modalGameOver(s) {
    return '<div class="modal"><h2>БАНКРОТСТВО</h2>' +
        '<p class="lead">Долги студии превысили $500 000. Кредиторы забирают лот, декорации и даже ворота со звездой.</p>' +
        '<p class="hint">Фильмов снято: ' + s.stats.films + ' · Касса: ' + StudioUI_money(s.stats.boxOffice) + '</p>' +
        '<div class="btns"><span class="btn gold" data-act="menu">В главное меню</span></div></div>';
}
