// --- Entities.js ---
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x + (Math.random() - 0.5) * 20; this.y = y;
        this.text = text; this.color = color;
        this.life = 40; this.vy = -1.5;
    }
    update() { this.y += this.vy; this.life = Math.max(0, this.life - dtFrames); }
    draw() {
        if (this.life <= 0) return;
        const sx = this.x - camera.x, sy = this.y - camera.y;
        ctx.globalAlpha = this.life / 40; ctx.fillStyle = this.color;
        ctx.font = "bold 20px Arial"; ctx.fillText(this.text, sx, sy);
        ctx.globalAlpha = 1.0;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        const a = Math.random() * 6.28; const s = Math.random() * 3 + 1;
        this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
        this.life = 30; this.size = Math.random() * 3 + 1;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life = Math.max(0, this.life - dtFrames); this.vx *= 0.9; this.vy *= 0.9; }
    draw() {
        ctx.globalAlpha = this.life / 30; ctx.fillStyle = this.color;
        ctx.fillRect(this.x - camera.x, this.y - camera.y, this.size, this.size); ctx.globalAlpha = 1;
    }
}

class Bullet {
    constructor(x, y, tx, ty, isEnemy = false, maxDist = 9999) {
        this.x = x; this.y = y; this.size = isEnemy ? 6 : 5;
        this.isEnemy = isEnemy;
        this.startPos = { x, y };
        this.maxDist = maxDist;
        const a = Math.atan2(ty - y, tx - x);
        this.speed = (isEnemy ? 6 : 10);
        this.vx = Math.cos(a) * this.speed;
        this.vy = Math.sin(a) * this.speed;
        // Life determines range if maxDist provided
        this.life = isEnemy ? 120 : (maxDist / this.speed);
        this.marked = false; this.hitEnemies = new Set(); this.pierce = 0;
        if (isEnemy) { this.hp = 1; this.maxHp = 1; }
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life = Math.max(0, this.life - dtFrames);

        // For scatter shot: fade out near end
        this.alpha = 1;
        if (!this.isEnemy && this.life < 10) {
            this.alpha = this.life / 10;
        }

        if (this.life <= 0) {
            this.marked = true;
            // Visual effect for disappearing bullet (range limit)
            if (!this.isEnemy) {
                particles.push(new Particle(this.x, this.y, '#ffaa00'));
            }
        }
    }
    draw() {
        if (this.marked) return;
        if (this.look?.evolved && !this.isEnemy) { drawWeaponBullet(this); return; }

        ctx.fillStyle = this.isEnemy ? '#ff0000' : '#ffff00';
        if (!this.isEnemy) ctx.fillStyle = this.color || '#ffff00'; // Scatter color

        ctx.globalAlpha = this.alpha || 1;
        ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
        const hpRatio = (this.isEnemy && this.maxHp > 1) ? Math.max(0, this.hp) / this.maxHp : 1;
        const drawSize = Math.max(0, (this.isEnemy && this.maxHp > 1) ? this.size * hpRatio : this.size);
        if (drawSize <= 0) {
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            return;
        }
        ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, drawSize, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

class BombProjectile {
    constructor(x, y, tx, ty) {
        this.x = x; this.y = y; this.tx = tx; this.ty = ty;
        this.height = 0; this.progress = 0; this.look = getWeaponLook('bomb');
        this.marked = false;
        const dist = Math.hypot(tx - x, ty - y);
        this.duration = Math.max(1, dist / 8); // Speed
        this.vx = (tx - x) / this.duration;
        this.vy = (ty - y) / this.duration;
    }
    update() {
        this.progress += dtFrames;
        this.x += this.vx * dtFrames;
        this.y += this.vy * dtFrames;
        const p = this.progress / this.duration;
        this.height = Math.sin(p * Math.PI) * 50;

        if (this.progress >= this.duration) {
            this.marked = true;
            this.explode();
        }
    }
    explode() {
        this.x = this.tx; this.y = this.ty;
        createParticles(this.x, this.y, this.look.evolved ? this.look.color : '#ff8800', this.look.evolved ? 20 : 30);
        soundManager.playWeapon('bomb', { evolved: this.look.evolved }, 'impact');
        const w = getWeaponStats('bomb');
        const r = w.explosionRadius;
        const dmg = w.attackPower * getDamageMultiplier();

        enemies.forEach(e => {
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist < r + e.size) {
                const damageMult = 1 - (dist / r) * 0.5;
                e.takeDamage(dmg * damageMult);
            }
        });
        for (let i = bossBullets.length - 1; i >= 0; i--) {
            const eb = bossBullets[i];
            if (eb.marked) continue;
            const dist = Math.hypot(eb.x - this.x, eb.y - this.y);
            if (dist < r + eb.size) {
                eb.hp -= dmg;
                if (eb.hp <= 0) {
                    eb.marked = true;
                    createParticles(eb.x, eb.y, '#ff4444', 5);
                }
            }
        }
        bombs.push({ x: this.x, y: this.y, r: 0, maxR: r, alpha: 1, look: this.look });
        if (w.evolved) { const x = this.x, y = this.y; runBuild.delayed.push({ remaining: w.repeatDelay, apply: () => hitArea(x, y, r, dmg * w.repeatDamage, this.look) }); }
    }
    drawClassic() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y - this.height;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 6.28); ctx.fill();
    }
    draw() {
        if (!this.look.evolved) return this.drawClassic();
        const v=this.look, x=this.x-camera.x, y=this.y-camera.y-this.height;
        ctx.save();ctx.translate(x,y);ctx.shadowColor=v.color;ctx.shadowBlur=v.glow;
        const direction=Math.atan2(this.vy,this.vx);
        strokePath([{x:-Math.cos(direction)*v.trail,y:-Math.sin(direction)*v.trail},{x:0,y:0}],v.color,v.width,.65);
        ctx.rotate(this.progress*.16);ctx.fillStyle=v.color;ctx.beginPath();
        const sides=4+v.tier;for(let i=0;i<sides;i++){const angle=i/sides*Math.PI*2;i?ctx.lineTo(Math.cos(angle)*7,Math.sin(angle)*7):ctx.moveTo(7,0);}ctx.closePath();ctx.fill();
        if(v.tier>=1){ctx.strokeStyle=v.accent;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,10+v.tier,0,Math.PI*2);ctx.stroke();}
        if(v.evolved){ctx.rotate(-this.progress*.3);ctx.strokeRect(-11,-11,22,22);}
        ctx.restore();
    }
}

