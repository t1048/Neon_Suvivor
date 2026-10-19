// Run-only build data. Persistent upgrades keep their existing storage format.
const weaponGrowth = {
    gun: {
        evolution: '射撃1方向 → 3方向',
        milestone: {
            pierce: 1
        },
        evolvedStats: {
            shotCount: 3
        }
    },
    scatter: {
        evolution: '貫通なし → 敵1体を貫通',
        milestone: {
            count: 1
        },
        evolvedStats: {
            pierce: 1
        }
    },
    whip: {
        evolution: '斬撃2方向 → 4方向',
        milestone: {
            rangeMultiplier: .15
        },
        evolvedStats: {
            directions: 4
        }
    },
    blade: {
        evolution: '刃3本 → 4本・回転＋25%',
        milestone: {
            count: 1
        },
        evolvedStats: {
            extraBlades: 1,
            rotationMultiplier: 1.25
        }
    },
    sanctuary: {
        evolution: '減速なし → 通常敵を30%減速',
        milestone: {
            rangeMultiplier: .15
        },
        evolvedStats: {
            slow: .3
        }
    },
    laser: {
        evolution: '追撃なし → 0.15秒後に威力50%で追撃',
        milestone: {
            beamWidthMultiplier: .25
        },
        evolvedStats: {
            repeatDelay: .15,
            repeatDamage: .5
        }
    },
    bomb: {
        evolution: '再爆発なし → 0.3秒後に威力50%で再爆発',
        milestone: {
            explosionRadiusMultiplier: .15
        },
        evolvedStats: {
            repeatDelay: .3,
            repeatDamage: .5
        }
    },
    thunder: {
        evolution: '初撃に威力100%の追加放電',
        milestone: {
            chainCount: 1
        },
        evolvedStats: {
            extraDamage: 1
        }
    },
    mine: {
        evolution: '爆発後に毎秒威力25%の床を2秒間追加',
        milestone: {
            mineLimit: 1
        },
        evolvedStats: {
            fieldDuration: 2,
            fieldDps: .25
        }
    }
};
const enemyUnlocks = {
    normal: 1,
    tank: 1,
    runner: 1,
    shooter: 1,
    ghost: 1,
    orbiter: 3,
    bomber: 3,
    splitter: 4,
    sniper: 5,
    teleporter: 6
};
const waveThemes = [[], ['tank'], ['runner'], ['ghost', 'orbiter', 'teleporter'], ['shooter', 'sniper'], []];
const runBuild = {
    levels: {},
    evolved: {},
    upgrades: {},
    rerolls: 2,
    bossRewards: 0,
    delayed: [],
    fields: [],
    overclocked: new Set()
};
let selectionKind = null;
function resetBuild() {
    runBuild.levels = {};
    runBuild.evolved = {};
    runBuild.upgrades = {};
    runBuild.rerolls = 2;
    runBuild.bossRewards = 0;
    runBuild.delayed = [];
    runBuild.fields = [];
    runBuild.overclocked.clear();
    weaponEffects.splice(0);
    selectionKind = null;
    document.getElementById('buildSelection').hidden = true;
}
function getPlayerStats() {
    const m = playerSessionMods.player;
    return {
        maxHp: player.maxHp + m.maxHpAdd,
        speed: player.speed * m.speedMul,
        magnet: player.magnetRadius * m.magnetMul,
        armor: clamp(player.damageReduction + m.damageReductionAdd, 0, .75)
    };
}
// Milestones add to Lv1 values; shared modifiers are applied afterwards.
function getWeaponStats(key, level = runBuild.levels[key] || 1) {
    const w = {
        ...weapons[key],
        pierce: 0,
        beamWidth: 5,
        mineLimit: 4,
        shotCount: 1,
        directions: 2
    };
    const mods = playerSessionMods.weapons[key];
    const steps = Math.floor((level - 1) / 2);
    for (const [stat, amount] of Object.entries(weaponGrowth[key].milestone)) {
        if (stat.endsWith('Multiplier')) {
            const target = stat.slice(0, -10);
            w[target] *= 1 + amount * steps;
        }
        else {
            w[stat] = (w[stat] || 0) + amount * steps;
        }
    }
    w.evolved = !!runBuild.evolved[key];
    if (w.evolved) Object.assign(w, weaponGrowth[key].evolvedStats);
    w.attackPower *= (1 + .15 * (level - 1)) * mods.attackMul;
    w.range *= mods.rangeMul;
    w.cooldown = Math.max(1, w.cooldown * mods.cooldownMul / calcCooldownBoost());
    if (w.explosionRadius) w.explosionRadius *= mods.explosionMul;
    if (w.blastRadius) w.blastRadius *= mods.blastMul;
    if (key === 'blade') {
        w.count += w.extraBlades || 0;
        w.rotSpeed *= (w.rotationMultiplier || 1) / mods.cooldownMul * calcCooldownBoost();
    }
    return w;
}
// Reverse traversal preserves splice-based removal without skipping adjacent entities.
function forEachReverse(items, visit) {
    for (let i = items.length - 1; i >= 0; i--) visit(items[i], i);
}
function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}
function addWeapon(key) {
    if (player.weapons.length >= 3 || player.weapons.includes(key)) return;
    player.weapons.push(key);
    runBuild.levels[key] = 1;
    player.weaponCooldowns[key] = 0;
}
function weaponSummary(w, key) {
    let extra = key === 'gun' ? '貫通 ' + w.pierce : key === 'scatter' ? '弾数 ' + w.count : key === 'blade' ? '刃数 ' + w.count : key === 'thunder' ? '命中数 ' + w.chainCount : key === 'mine' ? '設置上限 ' + w.mineLimit : key === 'laser' ? '幅 ' + w.beamWidth.toFixed(1) : '';
    if (w.explosionRadius) extra = '爆発範囲 ' + Math.round(w.explosionRadius);
    return '威力 ' + w.attackPower.toFixed(1) + ' / 射程 ' + Math.round(w.range) + ' / ' + (key === 'blade' ? '回転 ' + w.rotSpeed.toFixed(2) : '間隔 ' + (w.cooldown / 60).toFixed(2) + '秒') + '\n' + extra;
}
function commonSummary(id) {
    const s = getPlayerStats(),
    w = getWeaponStats(player.weapons[0] || 'gun');
    const values = {
        atk: w.attackPower.toFixed(1),
        cdr: (w.cooldown / 60).toFixed(2) + '秒',
        rng: Math.round(w.range),
        hp: s.maxHp,
        mag: Math.round(s.magnet),
        spd: s.speed.toFixed(2),
        exp: Math.round((1 + playerSessionMods.player.expMulAdd) * 100) + '%',
        fortress: Math.round(s.armor * 100) + '%',
        curse: enemyGlobalHpMul.toFixed(2),
        adrenaline: player.adrenaline,
        vital_strike: player.vitalStrike
    };
    return String(values[id]);
}
function commonOption(up) {
    const before = commonSummary(up.id),
    s = getPlayerStats(),
    w = getWeaponStats(player.weapons[0] || 'gun');
    const next = {
        atk: (w.attackPower*1.2).toFixed(1),
        cdr: (w.cooldown*.9/60).toFixed(2)+'秒',
        rng: Math.round(w.range*1.2),
        hp: s.maxHp+20,
        mag: Math.round(s.magnet*1.3),
        spd: (s.speed*1.1).toFixed(2),
        exp: Math.round((1+playerSessionMods.player.expMulAdd+.12)*100)+'%',
        fortress: Math.round(Math.min(.75,s.armor+.15)*100)+'%',
        curse: (enemyGlobalHpMul*1.3).toFixed(2),
        adrenaline: player.adrenaline+1,
        vital_strike: player.vitalStrike+1
    };
    return {
        id: up.id,
        name: up.name,
        description: up.description + '\n' + before + ' → ' + next[up.id],
        apply: () => {
            up.apply();
            runBuild.upgrades[up.id] = (runBuild.upgrades[up.id] || 0) + 1;
        }
    };
}
function makeUpgradeOptions() {
    const owned = player.weapons.filter(k => (runBuild.levels[k] || 1) < 5).map(k => ({
        id: 'grow_' + k,
        name: weapons[k].name + ' Lv' + runBuild.levels[k] + ' → ' + (runBuild.levels[k] + 1),
        description: weaponSummary(getWeaponStats(k), k) + '\n↓\n' + weaponSummary(getWeaponStats(k, runBuild.levels[k] + 1), k),
        apply: () => { runBuild.levels[k]++; }
    }));
    const common = upgrades.filter(u => (runBuild.upgrades[u.id] || 0) < (['spd','curse','adrenaline','vital_strike','fortress'].includes(u.id) ? 3 : 5)).map(commonOption);
    const fresh = player.weapons.length < 3 ? Object.keys(weapons).filter(k => !player.weapons.includes(k)).map(k => ({
        id: 'new_' + k,
        name: 'New: ' + weapons[k].name,
        description: weapons[k].description + '\n' + weaponSummary(getWeaponStats(k), k),
        apply: () => addWeapon(k)
    })) : [];
    const chosen = [owned, common, fresh].filter(a => a.length).map(pickRandom);
    const remaining = [...owned, ...common, ...fresh].filter(o => !chosen.some(c => c.id === o.id));
    while (chosen.length < 3 && remaining.length) {
        const o = pickRandom(remaining);
        chosen.push(o);
        remaining.splice(remaining.indexOf(o), 1);
    }
    if (chosen.length < 3) chosen.push({
        id: 'heal',
        name: 'REPAIR',
        description: 'HPを25回復',
        apply: () => player.hp = Math.min(getPlayerStats().maxHp, player.hp + 25)
    });
    return chosen;
}
function showSelection(kind, options) {
    selectionKind = kind;
    gameState = kind === 'start' ? GAME_STATES.WEAPONSELECT : kind === 'boss' ? GAME_STATES.REWARD : GAME_STATES.LEVELUP;
    upgradeOptions = options;
    selectedUpgradeIndex = 0;
    touchActive = false;
    touchDx = touchDy = 0;
    Object.keys(keys).forEach(k => keys[k] = false);
    const panel = document.getElementById('buildSelection');
    panel.hidden = false;
    document.getElementById('selectionTitle').textContent = kind === 'start' ? '開始武器を選択' : kind === 'boss' ? 'BOSS REWARD' : 'LEVEL UP';
    const cards = document.getElementById('selectionCards');
    cards.replaceChildren();
    options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'build-card';
        b.type = 'button';
        const cosmeticKey = o.id.replace(/^(grow_|new_|start_|evolve_)/, '');
        if (weaponPalettes[cosmeticKey]) b.style.borderColor = getWeaponLook(cosmeticKey, (runBuild.levels[cosmeticKey] || 1) + (o.id.startsWith('grow_') ? 1 : 0), o.id.startsWith('evolve_')).color;
        const name = document.createElement('strong'),
        desc = document.createElement('span');
        name.textContent = o.name;
        desc.textContent = o.description;
        b.append(name, desc);
        b.onfocus = () => {
            selectedUpgradeIndex = i;
        };
        b.onclick = () => chooseBuildOption(i);
        cards.append(b);
    });
    const reroll = document.getElementById('rerollBtn');
    reroll.hidden = kind === 'start' || (kind === 'boss' && options.some(o => o.id.startsWith('evolve_')));
    reroll.disabled = runBuild.rerolls <= 0;
    reroll.textContent = '再抽選（残り ' + runBuild.rerolls + '） [R]';
    reroll.onclick = rerollBuild;
    cards.firstElementChild?.focus();
}
function rerollBuild() {
    if (!selectionKind || runBuild.rerolls <= 0 || document.getElementById('rerollBtn').hidden) return;
    runBuild.rerolls--;
    showSelection(selectionKind, makeUpgradeOptions());
}
function chooseBuildOption(i) {
    if (!selectionKind || !upgradeOptions[i]) return;
    const kind = selectionKind;
    selectionKind = null;
    document.getElementById('buildSelection').hidden = true;
    const chosenOption = upgradeOptions[i];
    chosenOption.apply();
    if (kind === 'boss') runBuild.bossRewards--;
    Object.keys(keys).forEach(k => keys[k] = false);
    if (!chosenOption.id.startsWith('grow_') && !chosenOption.id.startsWith('evolve_')) soundManager.playLevelUp();
    gameState = GAME_STATES.PLAYING;
    updateUI();
    processBuildQueue();
}
function processBuildQueue() {
    if (gameState !== GAME_STATES.PLAYING) return;
    if (runBuild.bossRewards > 0) {
        const eligible = player.weapons.filter(k => runBuild.levels[k] === 5 && !runBuild.evolved[k]);
        showSelection('boss', eligible.length ? eligible.map(k => ({
            id: 'evolve_' + k,
            name: 'EVOLVE: ' + weapons[k].name,
            description: weaponGrowth[k].evolution,
            apply: () => {
                runBuild.evolved[k] = true;
                celebrateWeapon(k, true);
            }
        })) : makeUpgradeOptions());
    }
    else if (player.exp >= player.nextLevelExp) {
        player.exp -= player.nextLevelExp;
        player.level++;
        player.nextLevelExp = Math.floor(player.nextLevelExp * 1.15);
        showSelection('level', makeUpgradeOptions());
        updateUI();
    }
}
function beginWeaponSelection() {
    const pool = Object.keys(weapons),
    options = [];
    while (options.length < 3) {
        const k = pickRandom(pool);
        pool.splice(pool.indexOf(k), 1);
        options.push({
            id: 'start_' + k,
            name: weapons[k].name,
            description: weapons[k].description + '\n' + weaponSummary(getWeaponStats(k), k),
            apply: () => addWeapon(k)
        });
    }
    showSelection('start', options);
}
function chooseEnemyType() {
    const theme = waveThemes[(wave - 1) % 6];
    const entries = Object.keys(enemyTypes).filter(k => wave >= enemyUnlocks[k]).map(k => [k, (k === 'normal' ? 40 : k === 'tank' || k === 'runner' ? 15 : 5) * (theme.includes(k) ? 3 : 1)]);
    let n = Math.random() * entries.reduce((sum, [,w]) => sum + w, 0);
    for (const [k, weight] of entries) {
        n -= weight;
        if (n < 0) return k;
    }
    return 'normal';
}
function enemySpawnPosition() {
    const left = camera.x - 60,
    right = camera.x + viewWidth + 60,
    top = camera.y - 60,
    bottom = camera.y + viewHeight + 60;
    const candidates = [];
    for (let i = 0; i < 24; i++) {
        const edge = i % 4,
        x = edge === 0 ? left : edge === 1 ? right : left + Math.random() * (right - left),
        y = edge === 2 ? top : edge === 3 ? bottom : top + Math.random() * (bottom - top);
        if (x >= 0 && x <= world.width && y >= 0 && y <= world.height && Math.hypot(x-player.x,y-player.y) >= 240) candidates.push({
            x,
            y
        });
    }
    if (candidates.length) return pickRandom(candidates);
    return [{
        x:0,
        y:0
    },{
        x:world.width,
        y:0
    },{
        x:0,
        y:world.height
    },{
        x:world.width,
        y:world.height
    }].sort((a,b) => Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y))[0];
}
function hitArea(x, y, radius, damage, look = getWeaponLook('bomb')) {
    enemies.forEach(e => {
        if (!e.marked) {
            const d = Math.hypot(e.x-x,e.y-y);
            if (d < radius + e.size) e.takeDamage(damage * Math.max(.5, 1 - d/radius*.5));
        }
    });
    bossBullets.forEach(b => {
        if (!b.marked && Math.hypot(b.x-x,b.y-y) < radius+b.size) {
            b.hp -= damage;
            if (b.hp <= 0) b.marked = true;
        }
    });
    bombs.push({
        x,
        y,
        r:0,
        maxR:radius,
        look,
        alpha:1
    });
}
function fireRail(x,y,angle,w,mul=1) {
    const tx = x + Math.cos(angle)*w.range,
    ty = y + Math.sin(angle)*w.range;
    enemies.forEach(e => {
        if (!e.marked && pointLineDist(e.x,e.y,x,y,tx,ty) < e.size+w.beamWidth/2) { weaponImpact(e.x,e.y,getWeaponLook('laser')); e.takeDamage(w.attackPower*getDamageMultiplier()*mul); }
    });
    laserBeams.push({
        x1:x,
        y1:y,
        x2:tx,
        y2:ty,
        life:10,
        w,
        look: getWeaponLook('laser')
    });
}
function fireWeapon(key,w) {
    const target = findNearest(w.range),
    dmg = w.attackPower * getDamageMultiplier();
    if (['gun','laser','bomb','thunder'].includes(key) && !target) return false;
    if (key === 'gun' || key === 'scatter') {
        const angle = target ? Math.atan2(target.y-player.y,target.x-player.x) : player.lastMoveAngle;
        const count = key === 'scatter' ? w.count : w.shotCount;
        for (let i=0;i<count;i++) {
            const a=angle+(key==='scatter'?(Math.random()-.5)*w.spread:(i-(count-1)/2)*.15);
            const b=new Bullet(player.x,player.y,player.x+Math.cos(a)*100,player.y+Math.sin(a)*100,false,w.range);
            b._attackBase=w.attackPower;
            b.pierce=w.pierce;
            b.hitEnemies=new Set();
            b.color=w.color;
            b.look=getWeaponLook(key);
            bullets.push(b);
        }
        soundManager.playWeapon(key);
    }
    else if (key === 'whip') {
        const count=w.directions;
        for(let i=0;i<count;i++) whips.push(new WhipHitbox(player.x,player.y,player.lastMoveAngle+i*Math.PI*2/count));
        soundManager.playWeapon('whip');
    }
    else if (key === 'laser') {
        const x=player.x,
        y=player.y,
        a=Math.atan2(target.y-y,target.x-x);
        fireRail(x,y,a,w);
        if(w.evolved) runBuild.delayed.push({
            remaining:w.repeatDelay,
            apply:()=>fireRail(x,y,a,w,w.repeatDamage)
        });
        soundManager.playWeapon('laser');
    }
    else if (key === 'bomb') { bombs.push(new BombProjectile(player.x,player.y,target.x,target.y)); soundManager.playWeapon('bomb'); }
    else if (key === 'thunder') {
        const chain=[target];
        while(chain.length<w.chainCount) {
            const last=chain[chain.length-1];
            const next=enemies.filter(e=>!e.marked&&!chain.includes(e)&&Math.hypot(e.x-last.x,e.y-last.y)<200).sort((a,b)=>Math.hypot(a.x-last.x,a.y-last.y)-Math.hypot(b.x-last.x,b.y-last.y))[0];
            if(!next)break;
            chain.push(next);
        }
        thunders.push(new ThunderStrike(player.x,player.y,chain));
        chain.forEach(e=>{
            if (!e.marked) weaponImpact(e.x,e.y,getWeaponLook('thunder'));
            e.takeDamage(dmg);
            bossBullets.forEach(b=>{
                if(!b.marked&&Math.hypot(b.x-e.x,b.y-e.y)<60+b.size){
                    b.hp-=dmg;
                    if(b.hp<=0)b.marked=true;
                }
            });
        });
        if(w.evolved)target.takeDamage(dmg * w.extraDamage);
        soundManager.playWeapon('thunder');
    }
    else if (key === 'sanctuary') {
        enemies.forEach(e=>{
            if(!e.marked&&Math.hypot(e.x-player.x,e.y-player.y)<w.range+e.size){
                e.takeDamage(dmg);
                const a=Math.atan2(e.y-player.y,e.x-player.x);
                e.pushX=Math.cos(a)*6;
                e.pushY=Math.sin(a)*6;
            }
        });
        bossBullets.forEach(b=>{
            if(!b.marked&&Math.hypot(b.x-player.x,b.y-player.y)<w.range+b.size){
                b.hp-=dmg;
                if(b.hp<=0)b.marked=true;
            }
        });
        if(w.evolved)sanctuaryParticles.push({
            x:player.x+(Math.random()-.5)*w.range,
            y:player.y+(Math.random()-.5)*w.range,
            life:20
        });
    }
    else if(key==='mine') {
        if(mines.filter(m=>m.life>0).length>=w.mineLimit)return false;
        mines.push(new Landmine(player.x,player.y));
        soundManager.playWeapon('mine');
    }
    return true;
}
function updateWeapons() {
    if(player.weapons.includes('blade')) {
        const w=getWeaponStats('blade');
        if(rotatingBlades.length!==w.count)rotatingBlades=Array.from({
            length:w.count
        },(_,i)=>new RotatingBlade(i/w.count*Math.PI*2));
        rotatingBlades.forEach(b=>b.update(w));
    }
    for(const key of player.weapons) {
        if(key==='blade')continue;
        const w=getWeaponStats(key);
        if(key==='sanctuary'&&!w.evolved&&Math.floor((frameCount-dtFrames)/5)!==Math.floor(frameCount/5)) {
            sanctuaryParticles.push({x:player.x+(Math.random()-.5)*w.range*1.5,y:player.y+(Math.random()-.5)*w.range*1.5,life:20});
        }
        player.weaponCooldowns[key]=(player.weaponCooldowns[key]||0)-dtFrames;
        while(player.weaponCooldowns[key]<=0) {
            if(!fireWeapon(key,w)){
                player.weaponCooldowns[key]=0;
                break;
            }
            player.weaponCooldowns[key]+=w.cooldown;
        }
        if(w.cooldown<9&&!['sanctuary','blade'].includes(key)&&!runBuild.overclocked.has(key)){
            runBuild.overclocked.add(key);
            addFloatingText(player.x,player.y,'OVERCLOCK','#00ffff');
        }
    }
}
function updateBuildEffects() {
    for(let i=runBuild.delayed.length-1;i>=0;i--){
        const d=runBuild.delayed[i];
        d.remaining-=dtSeconds;
        if(d.remaining<=1e-8){
            runBuild.delayed.splice(i,1);
            d.apply();
        }
    }
    for(let i=runBuild.fields.length-1;i>=0;i--){
        const f=runBuild.fields[i];
        f.life-=dtSeconds;
        f.tick+=dtSeconds;
        while(f.tick>=.25-1e-8){
            f.tick-=.25;
            enemies.forEach(e=>{
                if(!e.marked&&Math.hypot(e.x-f.x,e.y-f.y)<f.radius+e.size)e.takeDamage(f.damage*.25);
            });
        }
        ctx.fillStyle=f.look?.color || '#d7f554';
        ctx.globalAlpha=.12;
        ctx.beginPath();
        ctx.arc(f.x-camera.x,f.y-camera.y,f.radius,0,Math.PI*2);
        ctx.fill();
        ctx.globalAlpha=1;
        if(f.life<=1e-8)runBuild.fields.splice(i,1);
    }
}
window.addEventListener('keydown', e => {
    if(!selectionKind)return;
    if(e.repeat){
        e.preventDefault();
        return;
    }
    if(e.key === 'Tab') {
        const controls = [...document.getElementById('buildSelection').querySelectorAll('button')].filter(b => !b.hidden && !b.disabled);
        const index = controls.indexOf(document.activeElement),
        next = (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
        e.preventDefault();
        controls[next]?.focus();
        return;
    }
    if(['ArrowLeft','ArrowUp','a','w','ArrowRight','ArrowDown','d','s'].includes(e.key)) {
        e.preventDefault();
        selectedUpgradeIndex=(selectedUpgradeIndex+(['ArrowLeft','ArrowUp','a','w'].includes(e.key)?-1:1)+upgradeOptions.length)%upgradeOptions.length;
        document.getElementById('selectionCards').children[selectedUpgradeIndex]?.focus();
    }
    else if(e.key.toLowerCase()==='r'){
        e.preventDefault();
        rerollBuild();
    }
    else if(/^[1-3]$/.test(e.key)){
        e.preventDefault();
        chooseBuildOption(Number(e.key)-1);
    }
});
