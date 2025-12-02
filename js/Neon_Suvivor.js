// --- Neon_Survivor.js ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const soundManager = new SoundManager();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// UI
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const ui = document.getElementById('ui');
const muteBtn = document.getElementById('muteBtn');
const bossWarning = document.getElementById('bossWarning');
const audioControls = document.getElementById('audioControls');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');

const initialVolume = Math.round(soundManager.masterVolume * 100);
volumeSlider.value = initialVolume;
volumeValue.innerText = `${initialVolume}%`;

startBtn.addEventListener('click', () => {
    soundManager.init();
    soundManager.startBGM();
    overlay.style.display = 'none';
    ui.style.display = 'flex';
    muteBtn.style.display = 'block';
    audioControls.style.display = 'block';
    gameState = "playing";
    resetGame();
    animate();
});

muteBtn.addEventListener('click', () => {
    const muted = soundManager.toggleMute();
    muteBtn.innerText = muted ? "🔇 MUTED" : "🔊 MUTE";
});

volumeSlider.addEventListener('input', () => {
    const vol = volumeSlider.value / 100;
    soundManager.setVolume(vol);
    volumeValue.innerText = `${volumeSlider.value}%`;
});

let gameState = "start";
let score = 0;
let totalDamageDealt = 0;
let wave = 1;
let frameCount = 0;
let timeSeconds = 0;
let isBossActive = false;
let enemyGlobalHpMul = 1;

const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

canvas.addEventListener('mousedown', (e) => {
    if (gameState === "gameover") {
        resetGame();
        gameState = "playing";
        soundManager.startBGM();
    }
    else if (gameState === "levelup") {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const boxWidth = 220, boxHeight = 280, gap = 20;
        const startX = (canvas.width - ((boxWidth * 3) + (gap * 2))) / 2;
        const startY = (canvas.height - boxHeight) / 2;

        for (let i = 0; i < upgradeOptions.length; i++) {
            const x = startX + i * (boxWidth + gap);
            if (clickX >= x && clickX <= x + boxWidth && clickY >= startY && clickY <= startY + boxHeight) {
                upgradeOptions[i].apply();
                soundManager.playLevelUp();
                gameState = "playing";
                break;
            }
        }
    }
});

// --- Entities ---
const player = {
    x: 0, y: 0, size: 16, speed: 4.0, color: '#00aaff',
    maxHp: 100, hp: 100,
    weapons: [], weaponCooldowns: {},
    exp: 0, level: 1, nextLevelExp: 100,
    invincibleFrames: 0, contactDamageCooldown: 0, magnetRadius: 100,
    expMult: 1,
    lastMoveAngle: 0,
    adrenaline: 0,
    vitalStrike: 0,
    damageReduction: 0 // Fortress Skill
};

const camera = { x: 0, y: 0 };
const world = { width: 3000, height: 3000 };
const isOffscreen = (sx, sy, margin = 100) => sx < -margin || sx > canvas.width + margin || sy < -margin || sy > canvas.height + margin;

let enemies = [], bullets = [], particles = [], gems = [], weaponItems = [], upgradeOptions = [], floatingTexts = [];
let laserBeams = [], bombs = [], thunders = [], whips = [], sanctuaryParticles = [], mines = [];
let bossBullets = [];
let rotatingBlades = [];

let enemyBaseHp = 10;
let spawnRate = 60;

function resetGame() {
    weapons = JSON.parse(JSON.stringify(weaponsInitial));

    player.maxHp = 100;
    player.hp = 100;
    player.speed = 4.0;
    player.magnetRadius = 100;
    player.x = world.width / 2; player.y = world.height / 2;
    player.exp = 0; player.level = 1; player.nextLevelExp = 100;
    player.expMult = 1;
    player.adrenaline = 0;
    player.vitalStrike = 0;
    player.damageReduction = 0;
    enemyGlobalHpMul = 1;

    score = 0; wave = 1; frameCount = 0; timeSeconds = 0;
    totalDamageDealt = 0;
    enemyBaseHp = 10;
    enemies = []; bullets = []; particles = []; gems = []; weaponItems = []; floatingTexts = [];
    laserBeams = []; bombs = []; thunders = []; whips = []; sanctuaryParticles = []; mines = [];
    bossBullets = [];
    rotatingBlades = [];
    isBossActive = false;
    soundManager.setBossMode(false);
    soundManager.setSystemError(false);
    document.getElementById('systemError').style.display = 'none';
    soundManager.setWave(1);

    document.querySelectorAll('.stat-box').forEach(b => b.classList.remove('boss-mode'));

    const weaponKeys = Object.keys(weapons);
    const randomKey = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
    player.weapons = [randomKey];
    player.weaponCooldowns = {};
    player.weaponCooldowns[randomKey] = 0;

    updateUI();
}