class RotatingBlade {
    constructor(angleOffset) {
        this.angle = angleOffset;
            this.hitAccumulator = 0; // Track time for periodic hit detection
    }
    update(weaponData, speedBoost = 1) {
            this.angle += weaponData.rotSpeed * speedBoost * dtFrames;
        const range = weaponData.range;

        // Blade Geometry (Sweeping Beam)
        const startDist = 10;
        const tipX = player.x + Math.cos(this.angle) * range;
        const tipY = player.y + Math.sin(this.angle) * range;
        const startX = player.x + Math.cos(this.angle) * startDist;
        const startY = player.y + Math.sin(this.angle) * startDist;

        const thickness = 25 * (range / 100);

            // Hit tick every 10 frames equivalent (0.167 seconds)
            this.hitAccumulator += dtSeconds;
            if (this.hitAccumulator >= 0.167) {
                this.hitAccumulator -= 0.167;
            enemies.forEach(e => {
                // Check distance to the blade line segment
                const dist = pointLineDist(e.x, e.y, startX, startY, tipX, tipY);

                // Check if enemy is within the segment length (projection)
                const dx = tipX - startX;
                const dy = tipY - startY;
                const lenSq = dx * dx + dy * dy;
                const t = ((e.x - startX) * dx + (e.y - startY) * dy) / lenSq;

                // t >= 0 && t <= 1 ensures hit is between start and end
                if (t >= 0 && t <= 1 && dist < thickness + e.size) {
                    e.takeDamage(weaponData.attackPower * getDamageMultiplier());
                    createParticles(e.x, e.y, getWeaponLook('blade').color, 3);
                    weaponImpact(e.x,e.y,getWeaponLook('blade'));
                    const pushA = Math.atan2(e.y - player.y, e.x - player.x);
                    e.pushX += Math.cos(pushA) * 5;
                    e.pushY += Math.sin(pushA) * 5;
                    soundManager.playBlade();
                }
            });
            const bladeDmg = weaponData.attackPower * getDamageMultiplier();
            for (let i = bossBullets.length - 1; i >= 0; i--) {
                const eb = bossBullets[i];
                if (eb.marked) continue;
                const dist = pointLineDist(eb.x, eb.y, startX, startY, tipX, tipY);
                const dx = tipX - startX;
                const dy = tipY - startY;
                const lenSq = dx * dx + dy * dy;
                const t = ((eb.x - startX) * dx + (eb.y - startY) * dy) / lenSq;
                if (t >= 0 && t <= 1 && dist < thickness + eb.size) {
                    eb.hp -= bladeDmg;
                    if (eb.hp <= 0) {
                        eb.marked = true;
                        createParticles(eb.x, eb.y, '#ff4444', 5);
                    }
                }
            }
        }
    }

