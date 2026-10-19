const enemyImages = {};

function loadEnemyImages() {
    const types = Object.keys(enemyTypes);
    types.forEach(type => {
        const t = enemyTypes[type];
        fetch(`assets/enemies/${type}.svg`)
            .then(r => r.text())
            .then(svg => {
                const colored = svg.replace(/currentColor/g, t.color);
                const blob = new Blob([colored], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { enemyImages[type] = img; };
                img.src = url;
            })
            .catch(() => {});
    });
}

// 赤背景に緑だと色覚によって区別しにくいため、暗い背景＋残量で色を変える。
function hpBarColor(ratio) {
    return ratio > .5 ? '#33ff66' : ratio > .25 ? '#ffd23f' : '#ff3355';
}

// --- Boss Base Class ---
class BossBase {
    constructor(wave) {
        const angle = Math.random() * Math.PI * 2;
        this.x = player.x + Math.cos(angle) * 800;
        this.y = player.y + Math.sin(angle) * 800;
        this.x = clamp(this.x, 100, world.width - 100);
        this.y = clamp(this.y, 100, world.height - 100);

        this.hp = enemyBaseHp * 50 * bossHpScale(wave) * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;
        this.size = 40;
        this.speed = 2.5;
        this.color = '#ff0000';
        this.marked = false;
        this.flash = 0;
        this.attackTimer = 0;
        this.isBoss = true;
        this.bossType = 'standard';
    }

    checkPlayerCollision(damage = 20) {
        if (Math.hypot(player.x - this.x, player.y - this.y) < player.size + this.size) {
            takePlayerDamage(damage);
        }
    }

    drawBase(sx, sy) {
        ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const rot = (frameCount * 0.05) + (i * Math.PI * 2 / 8);
            const r = (i % 2 === 0) ? this.size : this.size * 0.7;
            const px = sx + Math.cos(rot) * r;
            const py = sy + Math.sin(rot) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawHpBar(sx, sy) {
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = '#222'; ctx.fillRect(sx - 40, sy - 60, 80, 8);
        ctx.fillStyle = hpBarColor(hpPercent); ctx.fillRect(sx - 40, sy - 60, 80 * hpPercent, 8);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(sx - 40, sy - 60, 80, 8);
        ctx.fillStyle = this.color; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
        ctx.fillText(this.bossType.toUpperCase(), sx, sy - 55);
    }

    takeDamage(dmg) {
        if (this.marked) return;
        this.hp -= dmg;
        totalDamageDealt += dmg;
        this.flash = 3;
        addFloatingText(this.x, this.y, Math.floor(dmg), '#fff');
        if (this.hp <= 0 && !this.marked) {
            this.marked = true;
            score += 1000;
            for (let i = 0; i < 20; i++) {
                gems.push({ x: this.x + (Math.random() - 0.5) * 100, y: this.y + (Math.random() - 0.5) * 100, val: 50, size: 8, marked: false });
            }
            player.hp = Math.min(getPlayerStats().maxHp, player.hp + 50);
            runBuild.bossRewards++;
            addFloatingText(player.x, player.y, "+50 HP", "#00ff00");
            createParticles(this.x, this.y, this.color, 50);
            soundManager.playExplosion();
            isBossActive = false;
            soundManager.setBossMode(false);
            bossBullets = [];
            const boxes = document.querySelectorAll('.stat-box');
            boxes.forEach(b => b.classList.remove('boss-mode'));
            updateUI();
        }
    }
}

class Boss extends BossBase {
    constructor(wave) {
        super(wave);
        this.bossType = 'destroyer';
        this.color = '#ff0000';
    }

    update() {
        const a = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(a) * this.speed;
        this.y += Math.sin(a) * this.speed;
            if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);
        this.checkPlayerCollision(20);

            this.attackTimer += dtFrames;
        if (this.attackTimer > 60) {
            this.attackTimer = 0;
            for (let i = -2; i <= 2; i++) {
                const targetX = player.x + Math.cos(a + i * 0.2) * 200;
                const targetY = player.y + Math.sin(a + i * 0.2) * 200;
                bossBullets.push(new Bullet(this.x, this.y, targetX, targetY, true));
            }
            soundManager.playShoot();
        }
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy)) return;
        this.drawBase(sx, sy);
        this.drawHpBar(sx, sy);
    }
}

