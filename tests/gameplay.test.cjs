// Run with: node --test tests/gameplay.test.cjs (no install required).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function game(width = 1280, height = 720) {
 const gradient = { addColorStop() {} };
 const ctx = new Proxy({ measureText: t => ({ width: String(t).length * 7 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o,k) => k in o ? o[k] : () => {} });
 const elements = new Map();
 function el() {
  const classes = new Set(), listeners = new Map(), attributes = new Map();
  return { style: {}, classList: {
   add(...names) { names.forEach(n => classes.add(n)); },
   remove(...names) { names.forEach(n => classes.delete(n)); },
   toggle(name, force) { const on = force ?? !classes.has(name); if(on)classes.add(name);else classes.delete(name);return on; },
   contains: name => classes.has(name)
  }, children: [], hidden: true, append(...a) { this.children.push(...a); }, replaceChildren() { this.children = []; }, get firstElementChild() { return this.children[0]; }, focus() {},
  addEventListener(type, callback) { if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback); },
  dispatchEvent(event) { for(const callback of listeners.get(event.type)||[])callback({...event,target:this}); },
  setAttribute(name,value) { attributes.set(name,String(value)); }, getAttribute: name => attributes.get(name) ?? null,
  getContext: () => ctx, getBoundingClientRect: () => ({left:0,top:0,width,height}), width, height };
 }
 const storage = new Map();
 const audio = new Proxy({}, { get: (o,k) => k in o ? o[k] : k === 'masterVolume' ? .3 : k === 'current16thNote' ? 0 : () => {} });
 const sandbox = { assert, console, document: { getElementById(id) { if(!elements.has(id))elements.set(id,el()); return elements.get(id); }, createElement: el, querySelectorAll: () => [], documentElement: {} }, window: {innerWidth:width,innerHeight:height,devicePixelRatio:1,addEventListener(){},scrollTo(){}}, navigator:{}, SoundManager: function() { return audio; }, localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}, requestAnimationFrame(){}, setTimeout(){}, clearTimeout(){}, Image:function(){}, URL, Blob, fetch:()=>Promise.reject(), Math:Object.create(Math) };
 const c=vm.createContext(sandbox);
 for(const f of ['data','entities','bosses','presentation','gameplay','Neon_Suvivor'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+f+'.js'),'utf8'),c,{filename:f+'.js'});
 return code=>vm.runInContext(code,c);
}
test('audio icon opens the styled panel and slider updates master volume',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../css/Neon_Suvivor.css'),'utf8');
 assert.match(css,/\.audio-container\.open\s+\.audio-panel\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/);
 game()(`
 setAudioPanel(false);
 assert.equal(audioToggle.getAttribute('aria-expanded'),'false');
 audioToggle.dispatchEvent({type:'click'});
 assert.ok(audioContainer.classList.contains('open'));
 assert.equal(audioPanel.getAttribute('aria-hidden'),'false');
 assert.equal(audioToggle.getAttribute('aria-expanded'),'true');
 soundManager.setMasterVolume = value => { soundManager.masterVolume = value; };
 for(const value of [0,65,100]) {
  volumeSlider.value=String(value);volumeSlider.dispatchEvent({type:'input'});
  assert.equal(soundManager.masterVolume,value/100);
  assert.equal(volumeValue.innerText,value+'%');
 }
 audioToggle.dispatchEvent({type:'click'});
 assert.ok(!audioContainer.classList.contains('open'));
 assert.equal(audioPanel.getAttribute('aria-hidden'),'true');
 assert.equal(audioToggle.getAttribute('aria-expanded'),'false');
 `);
});

