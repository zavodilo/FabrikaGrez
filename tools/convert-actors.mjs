// ============================================================================
//  tools/convert-actors.mjs — dev-конвертация CC0-актёров в assets/models/actors
// ----------------------------------------------------------------------------
//  node tools/convert-actors.mjs --src=DIR [--only=substr] [--blender=bin]
//
//  DIR — корень распакованных CC0-паков (структура ниже в SRC_*). Каждый пак:
//    ac-survivors/, ac-retro/, ac-protagonists/ — Kenney Animated Characters
//      (kenney.nl, CC0): Model/characterMedium.fbx + Animations/{idle,jump,run}.fbx
//      + Skins/*.png — общий меш, скин-атлас 1024²;
//    kaykit/KayKit_Adventurers_2.0_FREE/Characters/gltf/*.glb — KayKit
//      Adventurers (kaylousberg.itch.io, CC0);
//    kaykit_skeletons/KayKit_Skeletons_1.1_FREE/characters/gltf/*.glb — KayKit
//      Skeletons (CC0);
//    kaykit_anims/KayKit_Character_Animations_1.1/Animations/gltf/Rig_{Medium,
//      Large}/*.glb + Mannequin Character/characters/*.glb — KayKit Character
//      Animations (CC0): общие клипы общего рига + манекены;
//    q_easy_enemies/, q_monsters/, q_knight/, q_robot/, q_dinosaurs/, q_animals/
//      — паки Quaternius (quaternius.itch.io, CC0), FBX со встроенными клипами.
//
//  Конвертер: blender -b -P tools/actors/convert.py -- '<job>' (см. convert.py).
//  Итог: assets/models/actors/*.glb — метры, Y-up, ноги на y=0, клипы = имена
//  экшенов; рост в рантайме дополнительно нормирует ActorRig3D._normalizeGlb
//  по каталогу ACTOR_MODELS (js/ActorModels.js).
// ============================================================================
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SRC = get('src', '');
const ONLY = get('only', '');
const BLENDER = get('blender', 'blender');
const OUTDIR = path.join(ROOT, 'assets', 'models', 'actors');
if (!SRC) { console.error('нужен --src=DIR (корень распакованных CC0-паков)'); process.exit(2); }

const src = (p) => path.join(SRC, p);
const out = (n) => path.join(OUTDIR, n);

// Клипы KayKit Rig_Medium для гуманоидов (16) и скелетов (+6 специальных).
const KAY_HUMAN = ['Idle_A', 'Idle_B', 'Walking_A', 'Walking_B', 'Running_A', 'Interact', 'Waving',
    'Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Attack_Kick', 'Cheering', 'Sit_Chair_Idle', 'Death_A',
    'Death_A_Pose', 'Sneaking', 'Work_A', 'PickUp'];
const KAY_SKEL = KAY_HUMAN.concat(['Skeletons_Idle', 'Skeletons_Walking', 'Skeletons_Death',
    'Skeletons_Death_Pose', 'Skeletons_Taunt', 'Skeletons_Awaken_Standing']);
const KAY_LARGE = ['Idle_A', 'Idle_B', 'Walking_A', 'Running_A', 'Melee_Unarmed_Punch',
    'Melee_Unarmed_Kick', 'Melee_Unarmed_Smash', 'Flexing', 'Death_A', 'Death_A_Pose', 'Hit_A'];
const RM = 'kaykit_anims/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/Rig_Medium_';
const RL = 'kaykit_anims/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Large/Rig_Large_';
const KAY_HUMAN_ANIMS = [RM + 'General.glb', RM + 'MovementBasic.glb', RM + 'MovementAdvanced.glb',
    RM + 'Simulation.glb', RM + 'CombatMelee.glb', RM + 'Tools.glb'];
