// --- Neon_Survivor.js ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const soundManager = new SoundManager();

const camera = { x: 0, y: 0, zoom: 1 };
let viewWidth = canvas.width;
let viewHeight = canvas.height;
// CSS (logical) pixel dimensions (canvas backing store is device pixels)
let cssWidth = canvas.width / (window.devicePixelRatio || 1);
let cssHeight = canvas.height / (window.devicePixelRatio || 1);

// Utility function to detect mobile landscape orientation
function isMobileLandscape() {
    return window.innerHeight < 600 && window.innerWidth > window.innerHeight;
}

function updateCameraZoom() {
    if (isMobileLandscape()) {
        camera.zoom = 0.6; // Zoom out more in landscape to show full view
    } else if (window.innerWidth < 768) {
        camera.zoom = 0.75; // Mobile portrait
    } else {
        camera.zoom = 0.85; // Desktop
    }
    updateViewSize();
}

function updateCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateViewSize();
}

function updateViewSize() {
    const dpr = window.devicePixelRatio || 1;
    // cssWidth / cssHeight are logical (CSS) pixels
    cssWidth = canvas.width / dpr;
    cssHeight = canvas.height / dpr;
    viewWidth = cssWidth / camera.zoom;
    viewHeight = cssHeight / camera.zoom;
}

updateCanvasSize();
updateCameraZoom();
window.addEventListener('resize', handleViewportResize);
window.addEventListener('orientationchange', handleViewportResize);

// UI
const startBtn = document.getElementById('startBtn');
const neuralBtn = document.getElementById('neuralBtn');
const overlay = document.getElementById('overlay');
const ui = document.getElementById('ui');
const muteBtn = document.getElementById('muteBtn');
const bossWarning = document.getElementById('bossWarning');
const audioContainer = document.getElementById('audioContainer');
const audioToggle = document.getElementById('audioToggle');
const audioPanel = document.getElementById('audioPanel');
const audioControls = document.getElementById('audioControls');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const gameSubtitle = document.getElementById('gameSubtitle');

const META_STORAGE_KEY = 'neonSurvivorMeta';
const GAME_STATES = {
    START: 'start',
    PLAYING: 'playing',
    LEVELUP: 'levelup',
    WEAPONSELECT: 'weaponselect',
    REWARD: 'reward',
    META: 'meta',
    GAMEOVER: 'gameover'
};

let gameState = GAME_STATES.START;
let isAnimating = false;
let enemyGlobalHpMul = 1;
let score = 0;
let wave = 1;
let frameCount = 0;
let timeSeconds = 0;
let totalDamageDealt = 0;
let lastRunShardsEarned = 0;
let lastRunWasNewRecord = false;
let lastRunRecordId = null;
let hoveredMetaUpgradeId = null;
const metaClickAreas = { cards: [] };
const MAX_DT = 0.05;
let dtSeconds = 1 / 60;
let dtFrames = 1;
let lastTimestamp = 0;
let spawnAccumulator = 0;

const initialVolume = Math.round(soundManager.masterVolume * 100);
volumeSlider.value = initialVolume;
volumeValue.innerText = `${initialVolume}%`;

function setAudioPanel(isOpen) {
    audioContainer.classList.toggle('open', !!isOpen);
    audioPanel.setAttribute('aria-hidden', String(!isOpen));
    audioToggle.setAttribute('aria-expanded', String(!!isOpen));
}

audioToggle.addEventListener('click', () => {
    const nextOpen = !audioContainer.classList.contains('open');
    setAudioPanel(nextOpen);
});

muteBtn.addEventListener('click', () => {
    soundManager.toggleMute();
    muteBtn.textContent = soundManager.isMuted ? '🔇 UNMUTE' : '🔊 MUTE';
});

volumeSlider.addEventListener('input', (e) => {
    const volume = Number(e.target.value) / 100;
    soundManager.setMasterVolume(volume);
    volumeValue.innerText = `${Math.round(volume * 100)}%`;
});

// Touch Controls - Define early for use in event listeners
const touchControls = document.getElementById('touchControls');
const joystickZone = document.getElementById('joystickZone');
const joystickStick = document.getElementById('joystickStick');

// Detect if device supports touch
const isTouchDevice = () => {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
};

// Function to hide address bar and enter fullscreen on mobile
function hideAddressBar() {
    // Scroll to hide address bar on mobile browsers
    if (isTouchDevice()) {
        window.scrollTo(0, 1);
        setTimeout(() => window.scrollTo(0, 1), 100);
    }
    
    // Try to request fullscreen API for better immersion
    const docElement = document.documentElement;
    if (docElement.requestFullscreen) {
        docElement.requestFullscreen().catch(() => {
            // Fullscreen request failed, that's okay - scrolling should help
        });
    } else if (docElement.webkitRequestFullscreen) {
        docElement.webkitRequestFullscreen().catch(() => {});
    } else if (docElement.mozRequestFullScreen) {
        docElement.mozRequestFullScreen().catch(() => {});
    } else if (docElement.msRequestFullscreen) {
        docElement.msRequestFullscreen().catch(() => {});
    }
}

// Update canvas size to handle dynamic viewport changes
function handleViewportResize() {
    updateCanvasSize();
    updateCameraZoom();
}

