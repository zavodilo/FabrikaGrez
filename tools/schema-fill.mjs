// ============================================================================
//  tools/schema-fill.mjs — keep the editor schema complete (dev-only)
// ----------------------------------------------------------------------------
//  node tools/schema-fill.mjs            append missing constants to the schema
//  node tools/schema-fill.mjs --check    report the debt without writing
//
//  The kit's invariant: every numeric constant the editor may patch lives in
//  _utils/editor/schema.js with a range and a bilingual label. Gameplay waves
//  add constants faster than hands write labels; this tool closes the debt with
//  honest heuristic entries (a grouped 'advanced' tab): colors by literal shape,
//  yes/no selects for 0/1 flags, ranges from the value's magnitude, labels from
//  a token dictionary (EN + RU), fallback — the humanized name in both columns.
//  Run tools/manifest.mjs afterwards to regenerate js/SceneSchema.js.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const DICT = {
    STUDIO: ['studio', 'студия'], PEOPLE: ['people', 'люди'], MOVIE: ['movie', 'кино'], CINEMA: ['cinema', 'кинозал'],
    CONTRACT: ['contract', 'контракт'], SALARY: ['salary', 'зарплата'], STAR: ['star', 'звёздность'], SKILL: ['skill', 'навык'],
    TRAIN: ['training', 'обучение'], POACH: ['poaching', 'переманивание'], RENEW: ['renewal', 'продление'], BOND: ['bond', 'связь'],
    SCANDAL: ['scandal', 'скандал'], ROMANCE: ['romance', 'романтика'], RETIRE: ['retirement', 'проводы'], AGE: ['age', 'возраст'],
    MARKET: ['market', 'биржа'], WEEK: ['week', 'неделя'], CASH: ['cash', 'касса'], FANS: ['fans', 'фанаты'], REP: ['reputation', 'репутация'],
    SCRIPT: ['script', 'сценарий'], SCENE: ['scene', 'сцена'], SHOT: ['shot', 'кадр'], BUDGET: ['budget', 'смета'], QUALITY: ['quality', 'качество'],
    RELEASE: ['release', 'прокат'], MARKETING: ['marketing', 'маркетинг'], REVIEW: ['review', 'рецензия'], AWARD: ['award', 'премия'],
    META: ['meta', 'мета'], SEQUEL: ['sequel', 'сиквел'], GOAL: ['goal', 'цель'], EVENT: ['event', 'событие'], ERA: ['era', 'эпоха'],
    WORLD3D: ['world', 'мир'], TERRAIN: ['terrain', 'земля'], CAMERA: ['camera', 'камера'], LOCATION: ['location', 'локация'],
    AUDIO: ['audio', 'звук'], SOUND: ['sound', 'звук'], MUSIC: ['music', 'музыка'], VOICE: ['voice', 'голос'],
    INK: ['ink', 'тушь'], TOON: ['toon', 'тун'], OUTLINE: ['outline', 'контур'], SHADOW: ['shadow', 'тени'], SUN: ['sun', 'солнце'],
    SKY: ['sky', 'небо'], FOG: ['fog', 'туман'], MATERIAL: ['material', 'материал'], MODEL: ['model', 'модель'],
    ACTOR: ['actor', 'актёр'], RIG: ['rig', 'риг'], PART: ['particles', 'частицы'], SETLIGHT: ['set light', 'свет площадки'],
    POSTFX: ['post', 'постобработка'], GFX: ['graphics', 'графика'], DOF: ['depth of field', 'глубина резкости'],
    TUTORIAL: ['tutorial', 'подсказки'], SAVE: ['save', 'сейв'], UI: ['ui', 'интерфейс'], GAME: ['game', 'игра'],
};
const WORDS = {
    MIN: ['min', 'мин'], MAX: ['max', 'макс'], SEC: ['sec', 'сек'], COST: ['cost', 'цена'], MULT: ['multiplier', 'множитель'],
    CHANCE: ['chance', 'шанс'], SPEED: ['speed', 'темп'], SIZE: ['size', 'размер'], COUNT: ['count', 'число'], N: ['count', 'число'],
    DEG: ['degrees', 'градусы'], COLOR: ['color', 'цвет'], I: ['strength', 'сила'], INTENSITY: ['strength', 'сила'],
    START: ['start', 'старт'], LOT: ['lot', 'лот'], BACKLOT: ['backlot', 'съёмочная площадка'], DEFAULT: ['default', 'по умолчанию'],
};