class BossCharger extends BossBase {
    constructor(wave) {
        super(wave);
        this.bossType = 'charger';
        this.color = '#ff6600';
        this.hp = enemyBaseHp * 50 * bossHpScale(wave) * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;
        this.size = 50;
        this.speed = 1.5;
        this.chargeSpeed = 10;
        this.isCharging = false;
        this.chargeTimer = 0;
        this.chargeCooldown = 0;
        this.chargeTargetX = 0;
        this.chargeTargetY = 0;
        this.trail = [];
            this.trailAccumulator = 0;
    }

    update() {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);

        if (this.isCharging) {
            const a = Math.atan2(this.chargeTargetY - this.y, this.chargeTargetX - this.x);
            this.x += Math.cos(a) * this.chargeSpeed;
            this.y += Math.sin(a) * this.chargeSpeed;

                // Spawn trail every 2 frames equivalent (0.033 seconds)
                this.trailAccumulator += dtSeconds;
                if (this.trailAccumulator >= 0.033) {
                    this.trailAccumulator -= 0.033;
                this.trail.push({ x: this.x, y: this.y, life: 30 });
            }

                this.chargeTimer = Math.max(0, this.chargeTimer - dtFrames);
            if (this.chargeTimer <= 0) {
                this.isCharging = false;
                this.chargeCooldown = 100 + Math.floor(Math.random() * 100);
                soundManager.playExplosion();
                createParticles(this.x, this.y, this.color, 10);
            }
            this.checkPlayerCollision(35);
        } else {
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(a) * this.speed;
            this.y += Math.sin(a) * this.speed;
            this.checkPlayerCollision(15);

            this.trailAccumulator += dtSeconds;
            if (this.trailAccumulator >= 0.033) {
                this.trailAccumulator -= 0.033;
                this.trail.push({ x: this.x, y: this.y, life: 30 });
            }

                this.chargeCooldown = Math.max(0, this.chargeCooldown - dtFrames);
            if (this.chargeCooldown <= 0) {
                this.isCharging = true;
                this.chargeTimer = 60;
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const dist = 1500;
                this.chargeTargetX = this.x + Math.cos(angle) * dist;
                this.chargeTargetY = this.y + Math.sin(angle) * dist;

                soundManager.playBossSpawn();
            }
        }

        this.trail.forEach(t => t.life = Math.max(0, t.life - dtFrames));
        this.trail = this.trail.filter(t => t.life > 0);
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy)) return;

        if (this.trail.length > 1) {
            ctx.save();
            ctx.shadowColor = this.color;
            for (let i = 1; i < this.trail.length; i++) {
                const t = this.trail[i];
                const progress = i / this.trail.length;
                const alpha = progress * 0.7;
                const width = this.size * 1.2 * progress;
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = this.color;
                ctx.lineWidth = width;
                ctx.shadowBlur = 12 * progress;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x - camera.x, this.trail[i - 1].y - camera.y);
                ctx.lineTo(t.x - camera.x, t.y - camera.y);
                ctx.stroke();
            }
            ctx.restore();
        }

        if (!this.isCharging && this.chargeCooldown < 30 && this.chargeCooldown > 0) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(player.x - camera.x, player.y - camera.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        const a = Math.atan2(player.y - this.y, player.x - this.x);
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * this.size, sy + Math.sin(a) * this.size);
        ctx.lineTo(sx + Math.cos(a + 2.5) * this.size * 0.8, sy + Math.sin(a + 2.5) * this.size * 0.8);
        ctx.lineTo(sx + Math.cos(a - 2.5) * this.size * 0.8, sy + Math.sin(a - 2.5) * this.size * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        this.drawHpBar(sx, sy);
    }
}

class BossSniper extends BossBase {
    constructor(wave) {
        super(wave);
        this.bossType = 'sniper';
        this.color = '#00ff88';
        this.hp = enemyBaseHp * 28 * bossHpScale(wave) * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;
        this.size = 35;
        this.speed = 1.8;
        this.preferredDistance = 250;
        this.laserChargeTime = 0;
        this.isChargingLaser = false;
        this.laserTargetX = 0;
        this.laserTargetY = 0;
    }

    update() {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);

        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        const a = Math.atan2(player.y - this.y, player.x - this.x);

        if (dist < this.preferredDistance - 50) {
            this.x -= Math.cos(a) * this.speed;
            this.y -= Math.sin(a) * this.speed;
        } else if (dist > this.preferredDistance + 50) {
            this.x += Math.cos(a) * this.speed * 0.5;
            this.y += Math.sin(a) * this.speed * 0.5;
        } else {
            this.x += Math.cos(a + Math.PI / 2) * this.speed * 0.3 * Math.sin(frameCount * 0.05);
            this.y += Math.sin(a + Math.PI / 2) * this.speed * 0.3 * Math.sin(frameCount * 0.05);
        }