    drawClassic(weaponData) {
        const sx = player.x - camera.x;
        const sy = player.y - camera.y;
        const range = weaponData.range;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);

        ctx.shadowBlur = 15; ctx.shadowColor = weaponData.color;
        ctx.fillStyle = weaponData.color;

        // Draw blade
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(range, 0);
        ctx.lineTo(10, 5);
        ctx.lineTo(0, 0);
        ctx.fill();

        // Glow trail / Aura
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(10, -15);
        ctx.lineTo(range * 1.05, 0);
        ctx.lineTo(10, 15);
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }
    draw(weaponData) {
        if (!runBuild.evolved.blade) return this.drawClassic(weaponData);
        const v=getWeaponLook('blade'), range=weaponData.range;
        ctx.save();ctx.translate(player.x-camera.x,player.y-camera.y);ctx.rotate(this.angle);
        ctx.shadowColor=v.color;ctx.shadowBlur=v.glow;
        for(let echo=v.tier;echo>=0;echo--){ctx.save();ctx.rotate(-echo*.10);ctx.globalAlpha=echo?.12:.9;ctx.fillStyle=v.color;
            const width=5+v.tier*2;ctx.beginPath();ctx.moveTo(10,-width);ctx.lineTo(range*.72,-width*.7);ctx.lineTo(range,0);ctx.lineTo(range*.72,width*.7);ctx.lineTo(10,width);ctx.closePath();ctx.fill();ctx.restore();}
        if(v.tier>=1)strokePath([{x:15,y:0},{x:range-4,y:0}],v.accent,1+v.tier);
        if(v.tier>=2){ctx.strokeStyle=v.color;ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(0,0,range*.85,-.5,0);ctx.stroke();}
        if(v.evolved){ctx.fillStyle=v.accent;ctx.beginPath();ctx.moveTo(range*.55,-7);ctx.lineTo(range*.75,0);ctx.lineTo(range*.55,7);ctx.lineTo(range*.45,0);ctx.closePath();ctx.fill();}
        ctx.restore();
    }
}