const humanize = (name) => {
    const tokens = name.split('_');
    const pick = (tok, dict) => (dict[tok] ? dict[tok] : null);
    const head = pick(tokens[0], DICT);
    const rest = tokens.slice(1).map((t) => (WORDS[t] ? WORDS[t] : [t.toLowerCase(), t.toLowerCase()]));
    const en = (head ? head[0] + ' ' : '') + rest.map((r) => r[0]).join(' ');
    const ru = (head ? head[1] + ': ' : '') + rest.map((r) => r[1]).join(' ');
    return { en: en || name.toLowerCase(), ru: ru || name.toLowerCase() };
};

const niceMax = (v) => {
    const a = Math.abs(v) || 1;
    const pow = Math.pow(10, Math.floor(Math.log10(a)));
    return Math.ceil((a * 2.5) / pow) * pow;
};
const niceStep = (max) => {
    const pow = Math.pow(10, Math.floor(Math.log10(max || 1)));
    return pow / (pow >= 10 ? 10 : 1) / (pow < 10 ? 1 : 1) || 1;
};

const schemaCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, '_utils/editor', 'schema.js'), 'utf8'), schemaCtx);
const KIT_SCHEMA = vm.runInContext('KIT_SCHEMA', schemaCtx);
const inSchema = new Set();
for (const g of KIT_SCHEMA) for (const f of g.fields) inSchema.add(f.name);

const src = fs.readFileSync(path.join(ROOT, 'js', 'Constants.js'), 'utf8');
const consts = [...src.matchAll(/^const ([A-Z0-9_]+)\s*=\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]);
const missing = consts.filter(([n, v]) => !inSchema.has(n) && /^(-?\d+(\.\d+)?|0x[0-9a-fA-F]+)$/.test(v));

if (CHECK) {
    console.log('schema debt: ' + missing.length + ' constants without editor entries' + (missing.length ? ': ' + missing.slice(0, 8).map((m) => m[0]).join(', ') + '…' : ''));
    process.exit(0);
}
if (!missing.length) { console.log('schema-fill: долга нет'); process.exit(0); }

const fields = missing.map(([name, raw]) => {
    const value = raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw);
    const label = humanize(name);
    if (raw.startsWith('0x') || /COLOR|SKY|TINT/.test(name)) {
        return `            { name: '${name}', kind: 'color',\n              label: { en: ${JSON.stringify(label.en)}, ru: ${JSON.stringify(label.ru)} },\n              hint: { en: 'Color constant of the simulation', ru: 'Цветовая константа симуляции' } },`;
    }
    if (value === 0 || value === 1) {
        return `            { name: '${name}', kind: 'select', options: SCHEMA_NO_YES,\n              label: { en: ${JSON.stringify(label.en)}, ru: ${JSON.stringify(label.ru)} },\n              hint: { en: 'Flag of the simulation', ru: 'Флаг симуляции' } },`;
    }
    const max = niceMax(value);
    const min = value < 0 ? -max : 0;
    const step = Number((max / 100).toPrecision(1));
    return `            { name: '${name}', min: ${min}, max: ${max}, step: ${step},\n              label: { en: ${JSON.stringify(label.en)}, ru: ${JSON.stringify(label.ru)} },\n              hint: { en: 'Simulation constant', ru: 'Константа симуляции' } },`;
});

const group = `    // Advanced: the simulation's tuning constants, auto-filled by tools/schema-fill.mjs so the
    // editor can patch every number the kit invariant promises. Labels are heuristic;
    // hands are welcome to refine any entry.
    {
        id: 'advanced',
        label: { en: 'Advanced', ru: 'Дополнительно' },
        fields: [
${fields.join('\n')}
        ],
    },
`;

const marker = 'const KIT_SCHEMA = [';
const i = src.indexOf(marker);
void i;
let sc = fs.readFileSync(path.join(ROOT, '_utils/editor', 'schema.js'), 'utf8');
// append the group before the closing of KIT_SCHEMA (the last `];` of the array literal)
const end = sc.lastIndexOf('];');
sc = sc.slice(0, end) + group + sc.slice(end);
fs.writeFileSync(path.join(ROOT, '_utils/editor', 'schema.js'), sc);
console.log('schema-fill: +' + fields.length + ' полей в группу advanced');