startBtn.addEventListener('click', () => {
    soundManager.init();
    loadEnemyImages();
    overlay.style.display = 'none';
    ui.style.display = 'flex';
    audioContainer.style.display = 'block';
    setAudioPanel(false);
    if (isTouchDevice()) {
        touchControls.style.display = 'block';
    }
    gameState = "playing";
    resetGame();
    soundManager.startBGM();
    if (!isAnimating) {
        isAnimating = true;
        animate();
    }
    
    // Hide address bar on mobile devices
    hideAddressBar();
});

neuralBtn.addEventListener('click', () => {
    soundManager.init();
    overlay.style.display = 'none';
    ui.style.display = 'none';
    audioContainer.style.display = 'none';
    touchControls.style.display = 'none';
    soundManager.stopBGM();
    gameState = 'meta';
});

function handleMetaHover(mouseX, mouseY) {
    hoveredMetaUpgradeId = null;
    for (let i = 0; i < metaClickAreas.cards.length; i++) {
        const card = metaClickAreas.cards[i];
        if (pointInRect(mouseX, mouseY, card)) {
            hoveredMetaUpgradeId = card.def.id;
            break;
        }
    }
}

const keys = {};
window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
});
window.addEventListener('keyup', function (e) {
    keys[e.key] = false;
});

// Prevent stuck keys when window loses focus
window.addEventListener('blur', function () {
    Object.keys(keys).forEach(function (key) {
        keys[key] = false;
    });
});

// Touch Controls State
const JOYSTICK_CENTER_OFFSET = 40; // Max distance the stick can travel from center
let touchActive = false;
let touchDx = 0;
let touchDy = 0;
let touchStartX = 0;
let touchStartY = 0;

// Show touch controls on touch devices (landscape only)
if (isTouchDevice()) {
    touchControls.style.display = 'block';
    gameSubtitle.textContent = 'Use Joystick to Move | Boss Every 5 Waves';
}

function recenterJoystickStick() {
    const rect = joystickZone.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    joystickStick.style.left = centerX + 'px';
    joystickStick.style.top = centerY + 'px';
}

function handleJoystickStart(e) {
    touchActive = true;
    const rect = joystickZone.getBoundingClientRect();
    touchStartX = rect.left + rect.width / 2;
    touchStartY = rect.top + rect.height / 2;
    // スティックの表示位置を中央にリセット
    recenterJoystickStick();
}

function handleJoystickMove(e) {
    if (!touchActive) return;
    
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > 0) {
        const angle = Math.atan2(deltaY, deltaX);
        const limitedDistance = Math.min(distance, JOYSTICK_CENTER_OFFSET);
        
        touchDx = Math.cos(angle) * (limitedDistance / JOYSTICK_CENTER_OFFSET);
        touchDy = Math.sin(angle) * (limitedDistance / JOYSTICK_CENTER_OFFSET);
        
        // Update joystick visual position
        const rect = joystickZone.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const stickX = centerX + (touchDx * JOYSTICK_CENTER_OFFSET);
        const stickY = centerY + (touchDy * JOYSTICK_CENTER_OFFSET);
        joystickStick.style.left = stickX + 'px';
        joystickStick.style.top = stickY + 'px';
    }
}

function handleJoystickEnd(e) {
    touchActive = false;
    touchDx = 0;
    touchDy = 0;
    
    // Reset joystick to center
    recenterJoystickStick();
}

// Add touch event listeners
joystickZone.addEventListener('touchstart', handleJoystickStart, { passive: false });
joystickZone.addEventListener('touchmove', handleJoystickMove, { passive: false });
joystickZone.addEventListener('touchend', handleJoystickEnd, { passive: false });
joystickZone.addEventListener('touchcancel', handleJoystickEnd, { passive: false });

// Also support mouse for testing
joystickZone.addEventListener('mousedown', handleJoystickStart);
joystickZone.addEventListener('mousemove', handleJoystickMove);
joystickZone.addEventListener('mouseup', handleJoystickEnd);
joystickZone.addEventListener('mouseleave', handleJoystickEnd);

function handleCanvasAction(x,y) {
 if (gameState === 'gameover') { overlay.style.display='flex'; ui.style.display='none'; audioContainer.style.display='none'; touchControls.style.display='none'; gameState='start'; }
 else if(gameState==='meta')handleMetaClick(x,y);
}
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();handleCanvasAction(e.clientX-r.left,e.clientY-r.top);});
canvas.addEventListener('mousemove',e=>{if(gameState==='meta'){const r=canvas.getBoundingClientRect();handleMetaHover(e.clientX-r.left,e.clientY-r.top);}});

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
    damageReduction: 0, // Fortress Skill
    healOnWave: 0,
    gemExpBonus: 0
};

const world = { width: 3000, height: 3000 };
const isOffscreen = (sx, sy, margin = 100) => sx < -margin || sx > viewWidth + margin || sy < -margin || sy > viewHeight + margin;

let enemies = [], bullets = [], particles = [], gems = [], weaponItems = [], upgradeOptions = [], floatingTexts = [];
let laserBeams = [], bombs = [], thunders = [], whips = [], sanctuaryParticles = [], mines = [];
let bossBullets = [];
let rotatingBlades = [];
let selectedUpgradeIndex = 0;
let hoveredUpgradeIndex = -1;

