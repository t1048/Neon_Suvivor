// Cosmetic progression only: sizes below never change collision or damage.
const weaponPalettes = {
    gun: ['#ffff55', '#72f8ff', '#46adff', '#c09bff'],
    scatter: ['#ffaa33', '#ffdb69', '#ff745c', '#ff57c8'],
    whip: ['#ff50da', '#c77bff', '#906bff', '#54eeff'],
    blade: ['#36ffad', '#55edff', '#749dff', '#e4a1ff'],
    sanctuary: ['#35dce8', '#4baaff', '#9770ff', '#dd8cff'],
    laser: ['#ff5555', '#ff9466', '#ff65b9', '#d29bff'],
    bomb: ['#ff9933', '#ffd35c', '#ff6377', '#ff73e6'],
    thunder: ['#ffff88', '#a2f5ff', '#71a8ff', '#d795ff'],
    mine: ['#d7f554', '#7bffc4', '#42d8ff', '#bf9dff']
};
function getWeaponLook(key, level = runBuild.levels[key] || 1, evolved = !!runBuild.evolved[key]) {
    // Weapon levels affect combat stats; only evolution changes presentation.
    const tier = evolved ? 3 : 0;
    const color = evolved || key === 'whip' ? weaponPalettes[key][tier] : weapons[key].color;
    return { key, tier, color, accent: evolved ? '#ffffff' : key === 'whip' ? weaponPalettes.whip[1] : color,
        glow: 8 + tier * 4, width: 2 + tier, trail: 10 + tier * 7, evolved };
}
function strokePath(points, color, width, alpha = 1) {
    if (!points.length) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
}
function drawWeaponBullet(b) {
    const v = b.look, x = b.x - camera.x, y = b.y - camera.y;
    const angle = Math.atan2(b.vy, b.vx), dx = Math.cos(angle), dy = Math.sin(angle);
    ctx.save(); ctx.globalAlpha = b.alpha; ctx.shadowColor = v.color; ctx.shadowBlur = v.glow;
    strokePath([{x:x-dx*v.trail,y:y-dy*v.trail},{x,y}], v.color, v.width + 2, b.alpha * .65);
    ctx.globalAlpha = b.alpha; ctx.translate(x,y); ctx.rotate(angle); ctx.fillStyle = v.color;
    ctx.beginPath(); ctx.moveTo(8 + v.tier * 2,0); ctx.lineTo(-5,-3-v.tier); ctx.lineTo(-2,0); ctx.lineTo(-5,3+v.tier); ctx.closePath(); ctx.fill();
    if (v.tier >= 1) { ctx.fillStyle = v.accent; ctx.fillRect(-1,-1,7 + v.tier,2); }
    if (v.evolved) { ctx.strokeStyle = v.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0,0,11,7,0,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
}
function weaponImpact(x, y, look, radius = 16) {
    if (!look || (!look.evolved && look.key !== 'whip') || weaponEffects.length >= 96) return;
    weaponEffects.push({x,y,look,radius,life:12,maxLife:12,type:'hit'});
}
function celebrateWeapon(key, evolved = false) {
    if (!evolved) return;
    const look = getWeaponLook(key);
    if (weaponEffects.length >= 96) weaponEffects.splice(0,1);
    weaponEffects.push({ x:player.x, y:player.y, look, radius:160, life:45, maxLife:45, type:'growth' });
    addFloatingText(player.x,player.y-30,'EVOLVED '+weapons[key].name,look.color);
    soundManager.playGrowth(key, evolved);
}
const weaponEffects = [];
function drawWeaponEffects(advance = true) {
    for (let i=weaponEffects.length-1;i>=0;i--) {
        const e=weaponEffects[i], progress=1-e.life/e.maxLife, x=e.x-camera.x,y=e.y-camera.y;
        ctx.save(); ctx.strokeStyle=e.look.color; ctx.shadowColor=e.look.color; ctx.shadowBlur=e.look.glow;
        ctx.globalAlpha=(1-progress)*.8; ctx.lineWidth=e.type==='growth'?3:1.5;
        ctx.beginPath(); ctx.arc(x,y,Math.max(1,e.radius*progress),0,Math.PI*2);ctx.stroke();
        const rays=e.type==='growth'?12:4+e.look.tier*2;
        for(let n=0;n<rays;n++){const a=n/rays*Math.PI*2+progress, r=e.radius*progress;
            strokePath([{x:x+Math.cos(a)*r*.65,y:y+Math.sin(a)*r*.65},{x:x+Math.cos(a)*(r+6),y:y+Math.sin(a)*(r+6)}],e.look.accent,1,1-progress);
        }
        ctx.restore(); if(advance)e.life-=dtFrames; if(e.life<=0)weaponEffects.splice(i,1);
    }
}
function drawWeaponExplosion(b) {
    const v=b.look, x=b.x-camera.x,y=b.y-camera.y;
    if(!v?.evolved){ctx.fillStyle='rgba(255,100,0,'+b.alpha+')';ctx.beginPath();ctx.arc(x,y,b.r,0,6.28);ctx.fill();return;}
    ctx.save();ctx.globalAlpha=Math.max(0,b.alpha);ctx.shadowColor=v.color;ctx.shadowBlur=v.glow;
    ctx.fillStyle=v.color;ctx.globalAlpha*=.12;ctx.beginPath();ctx.arc(x,y,b.r,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=Math.max(0,b.alpha);ctx.strokeStyle=v.color;ctx.lineWidth=2+v.tier;ctx.beginPath();ctx.arc(x,y,b.r,0,Math.PI*2);ctx.stroke();
    if(v.tier>=1){ctx.strokeStyle=v.accent;ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,b.r*.7,0,Math.PI*2);ctx.stroke();}
    if(v.tier>=2){for(let n=0;n<8+v.tier*4;n++){const a=n/(8+v.tier*4)*Math.PI*2;strokePath([{x:x+Math.cos(a)*b.r*.9,y:y+Math.sin(a)*b.r*.9},{x:x+Math.cos(a)*(b.r+10),y:y+Math.sin(a)*(b.r+10)}],v.color,2,b.alpha);}}
    ctx.restore();
}
function drawWeaponRail(l) {
    const sx = l.x1 - camera.x, sy = l.y1 - camera.y;
    const ex = l.x2 - camera.x, ey = l.y2 - camera.y;
    const a = Math.atan2(l.y2 - l.y1, l.x2 - l.x1);
    if (!l.look?.evolved) {
        ctx.strokeStyle = '#0ff'; ctx.lineWidth = l.life / 2; ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke(); ctx.shadowBlur = 0;
        return;
    }
    const v = l.look || getWeaponLook('laser');
    const end = { x: ex, y: ey };
    ctx.save(); ctx.shadowColor = v.color; ctx.shadowBlur = v.glow;
    strokePath([{ x: sx, y: sy }, end], v.color, l.w.beamWidth * (1 + v.tier * .4), Math.max(0, l.life / 10));
    strokePath([{ x: sx, y: sy }, end], v.accent, 1 + v.tier, Math.max(0, l.life / 10));
    if (v.tier >= 1) {
        const offset = 5 + v.tier * 2, nx = -Math.sin(a) * offset, ny = Math.cos(a) * offset;
        for (const sign of [-1, 1]) strokePath([{ x: sx + nx * sign, y: sy + ny * sign }, { x: end.x + nx * sign, y: end.y + ny * sign }], v.color, 1, l.life / 20);
    }
    if (v.evolved) { ctx.strokeStyle = v.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 15 + (10 - l.life) * 2, a - Math.PI / 2, a + Math.PI / 2); ctx.stroke(); }
    ctx.restore();
}
function drawVoidField() {
    const w=getWeaponStats('sanctuary'),v=getWeaponLook('sanctuary'),x=player.x-camera.x,y=player.y-camera.y,r=w.range;
    if (!v.evolved) {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.stroke();
        return;
    }
    ctx.save(); const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'transparent');gradient.addColorStop(1,v.color);
    ctx.globalAlpha=.05+v.tier*.025;ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.shadowColor=v.color;ctx.shadowBlur=v.glow;ctx.strokeStyle=v.color;ctx.lineWidth=1+v.tier*.5;ctx.globalAlpha=.45;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    for(let ring=0;ring<v.tier;ring++){ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(x,y,r*(.78-ring*.15),frameCount*.012*(ring%2?-1:1),frameCount*.012*(ring%2?-1:1)+Math.PI*1.5);ctx.stroke();}
    const marks=4+v.tier*4;ctx.globalAlpha=.65;
    for(let i=0;i<marks;i++){const a=i/marks*Math.PI*2+frameCount*.007, px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;ctx.save();ctx.translate(px,py);ctx.rotate(a+Math.PI/4);ctx.strokeStyle=v.tier===3?v.accent:v.color;ctx.strokeRect(-3,-3,6,6);ctx.restore();}
    ctx.restore();
}
