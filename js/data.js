// --- Data.js ---
const enemyTypes = {
    normal: { hpMul: 1.0, spdMul: 1.0, color: '#ff4444', shape: 'square' },
    tank: { hpMul: 3.0, spdMul: 0.6, color: '#ff8844', shape: 'hexagon' },
    runner: { hpMul: 0.5, spdMul: 1.5, color: '#ff44aa', shape: 'triangle' }
};

const weaponsInitial = {
    gun: { name: 'Plasma Gun', color: '#ffff00', description: 'Auto-fires at nearest enemy.', attackPower: 12, range: 320, cooldown: 28 },
    scatter: { name: 'Scatter Shot', color: '#ffaa00', description: 'Close-range spread fire.', attackPower: 9, range: 180, cooldown: 55, count: 5, spread: 0.6 },
    whip: { name: 'Nano Whip', color: '#ff00ff', description: 'Slashes BOTH sides.', attackPower: 45, range: 180, cooldown: 65 },
    blade: { name: 'Photon Blade', color: '#00ffaa', description: 'Orbiting plasma blade.', attackPower: 25, range: 100, cooldown: 0, count: 1, rotSpeed: 0.08 },
    sanctuary: { name: 'Void Field', color: '#00ffff', description: 'Damages enemies in aura.', attackPower: 1.5, range: 110, cooldown: 20 },
    laser: { name: 'Railgun', color: '#ff0000', description: 'Pierces all enemies in line.', attackPower: 20, range: 480, cooldown: 60 },
    bomb: { name: 'Plasma Grenade', color: '#ff8800', description: 'Throws an explosive bomb.', attackPower: 40, range: 250, cooldown: 110, explosionRadius: 100 },
    thunder: { name: 'Tesla Coil', color: '#ffff88', description: 'Chains lightning to enemies.', attackPower: 22, range: 360, cooldown: 80, chainCount: 4 },
    mine: { name: 'Spider Mine', color: '#ffff00', description: 'Drops mines that seek enemies.', attackPower: 35, range: 80, cooldown: 120, duration: 400, blastRadius: 95 }
};

// Deep clone for actual use
let weapons = JSON.parse(JSON.stringify(weaponsInitial));

const upgrades = [
    { id: 'atk', name: 'Power Up', description: 'DMG +20%', apply: () => player.weapons.forEach(k => weapons[k].attackPower *= 1.2) },
    { id: 'spd', name: 'Agility', description: 'Speed +10%', apply: () => player.speed *= 1.1 },
    { id: 'hp', name: 'Vitality', description: 'HP +20 & Heal', apply: () => { player.maxHp += 20; player.hp = player.maxHp; } },
    {
        id: 'cdr',
        name: 'Overclock',
        description: 'Cooldown -10%',
        apply: () => player.weapons.forEach(k => {
            const w = weapons[k];
            w.cooldown *= 0.9;
            if (w.rotSpeed) w.rotSpeed /= 0.9; // tie blade speed to cooldown buffs
        })
    },
    {
        id: 'rng',
        name: 'Scope',
        description: 'Range +20%, Area +10%',
        apply: () => {
            player.weapons.forEach(k => {
                weapons[k].range *= 1.20;
                if (weapons[k].explosionRadius) weapons[k].explosionRadius *= 1.10;
                if (weapons[k].blastRadius) weapons[k].blastRadius *= 1.10;
            });
            addFloatingText(player.x, player.y, 'SCOPE UP!', '#00ffff');
        }
    },
    { id: 'mag', name: 'Magnet', description: 'Pickup +30%', apply: () => player.magnetRadius *= 1.3 },
    { id: 'exp', name: 'Learning', description: 'EXP +6%', apply: () => player.expMult += 0.06 },
    {
        id: 'curse',
        name: 'Cursed Sigil',
        description: 'Enemy HP +30%, EXP +50%',
        apply: () => {
            enemyGlobalHpMul *= 1.3;
            player.expMult += 0.5;
            addFloatingText(player.x, player.y, "CURSED!", "#8800ff");
        }
    },
    {
        id: 'adrenaline',
        name: 'Adrenaline',
        description: 'Low HP = Faster Cooldown',
        apply: () => {
            player.adrenaline++;
            addFloatingText(player.x, player.y, "RUSH!", "#ff0055");
        }
    },
    {
        id: 'vital_strike',
        name: 'Vital Strike',
        description: 'Full HP = High DMG',
        apply: () => {
            player.vitalStrike++;
            addFloatingText(player.x, player.y, "VITAL!", "#00ff88");
        }
    },
    {
        id: 'fortress',
        name: 'Fortress',
        description: 'Armor UP, Speed DOWN',
        apply: () => {
            player.damageReduction += 0.15; // 15% reduction
            player.speed *= 0.9; // 10% slow
            addFloatingText(player.x, player.y, "ARMOR UP!", "#888888");
        }
    }
];

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