const KAY_SKEL_ANIMS = KAY_HUMAN_ANIMS.concat([RM + 'Special.glb']);
const KAY_LARGE_ANIMS = [RL + 'General.glb', RL + 'MovementBasic.glb', RL + 'CombatMelee.glb',
    RL + 'Simulation.glb'];

const KENNEY_PACKS = {
    'ac-survivors': ['survivorFemaleA', 'survivorMaleB', 'zombieA', 'zombieC'],
    'ac-retro': ['humanFemaleA', 'humanMaleA', 'zombieFemaleA', 'zombieMaleA'],
    'ac-protagonists': ['criminalMaleA', 'cyborgFemaleA', 'skaterFemaleA', 'skaterMaleA'],
};
const KAY_CHARS = {
    'kaykit/KayKit_Adventurers_2.0_FREE/Characters/gltf/': ['Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded'],
    'kaykit_skeletons/KayKit_Skeletons_1.1_FREE/characters/gltf/': ['Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'],
};
const Q_FBX = [
    ['q_easy_enemies/Easy Animated Enemy Pack - Jan 2019/FBX/Frog.fbx', 'q_Frog.glb', 0.6],
    ['q_easy_enemies/Easy Animated Enemy Pack - Jan 2019/FBX/Rat.fbx', 'q_Rat.glb', 0.45],
    ['q_easy_enemies/Easy Animated Enemy Pack - Jan 2019/FBX/Snake.fbx', 'q_Snake.glb', 0.7],
    ['q_easy_enemies/Easy Animated Enemy Pack - Jan 2019/FBX/Snake_angry.fbx', 'q_Snake_angry.glb', 0.8],
    ['q_easy_enemies/Easy Animated Enemy Pack - Jan 2019/FBX/Wasp.fbx', 'q_Wasp.glb', 0.7],
    ['q_easy_enemies/Easy Animated Enemy Pack - Jan 2019/FBX/Spider.fbx', 'q_Spider.glb', 0.6],
    ['q_monsters/FBX/Bat.fbx', 'q_Bat.glb', 0.5],
    ['q_monsters/FBX/Slime.fbx', 'q_Slime.glb', 0.65],
    ['q_monsters/FBX/Skeleton.fbx', 'q_Skeleton.glb', 1.65],
    ['q_monsters/FBX/Dragon.fbx', 'q_Dragon.glb', 3.0],
    ['q_knight/FBX/KnightCharacter.fbx', 'q_Knight.glb', 1.8],
    ['q_robot/FBX/Robot.fbx', 'q_Robot.glb', 1.7],
    ['q_dinosaurs/Dinosaur Animated Pack - Dec 2018/FBX/Trex.fbx', 'q_Trex.glb', 3.2],
    ['q_dinosaurs/Dinosaur Animated Pack - Dec 2018/FBX/Velociraptor.fbx', 'q_Velociraptor.glb', 1.7],
    ['q_dinosaurs/Dinosaur Animated Pack - Dec 2018/FBX/Triceratops.fbx', 'q_Triceratops.glb', 2.2],
    ['q_dinosaurs/Dinosaur Animated Pack - Dec 2018/FBX/Stegosaurus.fbx', 'q_Stegosaurus.glb', 2.3],
    ['q_dinosaurs/Dinosaur Animated Pack - Dec 2018/FBX/Parasaurolophus.fbx', 'q_Parasaurolophus.glb', 2.5],
    ['q_dinosaurs/Dinosaur Animated Pack - Dec 2018/FBX/Apatosaurus.fbx', 'q_Apatosaurus.glb', 4.0],
    ['q_animals/FBX/Cow.fbx', 'q_Cow.glb', 1.4],
    ['q_animals/FBX/Horse.fbx', 'q_Horse.glb', 1.8],
    ['q_animals/FBX/Llama.fbx', 'q_Llama.glb', 1.7],
    ['q_animals/FBX/Pig.fbx', 'q_Pig.glb', 0.75],
    ['q_animals/FBX/Pug.fbx', 'q_Pug.glb', 0.5],
    ['q_animals/FBX/Sheep.fbx', 'q_Sheep.glb', 0.85],
    ['q_animals/FBX/Zebra.fbx', 'q_Zebra.glb', 1.6],
];

