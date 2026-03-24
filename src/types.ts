import { GoogleGenAI } from "@google/genai";

export interface Envelope {
  attack_ms: number;
  decay_ratio?: number;
  sustain_level?: number;
  sustain_until?: number;
  release_at?: number;
}

export interface ChannelConfig {
  type: 'square' | 'triangle' | 'sawtooth' | 'noise' | 'sine';
  octave_multiplier?: number;
  volume: number;
  panning?: number;
  fast_arp_intervals?: number[];
  envelope: Envelope;
  note_duration_steps?: number;
  note?: string;
}

export interface Percussion {
  type?: 'sine' | 'noise' | 'square' | 'triangle' | 'sawtooth';
  frequency_hz?: number;
  volume?: number;
  duration_ms?: number;
  filter?: 'lowpass' | 'bandpass' | 'highpass';
  filter_hz?: number;
  filter_q?: number;
  play?: string[];
}

export interface ReverbConfig {
  type: 'amiga_delay' | 'hall' | 'room';
  delay_steps?: number;
  wet_volume?: number;
}

export interface SectionEffect {
  row_start: number;
  row_end?: number;
  channel: string;
  effect: 'filter_sweep' | 'portamento';
  type?: 'lowpass' | 'highpass' | 'bandpass';
  start_hz?: number;
  end_hz?: number;
  target_note?: string;
  duration_steps?: number;
}

export interface Section {
  id: string;
  label: string;
  volume_scale: number;
  type: string;
  note?: string;
  tempo?: number;
  reference_id?: string;
  channel_overrides?: Record<string, any>;
  reverb_override?: ReverbConfig;
  section_effects?: SectionEffect[];
  rows: string[][];
}

export interface SongData {
  name: string;
  tempo: number;
  step_duration_ms: number;
  loop: boolean;
  info: string;
  channels: Record<string, ChannelConfig>;
  reverb?: ReverbConfig;
  perc_types: Record<string, Percussion>;
  note_frequencies_hz: Record<string, number>;
  scale?: { name: string; notes: string[] };
  section_types?: Record<string, string>;
  sections: Section[];
}