test('all nine weapons receive shared upgrades, level growth and correct evolution stats',()=>{
 game()(
 `for(const k of Object.keys(weapons)) { addWeapon(k); const b=getWeaponStats(k); runBuild.levels[k]=5; const grown=getWeaponStats(k); assert.ok(Math.abs(grown.attackPower/b.attackPower-1.6)<1e-9,k); upgrades.find(u=>u.id==='atk').apply(); upgrades.find(u=>u.id==='cdr').apply(); upgrades.find(u=>u.id==='rng').apply(); const buff=getWeaponStats(k); assert.ok(buff.attackPower>grown.attackPower,k); assert.ok(buff.range>grown.range,k); if(k!=='blade')assert.ok(buff.cooldown<grown.cooldown,k); resetGame(false); }
 runBuild.levels.gun=5;assert.equal(getWeaponStats('gun').pierce,2);
 runBuild.levels.scatter=5;runBuild.evolved.scatter=true;assert.equal(getWeaponStats('scatter').count,7);assert.equal(getWeaponStats('scatter').pierce,1);
 runBuild.levels.blade=5;runBuild.evolved.blade=true;assert.equal(getWeaponStats('blade').count,4);
 runBuild.levels.thunder=5;assert.equal(getWeaponStats('thunder').chainCount,6);
 runBuild.levels.mine=5;assert.equal(getWeaponStats('mine').mineLimit,6);`);
});
test('HP, magnet and capped armor combine with persistent upgrades',()=>{game()(`localStorage.setItem(META_STORAGE_KEY,JSON.stringify({shards:40,upgrades:{startHp:2,armor:5,magnetRange:2,attackPower:2,cooldown:2}}));resetGame(false);player.hp=1;upgrades.find(u=>u.id==='hp').apply();assert.equal(player.hp,150);assert.equal(getPlayerStats().maxHp,150);upgrades.find(u=>u.id==='mag').apply();assert.ok(Math.abs(getPlayerStats().magnet-169)<1e-9);for(let i=0;i<5;i++)upgrades.find(u=>u.id==='fortress').apply();assert.equal(getPlayerStats().armor,.75);takePlayerDamage(20);assert.equal(player.hp,145);assert.equal(loadMetaData().shards,40);`);});
test('starting choices, rerolls, slots and capped candidate pools',()=>{game()(`beginWeaponSelection();assert.equal(gameState,'weaponselect');assert.equal(new Set(upgradeOptions.map(o=>o.id)).size,3);const t=timeSeconds;simulateFrame(1000);assert.equal(timeSeconds,t);chooseBuildOption(0);assert.equal(player.weapons.length,1);addWeapon('gun');addWeapon('scatter');addWeapon('mine');assert.equal(player.weapons.length,3);gameState='playing';showSelection('level',makeUpgradeOptions());rerollBuild();rerollBuild();rerollBuild();assert.equal(runBuild.rerolls,0);for(const k of player.weapons)runBuild.levels[k]=5;for(const u of upgrades)runBuild.upgrades[u.id]=5;const opts=makeUpgradeOptions();assert.deepEqual(opts.map(o=>o.id),['heal']);`);});
test('experience choices queue and each boss reward is consumed once',()=>{game()(`addWeapon('gun');gameState='playing';player.exp=400;processBuildQueue();assert.equal(player.level,2);chooseBuildOption(0);assert.equal(player.level,3);chooseBuildOption(0);assert.equal(player.level,4);chooseBuildOption(0);assert.equal(gameState,'playing');runBuild.levels.gun=5;const boss=new BossBase(5);boss.takeDamage(1e9);boss.takeDamage(1e9);assert.equal(runBuild.bossRewards,1);assert.equal(score,1000);assert.equal(gems.length,20);processBuildQueue();assert.equal(gameState,'reward');chooseBuildOption(0);assert.equal(runBuild.evolved.gun,true);assert.equal(runBuild.bossRewards,0);chooseBuildOption(0);assert.equal(runBuild.bossRewards,0);`);});
test('projectiles stop on first hit and penetration never hits the same enemy twice',()=>{game()(`addWeapon('gun');player.weaponCooldowns.gun=1000;gameState='playing';const mk=()=>({x:player.x+10,y:player.y,size:12,hp:100,marked:false,takeDamage(n){this.hp-=n;},update(){},draw(){}});let a=mk(),b=mk();enemies=[a,b];let bullet=new Bullet(player.x,player.y,player.x+100,player.y,false,320);bullet._attackBase=14;bullets=[bullet];simulateFrame(1000);assert.equal(a.hp,86);assert.equal(b.hp,100);assert.equal(bullets.length,0);a=mk();b=mk();enemies=[a,b];bullet=new Bullet(player.x,player.y,player.x+100,player.y,false,320);bullet._attackBase=14;bullet.pierce=2;bullets=[bullet];simulateFrame(1017);simulateFrame(1034);assert.equal(a.hp,86);assert.equal(b.hp,86);`);});
test('all evolution attacks execute, delayed effects pause and mines obey their limit',()=>{game()(`gameState='playing';const target={x:player.x+40,y:player.y,size:12,marked:false,hp:100000,takeDamage(n){this.hp-=n;},pushX:0,pushY:0,draw(){}};enemies=[target];for(const k of Object.keys(weapons)){runBuild.levels[k]=5;runBuild.evolved[k]=true;fireWeapon(k,getWeaponStats(k));}assert.equal(bullets.length,10);assert.equal(whips.length,4);assert.equal(thunders.length,1);assert.equal(runBuild.delayed.length,1);assert.equal(laserBeams.length,1);for(const b of bombs.slice())if(b instanceof BombProjectile)b.explode();assert.equal(runBuild.delayed.length,2);const delay=runBuild.delayed[0].remaining;gameState='levelup';simulateFrame(1000);assert.equal(runBuild.delayed[0].remaining,delay);gameState='playing';for(let i=0;i<10;i++)fireWeapon('mine',getWeaponStats('mine'));assert.equal(mines.length,6);mines[0].explode();mines[0].explode();assert.equal(runBuild.fields.length,1);const before=target.hp;for(let i=0;i<120;i++){dtSeconds=1/60;updateBuildEffects();}assert.ok(target.hp<before);assert.equal(runBuild.delayed.length,0);assert.equal(runBuild.fields.length,0);`);});
test('30/60/120Hz yield matching movement, projectile range and attack counts',()=>{
 const results=[30,60,120].map(hz=>game()(`resetGame(false);addWeapon('scatter');gameState='playing';keys.d=true;animate(0);for(let i=1;i<=`+hz+`*2;i++)animate(i*1000/`+hz+`);JSON.stringify({x:player.x,time:timeSeconds,bullets:bullets.length,cd:player.weaponCooldowns.scatter})`));
 const values=results.map(JSON.parse);for(const v of values){assert.ok(Math.abs(v.x-values[0].x)<1e-6);assert.ok(Math.abs(v.time-values[0].time)<1e-6);assert.equal(v.bullets,values[0].bullets);assert.ok(Math.abs(v.cd-values[0].cd)<1e-6);}
});
test('unlocks and weighted themes are reachable; spawns stay distant at world corners',()=>{for(const [width,height] of [[1280,720],[390,844],[844,390]])game(width,height)(`wave=6;const counts={};for(let i=0;i<12000;i++){const k=chooseEnemyType();counts[k]=(counts[k]||0)+1;}for(const k of Object.keys(enemyTypes))assert.ok(counts[k]>0,k);wave=1;for(let i=0;i<200;i++)assert.ok(enemyUnlocks[chooseEnemyType()]<=1);for(const [x,y] of [[0,0],[3000,0],[0,3000],[3000,3000],[1500,1500]]){player.x=x;player.y=y;camera.x=x-viewWidth/2;camera.y=y-viewHeight/2;for(let i=0;i<50;i++){const p=enemySpawnPosition();assert.ok(Math.hypot(p.x-x,p.y-y)>=240);assert.ok(p.x>=0&&p.x<=3000&&p.y>=0&&p.y<=3000);}}`);});

