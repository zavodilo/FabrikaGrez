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
        const base = p.role === 'actor' ? 500 : 420;
        const ageFactor = p.age < 22 ? 0.75 : p.age > 55 ? 0.85 : 1;
        return Math.round((base + t * t * 85 + p.star * 500 + p.charm * 25) * ageFactor / 10) * 10;
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
};
