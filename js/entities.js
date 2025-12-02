// --- Entities.js ---
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x + (Math.random() - 0.5) * 20; this.y = y;
        this.text = text; this.color = color;
        this.life = 40; this.vy = -1.5;
    }
    update() { this.y += this.vy; this.life--; }
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
    update() { this.x += this.vx; this.y += this.vy; this.life--; this.vx *= 0.9; this.vy *= 0.9; }
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
        this.marked = false;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life--;

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
        ctx.fillStyle = this.isEnemy ? '#ff0000' : '#ffff00';
        if (!this.isEnemy && weapons.scatter && this.maxDist < 2000) ctx.fillStyle = weapons.scatter.color; // Scatter color

        ctx.globalAlpha = this.alpha || 1;
        ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.size, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

class BombProjectile {
    constructor(x, y, tx, ty) {
        this.x = x; this.y = y; this.tx = tx; this.ty = ty;
        this.height = 0; this.progress = 0;
        this.marked = false;
        const dist = Math.hypot(tx - x, ty - y);
        this.duration = dist / 8; // Speed
        this.vx = (tx - x) / this.duration;
        this.vy = (ty - y) / this.duration;
    }
    update() {
        this.progress++;
        this.x += this.vx;
        this.y += this.vy;
        const p = this.progress / this.duration;
        this.height = Math.sin(p * Math.PI) * 50;

        if (this.progress >= this.duration) {
            this.marked = true;
            this.explode();
        }
    }
    explode() {
        createParticles(this.x, this.y, '#ff8800', 30);
        soundManager.playExplosion();
        const r = weapons.bomb.explosionRadius;
        const dmg = weapons.bomb.attackPower * getDamageMultiplier();

        enemies.forEach(e => {
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist < r + e.size) {
                const damageMult = 1 - (dist / r) * 0.5;
                e.takeDamage(dmg * damageMult);
            }
        });
        bombs.push({ x: this.x, y: this.y, r: 0, maxR: r, alpha: 1 });
    }
    draw() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y - this.height;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 6.28); ctx.fill();
    }
}

class RotatingBlade {
    constructor(angleOffset) {
        this.angle = angleOffset;
    }
    update(weaponData, speedBoost = 1) {
        this.angle += weaponData.rotSpeed * speedBoost;
        const range = weaponData.range;

        // Blade Geometry (Sweeping Beam)
        const startDist = 10;
        const tipX = player.x + Math.cos(this.angle) * range;
        const tipY = player.y + Math.sin(this.angle) * range;
        const startX = player.x + Math.cos(this.angle) * startDist;
        const startY = player.y + Math.sin(this.angle) * startDist;

        const thickness = 25 * (range / 100);

        if (frameCount % 10 === 0) { // Hit tick
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
                    createParticles(e.x, e.y, weaponData.color, 3);
                    const pushA = Math.atan2(e.y - player.y, e.x - player.x);
                    e.pushX += Math.cos(pushA) * 5;
                    e.pushY += Math.sin(pushA) * 5;
                    soundManager.playBlade();
                }
            });
        }
    }

    draw(weaponData) {
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
}

class WhipHitbox {
    constructor(x, y, angle) {
        this.x = x; this.y = y; this.angle = angle;
        this.life = 10; this.maxLife = 10;
        this.range = weapons.whip.range * 1.5;
        this.width = Math.PI / 4;
    }
    update() {
        this.life--;
        if (this.life === 8) {
            const dmg = weapons.whip.attackPower * getDamageMultiplier();
            enemies.forEach(e => {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dist = Math.hypot(dx, dy);
                const angleToEnemy = Math.atan2(dy, dx);

                let angleDiff = angleToEnemy - this.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                if (dist < this.range && Math.abs(angleDiff) < this.width / 2) {
                    e.takeDamage(dmg);
                    const pushAngle = Math.atan2(dy, dx);
                    e.pushX += Math.cos(pushAngle) * 5;
                    e.pushY += Math.sin(pushAngle) * 5;
                }
            });
        }
    }
    draw() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);

        ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = '#ff00ff';
        ctx.globalAlpha = this.life / 10;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(this.range / 2, -50 * (this.life % 2 == 0 ? 1 : -1), this.range, 0);
        ctx.stroke();

        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.restore();
    }
}

class ThunderStrike {
    constructor(x, y, targets) {
        this.segments = [{ x: x, y: y }, ...targets];
        this.life = 10;
    }
    update() { this.life--; }
    draw() {
        ctx.strokeStyle = '#ffff88'; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = '#ffff88';
        ctx.globalAlpha = this.life / 10;
        ctx.beginPath();
        ctx.moveTo(this.segments[0].x - camera.x, this.segments[0].y - camera.y);
        for (let i = 1; i < this.segments.length; i++) {
            ctx.lineTo(this.segments[i].x - camera.x, this.segments[i].y - camera.y);
        }
        ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
}

class Landmine {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.life = weapons.mine.duration;
        this.triggerRadius = 40;
        this.blastRadius = weapons.mine.blastRadius || 120;
        this.active = false;
        this.armTimer = 30; // Delay before arming
    }
    update() {
        this.life--;
        if (this.armTimer > 0) this.armTimer--;
        else this.active = true;

        if (this.active) {
            let target = null;
            let minD = 150;
            enemies.forEach(e => {
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
        this.life = 0;
        soundManager.playExplosion();
        createParticles(this.x, this.y, '#ffff00', 20);
        const dmg = weapons.mine.attackPower * getDamageMultiplier();
        enemies.forEach(e => {
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist < this.blastRadius) {
                const damageMult = 1 - (dist / this.blastRadius) * 0.5;
                e.takeDamage(dmg * damageMult);
            }
        });
        bombs.push({ x: this.x, y: this.y, r: 0, maxR: this.blastRadius, alpha: 1, color: '#ffff00' });
    }
    draw() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        ctx.fillStyle = this.active ? (Math.floor(frameCount / 10) % 2 === 0 ? '#ffff00' : '#ff0000') : '#333';
        ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 6.28); ctx.fill();
        if (this.active) {
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx, sy, 10 + Math.sin(frameCount * 0.2) * 2, 0, 6.28); ctx.stroke();
        }
    }
}

