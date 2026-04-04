// --- Data.js ---
const enemyTypes = {
    normal: { hpMul: 1.0, spdMul: 1.0, color: '#ff4444', shape: 'square' },
    tank: { hpMul: 3.0, spdMul: 0.6, color: '#ff8844', shape: 'hexagon' },
    runner: { hpMul: 0.5, spdMul: 1.5, color: '#ff44aa', shape: 'triangle' }
};

const weaponsInitial = {
    gun: { name: 'Plasma Gun', color: '#ffff00', description: '最も近い敵を自動で攻撃する。', attackPower: 14, range: 320, cooldown: 25 },
    scatter: { name: 'Scatter Shot', color: '#ffaa00', description: '近距離に拡散弾を発射する。', attackPower: 9, range: 180, cooldown: 30, count: 5, spread: 0.6 },
    whip: { name: 'Nano Whip', color: '#ff00ff', description: '左右両方を同時に攻撃する。', attackPower: 45, range: 180, cooldown: 35 },
    blade: { name: 'Photon Blade', color: '#00ffaa', description: '自機の周囲を回転するプラズマブレード。', attackPower: 25, range: 100, cooldown: 0, count: 1, rotSpeed: 0.08 },
    sanctuary: { name: 'Void Field', color: '#00ffff', description: '範囲内の敵に継続ダメージを与える。', attackPower: 1.5, range: 110, cooldown: 12 },
    laser: { name: 'Railgun', color: '#ff0000', description: '一直線上の敵を貫通するレーザー。', attackPower: 20, range: 480, cooldown: 35 },
    bomb: { name: 'Plasma Grenade', color: '#ff8800', description: '爆発するグレネードを投げる。', attackPower: 40, range: 250, cooldown: 60, explosionRadius: 100 },
    thunder: { name: 'Tesla Coil', color: '#ffff88', description: '敵に連鎖する雷を放つ。', attackPower: 22, range: 360, cooldown: 45, chainCount: 4 },
    mine: { name: 'Spider Mine', color: '#ffff00', description: '敵を追尾する地雷を設置する。', attackPower: 35, range: 80, cooldown: 65, duration: 400, blastRadius: 95 }
};

// Deep clone for actual use
let weapons = JSON.parse(JSON.stringify(weaponsInitial));

const upgrades = [
    { id: 'atk', name: 'Power Up', description: '攻撃力+20%', apply: () => {
        // session multiplicative buff to weapons' attack
        playerSessionMods.weaponsApplyForEach(k => { playerSessionMods.weapons[k].attackMul *= 1.20; });
        addFloatingText(player.x, player.y, 'ATK +20%', '#ffccaa');
    } },
    { id: 'spd', name: 'Agility', description: '移動速度+10%', apply: () => {
        playerSessionMods.player.speedMul *= 1.10; addFloatingText(player.x, player.y, 'SPEED +10%', '#aaffff');
    } },
    { id: 'hp', name: 'Vitality', description: '最大HP+20＆全回復', apply: () => {
        playerSessionMods.player.maxHpAdd += 20; player.hp = Math.min(player.maxHp + playerSessionMods.player.maxHpAdd, player.hp + 20); addFloatingText(player.x, player.y, '+20 HP', '#ff8888');
    } },
    {
        id: 'cdr',
        name: 'Overclock',
        description: 'クールダウン-10%',
        apply: () => {
            playerSessionMods.weaponsApplyForEach(k => { playerSessionMods.weapons[k].cooldownMul *= 0.9; });
            addFloatingText(player.x, player.y, 'CDR -10%', '#ffeeaa');
        }
    },
    {
        id: 'rng',
        name: 'Scope',
        description: '射程+20%、爆発範囲+10%',
        apply: () => {
            playerSessionMods.weaponsApplyForEach(k => { playerSessionMods.weapons[k].rangeMul *= 1.20; playerSessionMods.weapons[k].explosionMul *= 1.10; playerSessionMods.weapons[k].blastMul *= 1.10; });
            addFloatingText(player.x, player.y, 'SCOPE UP!', '#00ffff');
        }
    },
    { id: 'mag', name: 'Magnet', description: 'アイテム吸収範囲+30%', apply: () => { playerSessionMods.player.magnetMul *= 1.3; addFloatingText(player.x, player.y, 'MAGNET +30%', '#aaffaa'); } },
    { id: 'exp', name: 'Learning', description: '獲得経験値+12%', apply: () => { playerSessionMods.player.expMulAdd += 0.12; addFloatingText(player.x, player.y, '+12% EXP', '#ffd2ff'); } },
    {
        id: 'curse',
        name: 'Cursed Sigil',
        description: '敵HP+30%、獲得経験値+50%',
        apply: () => {
            enemyGlobalHpMul *= 1.3;
            playerSessionMods.player.expMulAdd += 0.5;
            addFloatingText(player.x, player.y, "CURSED!", "#8800ff");
        }
    },
    {
        id: 'adrenaline',
        name: 'Adrenaline',
        description: 'HPが低いほどクールダウン短縮',
        apply: () => {
            player.adrenaline++;
            addFloatingText(player.x, player.y, "RUSH!", "#ff0055");
        }
    },
    {
        id: 'vital_strike',
        name: 'Vital Strike',
        description: 'HP満タン時に攻撃力アップ',
        apply: () => {
            player.vitalStrike++;
            addFloatingText(player.x, player.y, "VITAL!", "#00ff88");
        }
    },
    {
        id: 'fortress',
        name: 'Fortress',
        description: '被ダメージ減少、移動速度低下',
        apply: () => {
            playerSessionMods.player.damageReductionAdd += 0.15; // 15% reduction additive
            playerSessionMods.player.speedMul *= 0.9; // 10% slow
            addFloatingText(player.x, player.y, "ARMOR UP!", "#888888");
        }
    }
];


const metaUpgradeDefs = [
    { id: 'startHp', name: 'AUGMENTED BODY', description: '開始HP +15', maxLevel: 5, costs: [20, 40, 70, 110, 160] },
    { id: 'attackPower', name: 'NEURAL AMP', description: '全武器攻撃力 +5%', maxLevel: 5, costs: [20, 40, 70, 110, 160] },
    { id: 'moveSpeed', name: 'SERVO LEGS', description: '移動速度 +4%', maxLevel: 5, costs: [20, 40, 70, 110, 160] },
    { id: 'cooldown', name: 'OVERCLOCK CHIP', description: '武器クールダウン -5%', maxLevel: 5, costs: [20, 40, 70, 110, 160] },
    { id: 'expGain', name: 'SYNAPTIC BOOST', description: '獲得経験値 +10%', maxLevel: 5, costs: [15, 30, 50, 80, 120] },
    { id: 'magnetRange', name: 'GRAVITY COIL', description: '磁力範囲 +15%', maxLevel: 5, costs: [15, 30, 50, 80, 120] },
    { id: 'armor', name: 'NANOWEAVE', description: '被ダメージ -5%', maxLevel: 5, costs: [25, 50, 85, 130, 190] },
    { id: 'healOnWave', name: 'REGEN MATRIX', description: 'Wave突破時HP +8', maxLevel: 3, costs: [30, 65, 110] },
    { id: 'gemBonus', name: 'DATA EXTRACTOR', description: 'ジェムEXP +12%', maxLevel: 3, costs: [25, 55, 100] },
    { id: 'shardGain', name: 'HARVEST PROTOCOL', description: '取得シャード +20%', maxLevel: 3, costs: [20, 45, 80] }
];

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