        this.x = clamp(this.x, 50, world.width - 50);
        this.y = clamp(this.y, 50, world.height - 50);

        this.checkPlayerCollision(10);

    this.attackTimer += dtFrames;
        if (!this.isChargingLaser && this.attackTimer > 60) {
            this.isChargingLaser = true;
            this.laserChargeTime = 60;
            this.laserTargetX = player.x;
            this.laserTargetY = player.y;
        }

        if (this.isChargingLaser) {
            this.laserChargeTime = Math.max(0, this.laserChargeTime - dtFrames);
            this.laserTargetX += (player.x - this.laserTargetX) * 0.02;
            this.laserTargetY += (player.y - this.laserTargetY) * 0.02;

            if (this.laserChargeTime <= 0) {
                this.isChargingLaser = false;
                this.attackTimer = 0;
                soundManager.playThunder();

                const laserAngle = Math.atan2(this.laserTargetY - this.y, this.laserTargetX - this.x);
                const laserLength = 800;
                const endX = this.x + Math.cos(laserAngle) * laserLength;
                const endY = this.y + Math.sin(laserAngle) * laserLength;

                if (pointLineDist(player.x, player.y, this.x, this.y, endX, endY) < player.size + 10) {
                    takePlayerDamage(25);
                }

                laserBeams.push({ x1: this.x, y1: this.y, x2: endX, y2: endY, life: 15, w: { range: laserLength } });
            }
        }
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy)) return;

        if (this.isChargingLaser) {
            ctx.strokeStyle = `rgba(0, 255, 136, ${0.3 + 0.7 * (1 - this.laserChargeTime / 60)})`;
            ctx.lineWidth = 2 + (60 - this.laserChargeTime) * 0.2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(this.laserTargetX - camera.x, this.laserTargetY - camera.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.moveTo(sx, sy - this.size);
        ctx.lineTo(sx + this.size * 0.7, sy);
        ctx.lineTo(sx, sy + this.size);
        ctx.lineTo(sx - this.size * 0.7, sy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, this.size + 10, 0, 6.28);
        ctx.stroke();

        this.drawHpBar(sx, sy);
    }
}

class BossTeleporter extends BossBase {
    constructor(wave) {
        super(wave);
        this.bossType = 'phantom';
        this.color = '#aa00ff';
        this.hp = enemyBaseHp * 40 * bossHpScale(wave) * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;
        this.size = 35;
        this.speed = 2.0;
        this.teleportCooldown = 0;
        this.isTeleporting = false;
        this.teleportPhase = 0;
        this.nextX = 0;
        this.nextY = 0;
        this.alpha = 1;
    }

    update() {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);

        if (this.isTeleporting) {
            this.teleportPhase += dtFrames;
            if (this.teleportPhase < 15) {
                this.alpha = 1 - this.teleportPhase / 15;
            } else if (this.teleportPhase === 15) {
                this.x = this.nextX;
                this.y = this.nextY;
                createParticles(this.x, this.y, this.color, 15);
            } else if (this.teleportPhase < 30) {
                this.alpha = (this.teleportPhase - 15) / 15;
            } else {
                this.isTeleporting = false;
                this.teleportCooldown = 120;
                this.alpha = 1;
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2;
                    bossBullets.push(new Bullet(this.x, this.y, this.x + Math.cos(angle) * 100, this.y + Math.sin(angle) * 100, true));
                }
                soundManager.playShoot();
            }
        } else {
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(a) * this.speed;
            this.y += Math.sin(a) * this.speed;

            this.teleportCooldown = Math.max(0, this.teleportCooldown - dtFrames);
            if (this.teleportCooldown <= 0) {
                this.isTeleporting = true;
                this.teleportPhase = 0;
                const teleportType = Math.random();
                let angle, dist;

                if (teleportType < 0.5) {
                    angle = player.lastMoveAngle + (Math.random() - 0.5) * 0.5;
                    dist = 250 + Math.random() * 150;
                    this.nextX = player.x + Math.cos(angle) * dist;
                    this.nextY = player.y + Math.sin(angle) * dist;
                } else if (teleportType < 0.7) {
                    angle = Math.atan2(player.y - this.y, player.x - this.x) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
                    dist = 150 + Math.random() * 100;
                    this.nextX = player.x + Math.cos(angle) * dist;
                    this.nextY = player.y + Math.sin(angle) * dist;
                } else if (teleportType < 0.85) {
                    angle = Math.atan2(player.y - this.y, player.x - this.x) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
                    dist = 180 + Math.random() * 120;
                    this.nextX = this.x + Math.cos(angle) * dist;
                    this.nextY = this.y + Math.sin(angle) * dist;
                } else {
                    const behindAngle = Math.atan2(this.y - player.y, this.x - player.x);
                    this.nextX = player.x + Math.cos(behindAngle) * 150;
                    this.nextY = player.y + Math.sin(behindAngle) * 150;
                }

                this.nextX = clamp(this.nextX, 50, world.width - 50);
                this.nextY = clamp(this.nextY, 50, world.height - 50);
                soundManager.playThunder();
                createParticles(this.x, this.y, this.color, 15);
            }

            this.checkPlayerCollision(15);
        }
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy)) return;

        ctx.globalAlpha = this.alpha;

        if (this.isTeleporting && this.teleportPhase < 15) {
            ctx.strokeStyle = this.color;
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.nextX - camera.x, this.nextY - camera.y, this.size, 0, 6.28);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + frameCount * 0.02;
            const px = sx + Math.cos(angle) * this.size;
            const py = sy + Math.sin(angle) * this.size;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.globalAlpha = 1;
        this.drawHpBar(sx, sy);
    }
}