function takePlayerDamage(rawDamage) {
    if (player.contactDamageCooldown > 0 || player.invincibleFrames > 0) return;

    // Fortress: Reduce damage
    const actualDamage = Math.max(1, rawDamage * (1 - player.damageReduction));

    player.hp -= actualDamage;
    player.contactDamageCooldown = 30;
    addFloatingText(player.x, player.y, `-${Math.floor(actualDamage)}`, "#ff0000");

    if (player.hp <= 0 && gameState !== "gameover") {
        gameState = "gameover";
        saveScore();
        soundManager.playGameOver();
    }
    updateUI();
}

function calcCooldownBoost() {
    if (player.adrenaline <= 0) return 1;
    const missingHpRatio = 1 - (player.hp / player.maxHp);
    return 1 + player.adrenaline * missingHpRatio * 0.3;
}

// Calculate Global Damage Multiplier
function getDamageMultiplier() {
    let mult = 1.0;

    // Vital Strike: Bonus at high HP
    if (player.vitalStrike > 0) {
        const hpRatio = player.hp / player.maxHp;
        // Max +20% per level at 100% HP
        mult += (player.vitalStrike * 0.2 * hpRatio);
    }

    return mult;
}

function getWaveColor(alpha = 1.0) {
    const progress = Math.min(wave, 30) / 30;
    const r = Math.floor(0 + progress * 255);
    const g = Math.floor(170 + progress * 30);
    const b = Math.floor(255 - progress * 255);
    return `rgba(${r},${g},${b},${alpha})`;
}

function spawnBoss() {
    if (isBossActive) return;
    isBossActive = true;
    soundManager.setBossMode(true);
    soundManager.playBossSpawn();
    enemies.push(createRandomBoss(wave));

    bossWarning.style.display = 'block';
    setTimeout(() => { bossWarning.style.display = 'none'; }, 3000);

    const boxes = document.querySelectorAll('.stat-box');
    boxes.forEach(b => b.classList.add('boss-mode'));
}

