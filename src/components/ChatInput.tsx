import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Mic,
  MicOff,
  ImagePlus,
  X,
} from 'lucide-react';
import { GLITCH_AI_VERSION } from '../lib/credits';

export type ChatComposerMode = 'chat' | 'image' | 'video';

interface ChatInputProps {
  onSendMessage: (
    content: string,
    options?: { useSearch?: boolean; useMaps?: boolean; imageUrl?: string; mode?: ChatComposerMode }
  ) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  inputRef: externalInputRef,
}) => {
  const [text, setText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const localInputRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalInputRef || localInputRef;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 180);
    textarea.style.height = `${Math.max(newHeight, 48)}px`;
  }, [text, textareaRef]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event: any) => {
        let current = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        if (current) {
          setText((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${current}` : current;
          });
        }
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  const compressImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setAttachedImage(canvas.toDataURL('image/jpeg', 0.9));
        } else {
          setAttachedImage(rawUrl);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImageFile(file);
      e.target.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          compressImageFile(file);
          break;
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if ((!text.trim() && !attachedImage) || isStreaming) return;
    onSendMessage(text.trim() || 'Analyze this image.', {
      imageUrl: attachedImage || undefined,
    });
    setText('');
    setAttachedImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-3 pt-1">
      {/* Main Input Box — completely clean, prompt-driven */}
      <div className="relative rounded-2xl bg-[#090d1e] border border-[#1a2444] focus-within:border-cyan-500/70 focus-within:ring-1 focus-within:ring-cyan-500/25 transition-all shadow-xl shadow-black/40">
        {attachedImage && (
          <div className="px-3.5 pt-3 pb-1 flex items-center gap-3">
            <div className="relative group">
              <img
                src={attachedImage}
                alt="Attached reference"
                className="w-16 h-16 rounded-xl object-cover border border-cyan-500/50 shadow-md"
              />
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="text-xs text-cyan-300 font-medium">
              Image attached — ask to analyze or edit it
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Message Glitch AI or ask to create an image..."
          rows={1}
          className="w-full bg-transparent text-slate-100 placeholder-slate-500 px-4 py-3.5 pr-32 resize-none focus:outline-none text-[15px] leading-relaxed max-h-[180px]"
        />

        {/* Right side controls inside textarea */}
        <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1">
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              attachedImage
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#131a36]'
            }`}
            title="Attach an image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleListening}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-950'
                : 'text-slate-400 hover:text-white hover:bg-[#131a36]'
            }`}
            title={isListening ? 'Stop dictation' : 'Dictate prompt'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="p-2 rounded-xl glitch-btn-primary cursor-pointer"
              title="Stop response"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() && !attachedImage}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                text.trim() || attachedImage
                  ? 'glitch-btn-primary'
                  : 'bg-[#12172c] text-slate-500 cursor-not-allowed'
              }`}
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Subtext info */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 px-1">
        <span>
          <kbd className="px-1 py-0.5 rounded bg-[#090d1f] border border-[#192241] font-mono text-[10px] text-slate-400">
            Enter
          </kbd>{' '}
          to send ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-[#090d1f] border border-[#192241] font-mono text-[10px] text-slate-400">
            Shift + Enter
          </kbd>{' '}
          new line
        </span>
        <span className="hidden sm:inline">
          Glitch AI v{GLITCH_AI_VERSION}
        </span>
      </div>
    </div>
  );
};