// Session-only modifiers for single-run buffs (separates base/persistent vs temporary session buffs)
const playerSessionMods = {
    player: { speedMul: 1, maxHpAdd: 0, magnetMul: 1, expMulAdd: 0, damageReductionAdd: 0 },
    weapons: {},
    weaponsApplyForEach: (fn) => { Object.keys(weapons).forEach(k => fn(k)); }
};

// Initialize default per-weapon session modifiers
Object.keys(weapons).forEach(k => {
    playerSessionMods.weapons[k] = { attackMul: 1, cooldownMul: 1, rangeMul: 1, explosionMul: 1, blastMul: 1 };
});

function getUpgradeLayout() {
    const isPortrait = cssWidth < cssHeight;
    const MIN_TOP_MARGIN = 40;
    
    let responsiveScale;
    let boxWidth, boxHeight, gap, columns, rows;

    if (isPortrait) {
        // Portrait layout (Mobile Vertical)
        responsiveScale = Math.min(1, Math.max(0.6, cssWidth / 400));
        
        // Calculate available height for 3 cards with gaps and margins
        // Reserve space for title (approx 15% or 100px)
        const topSpace = Math.max(80, cssHeight * 0.15);
        const bottomSpace = Math.max(40, cssHeight * 0.05);
        const availableHeight = cssHeight - topSpace - bottomSpace;
        
        gap = 20 * responsiveScale;
        
        // Calculate max possible height per card to fit 3 vertically
        const maxCardHeight = (availableHeight - (gap * 2)) / 3;
        
        // Standard card ratio is 220:280 (approx 0.78)
        const cardRatio = 220 / 280;
        
        boxHeight = Math.min(280 * responsiveScale, maxCardHeight);
        boxWidth = boxHeight * cardRatio;
        
        columns = 1;
        rows = upgradeOptions.length;
    } else {
        // Landscape layout (Desktop / Mobile Horizontal)
        if (isMobileLandscape()) {
            responsiveScale = Math.min(0.65, Math.max(0.5, cssHeight / 600));
        } else {
            responsiveScale = Math.min(1, Math.max(0.7, cssWidth / 1400));
        }
        
        boxWidth = 220 * responsiveScale;
        boxHeight = 280 * responsiveScale;
        gap = 20 * responsiveScale;
        columns = Math.max(1, Math.min(3, Math.floor((cssWidth + gap) / (boxWidth + gap))));
        rows = Math.max(1, Math.ceil(upgradeOptions.length / columns));
    }

    const totalWidth = columns * boxWidth + (columns - 1) * gap;
    const totalHeight = rows * boxHeight + (rows - 1) * gap;
    
    const startX = (cssWidth - totalWidth) / 2;
    let startY;
    
    if (isPortrait) {
         // Center vertically but respect top margin for title
         startY = Math.max(cssHeight * 0.15, (cssHeight - totalHeight) / 2 + (cssHeight * 0.05));
    } else {
         startY = Math.max(MIN_TOP_MARGIN * responsiveScale, (cssHeight - totalHeight) / 2);
    }

    return { boxWidth, boxHeight, gap, startX, startY, columns, rows, responsiveScale, isPortrait };
}

let enemyBaseHp = 10;
let spawnRate = 60;

function loadMetaData() {
    const defaultUpgrades = Object.fromEntries(metaUpgradeDefs.map((def) => [def.id, 0]));
    const defaults = { shards: 0, totalRuns: 0, upgrades: defaultUpgrades };
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        return {
            shards: Number.isFinite(parsed.shards) ? parsed.shards : 0,
            totalRuns: Number.isFinite(parsed.totalRuns) ? parsed.totalRuns : 0,
            upgrades: { ...defaultUpgrades, ...(parsed.upgrades || {}) }
        };
    } catch (_) {
        return defaults;
    }
}

function saveMetaData(meta) {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
}

function applyMetaUpgrades() {
    const meta = loadMetaData();
    const u = meta.upgrades || {};
    const startHpLv = u.startHp || 0;
    const atkLv = u.attackPower || 0;
    const speedLv = u.moveSpeed || 0;
    const cdrLv = u.cooldown || 0;
    const expLv = u.expGain || 0;
    const magnetLv = u.magnetRange || 0;
    const armorLv = u.armor || 0;
    const healLv = u.healOnWave || 0;
    const gemLv = u.gemBonus || 0;

    player.maxHp += startHpLv * 15;
    player.hp = player.maxHp;
    playerSessionMods.player.speedMul *= (1 + speedLv * 0.04);
    playerSessionMods.player.expMulAdd += expLv * 0.10;
    playerSessionMods.player.magnetMul *= (1 + magnetLv * 0.15);
    playerSessionMods.player.damageReductionAdd += armorLv * 0.05;
    player.healOnWave = healLv * 8;
    player.gemExpBonus = gemLv * 0.12;

    Object.keys(playerSessionMods.weapons).forEach((key) => {
        playerSessionMods.weapons[key].attackMul *= (1 + atkLv * 0.05);
        playerSessionMods.weapons[key].cooldownMul *= Math.pow(0.95, cdrLv);
    });
}