/** @type {any[]} */
const JOBS = [];
for (const [pack, skins] of Object.entries(KENNEY_PACKS)) {
    for (const skin of skins) {
        JOBS.push({
            type: 'kenney', name: 'ken_' + skin,
            model: src(pack + '/Model/characterMedium.fbx'),
            anims: { Idle: src(pack + '/Animations/idle.fbx'), Jump: src(pack + '/Animations/jump.fbx'), Run: src(pack + '/Animations/run.fbx') },
            skin: src(pack + '/Skins/' + skin + '.png'),
            targetM: 1.7, out: out('ken_' + skin + '.glb'),
        });
    }
}
for (const [dir, names] of Object.entries(KAY_CHARS)) {
    for (const n of names) {
        const skel = n.startsWith('Skeleton_');
        JOBS.push({
            type: 'kaykit', name: 'kay_' + n,
            char: src(dir + n + '.glb'),
            anims: (skel ? KAY_SKEL_ANIMS : KAY_HUMAN_ANIMS).map(src),
            clips: skel ? KAY_SKEL : KAY_HUMAN,
            targetM: skel ? 1.68 : 1.7, out: out('kay_' + n + '.glb'),
        });
    }
}
JOBS.push({
    type: 'kaykit', name: 'kay_Mannequin_Medium',
    char: src('kaykit_anims/KayKit_Character_Animations_1.1/Mannequin Character/characters/Mannequin_Medium.glb'),
    anims: KAY_HUMAN_ANIMS.map(src), clips: KAY_HUMAN,
    targetM: 1.75, out: out('kay_Mannequin_Medium.glb'),
});
JOBS.push({
    type: 'kaykit', name: 'kay_Mannequin_Large',
    char: src('kaykit_anims/KayKit_Character_Animations_1.1/Mannequin Character/characters/Mannequin_Large.glb'),
    anims: KAY_LARGE_ANIMS.map(src), clips: KAY_LARGE,
    targetM: 2.0, out: out('kay_Mannequin_Large.glb'),
});
for (const [rel, name, targetM] of Q_FBX) {
    JOBS.push({ type: 'fbx', name: name.replace(/\.glb$/, ''), src: src(rel), targetM, out: out(name) });
}

fs.mkdirSync(OUTDIR, { recursive: true });
let ok = 0, fail = 0;
for (const job of JOBS) {
    if (ONLY && !job.name.toLowerCase().includes(ONLY.toLowerCase())) continue;
    const r = spawnSync(BLENDER, ['-b', '-P', path.join(ROOT, 'tools', 'actors', 'convert.py'), '--', JSON.stringify(job)],
        { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    const log = (r.stdout || '') + (r.stderr || '');
    const done = log.includes('CONVERT OK');
    if (done && fs.existsSync(job.out)) {
        const kb = Math.round(fs.statSync(job.out).size / 1024);
        // клипы из JSON-чанка GLB
        const buf = fs.readFileSync(job.out);
        const jl = buf.readUInt32LE(12);
        let anims = [];
        try { anims = (JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')).animations || []).map((a) => a.name); } catch { /* */ }
        console.log('ok   ' + job.name + '  ' + kb + ' КБ, клипов: ' + anims.length + (anims.length ? ' [' + anims.join(', ').slice(0, 110) + ']' : ''));
        ok++;
    } else {
        console.log('FAIL ' + job.name);
        console.log(log.split('\n').filter((l) => /Error|error|WARN/.test(l)).slice(0, 6).join('\n'));
        fail++;
    }
}
console.log('готово: ' + ok + ', провалов: ' + fail);
process.exitCode = fail ? 1 : 0;