function updatePlayer() {
    if (player.contactDamageCooldown > 0) player.contactDamageCooldown--;
    const cooldownBoost = calcCooldownBoost();
    let dx = 0, dy = 0;
    if (keys['w'] || keys['ArrowUp']) dy = -1; if (keys['s'] || keys['ArrowDown']) dy = 1;
    if (keys['a'] || keys['ArrowLeft']) dx = -1; if (keys['d'] || keys['ArrowRight']) dx = 1;
    if (dx || dy) {
        player.lastMoveAngle = Math.atan2(dy, dx);
        const l = Math.hypot(dx, dy);
        player.x += (dx / l) * player.speed; player.y += (dy / l) * player.speed;
    }
    player.x = clamp(player.x, 0, world.width);
    player.y = clamp(player.y, 0, world.height);
    camera.x += (player.x - canvas.width / 2 - camera.x) * 0.1;
    camera.y += (player.y - canvas.height / 2 - camera.y) * 0.1;

    // Handle Persistent Weapons (Photon Blade)
    if (player.weapons.includes('blade')) {
        const bladeCount = weapons.blade.count || 1;
        if (rotatingBlades.length < bladeCount) {
            for (let i = rotatingBlades.length; i < bladeCount; i++) {
                rotatingBlades.push(new RotatingBlade((i / bladeCount) * Math.PI * 2));
            }
        }
        rotatingBlades.forEach(b => b.update(weapons.blade, cooldownBoost));
    }

    player.weapons.forEach(key => {
        if (player.weaponCooldowns[key] > 0) player.weaponCooldowns[key] -= cooldownBoost;
        else {
            const w = weapons[key];
            const effectiveFrames = w.cooldown / cooldownBoost;

            if (key !== 'sanctuary' && key !== 'blade' && effectiveFrames < 9) {
                soundManager.triggerOverheatSequence();
            }

            const playWeaponSound = (method) => {
                method.call(soundManager);
            };

            const dmgMult = getDamageMultiplier();

            if (key === 'gun') {
                const target = findNearest(w.range);
                if (target) {
                    bullets.push(new Bullet(player.x, player.y, target.x, target.y));
                    player.weaponCooldowns[key] = w.cooldown;
                    playWeaponSound(soundManager.playShoot);
                }
            }
            else if (key === 'scatter') {
                // Scatter Shot
                const target = findNearest(w.range);
                // Aim at target or forward
                const aimAngle = target ? Math.atan2(target.y - player.y, target.x - player.x) : (player.lastMoveAngle || 0);

                for (let i = 0; i < w.count; i++) {
                    const spread = (Math.random() - 0.5) * w.spread;
                    const fireAngle = aimAngle + spread;
                    const tx = player.x + Math.cos(fireAngle) * 100;
                    const ty = player.y + Math.sin(fireAngle) * 100;
                    // Pass w.range as maxDist
                    bullets.push(new Bullet(player.x, player.y, tx, ty, false, w.range));
                }
                player.weaponCooldowns[key] = w.cooldown;
                playWeaponSound(soundManager.playShotgun);
            }
            else if (key === 'laser') {
                const target = findNearest(w.range);
                if (target) {
                    laserBeams.push({ x1: player.x, y1: player.y, x2: target.x, y2: target.y, life: 10, w: w });
                    player.weaponCooldowns[key] = w.cooldown;
                    playWeaponSound(soundManager.playRailgun);
                    const a = Math.atan2(target.y - player.y, target.x - player.x);
                    const lx = player.x + Math.cos(a) * w.range;
                    const ly = player.y + Math.sin(a) * w.range;
                    enemies.forEach(e => {
                        if (pointLineDist(e.x, e.y, player.x, player.y, lx, ly) < (e.isBoss ? e.size : e.size)) {
                            e.takeDamage(w.attackPower * dmgMult);
                        }
                    });
                }
            }
            else if (key === 'whip') {
                whips.push(new WhipHitbox(player.x, player.y, player.lastMoveAngle));
                whips.push(new WhipHitbox(player.x, player.y, player.lastMoveAngle + Math.PI));
                player.weaponCooldowns[key] = w.cooldown;
                playWeaponSound(soundManager.playWhip);
            }
            else if (key === 'bomb') { // Plasma Grenade
                const target = findNearest(w.range);
                if (target) {
                    bombs.push(new BombProjectile(player.x, player.y, target.x, target.y));
                    player.weaponCooldowns[key] = w.cooldown;
                }
            }
            else if (key === 'thunder') {
                const target = findNearest(w.range);
                if (target) {
                    const chain = [target];
                    let curr = target;
                    const used = new Set([target]);
                    for (let i = 0; i < w.chainCount; i++) {
                        let next = null;
                        let minD = 200;
                        enemies.forEach(e => {
                            if (!used.has(e)) {
                                const d = Math.hypot(e.x - curr.x, e.y - curr.y);
                                if (d < minD) { minD = d; next = e; }
                            }
                        });
                        if (next) { chain.push(next); used.add(next); curr = next; }
                    }
                    thunders.push(new ThunderStrike(player.x, player.y, chain));
                    chain.forEach(e => e.takeDamage(w.attackPower * dmgMult));
                    player.weaponCooldowns[key] = w.cooldown;
                    playWeaponSound(soundManager.playThunder);
                }
            }
            else if (key === 'sanctuary') {
                enemies.forEach(e => {
                    if (Math.hypot(e.x - player.x, e.y - player.y) < w.range + e.size) {
                        e.takeDamage(w.attackPower * dmgMult);
                    }
                });
                player.weaponCooldowns[key] = w.cooldown;
                if (frameCount % 5 === 0) sanctuaryParticles.push({ x: player.x + (Math.random() - 0.5) * w.range * 1.5, y: player.y + (Math.random() - 0.5) * w.range * 1.5, life: 20 });
            }
            else if (key === 'mine') {
                mines.push(new Landmine(player.x, player.y));
                player.weaponCooldowns[key] = w.cooldown;
            }
        }
    });
}

