// SaveSystem.js — saves, slots, export/import (Phase З). The whole game state is plain JSON
// (people, scripts with their timelines, projects, released films), so a save is a snapshot:
// one autosave plus three manual slots through the kit's Store (localStorage with a sandbox
// fallback), plus export/import of a .json file. Loading restores the state AND the module
// counters, so ids never collide after a load.
//
//   SaveSystem.save(state, slot) / load(slot)      — manual slots 1..3
//   SaveSystem.autosave(state) / loadAuto()        — the weekly autosave
//   SaveSystem.hasAny() / slotsInfo()              — for the menu and the «Ещё» screen
//   SaveSystem.exportJSON(state) / importJSON(txt) — a file the player owns
//
// StudioManager.tickWeek calls autosave(); StudioUI's menu «Продолжить» calls loadAuto();
// the «Ещё» screen wires the slot buttons here through data-act="save:N" / "load:N".

/** @satisfies {Record<string, any>} */
const SaveSystem = {

    VERSION: 1,
    KEY_AUTO: 'fg.save.auto',
    KEY_SLOT: 'fg.save.slot',

    cfg() {
        return { version: this.VERSION };
    },

    // --- serialize / restore ---------------------------------------------------------------------

    /** The state as a storable object: everything the game needs to resume, plus a stamp. */
    serialize(state) {
        return {
            v: this.VERSION,
            game: GAME_VERSION_SAFE(),
            savedAt: Date.now(),
            state: state,
        };
    },

    /** Put a loaded state back into the running game. Returns true on success. */
    restore(blob, game) {
        if (!blob || typeof blob !== 'object') return false;
        if (blob.v !== this.VERSION) return false;
        const s = blob.state;
        if (!s || !Array.isArray(s.roster) || !Array.isArray(s.scripts)) return false;
        StudioManager.state = s;
        /** @type {any} */ (StudioManager).rng = Rng.create(((s.seed ^ Math.imul(s.weekIdx + 1, 2654435761)) >>> 0) || 1);
        // Module counters must jump past every id in the save, or new people would clash.
        let maxPerson = 0;
        const bump = (id) => {
            const m = /^p(\d+)$/.exec(String(id || ''));
            if (m) maxPerson = Math.max(maxPerson, Number(m[1]));
        };
        for (const p of (s.roster || [])) bump(p.id);
        for (const p of (s.staff || [])) bump(p.id);
        for (const p of (s.market || [])) bump(p.id);
        if (typeof PeopleSystem !== 'undefined') PeopleSystem._nextId = maxPerson + 1;
        if (game) {
            game.started = true;
            game._setHud(true);
            game.showScreen('studio');
            game.refreshScreen();
            game._updateHud(999);
        }
        return true;
    },

    // --- slots --------------------------------------------------------------------------------------

    _write(key, blob) {
        const ok = Store.set(key, JSON.stringify(blob));
        // A closed storage (node sims, sandboxed iframes) is normal: say so once, not weekly.
        if (!ok && !this._warnedStorage && typeof console !== 'undefined') {
            this._warnedStorage = true;
            console.warn('SaveSystem: хранилище закрыто — сохранения работают только в браузере с разрешённым localStorage.');
        }
        return ok;
    },

    _read(key) {
        const raw = Store.getJSON(key, null);
        return raw;
    },

    save(state, slot) {
        if (!state) return false;
        return this._write(this.KEY_SLOT + slot, this.serialize(state));
    },

    load(slot, game) {
        const blob = this._read(this.KEY_SLOT + slot);
        return this.restore(blob, game);
    },

    autosave(state) {
        if (!state) return false;
        return this._write(this.KEY_AUTO, this.serialize(state));
    },

    loadAuto(game) {
        return this.load_('auto', game);
    },

    load_(which, game) {
        const blob = this._read(which === 'auto' ? this.KEY_AUTO : this.KEY_SLOT + which);
        return this.restore(blob, game);
    },

    hasAny() {
        if (this._read(this.KEY_AUTO)) return true;
        for (let i = 1; i <= 3; i++) if (this._read(this.KEY_SLOT + i)) return true;
        return false;
    },

    /** A one-line summary per slot for the «Ещё» screen. */
    slotsInfo() {
        const parts = [];
        const fmt = (blob) => {
            if (!blob || !blob.state) return 'пусто';
            const s = blob.state;
            return '«' + (s.studioName || '—') + '» · ' + (s.year || '—') + ' · ' +
                StudioUI_money(s.cash || 0) + ' · фильмов ' + ((s.stats || {}).films || 0);
        };
        parts.push('авто: ' + fmt(this._read(this.KEY_AUTO)));
        for (let i = 1; i <= 3; i++) parts.push('слот ' + i + ': ' + fmt(this._read(this.KEY_SLOT + i)));
        return parts.join(' · ');
    },

    // --- export / import -------------------------------------------------------------------------------

    /** A .json file the player owns: downloaded by the browser. */
    exportJSON(state) {
        const text = JSON.stringify(this.serialize(state), null, 1);
        if (typeof document === 'undefined') return text;
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fabrika-grez-' + (state ? state.year : 0) + '-week' + (state ? state.weekIdx : 0) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return text;
    },

    /** Parse and apply an exported file. Returns true on success. */
    importJSON(text, game) {
        let blob = null;
        try { blob = JSON.parse(text); } catch (e) { return false; }
        return this.restore(blob, game);
    },
};

/** GAME_VERSION without assuming the constant is present (node tests). */
function GAME_VERSION_SAFE() {
    return typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '0.0.0';
}
