// ============================================================================
//  ActorModels.js — каталог CC0-моделей актёров (assets/models/actors/*.glb).
// ----------------------------------------------------------------------------
//  У каждого актёра студии — своя модель: люди, роботы, зомби, скелеты, рыцари,
//  монстры, динозавры и звери. Источники (все CC0, атрибуция — NOTICE):
//    ken_* — Kenney Animated Characters (retro/survivors/protagonists): общий
//            меш characterMedium, скин-атлас, клипы Idle/Jump/Run;
//    kay_* — KayKit Adventurers / Skeletons / Mannequins + KayKit Character
//            Animations: общий риг Rig_Medium/Large, 11–22 клипа;
//    q_*   — Quaternius (Easy Enemies, Monsters, Knight, Robot, Dinosaurs,
//            Farm Animals): свои наборы клипов на персонажа;
//    robot — RobotExpressive (Tomás Laulhé), первая CC0-модель студии.
//  Конвертация и нормирование роста: tools/convert-actors.mjs (Blender 3.4).
//
//  Поля записи: id; ru — сценическое имя для UI; url — литерал ассета; kind и
//  badge — типаж и иконка аватара; gender ('m'|'f'|'any') — ампуа для кастинга;
//  height — целевой рост в px (ActorRig3D._normalizeGlb нормирует AABB к нему,
//  люди — 170, динозавр — до 400); clips — карта 19 действий ActorRig3D.ACTIONS
//  на имена клипов файла; palette — цвета для CSS-аватара StudioUI.avatar.
//
//  Чистые данные + выбор на Rng: без DOM, без pc.* (инварианты кита).
// ============================================================================

