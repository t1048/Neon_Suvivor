// --- Audio.js ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
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
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.ctx.destination);
    }

    soundTime(allowSystemError = false) {
        if (!this.ctx || this.isMuted || (!allowSystemError && this.isSystemError)) return null;
        return this.ctx.currentTime;
    }

    createNoiseBuffer(duration) {
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
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

    playShoot() {
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

    playShotgun() {
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

    playBlade() {
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

    playRailgun() {
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

    playWhip() {
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

    playThunder() {
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

    playExplosion() {
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