class WhipHitbox {
    constructor(x, y, angle) {
        this.x = x; this.y = y; this.angle = angle;
        this.life = 10; this.maxLife = 10;
        this.range = getWeaponStats('whip').range; this.hitDone = false;
        this.width = Math.PI / 4; this.look = getWeaponLook('whip');
    }
    update() {
        this.life = Math.max(0, this.life - dtFrames);
        if (!this.hitDone) {
            this.hitDone = true;
            const dmg = getWeaponStats('whip').attackPower * getDamageMultiplier();
            enemies.forEach(e => {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dist = Math.hypot(dx, dy);
                const angleToEnemy = Math.atan2(dy, dx);

                let angleDiff = angleToEnemy - this.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                if (dist < this.range && Math.abs(angleDiff) < this.width / 2) {
                    if (!e.marked) weaponImpact(e.x,e.y,this.look);
                    e.takeDamage(dmg);
                    const pushAngle = Math.atan2(dy, dx);
                    e.pushX += Math.cos(pushAngle) * 5;
                    e.pushY += Math.sin(pushAngle) * 5;
                }
            });
            for (let i = bossBullets.length - 1; i >= 0; i--) {
                const eb = bossBullets[i];
                if (eb.marked) continue;
                const dx = eb.x - this.x;
                const dy = eb.y - this.y;
                const dist = Math.hypot(dx, dy);
                const angleToBullet = Math.atan2(dy, dx);
                let angleDiff = angleToBullet - this.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                if (dist < this.range && Math.abs(angleDiff) < this.width / 2) {
                    eb.hp -= dmg;
                    if (eb.hp <= 0) {
                        eb.marked = true;
                        createParticles(eb.x, eb.y, '#ff4444', 5);
                    }
                }
            }
        }
    }
    draw() {
        const v=this.look, fade=this.life/this.maxLife;
        ctx.save();ctx.translate(this.x-camera.x,this.y-camera.y);ctx.rotate(this.angle);
        ctx.shadowColor=v.color;ctx.shadowBlur=v.glow;ctx.globalAlpha=fade*.12;ctx.fillStyle=v.color;
        ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,this.range,-this.width/2,this.width/2);ctx.closePath();ctx.fill();
        for(let i=0;i<=v.tier;i++){const r=this.range*(1-i*.07);ctx.strokeStyle=i===0?v.accent:v.color;ctx.lineWidth=i===0?2:1.5;ctx.globalAlpha=fade*(1-i*.2);
            ctx.beginPath();ctx.arc(0,0,r,-this.width/2,this.width/2);ctx.stroke();}
        const a=-this.width/2+(1-fade)*this.width;
        strokePath([{x:8*Math.cos(a),y:8*Math.sin(a)},{x:this.range*Math.cos(a),y:this.range*Math.sin(a)}],v.color,3+v.tier,fade);
        ctx.restore();
    }
}

class ThunderStrike {
    constructor(x, y, targets) {
        this.segments = [{x,y}, ...targets.map(t=>({x:t.x,y:t.y}))];
        this.life=10;this.look=getWeaponLook('thunder');this.paths=[];
        for(let n=1;n<this.segments.length;n++){
            const a=this.segments[n-1],b=this.segments[n],dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),points=[a];
            const steps=Math.max(2,Math.ceil(d/24));
            for(let i=1;i<steps;i++){const offset=Math.sin(i*7.13+n*3.1+frameCount)* (4+this.look.tier*3);points.push({x:a.x+dx*i/steps-dy/d*offset,y:a.y+dy*i/steps+dx/d*offset});}
            points.push(b);this.paths.push(points);
        }
    }
    update() { this.life=Math.max(0,this.life-dtFrames); }
    drawClassic() {
        ctx.strokeStyle = '#ffff88'; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = '#ffff88';
        ctx.globalAlpha = this.life / 10;
        ctx.beginPath();
        ctx.moveTo(this.segments[0].x - camera.x, this.segments[0].y - camera.y);
        for (let i = 1; i < this.segments.length; i++) {
            ctx.lineTo(this.segments[i].x - camera.x, this.segments[i].y - camera.y);
        }
        ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    draw() {
        if (!this.look.evolved) return this.drawClassic();
        const v=this.look;ctx.save();ctx.shadowColor=v.color;ctx.shadowBlur=v.glow;
        for(const path of this.paths){const points=path.map(p=>({x:p.x-camera.x,y:p.y-camera.y}));strokePath(points,v.color,3+v.tier,this.life/10);strokePath(points,v.accent,1,this.life/10);
            if(v.evolved){const end=points[points.length-1];strokePath([points[Math.floor(points.length/2)],{x:end.x+12,y:end.y-14}],v.color,1,this.life/15);}}
        ctx.restore();
    }
}