// Карты клипов по семействам (19 действий: idle walk run talk gesture wave
// punch kick kiss dance sit drive ride cheer fall dead sneak look crew).
const KEN_CLIPS = {
    idle: 'Idle', walk: 'Run', run: 'Run', talk: 'Idle', gesture: 'Jump', wave: 'Jump',
    punch: 'Jump', kick: 'Jump', kiss: 'Idle', dance: 'Jump', sit: 'Idle', drive: 'Idle',
    ride: 'Idle', cheer: 'Jump', fall: 'Jump', dead: 'Idle', sneak: 'Run', look: 'Idle', crew: 'Idle',
};
const KAY_CLIPS = {
    idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', talk: 'Idle_B', gesture: 'Interact',
    wave: 'Waving', punch: 'Melee_Unarmed_Attack_Punch_A', kick: 'Melee_Unarmed_Attack_Kick',
    kiss: 'PickUp', dance: 'Cheering', sit: 'Sit_Chair_Idle', drive: 'Sit_Chair_Idle',
    ride: 'Sit_Chair_Idle', cheer: 'Cheering', fall: 'Death_A', dead: 'Death_A_Pose',
    sneak: 'Sneaking', look: 'Idle_A', crew: 'Work_A',
};
const KAY_SKEL_CLIPS = Object.assign({}, KAY_CLIPS, {
    idle: 'Skeletons_Idle', walk: 'Skeletons_Walking', talk: 'Skeletons_Idle',
    gesture: 'Skeletons_Taunt', dance: 'Skeletons_Taunt', cheer: 'Skeletons_Awaken_Standing',
    fall: 'Skeletons_Death', dead: 'Skeletons_Death_Pose', look: 'Skeletons_Idle',
});
const KAY_LARGE_CLIPS = {
    idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', talk: 'Idle_B', gesture: 'Melee_Unarmed_Smash',
    wave: 'Flexing', punch: 'Melee_Unarmed_Punch', kick: 'Melee_Unarmed_Kick', kiss: 'Idle_B',
    dance: 'Flexing', sit: 'Idle_B', drive: 'Idle_B', ride: 'Idle_B', cheer: 'Flexing',
    fall: 'Death_A', dead: 'Death_A_Pose', sneak: 'Walking_A', look: 'Idle_A', crew: 'Idle_B',
};
const ROBOT_CLIPS = {
    idle: 'Idle', walk: 'Walking', run: 'Running', talk: 'Idle', gesture: 'Yes', wave: 'Wave',
    punch: 'Punch', kick: 'Punch', kiss: 'ThumbsUp', dance: 'Dance', sit: 'Sitting',
    drive: 'Sitting', cheer: 'ThumbsUp', fall: 'Death', dead: 'Death', sneak: 'Walking',
    ride: 'Sitting', look: 'Idle', crew: 'Standing',
};
const Q_ROBOT_CLIPS = {
    idle: 'Robot_Idle', walk: 'Robot_Walking', run: 'Robot_Running', talk: 'Robot_Idle',
    gesture: 'Robot_Yes', wave: 'Robot_Wave', punch: 'Robot_Punch', kick: 'Robot_Punch',
    kiss: 'Robot_ThumbsUp', dance: 'Robot_Dance', sit: 'Robot_Sitting', drive: 'Robot_Sitting',
    ride: 'Robot_Sitting', cheer: 'Robot_ThumbsUp', fall: 'Robot_Death', dead: 'Robot_Death',
    sneak: 'Robot_Walking', look: 'Robot_Idle', crew: 'Robot_Standing',
};
const Q_KNIGHT_CLIPS = {
    idle: 'Idle', walk: 'Walking', run: 'Run', talk: 'Idle_swordLeft', gesture: 'swordAttackJump',
    wave: 'Jump', punch: 'Run_swordAttack', kick: 'Roll', kiss: 'Idle_swordRight',
    dance: 'Roll_sword', sit: 'Idle', drive: 'Idle', ride: 'Run_swordRight', cheer: 'Jump',
    fall: 'Death', dead: 'Death', sneak: 'Walking', look: 'Idle', crew: 'Idle_swordRight',
};
// «прыгающие» семейства Quaternius: Attack/Death/Idle/Jump (+Walk/Run где есть).
const qClips = (p, extra) => Object.assign({
    idle: p + '_Idle', walk: p + '_Jump', run: p + '_Jump', talk: p + '_Idle',
    gesture: p + '_Attack', wave: p + '_Jump', punch: p + '_Attack', kick: p + '_Attack',
    kiss: p + '_Idle', dance: p + '_Jump', sit: p + '_Idle', drive: p + '_Idle',
    ride: p + '_Idle', cheer: p + '_Jump', fall: p + '_Death', dead: p + '_Death',
    sneak: p + '_Jump', look: p + '_Idle', crew: p + '_Idle',
}, extra || {});
const Q_FROG_CLIPS = qClips('Frog');
const Q_SPIDER_CLIPS = qClips('Spider', { walk: 'Spider_Walk', run: 'Spider_Walk', sneak: 'Spider_Walk' });
const Q_RAT_CLIPS = qClips('Rat', { walk: 'Rat_Walk', run: 'Rat_Run', sneak: 'Rat_Walk' });
const Q_SNAKE_CLIPS = qClips('Snake', { walk: 'Snake_Walk', run: 'Snake_Walk', sneak: 'Snake_Walk', fall: 'Snake_Jump', dead: 'Snake_Idle' });
const Q_SNAKE_ANGRY_CLIPS = qClips('Snake', { walk: 'Snake_Walk', run: 'Snake_Walk', sneak: 'Snake_Walk', fall: 'Snake_Jump', dead: 'Snake_Idle' });
const Q_WASP_CLIPS = qClips('Wasp', { idle: 'Wasp_Flying', walk: 'Wasp_Flying', run: 'Wasp_Flying', talk: 'Wasp_Flying', wave: 'Wasp_Flying', kiss: 'Wasp_Flying', dance: 'Wasp_Flying', sit: 'Wasp_Flying', drive: 'Wasp_Flying', ride: 'Wasp_Flying', cheer: 'Wasp_Flying', sneak: 'Wasp_Flying', look: 'Wasp_Flying', crew: 'Wasp_Flying' });
const Q_BAT_CLIPS = qClips('Bat', { idle: 'Bat_Flying', walk: 'Bat_Flying', run: 'Bat_Flying', talk: 'Bat_Flying', punch: 'Bat_Attack2', wave: 'Bat_Flying', kiss: 'Bat_Flying', dance: 'Bat_Flying', sit: 'Bat_Flying', drive: 'Bat_Flying', ride: 'Bat_Flying', cheer: 'Bat_Flying', sneak: 'Bat_Flying', look: 'Bat_Flying', crew: 'Bat_Flying' });
const Q_SLIME_CLIPS = qClips('Slime', { walk: 'Slime_Walk', run: 'Slime_Walk', sneak: 'Slime_Walk', wave: 'Slime_Walk', dance: 'Slime_Walk', cheer: 'Slime_Walk', fall: 'Slime_Death' });
const Q_SKELETON_CLIPS = qClips('Skeleton', { walk: 'Skeleton_Running', run: 'Skeleton_Running', sneak: 'Skeleton_Running', gesture: 'Skeleton_Spawn', wave: 'Skeleton_Spawn', cheer: 'Skeleton_Spawn', dance: 'Skeleton_Spawn' });
const Q_DRAGON_CLIPS = qClips('Dragon', { idle: 'Dragon_Flying', walk: 'Dragon_Flying', run: 'Dragon_Flying', talk: 'Dragon_Flying', punch: 'Dragon_Attack2', wave: 'Dragon_Flying', kiss: 'Dragon_Flying', dance: 'Dragon_Flying', sit: 'Dragon_Flying', drive: 'Dragon_Flying', ride: 'Dragon_Flying', cheer: 'Dragon_Flying', sneak: 'Dragon_Flying', look: 'Dragon_Flying', crew: 'Dragon_Flying' });
// Динозавры: X_Attack/Death/Idle/Jump/Run/Walk (у апатозавра смерть — «Stegosaurus_Death», так в паке).
const dinoClips = (p, extra) => qClips(p, Object.assign({ walk: p + '_Walk', run: p + '_Run', sneak: p + '_Walk' }, extra || {}));
const Q_TREX_CLIPS = dinoClips('TRex');
const Q_RAPTOR_CLIPS = dinoClips('Velociraptor');
const Q_TRICE_CLIPS = dinoClips('Triceratops');
const Q_STEGO_CLIPS = dinoClips('Stegosaurus');
const Q_PARA_CLIPS = dinoClips('Parasaurolophus');
const Q_APATO_CLIPS = dinoClips('Apatosaurus', { fall: 'Stegosaurus_Death', dead: 'Stegosaurus_Death' });
// Ферма: клипы без префикса. Крупные — Death/Idle/Jump/Run/Walk/WalkSlow;
// мелкие (лама, свин, мопс, овца) — только Idle/Jump: передвигаются прыжком.
const Q_FARM_BIG_CLIPS = {
    idle: 'Idle', walk: 'Walk', run: 'Run', talk: 'Idle', gesture: 'Jump', wave: 'Jump',
    punch: 'Jump', kick: 'Jump', kiss: 'Idle', dance: 'Jump', sit: 'Idle', drive: 'Idle',
    ride: 'Walk', cheer: 'Jump', fall: 'Death', dead: 'Death', sneak: 'WalkSlow',
    look: 'Idle', crew: 'WalkSlow',
};
const Q_FARM_SMALL_CLIPS = {
    idle: 'Idle', walk: 'Jump', run: 'Jump', talk: 'Idle', gesture: 'Jump', wave: 'Jump',
    punch: 'Jump', kick: 'Jump', kiss: 'Idle', dance: 'Jump', sit: 'Idle', drive: 'Idle',
    ride: 'Idle', cheer: 'Jump', fall: 'Idle', dead: 'Idle', sneak: 'Jump', look: 'Idle', crew: 'Idle',
};
const Q_COW_CLIPS = Q_FARM_BIG_CLIPS;
const Q_HORSE_CLIPS = Q_FARM_BIG_CLIPS;
const Q_ZEBRA_CLIPS = Q_FARM_BIG_CLIPS;
const Q_LLAMA_CLIPS = Q_FARM_SMALL_CLIPS;
const Q_PIG_CLIPS = Q_FARM_SMALL_CLIPS;
const Q_PUG_CLIPS = Q_FARM_SMALL_CLIPS;
const Q_SHEEP_CLIPS = Q_FARM_SMALL_CLIPS;