test('actual attacks of every weapon use the same upgraded damage as the stat cards', () => {
 game()(`function measure(key, buff) {
 resetGame(false); addWeapon(key); gameState='playing';
 if(buff)upgrades.find(u=>u.id==='atk').apply();
 const target={x:player.x+40,y:player.y,size:12,marked:false,hp:100000,pushX:0,pushY:0,takeDamage(n){this.hp-=n;}};
 enemies=[target];const w=getWeaponStats(key);
 if(key==='blade'){const b=new RotatingBlade(0);dtFrames=0;dtSeconds=1/6+.001;b.update(w);dtFrames=1;dtSeconds=1/60;}
 else {fireWeapon(key,w);if(key==='gun'||key==='scatter'){player.weaponCooldowns[key]=10000;target.update=()=>{};target.draw=()=>{};for(let i=0;i<6;i++)simulateFrame(1000+i*1000/60);}
 if(key==='whip')whips.forEach(w=>w.update());
 if(key==='bomb')bombs[0].explode();
 if(key==='mine')mines[0].explode();}
 return 100000-target.hp;
 }
 for(const k of Object.keys(weapons)){const b=measure(k,false),up=measure(k,true);assert.ok(b>0,k);assert.ok(Math.abs(up/b-1.2)<1e-8,k);}`);
});
test('Void Field evolution slows normal enemies without changing bosses or permanent speed',()=>{
 game()(`addWeapon('sanctuary');runBuild.levels.sanctuary=5;runBuild.evolved.sanctuary=true;
 const e=new Enemy();e.type='normal';e.x=player.x+100;e.y=player.y;e.pushX=e.pushY=0;const speed=e.speed,x=e.x;e.update();assert.ok(Math.abs(x-e.x-speed*.7)<1e-8);assert.equal(e.speed,speed);
 const b=new BossBase(5);assert.ok(b.isBoss);`);
});

