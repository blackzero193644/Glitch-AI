import React, { useState, useRef } from 'react';
import {
  User,
  Copy,
  Check,
  Volume2,
  VolumeX,
  RotateCcw,
  AlertCircle,
  Loader2,
  Download,
  Maximize2,
  X,
  Coins,
} from 'lucide-react';
import { ChatMessage, UserProfile } from '../types';
import { apiFetch } from '../lib/api';
import { GLITCH_EMBLEM_SRC } from '../lib/assets';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatMessageItemProps {
  message: ChatMessage;
  onRetry?: () => void;
  onOpenCredits?: () => void;
  isSignedIn?: boolean;
  onGoogleSignIn?: () => void;
  userProfile?: UserProfile;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onRetry,
  onOpenCredits,
  isSignedIn,
  onGoogleSignIn,
  userProfile,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTts, setIsLoadingTts] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isUser = message.role === 'user';

  const getUserAvatarColorClass = (colorId?: string) => {
    switch (colorId) {
      case 'indigo':
        return 'bg-indigo-900/90 border-indigo-700/60 text-indigo-300';
      case 'fuchsia':
        return 'bg-fuchsia-950/90 border-fuchsia-700/60 text-fuchsia-300';
      case 'emerald':
        return 'bg-emerald-950/90 border-emerald-700/60 text-emerald-300';
      case 'slate':
        return 'bg-slate-800/90 border-slate-600/60 text-slate-300';
      default:
        return 'bg-cyan-950/90 border-cyan-700/60 text-cyan-300';
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = message.content;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const stopAllSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsLoadingTts(false);
  };

  const toggleSpeech = async () => {
    if (isSpeaking || isLoadingTts) {
      stopAllSpeech();
      return;
    }

    stopAllSpeech();
    setIsLoadingTts(true);

    let savedVoice = 'sarah';
    try {
      savedVoice = localStorage.getItem('glitch_ai_selected_voice_v1') || 'sarah';
    } catch {}

    try {
      const res = await apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message.content,
          voice: savedVoice,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          setIsLoadingTts(false);
          setIsSpeaking(true);
          await audio.play();
          return;
        }
      }
    } catch {
      // Fallback cleanly to browser speech synthesis
    }

    setIsLoadingTts(false);
    if (!('speechSynthesis' in window)) return;

    const cleanText = message.content
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[#*_~>]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const maleVoices = new Set(['ethan', 'adrian', 'verity', 'guyzo', 'polo', 'kai', 'slax']);
    const isMale = maleVoices.has(savedVoice);
    const pitchMap: Record<string, number> = {
      sarah: 1.08,
      hannah: 1.04,
      selene: 0.96,
      alle: 1.14,
      lyra: 1.02,
      ethan: 0.92,
      adrian: 0.86,
      verity: 0.98,
      guyzo: 0.78,
      polo: 0.84,
      kai: 1.02,
      slax: 0.88,
    };
    const rateMap: Record<string, number> = {
      sarah: 1.0,
      hannah: 1.0,
      selene: 0.94,
      alle: 1.05,
      lyra: 0.96,
      ethan: 1.0,
      adrian: 0.95,
      verity: 1.02,
      guyzo: 0.94,
      polo: 0.96,
      kai: 1.04,
      slax: 0.98,
    };
    const available = window.speechSynthesis.getVoices?.() || [];
    if (available.length > 0) {
      const genderHint = isMale
        ? /\b(david|mark|guy|daniel|ryan|christopher|george|andrew|brian|alex|male|eric)\b/i
        : /\b(zira|jenny|aria|ava|emma|samantha|victoria|karen|hazel|susan|female|sonia|libby)\b/i;
      const matched =
        available.find((v) => v.lang?.toLowerCase().startsWith('en') && genderHint.test(v.name)) ||
        available.find((v) => v.lang?.toLowerCase().startsWith('en'));
      if (matched) utterance.voice = matched;
    }
    utterance.rate = rateMap[savedVoice] ?? 1.0;
    utterance.pitch = pitchMap[savedVoice] ?? (isMale ? 0.9 : 1.05);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div
        className={`py-4 px-4 sm:px-6 transition-colors ${
          isUser ? 'bg-transparent' : 'bg-[#080b18]/80 border-y border-[#161e3b]'
        }`}
      >
        <div className="max-w-4xl mx-auto flex gap-3.5 sm:gap-4 items-start">
          {/* Avatar */}
          <div className="flex-shrink-0 pt-0.5">
            {isUser ? (
              isSignedIn && userProfile?.customAvatar ? (
                <img
                  src={userProfile.customAvatar}
                  alt="User"
                  className="w-8 h-8 rounded-lg object-cover border border-cyan-400/80 shadow-sm"
                />
              ) : (
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center shadow-sm ${getUserAvatarColorClass(
                    isSignedIn ? userProfile?.avatarColor : 'cyan'
                  )}`}
                >
                  <User className="w-4 h-4" />
                </div>
              )
            ) : (
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-[#050814] border border-cyan-500/40 flex items-center justify-center p-1 shadow-md shadow-cyan-950/40">
                  <img
                    src={GLITCH_EMBLEM_SRC}
                    alt="Glitch AI"
                    className="w-full h-full object-contain"
                  />
                </div>
                {(message.isStreaming || message.isGeneratingMedia) && (
                  <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fuchsia-400"></span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Content Container */}
          <div className="flex-1 min-w-0">
            {/* Header info */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold tracking-wide text-slate-200">
                {isUser ? (isSignedIn ? userProfile?.name || 'You' : 'You') : 'Glitch AI'}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {formatTime(message.timestamp)}
              </span>
              {message.isStreaming && (
                <span className="text-[11px] text-cyan-400 font-medium">streaming...</span>
              )}
              {message.isGeneratingMedia && (
                <span className="text-[11px] text-fuchsia-400 font-medium">
                  {message.mediaProgressLabel || 'creating...'}
                </span>
              )}
            </div>

            {/* Message Body */}
            {message.error ? (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-sm flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 text-rose-400 flex-shrink-0" />
                <div className="flex-1">
                  <p>{message.content}</p>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="mt-2 text-xs font-medium text-rose-200 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-900 border border-rose-700/50 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Retry Generation
                    </button>
                  )}
                </div>
              </div>
            ) : isUser ? (
              <div className="space-y-2">
                {message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt="Attached visual"
                    className="max-w-xs max-h-56 rounded-xl object-cover border border-cyan-500/40 shadow-md"
                  />
                )}
                <div className="text-slate-100 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              </div>
            ) : (
              <div className="relative space-y-3">
                {/* Generating Media Progress Card */}
                {message.isGeneratingMedia && (
                  <div className="max-w-md rounded-2xl bg-[#050814] border border-cyan-500/30 p-5 flex items-center gap-3.5 shadow-lg">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                      <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {message.mediaType === 'video'
                          ? 'Generating Cloud AI Video'
                          : 'Rendering 4K Ultra-HD Image'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {message.mediaProgressLabel || 'Crafting 4K Ultra-HD visuals...'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Inline Generated Image */}
                {message.generatedImageUrl && (
                  <div className="max-w-lg rounded-2xl overflow-hidden bg-[#04060f] border border-[#1d284b] shadow-xl">
                    <div className="relative group">
                      <img
                        src={message.generatedImageUrl}
                        alt="Glitch AI 4K Ultra-HD visual"
                        referrerPolicy="no-referrer"
                        onClick={() => setLightboxUrl(message.generatedImageUrl || null)}
                        className="w-full max-h-[460px] object-contain bg-black cursor-zoom-in"
                      />
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(message.generatedImageUrl || null)}
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/65 text-slate-200 hover:text-white border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Expand image"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="px-3.5 py-2.5 border-t border-[#192241] flex flex-wrap items-center justify-between gap-2 bg-[#070a18]">
                      <button
                        type="button"
                        onClick={() =>
                          triggerDownload(
                            message.generatedImageUrl!,
                            `Glitch_AI_4K_${message.id}.jpg`
                          )
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d142c] hover:bg-[#142044] border border-cyan-500/35 text-xs font-medium text-cyan-300 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download 4K Ultra-HD</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Generated Video */}
                {message.videoUrl && (
                  <div className="max-w-xl rounded-2xl overflow-hidden bg-[#04060f] border border-[#1d284b] shadow-xl">
                    <video
                      src={message.videoUrl}
                      poster={message.videoThumbnailUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full max-h-[420px] bg-black"
                    />
                    <div className="px-3.5 py-2.5 border-t border-[#192241] flex items-center justify-between gap-2 bg-[#070a18]">
                      <span className="text-[11px] font-mono text-slate-400">
                        HD MP4 Video
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          triggerDownload(message.videoUrl!, `Glitch_AI_${message.id}.mp4`)
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#140b2c] hover:bg-[#211246] border border-fuchsia-500/40 text-xs font-medium text-fuchsia-200 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download MP4</span>
                      </button>
                    </div>
                  </div>
                )}

                {message.content ? (
                  <>
                    <MarkdownRenderer content={message.content} />
                    {!isSignedIn &&
                      onGoogleSignIn &&
                      message.content.includes('Sign In Required') && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={onGoogleSignIn}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5" />
                            <span>Sign in with Google</span>
                          </button>
                        </div>
                      )}
                    {isSignedIn && onOpenCredits && message.content.includes('Insufficient Credit Balance') && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={onOpenCredits}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Watch Ad (Get 0–10 Credits)</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : message.isStreaming ? (
                  <div className="flex items-center gap-1.5 py-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce"></span>
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                ) : null}

                {message.isStreaming && message.content && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
                )}

                {message.groundingSources && message.groundingSources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-[#192241]">
                    <div className="text-[11px] font-semibold text-cyan-300 mb-1.5">
                      Verified Sources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {message.groundingSources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0b1228] hover:bg-[#131d40] border border-cyan-500/30 text-cyan-300 text-xs transition-colors"
                        >
                          <span className="truncate max-w-[200px]">
                            {source.title || `Source ${idx + 1}`}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Footer for AI messages */}
            {!isUser &&
              !message.error &&
              message.content &&
              !message.isStreaming &&
              !message.isGeneratingMedia && (
                <div className="mt-3 pt-2 flex items-center gap-2 border-t border-[#151c36] text-slate-400">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:text-white hover:bg-[#111730] transition-colors cursor-pointer"
                    title="Copy response"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={toggleSpeech}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      isSpeaking || isLoadingTts
                        ? 'text-cyan-300 bg-cyan-950/60 border border-cyan-500/40'
                        : 'hover:text-white hover:bg-[#111730]'
                    }`}
                    title={isSpeaking ? 'Stop listening' : 'Read aloud with Glitch AI Voice'}
                  >
                    {isLoadingTts ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span className="text-[11px]">Voicing...</span>
                      </>
                    ) : isSpeaking ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-fuchsia-400" />
                        <span className="text-[11px]">Stop</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Listen</span>
                      </>
                    )}
                  </button>

                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:text-white hover:bg-[#111730] transition-colors cursor-pointer"
                      title="Regenerate response"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Regenerate</span>
                    </button>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full view"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
};
