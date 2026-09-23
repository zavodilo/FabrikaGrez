// Tutorial.js — the first steps (Phase З). A short ladder of hints that watches the game
// state and speaks only when the player actually reaches the next rung: no modal walls,
// just a 💡 toast at the right moment, and only while «подсказки» are on in the settings.
//
//   Tutorial.maybeTip(game)   — call from the frame loop / screen changes; toasts the next step
//   Tutorial.reset(state)     — a new game starts the ladder over

/** @satisfies {Record<string, any>} */
const Tutorial = {

    STEPS: [
        {
            id: 'set', ru: 'Постройте декорацию на экране «Студия»: без павильона фильм негде снимать.',
            done: (s) => Object.keys(s.ownedSets || {}).length >= 1,
        },
        {
            id: 'script', ru: 'Нажмите «🎥 Снять фильм»: выберите жанр и закажите сценарий у сценариста.',
            done: (s) => (s.scripts || []).length >= 1 || (s.orders || []).length >= 1,
        },
        {
            id: 'cast', ru: 'Сценарий готов? Откройте его и соберите каст: авто-кастинг подскажет, кто тянет роль.',
            done: (s) => (s.scripts || []).some((sc) => sc.cast && typeof CastingSystem !== 'undefined' && CastingSystem.isComplete(s, sc)),
        },
        {
            id: 'shoot', ru: 'Каст собран — жмите «В производство» и следите за съёмочным листом по неделям.',
            done: (s) => (s.projects || []).length >= 1,
        },
        {
            id: 'post', ru: 'Сцены сняты? Дневники и черновой монтаж уже смотрятся. Доведите съёмки до монтажной.',
            done: (s) => (s.projects || []).some((p) => p.state !== 'shooting'),
        },
        {
            id: 'release', ru: 'В монтажной выберите темп и музыку, дайте кампанию денег и устраивайте премьеру.',
            done: (s) => (s.released || []).length >= 1,
        },
        {
            id: 'watch', ru: 'Фильм в прокате. Когда сойдёт с экранов — посмотрите его в «Кинотеатре»: это ваше кино.',
            done: (s) => (s.released || []).some((m) => m.state === 'done'),
        },
    ],

    reset(state) {
        if (state) state.tutStep = 0;
    },

    /** The first step the player has not reached yet, or null when the ladder is done. */
    current(state) {
        for (let i = 0; i < this.STEPS.length; i++) {
            let ok = false;
            try { ok = !!this.STEPS[i].done(state); } catch (e) { ok = false; }
            if (!ok) return i;
        }
        return null;
    },

    /** Toast the next hint exactly once per rung; silent when hints are off or the ladder is done. */
    maybeTip(game) {
        const s = StudioManager.state;
        if (!s || !game || !game.started) return null;
        if (s.settings && s.settings.hints === false) return null;
        const cur = this.current(s);
        if (cur == null) {
            if (s.tutStep !== 'done') {
                s.tutStep = 'done';
                game.toast('🎓 Обучение пройдено: дальше — ваша воля. Сиквелы, награды, эпохи и сто миллионов сборов.');
            }
            return null;
        }
        if (s.tutStep !== cur) {
            s.tutStep = cur;
            game.toast('💡 Шаг ' + (cur + 1) + '/' + this.STEPS.length + ': ' + this.STEPS[cur].ru);
            return cur;
        }
        return null;
    },
};
