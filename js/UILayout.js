// UILayout.js — the game's UI layout: every HUD element, placed and styled in the editor (UI tab).
// The editor rewrites the whole file (POST /api/save-ui) — keep the format. Drawn by js/UI.js;
// game code takes an element by id: UI.get('score').setText('10') — and never positions HUD itself.
//   kind — 'text' | 'panel' | 'bar' | 'button' | 'screen'; anchor — one of 9 screen points
//   ('top-left' … 'bottom-right'): x, y go from it to the same point of the element (inward
//   from an edge, signed from the center); w, h — px; numbers are px of a screen
//   UI_REF_HEIGHT tall;
//   colors — '#rrggbb', '' — none; visible: 0 — hidden until the game calls show().
//   Records go in drawing order: later — on top.
const UI_LAYOUT = [
    { id: 'hudPanel', kind: 'panel', anchor: 'top-left', x: 8, y: 8, w: 480, h: 46, fill: '#0e1320', border: '#26304a', radius: 12, alpha: 0.85, visible: 1 },
    { id: 'hudLogo', kind: 'text', anchor: 'top-left', x: 20, y: 19, text: "🎬 ФАБРИКА ГРЁЗ", fontSize: 14, color: '#e8c87a', shadow: '#000000', alpha: 0.95, visible: 1 },
    { id: 'hudMoney', kind: 'text', anchor: 'top-left', x: 200, y: 16, text: "$1 000 000", fontSize: 19, color: '#8ac87a', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'hudDate', kind: 'text', anchor: 'top-center', x: 0, y: 18, text: "1950 · неделя 1", fontSize: 16, color: '#e8e2d4', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'hudFans', kind: 'text', anchor: 'top-right', x: 20, y: 18, text: "♥ поклонники 5", fontSize: 15, color: '#e88aa0', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'btnNavStudio', kind: 'button', anchor: 'bottom-left', x: 12, y: 14, w: 112, h: 44, text: "Студия", fontSize: 13, color: '#cfd6e4', fill: '#1c2434', border: '#33405a', radius: 9, alpha: 1, visible: 1 },
    { id: 'btnNavPeople', kind: 'button', anchor: 'bottom-left', x: 132, y: 14, w: 112, h: 44, text: "Люди", fontSize: 13, color: '#cfd6e4', fill: '#1c2434', border: '#33405a', radius: 9, alpha: 1, visible: 1 },
    { id: 'btnNavFilms', kind: 'button', anchor: 'bottom-left', x: 252, y: 14, w: 130, h: 44, text: "🎥 Снять фильм", fontSize: 12.5, color: '#1a1408', fill: '#d8b25a', border: '', radius: 9, alpha: 1, visible: 1 },
    { id: 'btnNavCinema', kind: 'button', anchor: 'bottom-left', x: 390, y: 14, w: 118, h: 44, text: "Кинотеатр", fontSize: 13, color: '#cfd6e4', fill: '#1c2434', border: '#33405a', radius: 9, alpha: 1, visible: 1 },
    { id: 'btnNavMore', kind: 'button', anchor: 'bottom-left', x: 516, y: 14, w: 92, h: 44, text: "Ещё ▾", fontSize: 13, color: '#cfd6e4', fill: '#1c2434', border: '#33405a', radius: 9, alpha: 1, visible: 1 },
    { id: 'btnWeek', kind: 'button', anchor: 'bottom-right', x: 16, y: 14, w: 250, h: 52, text: "Следующая неделя ▶", fontSize: 15, color: '#1a1408', fill: '#d8b25a', border: '', radius: 12, alpha: 1, visible: 1 },
    { id: 'toastPanel', kind: 'panel', anchor: 'bottom-center', x: 0, y: 84, w: 640, h: 44, fill: '#141b28', border: '#c8a24a', radius: 10, alpha: 0.95, visible: 0 },
    { id: 'toastText', kind: 'text', anchor: 'bottom-center', x: 0, y: 96, text: "", fontSize: 14, color: '#e8e2d4', shadow: '#000000', alpha: 1, visible: 0 },
    { id: 'fpsText', kind: 'text', anchor: 'top-right', x: 20, y: 46, text: "", fontSize: 11, color: '#ffffff', shadow: '#000000', alpha: 0.35, visible: 0 },
    { id: 'screenMain', kind: 'screen', anchor: 'top-left', x: 0, y: 0, w: 2560, h: 1440, fill: '#0b0e15', border: '', radius: 0, alpha: 0.97, visible: 0, bleed: 1 },
    { id: 'screenModal', kind: 'screen', anchor: 'middle-center', x: 0, y: 0, w: 760, h: 540, fill: '#141b28', border: '#c8a24a', radius: 14, alpha: 1, visible: 0, bleed: 0 },
    { id: 'cineFx', kind: 'screen', anchor: 'top-left', x: 0, y: 0, w: 2560, h: 1440, fill: '', border: '', radius: 0, alpha: 1, visible: 0, bleed: 1 },
    { id: 'lbTop', kind: 'panel', anchor: 'top-center', x: 0, y: 0, w: 2560, h: 64, fill: '#000000', border: '', radius: 0, alpha: 1, visible: 0 },
    { id: 'lbBot', kind: 'panel', anchor: 'bottom-center', x: 0, y: 0, w: 2560, h: 64, fill: '#000000', border: '', radius: 0, alpha: 1, visible: 0 },
    { id: 'subPanel', kind: 'panel', anchor: 'bottom-center', x: 0, y: 80, w: 980, h: 84, fill: '#000000', border: '', radius: 12, alpha: 0.55, visible: 0 },
    { id: 'subText', kind: 'text', anchor: 'bottom-center', x: 0, y: 104, text: "", fontSize: 21, color: '#ffffff', shadow: '#000000', alpha: 1, visible: 0 },
    { id: 'subSpeaker', kind: 'text', anchor: 'bottom-center', x: 0, y: 142, text: "", fontSize: 13, color: '#e8c87a', shadow: '#000000', alpha: 1, visible: 0 },
    { id: 'cineScene', kind: 'text', anchor: 'bottom-left', x: 18, y: 74, text: "", fontSize: 12, color: '#e8d8a8', shadow: '#000000', alpha: 0.8, visible: 0 },
    { id: 'cineTime', kind: 'text', anchor: 'bottom-right', x: 18, y: 74, text: "", fontSize: 12, color: '#e8d8a8', shadow: '#000000', alpha: 0.8, visible: 0 },
    { id: 'cineBar', kind: 'bar', anchor: 'bottom-center', x: 0, y: 10, w: 920, h: 7, value: 0, color: '#c8a24a', fill: '#000000', border: '', radius: 4, alpha: 0.85, visible: 0 },
    { id: 'fade', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 2560, h: 1440, fill: '#000000', border: '', radius: 0, alpha: 0, visible: 0 },
    { id: 'cineCard', kind: 'screen', anchor: 'top-left', x: 0, y: 0, w: 2560, h: 1440, fill: '', border: '', radius: 0, alpha: 1, visible: 0, bleed: 1 },
    { id: 'btnCinePlay', kind: 'button', anchor: 'bottom-center', x: -165, y: 26, w: 104, h: 42, text: "❚❚ Пауза", fontSize: 13, color: '#cfd6e4', fill: '#1c2434', border: '#33405a', radius: 9, alpha: 1, visible: 0 },
    { id: 'btnCineSpeed', kind: 'button', anchor: 'bottom-center', x: 0, y: 26, w: 88, h: 42, text: "1×", fontSize: 14, color: '#cfd6e4', fill: '#1c2434', border: '#33405a', radius: 9, alpha: 1, visible: 0 },
    { id: 'btnCineStop', kind: 'button', anchor: 'bottom-center', x: 152, y: 26, w: 110, h: 42, text: "✕ Выйти", fontSize: 13, color: '#f0d8d0', fill: '#4a2222', border: '#7a3a3a', radius: 9, alpha: 1, visible: 0 },
];