test('console reset restarts weapon selection and clears every run-only effect',()=>{game()(`gameState='playing';runBuild.rerolls=0;runBuild.delayed.push({remaining:1});runBuild.fields.push({life:2});runBuild.evolved.gun=true;resetGame();assert.equal(gameState,'weaponselect');assert.equal(runBuild.rerolls,2);assert.equal(runBuild.delayed.length,0);assert.equal(runBuild.fields.length,0);assert.equal(Object.keys(runBuild.evolved).length,0);assert.equal(upgradeOptions.length,3);`);});

test('weapon presentation changes only on evolution and remains separate from combat stats',()=>{
 game()(`for(const k of Object.keys(weapons)) {const base=getWeaponStats(k),look=getWeaponLook(k,1,false);for(let level=1;level<=5;level++)assert.deepEqual(getWeaponLook(k,level,false),look,k);const evolved=getWeaponLook(k,5,true);assert.notEqual(evolved.color,look.color,k);assert.equal(evolved.tier,3);assert.deepEqual(getWeaponStats(k),base);}
 weaponImpact(player.x,player.y,getWeaponLook('gun'));assert.equal(weaponEffects.length,0);
 for(let i=0;i<200;i++)weaponImpact(player.x,player.y,getWeaponLook('gun',5,true));assert.equal(weaponEffects.length,96);
 gameState='playing';resetGame(false);assert.equal(weaponEffects.length,0);`);
});