export function validateAndFillSong(parsed: any): SongData {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error("Invalid JSON: Not an object");
  }

  const defaultSong = PHANTOM_CIRCUIT;

  // Basic fields
  const name = typeof parsed.name === 'string' ? parsed.name : "Untitled Song";
  const tempo = typeof parsed.tempo === 'number' ? parsed.tempo : 120;
  const step_duration_ms = typeof parsed.step_duration_ms === 'number' ? parsed.step_duration_ms : Math.round(60000 / tempo / 4);
  const loop = typeof parsed.loop === 'boolean' ? parsed.loop : true;
  const info = typeof parsed.info === 'string' ? parsed.info : "";

  // Channels
  const channels: Record<string, ChannelConfig> = {};
  if (parsed.channels && typeof parsed.channels === 'object') {
    for (const [key, val] of Object.entries(parsed.channels)) {
      const v = val as any;
      if (!v || typeof v !== 'object') continue;
      channels[key] = {
        type: ['square', 'triangle', 'sawtooth', 'noise', 'sine'].includes(v.type) ? v.type : 'square',
        octave_multiplier: typeof v.octave_multiplier === 'number' ? v.octave_multiplier : 1.0,
        volume: typeof v.volume === 'number' ? v.volume : 0.5,
        panning: typeof v.panning === 'number' ? v.panning : undefined,
        fast_arp_intervals: Array.isArray(v.fast_arp_intervals) ? v.fast_arp_intervals.filter((i: any) => typeof i === 'number') : undefined,
        envelope: {
          attack_ms: typeof v.envelope?.attack_ms === 'number' ? v.envelope.attack_ms : 5,
          decay_ratio: typeof v.envelope?.decay_ratio === 'number' ? v.envelope.decay_ratio : undefined,
          sustain_level: typeof v.envelope?.sustain_level === 'number' ? v.envelope.sustain_level : undefined,
          sustain_until: typeof v.envelope?.sustain_until === 'number' ? v.envelope.sustain_until : undefined,
          release_at: typeof v.envelope?.release_at === 'number' ? v.envelope.release_at : 0.5,
        },
        note_duration_steps: typeof v.note_duration_steps === 'number' ? v.note_duration_steps : undefined,
        note: typeof v.note === 'string' ? v.note : undefined,
      };
    }
  }
  if (Object.keys(channels).length === 0) {
    Object.assign(channels, defaultSong.channels);
  }

  // Reverb
  let reverb: ReverbConfig | undefined = undefined;
  if (parsed.reverb && typeof parsed.reverb === 'object') {
    reverb = {
      type: ['amiga_delay', 'hall', 'room'].includes(parsed.reverb.type) ? parsed.reverb.type : 'amiga_delay',
      delay_steps: typeof parsed.reverb.delay_steps === 'number' ? parsed.reverb.delay_steps : undefined,
      wet_volume: typeof parsed.reverb.wet_volume === 'number' ? parsed.reverb.wet_volume : undefined,
    };
  }

  // Percussions
  const perc_types: Record<string, Percussion> = {};
  const sourcePercs = parsed.perc_types || parsed.perc || {};
  if (typeof sourcePercs === 'object') {
    for (const [key, val] of Object.entries(sourcePercs)) {
      const v = val as any;
      if (!v || typeof v !== 'object') continue;
      
      if (Object.keys(v).length === 0 && key !== '-') {
        if (key === 'K') {
          perc_types[key] = { type: 'sine', frequency_hz: 60, volume: 0.8, duration_ms: 150 };
        } else if (key === 'H') {
          perc_types[key] = { type: 'noise', filter: 'highpass', filter_hz: 7000, volume: 0.1, duration_ms: 50 };
        } else if (key === 'S') {
          perc_types[key] = { type: 'noise', filter: 'bandpass', filter_hz: 1500, volume: 0.3, duration_ms: 100 };
        } else {
          perc_types[key] = {};
        }
      } else {
        perc_types[key] = {
          type: ['sine', 'noise', 'square', 'triangle', 'sawtooth'].includes(v.type) ? v.type : undefined,
          frequency_hz: typeof v.frequency_hz === 'number' ? v.frequency_hz : undefined,
          volume: typeof v.volume === 'number' ? v.volume : undefined,
          duration_ms: typeof v.duration_ms === 'number' ? v.duration_ms : undefined,
          filter: ['lowpass', 'bandpass', 'highpass'].includes(v.filter) ? v.filter : undefined,
          filter_hz: typeof v.filter_hz === 'number' ? v.filter_hz : undefined,
          filter_q: typeof v.filter_q === 'number' ? v.filter_q : undefined,
          play: Array.isArray(v.play) ? v.play.filter((p: any) => typeof p === 'string') : undefined,
        };
      }
    }
  }
  if (Object.keys(perc_types).length === 0) {
    Object.assign(perc_types, defaultSong.perc_types);
  }

  // Note frequencies
  let note_frequencies_hz = { ...defaultSong.note_frequencies_hz };
  if (parsed.note_frequencies_hz && typeof parsed.note_frequencies_hz === 'object') {
    for (const [key, val] of Object.entries(parsed.note_frequencies_hz)) {
      if (typeof val === 'number') {
        note_frequencies_hz[key] = val;
      }
    }
  }
  
  const sharps: Record<string, string> = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
  Object.entries(sharps).forEach(([sharp, flat]) => {
    if (!note_frequencies_hz[sharp] && note_frequencies_hz[flat]) note_frequencies_hz[sharp] = note_frequencies_hz[flat];
    if (!note_frequencies_hz[flat] && note_frequencies_hz[sharp]) note_frequencies_hz[flat] = note_frequencies_hz[sharp];
  });

  // Sections
  let sections: Section[] = [];
  if (Array.isArray(parsed.sections)) {
    sections = parsed.sections.map((s: any, idx: number) => {
      if (!s || typeof s !== 'object') {
        return { 
          id: Math.random().toString(36).substring(2, 9),
          label: `Section ${idx + 1}`, 
          volume_scale: 1.0, 
          type: 'normal', 
          rows: [["-", "-", "-", "-"]] 
        };
      }
      return {
        id: typeof s.id === 'string' ? s.id : Math.random().toString(36).substring(2, 9),
        label: typeof s.label === 'string' ? s.label : `Section ${idx + 1}`,
        volume_scale: typeof s.volume_scale === 'number' ? s.volume_scale : 1.0,
        type: typeof s.type === 'string' ? s.type : 'normal',
        note: typeof s.note === 'string' ? s.note : undefined,
        tempo: typeof s.tempo === 'number' ? s.tempo : undefined,
        reference_id: typeof s.reference_id === 'string' ? s.reference_id : undefined,
        channel_overrides: s.channel_overrides && typeof s.channel_overrides === 'object' ? s.channel_overrides : undefined,
        reverb_override: s.reverb_override && typeof s.reverb_override === 'object' ? {
          type: ['amiga_delay', 'hall', 'room'].includes(s.reverb_override.type) ? s.reverb_override.type : 'amiga_delay',
          delay_steps: typeof s.reverb_override.delay_steps === 'number' ? s.reverb_override.delay_steps : undefined,
          wet_volume: typeof s.reverb_override.wet_volume === 'number' ? s.reverb_override.wet_volume : undefined,
        } : undefined,
        section_effects: Array.isArray(s.section_effects) ? s.section_effects.map((e: any) => ({
          row_start: typeof e.row_start === 'number' ? e.row_start : 0,
          row_end: typeof e.row_end === 'number' ? e.row_end : undefined,
          channel: typeof e.channel === 'string' ? e.channel : 'lead',
          effect: ['filter_sweep', 'portamento'].includes(e.effect) ? e.effect : 'filter_sweep',
          type: ['lowpass', 'highpass', 'bandpass'].includes(e.type) ? e.type : undefined,
          start_hz: typeof e.start_hz === 'number' ? e.start_hz : undefined,
          end_hz: typeof e.end_hz === 'number' ? e.end_hz : undefined,
          target_note: typeof e.target_note === 'string' ? e.target_note : undefined,
          duration_steps: typeof e.duration_steps === 'number' ? e.duration_steps : undefined,
        })) : undefined,
        rows: Array.isArray(s.rows) 
          ? s.rows.map((r: any) => Array.isArray(r) ? r.map((c: any) => typeof c === 'string' ? c : "-") : ["-", "-", "-", "-"])
          : [["-", "-", "-", "-"]]
      };
    });
  }
  if (sections.length === 0) {
    sections = [{
      id: Math.random().toString(36).substring(2, 9),
      label: "Intro",
      volume_scale: 1.0,
      type: "normal",
      rows: Array(16).fill(["-", "-", "-", "-"])
    }];
  }

  return {
    name,
    tempo,
    step_duration_ms,
    loop,
    info,
    channels,
    reverb,
    perc_types,
    note_frequencies_hz,
    scale: parsed.scale && typeof parsed.scale === 'object' ? parsed.scale : undefined,
    section_types: parsed.section_types && typeof parsed.section_types === 'object' ? parsed.section_types : undefined,
    sections
  };
}

