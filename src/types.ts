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

export interface Section {
  label: string;
  volume_scale: number;
  type: string;
  note?: string;
  rows: string[][];
}

export interface SongData {
  name: string;
  tempo: number;
  step_duration_ms: number;
  loop: boolean;
  info: string;
  channels: Record<string, ChannelConfig>;
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
        return { label: `Section ${idx + 1}`, volume_scale: 1.0, type: 'normal', rows: [["-", "-", "-", "-"]] };
      }
      return {
        label: typeof s.label === 'string' ? s.label : `Section ${idx + 1}`,
        volume_scale: typeof s.volume_scale === 'number' ? s.volume_scale : 1.0,
        type: typeof s.type === 'string' ? s.type : 'normal',
        note: typeof s.note === 'string' ? s.note : undefined,
        rows: Array.isArray(s.rows) 
          ? s.rows.map((r: any) => Array.isArray(r) ? r.map((c: any) => typeof c === 'string' ? c : "-") : ["-", "-", "-", "-"])
          : [["-", "-", "-", "-"]]
      };
    });
  }
  if (sections.length === 0) {
    sections = [{
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
    perc_types,
    note_frequencies_hz,
    scale: parsed.scale && typeof parsed.scale === 'object' ? parsed.scale : undefined,
    section_types: parsed.section_types && typeof parsed.section_types === 'object' ? parsed.section_types : undefined,
    sections
  };
}

export const PHANTOM_CIRCUIT: SongData = {
  "name": "Phantom Circuit v7",
  "tempo": 82,
  "step_duration_ms": 183,
  "loop": true,
  "info": "D-molli · Amiga MOD -tyyli · Sub-basso triangle 0.25× · Cx mid-stab korjattu D-mollin säveliin · Fx siirtymä F1→Outro · Outro pelkät hihatit",
  "channels": {
    "CH1_sub": { "type": "triangle", "octave_multiplier": 0.25, "volume": 0.28, "envelope": { "attack_ms": 15, "sustain_until": 0.70, "release_at": 0.95 }, "note_duration_steps": 3.8 },
    "CH2_mid": { "type": "square", "octave_multiplier": 0.5, "volume": 0.14, "envelope": { "attack_ms": 5, "decay_ratio": 0.30, "sustain_level": 0.40, "release_at": 0.85 }, "note_duration_steps": 2.2 },
    "CH3_mel": { "type": "square", "octave_multiplier": 1.0, "volume": 0.13, "envelope": { "attack_ms": 4, "decay_ratio": 0.35, "sustain_level": 0.60, "release_at": 0.90 }, "note_duration_steps": 3.5, "note": "Soittaa vain C1-C3, E, E2 ja F1 osiossa" },
    "CH4_hh": { "type": "noise", "volume": 0.1, "envelope": { "attack_ms": 1, "release_at": 0.1 } }
  },
  "perc_types": {
    "K":  { "type": "sine", "frequency_hz": 60, "volume": 0.70, "duration_ms": 130 },
    "H":  { "filter": "highpass", "filter_hz": 7000, "filter_q": 1.0, "volume": 0.09, "duration_ms": 60 },
    "S":  { "filter": "bandpass", "filter_hz": 1800, "filter_q": 0.5, "volume": 0.25, "duration_ms": 90 },
    "KH": { "play": ["K","H"] },
    "-":  {}
  },
  "note_frequencies_hz": {
    "C": 261.63, "Db": 277.18, "D": 293.66, "Eb": 311.13, "E": 329.63,
    "F": 349.23, "Gb": 369.99, "G": 392.00, "Ab": 415.30, "A": 440.00,
    "Bb": 466.16, "B": 493.88
  },
  "scale": { "name": "D minor", "notes": ["D","E","F","G","A","Bb","C"] },
  "section_types": {
    "normal": "tavallinen groove-osio",
    "brk": "pehmeä break — mid-stab pitää harmonian, ei täydellistä hiljaisuutta",
    "lnk": "siirtymäosio — basso laskee hiljaa, ei kickiä",
    "mel": "melodia-osio — CH3 soittaa",
    "ret": "paluu — F1 = C1, tuttu melodia tulee takaisin"
  },
  "sections": [
    {
      "label": "Intro", "volume_scale": 0.65, "type": "normal",
      "rows": [
        ["-","D","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"],
        ["-","D","-","-"],["-","-","-","H"],["-","A","-","-"],["-","-","-","H"],
        ["-","F","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"],
        ["-","D","-","-"],["-","-","-","H"],["-","C","-","-"],["-","-","-","KH"]
      ]
    },
    {
      "label": "A1", "volume_scale": 0.9, "type": "normal",
      "rows": [
        ["D","D","-","K"],["-","-","-","H"],["D","-","-","-"],["-","-","-","H"],
        ["F","F","-","K"],["-","-","-","H"],["-","F","-","-"],["-","-","-","H"],
        ["A","A","-","K"],["-","-","-","H"],["A","-","-","-"],["-","-","-","H"],
        ["G","G","-","K"],["-","-","-","H"],["-","A","-","-"],["-","-","-","KH"]
      ]
    },
    {
      "label": "A2", "volume_scale": 0.95, "type": "normal",
      "rows": [
        ["D","D","-","K"],["-","F","-","H"],["D","-","-","-"],["-","D","-","H"],
        ["F","F","-","K"],["-","A","-","H"],["-","F","-","-"],["-","F","-","H"],
        ["A","A","-","K"],["-","C","-","H"],["A","-","-","-"],["-","A","-","H"],
        ["G","G","-","K"],["-","Bb","-","H"],["-","A","-","-"],["-","G","-","KH"]
      ]
    },
    {
      "label": "B1", "volume_scale": 0.9, "type": "normal",
      "rows": [
        ["Bb","Bb","-","K"],["-","-","-","H"],["Bb","-","-","-"],["-","-","-","H"],
        ["A","A","-","K"],["-","-","-","H"],["-","A","-","-"],["-","-","-","H"],
        ["G","G","-","K"],["-","-","-","H"],["G","-","-","-"],["-","-","-","H"],
        ["F","F","-","K"],["-","-","-","H"],["-","A","-","-"],["-","-","-","KH"]
      ]
    },
    {
      "label": "B2", "volume_scale": 0.95, "type": "normal",
      "rows": [
        ["Bb","Bb","-","K"],["-","D","-","H"],["Bb","-","-","-"],["-","Bb","-","H"],
        ["A","A","-","K"],["-","C","-","H"],["-","A","-","-"],["-","E","-","H"],
        ["G","G","-","K"],["-","Bb","-","H"],["G","-","-","-"],["-","D","-","H"],
        ["F","F","-","K"],["-","A","-","H"],["-","C","-","-"],["-","F","-","KH"]
      ]
    },
    {
      "label": "Br1", "volume_scale": 0.95, "type": "brk",
      "rows": [
        ["D","D","-","K"],["-","F","-","H"],["-","-","-","-"],["-","D","-","H"],
        ["-","A","-","-"],["-","F","-","H"],["-","A","-","-"],["-","D","-","H"],
        ["-","F","-","-"],["-","C","-","H"],["-","-","-","-"],["-","F","-","H"],
        ["-","D","-","-"],["-","A","-","H"],["-","D","-","-"],["-","F","-","KH"]
      ]
    },
    {
      "label": "C1", "volume_scale": 1.05, "type": "mel",
      "rows": [
        ["D","D","F","K"],["-","F","-","H"],["D","-","A","-"],["-","D","-","H"],
        ["F","F","A","K"],["-","A","-","H"],["-","F","C","-"],["-","F","-","H"],
        ["A","A","F","K"],["-","C","-","H"],["A","-","A","-"],["-","A","-","H"],
        ["G","G","D","K"],["-","Bb","-","H"],["-","A","Bb","-"],["-","G","-","KH"]
      ]
    },
    {
      "label": "C2", "volume_scale": 1.1, "type": "mel",
      "rows": [
        ["D","D","A","K"],["-","F","F","H"],["D","-","D","-"],["-","D","A","H"],
        ["F","F","C","K"],["-","A","A","H"],["-","F","F","-"],["-","F","C","H"],
        ["Bb","Bb","F","K"],["-","D","D","H"],["Bb","-","Bb","-"],["-","Bb","F","H"],
        ["A","A","E","K"],["-","C","C","H"],["-","A","A","-"],["-","A","E","KH"]
      ]
    },
    {
      "label": "C3", "volume_scale": 1.15, "type": "mel",
      "rows": [
        ["F","F","C","K"],["A","A","A","KH"],["F","F","F","K"],["A","A","C","H"],
        ["E","E","B","K"],["G","G","G","KH"],["E","E","E","K"],["G","G","B","H"],
        ["D","D","A","K"],["F","F","F","KH"],["D","D","D","K"],["F","F","A","H"],
        ["D","D","F","K"],["A","A","D","KH"],["D","D","D","K"],["D","D","D","H"]
      ]
    },
    {
      "label": "Cx", "volume_scale": 0.3, "type": "lnk",
      "rows": [
        ["-","A","D","-"],["-","-","-","-"],["-","A","-","-"],["-","F","-","-"],
        ["-","G","D","-"],["-","-","-","-"],["-","G","-","-"],["-","F","-","-"],
        ["-","F","A","-"],["-","-","-","-"],["-","F","-","-"],["-","C","-","-"],
        ["-","D","A","-"],["-","-","-","-"],["-","D","-","-"],["-","D","-","-"]
      ]
    },
    {
      "label": "D1", "volume_scale": 0.95, "type": "normal",
      "rows": [
        ["D","D","-","K"],["-","F","-","H"],["D","-","-","-"],["-","A","-","H"],
        ["C","C","-","K"],["-","Eb","-","H"],["C","-","-","-"],["-","G","-","H"],
        ["Bb","Bb","-","K"],["-","D","-","H"],["Bb","-","-","-"],["-","F","-","H"],
        ["A","A","-","K"],["-","C","-","H"],["-","E","-","-"],["-","A","-","KH"]
      ]
    },
    {
      "label": "D2", "volume_scale": 1.0, "type": "normal",
      "rows": [
        ["D","D","-","K"],["-","F","-","H"],["F","-","-","-"],["-","A","-","H"],
        ["A","A","-","K"],["-","C","-","H"],["C","-","-","-"],["-","Eb","-","H"],
        ["Bb","Bb","-","K"],["-","D","-","H"],["D","-","-","-"],["-","F","-","H"],
        ["A","A","-","K"],["-","C","-","H"],["-","E","-","-"],["-","A","-","KH"]
      ]
    },
    {
      "label": "E", "volume_scale": 1.15, "type": "mel",
      "rows": [
        ["D","D","F","K"],["-","F","A","H"],["D","-","D","-"],["-","D","F","H"],
        ["F","F","A","K"],["-","A","C","H"],["F","-","F","-"],["-","F","A","H"],
        ["Bb","Bb","D","K"],["-","D","F","H"],["Bb","-","Bb","-"],["-","Bb","D","H"],
        ["D","D","F","K"],["-","F","A","H"],["D","-","D","-"],["-","D","D","KH"]
      ]
    },
    {
      "label": "E2", "volume_scale": 1.05, "type": "mel",
      "rows": [
        ["A","A","C","K"],["-","C","E","H"],["A","-","A","-"],["-","A","C","H"],
        ["G","G","Bb","K"],["-","Bb","D","H"],["G","-","G","-"],["-","G","Bb","H"],
        ["F","F","A","K"],["-","A","C","H"],["F","-","F","-"],["-","F","A","H"],
        ["D","D","F","K"],["-","F","A","H"],["C","C","E","K"],["-","D","D","KH"]
      ]
    },
    {
      "label": "F1", "volume_scale": 1.05, "type": "ret",
      "rows": [
        ["D","D","F","K"],["-","F","-","H"],["D","-","A","-"],["-","D","-","H"],
        ["F","F","A","K"],["-","A","-","H"],["-","F","C","-"],["-","F","-","H"],
        ["A","A","F","K"],["-","C","-","H"],["A","-","A","-"],["-","A","-","H"],
        ["G","G","D","K"],["-","Bb","-","H"],["-","A","Bb","-"],["-","G","-","KH"]
      ]
    },
    {
      "label": "Fx", "volume_scale": 0.55, "type": "lnk",
      "rows": [
        ["-","G","-","K"],["-","-","-","H"],["-","G","-","-"],["-","-","-","H"],
        ["-","F","-","-"],["-","-","-","H"],["-","F","-","-"],["-","-","-","H"],
        ["-","D","-","-"],["-","-","-","H"],["-","D","-","-"],["-","-","-","H"],
        ["-","D","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"]
      ]
    },
    {
      "label": "Outro", "volume_scale": 0.4, "type": "normal",
      "rows": [
        ["-","-","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"],
        ["-","-","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"],
        ["-","-","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"],
        ["-","-","-","-"],["-","-","-","H"],["-","-","-","-"],["-","-","-","H"]
      ]
    }
  ]
};