function handleMetaClick(clickX, clickY) {
    const clicked = metaClickAreas.cards.find((card) => pointInRect(clickX, clickY, card));
    if (!clicked) return;
    const meta = loadMetaData();
    const level = meta.upgrades[clicked.def.id] || 0;
    if (level >= clicked.def.maxLevel) return;
    const cost = clicked.def.costs[level];
    if (meta.shards < cost) return;
    meta.shards -= cost;
    meta.upgrades[clicked.def.id] = level + 1;
    saveMetaData(meta);
}

function drawMetaScreen() {
    const meta = loadMetaData();
    const cardWidth = Math.min(290, cssWidth * 0.26);
    const cardHeight = 110;
    const gap = 14;
    const cols = Math.max(1, Math.floor((cssWidth - 30) / (cardWidth + gap)));
    const startX = (cssWidth - (cols * cardWidth + (cols - 1) * gap)) / 2;
    const startY = 120;
    metaClickAreas.cards = [];

    ctx.fillStyle = '#030610';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#00d9ff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('NEURAL UPGRADES', cssWidth / 2, 58);
    ctx.font = '20px Arial';
    ctx.fillStyle = '#84ffb9';
    ctx.fillText(`SHARDS: ${meta.shards} ✦`, cssWidth / 2, 92);

    metaUpgradeDefs.forEach((def, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardWidth + gap);
        const y = startY + row * (cardHeight + gap);
        const level = meta.upgrades[def.id] || 0;
        const maxed = level >= def.maxLevel;
        const cost = maxed ? '-' : def.costs[level];
        const hovered = hoveredMetaUpgradeId === def.id;

        ctx.fillStyle = hovered ? '#1a3040' : '#111a28';
        ctx.fillRect(x, y, cardWidth, cardHeight);
        ctx.strokeStyle = maxed ? '#84ffb9' : '#00aaff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardWidth, cardHeight);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(def.name, x + 12, y + 24);
        ctx.font = '13px Arial';
        ctx.fillStyle = '#a8b7c5';
        ctx.fillText(def.description, x + 12, y + 47);
        ctx.fillStyle = '#ffd166';
        ctx.fillText(`Lv ${level}/${def.maxLevel}`, x + 12, y + 70);
        ctx.fillStyle = maxed ? '#84ffb9' : '#fff';
        ctx.fillText(maxed ? 'MAX' : `Cost: ${cost} ✦`, x + 12, y + 92);

        metaClickAreas.cards.push({ x, y, width: cardWidth, height: cardHeight, def });
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9da4aa';
    ctx.font = '14px Arial';
    ctx.fillText('Click card to upgrade / Press SYSTEM START to play', cssWidth / 2, cssHeight - 20);
}

function pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

function resetGame(chooseWeapon = gameState === GAME_STATES.PLAYING) {
    soundManager.stopBGM();
    
    weapons = JSON.parse(JSON.stringify(weaponsInitial));

    lastTimestamp = 0; // Reset delta-time tracking
    spawnAccumulator = 0;
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
    player.healOnWave = 0;
    player.gemExpBonus = 0;
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

    player.weapons = [];
    player.weaponCooldowns = {};
    player.contactDamageCooldown = 0; player.invincibleFrames = 0;
    player.lastMoveAngle = 0; resetBuild();
    camera.x = player.x - viewWidth / 2; camera.y = player.y - viewHeight / 2;
    // Reset session modifiers each run
    playerSessionMods.player = { speedMul: 1, maxHpAdd: 0, magnetMul: 1, expMulAdd: 0, damageReductionAdd: 0 };
    Object.keys(playerSessionMods.weapons).forEach(k => {
        playerSessionMods.weapons[k] = { attackMul: 1, cooldownMul: 1, rangeMul: 1, explosionMul: 1, blastMul: 1 };
    });

    applyMetaUpgrades();
    updateUI();
    if (chooseWeapon) beginWeaponSelection();
}

function takePlayerDamage(rawDamage, cooldown = 30) {
    if (player.contactDamageCooldown > 0 || player.invincibleFrames > 0) return;

    // Fortress: Reduce damage
    const actualDamage = Math.max(1, rawDamage * (1 - getPlayerStats().armor));

    player.hp -= actualDamage;
    player.contactDamageCooldown = cooldown;
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
    const missingHpRatio = 1 - (player.hp / getPlayerStats().maxHp);
    return 1 + player.adrenaline * missingHpRatio * 0.3;
}

// Calculate Global Damage Multiplier
function getDamageMultiplier() {
    let mult = 1.0;

    // Vital Strike: Bonus at high HP
    if (player.vitalStrike > 0) {
        const hpRatio = player.hp / getPlayerStats().maxHp;
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
    if (player.contactDamageCooldown > 0) player.contactDamageCooldown = Math.max(0, player.contactDamageCooldown - dtFrames);
    let dx = 0, dy = 0;
    
    // Keyboard input
    if (keys['w'] || keys['ArrowUp']) dy = -1; if (keys['s'] || keys['ArrowDown']) dy = 1;
    if (keys['a'] || keys['ArrowLeft']) dx = -1; if (keys['d'] || keys['ArrowRight']) dx = 1;
    
    // Touch input (overrides keyboard if active)
    if (touchActive) {
        dx = touchDx;
        dy = touchDy;
    }
    
    if (dx || dy) {
        player.lastMoveAngle = Math.atan2(dy, dx);
        const l = Math.hypot(dx, dy);
        const moveSpeed = player.speed * (playerSessionMods.player.speedMul || 1);
        player.x += (dx / l) * moveSpeed * dtFrames; player.y += (dy / l) * moveSpeed * dtFrames;
    }
    player.x = clamp(player.x, 0, world.width);
    player.y = clamp(player.y, 0, world.height);
    camera.x += (player.x - viewWidth / 2 - camera.x) * 0.1;
    camera.y += (player.y - viewHeight / 2 - camera.y) * 0.1;

    updateWeapons();
}

function findNearest(range) {
    let nearestEnemy = null;
    let minEnemyDist = range;
    
    let nearestBoss = null;
    let minBossDist = range;

    enemies.forEach(e => {
        if (e.marked) return;
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        
        // Ensure within range (and consider enemy size for edge-to-edge detection if desired, 
        // but center-to-center is standard for simple checks. 
        // We stick to range limit logic provided.)
        
        if (e.isBoss) {
            if (d < minBossDist) {
                minBossDist = d;
                nearestBoss = e;
            }
        } else {
            if (d < minEnemyDist) {
                minEnemyDist = d;
                nearestEnemy = e;
            }
        }
    });

    // Prioritize Boss if within range
    if (nearestBoss) return nearestBoss;
    return nearestEnemy;
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

function generateUpgradeOptions() { upgradeOptions = makeUpgradeOptions(); }
function saveScore() {
    const previousBest = getHighScores()[0]?.score || 0;
    const result = {
        score: score,
        time: document.getElementById('timeDisplay').innerText,
        wave: wave,
        damage: Math.floor(totalDamageDealt),
        weapons: player.weapons.map(w => weapons[w].name),
        date: new Date().toLocaleString(),
        id: Date.now() + '_' + Math.floor(Math.random() * 100000)
    };

    let highScores = getHighScores();
    highScores.push(result);
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 10);

    localStorage.setItem('neonSurvivorScores', JSON.stringify(highScores));

    const meta = loadMetaData();
    const shardGainLevel = meta.upgrades.shardGain || 0;
    const baseShards = Math.floor(wave * 2) + Math.floor(score / 300);
    const multiplier = 1 + shardGainLevel * 0.20;
    const earnedShards = Math.max(0, Math.floor(baseShards * multiplier));
    meta.shards += earnedShards;
    meta.totalRuns += 1;
    saveMetaData(meta);

    lastRunShardsEarned = earnedShards;
    lastRunWasNewRecord = score > previousBest;
    lastRunRecordId = result.id;
}

function getHighScores() {
    const stored = localStorage.getItem('neonSurvivorScores');
    return stored ? JSON.parse(stored) : [];
}

function updateUI() {
    document.getElementById('scoreDisplay').innerText = score;
    document.getElementById('waveNum').innerText = wave;
    document.getElementById('hpText').innerText = Math.floor(player.hp) + "/" + getPlayerStats().maxHp;
    document.getElementById('hpBar').style.width = Math.max(0, (player.hp / getPlayerStats().maxHp) * 100) + "%";
    document.getElementById('levelText').innerText = player.level;
    document.getElementById('expBar').style.width = (player.exp / player.nextLevelExp) * 100 + "%";
    document.getElementById('weaponDisplay').innerText = player.weapons.map(w => weapons[w].name + ' Lv' + runBuild.levels[w] + (runBuild.evolved[w] ? ' ★' : '')).join(', ');
}

function drawGridLines(color) {
    const gridSize = 100;
    const offX = -camera.x % gridSize, offY = -camera.y % gridSize;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = offX; x < viewWidth; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, viewHeight); }
    for (let y = offY; y < viewHeight; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(viewWidth, y); }
    ctx.stroke();
}

