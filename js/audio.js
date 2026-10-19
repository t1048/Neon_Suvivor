// --- Audio.js ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.sfxVoices = 0;
        this.sfxLast = new Map();
        this.noiseBuffers = new Map();
        this.masterVolume = 0.3;
        this.isMuted = false;
        this.isPlayingBGM = false;
        this.nextNoteTime = 0;
        this.tempo = 110;
        this.current16thNote = 0;
        this.timerID = null;
        this.isBossMode = false;
        this.currentWave = 1;

        // Music Pattern
        this.normalBass = [36, 0, 36, 0, 36, 36, 38, 0, 33, 0, 33, 0, 33, 33, 35, 0];

        this.normalArp = [60, 63, 67, 63, 60, 63, 67, 63, 57, 60, 64, 60, 57, 60, 64, 60];

        // Rare Alternate Pattern (F - G - Em - Am feel)
        this.normalBassAlt = [41, 0, 41, 41, 43, 0, 43, 43, 40, 0, 40, 40, 33, 0, 33, 33];
        this.normalArpAlt = [65, 69, 72, 69, 67, 71, 74, 71, 64, 67, 71, 67, 57, 60, 64, 60];
        
        this.isAlternatePhrase = false;
        this.phraseCounter = 0;
        this.targetNormalLoops = Math.floor(Math.random() * 9) + 8; // 8 - 16
        this.targetRareLoops = 4;   // Fixed 4 loops

        // Boss Pattern (Faster, more aggressive)
        this.bossBass = [36, 36, 36, 36, 39, 39, 38, 38, 36, 36, 36, 36, 33, 33, 35, 35];
        this.bossArp = [60, 60, 72, 72, 63, 63, 75, 75, 57, 57, 69, 69, 62, 62, 74, 74];

        this.isSystemError = false;
        this.isOverheating = false;
        this.overheatTimerID = null;
    }

    init() {
        if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12;
        limiter.attack.value = .003; limiter.release.value = .18;
        this.masterGain.connect(this.ctx.destination); limiter.connect(this.masterGain);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = .9;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -20; compressor.knee.value = 15; compressor.ratio.value = 4;
        compressor.attack.value = .003; compressor.release.value = .12;
        this.sfxGain.connect(compressor); compressor.connect(limiter);
    }

    soundTime(allowSystemError = false) {
        if (!this.ctx || this.isMuted || (!allowSystemError && this.isSystemError)) return null;
        return this.ctx.currentTime;
    }

    createNoiseBuffer(duration) {
        if (this.noiseBuffers.has(duration)) return this.noiseBuffers.get(duration);
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffers.set(duration, buffer);
        return buffer;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    setVolume(value) {
        this.masterVolume = clamp(value, 0, 1);
        if (this.masterGain && !this.isMuted) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        }
    }

    setMasterVolume(value) { this.setVolume(value); }

    setBossMode(enabled) {
        this.isBossMode = enabled;
        this.updateTempo();
    }

    setSystemError(enabled) {
        this.isSystemError = enabled;
        if (!enabled) {
            this.isOverheating = false;
            if (this.overheatTimerID) {
                clearTimeout(this.overheatTimerID);
                this.overheatTimerID = null;
            }
        }
    }

    stopBGM() {
        if (this.timerID) {
            clearTimeout(this.timerID);
            this.timerID = null;
        }
        this.isPlayingBGM = false;
        this.current16thNote = 0;
        this.nextNoteTime = 0;
        this.isAlternatePhrase = false;
        this.phraseCounter = 0;
    }

    triggerOverheatSequence() {
        if (this.isOverheating || this.isSystemError) return;
        this.isOverheating = true;

        this.overheatTimerID = setTimeout(() => {
            if (this.isOverheating) {
                this.setSystemError(true);
                this.playErrorBeep();
                const errorElement = document.getElementById('systemError');
                errorElement.style.display = 'block';

                setTimeout(() => {
                    errorElement.classList.add('steady');
                }, 3000);
            }
        }, 2000);
    }

    playErrorBeep() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(440, t + 0.2);
        osc.frequency.setValueAtTime(880, t + 0.4);
        osc.frequency.setValueAtTime(440, t + 0.6);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.8);

        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 0.8);
    }

    setWave(wave) {
        this.currentWave = clamp(wave, 1, 50);
        this.updateTempo();
    }

    updateTempo() {
        const effectiveWave = Math.min(this.currentWave || 1, 30);
        const waveProgress = effectiveWave / 30;
        const baseTempo = 110 + (waveProgress * 40);
        this.tempo = this.isBossMode ? baseTempo + 20 : baseTempo;
    }

    // Each voice has a soft attack, a body and a short tail; evolution adds harmonics.
    sfxVoice(t, duration, frequency, endFrequency, volume, type = 'sine', pan = 0, noise = false) {
        if (this.sfxVoices >= 48) return;
        const source = noise ? this.ctx.createBufferSource() : this.ctx.createOscillator();
        const gain = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
        filter.type = noise ? 'bandpass' : 'lowpass'; filter.Q.value = noise ? .7 : .5;
        filter.frequency.setValueAtTime(noise ? frequency : Math.min(16000, frequency * 6), t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, noise ? endFrequency : endFrequency * 8), t + duration);
        if (noise) source.buffer = this.createNoiseBuffer(.6);
        else { source.type = type; source.frequency.setValueAtTime(frequency,t); source.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),t+duration); }
        gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume * 3),t+.004);
        gain.gain.setValueAtTime(Math.max(.0002,volume * 3),t+.012);
        gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
        const panner = this.ctx.createStereoPanner(); panner.pan.value = pan;
        source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(this.sfxGain || this.masterGain);
        this.sfxVoices++;
        source.onended = () => { this.sfxVoices--; source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
        source.start(t); source.stop(t+duration+.005);
    }
    playClassicShoot() {
        const t = this.soundTime();
        if (t == null) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.type = 'triangle';
        // Add random pitch variation (detune) for natural feel
        const detune = 1.0 + (Math.random() * 0.1 - 0.05);
        osc.frequency.setValueAtTime((this.isBossMode ? 900 : 800) * detune, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 0.1);
    }
    playClassicShotgun() {
        const t = this.soundTime();
        if (t == null) return;
        // Burst noise/sawtooth for impact
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.type = 'sawtooth';
        
        const detune = 1.0 + (Math.random() * 0.2 - 0.1);
        osc.frequency.setValueAtTime(150 * detune, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 0.2);
    }
    playClassicBlade() {
        const t = this.soundTime();
        if (t == null) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.1);

        gain.gain.setValueAtTime(0.05, t); // Low volume (constant loop-like)
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 0.15);
    }
    playClassicRailgun() {
        const t = this.soundTime();
        if (t == null) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.2);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }
    playClassicWhip() {
        const t = this.soundTime();
        if (t == null) return;
        const buffer = this.createNoiseBuffer(0.1);

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2000, t);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        noise.start();
    }
    playClassicThunder() {
        const t = this.soundTime();
        if (t == null) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.3);

        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 0.3);

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.3);

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 500;
        noiseFilter.Q.value = 1;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.1, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start();
    }
    playClassicExplosion() {
        const t = this.soundTime();
        if (t == null) return;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.4);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.type = 'lowpass';
        
        const detune = 1.0 + (Math.random() * 0.2 - 0.1);
        filter.frequency.setValueAtTime(500 * detune, t);
        filter.frequency.linearRampToValueAtTime(10, t + 0.3);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        noise.start();
    }
    playWeapon(key, options = {}, phase = 'fire') {
        const evolved = options.evolved ?? (typeof runBuild === 'object' && !!runBuild.evolved[key]);
        if (!evolved) {
            const classic = { gun: 'Shoot', scatter: 'Shotgun', blade: 'Blade', laser: 'Railgun', whip: 'Whip', thunder: 'Thunder' }[key];
            if (classic) this['playClassic' + classic]();
            else if ((key === 'bomb' || key === 'mine') && phase === 'impact') this.playClassicExplosion();
            return;
        }
        const t = this.soundTime(); if (t == null) return;
        const profiles = {
            gun: [680,'triangle',.14,2600,.035], scatter: [155,'sawtooth',.22,1600,.09],
            whip: [330,'triangle',.16,3200,.08], blade: [260,'sine',.12,1900,.025],
            sanctuary: [175,'sine',.3,850,.018], laser: [920,'triangle',.24,4200,.045],
            bomb: [230,'triangle',.25,700,.07], thunder: [390,'sawtooth',.24,2300,.075],
            mine: [460,'sine',.12,1700,.025]
        };
        const p = profiles[key]; if (!p) return;
        const id=key+phase, gap=key==='blade'?.09:key==='sanctuary'?.24:.045;
        if (t-(this.sfxLast.get(id) ?? -Infinity)<gap || this.sfxVoices>40) return;
        this.sfxLast.set(id,t);
        const impact=phase==='impact', f=p[0]*(impact?.32:1), tail=impact?.4:p[2];
        this.sfxVoice(t,tail,f,f*.3,impact?.14:.07,p[1]);
        this.sfxVoice(t+.006,tail*.6,f*.5,Math.max(25,f*.2),impact?.12:.035,'sine');
        this.sfxVoice(t,tail*.7,p[3],impact?70:p[3]*.25,p[4], 'sine',0,true);
        if(evolved)this.sfxVoice(t+.012,tail*.8,f*1.5,f*.7,.024,'triangle',-.25);
        if(evolved)this.sfxVoice(t+.018,tail,f*2.01,f*.9,.019,'sine',.25);
        if(evolved)this.sfxVoice(t+.055,tail*.65,f*1.005,f*.5,.022,'triangle',.35);
    }
    playGrowth(key, evolved = false) {
        if (!evolved) return;
        const t=this.soundTime(true); if(t==null)return;
        const notes=[261.63,329.63,392,523.25,783.99];
        notes.forEach((f,i)=>{this.sfxVoice(t+i*.055,.28,f,f*1.003,.055,'sine',(i%2?1:-1)*.2);this.sfxVoice(t+i*.055,.18,f*2,f*2,.012,'triangle');});
        if(evolved)this.sfxVoice(t,.5,90,35,.1,'sine');
    }
    playShoot() { this.playWeapon('gun'); }
    playShotgun() { this.playWeapon('scatter'); }
    playBlade() { this.playWeapon('blade'); }
    playRailgun() { this.playWeapon('laser'); }
    playWhip() { this.playWeapon('whip'); }
    playThunder() { this.playWeapon('thunder'); }
    playExplosion() { this.playWeapon('bomb', {level:1,evolved:false}, 'impact'); }

    playBossSpawn() {
        const t = this.soundTime(true);
        if (t == null) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.linearRampToValueAtTime(50, t + 1.0);
        gain.gain.setValueAtTime(0.64, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 1.0);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 1.0);
    }

    playLevelUp() {
        const t = this.soundTime(true);
        if (t == null) return;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.1, t + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.2);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.2);
        });
    }

    playGem() {
        const t = this.soundTime(true);
        if (t == null) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, t);
        osc.frequency.linearRampToValueAtTime(2000, t + 0.05);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(t + 0.05);
    }

    playGlitch() {
        const t = this.soundTime(true);
        if (t == null) return;
        const osc = this.ctx.createOscillator();
        osc.type = Math.random() > 0.5 ? 'sawtooth' : 'square';
        osc.frequency.value = Math.random() * 500 + 50;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.05;
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(t); osc.stop(t + Math.random() * 0.1);
    }



    playGameOver() {
        const t = this.soundTime(true);
        if (t == null) return;

        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 1.5);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0, t + 1.5);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, t);
        filter.frequency.linearRampToValueAtTime(100, t + 1.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t); osc.stop(t + 1.5);
    }

    midiToFreq(note) { return 440 * Math.pow(2, (note - 69) / 12); }
    scheduleNote(beat, time) {
        if (beat % 4 === 0) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            gain.gain.setValueAtTime(this.isBossMode ? 0.7 : 0.6, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + 0.5);
        }
        if (this.isBossMode) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.createNoiseBuffer(0.05);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass'; filter.frequency.value = 8000;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.03, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

            noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            noise.start(time);
        }

        const bassLine = this.isBossMode ? this.bossBass : (this.isAlternatePhrase ? this.normalBassAlt : this.normalBass);
        const arpLine = this.isBossMode ? this.bossArp : (this.isAlternatePhrase ? this.normalArpAlt : this.normalArp);

        const bassNote = bassLine[beat % 16];
        if (bassNote) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            osc.type = 'sawtooth'; osc.frequency.value = this.midiToFreq(bassNote);
            filter.type = 'lowpass'; filter.frequency.setValueAtTime(this.isBossMode ? 500 : 300, time);
            filter.frequency.linearRampToValueAtTime(100, time + 0.2);
            gain.gain.setValueAtTime(0.2, time);
            gain.gain.linearRampToValueAtTime(0.01, time + 0.2);
            osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + 0.25);
        }
        const arpNote = arpLine[beat % 16];
        if (arpNote) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = this.midiToFreq(arpNote + 12);
            gain.gain.setValueAtTime(0.05, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + 0.3);
        }
    }
    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.scheduleNote(this.current16thNote, this.nextNoteTime);
            this.nextNoteTime += 0.25 * (60.0 / this.tempo);
            this.current16thNote = (this.current16thNote + 1) % 16;
            
            // Handle Phrase Loop Logic
            if (this.current16thNote === 0) {
                this.phraseCounter++;
                
                if (!this.isBossMode) {
                    if (!this.isAlternatePhrase) {
                        // Current: Normal phrase
                        if (this.phraseCounter >= this.targetNormalLoops) {
                            this.isAlternatePhrase = true;
                            this.phraseCounter = 0;
                            this.targetRareLoops = 4; // Fixed 4 loops
                        }
                    } else {
                        // Current: Rare phrase
                        if (this.phraseCounter >= this.targetRareLoops) {
                            this.isAlternatePhrase = false;
                            this.phraseCounter = 0;
                            this.targetNormalLoops = Math.floor(Math.random() * 9) + 8; // 8 - 16
                        }
                    }
                } else {
                    this.isAlternatePhrase = false;
                    this.phraseCounter = 0;
                }
            }
        }
        this.timerID = window.setTimeout(() => this.scheduler(), 25);
    }
    startBGM() {
        if (!this.ctx || this.isPlayingBGM) return;
        this.isPlayingBGM = true;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.scheduler();
    }
}