test('ordinary weapon upgrades stay quiet while evolution celebrates',()=>{
 game()(`let growthSounds=0;soundManager.playGrowth=()=>growthSounds++;
 for(const k of Object.keys(weapons)) {
  resetGame(false);addWeapon(k);
  for(let level=2;level<=5;level++) {
   const option=makeUpgradeOptions().find(o=>o.id==='grow_'+k);
   assert.ok(option,k);assert.ok(!option.description.includes('色と攻撃演出も変化'));
   option.apply();assert.equal(runBuild.levels[k],level);assert.equal(weaponEffects.length,0);
   celebrateWeapon(k);assert.equal(weaponEffects.length,0);assert.equal(growthSounds,0);
  }
 }
 runBuild.bossRewards=1;gameState='playing';processBuildQueue();
 const evolution=upgradeOptions.findIndex(o=>o.id.startsWith('evolve_'));assert.ok(evolution>=0);
 chooseBuildOption(evolution);assert.equal(weaponEffects.length,1);assert.equal(growthSounds,1);`);
});

test('normal weapons use classic drawing while Nano Whip keeps its latest effects',()=>{
 game()(`for(const k of ['bomb','blade','thunder','mine']) {
  const obj=k==='bomb'?new BombProjectile(0,0,50,0):k==='blade'?new RotatingBlade(0):k==='thunder'?new ThunderStrike(0,0,[{x:50,y:0}]):new Landmine(0,0);
  let classic=0;obj.drawClassic=()=>classic++;
  for(let level=1;level<=5;level++){runBuild.levels[k]=level;obj.draw(getWeaponStats(k));}
  assert.equal(classic,5,k);runBuild.evolved[k]=true;if(obj.look)obj.look=getWeaponLook(k);
  obj.draw(getWeaponStats(k));assert.equal(classic,5,k);
 }
 let latest=0;const original=drawWeaponBullet;drawWeaponBullet=()=>latest++;
 for(const k of ['gun','scatter']) {
  const b=new Bullet(0,0,100,0);b.look=getWeaponLook(k);b.draw();assert.equal(latest,0);
 }
 const evolved=new Bullet(0,0,100,0);evolved.look=getWeaponLook('gun',5,true);evolved.draw();assert.equal(latest,1);drawWeaponBullet=original;
 weaponEffects.length=0;const whip=new WhipHitbox(0,0,0);whip.draw();
 assert.equal(whip.look.color,weaponPalettes.whip[0]);weaponImpact(0,0,whip.look);assert.equal(weaponEffects.length,1);
 weaponImpact(0,0,getWeaponLook('gun'));assert.equal(weaponEffects.length,1);`);
});

test('weapon sound layers stay identical at every level and change on evolution',()=>{
 const c=vm.createContext({assert,console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/audio.js'),'utf8'),c);
 vm.runInContext(`const runBuild={levels:{},evolved:{}};
 const audio=new SoundManager();audio.soundTime=()=>1;
 let voices=[];audio.sfxVoice=(...args)=>voices.push(args);
 for(const name of ['Shoot','Shotgun','Blade','Railgun','Whip','Thunder','Explosion'])audio['playClassic'+name]=()=>voices.push(['classic',name]);
 function capture(key,level,evolved,phase) {
  runBuild.levels[key]=level;runBuild.evolved[key]=evolved;
  voices=[];audio.sfxLast.clear();audio.playWeapon(key,{},phase);return voices;
 }
 for(const key of ['gun','scatter','whip','blade','sanctuary','laser','bomb','thunder','mine']) {
  for(const phase of ['fire','impact']) {
   const base=capture(key,1,false,phase);
   const classic={gun:'Shoot',scatter:'Shotgun',whip:'Whip',blade:'Blade',laser:'Railgun',thunder:'Thunder'}[key];
   assert.deepEqual(base,classic?[['classic',classic]]:(key==='bomb'||key==='mine')&&phase==='impact'?[['classic','Explosion']]:[],key);
   for(let level=2;level<=5;level++)assert.deepEqual(capture(key,level,false,phase),base,key);
   assert.notDeepEqual(capture(key,5,true,phase),base,key);
  }
  voices=[];audio.playGrowth(key);assert.equal(voices.length,0);
  audio.playGrowth(key,true);assert.ok(voices.length>0);
 }`,c);
});