class BossSummoner extends BossBase {
    constructor(wave) {
        super(wave);
        this.bossType = 'summoner';
        this.color = '#ffaa00';
        this.hp = enemyBaseHp * 45 * bossHpScale(wave) * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;
        this.size = 45;
        this.speed = 1.5;
        this.summonCooldown = 0;
        this.orbits = [];
        this.shieldActive = false;
    }

    update() {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);

        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        const a = Math.atan2(player.y - this.y, player.x - this.x);

        if (dist < 250) {
            this.x -= Math.cos(a) * this.speed;
            this.y -= Math.sin(a) * this.speed;
        } else if (dist > 400) {
            this.x += Math.cos(a) * this.speed * 0.5;
            this.y += Math.sin(a) * this.speed * 0.5;
        }

        this.x = clamp(this.x, 50, world.width - 50);
        this.y = clamp(this.y, 50, world.height - 50);

        this.checkPlayerCollision(15);

    this.summonCooldown = Math.max(0, this.summonCooldown - dtFrames);
        if (this.summonCooldown <= 0) {
            this.summonCooldown = 110;
            const count = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                const spawnAngle = (i / count) * Math.PI * 2;
                const e = new Enemy();
                e.x = this.x + Math.cos(spawnAngle) * 80;
                e.y = this.y + Math.sin(spawnAngle) * 80;
                e.hp = enemyBaseHp * 0.5;
                e.maxHp = e.hp;
                e.color = '#ffcc00';
                enemies.push(e);
                createParticles(e.x, e.y, '#ffaa00', 5);
            }
            soundManager.playLevelUp();
        }

        this.orbits = this.orbits.filter(o => o.life > 0);
        this.orbits.forEach((o, i) => {
            o.angle += 0.05;
                o.life = Math.max(0, o.life - dtFrames);
        });

            this.attackTimer += dtFrames;
        if (this.attackTimer > 70) {
            this.attackTimer = 0;
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                bossBullets.push(new Bullet(this.x, this.y, this.x + Math.cos(angle) * 100, this.y + Math.sin(angle) * 100, true));
            }
            soundManager.playShoot();
        }
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy)) return;

        this.orbits.forEach((o, i) => {
            const ox = sx + Math.cos(o.angle) * 60;
            const oy = sy + Math.sin(o.angle) * 60;
            ctx.globalAlpha = o.life / 60;
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(ox, oy, 8, 0, 6.28);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const r = (i % 2 === 0) ? this.size : this.size * 0.6;
            const px = sx + Math.cos(angle) * r;
            const py = sy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        if (this.summonCooldown < 60) {
            ctx.strokeStyle = `rgba(255, 170, 0, ${1 - this.summonCooldown / 60})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(sx, sy, 80, 0, 6.28);
            ctx.stroke();
        }

        this.drawHpBar(sx, sy);
    }
}

class BossTank extends BossBase {
    constructor(wave) {
        super(wave);
        this.bossType = 'juggernaut';
        this.color = '#888888';
        this.hp = enemyBaseHp * 80 * bossHpScale(wave) * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;
        this.size = 55;
        this.speed = 1.0;
        this.armor = 0.5;

        this.slamCooldown = 0;
        this.isSlammingDown = false;
        this.slamPhase = 0;
        this.jumpHeight = 0;
        this.slamRadius = 250;

        this.beamCooldown = 60;
        this.isBeaming = false;
        this.beamTimer = 0;
        this.beamAngle = 0;
        this.beamDuration = 180;
        this.beamWarningTime = 60;
            this.particleAccumulator = 0;
    }

    update() {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);

        if (this.isSlammingDown) {
            this.slamPhase += dtFrames;

            // Phase 1: Jump Up (0-40)
            if (this.slamPhase < 40) {
                const t = this.slamPhase / 40;
                this.jumpHeight = 150 * Math.sin(t * Math.PI / 2);
            }
            // Phase 2: Slam Down (40-50)
            else if (this.slamPhase < 50) {
                const t = (this.slamPhase - 40) / 10;
                this.jumpHeight = 150 * (1 - t * t);
            }
            // Phase 3: Impact (50)
            else if (this.slamPhase === 50) {
                this.jumpHeight = 0;
                const slamRadius = this.slamRadius;
                if (Math.hypot(player.x - this.x, player.y - this.y) < slamRadius) {
                    takePlayerDamage(30);
                }
                soundManager.playExplosion();
                createParticles(this.x, this.y, '#666', 40);
            }

            // Phase 4: Recovery (50-90)
            if (this.slamPhase >= 90) {
                this.isSlammingDown = false;
                this.slamCooldown = 70;
            }
        } else if (this.isBeaming) {
            this.beamTimer += dtFrames;
            if (this.beamTimer < this.beamWarningTime) {
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                let diff = targetAngle - this.beamAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                this.beamAngle += diff * 0.05;
            }
            else if (this.beamTimer < this.beamWarningTime + this.beamDuration) {
                const beamLength = 1000;
                const bx = this.x + Math.cos(this.beamAngle) * beamLength;
                const by = this.y + Math.sin(this.beamAngle) * beamLength;

                if (pointLineDist(player.x, player.y, this.x, this.y, bx, by) < 40) {
                    takePlayerDamage(2, 5);
                }

                    // Spawn particles every 4 frames equivalent (0.067 seconds)
                    this.particleAccumulator += dtSeconds;
                    if (this.particleAccumulator >= 0.067) {
                        this.particleAccumulator -= 0.067;
                        createParticles(this.x + Math.cos(this.beamAngle) * 50, this.y + Math.sin(this.beamAngle) * 50, '#ff0000', 2);
                    }
            }
            else {
                this.isBeaming = false;
                this.beamCooldown = 180;
            }
        } else {
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(a) * this.speed;
            this.y += Math.sin(a) * this.speed;

            this.slamCooldown = Math.max(0, this.slamCooldown - dtFrames);
            if (this.slamCooldown <= 0 && Math.hypot(player.x - this.x, player.y - this.y) < this.slamRadius) {
                this.isSlammingDown = true;
                this.slamPhase = 0;
                soundManager.playBossSpawn();
            }

            this.checkPlayerCollision(25);

            this.beamCooldown = Math.max(0, this.beamCooldown - dtFrames);
            if (this.beamCooldown <= 0) {
                this.isBeaming = true;
                this.beamTimer = 0;
                this.beamAngle = a;
                soundManager.playThunder();
            }
        }
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy)) return;

        // Draw Shadow/Impact Zone
        if (this.isSlammingDown) {
            const progress = Math.min(1, this.slamPhase / 50);
            const slamRadius = this.slamRadius;
            ctx.fillStyle = `rgba(255, 0, 0, ${0.1 + progress * 0.25})`;
            ctx.beginPath();
            ctx.arc(sx, sy, slamRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 0, 0, ${0.4 + progress * 0.4})`;
            ctx.lineWidth = 4 + progress * 2;
            ctx.setLineDash([12, 10]);
            ctx.beginPath();
            ctx.arc(sx, sy, slamRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            if (this.slamPhase === 50) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath(); ctx.arc(sx, sy, slamRadius, 0, Math.PI * 2); ctx.fill();
            }
        }

        if (this.isBeaming) {
            const beamLength = 1000;
            const ex = sx + Math.cos(this.beamAngle) * beamLength;
            const ey = sy + Math.sin(this.beamAngle) * beamLength;

            if (this.beamTimer < this.beamWarningTime) {
                ctx.strokeStyle = `rgba(255, 0, 0, 0.5)`;
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 10]);
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 40 + Math.sin(frameCount * 0.5) * 10;
                ctx.shadowBlur = 20; ctx.shadowColor = '#ff0000';
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 10;
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        const drawY = sy - this.jumpHeight;
        const shake = this.isSlammingDown && this.slamPhase >= 50 && this.slamPhase < 60 ? (Math.random() - 0.5) * 20 : 0;

        ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        ctx.fillRect(sx - this.size + shake, drawY - this.size + shake, this.size * 2, this.size * 2);

        ctx.fillStyle = '#666';
        ctx.fillRect(sx - this.size * 0.7 + shake, drawY - this.size * 0.7 + shake, this.size * 1.4, this.size * 1.4);
        ctx.fillStyle = this.flash > 0 ? '#fff' : '#444';
        ctx.fillRect(sx - this.size * 0.4 + shake, drawY - this.size * 0.4 + shake, this.size * 0.8, this.size * 0.8);
        ctx.shadowBlur = 0;

        this.drawHpBar(sx, drawY);
        ctx.fillStyle = '#888'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`ARMOR ${Math.floor(this.armor * 100)}%`, sx, drawY - 75);
    }
}

