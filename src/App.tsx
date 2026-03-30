import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Play, Square as Stop, Download, Upload, Plus, Trash2, Save, Music, Info, Settings, Copy, ChevronUp, ChevronDown, Maximize, Minimize, Library as LibraryIcon, ChevronLeft, ChevronRight, Edit2, Check, Volume2, VolumeX, Code, Search, X, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PHANTOM_CIRCUIT, SongData, Section, validateAndFillSong } from './types';
import { audioEngine } from './audioEngine';

const EInkButton = ({ 
  children, 
  onClick, 
  className = "", 
  active = false,
  disabled = false,
  title
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      px-4 py-2 border-2 border-black font-bold transition-all
      ${active ? 'bg-black text-[#f4f4f2]' : 'bg-[#f4f4f2] text-[#1a1a1a]'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[0px] active:translate-y-[0px] active:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'}
      ${className}
    `}
  >
    {children}
  </button>
);

const EInkInput = ({ 
  value, 
  onChange, 
  type = "text", 
  className = "" 
}: { 
  value: string | number; 
  onChange: (val: string) => void; 
  type?: string;
  className?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`bg-[#f4f4f2] border-2 border-black px-2 py-1 focus:outline-none focus:bg-black focus:text-white transition-colors ${className}`}
  />
);

export const sanitizeSongData = (imported: any): SongData => {
  return validateAndFillSong(imported);
};

// Memoized Note Select to avoid re-rendering thousands of options
const NoteSelect = memo(({ 
  value, 
  onChange, 
  options, 
  disabled, 
  isActive 
}: { 
  value: string, 
  onChange: (val: string) => void, 
  options: string[], 
  disabled?: boolean,
  isActive?: boolean
}) => {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-transparent text-center text-sm font-bold focus:outline-none appearance-none ${!disabled ? 'cursor-pointer' : ''} ${isActive ? 'text-white' : 'text-black'}`}
    >
      <option value="-">-</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
});

// Memoized Row component
const TrackerRow = memo(({ 
  rIdx, 
  sIdx, 
  row, 
  isCurrent, 
  isActive, 
  isLinked, 
  seekTo, 
  updateCell, 
  noteOptions, 
  percOptions,
  activeRowRef
}: { 
  rIdx: number, 
  sIdx: number, 
  row: string[], 
  isCurrent: boolean, 
  isActive: boolean, 
  isLinked: boolean, 
  seekTo: (sIdx: number, rIdx: number) => void, 
  updateCell: (sIdx: number, rIdx: number, cIdx: number, val: string) => void,
  noteOptions: string[],
  percOptions: string[],
  activeRowRef: React.RefObject<HTMLDivElement | null>
}) => {
  return (
    <div 
      ref={isCurrent ? activeRowRef : null}
      onClick={() => !isLinked && seekTo(sIdx, rIdx)}
      className={`grid grid-cols-[60px_1fr_1fr_1fr_1fr] border-b border-black/10 last:border-b-0 transition-colors ${!isLinked ? 'cursor-pointer' : ''} ${isActive ? 'bg-black text-white' : isCurrent ? 'bg-black/10' : 'hover:bg-[#f8f8f6]'}`}
    >
      <div className="p-2 border-r border-black/10 text-center text-xs opacity-50 font-bold">
        {String(rIdx).padStart(2, '0')}
      </div>
      {row.map((cell, cIdx) => (
        <div key={cIdx} className="p-1 border-r border-black/10 last:border-r-0">
          <NoteSelect 
            value={cell}
            disabled={isLinked}
            isActive={isActive}
            onChange={(val) => updateCell(sIdx, rIdx, cIdx, val)}
            options={cIdx < 3 ? noteOptions : percOptions}
          />
        </div>
      ))}
    </div>
  );
});

export default function App() {
  const [song, setSong] = useState<SongData>(() => {
    const saved = localStorage.getItem('phantom_circuit_current_song');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved song", e);
      }
    }
    return PHANTOM_CIRCUIT;
  });

  const noteOptions = useMemo(() => Object.keys(song.note_frequencies_hz), [song.note_frequencies_hz]);
  const percOptions = useMemo(() => Object.keys(song.perc_types), [song.perc_types]);

  useEffect(() => {
    localStorage.setItem('phantom_circuit_current_song', JSON.stringify(song));
  }, [song]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoopingSection, setIsLoopingSection] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [library, setLibrary] = useState<SongData[]>([]);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [showInstruments, setShowInstruments] = useState(false);
  const [inspectedSectionIndex, setInspectedSectionIndex] = useState<number | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const isEditingJson = useRef(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySort, setLibrarySort] = useState<'newest' | 'oldest' | 'a-z' | 'z-a'>('newest');
  const [renamingLibrarySong, setRenamingLibrarySong] = useState<string | null>(null);
  const [newLibrarySongName, setNewLibrarySongName] = useState('');
  const [confirmDeleteSong, setConfirmDeleteSong] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mutedChannels, setMutedChannels] = useState<boolean[]>([false, false, false, false]);
  const [audioState, setAudioState] = useState<string>('uninitialized');

  const updateChannelConfig = (channelName: string, field: string, value: any) => {
    setSong(prev => {
      const newSong = { ...prev };
      const newChannels = { ...newSong.channels };
      const channel = { ...newChannels[channelName] };

      if (field.startsWith('envelope.')) {
        const envField = field.split('.')[1];
        channel.envelope = { ...(channel.envelope || { attack_ms: 0 }), [envField]: value };
      } else {
        (channel as any)[field] = value;
      }

      newChannels[channelName] = channel;
      newSong.channels = newChannels;
      return newSong;
    });
  };

  const updateGlobalReverb = (field: string, value: any) => {
    setSong(prev => {
      const newSong = { ...prev };
      const newReverb = { ...(newSong.reverb || { type: 'hall', delay_steps: 3, wet_volume: 0.2 }) };
      (newReverb as any)[field] = value;
      newSong.reverb = newReverb as any;
      return newSong;
    });
  };

  const updateSectionConfig = (sectionIdx: number, field: string, value: any) => {
    setSong(prev => {
      const newSong = { ...prev };
      const newSections = [...newSong.sections];
      const section = { ...newSections[sectionIdx] };
      
      if (value === undefined) {
        delete (section as any)[field];
      } else {
        (section as any)[field] = value;
      }
      
      newSections[sectionIdx] = section;
      newSong.sections = newSections;
      return newSong;
    });
  };

  const updateSectionReverb = (sectionIdx: number, field: string, value: any) => {
    setSong(prev => {
      const newSong = { ...prev };
      const newSections = [...newSong.sections];
      const section = { ...newSections[sectionIdx] };
      
      if (value === undefined) {
        delete section.reverb_override;
      } else {
        const newReverb = { ...(section.reverb_override || { type: 'hall', delay_steps: 3, wet_volume: 0.2 }) };
        (newReverb as any)[field] = value;
        section.reverb_override = newReverb as any;
      }
      
      newSections[sectionIdx] = section;
      newSong.sections = newSections;
      return newSong;
    });
  };

  const updateSectionChannelOverride = (sectionIdx: number, channelName: string, field: string, value: any) => {
    setSong(prev => {
      const newSong = { ...prev };
      const newSections = [...newSong.sections];
      const section = { ...newSections[sectionIdx] };
      const overrides = { ...(section.channel_overrides || {}) };
      
      if (value === undefined) {
        delete overrides[channelName];
        if (Object.keys(overrides).length === 0) {
          delete section.channel_overrides;
        } else {
          section.channel_overrides = overrides;
        }
      } else {
        const channelOverride = { ...(overrides[channelName] || {}) };
        if (field.startsWith('envelope.')) {
          const envField = field.split('.')[1];
          channelOverride.envelope = { ...(channelOverride.envelope || {}), [envField]: value };
        } else {
          (channelOverride as any)[field] = value;
        }
        overrides[channelName] = channelOverride;
        section.channel_overrides = overrides;
      }
      
      newSections[sectionIdx] = section;
      newSong.sections = newSections;
      return newSong;
    });
  };

  const timerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const sectionRef = useRef(0);

  // Load library from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chiptune_library');
    if (saved) {
      try {
        setLibrary(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load library", e);
      }
    }
  }, []);

  const saveToLibrary = () => {
    const newLibrary = [...library.filter(s => s.name !== song.name), song];
    setLibrary(newLibrary);
    localStorage.setItem('chiptune_library', JSON.stringify(newLibrary));
  };

  const deleteFromLibrary = (name: string) => {
    const newLibrary = library.filter(s => s.name !== name);
    setLibrary(newLibrary);
    localStorage.setItem('chiptune_library', JSON.stringify(newLibrary));
  };

  const renameInLibrary = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setRenamingLibrarySong(null);
      return;
    }
    if (library.some(s => s.name === newName)) {
      setToast({ message: "A song with this name already exists", type: "error" });
      return;
    }
    const newLibrary = library.map(s => s.name === oldName ? { ...s, name: newName } : s);
    setLibrary(newLibrary);
    localStorage.setItem('chiptune_library', JSON.stringify(newLibrary));
    setRenamingLibrarySong(null);
    if (song.name === oldName) {
      setSong({ ...song, name: newName });
    }
    setToast({ message: `Renamed to ${newName}`, type: "success" });
  };

  const filteredAndSortedLibrary = useMemo(() => {
    let result = [...library];
    
    if (librarySearch.trim()) {
      const query = librarySearch.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(query) || (s.info && s.info.toLowerCase().includes(query)));
    }
    
    switch (librarySort) {
      case 'newest':
        result.reverse();
        break;
      case 'oldest':
        break;
      case 'a-z':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'z-a':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }
    
    return result;
  }, [library, librarySearch, librarySort]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const mutedChannelsRef = useRef(mutedChannels);
  useEffect(() => {
    mutedChannelsRef.current = mutedChannels;
  }, [mutedChannels]);

  const songRef = useRef(song);
  useEffect(() => {
    songRef.current = song;
  }, [song]);

  const resolveTargetSection = useCallback((section: Section, allSections: Section[]): Section => {
    if (!section.reference_id) return section;
    const target = allSections.find(s => s.id === section.reference_id);
    if (!target) return section;
    // Prevent infinite loops by limiting depth
    if (target.reference_id && target.reference_id !== target.id) {
       return resolveTargetSection(target, allSections);
    }
    return target;
  }, []);

  const scheduleNote = useCallback((step: number, sectionIdx: number, time: number, stepDurationMs: number) => {
    const currentSong = songRef.current;
    const currentMuted = mutedChannelsRef.current;
    
    const section = currentSong.sections[sectionIdx];
    const targetSection = resolveTargetSection(section, currentSong.sections);
    const row = targetSection.rows[step];
    if (!row) return;

    // Apply reverb override if present, otherwise use global reverb
    const reverbConfig = section.reverb_override || targetSection.reverb_override || currentSong.reverb;
    audioEngine.setReverb(reverbConfig);
    
    const volumeScale = section.volume_scale || 1;
    const channelKeys = Object.keys(currentSong.channels);

    // Schedule notes for the first 3 columns (Melodic channels)
    for (let i = 0; i < 3; i++) {
      if (row[i] !== '-' && channelKeys[i] && !currentMuted[i]) {
        const freq = currentSong.note_frequencies_hz[row[i]];
        let channelConfig = currentSong.channels[channelKeys[i]];
        
        const override = section.channel_overrides?.[channelKeys[i]] || targetSection.channel_overrides?.[channelKeys[i]];
        if (override) {
          channelConfig = {
            ...channelConfig,
            ...override,
            envelope: {
              ...channelConfig.envelope,
              ...(override.envelope || {})
            }
          };
        }

        if (freq && channelConfig) {
          const duration = stepDurationMs * (channelConfig.note_duration_steps || 1);
          
          let effects: {
            portamento?: { targetFreq: number, durationMs: number },
            filterSweep?: { type: BiquadFilterType, startHz: number, endHz: number, sweepStartTime: number, sweepEndTime: number }
          } | undefined = undefined;

          // Find active section effects for this channel and row
          const activeEffects = (section.section_effects || targetSection.section_effects || []).filter(e => 
            e.channel === channelKeys[i] && 
            step >= e.row_start && 
            (e.row_end === undefined || step <= e.row_end)
          );

          if (activeEffects.length > 0) {
            effects = {};
            for (const effect of activeEffects) {
              if (effect.effect === 'portamento' && effect.target_note) {
                const targetFreq = currentSong.note_frequencies_hz[effect.target_note];
                if (targetFreq) {
                  effects.portamento = {
                    targetFreq,
                    durationMs: (effect.duration_steps || 1) * stepDurationMs
                  };
                }
              } else if (effect.effect === 'filter_sweep' && effect.type && effect.start_hz !== undefined && effect.end_hz !== undefined) {
                const sweepStartTime = time - (step - effect.row_start) * (stepDurationMs / 1000);
                const sweepEndTime = sweepStartTime + ((effect.row_end !== undefined ? effect.row_end : targetSection.rows.length - 1) - effect.row_start + 1) * (stepDurationMs / 1000);
                effects.filterSweep = {
                  type: effect.type as BiquadFilterType,
                  startHz: effect.start_hz,
                  endHz: effect.end_hz,
                  sweepStartTime,
                  sweepEndTime
                };
              }
            }
          }

          audioEngine.playNote(freq, channelConfig, time, duration, volumeScale, effects);
        }
      }
    }

    // Schedule percussion for the 4th column
    if (row[3] !== '-' && !currentMuted[3]) {
      const perc = currentSong.perc_types[row[3]];
      if (perc) {
        const percChannelConfig = currentSong.channels['percussion'];
        audioEngine.playPercussion(perc, time, currentSong, volumeScale, percChannelConfig?.panning);
      }
    }
  }, [resolveTargetSection]);

  const isLoopingSectionRef = useRef(isLoopingSection);
  useEffect(() => {
    isLoopingSectionRef.current = isLoopingSection;
  }, [isLoopingSection]);

  const scheduler = useCallback(() => {
    if (!isPlaying) return;

    const currentSong = songRef.current;
    
    // Safety check: if we're way behind, jump to current time to avoid catch-up burst
    if (nextNoteTimeRef.current < audioEngine.currentTime - 0.5) {
      nextNoteTimeRef.current = audioEngine.currentTime;
    }

    while (nextNoteTimeRef.current < audioEngine.currentTime + 0.2) {
      const currentSection = currentSong.sections[sectionRef.current];
      const targetSection = resolveTargetSection(currentSection, currentSong.sections);
      
      const activeTempo = currentSection.tempo || currentSong.tempo;
      const secondsPerStep = 60 / (activeTempo * 4);
      const stepDurationMs = secondsPerStep * 1000;

      scheduleNote(stepRef.current, sectionRef.current, nextNoteTimeRef.current, stepDurationMs);
      
      nextNoteTimeRef.current += secondsPerStep;

      stepRef.current++;
      if (stepRef.current >= targetSection.rows.length) {
        stepRef.current = 0;
        
        if (!isLoopingSectionRef.current) {
          sectionRef.current++;
        }

        if (sectionRef.current >= currentSong.sections.length) {
          if (currentSong.loop) {
            sectionRef.current = 0;
          } else {
            setIsPlaying(false);
            return;
          }
        }
      }
      
      const s = stepRef.current;
      const si = sectionRef.current;
      requestAnimationFrame(() => {
        setCurrentStep(s);
        setCurrentSectionIndex(si);
      });
    }
    timerRef.current = window.setTimeout(scheduler, 25);
  }, [isPlaying, scheduleNote, resolveTargetSection]);

  useEffect(() => {
    if (isPlaying) {
      audioEngine.resume();
      if (!timerRef.current) {
        nextNoteTimeRef.current = audioEngine.currentTime;
        stepRef.current = currentStep;
        sectionRef.current = currentSectionIndex;
        scheduler();
      }
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, scheduler]);

  const togglePlay = () => {
    audioEngine.resume();
    setIsPlaying(!isPlaying);
  };

  const stopPlayback = () => {
    audioEngine.resume();
    setIsPlaying(false);
    setCurrentStep(0);
    setCurrentSectionIndex(0);
    stepRef.current = 0;
    sectionRef.current = 0;
  };

  // Monitor audio state
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioState(audioEngine.state);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
  };

  const seekTo = useCallback((sectionIdx: number, stepIdx: number) => {
    setCurrentSectionIndex(sectionIdx);
    setCurrentStep(stepIdx);
    sectionRef.current = sectionIdx;
    stepRef.current = stepIdx;
    if (isPlaying) {
      nextNoteTimeRef.current = audioEngine.currentTime;
    }
  }, [isPlaying]);

  // Sync JSON editor with song state
  useEffect(() => {
    if (!isEditingJson.current) {
      setJsonText(JSON.stringify(song, null, 2));
    }
  }, [song]);

  const copyDefaultTemplate = () => {
    const template = JSON.stringify(PHANTOM_CIRCUIT, null, 2);
    navigator.clipboard.writeText(template).then(() => {
      setToast({ message: "Default template copied to clipboard", type: "success" });
    }).catch(() => {
      setToast({ message: "Failed to copy template", type: "error" });
    });
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setJsonText(newText);
    try {
      const parsed = JSON.parse(newText);
      setJsonError('');
      setSong(validateAndFillSong(parsed));
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const exportSong = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(song, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${song.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const updateCell = useCallback((sectionIdx: number, rowIdx: number, colIdx: number, value: string) => {
    const newSections = [...song.sections];
    newSections[sectionIdx].rows[rowIdx][colIdx] = value;
    setSong({ ...song, sections: newSections });
  }, [song]);

  const updateSongMetadata = (field: 'name' | 'info', value: string) => {
    setSong({ ...song, [field]: value });
  };

  const updateSectionNote = (index: number, note: string) => {
    const newSections = [...song.sections];
    newSections[index].note = note;
    setSong({ ...song, sections: newSections });
  };

  const renameSection = (index: number, newLabel: string) => {
    const newSections = [...song.sections];
    newSections[index].label = newLabel;
    setSong({ ...song, sections: newSections });
    showToast(`Section renamed to "${newLabel}"`, 'success');
    setRenamingIndex(null);
  };

  const duplicateSection = (index: number) => {
    const newSections = [...song.sections];
    const sectionToDuplicate = newSections[index];
    const duplicated: Section = {
      ...sectionToDuplicate,
      id: Math.random().toString(36).substring(2, 9),
      label: `${sectionToDuplicate.label} (Copy)`,
      rows: sectionToDuplicate.rows.map(row => [...row])
    };
    newSections.splice(index + 1, 0, duplicated);
    setSong({ ...song, sections: newSections });
    showToast(`Section "${sectionToDuplicate.label}" duplicated`, 'success');
  };

  const duplicateAsLink = (index: number) => {
    const source = song.sections[index];
    const targetId = source.reference_id || source.id;
    const newSection: Section = {
      id: Math.random().toString(36).substring(2, 9),
      label: `${source.label} (Link)`,
      type: source.type,
      volume_scale: source.volume_scale,
      tempo: source.tempo,
      reference_id: targetId,
      rows: [] // Empty rows since it's a reference
    };
    const newSections = [...song.sections];
    newSections.splice(index + 1, 0, newSection);
    setSong({ ...song, sections: newSections });
    showToast(`Created link to "${source.label}"`, 'success');
  };

  const unlinkSection = (index: number) => {
    const section = song.sections[index];
    if (!section.reference_id) return;
    const target = song.sections.find(s => s.id === section.reference_id);
    if (!target) return;
    
    const newSections = [...song.sections];
    newSections[index] = {
      ...section,
      reference_id: undefined,
      rows: JSON.parse(JSON.stringify(target.rows)) // Deep copy rows
    };
    setSong({ ...song, sections: newSections });
    showToast(`Section "${section.label}" unlinked and made independent`, 'success');
  };

  const deleteSection = (index: number) => {
    if (song.sections.length <= 1) return;
    const sectionToDelete = song.sections[index];
    const sectionName = sectionToDelete.label;
    
    const newSections = song.sections.filter((_, i) => i !== index).map(sec => {
      // If this section references the deleted one, unlink it
      if (sec.reference_id === sectionToDelete.id) {
        return {
          ...sec,
          reference_id: undefined,
          rows: JSON.parse(JSON.stringify(sectionToDelete.rows))
        };
      }
      return sec;
    });
    setSong({ ...song, sections: newSections });
    if (currentSectionIndex >= newSections.length) {
      setCurrentSectionIndex(newSections.length - 1);
    }
    showToast(`Section "${sectionName}" deleted`, 'info');
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...song.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;
    
    setSong({ ...song, sections: newSections });
    
    // Adjust current section index if it was one of the moved ones
    if (currentSectionIndex === index) setCurrentSectionIndex(targetIndex);
    else if (currentSectionIndex === targetIndex) setCurrentSectionIndex(index);

    showToast(`Section moved ${direction}`, 'info');
  };

  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeRowRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const row = activeRowRef.current;
      
      // Calculate position relative to container
      // If row.offsetTop is relative to a section div, we need to add section.offsetTop
      let actualTop = row.offsetTop;
      let parent = row.offsetParent as HTMLElement;
      
      while (parent && parent !== container && parent !== document.body) {
        actualTop += parent.offsetTop;
        parent = parent.offsetParent as HTMLElement;
      }
      
      const rowHeight = row.offsetHeight;
      const containerHeight = container.offsetHeight;
      
      // Use 'auto' during playback for performance, 'smooth' for manual seeking
      container.scrollTo({
        top: actualTop - (containerHeight / 2) + (rowHeight / 2),
        behavior: isPlaying ? 'auto' : 'smooth'
      });
    }
  }, [currentStep, currentSectionIndex, isPlaying]);

  const copyTemplate = () => {
    const template = JSON.stringify(PHANTOM_CIRCUIT, null, 2);
    navigator.clipboard.writeText(template);
    alert("Template kopioitu leikepöydälle!");
  };

  return (
    <div className="h-screen bg-[#f4f4f2] text-[#1a1a1a] font-mono flex flex-col overflow-hidden selection:bg-black selection:text-white">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-[100] font-bold uppercase text-sm flex items-center gap-3 ${
              toast.type === 'success' ? 'bg-[#e8f5e9]' : toast.type === 'error' ? 'bg-[#ffebee]' : 'bg-white'
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${
              toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-black'
            }`} />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex-none w-full border-b-4 border-black p-4 md:p-6 bg-white z-40">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 mb-1">Chip-Tune</div>
              <input
                className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-1 bg-transparent border-none outline-none w-full focus:ring-2 focus:ring-black/10"
                value={song.name}
                onChange={(e) => updateSongMetadata('name', e.target.value)}
                placeholder="Song Name"
              />
              <input
                className="text-xs md:text-sm opacity-70 italic bg-transparent border-none outline-none w-full focus:ring-2 focus:ring-black/10"
                value={song.info}
                onChange={(e) => updateSongMetadata('info', e.target.value)}
                placeholder="Song Info"
              />
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3">
              {audioState === 'suspended' && (
                <EInkButton 
                  onClick={() => audioEngine.resume()} 
                  className="flex items-center justify-center p-2 bg-red-100 border-red-500 text-red-600 animate-pulse"
                  title="Fix Audio (Browser blocked sound)"
                >
                  <VolumeX size={20} /> <span className="ml-2 text-[10px]">FIX AUDIO</span>
                </EInkButton>
              )}
              <EInkButton onClick={togglePlay} className="flex items-center justify-center p-2" title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <div className="w-4 h-4 border-l-4 border-r-4 border-black" /> : <Play size={20} fill="currentColor" />}
              </EInkButton>
              <EInkButton onClick={stopPlayback} className="flex items-center justify-center p-2" title="Stop">
                <Stop size={20} fill="currentColor" />
              </EInkButton>
              <EInkButton 
                onClick={() => setIsLoopingSection(!isLoopingSection)} 
                active={isLoopingSection}
                className="flex items-center justify-center p-2"
                title="Loop Section"
              >
                <Plus size={20} className={isLoopingSection ? "rotate-45 transition-transform" : "transition-transform"} />
              </EInkButton>
              <EInkButton 
                onClick={() => { setShowInstruments(!showInstruments); setShowJsonEditor(false); setInspectedSectionIndex(null); }} 
                active={showInstruments}
                className="flex items-center justify-center p-2" 
                title="Instruments"
              >
                <Settings size={20} />
              </EInkButton>
              <EInkButton 
                onClick={() => { setShowJsonEditor(!showJsonEditor); setShowInstruments(false); setInspectedSectionIndex(null); }} 
                active={showJsonEditor}
                className="flex items-center justify-center p-2" 
                title="JSON Editor"
              >
                <Code size={20} />
              </EInkButton>
              <EInkButton onClick={exportSong} className="flex items-center justify-center p-2" title="Export">
                <Download size={20} />
              </EInkButton>
              <EInkButton onClick={saveToLibrary} className="flex items-center justify-center p-2" title="Save">
                <Save size={20} />
              </EInkButton>
              <EInkButton onClick={() => setShowLibrary(true)} className="flex items-center justify-center p-2" title="Library">
                <LibraryIcon size={20} />
              </EInkButton>
              <EInkButton onClick={toggleFullScreen} className="p-2" title="Fullscreen">
                {isFullScreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </EInkButton>
              <EInkButton onClick={() => setShowInfo(!showInfo)} className="p-2" active={showInfo} title="Info">
                <Info size={20} />
              </EInkButton>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-t-2 border-black pt-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase">Tempo (BPM)</label>
              <EInkInput 
                type="number" 
                value={song.tempo} 
                onChange={(v) => {
                  const newTempo = parseInt(v) || 0;
                  const newStepMs = newTempo > 0 ? Math.round((60000 / newTempo) / 4) : song.step_duration_ms;
                  setSong({...song, tempo: newTempo, step_duration_ms: newStepMs});
                }} 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase">Scale</label>
              <div className="px-2 py-1 border-2 border-black font-bold bg-black text-white text-sm">
                {song.scale?.name || 'Chromatic'}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase">Current Section</label>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => seekTo(Math.max(0, currentSectionIndex - 1), 0)}
                  disabled={currentSectionIndex === 0}
                  className="p-1 border-2 border-black hover:bg-black hover:text-white disabled:opacity-20 transition-colors"
                  title="Previous Section"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="relative flex-1">
                  <select 
                    value={currentSectionIndex}
                    onChange={(e) => seekTo(parseInt(e.target.value), 0)}
                    className="w-full px-2 py-1 border-2 border-black font-bold text-sm bg-transparent focus:outline-none appearance-none cursor-pointer text-center pr-6"
                  >
                    {song.sections.map((s, idx) => (
                      <option key={idx} value={idx}>{s.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={12} />
                  </div>
                </div>
                <button 
                  onClick={() => seekTo(Math.min(song.sections.length - 1, currentSectionIndex + 1), 0)}
                  disabled={currentSectionIndex === song.sections.length - 1}
                  className="p-1 border-2 border-black hover:bg-black hover:text-white disabled:opacity-20 transition-colors"
                  title="Next Section"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase">Step</label>
              <div className="px-2 py-1 border-2 border-black font-bold text-sm">
                {currentStep + 1} / {(() => {
                  const currentSection = song.sections[currentSectionIndex];
                  if (!currentSection) return 0;
                  const targetSection = resolveTargetSection(currentSection, song.sections);
                  return targetSection.rows.length;
                })()}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 md:p-6 flex gap-4">
        <div className={`h-full transition-all duration-300 ${(showJsonEditor || showInstruments || inspectedSectionIndex !== null) ? 'w-2/3' : 'w-full max-w-7xl mx-auto'}`}>
          {/* Tracker Grid */}
          <div className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col h-full">
            <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr] border-b-4 border-black bg-black text-white font-bold text-xs uppercase sticky top-0 z-30">
              <div className="p-2 border-r border-white/20">Step</div>
              {Object.keys(song.channels).slice(0, 3).map((key, i) => (
                <div key={key} className="p-2 border-r border-white/20 flex items-center justify-between">
                  <span>{key}</span>
                  <button 
                    onClick={() => {
                      const newMuted = [...mutedChannels];
                      newMuted[i] = !newMuted[i];
                      setMutedChannels(newMuted);
                    }}
                    className={`p-1 hover:bg-white/20 rounded transition-colors ${mutedChannels[i] ? 'text-red-400' : 'text-white/50 hover:text-white'}`}
                    title={mutedChannels[i] ? "Unmute" : "Mute"}
                  >
                    {mutedChannels[i] ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                </div>
              ))}
              <div className="p-2 flex items-center justify-between">
                <span>Percussion</span>
                <button 
                  onClick={() => {
                    const newMuted = [...mutedChannels];
                    newMuted[3] = !newMuted[3];
                    setMutedChannels(newMuted);
                  }}
                  className={`p-1 hover:bg-white/20 rounded transition-colors ${mutedChannels[3] ? 'text-red-400' : 'text-white/50 hover:text-white'}`}
                  title={mutedChannels[3] ? "Unmute" : "Mute"}
                >
                  {mutedChannels[3] ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              </div>
            </div>
            
            <div ref={scrollContainerRef} className="overflow-y-auto flex-1 custom-scrollbar scroll-smooth relative">
              {song.sections.map((section, sIdx) => (
                <div key={sIdx} className="border-b-2 border-black last:border-b-0">
                  <div className="bg-[#e0e0de] px-2 py-1 text-[10px] font-bold uppercase flex justify-between items-center border-b border-black sticky top-0 z-20 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {renamingIndex === sIdx ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameSection(sIdx, renameValue);
                                if (e.key === 'Escape') setRenamingIndex(null);
                              }}
                              className="bg-white border border-black px-1 py-0.5 text-[10px] w-32 outline-none"
                            />
                            <button onClick={() => renameSection(sIdx, renameValue)} className="hover:text-green-600">
                              <Check size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>Section: {section.label} ({section.type})</span>
                            <button 
                              onClick={() => {
                                setRenamingIndex(sIdx);
                                setRenameValue(section.label);
                              }}
                              className="opacity-40 hover:opacity-100 transition-opacity"
                            >
                              <Edit2 size={10} />
                            </button>
                            <div className="flex items-center gap-1 ml-2 border-l border-black/20 pl-2">
                              <span className="opacity-60 text-[9px]">BPM:</span>
                              <input
                                type="number"
                                value={section.tempo || ''}
                                placeholder={song.tempo.toString()}
                                onChange={(e) => {
                                  const val = e.target.value ? parseInt(e.target.value) : undefined;
                                  const newSections = [...song.sections];
                                  newSections[sIdx] = { ...section, tempo: val };
                                  setSong({ ...song, sections: newSections });
                                }}
                                className="w-10 bg-transparent border-b border-black/30 text-center focus:outline-none focus:border-black"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 border-l border-black/20 pl-4">
                        <button 
                          onClick={() => moveSection(sIdx, 'up')} 
                          disabled={sIdx === 0}
                          className="p-1 hover:bg-black hover:text-white disabled:opacity-20 transition-colors"
                          title="Move Up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button 
                          onClick={() => moveSection(sIdx, 'down')} 
                          disabled={sIdx === song.sections.length - 1}
                          className="p-1 hover:bg-black hover:text-white disabled:opacity-20 transition-colors"
                          title="Move Down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button 
                          onClick={() => duplicateSection(sIdx)} 
                          className="p-1 hover:bg-black hover:text-white transition-colors"
                          title="Duplicate (Independent Copy)"
                        >
                          <Copy size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            setInspectedSectionIndex(sIdx);
                            setShowInstruments(false);
                            setShowJsonEditor(false);
                          }}
                          className={`p-1 hover:bg-black hover:text-white transition-colors ${inspectedSectionIndex === sIdx ? 'bg-black text-white' : ''}`}
                          title="Section Settings"
                        >
                          <Settings size={14} />
                        </button>
                        <button 
                          onClick={() => duplicateAsLink(sIdx)} 
                          className="p-1 hover:bg-black hover:text-white transition-colors"
                          title="Duplicate as Link (Changes sync with original)"
                        >
                          <Link size={14} />
                        </button>
                        <button 
                          onClick={() => deleteSection(sIdx)} 
                          disabled={song.sections.length <= 1}
                          className="p-1 hover:bg-black hover:text-white disabled:opacity-20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <input 
                      className="w-full bg-transparent opacity-50 italic text-[10px] outline-none border-none focus:ring-1 focus:ring-black/10 px-1"
                      value={section.note || ''}
                      onChange={(e) => updateSectionNote(sIdx, e.target.value)}
                      placeholder="Add section note..."
                    />
                  </div>
                  {(() => {
                    const isLinked = !!section.reference_id;
                    const targetSection = isLinked ? resolveTargetSection(section, song.sections) : null;
                    const rowsToRender = isLinked && targetSection ? targetSection.rows : section.rows;
                    
                    return (
                      <div className="relative">
                        {isLinked && (
                          <div className="absolute inset-0 z-10 bg-black/5 pointer-events-none flex flex-col items-center justify-center">
                            <div className="bg-white/90 border-2 border-black p-4 flex flex-col items-center pointer-events-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                              <Link size={24} className="mb-2 opacity-80" />
                              <span className="font-bold text-sm">Linked to: {targetSection ? targetSection.label : 'Unknown'}</span>
                              <button 
                                onClick={() => unlinkSection(sIdx)} 
                                className="mt-3 px-3 py-1 bg-black text-white text-xs font-bold uppercase hover:bg-gray-800 transition-colors"
                              >
                                Unlink
                              </button>
                            </div>
                          </div>
                        )}
                        <div className={isLinked ? 'opacity-40 pointer-events-none' : ''}>
                          {rowsToRender.map((row, rIdx) => (
                            <TrackerRow 
                              key={rIdx}
                              rIdx={rIdx}
                              sIdx={sIdx}
                              row={row}
                              isCurrent={currentSectionIndex === sIdx && currentStep === rIdx}
                              isActive={isPlaying && currentSectionIndex === sIdx && currentStep === rIdx}
                              isLinked={isLinked}
                              seekTo={seekTo}
                              updateCell={updateCell}
                              noteOptions={noteOptions}
                              percOptions={percOptions}
                              activeRowRef={activeRowRef}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>

        {showJsonEditor && (
          <div className="w-1/3 h-full flex flex-col border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden transition-all duration-300">
            <div className="bg-black text-white p-2 font-bold uppercase flex justify-between items-center text-xs">
              <span className="flex items-center gap-2"><Code size={14} /> JSON Editor</span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={copyDefaultTemplate} 
                  className="flex items-center gap-1 hover:text-green-400 transition-colors opacity-80 hover:opacity-100"
                  title="Copy Default Template"
                >
                  <Copy size={12} /> <span className="hidden xl:inline">Template</span>
                </button>
                <button onClick={() => setShowJsonEditor(false)} className="hover:text-red-400 transition-colors">✕</button>
              </div>
            </div>
            <textarea
              className="flex-1 p-4 font-mono text-xs resize-none outline-none custom-scrollbar bg-[#f4f4f2]"
              value={jsonText}
              onChange={handleJsonChange}
              onFocus={() => isEditingJson.current = true}
              onBlur={() => {
                isEditingJson.current = false;
                setJsonText(JSON.stringify(song, null, 2));
              }}
              spellCheck={false}
            />
            {jsonError && (
              <div className="bg-red-100 text-red-600 p-2 text-xs border-t-4 border-black font-bold">
                {jsonError}
              </div>
            )}
          </div>
        )}

        {showInstruments && (
          <div className="w-1/3 h-full flex flex-col border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden transition-all duration-300">
            <div className="bg-black text-white p-2 font-bold uppercase flex justify-between items-center text-xs">
              <span className="flex items-center gap-2"><Settings size={14} /> Global Settings</span>
              <button onClick={() => setShowInstruments(false)} className="hover:text-red-400 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#f4f4f2] space-y-6">
              
              {/* Master Reverb */}
              <div className="border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex justify-between items-center mb-3 border-b-2 border-black pb-1">
                  <h3 className="font-black uppercase text-sm">Master Reverb</h3>
                  <button 
                    onClick={() => {
                      if (song.reverb) {
                        const newSong = { ...song };
                        delete newSong.reverb;
                        setSong(newSong);
                      } else {
                        updateGlobalReverb('type', 'hall');
                      }
                    }}
                    className={`text-[10px] font-bold px-2 py-0.5 border-2 border-black ${song.reverb ? 'bg-black text-white' : 'bg-white text-black'}`}
                  >
                    {song.reverb ? 'ON' : 'OFF'}
                  </button>
                </div>
                
                {song.reverb && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase">Reverb Type</label>
                      <select 
                        value={song.reverb.type}
                        onChange={(e) => updateGlobalReverb('type', e.target.value)}
                        className="w-full px-2 py-1 border-2 border-black font-bold text-sm bg-transparent focus:outline-none cursor-pointer"
                      >
                        <option value="amiga_delay">Amiga Delay</option>
                        <option value="hall">Hall</option>
                        <option value="room">Room</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase">Wet Volume ({Math.round((song.reverb.wet_volume ?? 0.2) * 100)}%)</label>
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          value={song.reverb.wet_volume ?? 0.2}
                          onChange={(e) => updateGlobalReverb('wet_volume', parseFloat(e.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase">Delay Steps ({song.reverb.delay_steps ?? 3})</label>
                        <input 
                          type="range" min="1" max="16" step="1" 
                          value={song.reverb.delay_steps ?? 3}
                          onChange={(e) => updateGlobalReverb('delay_steps', parseInt(e.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Channels */}
              {Object.entries(song.channels).map(([channelName, config]) => (
                <div key={channelName} className="border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex justify-between items-center mb-3 border-b-2 border-black pb-1">
                    <h3 className="font-black uppercase text-sm">{channelName}</h3>
                    <button 
                      onClick={() => {
                        audioEngine.setReverb(song.reverb);
                        if (channelName === 'percussion') {
                          // Play a default kick drum for percussion channel test
                          const percConfig = song.perc_types['K'];
                          if (percConfig) {
                            audioEngine.playPercussion(percConfig, audioEngine.currentTime, song, 1, config.panning);
                          }
                        } else {
                          // Play C4 for melodic channels
                          const freq = song.note_frequencies_hz['C4'] || 261.63;
                          audioEngine.playNote(freq, config, audioEngine.currentTime, 500, 1);
                        }
                      }}
                      className="text-[10px] font-bold px-2 py-0.5 border-2 border-black bg-[#f4f4f2] hover:bg-black hover:text-white transition-colors flex items-center gap-1"
                      title="Test Sound"
                    >
                      <Play size={10} fill="currentColor" /> TEST
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase">Oscillator Type</label>
                      <select 
                        value={config.type}
                        onChange={(e) => updateChannelConfig(channelName, 'type', e.target.value)}
                        className="w-full px-2 py-1 border-2 border-black font-bold text-sm bg-transparent focus:outline-none cursor-pointer"
                      >
                        <option value="square">Square</option>
                        <option value="sawtooth">Sawtooth</option>
                        <option value="triangle">Triangle</option>
                        <option value="sine">Sine</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase">Volume ({Math.round(config.volume * 100)}%)</label>
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          value={config.volume}
                          onChange={(e) => updateChannelConfig(channelName, 'volume', parseFloat(e.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase">Pan ({config.panning > 0 ? 'R' : config.panning < 0 ? 'L' : 'C'} {Math.abs(Math.round((config.panning || 0) * 100))})</label>
                        <input 
                          type="range" min="-1" max="1" step="0.01" 
                          value={config.panning || 0}
                          onChange={(e) => updateChannelConfig(channelName, 'panning', parseFloat(e.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase">Octave Shift</label>
                      <input 
                        type="range" min="-3" max="3" step="1" 
                        value={config.octave_multiplier === 0.125 ? -3 : config.octave_multiplier === 0.25 ? -2 : config.octave_multiplier === 0.5 ? -1 : config.octave_multiplier === 1 ? 0 : config.octave_multiplier === 2 ? 1 : config.octave_multiplier === 4 ? 2 : config.octave_multiplier === 8 ? 3 : 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          const mult = val === -3 ? 0.125 : val === -2 ? 0.25 : val === -1 ? 0.5 : val === 0 ? 1 : val === 1 ? 2 : val === 2 ? 4 : 8;
                          updateChannelConfig(channelName, 'octave_multiplier', mult);
                        }}
                        className="w-full accent-black"
                      />
                      <div className="text-[10px] font-bold text-center">{config.octave_multiplier}x</div>
                    </div>

                    <div className="border-t-2 border-black pt-2 mt-2">
                      <label className="text-[10px] font-bold uppercase mb-2 block">Envelope (ADSR)</label>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase opacity-70">Attack ({(config.envelope || {}).attack_ms || 0}ms)</label>
                          <input 
                            type="range" min="0" max="500" step="1" 
                            value={(config.envelope || {}).attack_ms || 0}
                            onChange={(e) => updateChannelConfig(channelName, 'envelope.attack_ms', parseInt(e.target.value))}
                            className="w-full accent-black"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase opacity-70">Decay ({(((config.envelope || {}).decay_ratio || 0.1) * 100).toFixed(0)}%)</label>
                          <input 
                            type="range" min="0.01" max="1" step="0.01" 
                            value={(config.envelope || {}).decay_ratio || 0.1}
                            onChange={(e) => updateChannelConfig(channelName, 'envelope.decay_ratio', parseFloat(e.target.value))}
                            className="w-full accent-black"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase opacity-70">Sustain ({(((config.envelope || {}).sustain_level || 0.5) * 100).toFixed(0)}%)</label>
                          <input 
                            type="range" min="0" max="1" step="0.01" 
                            value={(config.envelope || {}).sustain_level || 0.5}
                            onChange={(e) => updateChannelConfig(channelName, 'envelope.sustain_level', parseFloat(e.target.value))}
                            className="w-full accent-black"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase opacity-70">Release ({(((config.envelope || {}).release_at || 0.1) * 100).toFixed(0)}%)</label>
                          <input 
                            type="range" min="0.1" max="1" step="0.01" 
                            value={(config.envelope || {}).release_at || 0.1}
                            onChange={(e) => updateChannelConfig(channelName, 'envelope.release_at', parseFloat(e.target.value))}
                            className="w-full accent-black"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {inspectedSectionIndex !== null && song.sections[inspectedSectionIndex] && (
          <div className="w-1/3 h-full flex flex-col border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden transition-all duration-300">
            <div className="bg-black text-white p-2 font-bold uppercase flex justify-between items-center text-xs">
              <span className="flex items-center gap-2"><Settings size={14} /> Section: {song.sections[inspectedSectionIndex].label}</span>
              <button onClick={() => setInspectedSectionIndex(null)} className="hover:text-red-400 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#f4f4f2] space-y-6">
              
              {/* Volume Scale */}
              <div className="border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="font-black uppercase text-sm mb-3 border-b-2 border-black pb-1">Section Volume</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase">Volume Scale ({Math.round((song.sections[inspectedSectionIndex].volume_scale || 1) * 100)}%)</label>
                  <input 
                    type="range" min="0.1" max="2" step="0.1" 
                    value={song.sections[inspectedSectionIndex].volume_scale || 1}
                    onChange={(e) => updateSectionConfig(inspectedSectionIndex, 'volume_scale', parseFloat(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>
              </div>

              {/* Reverb Override */}
              <div className="border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex justify-between items-center mb-3 border-b-2 border-black pb-1">
                  <h3 className="font-black uppercase text-sm">Reverb Override</h3>
                  <button 
                    onClick={() => {
                      if (song.sections[inspectedSectionIndex].reverb_override) {
                        updateSectionReverb(inspectedSectionIndex, 'type', undefined); // Remove override
                      } else {
                        updateSectionReverb(inspectedSectionIndex, 'type', 'hall'); // Add override
                      }
                    }}
                    className={`text-[10px] font-bold px-2 py-0.5 border-2 border-black ${song.sections[inspectedSectionIndex].reverb_override ? 'bg-black text-white' : 'bg-white text-black'}`}
                  >
                    {song.sections[inspectedSectionIndex].reverb_override ? 'ON' : 'OFF'}
                  </button>
                </div>
                
                {song.sections[inspectedSectionIndex].reverb_override && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase">Reverb Type</label>
                      <select 
                        value={song.sections[inspectedSectionIndex].reverb_override?.type || 'hall'}
                        onChange={(e) => updateSectionReverb(inspectedSectionIndex, 'type', e.target.value)}
                        className="w-full px-2 py-1 border-2 border-black font-bold text-sm bg-transparent focus:outline-none cursor-pointer"
                      >
                        <option value="amiga_delay">Amiga Delay</option>
                        <option value="hall">Hall</option>
                        <option value="room">Room</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase">Wet Volume ({Math.round((song.sections[inspectedSectionIndex].reverb_override?.wet_volume ?? 0.2) * 100)}%)</label>
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          value={song.sections[inspectedSectionIndex].reverb_override?.wet_volume ?? 0.2}
                          onChange={(e) => updateSectionReverb(inspectedSectionIndex, 'wet_volume', parseFloat(e.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase">Delay Steps ({song.sections[inspectedSectionIndex].reverb_override?.delay_steps ?? 3})</label>
                        <input 
                          type="range" min="1" max="16" step="1" 
                          value={song.sections[inspectedSectionIndex].reverb_override?.delay_steps ?? 3}
                          onChange={(e) => updateSectionReverb(inspectedSectionIndex, 'delay_steps', parseInt(e.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Channel Overrides */}
              <div className="border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="font-black uppercase text-sm mb-3 border-b-2 border-black pb-1">Channel Overrides</h3>
                <div className="space-y-4">
                  {Object.entries(song.channels).map(([channelName, globalConfig]) => {
                    const isOverridden = !!song.sections[inspectedSectionIndex].channel_overrides?.[channelName];
                    const config = isOverridden ? song.sections[inspectedSectionIndex].channel_overrides![channelName] : globalConfig;
                    
                    return (
                      <div key={channelName} className="border-2 border-black p-2">
                        <div className="flex justify-between items-center mb-2 border-b-2 border-black pb-1">
                          <h4 className="font-bold uppercase text-xs">{channelName}</h4>
                          <button 
                            onClick={() => {
                              if (isOverridden) {
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'type', undefined); // Remove
                              } else {
                                // Add override by copying global config
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'type', globalConfig.type);
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'volume', globalConfig.volume);
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'panning', globalConfig.panning || 0);
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.attack_ms', globalConfig.envelope.attack_ms);
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.decay_ratio', globalConfig.envelope.decay_ratio);
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.sustain_level', globalConfig.envelope.sustain_level);
                                updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.release_at', globalConfig.envelope.release_at);
                              }
                            }}
                            className={`text-[9px] font-bold px-1.5 py-0.5 border-2 border-black ${isOverridden ? 'bg-black text-white' : 'bg-white text-black'}`}
                          >
                            {isOverridden ? 'OVERRIDE ON' : 'OVERRIDE OFF'}
                          </button>
                        </div>

                        {isOverridden && (
                          <div className="space-y-3 mt-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold uppercase">Oscillator Type</label>
                              <select 
                                value={config.type}
                                onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'type', e.target.value)}
                                className="w-full px-1 py-0.5 border-2 border-black font-bold text-xs bg-transparent focus:outline-none cursor-pointer"
                              >
                                <option value="square">Square</option>
                                <option value="sawtooth">Sawtooth</option>
                                <option value="triangle">Triangle</option>
                                <option value="sine">Sine</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold uppercase">Vol ({Math.round(config.volume * 100)}%)</label>
                                <input 
                                  type="range" min="0" max="1" step="0.01" 
                                  value={config.volume}
                                  onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'volume', parseFloat(e.target.value))}
                                  className="w-full accent-black"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold uppercase">Pan ({config.panning > 0 ? 'R' : config.panning < 0 ? 'L' : 'C'} {Math.abs(Math.round((config.panning || 0) * 100))})</label>
                                <input 
                                  type="range" min="-1" max="1" step="0.01" 
                                  value={config.panning || 0}
                                  onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'panning', parseFloat(e.target.value))}
                                  className="w-full accent-black"
                                />
                              </div>
                            </div>
                            
                            <div className="border-t-2 border-black pt-1 mt-1">
                              <label className="text-[9px] font-bold uppercase mb-1 block">Envelope</label>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[8px] font-bold uppercase opacity-70">A ({(config.envelope || {}).attack_ms || 0}ms)</label>
                                  <input 
                                    type="range" min="0" max="500" step="1" 
                                    value={(config.envelope || {}).attack_ms || 0}
                                    onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.attack_ms', parseInt(e.target.value))}
                                    className="w-full accent-black"
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[8px] font-bold uppercase opacity-70">D ({(((config.envelope || {}).decay_ratio || 0.1) * 100).toFixed(0)}%)</label>
                                  <input 
                                    type="range" min="0.01" max="1" step="0.01" 
                                    value={(config.envelope || {}).decay_ratio || 0.1}
                                    onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.decay_ratio', parseFloat(e.target.value))}
                                    className="w-full accent-black"
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[8px] font-bold uppercase opacity-70">S ({(((config.envelope || {}).sustain_level || 0.5) * 100).toFixed(0)}%)</label>
                                  <input 
                                    type="range" min="0" max="1" step="0.01" 
                                    value={(config.envelope || {}).sustain_level || 0.5}
                                    onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.sustain_level', parseFloat(e.target.value))}
                                    className="w-full accent-black"
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[8px] font-bold uppercase opacity-70">R ({(((config.envelope || {}).release_at || 0.1) * 100).toFixed(0)}%)</label>
                                  <input 
                                    type="range" min="0.1" max="1" step="0.01" 
                                    value={(config.envelope || {}).release_at || 0.1}
                                    onChange={(e) => updateSectionChannelOverride(inspectedSectionIndex, channelName, 'envelope.release_at', parseFloat(e.target.value))}
                                    className="w-full accent-black"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>

        {showInfo && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#f4f4f2] border-4 border-black p-8 max-w-2xl w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-y-auto max-h-[90vh] custom-scrollbar"
            >
              <div className="flex justify-between items-start mb-6 border-b-4 border-black pb-4">
                <h2 className="text-3xl font-black uppercase">Chip-Tune</h2>
                <EInkButton onClick={() => setShowInfo(false)} className="p-1 border-none shadow-none">✕</EInkButton>
              </div>
              
              <div className="space-y-8">
                <section>
                  <h3 className="text-lg font-bold uppercase mb-2 flex items-center gap-2">
                    <Settings size={18} /> Engine Configuration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(Object.entries(song.channels) as [string, any][]).map(([key, config]) => (
                      <div key={key} className="p-3 border-2 border-black bg-white">
                        <div className="font-black uppercase text-xs mb-1">{key}</div>
                        <div className="text-sm">
                          Type: <span className="font-bold">{config.type}</span>
                          {config.octave_multiplier && <span className="ml-2 opacity-50">({config.octave_multiplier}x Octave)</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs opacity-70 leading-relaxed">
                    The engine defines the core sound synthesis for each channel. Each channel uses a specific oscillator type (Square, Sawtooth, Sine) and optional octave shifting to create the unique Chip-Tune sound.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-black uppercase mb-2">About</h3>
                  <p className="text-sm leading-relaxed">
                    Chip-Tune is a minimalist 8-bit music tracker designed for precision and creative flow. It uses a custom synthesis engine to generate raw, authentic chiptune sounds in real-time.
                  </p>
                  <p className="mt-4 text-xs font-bold opacity-60">
                    Copyright © 2026 Vesa Perasto. All rights reserved.
                  </p>
                </section>
              </div>

              <div className="mt-8 flex justify-end border-t-4 border-black pt-6">
                <EInkButton onClick={() => setShowInfo(false)}>CLOSE</EInkButton>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showLibrary && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#f4f4f2] border-4 border-black p-8 max-w-xl w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex justify-between items-center mb-6 border-b-4 border-black pb-4">
                <h2 className="text-2xl font-black uppercase flex items-center gap-2">
                  <LibraryIcon size={24} /> Library
                </h2>
                <EInkButton onClick={() => setShowLibrary(false)} className="p-1 border-none shadow-none">✕</EInkButton>
              </div>
              
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1 flex items-center border-2 border-black bg-white px-2">
                  <Search size={16} className="opacity-50" />
                  <input 
                    type="text" 
                    placeholder="Search songs..." 
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    className="w-full bg-transparent px-2 py-2 text-sm focus:outline-none"
                  />
                  {librarySearch && (
                    <button onClick={() => setLibrarySearch('')} className="opacity-50 hover:opacity-100">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select 
                    value={librarySort}
                    onChange={(e) => setLibrarySort(e.target.value as any)}
                    className="bg-white border-2 border-black px-3 py-2 text-sm font-bold appearance-none pr-8 cursor-pointer focus:outline-none h-full"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="a-z">A-Z</option>
                    <option value="z-a">Z-A</option>
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {library.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-black/20">
                    <p className="text-sm opacity-50 italic">Your library is empty.</p>
                    <p className="text-xs opacity-40 mt-1">Save your current song to see it here.</p>
                  </div>
                )}
                {library.length > 0 && filteredAndSortedLibrary.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-black/20">
                    <p className="text-sm opacity-50 italic">No songs found matching "{librarySearch}".</p>
                  </div>
                )}
                {filteredAndSortedLibrary.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-3 border-2 border-black bg-white hover:bg-black hover:text-white transition-colors group">
                    {renamingLibrarySong === s.name ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input 
                          autoFocus
                          value={newLibrarySongName}
                          onChange={(e) => setNewLibrarySongName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameInLibrary(s.name, newLibrarySongName);
                            if (e.key === 'Escape') setRenamingLibrarySong(null);
                          }}
                          className="flex-1 bg-white text-black border-2 border-black px-2 py-1 text-sm font-bold focus:outline-none"
                        />
                        <button 
                          onClick={() => renameInLibrary(s.name, newLibrarySongName)}
                          className="p-1 hover:text-green-500 transition-all text-white"
                        >
                          <Check size={20} />
                        </button>
                        <button 
                          onClick={() => setRenamingLibrarySong(null)}
                          className="p-1 hover:text-red-500 transition-all text-white"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : confirmDeleteSong === s.name ? (
                      <div className="flex-1 flex items-center justify-between text-red-500 font-bold text-sm">
                        <span className="truncate pr-2">Delete "{s.name}"?</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={() => {
                              deleteFromLibrary(s.name);
                              setConfirmDeleteSong(null);
                            }}
                            className="px-3 py-1 bg-red-500 text-white hover:bg-red-600 border-2 border-red-500"
                          >
                            YES
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteSong(null)}
                            className="px-3 py-1 border-2 border-red-500 hover:bg-red-500 hover:text-white"
                          >
                            NO
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={() => { setSong(s); setCurrentStep(0); setCurrentSectionIndex(0); setShowLibrary(false); }}
                          className="flex-1 text-left flex flex-col overflow-hidden"
                        >
                          <span className="font-bold truncate w-full">{s.name}</span>
                          {s.info && <span className="text-[10px] opacity-70 font-normal truncate w-full">{s.info}</span>}
                        </button>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all shrink-0">
                          <button 
                            onClick={() => {
                              setRenamingLibrarySong(s.name);
                              setNewLibrarySongName(s.name);
                            }}
                            className="p-1 hover:text-blue-400 transition-all"
                            title="Rename"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteSong(s.name)}
                            className="p-1 hover:text-red-500 transition-all"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              
              <div className="mt-8 flex justify-end">
                <EInkButton onClick={() => setShowLibrary(false)}>CLOSE</EInkButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 12px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f4f4f2;
          border-left: 2px solid black;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: black;
          border: 2px solid #f4f4f2;
        }
        select {
          -webkit-appearance: none;
          -moz-appearance: none;
          text-indent: 1px;
          text-overflow: '';
        }
      `}</style>
    </div>
  );
}
