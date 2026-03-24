import { SongData, Percussion, ChannelConfig, ReverbConfig } from './types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  
  // Reverb nodes
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private currentReverbConfig: string = '';

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
        
        // Initialize reverb nodes
        this.reverbNode = this.ctx.createConvolver();
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0; // Default off
        this.reverbNode.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);
      } catch (e) {
        console.error("AudioContext initialization failed", e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(e => console.error("Failed to resume AudioContext", e));
    }
  }

  // Generate a simple impulse response for reverb
  private generateImpulseResponse(type: 'amiga_delay' | 'hall' | 'room', delaySteps: number) {
    if (!this.ctx) return null;
    
    let duration = 1.0;
    let decay = 2.0;
    
    if (type === 'room') {
      duration = 0.5;
      decay = 4.0;
    } else if (type === 'hall') {
      duration = 2.5;
      decay = 1.5;
    } else if (type === 'amiga_delay') {
      // Amiga style delay is usually discrete echoes, but we'll approximate with a specific IR
      duration = (delaySteps * 0.1) || 0.3;
      decay = 3.0;
    }
    
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
      const n = i;
      // Exponential decay
      const e = Math.exp(-n / (sampleRate * duration) * decay);
      
      if (type === 'amiga_delay') {
        // Create discrete echoes for amiga style
        const stepSamples = (delaySteps * 0.1 * sampleRate) || (0.1 * sampleRate);
        if (i % Math.floor(stepSamples) < 100) {
           left[i] = (Math.random() * 2 - 1) * e;
           right[i] = (Math.random() * 2 - 1) * e;
        } else {
           left[i] = 0;
           right[i] = 0;
        }
      } else {
        // Standard noise-based IR for room/hall
        left[i] = (Math.random() * 2 - 1) * e;
        right[i] = (Math.random() * 2 - 1) * e;
      }
    }
    return impulse;
  }

  public setReverb(config?: ReverbConfig) {
    this.initContext();
    if (!this.ctx || !this.reverbNode || !this.reverbGain) return;

    if (!config) {
      this.reverbGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    const configStr = JSON.stringify(config);
    if (this.currentReverbConfig !== configStr) {
      this.currentReverbConfig = configStr;
      const ir = this.generateImpulseResponse(config.type, config.delay_steps || 3);
      if (ir) {
        this.reverbNode.buffer = ir;
      }
    }

    const wetVolume = config.wet_volume !== undefined ? config.wet_volume : 0.2;
    this.reverbGain.gain.setTargetAtTime(wetVolume, this.ctx.currentTime, 0.05);
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
    volumeScale: number = 1,
    effects?: {
      portamento?: { targetFreq: number, durationMs: number },
      filterSweep?: { type: BiquadFilterType, startHz: number, endHz: number, sweepStartTime: number, sweepEndTime: number }
    }
  ) {
    this.initContext();
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    
    // Panning
    let panner: StereoPannerNode | null = null;
    if (config.panning !== undefined && config.panning !== 0) {
      panner = ctx.createStereoPanner();
      panner.pan.value = config.panning;
      panner.connect(this.masterGain!);
      gain.connect(panner);
    } else {
      gain.connect(this.masterGain!);
    }

    const actualFreq = freq * (config.octave_multiplier || 1);
    const env = config.envelope;
    const durationSec = durationMs / 1000;
    
    // Ensure attack is at least 1ms to prevent instant jump errors
    const attack = Math.max((env.attack_ms || 1) / 1000, 0.001);
    // Ensure release is at least 1ms
    const release = Math.max((env.release_at || 0.1) * durationSec, 0.001);
    const sustainLevel = env.sustain_level ?? 0.5;
    const totalVolume = Math.max(config.volume * volumeScale, 0);

    // Calculate strict strictly increasing times
    const attackTime = startTime + attack;
    const releaseStartTime = Math.max(attackTime, startTime + durationSec - release);
    const endTime = Math.max(releaseStartTime, startTime + durationSec);

    // Envelope
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(totalVolume, attackTime);
    
    // Decay to sustain level
    const decay = env.decay_ratio ? env.decay_ratio * durationSec : 0.1;
    const decayTime = Math.min(attackTime + decay, releaseStartTime);
    gain.gain.linearRampToValueAtTime(totalVolume * sustainLevel, decayTime);
    
    // Hold sustain level until release
    gain.gain.setValueAtTime(totalVolume * sustainLevel, releaseStartTime);
    gain.gain.linearRampToValueAtTime(0, endTime);

    if (this.reverbNode) {
      gain.connect(this.reverbNode);
    }

    // Filter Sweep
    let filterNode: BiquadFilterNode | null = null;
    if (effects?.filterSweep) {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = effects.filterSweep.type;
      
      // Calculate frequency at the start and end of this specific note
      const sweepDur = effects.filterSweep.sweepEndTime - effects.filterSweep.sweepStartTime;
      const startRatio = Math.max(0, Math.min(1, (startTime - effects.filterSweep.sweepStartTime) / sweepDur));
      const endRatio = Math.max(0, Math.min(1, (endTime - effects.filterSweep.sweepStartTime) / sweepDur));
      
      const freqStart = effects.filterSweep.startHz + (effects.filterSweep.endHz - effects.filterSweep.startHz) * startRatio;
      const freqEnd = effects.filterSweep.startHz + (effects.filterSweep.endHz - effects.filterSweep.startHz) * endRatio;
      
      filterNode.frequency.setValueAtTime(freqStart, startTime);
      filterNode.frequency.linearRampToValueAtTime(freqEnd, endTime);
      
      filterNode.connect(gain);
    }

    if (config.type === 'noise') {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      if (filterNode) {
        source.connect(filterNode);
      } else {
        source.connect(gain);
      }
      source.start(startTime);
      source.stop(endTime);
    } else {
      const osc = ctx.createOscillator();
      osc.type = config.type as OscillatorType;
      
      if (config.fast_arp_intervals && config.fast_arp_intervals.length > 0) {
        const arpSpeedSec = 0.05; // 50ms
        const numNotes = Math.ceil(durationSec / arpSpeedSec);
        for (let i = 0; i < numNotes; i++) {
          const interval = config.fast_arp_intervals[i % config.fast_arp_intervals.length];
          const arpFreq = actualFreq * Math.pow(2, interval / 12);
          osc.frequency.setValueAtTime(arpFreq, startTime + i * arpSpeedSec);
        }
      } else if (effects?.portamento) {
        osc.frequency.setValueAtTime(actualFreq, startTime);
        const targetFreq = effects.portamento.targetFreq * (config.octave_multiplier || 1);
        osc.frequency.exponentialRampToValueAtTime(targetFreq, startTime + effects.portamento.durationMs / 1000);
      } else {
        osc.frequency.setValueAtTime(actualFreq, startTime);
      }

      if (filterNode) {
        osc.connect(filterNode);
      } else {
        osc.connect(gain);
      }
      osc.start(startTime);
      osc.stop(endTime);
    }
  }

  public playPercussion(
    perc: Percussion,
    startTime: number,
    song: SongData,
    volumeScale: number = 1,
    panning?: number
  ) {
    this.initContext();
    const ctx = this.ctx!;

    if (perc.play) {
      perc.play.forEach(pKey => {
        const p = song.perc_types[pKey];
        if (p) this.playPercussion(p, startTime, song, volumeScale, panning);
      });
      return;
    }

    const gain = ctx.createGain();
    
    let panner: StereoPannerNode | null = null;
    if (panning !== undefined && panning !== 0) {
      panner = ctx.createStereoPanner();
      panner.pan.value = panning;
      panner.connect(this.masterGain!);
      gain.connect(panner);
    } else {
      gain.connect(this.masterGain!);
    }

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
    
    if (this.reverbNode) {
      gain.connect(this.reverbNode);
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