function findNearest(range) {
    let t = null, md = range;
    enemies.forEach(e => {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < md) { md = d; t = e; }
    });
    return t;
}

function pointLineDist(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.hypot(px - xx, py - yy);
}

function generateUpgradeOptions() {
    upgradeOptions = [];
    let pool = [...upgrades];

    pool = pool.filter(opt => {
        if (opt.id === 'adrenaline' && player.adrenaline >= 3) return false;
        if (opt.id === 'vital_strike' && player.vitalStrike >= 3) return false;
        return true;
    });

    const forceWeapon = (wave >= 1 && player.weapons.length === 1);

    const weaponChance = forceWeapon ? 1.0 : 0.6;

    if (player.weapons.length < 3) {
        if (Math.random() < weaponChance) {
            const availWeapons = Object.keys(weapons).filter(k => !player.weapons.includes(k));
            availWeapons.forEach(k => {
                pool.push({
                    id: 'new_' + k, name: 'New: ' + weapons[k].name, description: weapons[k].description,
                    apply: () => { player.weapons.push(k); player.weaponCooldowns[k] = 0; }
                });
            });
        }
    }

    pool = pool.filter(opt => {
        const specials = ['adrenaline', 'curse', 'vital_strike', 'fortress'];
        if (specials.includes(opt.id) && Math.random() > 0.15) return false;
        return true;
    });

    const finalOptions = [];

    if (forceWeapon) {
        const weaponOptions = pool.filter(o => o.id.startsWith('new_'));
        if (weaponOptions.length > 0) {
            const idx = Math.floor(Math.random() * weaponOptions.length);
            finalOptions.push(weaponOptions[idx]);
            const poolIdx = pool.indexOf(weaponOptions[idx]);
            if (poolIdx > -1) pool.splice(poolIdx, 1);
        }
    }

    if (pool.length === 0) pool.push(upgrades[0]);

    while (finalOptions.length < 3) {
        if (pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        finalOptions.push(pool[idx]);
        pool.splice(idx, 1);
    }
    upgradeOptions = finalOptions;
}
function saveScore() {
    const result = {
        score: score,
        time: document.getElementById('timeDisplay').innerText,
        wave: wave,
        damage: Math.floor(totalDamageDealt),
        weapons: player.weapons.map(w => weapons[w].name),
        date: new Date().toLocaleString()
    };

    let highScores = getHighScores();
    highScores.push(result);
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 5);

    localStorage.setItem('neonSurvivorScores', JSON.stringify(highScores));
}

function getHighScores() {
    const stored = localStorage.getItem('neonSurvivorScores');
    return stored ? JSON.parse(stored) : [];
}

function updateUI() {
    document.getElementById('scoreDisplay').innerText = score;
    document.getElementById('waveNum').innerText = wave;
    document.getElementById('hpText').innerText = Math.floor(player.hp) + "/" + player.maxHp;
    document.getElementById('hpBar').style.width = Math.max(0, (player.hp / player.maxHp) * 100) + "%";
    document.getElementById('levelText').innerText = player.level;
    document.getElementById('expBar').style.width = (player.exp / player.nextLevelExp) * 100 + "%";
    document.getElementById('weaponDisplay').innerText = player.weapons.map(w => weapons[w].name).join(', ');
}

function drawGridLines(color) {
    const gridSize = 100;
    const offX = -camera.x % gridSize, offY = -camera.y % gridSize;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = offX; x < canvas.width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = offY; y < canvas.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
}