function createRandomBoss(wave) {
    const bossTypes = [Boss, BossCharger, BossSniper, BossTeleporter, BossSummoner, BossTank];
    const BossClass = bossTypes[Math.floor(Math.random() * bossTypes.length)];
    return new BossClass(wave);
}

class Enemy {
    constructor() {
        const position = enemySpawnPosition(); this.x = position.x; this.y = position.y;
        const type = chooseEnemyType();
        const t = enemyTypes[type];
        this.type = type;
        this.shape = t.shape;
        this.hp = enemyBaseHp * t.hpMul * (enemyGlobalHpMul || 1);
        this.maxHp = this.hp;

        this.speed = enemyMoveSpeed(t.spdMul);
        this.color = t.color; this.size = 12;
        this.flash = 0; this.marked = false;
        this.pushX = 0; this.pushY = 0;
        this.isBoss = false;

        // Type-specific properties
        if (this.type === 'orbiter') {
            this.orbitAngle = Math.atan2(this.y - player.y, this.x - player.x);
            this.orbitRadius = 180 + Math.random() * 40;
            this.orbitSpeed = 0.02 + Math.random() * 0.01;
            this.trail = [];
            this.shootCooldown = 60 + Math.floor(Math.random() * 30);
        } else if (this.type === 'sniper') {
            this.chargeTimer = 120 + Math.floor(Math.random() * 60);
            this.isCharging = false;
            this.chargeProgress = 0;
            this.preferredDistance = 300 + Math.random() * 100;
        } else if (this.type === 'splitter') {
            this.size = 16;
            this.isSplit = false;
        } else if (this.type === 'teleporter') {
            this.teleportTimer = 180 + Math.floor(Math.random() * 60);
            this.alpha = 1;
            this.teleportFlash = 0;
        } else if (this.type === 'bomber') {
            this.sineOffset = Math.random() * Math.PI * 2;
            this.sineAmplitude = 80 + Math.random() * 40;
            this.pulseRate = 0.1;
        }
        if (!this.trail) this.trail = [];
    }
    update() {
        if (this.marked) return;
        const originalSpeed = this.speed;
        if (player.weapons.includes('sanctuary')) { const field = getWeaponStats('sanctuary'); if (field.evolved && Math.hypot(this.x-player.x,this.y-player.y)<field.range+this.size) this.speed *= 1 - field.slow; }
        this.pushX *= 0.8; this.pushY *= 0.8;
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtFrames);

