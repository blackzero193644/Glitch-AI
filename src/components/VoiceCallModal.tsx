import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Loader2,
  Radio,
  Sliders,
  Play,
  Square,
  Check,
  Edit2,
  X,
} from 'lucide-react';
import { GlitchVoiceId, UserProfile, VoiceOption } from '../types';
import { apiFetch } from '../lib/api';
import { GLITCH_EMBLEM_SRC } from '../lib/assets';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
}

interface CallTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SELECTED_VOICE_KEY = 'glitch_ai_selected_voice_v1';
const VOICE_NAMES_KEY = 'glitch_ai_voice_names_v1';

const FALLBACK_VOICES: VoiceOption[] = [
  { id: 'sarah', name: 'Sarah', style: 'Warm & Engaged Conversational', gender: 'female', referenceId: '933563129e564b19a115bedd57b7406a' },
  { id: 'hannah', name: 'Hannah', style: 'Natural Dialogue Specialist', gender: 'female', referenceId: '9a9cf47702da476aa4629e2506d4a857' },
  { id: 'selene', name: 'Selene', style: 'Calm & Meditative', gender: 'female', referenceId: 'b347db033a6549378b48d00acb0d06cd' },
  { id: 'alle', name: 'Alle', style: 'Bright & Friendly', gender: 'female', referenceId: '59e9dc1cb20c452584788a2690c80970' },
  { id: 'lyra', name: 'Lyra', style: 'Soft & Relaxed', gender: 'female', referenceId: 'a3b3f0a9c49340bd8fa722d83c81cb08' },
  { id: 'ethan', name: 'Ethan', style: 'Clear & Curious Explainer', gender: 'male', referenceId: '536d3a5e000945adb7038665781a4aca' },
  { id: 'adrian', name: 'Adrian', style: 'Steady & Reliable Narrator', gender: 'male', referenceId: 'bf322df2096a46f18c579d0baa36f41d' },
  { id: 'verity', name: 'Verity', style: 'Friendly & Expressive', gender: 'male', referenceId: '711cf3ed00ab441a8f54a45058047b7a' },
  { id: 'guyzo', name: 'Guyzo', style: 'Deep & Confident', gender: 'male', referenceId: '8ec9973300874562962bbcb300f82213' },
  { id: 'polo', name: 'Polo', style: 'Rich Studio Warmth', gender: 'male', referenceId: 'f48d143a59a946ab87c0130fd081f349' },
  { id: 'kai', name: 'Kai', style: 'Youthful & Upbeat', gender: 'male', referenceId: '802e3bc2b27e49c2995d23ef70e6ac89' },
  { id: 'slax', name: 'Slax', style: 'Crisp & Measured', gender: 'male', referenceId: 'c5f56a6cc2ec4fa8920cb4c5889a3fb7' },
];