function animate() {
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === "playing") {
        frameCount++;
        updatePlayer();

        const spawnInterval = Math.max(10, spawnRate - wave * 2);
        const bossSpawnModifier = isBossActive ? 1.43 : 1;
        if (frameCount % Math.floor(spawnInterval * bossSpawnModifier) === 0) enemies.push(new Enemy());

        if (frameCount % 60 === 0) {
            timeSeconds++;

            if (timeSeconds % 30 === 0) {
                wave++;
                if (wave <= 35) {
                    enemyBaseHp = 10 * Math.pow(wave, 0.9);
                } else {
                    enemyBaseHp = (10 * Math.pow(35, 0.9)) + (wave - 35) * 50;
                }
                soundManager.setWave(wave);
                if (wave % 5 === 0) {
                    spawnBoss();
                }
                updateUI();
            }
            const m = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
            const s = (timeSeconds % 60).toString().padStart(2, '0');
            document.getElementById('timeDisplay').innerText = m + ":" + s;
        }

        // Grid and Background
        const waveIntensity = 1 + (Math.min(wave, 30) / 30) * 0.5;
        const baseBeat = (soundManager.current16thNote % 4 === 0) ? 0.2 : 0.05;
        const beat = baseBeat * waveIntensity;

        const gridColor = isBossActive ? `rgba(255,0,0,${beat + 0.2})` : getWaveColor(beat);

        // Boss Background Effect
        if (isBossActive) {
            const pulse = 0.15 + Math.sin(frameCount * 0.1) * 0.05;
            ctx.fillStyle = `rgba(50, 0, 0, ${pulse})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Add Vignette
            const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height / 3, canvas.width / 2, canvas.height / 2, canvas.height);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, 'rgba(100, 0, 0, 0.4)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        drawGridLines(gridColor);

        const boundaryColor = isBossActive ? 'rgba(255,0,0,0.6)' : 'rgba(0,170,255,0.5)';
        ctx.strokeStyle = boundaryColor;
        ctx.lineWidth = 4;
        ctx.setLineDash([20, 10]);
        ctx.strokeRect(-camera.x, -camera.y, world.width, world.height);
        ctx.setLineDash([]);

        const warningWidth = 50;
        ctx.fillStyle = isBossActive ? 'rgba(255,0,0,0.1)' : 'rgba(255,100,0,0.1)';
        ctx.fillRect(-camera.x, -camera.y, world.width, warningWidth);
        ctx.fillRect(-camera.x, world.height - camera.y - warningWidth, world.width, warningWidth);
        ctx.fillRect(-camera.x, -camera.y, warningWidth, world.height);
        ctx.fillRect(world.width - camera.x - warningWidth, -camera.y, warningWidth, world.height);

        gems.forEach((g, i) => {
            const d = Math.hypot(g.x - player.x, g.y - player.y);
            if (d < player.magnetRadius) {
                g.x += (player.x - g.x) * 0.1; g.y += (player.y - g.y) * 0.1;
                if (d < 20) {
                    player.exp += g.val * (player.expMult || 1);
                    soundManager.playGem(); g.marked = true;
                    if (player.exp >= player.nextLevelExp) {
                        player.level++; player.exp -= player.nextLevelExp; player.nextLevelExp = Math.floor(player.nextLevelExp * 1.15);
                        gameState = "levelup"; generateUpgradeOptions(); updateUI();
                    }
                    updateUI();
                }
            }
            ctx.fillStyle = g.val > 20 ? '#ff00ff' : '#0f0';
            ctx.beginPath(); ctx.arc(g.x - camera.x, g.y - camera.y, g.size || 4, 0, 6.28); ctx.fill();
            if (g.marked) gems.splice(i, 1);
        });

        // Weapon Multiplier Logic for Bullets
        const dmgMult = getDamageMultiplier();

        bullets.forEach((b, i) => {
            b.update(); b.draw();
            if (!b.isEnemy) {
                enemies.forEach(e => {
                    if (Math.hypot(e.x - b.x, e.y - b.y) < (e.isBoss ? e.size : e.size) + b.size) {
                        const baseDmg = (weapons.scatter && b.maxDist < 2000) ? weapons.scatter.attackPower : weapons.gun.attackPower;
                        e.takeDamage(baseDmg * dmgMult); b.marked = true;
                    }
                });
            } else {
                if (Math.hypot(player.x - b.x, player.y - b.y) < player.size + b.size) {
                    takePlayerDamage(10);
                    b.marked = true;
                }
            }
            if (b.marked) bullets.splice(i, 1);
        });

        bossBullets.forEach((b, i) => {
            b.update(); b.draw();
            if (Math.hypot(player.x - b.x, player.y - b.y) < player.size + b.size) {
                takePlayerDamage(10);
                b.marked = true;
            }
            if (b.marked) bossBullets.splice(i, 1);
        });

        bombs.forEach((b, i) => {
            if (b instanceof BombProjectile) {
                b.update(); b.draw();
                if (b.marked) bombs.splice(i, 1);
            } else {
                b.r += 5; b.alpha -= 0.05;
                ctx.fillStyle = `rgba(255, 100, 0, ${b.alpha})`;
                ctx.beginPath(); ctx.arc(b.x - camera.x, b.y - camera.y, b.r, 0, 6.28); ctx.fill();
                if (b.alpha <= 0) bombs.splice(i, 1);
            }
        });

        laserBeams.forEach((l, i) => {
            l.life--;
            ctx.strokeStyle = '#0ff'; ctx.lineWidth = l.life / 2; ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
            ctx.beginPath();
            const a = Math.atan2(l.y2 - l.y1, l.x2 - l.x1);
            ctx.moveTo(l.x1 - camera.x, l.y1 - camera.y);
            ctx.lineTo((l.x1 + Math.cos(a) * l.w.range) - camera.x, (l.y1 + Math.sin(a) * l.w.range) - camera.y);
            ctx.stroke(); ctx.shadowBlur = 0;
            if (l.life <= 0) laserBeams.splice(i, 1);
        });

        whips.forEach((w, i) => { w.update(); w.draw(); if (w.life <= 0) whips.splice(i, 1); });
        thunders.forEach((t, i) => { t.update(); t.draw(); if (t.life <= 0) thunders.splice(i, 1); });
        mines.forEach((m, i) => { m.update(); m.draw(); if (m.life <= 0) mines.splice(i, 1); });
        rotatingBlades.forEach(b => b.draw(weapons.blade));

        sanctuaryParticles.forEach((p, i) => {
            p.life--;
            ctx.fillStyle = `rgba(0, 255, 255, ${p.life / 20})`;
            ctx.fillRect(p.x - camera.x, p.y - camera.y, 4, 4);
            if (p.life <= 0) sanctuaryParticles.splice(i, 1);
        });
        if (player.weapons.includes('sanctuary')) {
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
            ctx.beginPath(); ctx.arc(player.x - camera.x, player.y - camera.y, weapons.sanctuary.range, 0, 6.28); ctx.stroke();
        }

        enemies.forEach((e, i) => { e.update(); e.draw(); if (e.marked) enemies.splice(i, 1); });

        ctx.fillStyle = player.color; ctx.shadowBlur = 15; ctx.shadowColor = player.color;
        ctx.beginPath(); ctx.arc(player.x - camera.x, player.y - camera.y, player.size, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;

        floatingTexts.forEach((t, i) => { t.update(); t.draw(); if (t.life <= 0) floatingTexts.splice(i, 1); });
        particles.forEach((p, i) => { p.update(); p.draw(); if (p.life <= 0) particles.splice(i, 1); });

    } else if (gameState === "levelup") {
        drawGridLines('#333');
        enemies.forEach(e => e.draw());
        rotatingBlades.forEach(b => b.draw(weapons.blade));
        ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(player.x - camera.x, player.y - camera.y, player.size, 0, 6.28); ctx.fill();

        ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff"; ctx.font = "bold 40px Arial"; ctx.textAlign = "center";
        ctx.fillText("LEVEL UP", canvas.width / 2, 100);

        const boxWidth = 220, boxHeight = 280, gap = 20;
        const startX = (canvas.width - ((boxWidth * 3) + (gap * 2))) / 2;
        const startY = (canvas.height - boxHeight) / 2;

        upgradeOptions.forEach((opt, i) => {
            const x = startX + i * (boxWidth + gap);
            const y = startY;
            const grad = ctx.createLinearGradient(x, y, x, y + boxHeight);
            grad.addColorStop(0, '#222'); grad.addColorStop(1, '#111');
            ctx.fillStyle = grad; ctx.fillRect(x, y, boxWidth, boxHeight);
            ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, boxWidth, boxHeight);

            ctx.fillStyle = '#00aaff'; ctx.font = 'bold 18px Arial'; ctx.fillText(opt.name, x + boxWidth / 2, y + 40);
            ctx.fillStyle = '#ccc'; ctx.font = '14px Arial';
            wrapText(ctx, opt.description, x + boxWidth / 2, y + 100, boxWidth - 20, 20);
        });
    } else if (gameState === "gameover") {
        ctx.fillStyle = "rgba(10, 0, 0, 0.9)"; ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Title
        ctx.fillStyle = "#ff0000";
        ctx.font = "900 60px 'Courier New'";
        ctx.textAlign = "center";
        ctx.shadowBlur = 20; ctx.shadowColor = "red";
        ctx.fillText("SYSTEM FAILURE", cx, cy - 250);
        ctx.shadowBlur = 0;

        // Current Run Stats
        ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.font = "bold 20px 'Segoe UI'";
        const statsX = cx - 300;
        const statsY = cy - 180;

        ctx.fillStyle = "#00aaff"; ctx.fillText("SESSION REPORT", statsX, statsY);
        ctx.fillStyle = "#fff"; ctx.font = "16px 'Courier New'";

        const timeStr = document.getElementById('timeDisplay').innerText;
        const lines = [
            `SCORE:        ${score}`,
            `SURVIVAL:     ${timeStr}`,
            `WAVE REACHED: ${wave}`,
            `TOTAL DAMAGE: ${Math.floor(totalDamageDealt)}`,
            `WEAPONS:      ${player.weapons.length}`
        ];

        lines.forEach((line, i) => {
            ctx.fillText(line, statsX, statsY + 30 + (i * 25));
        });

        ctx.font = "12px Arial"; ctx.fillStyle = "#aaa";
        wrapText(ctx, player.weapons.map(w => weapons[w].name).join(', '), statsX, statsY + 170, 250, 16);

        const boardX = cx + 50;
        const boardY = cy - 180;
        ctx.fillStyle = "#ffaa00"; ctx.font = "bold 20px 'Segoe UI'";
        ctx.fillText("HIGH SCORES", boardX, boardY);

        const highScores = getHighScores();
        ctx.font = "14px 'Courier New'";
        highScores.forEach((s, i) => {
            const y = boardY + 30 + (i * 40);
            ctx.fillStyle = i === 0 ? "#ffff00" : "#fff";
            ctx.fillText(`${i + 1}. ${s.score} pts - Wave ${s.wave}`, boardX, y);
            ctx.fillStyle = "#888";
            ctx.fillText(`   ${s.date.split(' ')[0]}`, boardX, y + 15);
        });

        const btnY = cy + 200;
        if (frameCount % 60 < 30) {
            ctx.fillStyle = "#00ff00";
            ctx.font = "bold 24px 'Courier New'";
            ctx.textAlign = "center";
            ctx.fillText("> CLICK TO REBOOT SYSTEM <", cx, btnY);
        }
    }

    if (wave > 30) {
        const progress = Math.min(1, (wave - 30) / 10);

        if (progress > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'saturation';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = progress;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        const noiseIntensity = progress * 0.3;
        if (noiseIntensity > 0) {
            const noiseCount = Math.floor(progress * 100);
            for (let i = 0; i < noiseCount; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const w = Math.random() * 50 + 1;
                const h = Math.random() * 2 + 1;
                ctx.fillRect(x, y, w, h);
            }
        }

        if (Math.random() < 0.05 + progress * 0.2) {
            const h = Math.random() * (50 + progress * 100) + 10;
            const y = Math.random() * canvas.height;
            if (Math.random() < progress) {
                const v = Math.random() * 50 + 200;
                ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${0.2 + progress * 0.3})`;
            } else {
                ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.2)`;
            }
            ctx.fillRect(0, y, canvas.width, h);
        }

        if (Math.random() < 0.02 + progress * 0.1) {
            const shake = 5 + progress * 20;
            camera.x += (Math.random() - 0.5) * shake;
            camera.y += (Math.random() - 0.5) * shake;
        }

        if (Math.random() < 0.01 + progress * 0.05) {
            soundManager.playGlitch();
        }
    }

    requestAnimationFrame(animate);
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

function addFloatingText(x, y, text, color) {
    floatingTexts.push(new FloatingText(x, y, text, color));
}

resetGame();