/** @type {{ id: string, ru: string, url: string, kind: string, badge: string, gender: string, height: number, clips: Record<string, string>, palette: { skin: string, hair: string, shirt: string } }[]} */
const ACTOR_MODELS = [
    // — студийный робот (RobotExpressive, первая CC0-модель) —
    { id: 'robot', ru: 'Робот-экспресс', url: 'assets/models/RobotExpressive.glb', kind: 'robot', badge: '🤖', gender: 'any', height: 170, clips: ROBOT_CLIPS, palette: { skin: '#e8e8e8', hair: '#5a6a7a', shirt: '#e07020' } },
    // — Kenney Animated Characters (12 скинов characterMedium) —
    { id: 'ken_survivorFemaleA', ru: 'Выжившая', url: 'assets/models/actors/ken_survivorFemaleA.glb', kind: 'human', badge: '', gender: 'f', height: 170, clips: KEN_CLIPS, palette: { skin: '#e0ac69', hair: '#4a3524', shirt: '#6a7a4a' } },
    { id: 'ken_survivorMaleB', ru: 'Выживший', url: 'assets/models/actors/ken_survivorMaleB.glb', kind: 'human', badge: '', gender: 'm', height: 170, clips: KEN_CLIPS, palette: { skin: '#d9a066', hair: '#2e2419', shirt: '#7a6a4a' } },
    { id: 'ken_zombieA', ru: 'Зомби А', url: 'assets/models/actors/ken_zombieA.glb', kind: 'zombie', badge: '🧟', gender: 'any', height: 170, clips: KEN_CLIPS, palette: { skin: '#8aa06a', hair: '#3a3a2a', shirt: '#5a6a4a' } },
    { id: 'ken_zombieC', ru: 'Зомби Ц', url: 'assets/models/actors/ken_zombieC.glb', kind: 'zombie', badge: '🧟', gender: 'any', height: 170, clips: KEN_CLIPS, palette: { skin: '#7a9a5a', hair: '#2a2a1a', shirt: '#4a5a3a' } },
    { id: 'ken_humanFemaleA', ru: 'Героиня', url: 'assets/models/actors/ken_humanFemaleA.glb', kind: 'human', badge: '', gender: 'f', height: 170, clips: KEN_CLIPS, palette: { skin: '#f0c8a0', hair: '#c8a050', shirt: '#d05a4a' } },
    { id: 'ken_humanMaleA', ru: 'Герой', url: 'assets/models/actors/ken_humanMaleA.glb', kind: 'human', badge: '', gender: 'm', height: 170, clips: KEN_CLIPS, palette: { skin: '#e0b088', hair: '#4a3a2a', shirt: '#4a6ad0' } },
    { id: 'ken_zombieFemaleA', ru: 'Зомби-девушка', url: 'assets/models/actors/ken_zombieFemaleA.glb', kind: 'zombie', badge: '🧟', gender: 'f', height: 170, clips: KEN_CLIPS, palette: { skin: '#9ab07a', hair: '#5a4a3a', shirt: '#7a4a5a' } },
    { id: 'ken_zombieMaleA', ru: 'Зомби-парень', url: 'assets/models/actors/ken_zombieMaleA.glb', kind: 'zombie', badge: '🧟', gender: 'm', height: 170, clips: KEN_CLIPS, palette: { skin: '#88a068', hair: '#3a3a3a', shirt: '#4a5a6a' } },
    { id: 'ken_criminalMaleA', ru: 'Криминальный тип', url: 'assets/models/actors/ken_criminalMaleA.glb', kind: 'human', badge: '🕶', gender: 'm', height: 170, clips: KEN_CLIPS, palette: { skin: '#c89060', hair: '#1a1a1a', shirt: '#2a2a2e' } },
    { id: 'ken_cyborgFemaleA', ru: 'Киборг', url: 'assets/models/actors/ken_cyborgFemaleA.glb', kind: 'cyborg', badge: '🦾', gender: 'f', height: 170, clips: KEN_CLIPS, palette: { skin: '#b0c0c8', hair: '#40e0d0', shirt: '#3a4a5a' } },
    { id: 'ken_skaterFemaleA', ru: 'Скейтерша', url: 'assets/models/actors/ken_skaterFemaleA.glb', kind: 'human', badge: '🛹', gender: 'f', height: 170, clips: KEN_CLIPS, palette: { skin: '#e8b888', hair: '#e06040', shirt: '#e0c040' } },
    { id: 'ken_skaterMaleA', ru: 'Скейтер', url: 'assets/models/actors/ken_skaterMaleA.glb', kind: 'human', badge: '🛹', gender: 'm', height: 170, clips: KEN_CLIPS, palette: { skin: '#d0a070', hair: '#503018', shirt: '#40a0e0' } },
    // — KayKit Adventurers (общий риг Rig_Medium, 16 клипов) —
    { id: 'kay_Barbarian', ru: 'Варвар', url: 'assets/models/actors/kay_Barbarian.glb', kind: 'fantasy', badge: '⚔️', gender: 'm', height: 170, clips: KAY_CLIPS, palette: { skin: '#c89060', hair: '#8a4a2a', shirt: '#6a4a2a' } },
    { id: 'kay_Knight', ru: 'Рыцарь', url: 'assets/models/actors/kay_Knight.glb', kind: 'fantasy', badge: '🛡', gender: 'm', height: 170, clips: KAY_CLIPS, palette: { skin: '#e0b088', hair: '#3a3a3a', shirt: '#8a9aa8' } },
    { id: 'kay_Mage', ru: 'Маг', url: 'assets/models/actors/kay_Mage.glb', kind: 'fantasy', badge: '🪄', gender: 'any', height: 170, clips: KAY_CLIPS, palette: { skin: '#d8a878', hair: '#c8c8d8', shirt: '#5a4a8a' } },
    { id: 'kay_Ranger', ru: 'Следопыт', url: 'assets/models/actors/kay_Ranger.glb', kind: 'fantasy', badge: '🏹', gender: 'any', height: 170, clips: KAY_CLIPS, palette: { skin: '#c8a070', hair: '#4a6a2a', shirt: '#3a5a2a' } },
    { id: 'kay_Rogue', ru: 'Разбойник', url: 'assets/models/actors/kay_Rogue.glb', kind: 'fantasy', badge: '🗡', gender: 'any', height: 170, clips: KAY_CLIPS, palette: { skin: '#b8885a', hair: '#2a2018', shirt: '#4a3a2a' } },
    { id: 'kay_Rogue_Hooded', ru: 'Разбойница в капюшоне', url: 'assets/models/actors/kay_Rogue_Hooded.glb', kind: 'fantasy', badge: '🗡', gender: 'f', height: 170, clips: KAY_CLIPS, palette: { skin: '#c09868', hair: '#3a2a1a', shirt: '#5a5a4a' } },
    // — KayKit Skeletons (16 общих + 6 скелетных клипов) —
    { id: 'kay_Skeleton_Mage', ru: 'Скелет-маг', url: 'assets/models/actors/kay_Skeleton_Mage.glb', kind: 'skeleton', badge: '💀', gender: 'any', height: 168, clips: KAY_SKEL_CLIPS, palette: { skin: '#e8e0c8', hair: '#a090c0', shirt: '#4a3a6a' } },
    { id: 'kay_Skeleton_Minion', ru: 'Скелет-слуга', url: 'assets/models/actors/kay_Skeleton_Minion.glb', kind: 'skeleton', badge: '💀', gender: 'any', height: 168, clips: KAY_SKEL_CLIPS, palette: { skin: '#e0d8c0', hair: '#c8c0a8', shirt: '#6a6a5a' } },
    { id: 'kay_Skeleton_Rogue', ru: 'Скелет-разбойник', url: 'assets/models/actors/kay_Skeleton_Rogue.glb', kind: 'skeleton', badge: '💀', gender: 'any', height: 168, clips: KAY_SKEL_CLIPS, palette: { skin: '#e8e0c8', hair: '#b0a890', shirt: '#3a4a3a' } },
    { id: 'kay_Skeleton_Warrior', ru: 'Скелет-воин', url: 'assets/models/actors/kay_Skeleton_Warrior.glb', kind: 'skeleton', badge: '💀', gender: 'any', height: 168, clips: KAY_SKEL_CLIPS, palette: { skin: '#e0d8c0', hair: '#a8a090', shirt: '#7a4a3a' } },
    // — KayKit Mannequins (тренировочные болваны студии) —
    { id: 'kay_Mannequin_Medium', ru: 'Манекен', url: 'assets/models/actors/kay_Mannequin_Medium.glb', kind: 'mannequin', badge: '🎭', gender: 'any', height: 175, clips: KAY_CLIPS, palette: { skin: '#c8a878', hair: '#a8885a', shirt: '#b89868' } },
    { id: 'kay_Mannequin_Large', ru: 'Манекен-здоровяк', url: 'assets/models/actors/kay_Mannequin_Large.glb', kind: 'mannequin', badge: '🎭', gender: 'm', height: 200, clips: KAY_LARGE_CLIPS, palette: { skin: '#a8804a', hair: '#8a6a3a', shirt: '#987848' } },
    // — Quaternius: герои и чудовища —
    { id: 'q_Knight', ru: 'Кино-рыцарь', url: 'assets/models/actors/q_Knight.glb', kind: 'fantasy', badge: '⚔️', gender: 'm', height: 180, clips: Q_KNIGHT_CLIPS, palette: { skin: '#e0b088', hair: '#505a68', shirt: '#9aa8b8' } },
    { id: 'q_Robot', ru: 'Робот-актёр', url: 'assets/models/actors/q_Robot.glb', kind: 'robot', badge: '🤖', gender: 'any', height: 170, clips: Q_ROBOT_CLIPS, palette: { skin: '#d8d8e0', hair: '#404858', shirt: '#e08030' } },
    { id: 'q_Skeleton', ru: 'Скелет из павильона', url: 'assets/models/actors/q_Skeleton.glb', kind: 'skeleton', badge: '💀', gender: 'any', height: 165, clips: Q_SKELETON_CLIPS, palette: { skin: '#e8e0d0', hair: '#c0b8a8', shirt: '#d8d0c0' } },
    { id: 'q_Frog', ru: 'Лягух', url: 'assets/models/actors/q_Frog.glb', kind: 'creature', badge: '🐸', gender: 'any', height: 60, clips: Q_FROG_CLIPS, palette: { skin: '#6aa040', hair: '#4a7a2a', shirt: '#88b850' } },
    { id: 'q_Rat', ru: 'Крыс', url: 'assets/models/actors/q_Rat.glb', kind: 'animal', badge: '🐭', gender: 'any', height: 45, clips: Q_RAT_CLIPS, palette: { skin: '#9a8a7a', hair: '#6a5a4a', shirt: '#b0a090' } },
    { id: 'q_Snake', ru: 'Змей', url: 'assets/models/actors/q_Snake.glb', kind: 'creature', badge: '🐍', gender: 'any', height: 70, clips: Q_SNAKE_CLIPS, palette: { skin: '#7a9a4a', hair: '#5a7a3a', shirt: '#a0b060' } },
    { id: 'q_Snake_angry', ru: 'Злюк-змей', url: 'assets/models/actors/q_Snake_angry.glb', kind: 'creature', badge: '🐍', gender: 'any', height: 80, clips: Q_SNAKE_ANGRY_CLIPS, palette: { skin: '#a05a3a', hair: '#7a3a2a', shirt: '#c07a4a' } },
    { id: 'q_Wasp', ru: 'Оса', url: 'assets/models/actors/q_Wasp.glb', kind: 'bug', badge: '🐝', gender: 'any', height: 70, clips: Q_WASP_CLIPS, palette: { skin: '#e0b020', hair: '#3a3020', shirt: '#f0d040' } },
    { id: 'q_Spider', ru: 'Паук', url: 'assets/models/actors/q_Spider.glb', kind: 'bug', badge: '🕷', gender: 'any', height: 60, clips: Q_SPIDER_CLIPS, palette: { skin: '#5a4a6a', hair: '#3a2a4a', shirt: '#7a5a8a' } },
    { id: 'q_Bat', ru: 'Летучая мышь', url: 'assets/models/actors/q_Bat.glb', kind: 'creature', badge: '🦇', gender: 'any', height: 50, clips: Q_BAT_CLIPS, palette: { skin: '#6a5a7a', hair: '#4a3a5a', shirt: '#8a7a9a' } },
    { id: 'q_Slime', ru: 'Слизень', url: 'assets/models/actors/q_Slime.glb', kind: 'monster', badge: '🟩', gender: 'any', height: 65, clips: Q_SLIME_CLIPS, palette: { skin: '#60c090', hair: '#40a070', shirt: '#80e0b0' } },
    { id: 'q_Dragon', ru: 'Дракон', url: 'assets/models/actors/q_Dragon.glb', kind: 'monster', badge: '🐉', gender: 'any', height: 300, clips: Q_DRAGON_CLIPS, palette: { skin: '#b03020', hair: '#701810', shirt: '#d05030' } },
    // — Quaternius: динозавры —
    { id: 'q_Trex', ru: 'Ти-Рекс', url: 'assets/models/actors/q_Trex.glb', kind: 'dino', badge: '🦖', gender: 'any', height: 320, clips: Q_TREX_CLIPS, palette: { skin: '#4a6a3a', hair: '#3a5a2a', shirt: '#6a8a4a' } },
    { id: 'q_Velociraptor', ru: 'Велоцираптор', url: 'assets/models/actors/q_Velociraptor.glb', kind: 'dino', badge: '🦖', gender: 'any', height: 170, clips: Q_RAPTOR_CLIPS, palette: { skin: '#a05a30', hair: '#7a4020', shirt: '#c08050' } },
    { id: 'q_Triceratops', ru: 'Трицератопс', url: 'assets/models/actors/q_Triceratops.glb', kind: 'dino', badge: '🦕', gender: 'any', height: 220, clips: Q_TRICE_CLIPS, palette: { skin: '#8a8a5a', hair: '#6a6a3a', shirt: '#a8a878' } },
    { id: 'q_Stegosaurus', ru: 'Стегозавр', url: 'assets/models/actors/q_Stegosaurus.glb', kind: 'dino', badge: '🦕', gender: 'any', height: 230, clips: Q_STEGO_CLIPS, palette: { skin: '#b07030', hair: '#8a5020', shirt: '#d09050' } },
    { id: 'q_Parasaurolophus', ru: 'Паразауролоф', url: 'assets/models/actors/q_Parasaurolophus.glb', kind: 'dino', badge: '🦕', gender: 'any', height: 250, clips: Q_PARA_CLIPS, palette: { skin: '#4a9a9a', hair: '#2a7a7a', shirt: '#6ab8b8' } },
    { id: 'q_Apatosaurus', ru: 'Апатозавр', url: 'assets/models/actors/q_Apatosaurus.glb', kind: 'dino', badge: '🦕', gender: 'any', height: 400, clips: Q_APATO_CLIPS, palette: { skin: '#6a7a9a', hair: '#4a5a7a', shirt: '#8a9ab8' } },
    // — Quaternius: звери фермы —
    { id: 'q_Cow', ru: 'Корова-звезда', url: 'assets/models/actors/q_Cow.glb', kind: 'animal', badge: '🐄', gender: 'any', height: 140, clips: Q_COW_CLIPS, palette: { skin: '#e8e8e8', hair: '#2a2a2a', shirt: '#f0f0f0' } },
    { id: 'q_Horse', ru: 'Конь-каскадёр', url: 'assets/models/actors/q_Horse.glb', kind: 'animal', badge: '🐎', gender: 'any', height: 180, clips: Q_HORSE_CLIPS, palette: { skin: '#8a5a30', hair: '#3a2a18', shirt: '#a07040' } },
    { id: 'q_Llama', ru: 'Лама', url: 'assets/models/actors/q_Llama.glb', kind: 'animal', badge: '🦙', gender: 'any', height: 170, clips: Q_LLAMA_CLIPS, palette: { skin: '#e0d0b0', hair: '#c0a880', shirt: '#f0e8d0' } },
    { id: 'q_Pig', ru: 'Свин', url: 'assets/models/actors/q_Pig.glb', kind: 'animal', badge: '🐖', gender: 'any', height: 75, clips: Q_PIG_CLIPS, palette: { skin: '#f0a8a0', hair: '#d08880', shirt: '#f8c0b8' } },
    { id: 'q_Pug', ru: 'Мопс', url: 'assets/models/actors/q_Pug.glb', kind: 'animal', badge: '🐶', gender: 'any', height: 50, clips: Q_PUG_CLIPS, palette: { skin: '#d8b088', hair: '#4a3a2a', shirt: '#e8c8a0' } },
    { id: 'q_Sheep', ru: 'Овца', url: 'assets/models/actors/q_Sheep.glb', kind: 'animal', badge: '🐑', gender: 'any', height: 85, clips: Q_SHEEP_CLIPS, palette: { skin: '#f0ece0', hair: '#8a8078', shirt: '#faf8f0' } },
    { id: 'q_Zebra', ru: 'Зебра', url: 'assets/models/actors/q_Zebra.glb', kind: 'animal', badge: '🦓', gender: 'any', height: 160, clips: Q_ZEBRA_CLIPS, palette: { skin: '#f0f0f0', hair: '#1a1a1a', shirt: '#e0e0e0' } },
];

/** @satisfies {Record<string, any>} */
const ActorModels = {
    ALL: ACTOR_MODELS,

    _byId: null,

    /** Запись каталога по id (или null). Неизвестный id — не ошибка: процедурный риг. */
    get(id) {
        if (!this._byId) {
            this._byId = {};
            for (const e of ACTOR_MODELS) this._byId[e.id] = e;
        }
        return this._byId[id] || null;
    },

    /** id моделей, подходящих ампуа по полу ('m'|'f'); 'any' подходит всем. */
    idsFor(gender) {
        const out = [];
        for (const e of ACTOR_MODELS) if (e.gender === 'any' || e.gender === gender) out.push(e.id);
        return out;
    },

    /** Детерминированный выбор модели на seeded-Rng: id или '' (процедурный риг). */
    pick(r, gender) {
        const ids = this.idsFor(gender);
        return ids.length ? r.pick(ids) : '';
    },
};
