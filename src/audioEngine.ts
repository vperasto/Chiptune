import { SongData, Percussion, ChannelConfig } from './types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // Context is initialized on first user interaction
  }

  private initContext() {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.noiseBuffer = this.createNoiseBuffer();
      } catch (e) {
        console.error("AudioContext initialization failed", e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(e => console.error("Failed to resume AudioContext", e));
    }
  }

  public get state() {
    return this.ctx?.state || 'uninitialized';
  }

  private createNoiseBuffer(): AudioBuffer {
    const bufferSize = 2 * this.ctx!.sampleRate;
    const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playNote(
    freq: number,
    config: ChannelConfig,
    startTime: number,
    durationMs: number,
    volumeScale: number = 1
  ) {
    this.initContext();
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.connect(this.masterGain!);

    const actualFreq = freq * (config.octave_multiplier || 1);
    const env = config.envelope;
    const attack = env.attack_ms / 1000;
    const release = (env.release_at || 0.1) * (durationMs / 1000);
    const sustainLevel = env.sustain_level ?? 0.5;
    const totalVolume = config.volume * volumeScale;

    // Envelope
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(totalVolume, startTime + attack);
    gain.gain.setValueAtTime(totalVolume * sustainLevel, startTime + (durationMs / 1000) - release);
    gain.gain.linearRampToValueAtTime(0, startTime + (durationMs / 1000));

    if (config.type === 'noise') {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      source.connect(gain);
      source.start(startTime);
      source.stop(startTime + (durationMs / 1000));
    } else {
      const osc = ctx.createOscillator();
      osc.type = config.type as OscillatorType;
      osc.frequency.setValueAtTime(actualFreq, startTime);
      osc.connect(gain);
      osc.start(startTime);
      osc.stop(startTime + (durationMs / 1000));
    }
  }

  public playPercussion(
    perc: Percussion,
    startTime: number,
    song: SongData,
    volumeScale: number = 1
  ) {
    this.initContext();
    const ctx = this.ctx!;

    if (perc.play) {
      perc.play.forEach(pKey => {
        const p = song.perc_types[pKey];
        if (p) this.playPercussion(p, startTime, song, volumeScale);
      });
      return;
    }

    const gain = ctx.createGain();
    gain.connect(this.masterGain!);

    const duration = (perc.duration_ms || 100) / 1000;
    const vol = (perc.volume || 0.5) * volumeScale;

    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    let source: AudioNode;
    if (perc.type === 'sine' || perc.type === 'square' || perc.type === 'triangle' || perc.type === 'sawtooth') {
      const osc = ctx.createOscillator();
      osc.type = perc.type as OscillatorType;
      osc.frequency.setValueAtTime(perc.frequency_hz || 60, startTime);
      osc.frequency.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
      source = osc;
    } else {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.start(startTime);
      noise.stop(startTime + duration);
      source = noise;
    }

    if (perc.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = perc.filter;
      filter.frequency.setValueAtTime(perc.filter_hz || 1000, startTime);
      filter.Q.setValueAtTime(perc.filter_q || 1, startTime);
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
  }

  public get currentTime() {
    return this.ctx?.currentTime || 0;
  }

  public resume() {
    this.initContext();
  }
}

export const audioEngine = new AudioEngine();
