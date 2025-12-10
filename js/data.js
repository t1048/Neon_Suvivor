// --- Data.js ---
const enemyTypes = {
    normal: { hpMul: 1.0, spdMul: 1.0, color: '#ff4444', shape: 'square' },
    tank: { hpMul: 3.0, spdMul: 0.6, color: '#ff8844', shape: 'hexagon' },
    runner: { hpMul: 0.5, spdMul: 1.5, color: '#ff44aa', shape: 'triangle' }
};

const weaponsInitial = {
    gun: { name: 'Plasma Gun', color: '#ffff00', description: '最も近い敵を自動で攻撃する。', attackPower: 12, range: 320, cooldown: 28 },
    scatter: { name: 'Scatter Shot', color: '#ffaa00', description: '近距離に拡散弾を発射する。', attackPower: 9, range: 180, cooldown: 55, count: 5, spread: 0.6 },
    whip: { name: 'Nano Whip', color: '#ff00ff', description: '左右両方を同時に攻撃する。', attackPower: 45, range: 180, cooldown: 65 },
    blade: { name: 'Photon Blade', color: '#00ffaa', description: '自機の周囲を回転するプラズマブレード。', attackPower: 25, range: 100, cooldown: 0, count: 1, rotSpeed: 0.08 },
    sanctuary: { name: 'Void Field', color: '#00ffff', description: '範囲内の敵に継続ダメージを与える。', attackPower: 1.5, range: 110, cooldown: 20 },
    laser: { name: 'Railgun', color: '#ff0000', description: '一直線上の敵を貫通するレーザー。', attackPower: 20, range: 480, cooldown: 60 },
    bomb: { name: 'Plasma Grenade', color: '#ff8800', description: '爆発するグレネードを投げる。', attackPower: 40, range: 250, cooldown: 110, explosionRadius: 100 },
    thunder: { name: 'Tesla Coil', color: '#ffff88', description: '敵に連鎖する雷を放つ。', attackPower: 22, range: 360, cooldown: 80, chainCount: 4 },
    mine: { name: 'Spider Mine', color: '#ffff00', description: '敵を追尾する地雷を設置する。', attackPower: 35, range: 80, cooldown: 120, duration: 400, blastRadius: 95 }
};

// Deep clone for actual use
let weapons = JSON.parse(JSON.stringify(weaponsInitial));

const upgrades = [
    { id: 'atk', name: 'Power Up', description: '攻撃力+20%', apply: () => player.weapons.forEach(k => weapons[k].attackPower *= 1.2) },
    { id: 'spd', name: 'Agility', description: '移動速度+10%', apply: () => player.speed *= 1.1 },
    { id: 'hp', name: 'Vitality', description: '最大HP+20＆全回復', apply: () => { player.maxHp += 20; player.hp = player.maxHp; } },
    {
        id: 'cdr',
        name: 'Overclock',
        description: 'クールダウン-10%',
        apply: () => player.weapons.forEach(k => {
            const w = weapons[k];
            w.cooldown *= 0.9;
            if (w.rotSpeed) w.rotSpeed /= 0.9; // tie blade speed to cooldown buffs
        })
    },
    {
        id: 'rng',
        name: 'Scope',
        description: '射程+20%、爆発範囲+10%',
        apply: () => {
            player.weapons.forEach(k => {
                weapons[k].range *= 1.20;
                if (weapons[k].explosionRadius) weapons[k].explosionRadius *= 1.10;
                if (weapons[k].blastRadius) weapons[k].blastRadius *= 1.10;
            });
            addFloatingText(player.x, player.y, 'SCOPE UP!', '#00ffff');
        }
    },
    { id: 'mag', name: 'Magnet', description: 'アイテム吸収範囲+30%', apply: () => player.magnetRadius *= 1.3 },
    { id: 'exp', name: 'Learning', description: '獲得経験値+12%', apply: () => player.expMult += 0.12 },
    {
        id: 'curse',
        name: 'Cursed Sigil',
        description: '敵HP+30%、獲得経験値+50%',
        apply: () => {
            enemyGlobalHpMul *= 1.3;
            player.expMult += 0.5;
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
            player.damageReduction += 0.15; // 15% reduction
            player.speed *= 0.9; // 10% slow
            addFloatingText(player.x, player.y, "ARMOR UP!", "#888888");
        }
    }
];

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

