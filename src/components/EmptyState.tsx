import React from 'react';
import { Phone, Coins } from 'lucide-react';
import { GLITCH_AI_VERSION } from '../lib/credits';
import { GLITCH_LOGO_SRC } from '../lib/assets';

interface EmptyStateProps {
  onOpenVoiceCall?: () => void;
  onOpenCredits?: () => void;
  credits?: number;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  onOpenVoiceCall,
  onOpenCredits,
  credits = 100,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center max-w-xl mx-auto">
      <div className="mb-5">
        <div className="p-3 rounded-2xl bg-[#070a18]/90 border border-cyan-500/20 shadow-xl">
          <img
            src={GLITCH_LOGO_SRC}
            alt="Glitch AI"
            className="h-20 sm:h-24 w-auto object-contain drop-shadow-[0_0_16px_rgba(34,211,238,0.22)]"
          />
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2 font-display">
        <span className="glitch-gradient-text">Glitch AI</span>{' '}
        <span className="text-sm font-mono font-medium text-slate-400 align-middle">
          v{GLITCH_AI_VERSION}
        </span>
      </h1>

      <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-7">
        Ask anything, create images, or start a live voice call.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs">
        {onOpenVoiceCall && (
          <button
            type="button"
            onClick={onOpenVoiceCall}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#100a24] hover:bg-[#1a1038] border border-fuchsia-500/35 text-fuchsia-300 font-semibold transition-colors cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Voice Call</span>
          </button>
        )}

        {onOpenCredits && (
          <button
            type="button"
            onClick={onOpenCredits}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#090d1f] hover:bg-[#101836] border border-[#1e294b] text-slate-200 font-medium transition-colors cursor-pointer"
          >
            <Coins className="w-3.5 h-3.5 text-cyan-400" />
            <span>{credits} Credits · Win 0–10</span>
          </button>
        )}
      </div>
    </div>
  );
};
