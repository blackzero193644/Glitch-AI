import React from 'react';
import {
  ArrowRight,
  Send,
  MessageSquare,
  Phone,
  Coins,
  Image as ImageIcon,
} from 'lucide-react';
import { AppView } from '../types';
import { AD_REWARD_MAX, GLITCH_AI_VERSION, IMAGE_CREDIT_COST } from '../lib/credits';
import { GLITCH_EMBLEM_SRC, GLITCH_LOGO_SRC } from '../lib/assets';
import { NativeBannerAd, Banner300x250Ad, Banner320x50Ad } from './AdSlots';

interface HomePageProps {
  onNavigate: (view: AppView) => void;
  onStartChat: (initialPrompt?: string, mode?: 'chat' | 'image') => void;
  onOpenVoiceCall?: () => void;
  onOpenCredits?: () => void;
  isSignedIn: boolean;
  onGoogleSignIn: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onStartChat,
  onOpenVoiceCall,
  onOpenCredits,
  isSignedIn,
  onGoogleSignIn,
}) => {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#04050c] via-[#060814] to-[#03040a] text-slate-100 flex flex-col">
      {/* Clean Hero Section */}
      <div className="relative px-4 sm:px-8 pt-12 pb-14 max-w-5xl mx-auto text-center">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-64 bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex justify-center mb-5 relative">
          <div className="p-3.5 rounded-2xl bg-[#070a18]/90 border border-cyan-500/20 shadow-2xl">
            <img
              src={GLITCH_LOGO_SRC}
              alt="Glitch AI"
              className="h-22 sm:h-26 w-auto object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.25)]"
            />
          </div>
        </div>

        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400 mb-3">
          Glitch AI v{GLITCH_AI_VERSION} · by Al-Fateh
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 max-w-3xl mx-auto leading-tight font-display">
          Simple, Fast &amp;{' '}
          <span className="glitch-gradient-text">Built for Everyday Work</span>
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto mb-8 leading-relaxed">
          Chat with live internet knowledge, generate high-resolution images with Credits, send Credits to friends, and talk naturally over live voice calls.
        </p>

        {/* Primary Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => onStartChat()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl glitch-btn-primary font-semibold text-sm cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Start Chatting</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onOpenVoiceCall && (
            <button
              onClick={onOpenVoiceCall}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#130b29] hover:bg-[#1c103d] border border-fuchsia-500/40 text-fuchsia-200 font-semibold text-sm transition-all cursor-pointer"
            >
              <Phone className="w-4 h-4 text-fuchsia-400" />
              <span>Voice Call</span>
            </button>
          )}

          {onOpenCredits && (
            <button
              onClick={onOpenCredits}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#090c1a] hover:bg-[#10162f] border border-[#1d284b] text-cyan-300 font-semibold text-sm transition-all cursor-pointer"
            >
              <Coins className="w-4 h-4 text-cyan-400" />
              <span>Win 0–{AD_REWARD_MAX} Credits</span>
            </button>
          )}

          {!isSignedIn && (
            <button
              onClick={onGoogleSignIn}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#090c1a] hover:bg-[#10162f] border border-[#1d284b] text-slate-200 font-semibold text-sm transition-all cursor-pointer"
            >
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Clean 3-Card Core Capabilities */}
      <div className="px-4 sm:px-8 pb-14 max-w-5xl mx-auto w-full flex-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-6 rounded-2xl bg-[#090c1a] border border-[#192241]">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Smart Chat & Voice</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Clear answers, coding help, visual analysis, and multilingual voice calling inside one calm workspace.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#090c1a] border border-[#192241]">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 mb-4">
              <ImageIcon className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Credit Image Studio</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create images for {IMAGE_CREDIT_COST} Credits each and watch ads to win a lucky 0–{AD_REWARD_MAX} Credits anytime. Video creation is coming soon.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#090c1a] border border-[#192241]">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Credit Transfers &amp; PDF</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Transfer Credits directly to another user by email or Account ID, and export any conversation as a PDF document.
            </p>
          </div>
        </div>
      </div>

      {/* Compact Sponsored Shelf */}
      <div className="px-4 sm:px-8 pb-8 max-w-5xl mx-auto w-full space-y-4">
        <Banner320x50Ad />
        <div className="flex flex-col lg:flex-row items-center lg:items-start gap-5">
          <NativeBannerAd className="w-full flex-1 min-w-0" />
          <Banner300x250Ad />
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 sm:px-8 py-6 border-t border-[#192241] bg-[#03040a] text-xs text-slate-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img
              src={GLITCH_EMBLEM_SRC}
              alt="Glitch AI"
              className="w-5 h-5 object-contain"
            />
            <span className="font-semibold text-slate-200 font-display">Glitch AI v{GLITCH_AI_VERSION}</span>
            <span>· By Al-Fateh</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-400">
            <button onClick={() => onNavigate('chat')} className="hover:text-white cursor-pointer">
              Chat
            </button>
            <button onClick={() => onNavigate('about')} className="hover:text-white cursor-pointer">
              About
            </button>
            <button onClick={() => onNavigate('privacy')} className="hover:text-white cursor-pointer">
              Privacy
            </button>
            <button onClick={() => onNavigate('terms')} className="hover:text-white cursor-pointer">
              Terms
            </button>
          </div>

          <div className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} Al-Fateh
          </div>
        </div>
      </footer>
    </div>
  );
};