export const PHANTOM_CIRCUIT: SongData = {
  "name": "Titanium Pirouette (Dynamic Delay Variant)",
  "tempo": 130,
  "step_duration_ms": 110,
  "loop": true,
  "info": "6/8 tahtilaji. Sisältää 'reverb_override' -logiikan: Kaiku muuttuu osioiden välillä.",
  "channels": {
    "lead": { "type": "square", "octave_multiplier": 1, "volume": 0.35, "envelope": { "attack_ms": 5, "decay_ratio": 0.2, "sustain_level": 0.4, "release_at": 0.8 }, "note_duration_steps": 2, "panning": 0.0 },
    "bass": { "type": "triangle", "octave_multiplier": 0.5, "volume": 0.75, "envelope": { "attack_ms": 5, "sustain_until": 0.4, "release_at": 0.9 }, "note_duration_steps": 2, "panning": 0.0 },
    "arp": { "type": "square", "octave_multiplier": 1, "volume": 0.2, "envelope": { "attack_ms": 2, "decay_ratio": 0.1, "sustain_level": 0.2, "release_at": 0.4 }, "note_duration_steps": 1, "panning": 0.4, "fast_arp_intervals": [0, 3, 7] },
    "percussion": { "type": "noise", "volume": 0.3, "envelope": { "attack_ms": 1, "release_at": 0.2 }, "panning": -0.2 }
  },
  "reverb": {
    "type": "hall",
    "delay_steps": 3,
    "wet_volume": 0.2
  },
  "perc_types": {
    "K": { "type": "sine", "frequency_hz": 45, "volume": 1.0, "duration_ms": 110 },
    "S": { "filter": "bandpass", "filter_hz": 1800, "filter_q": 0.6, "volume": 0.55, "duration_ms": 60 },
    "H": { "filter": "highpass", "filter_hz": 9000, "filter_q": 1.0, "volume": 0.15, "duration_ms": 30 },
    "-": {}
  },
  "note_frequencies_hz": {
    "E1": 41.20, "A1": 55.00, "B1": 61.74, 
    "D#2": 77.78, "E2": 82.41, 
    "C4": 261.63, "D#4": 311.13, "E4": 329.63, "F#4": 369.99, "G4": 392.00, "A4": 440.00, "B4": 493.88, 
    "C5": 523.25, "D5": 587.33, "D#5": 622.25, "E5": 659.25, "F#5": 739.99, "G5": 783.99, "A5": 880.00, "B5": 987.77,
    "C6": 1046.50, "D6": 1174.66, "D#6": 1244.51, "E6": 1318.51, "F#6": 1479.98, "G6": 1567.98, "A6": 1760.00
  },
  "sections": [
    {
      "id": "sec_1",
      "label": "Intro_DoubleKick_68_Em",
      "volume_scale": 0.8,
      "type": "normal",
      "reverb_override": {
        "type": "amiga_delay",
        "delay_steps": 2,
        "wet_volume": 0.05
      },
      "rows": [
        ["-", "E2", "-", "K"], ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["-", "E2", "-", "K"], ["-", "-", "-", "-"], ["-", "E2", "G4", "K"], ["-", "-", "-", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "-"],
        ["-", "E2", "-", "K"], ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "E2", "B4", "K"], ["-", "-", "E5", "S"], ["-", "E2", "G5", "K"], ["-", "-", "B5", "S"]
      ]
    },
    {
      "id": "sec_2",
      "label": "Intro_DoubleKick_68_Am",
      "volume_scale": 0.8,
      "type": "normal",
      "rows": [
        ["-", "A1", "-", "K"], ["-", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["-", "A1", "-", "K"], ["-", "-", "-", "-"], ["-", "A1", "A4", "K"], ["-", "-", "-", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "-"],
        ["-", "A1", "-", "K"], ["-", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["-", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "A1", "C5", "K"], ["-", "-", "E5", "S"], ["-", "A1", "A5", "K"], ["-", "-", "C6", "S"]
      ]
    },
    {
      "id": "sec_3",
      "label": "Intro_DoubleKick_68_D_sharp_dim",
      "volume_scale": 0.8,
      "type": "normal",
      "rows": [
        ["-", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["-", "D#2", "-", "K"], ["-", "-", "-", "-"], ["-", "D#2", "A4", "K"], ["-", "-", "-", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "-"],
        ["-", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["-", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "D#2", "C5", "K"], ["-", "-", "F#5", "S"], ["-", "D#2", "A5", "K"], ["-", "-", "C6", "S"]
      ]
    },
    {
      "id": "sec_4",
      "label": "Intro_DoubleKick_68_B",
      "volume_scale": 0.8,
      "type": "normal",
      "rows": [
        ["-", "B1", "-", "K"], ["-", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "-", "B4", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["-", "B1", "-", "K"], ["-", "-", "-", "-"], ["-", "B1", "F#4", "K"], ["-", "-", "-", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "-"],
        ["-", "B1", "-", "K"], ["-", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "-", "B4", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["-", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "B1", "B4", "K"], ["-", "-", "D#5", "S"], ["-", "B1", "F#5", "K"], ["-", "-", "B5", "S"]
      ]
    },
    {
      "id": "sec_5",
      "label": "Theme_Heavy_68_Em",
      "volume_scale": 0.95,
      "type": "normal",
      "rows": [
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["B4", "E2", "-", "K"], ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["G4", "E2", "-", "K"], ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["B4", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_6",
      "label": "Theme_Heavy_68_Am",
      "volume_scale": 0.95,
      "type": "normal",
      "rows": [
        ["C5", "A1", "-", "K"], ["-", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["A4", "A1", "-", "K"], ["-", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E4", "A1", "-", "K"], ["-", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C5", "A1", "-", "K"], ["A4", "A1", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_7",
      "label": "Theme_Heavy_68_D_sharp_dim",
      "volume_scale": 0.95,
      "type": "normal",
      "rows": [
        ["F#5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["D#5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A4", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["F#5", "D#2", "-", "K"], ["D#5", "D#2", "-", "K"], ["-", "-", "A4", "S"], ["-", "-", "C5", "S"], ["-", "-", "F#5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_8",
      "label": "Theme_Heavy_68_B",
      "volume_scale": 0.95,
      "type": "normal",
      "rows": [
        ["B4", "B1", "-", "K"], ["-", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "-", "B4", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["F#4", "B1", "-", "K"], ["-", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "-", "B4", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["D#4", "B1", "-", "K"], ["-", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "-", "B4", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B4", "B1", "-", "K"], ["F#4", "B1", "-", "K"], ["-", "-", "F#4", "S"], ["-", "-", "B4", "S"], ["-", "-", "D#5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_9",
      "label": "Anticlimax_68_Em",
      "volume_scale": 1.1,
      "type": "normal",
      "section_effects": [
        { "row_start": 0, "row_end": 23, "channel": "lead", "effect": "portamento", "target_note": "E6", "duration_steps": 24 }
      ],
      "rows": [
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_10",
      "label": "Anticlimax_68_Am",
      "volume_scale": 1.1,
      "type": "normal",
      "rows": [
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_11",
      "label": "Anticlimax_68_D_sharp_dim",
      "volume_scale": 1.1,
      "type": "normal",
      "rows": [
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_12",
      "label": "Anticlimax_68_B",
      "volume_scale": 1.1,
      "type": "normal",
      "rows": [
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_13",
      "label": "True_Climax_68_Em",
      "volume_scale": 1.35,
      "type": "normal",
      "channel_overrides": {
        "lead": { "type": "sawtooth", "octave_multiplier": 1, "volume": 0.45, "envelope": { "attack_ms": 2, "decay_ratio": 0.4, "sustain_level": 0.6, "release_at": 0.8 }, "note_duration_steps": 2 }
      },
      "reverb_override": {
        "type": "hall",
        "delay_steps": 4,
        "wet_volume": 0.4
      },
      "section_effects": [
        { "row_start": 0, "row_end": 23, "channel": "lead", "effect": "filter_sweep", "type": "lowpass", "start_hz": 200, "end_hz": 4000 }
      ],
      "note": "Instrument Swap: Lead-kanava muuttuu repiväksi saha-aalloksi (sawtooth).",
      "rows": [
        ["E5", "E2", "-", "K"], ["G5", "E2", "-", "K"], ["B5", "-", "G4", "S"], ["E6", "-", "B4", "S"], ["B5", "-", "E5", "S"], ["G5", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["G5", "E2", "-", "K"], ["B5", "-", "G4", "S"], ["E6", "-", "B4", "S"], ["B5", "-", "E5", "S"], ["G5", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["F#5", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["A5", "-", "B4", "S"], ["G5", "-", "E5", "S"], ["F#5", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["F#5", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["A5", "-", "B4", "S"], ["G5", "-", "E5", "S"], ["F#5", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_14",
      "label": "True_Climax_68_Am",
      "volume_scale": 1.35,
      "type": "normal",
      "channel_overrides": {
        "lead": { "type": "sawtooth", "octave_multiplier": 1, "volume": 0.45, "envelope": { "attack_ms": 2, "decay_ratio": 0.4, "sustain_level": 0.6, "release_at": 0.8 }, "note_duration_steps": 2 }
      },
      "section_effects": [
        { "row_start": 0, "row_end": 23, "channel": "lead", "effect": "filter_sweep", "type": "lowpass", "start_hz": 4000, "end_hz": 200 }
      ],
      "rows": [
        ["A5", "A1", "-", "K"], ["C6", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["A6", "-", "C5", "S"], ["E6", "-", "E5", "S"], ["C6", "-", "-", "H"],
        ["A5", "A1", "-", "K"], ["C6", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["A6", "-", "C5", "S"], ["E6", "-", "E5", "S"], ["C6", "-", "-", "H"],
        ["A5", "A1", "-", "K"], ["B5", "A1", "-", "K"], ["C6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["B5", "-", "-", "H"],
        ["A5", "A1", "-", "K"], ["B5", "A1", "-", "K"], ["C6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["B5", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_15",
      "label": "True_Climax_68_D_sharp_dim",
      "volume_scale": 1.35,
      "type": "normal",
      "channel_overrides": {
        "lead": { "type": "sawtooth", "octave_multiplier": 1, "volume": 0.45, "envelope": { "attack_ms": 2, "decay_ratio": 0.4, "sustain_level": 0.6, "release_at": 0.8 }, "note_duration_steps": 2 }
      },
      "section_effects": [
        { "row_start": 0, "row_end": 23, "channel": "lead", "effect": "filter_sweep", "type": "lowpass", "start_hz": 200, "end_hz": 4000 }
      ],
      "rows": [
        ["F#5", "D#2", "-", "K"], ["A5", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["D#6", "-", "C5", "S"], ["C6", "-", "F#5", "S"], ["A5", "-", "-", "H"],
        ["F#5", "D#2", "-", "K"], ["A5", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["D#6", "-", "C5", "S"], ["C6", "-", "F#5", "S"], ["A5", "-", "-", "H"],
        ["F#5", "D#2", "-", "K"], ["G5", "D#2", "-", "K"], ["A5", "-", "A4", "S"], ["C6", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["G5", "-", "-", "H"],
        ["F#5", "D#2", "-", "K"], ["G5", "D#2", "-", "K"], ["A5", "-", "A4", "S"], ["C6", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["G5", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_16",
      "label": "True_Climax_68_B",
      "volume_scale": 1.35,
      "type": "normal",
      "channel_overrides": {
        "lead": { "type": "sawtooth", "octave_multiplier": 1, "volume": 0.45, "envelope": { "attack_ms": 2, "decay_ratio": 0.4, "sustain_level": 0.6, "release_at": 0.8 }, "note_duration_steps": 2 }
      },
      "section_effects": [
        { "row_start": 0, "row_end": 23, "channel": "lead", "effect": "filter_sweep", "type": "lowpass", "start_hz": 4000, "end_hz": 200 }
      ],
      "rows": [
        ["D#5", "B1", "-", "K"], ["F#5", "B1", "-", "K"], ["B5", "-", "F#4", "S"], ["D#6", "-", "B4", "S"], ["B5", "-", "D#5", "S"], ["F#5", "-", "-", "H"],
        ["D#5", "B1", "-", "K"], ["F#5", "B1", "-", "K"], ["B5", "-", "F#4", "S"], ["D#6", "-", "B4", "S"], ["B5", "-", "D#5", "S"], ["F#5", "-", "-", "H"],
        ["D#5", "B1", "-", "K"], ["E5", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["A5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["E5", "-", "-", "H"],
        ["D#5", "B1", "-", "K"], ["E5", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["A5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["E5", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_17",
      "label": "Anticlimax_Return_68_Em",
      "volume_scale": 1.1,
      "type": "normal",
      "note": "Instrument Swap: Paluu normaaliin neliöaalto-leadiin tapahtuu automaattisesti, koska override puuttuu.",
      "rows": [
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["E5", "E2", "-", "K"], ["-", "E2", "-", "K"], ["G5", "-", "G4", "S"], ["F#5", "-", "B4", "S"], ["E5", "-", "E5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_18",
      "label": "Anticlimax_Return_68_Am",
      "volume_scale": 1.1,
      "type": "normal",
      "rows": [
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["C6", "A1", "-", "K"], ["-", "A1", "-", "K"], ["E6", "-", "A4", "S"], ["D6", "-", "C5", "S"], ["C6", "-", "E5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_19",
      "label": "Anticlimax_Return_68_D_sharp_dim",
      "volume_scale": 1.1,
      "type": "normal",
      "rows": [
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"],
        ["A5", "D#2", "-", "K"], ["-", "D#2", "-", "K"], ["C6", "-", "A4", "S"], ["B5", "-", "C5", "S"], ["A5", "-", "F#5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_20",
      "label": "Anticlimax_Return_68_B",
      "volume_scale": 1.1,
      "type": "normal",
      "rows": [
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"],
        ["B5", "B1", "-", "K"], ["-", "B1", "-", "K"], ["F#5", "-", "F#4", "S"], ["G5", "-", "B4", "S"], ["F#5", "-", "D#5", "S"], ["-", "-", "-", "H"]
      ]
    },
    {
      "id": "sec_21",
      "label": "Outro_68_Em",
      "volume_scale": 0.8,
      "type": "normal",
      "reverb_override": {
        "type": "hall",
        "delay_steps": 6,
        "wet_volume": 0.5
      },
      "rows": [
        ["-", "E2", "-", "K"], ["-", "E2", "-", "K"], ["-", "-", "G4", "S"], ["-", "-", "B4", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "H"],
        ["-", "E2", "-", "K"], ["-", "-", "-", "-"], ["-", "E2", "G4", "K"], ["-", "-", "-", "S"], ["-", "-", "E5", "S"], ["-", "-", "-", "-"],
        ["-", "E2", "-", "K"], ["-", "-", "-", "-"], ["-", "-", "G4", "-"], ["-", "-", "-", "-"], ["-", "-", "B4", "-"], ["-", "-", "-", "-"],
        ["-", "E1", "-", "K"], ["-", "-", "-", "-"], ["-", "-", "-", "-"], ["-", "-", "-", "-"], ["-", "-", "-", "-"], ["-", "-", "-", "-"]
      ]
    }
  ]
};