function simulateFrame(timestamp = 0) {
    // Compute delta-time for frame-rate independence
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    dtSeconds = Math.min((timestamp - lastTimestamp) / 1000, MAX_DT);
    dtFrames = dtSeconds * 60; // Convert to "frames equivalent" at 60 FPS
    lastTimestamp = timestamp;

    // Use CSS (logical) pixels for full-screen operations since ctx is scaled by devicePixelRatio
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (gameState === "playing") {
        frameCount += dtFrames;
        updatePlayer();

        // Spawn enemies using time accumulator
        const spawnInterval = Math.max(10, spawnRate - wave * 2) / 60; // Convert frames to seconds
        const bossSpawnModifier = isBossActive ? 1.43 : 1;
        spawnAccumulator += dtSeconds;
        
        const spawnThreshold = spawnInterval * bossSpawnModifier / (timeSeconds % 30 < 5 ? .75 : 1);
        while (spawnAccumulator >= spawnThreshold) {
            spawnAccumulator -= spawnThreshold;
            let enemiesToSpawn = 1;
            if (wave > 30) {
                enemiesToSpawn += Math.floor((wave - 30) / 4);
            }
            // Cap spawns per frame to prevent burst on resume
            const maxSpawnsThisFrame = 5;
            enemiesToSpawn = Math.min(enemiesToSpawn, maxSpawnsThisFrame);
            for (let i = 0; i < enemiesToSpawn; i++) {
                enemies.push(new Enemy());
            }
        }

        // Time tracking with accumulator for frame-rate independence
        timeSeconds += dtSeconds;
        const currentWaveCheck = Math.floor(timeSeconds / 30);
        if (currentWaveCheck > wave - 1) {
            wave = currentWaveCheck + 1;
            if (wave <= 35) {
                enemyBaseHp = 10 * Math.pow(wave, 0.9);
            } else {
                enemyBaseHp = (10 * Math.pow(35, 0.9)) + (wave - 35) * 50;
            }

            if (player.healOnWave > 0) {
                player.hp = Math.min(getPlayerStats().maxHp, player.hp + player.healOnWave);
                addFloatingText(player.x, player.y, `+${player.healOnWave} HP`, '#00ff88');
            }

            soundManager.setWave(wave);
            if (wave % 5 === 0) {
                spawnBoss();
            }
            updateUI();
        }
        
        // Update time display
        const m = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
        const s = Math.floor(timeSeconds % 60).toString().padStart(2, '0');
        document.getElementById('timeDisplay').innerText = m + ":" + s;

        // Grid and Background
        const waveIntensity = 1 + (Math.min(wave, 30) / 30) * 0.5;
        const baseBeat = (soundManager.current16thNote % 4 === 0) ? 0.2 : 0.05;
        const beat = baseBeat * waveIntensity;

        const gridColor = isBossActive ? `rgba(255,0,0,${beat + 0.2})` : getWaveColor(beat);

        // Boss Background Effect (use CSS pixels)
        if (isBossActive) {
            const pulse = 0.15 + Math.sin(frameCount * 0.1) * 0.05;
            ctx.fillStyle = `rgba(50, 0, 0, ${pulse})`;
            ctx.fillRect(0, 0, cssWidth, cssHeight);

            // Add Vignette
            const grad = ctx.createRadialGradient(cssWidth / 2, cssHeight / 2, cssHeight / 3, cssWidth / 2, cssHeight / 2, cssHeight);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, 'rgba(100, 0, 0, 0.4)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, cssWidth, cssHeight);
        }

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

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

        forEachReverse(gems, (g, i) => {
            const d = Math.hypot(g.x - player.x, g.y - player.y);
            if (d < getPlayerStats().magnet) {
                g.x += (player.x - g.x) * 0.1; g.y += (player.y - g.y) * 0.1;
                    if (d < 20) {
                    // Use base persistent expMult and add session exp modifiers (additive)
                    const totalExpMul = (player.expMult || 1) * (1 + (playerSessionMods.player.expMulAdd || 0));
                    player.exp += g.val * totalExpMul * (1 + (player.gemExpBonus || 0));
                    soundManager.playGem(); g.marked = true;
                    updateUI();
                }
            }
            ctx.fillStyle = g.val > 20 ? '#ff00ff' : '#0f0';
            ctx.beginPath(); ctx.arc(g.x - camera.x, g.y - camera.y, g.size || 4, 0, 6.28); ctx.fill();
            if (g.marked) gems.splice(i, 1);
        });

        // Weapon Multiplier Logic for Bullets
        const dmgMult = getDamageMultiplier();

        forEachReverse(bullets, (b, i) => {
            b.update(); b.draw();
            if (b.marked) { bullets.splice(i, 1); return; }
            if (!b.isEnemy) {
                enemies.forEach(e => {
                    if (b.marked || e.marked || b.hitEnemies?.has(e)) return;
                    if (Math.hypot(e.x - b.x, e.y - b.y) < (e.isBoss ? e.size : e.size) + b.size) {
                        // If bullet has session-modified base attack, use it; otherwise fallback to weapon definitions
                        const baseDmg = (b._attackBase !== undefined) ? b._attackBase : ((weapons.scatter && b.maxDist < 2000) ? weapons.scatter.attackPower : weapons.gun.attackPower);
                        weaponImpact(e.x,e.y,b.look); e.takeDamage(baseDmg * dmgMult); b.hitEnemies?.add(e); if (b.pierce > 0) b.pierce--; else b.marked = true;
                    }
                });
                if (!b.marked) {
                    const baseDmg = (b._attackBase !== undefined) ? b._attackBase : ((weapons.scatter && b.maxDist < 2000) ? weapons.scatter.attackPower : weapons.gun.attackPower);
                    for (let j = bossBullets.length - 1; j >= 0; j--) {
                        const eb = bossBullets[j];
                        if (eb.marked) continue;
                        if (Math.hypot(eb.x - b.x, eb.y - b.y) < eb.size + b.size) {
                            eb.hp -= baseDmg * dmgMult;
                            if (eb.hp <= 0) {
                                eb.marked = true;
                                createParticles(eb.x, eb.y, '#ff4444', 5);
                            }
                            b.marked = true;
                            break;
                        }
                    }
                }
            } else {
                if (Math.hypot(player.x - b.x, player.y - b.y) < player.size + b.size) {
                    takePlayerDamage(b.damage || 10);
                    b.marked = true;
                }
            }
            if (b.marked) bullets.splice(i, 1);
        });

        forEachReverse(bossBullets, (b, i) => {
            b.update(); b.draw();
            if (Math.hypot(player.x - b.x, player.y - b.y) < player.size + b.size) {
                takePlayerDamage(b.damage || 10);
                b.marked = true;
            }
            if (b.marked) bossBullets.splice(i, 1);
        });

        forEachReverse(bombs, (b, i) => {
            if (b instanceof BombProjectile) {
                b.update(); b.draw();
                if (b.marked) bombs.splice(i, 1);
            } else {
                b.r = b.look?.evolved ? Math.min(b.maxR, b.r + b.maxR / 20) : b.r + 5; b.alpha -= 0.05;
                drawWeaponExplosion(b);
                if (b.alpha <= 0) bombs.splice(i, 1);
            }
        });

        forEachReverse(laserBeams, (l, i) => {
            l.life -= dtFrames;
            drawWeaponRail(l);
            if (l.life <= 0) laserBeams.splice(i, 1);
        });

        forEachReverse(whips, (w, i) => { w.update(); w.draw(); if (w.life <= 0) whips.splice(i, 1); });
        forEachReverse(thunders, (t, i) => { t.update(); t.draw(); if (t.life <= 0) thunders.splice(i, 1); });
        forEachReverse(mines, (m, i) => { m.update(); m.draw(); if (m.life <= 0) mines.splice(i, 1); });
        rotatingBlades.forEach(b => b.draw(getWeaponStats('blade')));

        forEachReverse(sanctuaryParticles, (p, i) => {
          p.life = Math.max(0, p.life - dtFrames);
            ctx.fillStyle = getWeaponLook('sanctuary').color;
            ctx.globalAlpha = p.life / 20;
            ctx.fillRect(p.x - camera.x, p.y - camera.y, 4, 4);
            ctx.globalAlpha = 1;
            if (p.life <= 0) sanctuaryParticles.splice(i, 1);
        });
        if (player.weapons.includes('sanctuary')) drawVoidField();
        drawWeaponEffects();

        updateBuildEffects();
        forEachReverse(enemies, (e, i) => { if (!e.marked && gameState === 'playing') e.update(); if (!e.marked) e.draw(); if(e.marked) enemies.splice(i,1); });

        ctx.fillStyle = player.color; ctx.shadowBlur = 15; ctx.shadowColor = player.color;
        ctx.beginPath(); ctx.arc(player.x - camera.x, player.y - camera.y, player.size, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;

        forEachReverse(floatingTexts, (t, i) => { t.update(); t.draw(); if (t.life <= 0) floatingTexts.splice(i, 1); });
        forEachReverse(particles, (p, i) => { p.update(); p.draw(); if (p.life <= 0) particles.splice(i, 1); });

        ctx.restore();
        processBuildQueue();

    } else if ([GAME_STATES.LEVELUP, GAME_STATES.WEAPONSELECT, GAME_STATES.REWARD].includes(gameState)) {
        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);
        drawGridLines('#333');
        enemies.forEach(e => e.draw());
        rotatingBlades.forEach(b => b.draw(getWeaponStats('blade')));
        ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(player.x - camera.x, player.y - camera.y, player.size, 0, 6.28); ctx.fill();
        ctx.restore();

    } else if (gameState === "meta") {
        drawMetaScreen();
    } else if (gameState === "gameover") {
        ctx.fillStyle = "rgba(10, 0, 0, 0.9)"; ctx.fillRect(0, 0, cssWidth, cssHeight);

        const cx = cssWidth / 2;
        const cy = cssHeight / 2;
        const isPortrait = cssHeight > cssWidth;
        const responsiveScale = clamp(Math.min(cssWidth / 1280, cssHeight / 720), 0.5, 1.05);

        const titleSize = clamp(30, 54 * responsiveScale, 68);
        const headerSize = clamp(14, 18 * responsiveScale, 26);
        const bodySize = clamp(11, 15 * responsiveScale, 20);
        const subSize = clamp(9, 13 * responsiveScale, 18);
        const lineGap = clamp(18, 24 * responsiveScale, 30);

        const safeMargin = cssHeight * 0.05;
        const safeBottom = cssHeight - safeMargin;
        const titleY = safeMargin + titleSize;
        const highScores = getHighScores();
        const visibleScores = isPortrait ? highScores.slice(0, 5) : highScores.slice(0, 7);

        // Title
        ctx.fillStyle = "#ff0000";
        ctx.font = `900 ${titleSize}px 'Courier New'`;
        ctx.textAlign = "center";
        ctx.shadowBlur = 20 * responsiveScale; ctx.shadowColor = "red";
        ctx.fillText("SYSTEM FAILURE", cx, titleY);
        ctx.shadowBlur = 0;

        // Current Run Stats
        const statsX = isPortrait ? cssWidth * 0.08 : cx - 320 * responsiveScale;
        const statsY = isPortrait ? titleY + clamp(16, 36 * responsiveScale, 56) : cy - 150 * responsiveScale;
        const statsWidth = isPortrait ? cssWidth * 0.84 : 260 * responsiveScale;

        ctx.fillStyle = "#00aaff"; ctx.textAlign = "left"; ctx.font = `bold ${headerSize}px 'Segoe UI'`;
        ctx.fillText("SESSION REPORT", statsX, statsY);

        ctx.fillStyle = "#fff"; ctx.font = `${bodySize}px 'Courier New'`;
        const timeStr = document.getElementById('timeDisplay').innerText;
        const lines = [
            `SCORE:        ${score}`,
            `SURVIVAL:     ${timeStr}`,
            `WAVE REACHED: ${wave}`,
            `TOTAL DAMAGE: ${Math.floor(totalDamageDealt)}`,
            `WEAPONS:      ${player.weapons.length}`,
            `SHARDS GAIN:  +${lastRunShardsEarned} ✦`
        ];
        const statsBlockHeight = (lines.length * lineGap) + (lineGap * 2) + (lineGap * Math.max(1, Math.ceil(player.weapons.length / 2)));
        lines.forEach((line, i) => {
            ctx.fillStyle = line.includes('SHARDS GAIN') ? '#84ffb9' : '#fff';
            ctx.fillText(line, statsX, statsY + 30 * responsiveScale + (i * lineGap));
        });

        ctx.font = `${subSize}px Arial`; ctx.fillStyle = "#aaa";
        wrapText(ctx, player.weapons.map(w => weapons[w].name).join(', '), statsX, statsY + statsBlockHeight - (lineGap * 0.5), statsWidth, 16 * responsiveScale);

        if (lastRunWasNewRecord && frameCount % 50 < 25) {
            ctx.fillStyle = '#ffe45c';
            ctx.font = `bold ${clamp(13, 20 * responsiveScale, 26)}px 'Courier New'`;
            ctx.fillText('NEW RECORD', statsX, statsY - 12 * responsiveScale);
        }

        // High Scores
        const boardX = isPortrait ? statsX : cx + 80 * responsiveScale;
        const baseBoardY = isPortrait ? statsY + statsBlockHeight + clamp(12, 28 * responsiveScale, 48) : cy - 150 * responsiveScale;
        const rowHeight = 52 * responsiveScale;
        const boardHeight = (visibleScores.length * rowHeight) + 60 * responsiveScale;
        const maxBoardY = safeBottom - boardHeight - clamp(60, 90 * responsiveScale, 120);
        const boardY = Math.min(baseBoardY, maxBoardY);
        ctx.fillStyle = "#ffaa00"; ctx.font = `bold ${headerSize}px 'Segoe UI'`;
        ctx.fillText("HIGH SCORES", boardX, boardY);

        const rankColor = (rank) => {
            if (rank === 1) return '#ffd700';
            if (rank === 2) return '#c0c0c0';
            if (rank === 3) return '#cd7f32';
            return '#ffffff';
        };

        ctx.font = `${bodySize - 3}px 'Courier New'`;
        visibleScores.forEach((s, i) => {
            const y = boardY + 30 * responsiveScale + (i * rowHeight);

            if (s.id && s.id === lastRunRecordId) {
                ctx.strokeStyle = '#66ffe0';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(boardX - 8, y - 14 * responsiveScale, (isPortrait ? cssWidth * 0.8 : cssWidth * 0.34), rowHeight - 6 * responsiveScale);
            }

            ctx.fillStyle = rankColor(i + 1);
            ctx.fillText(`${i + 1}. ${s.score} pts - Wave ${s.wave}`, boardX, y);
            ctx.fillStyle = '#9da4aa';
            ctx.fillText(`   ${s.time || '--:--'} | ${(s.date || '').split(' ')[0] || ''}`, boardX, y + 14 * responsiveScale);
            ctx.fillStyle = '#7a838a';
            const weaponsText = Array.isArray(s.weapons) ? s.weapons.join(', ') : '-';
            wrapText(ctx, `   ${weaponsText}`, boardX, y + 28 * responsiveScale, (isPortrait ? cssWidth * 0.76 : cssWidth * 0.30), 13 * responsiveScale);
        });

        // Prompt
        const btnYBase = boardY + boardHeight + clamp(20, 36 * responsiveScale, 60);
        const btnY = Math.min(safeBottom - clamp(10, 24 * responsiveScale, 40), btnYBase);
        if (frameCount % 60 < 30) {
            ctx.fillStyle = "#00ff00";
            ctx.font = `bold ${clamp(16, 24 * responsiveScale, 30)}px 'Courier New'`;
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
            ctx.fillRect(0, 0, cssWidth, cssHeight);
            ctx.restore();
        }

        const noiseIntensity = progress * 0.3;
        if (noiseIntensity > 0) {
            const noiseCount = Math.floor(progress * 100);
            for (let i = 0; i < noiseCount; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                const x = Math.random() * cssWidth;
                const y = Math.random() * cssHeight;
                const w = Math.random() * 50 + 1;
                const h = Math.random() * 2 + 1;
                ctx.fillRect(x, y, w, h);
            }
        }

        if (Math.random() < 0.05 + progress * 0.2) {
            const h = Math.random() * (50 + progress * 100) + 10;
            const y = Math.random() * cssHeight;
            if (Math.random() < progress) {
                const v = Math.random() * 50 + 200;
                ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${0.2 + progress * 0.3})`;
            } else {
                ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.2)`;
            }
            ctx.fillRect(0, y, cssWidth, h);
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

let simulationClock = 1000, simulationRemainder = 0, displayTimestamp = null;
function animate(timestamp = 0) {
 if(displayTimestamp === null)displayTimestamp=timestamp;
 simulationRemainder += Math.min(Math.max(0,(timestamp-displayTimestamp)/1000), MAX_DT); displayTimestamp=timestamp;
 while(simulationRemainder >= 1/60-1e-9){simulationRemainder-=1/60;simulationClock+=1000/60;simulateFrame(simulationClock);}
 requestAnimationFrame(animate);
}