function isLikelySelfEcho(heardText: string, lastAiText: string, endedAt: number): boolean {
  if (!heardText || !lastAiText) return false;
  if (Date.now() - endedAt > 6500) return false;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

  const heardWords = norm(heardText);
  const aiWords = norm(lastAiText);
  if (heardWords.length === 0 || aiWords.length === 0) return false;

  const aiJoined = aiWords.join(' ');
  const heardJoined = heardWords.join(' ');
  if (heardJoined.length >= 8 && aiJoined.includes(heardJoined)) {
    return true;
  }

  const aiSet = new Set(aiWords);
  let overlap = 0;
  for (const w of heardWords) {
    if (aiSet.has(w)) overlap++;
  }
  return overlap / heardWords.length >= 0.62 && heardWords.length <= aiWords.length + 3;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  isOpen,
  onClose,
  userProfile,
}) => {
  const [status, setStatus] = useState<'listening' | 'thinking' | 'speaking' | 'muted'>('listening');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>(FALLBACK_VOICES);
  const [selectedVoice, setSelectedVoice] = useState<GlitchVoiceId>(() => {
    try {
      return localStorage.getItem(SELECTED_VOICE_KEY) || 'sarah';
    } catch {
      return 'sarah';
    }
  });
  const [voiceAliases, setVoiceAliases] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(VOICE_NAMES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState('');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const [durationSec, setDurationSec] = useState(0);
  const [turns, setTurns] = useState<CallTurn[]>([
    {
      id: 'greet_0',
      role: 'assistant',
      content: 'Hey! I am live on the call with you. Go ahead and speak whenever you are ready.',
    },
  ]);
  const [liveHint, setLiveHint] = useState('');
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [manualText, setManualText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const stopCurrentRecorderRef = useRef<((discard: boolean) => void) | null>(null);
  const forceSendCurrentRecorderRef = useRef<(() => void) | null>(null);

  const isOpenRef = useRef(isOpen);
  const isMicMutedRef = useRef(isMicMuted);
  const isSpeakerMutedRef = useRef(isSpeakerMuted);
  const statusRef = useRef(status);
  const turnsRef = useRef(turns);
  const voiceRef = useRef(selectedVoice);
  const callEpochRef = useRef(0);
  const speakingEpochRef = useRef(0);
  const inFlightTurnRef = useRef(false);
  const turnAbortRef = useRef<AbortController | null>(null);
  const lastSubmittedRef = useRef<{ text: string; ts: number }>({ text: '', ts: 0 });
  const lastAssistantSpokenRef = useRef<{ text: string; endedAt: number }>({ text: '', endedAt: 0 });
  const playbackStartedAtRef = useRef(0);
  const noiseFloorRef = useRef(0.012);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
  }, [isSpeakerMuted]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    voiceRef.current = selectedVoice;
    try {
      localStorage.setItem(SELECTED_VOICE_KEY, selectedVoice);
    } catch {}
  }, [selectedVoice]);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_NAMES_KEY, JSON.stringify(voiceAliases));
    } catch {}
  }, [voiceAliases]);

  useEffect(() => {
    turnsRef.current = turns;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiFetch('/api/voices')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.voices) && data.voices.length > 0) {
          setVoices(data.voices);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDurationSec(0);
      return;
    }
    const timer = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const getVoiceDisplayName = (v: VoiceOption) => voiceAliases[v.id] || v.name;
  const activeVoiceObj =
    voices.find((v) => v.id === selectedVoice || v.referenceId === selectedVoice) || voices[0];

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
    setPreviewingVoiceId(null);
  };

  const stopAudio = () => {
    speakingEpochRef.current += 1;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      if (audioRef.current !== persistentAudioRef.current) {
        audioRef.current.src = '';
      } else {
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const unlockAudioContext = async () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }
    try {
      if (!persistentAudioRef.current) {
        persistentAudioRef.current = new Audio();
        persistentAudioRef.current.preload = 'auto';
      }
      if (!audioUnlockedRef.current) {
        const el = persistentAudioRef.current;
        el.muted = true;
        // Silent minimal WAV frame to unlock HTMLAudioElement inside user gesture
        el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        await el.play().catch(() => {});
        el.pause();
        el.muted = isSpeakerMutedRef.current;
        el.removeAttribute('src');
        el.load();
        audioUnlockedRef.current = true;
      }
    } catch {}
  };

  const cleanupPersistentMic = () => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (stopCurrentRecorderRef.current) {
      stopCurrentRecorderRef.current(true);
      stopCurrentRecorderRef.current = null;
    }
    forceSendCurrentRecorderRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsSpeechDetected(false);
    setMicLevel(0);
  };

  const ensurePersistentMic = async (): Promise<boolean> => {
    const hasLiveTrack =
      mediaStreamRef.current &&
      mediaStreamRef.current.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled);

    if (hasLiveTrack) {
      await unlockAudioContext();
      return true;
    }

    // Clean up any stale ended tracks/context before reacquiring
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (!isOpenRef.current || isMicMutedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      mediaStreamRef.current = stream;

      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.35;
        source.connect(analyser);
        analyserRef.current = analyser;
      }
      return true;
    } catch {
      setErrorText('Microphone access blocked. Allow mic access or type below during the call.');
      setStatus('muted');
      statusRef.current = 'muted';
      return false;
    }
  };

  const startRecordingCycle = async (epoch: number) => {
    if (!isOpenRef.current || isMicMutedRef.current || epoch !== callEpochRef.current) return;
    if (inFlightTurnRef.current) return;

    // Discard any prior active recorder safely inside its own closure
    if (stopCurrentRecorderRef.current) {
      stopCurrentRecorderRef.current(true);
      stopCurrentRecorderRef.current = null;
    }

    const ready = await ensurePersistentMic();
    if (!ready || !mediaStreamRef.current || !isOpenRef.current || isMicMutedRef.current || epoch !== callEpochRef.current) {
      return;
    }

    const stream = mediaStreamRef.current;
    const preferredMime =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

    const rec = preferredMime
      ? new MediaRecorder(stream, { mimeType: preferredMime })
      : new MediaRecorder(stream);
    const localChunks: Blob[] = [];
    let localDiscard = false;
    let localStopped = false;
    let localHeardSpeech = false;
    let localManualForce = false;

    stopCurrentRecorderRef.current = (discard: boolean) => {
      localDiscard = discard;
      if (!localStopped && rec.state !== 'inactive') {
        localStopped = true;
        try {
          rec.stop();
        } catch {}
      }
    };

    forceSendCurrentRecorderRef.current = () => {
      unlockAudioContext();
      if (!localStopped && rec.state === 'recording') {
        localDiscard = false;
        localManualForce = true;
        localStopped = true;
        try {
          rec.stop();
        } catch {}
      }
    };

    rec.ondataavailable = (e) => {
      if (e.data.size > 0 && !localDiscard) {
        localChunks.push(e.data);
      }
    };

    rec.onstop = async () => {
      const audioBlob = new Blob(localChunks, { type: rec.mimeType || preferredMime || 'audio/webm' });

      if (
        localDiscard ||
        epoch !== callEpochRef.current ||
        !isOpenRef.current ||
        inFlightTurnRef.current ||
        (!localHeardSpeech && !localManualForce) ||
        audioBlob.size < 450
      ) {
        if (localManualForce && audioBlob.size < 450 && !localDiscard) {
          setLiveHint('Hold or speak a bit longer before tapping Send.');
          setTimeout(() => setLiveHint((h) => (h.includes('Hold') ? '' : h)), 2200);
        }
        if (
          epoch === callEpochRef.current &&
          isOpenRef.current &&
          !isMicMutedRef.current &&
          !inFlightTurnRef.current &&
          statusRef.current === 'listening'
        ) {
          setTimeout(() => startRecordingCycle(epoch), 160);
        }
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        if (epoch !== callEpochRef.current || !isOpenRef.current || inFlightTurnRef.current) return;
        const base64 = reader.result as string;

        inFlightTurnRef.current = true;
        setStatus('thinking');
        statusRef.current = 'thinking';
        setMicLevel(0);
        setLiveHint('Responding...');

        const abortController = new AbortController();
        turnAbortRef.current = abortController;

        try {
          const callRes = await apiFetch('/api/call-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioData: base64,
              mimeType: audioBlob.type,
              messages: turnsRef.current.slice(-8).map((t) => ({ role: t.role, content: t.content })),
              voice: voiceRef.current,
              userProfile,
              lastAiText: lastAssistantSpokenRef.current.text,
              lastAiEndedAgoMs: Date.now() - lastAssistantSpokenRef.current.endedAt,
            }),
            signal: abortController.signal,
          });
          const data = await callRes.json().catch(() => ({}));
          setLiveHint('');

          if (!callRes.ok) {
            throw new Error(data.error || 'Voice call connection interrupted.');
          }

          if (epoch !== callEpochRef.current || !isOpenRef.current) {
            inFlightTurnRef.current = false;
            return;
          }

          if (data.ignoredEcho || data.empty || !data.userText) {
            inFlightTurnRef.current = false;
            turnAbortRef.current = null;
            if (data.empty) {
              setLiveHint("Didn't catch clear words — speak closer or tap Orb to send.");
              setTimeout(() => setLiveHint((h) => (h.includes("Didn't catch") ? '' : h)), 2200);
            }
            if (!isMicMutedRef.current) {
              setStatus('listening');
              statusRef.current = 'listening';
              startRecordingCycle(epoch);
            } else {
              setStatus('muted');
              statusRef.current = 'muted';
            }
            return;
          }

          const userTurn: CallTurn = {
            id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'user',
            content: data.userText,
          };
          const replyText = (data.text || 'Got it.').trim();
          const botTurn: CallTurn = {
            id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            content: replyText,
          };

          const updated = [...turnsRef.current, userTurn, botTurn];
          turnsRef.current = updated;
          setTurns(updated);
          inFlightTurnRef.current = false;
          turnAbortRef.current = null;
          setErrorText(null);

          await playAssistantReply(replyText, data, epoch);
        } catch (trErr: any) {
          inFlightTurnRef.current = false;
          turnAbortRef.current = null;
          setLiveHint('');
          if (trErr?.name === 'AbortError' || epoch !== callEpochRef.current || !isOpenRef.current) {
            return;
          }
          setErrorText(trErr?.message || 'Speech recognition had trouble — please try again.');
          if (!isMicMutedRef.current) {
            setStatus('listening');
            statusRef.current = 'listening';
            startRecordingCycle(epoch);
          } else {
            setStatus('muted');
            statusRef.current = 'muted';
          }
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    try {
      rec.start(100);
      setStatus('listening');
      statusRef.current = 'listening';
      setIsSpeechDetected(false);
    } catch {
      return;
    }

    // Continuous VAD + Speaking Barge-In Monitor on persistent stream
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }

    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.fftSize);
    let silenceStart = 0;
    let speechStartedAt = 0;
    let bargeInSpeechMs = 0;
    let lastMonitorTs = Date.now();
    let lastUiLevelTs = 0;
    let zeroSignalMs = 0;
    let zeroWarned = false;
    let triedAutoResume = false;
    const cycleStartTs = Date.now();

    const monitor = () => {
      if (!isOpenRef.current || isMicMutedRef.current || epoch !== callEpochRef.current) return;

      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended' && !triedAutoResume) {
        triedAutoResume = true;
        ctx.resume().catch(() => {});
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = Math.abs((dataArray[i] - 128) / 128);
        sumSq += v * v;
        if (v > peak) peak = v;
      }
      const rms = Math.sqrt(sumSq / dataArray.length);
      const now = Date.now();
      const dt = Math.min(100, now - lastMonitorTs);
      lastMonitorTs = now;

      // Update visible mic level bar at ~15fps so UI shows live mic response smoothly
      if (now - lastUiLevelTs > 65) {
        lastUiLevelTs = now;
        const normalized = Math.min(100, Math.round(Math.max(rms * 420, peak * 180)));
        setMicLevel(normalized);
      }

      // Detect if AudioContext is suspended or hardware mic is feeding flat zero audio
      if (statusRef.current === 'listening' && rms < 0.0005 && peak < 0.002) {
        zeroSignalMs += dt;
        if (zeroSignalMs > 3800 && !zeroWarned) {
          zeroWarned = true;
          setLiveHint('Mic signal silent — tap Orb/Send or check your device microphone');
        }
      } else {
        zeroSignalMs = 0;
        if (zeroWarned) {
          zeroWarned = false;
          setLiveHint((h) => (h.includes('Mic signal silent') ? '' : h));
        }
      }

      // Adapt ambient noise floor gently after initial 220ms settle, clamped so shouting/loud rooms stay triggerable
      if (statusRef.current === 'listening' && !localHeardSpeech && now - cycleStartTs > 220 && rms < 0.028) {
        const nextFloor = noiseFloorRef.current * 0.94 + rms * 0.06;
        noiseFloorRef.current = Math.max(0.003, Math.min(0.022, nextFloor));
      }

      if (statusRef.current === 'listening' && rec.state === 'recording' && !localStopped) {
        const speechThreshold = Math.max(0.011, noiseFloorRef.current * 1.65);
        const isVoiceActive = rms > speechThreshold || peak > speechThreshold * 2.4;

        if (isVoiceActive) {
          if (!localHeardSpeech) {
            localHeardSpeech = true;
            speechStartedAt = now;
          }
          silenceStart = 0;
          setIsSpeechDetected(true);

          // Cap max continuous recording at 24s so long monologues get transcribed cleanly
          if (now - speechStartedAt > 24000) {
            localDiscard = false;
            localStopped = true;
            try {
              rec.stop();
            } catch {}
            return;
          }
        } else if (localHeardSpeech) {
          setIsSpeechDetected(false);
          if (!silenceStart) {
            silenceStart = now;
          } else if (now - silenceStart > 420) {
            localDiscard = false;
            localStopped = true;
            try {
              rec.stop();
            } catch {}
            return;
          }
        } else if (now - cycleStartTs > 14000) {
          // Silently recycle idle buffer every 14s
          localDiscard = true;
          localStopped = true;
          try {
            rec.stop();
          } catch {}
          return;
        }
      } else if (statusRef.current === 'speaking') {
        // Real-time Barge-In detection while Glitch AI is speaking
        const elapsedSincePlay = now - playbackStartedAtRef.current;
        const bargeThreshold = Math.max(0.055, noiseFloorRef.current * 3.2);
        if (elapsedSincePlay > 300 && (rms > bargeThreshold || peak > 0.25)) {
          bargeInSpeechMs += dt;
          if (bargeInSpeechMs >= 180) {
            bargeInSpeechMs = 0;
            interruptAiAndListen();
            return;
          }
        } else {
          bargeInSpeechMs = Math.max(0, bargeInSpeechMs - dt * 0.5);
        }
      }

      vadRafRef.current = requestAnimationFrame(monitor);
    };

    vadRafRef.current = requestAnimationFrame(monitor);
  };

  const interruptAiAndListen = () => {
    stopAudio();
    lastAssistantSpokenRef.current = {
      ...lastAssistantSpokenRef.current,
      endedAt: Date.now(),
    };
    if (turnAbortRef.current) {
      turnAbortRef.current.abort();
      turnAbortRef.current = null;
    }
    inFlightTurnRef.current = false;

    if (!isOpenRef.current) return;
    if (isMicMutedRef.current) {
      setStatus('muted');
      statusRef.current = 'muted';
      return;
    }
    setStatus('listening');
    statusRef.current = 'listening';
    startRecordingCycle(callEpochRef.current);
  };

  useEffect(() => {
    if (!isOpen) {
      callEpochRef.current += 1;
      if (turnAbortRef.current) {
        turnAbortRef.current.abort();
        turnAbortRef.current = null;
      }
      inFlightTurnRef.current = false;
      stopPreviewAudio();
      stopAudio();
      cleanupPersistentMic();
      return;
    }

    callEpochRef.current += 1;
    const epoch = callEpochRef.current;
    setErrorText(null);
    setLiveHint('');
    inFlightTurnRef.current = false;

    if (!isMicMutedRef.current) {
      startRecordingCycle(epoch);
    } else {
      setStatus('muted');
      statusRef.current = 'muted';
    }

    return () => {
      callEpochRef.current += 1;
      if (turnAbortRef.current) {
        turnAbortRef.current.abort();
        turnAbortRef.current = null;
      }
      inFlightTurnRef.current = false;
      stopPreviewAudio();
      stopAudio();
      cleanupPersistentMic();
    };
  }, [isOpen]);

  const toggleMicMute = () => {
    unlockAudioContext();
    const next = !isMicMuted;
    setIsMicMuted(next);
    isMicMutedRef.current = next;
    if (next) {
      cleanupPersistentMic();
      if (status === 'listening') {
        setStatus('muted');
        statusRef.current = 'muted';
      }
    } else {
      setStatus('listening');
      statusRef.current = 'listening';
      startRecordingCycle(callEpochRef.current);
    }
  };

  const toggleSpeakerMute = () => {
    const next = !isSpeakerMuted;
    setIsSpeakerMuted(next);
    isSpeakerMutedRef.current = next;
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
    if (next && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const playAssistantReply = async (replyText: string, data: any, epoch: number) => {
    if (!isOpenRef.current || epoch !== callEpochRef.current) return;

    lastAssistantSpokenRef.current = {
      text: replyText,
      endedAt: Date.now(),
    };

    const resumeAfterSpeaking = () => {
      if (!isOpenRef.current || epoch !== callEpochRef.current) return;
      lastAssistantSpokenRef.current = {
        text: replyText,
        endedAt: Date.now(),
      };
      if (isMicMutedRef.current) {
        setStatus('muted');
        statusRef.current = 'muted';
      } else {
        // Brief echo cooldown before re-opening mic
        setTimeout(() => {
          if (isOpenRef.current && epoch === callEpochRef.current && !isMicMutedRef.current && !inFlightTurnRef.current) {
            setStatus('listening');
            statusRef.current = 'listening';
            startRecordingCycle(epoch);
          }
        }, 220);
      }
    };

    if (data.audioBase64 && !isSpeakerMutedRef.current) {
      stopAudio();
      const mySpeakEpoch = speakingEpochRef.current;
      setStatus('speaking');
      statusRef.current = 'speaking';
      playbackStartedAtRef.current = Date.now();

      // Keep barge-in monitor alive while speaking if mic is unmuted
      if (!isMicMutedRef.current && vadRafRef.current === null && analyserRef.current) {
        const analyser = analyserRef.current;
        const buf = new Uint8Array(analyser.fftSize);
        let speechMs = 0;
        let lastT = Date.now();
        const watchBargeIn = () => {
          if (!isOpenRef.current || epoch !== callEpochRef.current || speakingEpochRef.current !== mySpeakEpoch || statusRef.current !== 'speaking' || isMicMutedRef.current) {
            return;
          }
          analyser.getByteTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          const now = Date.now();
          const dt = Math.min(100, now - lastT);
          lastT = now;

          if (now - playbackStartedAtRef.current > 300 && rms > Math.max(0.062, noiseFloorRef.current * 3.4)) {
            speechMs += dt;
            if (speechMs >= 200) {
              interruptAiAndListen();
              return;
            }
          } else {
            speechMs = Math.max(0, speechMs - dt * 0.5);
          }
          vadRafRef.current = requestAnimationFrame(watchBargeIn);
        };
        vadRafRef.current = requestAnimationFrame(watchBargeIn);
      }

      const audio = persistentAudioRef.current || new Audio();
      persistentAudioRef.current = audio;
      audio.muted = isSpeakerMutedRef.current;
      audio.playbackRate = 1.0;
      audio.src = `data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`;
      audioRef.current = audio;
      audio.onended = () => {
        if (speakingEpochRef.current === mySpeakEpoch) {
          resumeAfterSpeaking();
        }
      };
      audio.onerror = () => {
        if (speakingEpochRef.current === mySpeakEpoch) {
          resumeAfterSpeaking();
        }
      };
      try {
        await audio.play();
      } catch {
        // Fallback cleanly to SpeechSynthesis if browser blocked HTMLAudioElement before gesture
        if (speakingEpochRef.current === mySpeakEpoch && 'speechSynthesis' in window) {
          const utt = new SpeechSynthesisUtterance(replyText);
          utt.onend = () => {
            if (speakingEpochRef.current === mySpeakEpoch) resumeAfterSpeaking();
          };
          utt.onerror = () => {
            if (speakingEpochRef.current === mySpeakEpoch) resumeAfterSpeaking();
          };
          window.speechSynthesis.speak(utt);
        } else if (speakingEpochRef.current === mySpeakEpoch) {
          resumeAfterSpeaking();
        }
      }
    } else if (!isSpeakerMutedRef.current && 'speechSynthesis' in window) {
      stopAudio();
      const mySpeakEpoch = speakingEpochRef.current;
      setStatus('speaking');
      statusRef.current = 'speaking';
      playbackStartedAtRef.current = Date.now();
      const utt = new SpeechSynthesisUtterance(replyText);
      utt.onend = () => {
        if (speakingEpochRef.current === mySpeakEpoch) resumeAfterSpeaking();
      };
      utt.onerror = () => {
        if (speakingEpochRef.current === mySpeakEpoch) resumeAfterSpeaking();
      };
      window.speechSynthesis.speak(utt);
    } else {
      resumeAfterSpeaking();
    }
  };

  const sendVoiceTurn = async (spokenText: string, epochOverride?: number) => {
    const trimmed = spokenText.trim();
    const epoch = epochOverride ?? callEpochRef.current;
    if (!trimmed || epoch !== callEpochRef.current || !isOpenRef.current) return;

    // Strict Single-Flight & 3.5s Duplicate Guard — prevents double replies completely
    const now = Date.now();
    if (inFlightTurnRef.current) return;
    if (
      lastSubmittedRef.current.text.toLowerCase() === trimmed.toLowerCase() &&
      now - lastSubmittedRef.current.ts < 3500
    ) {
      if (!isMicMutedRef.current) startRecordingCycle(epoch);
      return;
    }

    inFlightTurnRef.current = true;
    lastSubmittedRef.current = { text: trimmed, ts: now };

    if (stopCurrentRecorderRef.current) {
      stopCurrentRecorderRef.current(true);
      stopCurrentRecorderRef.current = null;
    }
    stopPreviewAudio();
    stopAudio();
    setErrorText(null);
    setLiveHint('');

    const userTurn: CallTurn = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: trimmed,
    };

    const nextTurns = [...turnsRef.current, userTurn];
    turnsRef.current = nextTurns;
    setTurns(nextTurns);
    setStatus('thinking');
    statusRef.current = 'thinking';

    const abortController = new AbortController();
    turnAbortRef.current = abortController;

    try {
      const res = await apiFetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
          voice: voiceRef.current,
          userProfile,
        }),
        signal: abortController.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Voice call connection interrupted.');
      }

      if (epoch !== callEpochRef.current || !isOpenRef.current) {
        inFlightTurnRef.current = false;
        return;
      }

      const replyText = (data.text || 'Got it.').trim();
      const botTurn: CallTurn = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: replyText,
      };
      const updated = [...turnsRef.current, botTurn];
      turnsRef.current = updated;
      setTurns(updated);
      inFlightTurnRef.current = false;
      turnAbortRef.current = null;

      await playAssistantReply(replyText, data, epoch);
    } catch (err: any) {
      inFlightTurnRef.current = false;
      turnAbortRef.current = null;
      if (err?.name === 'AbortError' || epoch !== callEpochRef.current || !isOpenRef.current) {
        return;
      }
      setErrorText(err.message || 'Voice call error. Please try speaking again.');
      if (!isMicMutedRef.current) {
        setStatus('listening');
        statusRef.current = 'listening';
        startRecordingCycle(epoch);
      } else {
        setStatus('muted');
        statusRef.current = 'muted';
      }
    }
  };

  const handlePreviewVoice = async (v: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewingVoiceId === v.id) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();
    setPreviewingVoiceId(v.id);
    try {
      const displayName = getVoiceDisplayName(v);
      const res = await apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hello, I am ${displayName}, speaking on Glitch AI.`,
          voice: v.id,
        }),
      });
      if (!res.ok) {
        setPreviewingVoiceId(null);
        return;
      }
      const data = await res.json();
      if (data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
        previewAudioRef.current = audio;
        audio.onended = () => setPreviewingVoiceId(null);
        audio.onerror = () => setPreviewingVoiceId(null);
        await audio.play().catch(() => setPreviewingVoiceId(null));
      } else {
        setPreviewingVoiceId(null);
      }
    } catch {
      setPreviewingVoiceId(null);
    }
  };

  const saveVoiceRename = (voiceId: string) => {
    const trimmed = editingAliasValue.trim();
    if (trimmed) {
      setVoiceAliases((prev) => ({ ...prev, [voiceId]: trimmed.slice(0, 28) }));
    }
    setEditingVoiceId(null);
  };

  if (!isOpen) return null;

  const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const secs = String(durationSec % 60).padStart(2, '0');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onPointerDown={() => unlockAudioContext()}
    >
      <div className="w-full max-w-lg rounded-3xl bg-gradient-to-b from-[#0a0f24] via-[#060814] to-[#04050c] border border-cyan-500/25 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative">
        {/* Top Call Header */}
        <div className="px-5 py-4 border-b border-[#192241] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#04060f] border border-cyan-500/35 flex items-center justify-center p-1 shadow-sm shrink-0">
              <img
                src={GLITCH_EMBLEM_SRC}
                alt="Glitch AI"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white font-display truncate">
                Glitch AI Voice Call
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                {mins}:{secs} ·{' '}
                {status === 'listening'
                  ? isSpeechDetected
                    ? 'Hearing you...'
                    : 'Listening...'
                  : status === 'thinking'
                  ? 'Thinking...'
                  : status === 'speaking'
                  ? 'Speaking (Speak to interrupt)'
                  : 'Mic Muted'}
              </div>
            </div>
          </div>

          {/* Voice Manager Trigger */}
          <button
            type="button"
            onClick={() => setShowVoiceDrawer(!showVoiceDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer shrink-0 ${
              showVoiceDrawer
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                : 'bg-[#04060f] border-[#1d284b] hover:border-cyan-500/50 text-slate-200'
            }`}
            title="Select, preview, or rename voices"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="max-w-[100px] truncate">
              {activeVoiceObj ? getVoiceDisplayName(activeVoiceObj) : 'Voice'}
            </span>
          </button>
        </div>

        {/* Voice Management Drawer (All Available Voices + Preview + Select + Rename) */}
        {showVoiceDrawer && (
          <div className="border-b border-[#192241] bg-[#050814] px-4 py-3 max-h-64 overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs font-semibold text-white">
                  Voice Selection & Management
                </div>
                <div className="text-[10px] text-slate-400">
                  Locked consistently across every reply · Rename any voice for your profile
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVoiceDrawer(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {voices.map((v) => {
                const isSelected = selectedVoice === v.id || selectedVoice === v.referenceId;
                const displayName = getVoiceDisplayName(v);
                const isEditing = editingVoiceId === v.id;
                const isPreviewing = previewingVoiceId === v.id;

                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      if (!isEditing) {
                        setSelectedVoice(v.id);
                      }
                    }}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400/60 text-white'
                        : 'bg-[#090d1f] border-[#192241] hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingAliasValue}
                            onChange={(e) => setEditingAliasValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveVoiceRename(v.id);
                              if (e.key === 'Escape') setEditingVoiceId(null);
                            }}
                            className="w-full bg-[#04060f] border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                            autoFocus
                            maxLength={28}
                          />
                          <button
                            type="button"
                            onClick={() => saveVoiceRename(v.id)}
                            className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                            <span>{displayName}</span>
                            {isSelected && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{v.style}</div>
                        </>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handlePreviewVoice(v, e)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isPreviewing
                              ? 'bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-300'
                              : 'bg-[#04060f] border-[#1d284b] text-slate-300 hover:text-cyan-300'
                          }`}
                          title={isPreviewing ? 'Stop preview' : 'Preview voice'}
                        >
                          {isPreviewing ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingVoiceId(v.id);
                            setEditingAliasValue(displayName);
                          }}
                          className="p-1.5 rounded-lg bg-[#04060f] border border-[#1d284b] text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title="Rename voice"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Center Animated Orb */}
        <div className="py-5 flex flex-col items-center justify-center relative">
          <button
            type="button"
            onClick={() => {
              if (status === 'listening' && forceSendCurrentRecorderRef.current) {
                forceSendCurrentRecorderRef.current();
              } else if (status === 'speaking' || status === 'thinking') {
                interruptAiAndListen();
              }
            }}
            title={
              status === 'listening'
                ? 'Tap to send speech immediately'
                : status === 'speaking' || status === 'thinking'
                ? 'Tap to interrupt and speak'
                : 'Glitch AI Voice'
            }
            className={`w-26 h-26 rounded-full flex items-center justify-center transition-all duration-300 relative cursor-pointer ${
              status === 'speaking'
                ? 'bg-gradient-to-tr from-cyan-500 via-indigo-500 to-fuchsia-500 shadow-lg shadow-cyan-500/35 scale-105'
                : status === 'thinking'
                ? 'bg-gradient-to-tr from-indigo-600 to-fuchsia-600 shadow-lg shadow-fuchsia-500/25'
                : status === 'listening'
                ? isSpeechDetected
                  ? 'bg-gradient-to-tr from-cyan-500 to-fuchsia-500 shadow-lg shadow-cyan-400/40 scale-105'
                  : 'bg-[#0b1024] border-2 border-cyan-400/60 shadow-lg shadow-cyan-950/50'
                : 'bg-slate-900 border border-slate-700'
            }`}
          >
            {status === 'listening' && isSpeechDetected && (
              <span className="absolute -inset-2 rounded-full border-2 border-cyan-400/60 animate-ping" />
            )}
            {status === 'speaking' && (
              <span className="absolute -inset-2 rounded-full border-2 border-fuchsia-400/50 animate-pulse" />
            )}
            {status === 'thinking' ? (
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            ) : (
              <img
                src={GLITCH_EMBLEM_SRC}
                alt="Glitch AI Orb"
                className="w-15 h-15 object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]"
              />
            )}
          </button>

          {status === 'listening' && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="w-36 h-1.5 rounded-full bg-[#0d142c] overflow-hidden border border-[#1d284b]">
                <div
                  className={`h-full w-full origin-left transition-transform duration-75 ${
                    isSpeechDetected
                      ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500'
                      : 'bg-cyan-500/50'
                  }`}
                  style={{ transform: `scaleX(${Math.max(0.04, micLevel / 100)})` }}
                />
              </div>
              <button
                type="button"
                onClick={() => forceSendCurrentRecorderRef.current?.()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0d142c] hover:bg-[#141f42] border border-cyan-500/35 text-[11px] font-medium text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Radio className="w-3 h-3" />
                <span>{isSpeechDetected ? 'Tap to Send Now' : 'Send Speech Now'}</span>
              </button>
            </div>
          )}

          {status === 'speaking' && (
            <button
              type="button"
              onClick={interruptAiAndListen}
              className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#160b2c] hover:bg-[#221142] border border-fuchsia-500/35 text-[11px] font-medium text-fuchsia-300 transition-colors cursor-pointer"
            >
              <span>Speak or tap here to interrupt</span>
            </button>
          )}

          {liveHint && (
            <div className="mt-2.5 px-4 py-1 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 max-w-xs truncate">
              {liveHint}
            </div>
          )}

          {errorText && (
            <div className="mt-2.5 px-4 text-xs text-rose-300 text-center">{errorText}</div>
          )}
        </div>

        {/* Live Transcript Feed */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 pb-3 space-y-2.5 min-h-[120px] max-h-[210px] scrollbar-thin"
        >
          {turns.map((t) => (
            <div
              key={t.id}
              className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                  t.role === 'user'
                    ? 'bg-gradient-to-r from-cyan-600/25 to-indigo-600/25 border border-cyan-500/40 text-cyan-50'
                    : 'bg-[#0b1024] border border-[#192241] text-slate-200'
                }`}
              >
                {t.content}
              </div>
            </div>
          ))}
        </div>

        {/* Quick text fallback inside call */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            unlockAudioContext();
            if (!manualText.trim() || inFlightTurnRef.current) return;
            const txt = manualText;
            setManualText('');
            sendVoiceTurn(txt);
          }}
          className="px-5 py-2 border-t border-[#192241] flex items-center gap-2"
        >
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Or type a message during the call..."
            className="flex-1 bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manualText.trim() || status === 'thinking'}
            className="p-2 rounded-xl glitch-btn-primary disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Bottom Call Controls */}
        <div className="px-6 py-4 bg-[#04050c] border-t border-[#192241] flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={toggleMicMute}
            className={`p-3.5 rounded-full border transition-all cursor-pointer ${
              isMicMuted
                ? 'bg-rose-950/60 border-rose-600/60 text-rose-300'
                : 'bg-[#0e142c] hover:bg-[#172044] border-[#25325f] text-white'
            }`}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleSpeakerMute}
            className={`p-3.5 rounded-full border transition-all cursor-pointer ${
              isSpeakerMuted
                ? 'bg-amber-950/60 border-amber-600/60 text-amber-300'
                : 'bg-[#0e142c] hover:bg-[#172044] border-[#25325f] text-white'
            }`}
            title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
          >
            {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              callEpochRef.current += 1;
              if (turnAbortRef.current) turnAbortRef.current.abort();
              inFlightTurnRef.current = false;
              stopPreviewAudio();
              stopAudio();
              cleanupPersistentMic();
              onClose();
            }}
            className="px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-950/60 transition-all cursor-pointer"
            title="End Voice Call"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