        if (this.type === 'orbiter') {
            // Orbit around player
            this.orbitAngle += this.orbitSpeed * dtFrames;
            const targetX = player.x + Math.cos(this.orbitAngle) * this.orbitRadius;
            const targetY = player.y + Math.sin(this.orbitAngle) * this.orbitRadius;
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
                this.x += (dx / dist) * this.speed * 1.5 + this.pushX;
                this.y += (dy / dist) * this.speed * 1.5 + this.pushY;
            }
            // Trail
            this.trail.push({ x: this.x, y: this.y, life: 30 });
            if (this.trail.length > 30) this.trail.shift();
            // Shoot at player
            this.shootCooldown -= dtFrames;
            if (this.shootCooldown <= 0) {
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                const b = new Bullet(this.x, this.y, this.x + Math.cos(a) * 100, this.y + Math.sin(a) * 100, true, 400);
                bossBullets.push(b);
                this.shootCooldown = 90;
            }
        } else if (this.type === 'sniper') {
            // Maintain distance
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            if (distToPlayer < this.preferredDistance - 50) {
                // Too close, back away
                this.x -= Math.cos(a) * this.speed + this.pushX;
                this.y -= Math.sin(a) * this.speed + this.pushY;
            } else if (distToPlayer > this.preferredDistance + 50) {
                // Too far, approach
                this.x += Math.cos(a) * this.speed + this.pushX;
                this.y += Math.sin(a) * this.speed + this.pushY;
            }
            // Charge and shoot
            this.chargeTimer -= dtFrames;
            if (this.chargeTimer <= 0 && !this.isCharging) {
                this.isCharging = true;
                this.chargeProgress = 0;
            }
            if (this.isCharging) {
                this.chargeProgress += dtFrames;
                if (this.chargeProgress >= 60) {
                    // Fire high-damage bullet
                    const fireAngle = Math.atan2(player.y - this.y, player.x - this.x);
                    const b = new Bullet(this.x, this.y, this.x + Math.cos(fireAngle) * 100, this.y + Math.sin(fireAngle) * 100, true, 600);
                    b.size = 8;
                    b.damage = 20;
                    b.hp = 3; b.maxHp = 3;
                    bossBullets.push(b);
                    this.isCharging = false;
                    this.chargeTimer = 150;
                }
            }
        } else if (this.type === 'teleporter') {
            // Slow approach
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(a) * this.speed * 0.5 + this.pushX;
            this.y += Math.sin(a) * this.speed * 0.5 + this.pushY;
            // Teleport
            this.teleportTimer -= dtFrames;
            if (this.teleportTimer <= 0) {
                // Teleport to random position near player
                const tpAngle = Math.random() * Math.PI * 2;
                const tpDist = 150 + Math.random() * 100;
                this.x = player.x + Math.cos(tpAngle) * tpDist;
                this.y = player.y + Math.sin(tpAngle) * tpDist;
                this.x = clamp(this.x, 0, world.width);
                this.y = clamp(this.y, 0, world.height);
                this.teleportFlash = 10;
                // Fire 3-way spread
                for (let i = -1; i <= 1; i++) {
                    const spreadAngle = Math.atan2(player.y - this.y, player.x - this.x) + i * 0.3;
                    const b = new Bullet(this.x, this.y, this.x + Math.cos(spreadAngle) * 100, this.y + Math.sin(spreadAngle) * 100, true, 350);
                    bossBullets.push(b);
                }
                this.teleportTimer = 180;
            }
            if (this.teleportFlash > 0) {
                this.alpha = 0.3 + Math.sin(this.teleportFlash * 0.5) * 0.3;
                this.teleportFlash -= dtFrames;
            } else {
                this.alpha = 1;
            }
        } else if (this.type === 'bomber') {
            // Sine wave approach
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            this.sineOffset += 0.15 * dtFrames;
            const perpAngle = a + Math.PI / 2;
            const sineOffset = Math.sin(this.sineOffset) * this.sineAmplitude;
            this.x += Math.cos(a) * this.speed + Math.cos(perpAngle) * sineOffset * 0.05 + this.pushX;
            this.y += Math.sin(a) * this.speed + Math.sin(perpAngle) * sineOffset * 0.05 + this.pushY;
            this.trail.push({ x: this.x, y: this.y, life: 30 });
            if (this.trail.length > 30) this.trail.shift();
            // Pulse faster when close
            this.pulseRate = 0.1 + (1 - Math.min(1, distToPlayer / 200)) * 0.3;
            // Explode when close
            if (distToPlayer < 40) {
                this.marked = true;
                createParticles(this.x, this.y, this.color, 20);
                soundManager.playExplosion();
                // Damage player
                takePlayerDamage(15);
                // Damage nearby enemies
                const blastRadius = 80;
                enemies.forEach(e => {
                    if (e !== this && !e.isBoss) {
                        const d = Math.hypot(e.x - this.x, e.y - this.y);
                        if (d < blastRadius) {
                            e.takeDamage(30);
                        }
                    }
                });
            }
        } else {
            // Default: chase player (normal, tank, runner, shooter, ghost, splitter)
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(a) * this.speed + this.pushX;
            this.y += Math.sin(a) * this.speed + this.pushY;
            this.trail.push({ x: this.x, y: this.y, life: 30 });
            if (this.trail.length > 30) this.trail.shift();
        }

        // Trail decay
        if (this.trail) {
            this.trail.forEach(t => t.life = Math.max(0, t.life - dtFrames));
            this.trail = this.trail.filter(t => t.life > 0);
        }

        this.speed = originalSpeed;
        // Contact damage (except bomber which explodes)
        if (this.type !== 'bomber') {
            if (Math.hypot(player.x - this.x, player.y - this.y) < player.size + this.size) {
                takePlayerDamage(5);
            }
        }
    }
    drawNeonTrail() {
        if (!this.trail || this.trail.length < 2) return;
        ctx.save();
        ctx.shadowColor = this.color;
        for (let i = 1; i < this.trail.length; i++) {
            const t = this.trail[i];
            const progress = i / this.trail.length;
            const alpha = progress * 0.7;
            const width = this.size * 1.2 * progress;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = width;
            ctx.shadowBlur = 12 * progress;
            ctx.beginPath();
            ctx.moveTo(this.trail[i - 1].x - camera.x, this.trail[i - 1].y - camera.y);
            ctx.lineTo(t.x - camera.x, t.y - camera.y);
            ctx.stroke();
        }
        ctx.restore();
    }
    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (isOffscreen(sx, sy, 50)) return;

        // Draw enemy trail
        if (this.trail && this.trail.length > 1) {
            this.drawNeonTrail();
        }

        // Draw sniper charge laser
        if (this.type === 'sniper' && this.isCharging) {
            const progress = this.chargeProgress / 60;
            ctx.strokeStyle = `rgba(255, 0, 0, ${progress * 0.8})`;
            ctx.lineWidth = 2 + progress * 3;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(player.x - camera.x, player.y - camera.y);
            ctx.stroke();
        }

        // Draw teleporter with alpha
        if (this.type === 'teleporter') {
            ctx.globalAlpha = this.alpha || 1;
        }

        // Draw bomber with pulse
        if (this.type === 'bomber') {
            const pulse = Math.sin(frameCount * this.pulseRate) * 0.3 + 0.7;
            ctx.globalAlpha = pulse;
        }

        const img = enemyImages[this.shape];
        if (img) {
            const prevFilter = ctx.filter;
            if (this.flash > 0) ctx.filter = 'brightness(100)';
            ctx.drawImage(img, sx - this.size, sy - this.size, this.size * 2, this.size * 2);
            ctx.filter = prevFilter;
        } else {
            ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
            ctx.beginPath(); ctx.rect(sx - this.size, sy - this.size, this.size * 2, this.size * 2); ctx.fill();
        }

        ctx.globalAlpha = 1;

        // HP bar
        if (this.hp < this.maxHp) {
            const ratio = this.hp / this.maxHp;
            ctx.fillStyle = '#222'; ctx.fillRect(sx - 10, sy - 20, 20, 3);
            ctx.fillStyle = hpBarColor(ratio); ctx.fillRect(sx - 10, sy - 20, 20 * ratio, 3);
        }
    }
    takeDamage(dmg) {
        if (this.marked) return;
        this.hp -= dmg; totalDamageDealt += dmg; this.flash = 3;
        const a = Math.atan2(this.y - player.y, this.x - player.x);
        this.pushX = Math.cos(a) * 2; this.pushY = Math.sin(a) * 2;
        addFloatingText(this.x, this.y, Math.floor(dmg), '#fff');
        if (this.hp <= 0 && !this.marked) {
            this.marked = true;
            score += 10;
            createParticles(this.x, this.y, this.color, 5);
            gems.push({ x: this.x, y: this.y, val: 10 + wave * 2, size: 5, marked: false });
            updateUI();

            // Splitter: spawn 2 mini splitters
            if (this.type === 'splitter' && !this.isSplit) {
                for (let i = 0; i < 2; i++) {
                    const mini = new Enemy();
                    mini.type = 'splitter';
                    mini.shape = 'splitter';
                    mini.hp = enemyBaseHp * 0.5 * (enemyGlobalHpMul || 1);
                    mini.maxHp = mini.hp;
                    mini.size = 8;
                    mini.speed = enemyMoveSpeed(enemyTypes.splitter.spdMul * 1.5);
                    mini.color = this.color;
                    mini.x = this.x + (Math.random() - 0.5) * 30;
                    mini.y = this.y + (Math.random() - 0.5) * 30;
                    mini.isSplit = true;
                    enemies.push(mini);
                }
            }
        }
    }
}