class Landmine {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.life = getWeaponStats('mine').duration; this.marked = false;
        this.triggerRadius = 40; this.look = getWeaponLook('mine');
        this.blastRadius = getWeaponStats('mine').blastRadius;
        this.active = false;
        this.armTimer = 30; // Delay before arming
    }
    update() {
        this.life = Math.max(0, this.life - dtFrames);
        if (this.armTimer > 0) this.armTimer = Math.max(0, this.armTimer - dtFrames);
        else this.active = true;

        if (this.active) {
            let target = null;
            let minD = getWeaponStats('mine').range;
            enemies.forEach(e => {
                if (e.marked) return;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minD) { minD = d; target = e; }
            });

            if (target) {
                this.x += (target.x - this.x) * 0.05;
                this.y += (target.y - this.y) * 0.05;
            }

            if (minD < this.triggerRadius) {
                this.explode();
            }
        }
    }
    explode() {
        if (this.marked) return;
        this.marked = true; this.life = 0;
        soundManager.playWeapon('mine', { evolved: this.look.evolved }, 'impact');
        createParticles(this.x, this.y, this.look.evolved ? this.look.color : '#ffff00', this.look.evolved ? 16 : 20);
        const w = getWeaponStats('mine');
        const dmg = w.attackPower * getDamageMultiplier();
        if (w.evolved) runBuild.fields.push({ x: this.x, y: this.y, radius: this.blastRadius, life: w.fieldDuration, tick: 0, damage: dmg * w.fieldDps, look: this.look });
        enemies.forEach(e => {
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist < this.blastRadius) {
                const damageMult = 1 - (dist / this.blastRadius) * 0.5;
                e.takeDamage(dmg * damageMult);
            }
        });
        for (let i = bossBullets.length - 1; i >= 0; i--) {
            const eb = bossBullets[i];
            if (eb.marked) continue;
            const dist = Math.hypot(eb.x - this.x, eb.y - this.y);
            if (dist < this.blastRadius) {
                eb.marked = true;
                createParticles(eb.x, eb.y, '#ff4444', 5);
            }
        }
        bombs.push({ x: this.x, y: this.y, r: 0, maxR: this.blastRadius, alpha: 1, look: this.look });
    }
    drawClassic() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        ctx.fillStyle = this.active ? (Math.floor(frameCount / 10) % 2 === 0 ? '#ffff00' : '#ff0000') : '#333';
        ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 6.28); ctx.fill();
        if (this.active) {
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx, sy, 10 + Math.sin(frameCount * 0.2) * 2, 0, 6.28); ctx.stroke();
        }
    }
    draw() {
        if (!this.look.evolved) return this.drawClassic();
        const v=this.look,x=this.x-camera.x,y=this.y-camera.y;
        ctx.save();ctx.translate(x,y);ctx.shadowColor=v.color;ctx.shadowBlur=this.active?v.glow:0;
        ctx.strokeStyle=v.color;ctx.lineWidth=1.5;
        for(let i=0;i<4+v.tier*2;i++){const a=i/(4+v.tier*2)*Math.PI*2+Math.sin(frameCount*.15+i)*.12;strokePath([{x:Math.cos(a)*6,y:Math.sin(a)*6},{x:Math.cos(a+.3)*(12+v.tier*2),y:Math.sin(a+.3)*(12+v.tier*2)}],v.color,1.5,this.active?.8:.35);}
        ctx.globalAlpha=1;ctx.fillStyle=this.active?v.color:'#35404b';ctx.beginPath();
        for(let i=0;i<6;i++){const a=i/6*Math.PI*2;i?ctx.lineTo(Math.cos(a)*7,Math.sin(a)*7):ctx.moveTo(7,0);}ctx.closePath();ctx.fill();
        ctx.fillStyle=v.accent;ctx.fillRect(-2,-2,4,4);
        if(this.active&&v.tier>=1){ctx.strokeStyle=v.color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,15+v.tier,frameCount*.06,frameCount*.06+Math.PI*1.5);ctx.stroke();}
        if(v.evolved){ctx.rotate(-frameCount*.035);ctx.strokeStyle=v.accent;ctx.strokeRect(-10,-10,20,20);}
        ctx.restore();
    }
}
