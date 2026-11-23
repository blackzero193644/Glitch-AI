import React from 'react';
import {
  Menu,
  Download,
  Trash2,
  User,
  Home,
  MessageSquare,
  Info,
  Phone,
  Coins,
} from 'lucide-react';
import { AppView, UserProfile } from '../types';
import { GLITCH_AI_VERSION } from '../lib/credits';
import { GLITCH_EMBLEM_SRC } from '../lib/assets';

interface HeaderProps {
  onToggleSidebar: () => void;
  onClearChat: () => void;
  onExportChat: () => void;
  onOpenProfile: () => void;
  onOpenCredits: () => void;
  userProfile: UserProfile;
  hasMessages: boolean;
  activeSessionTitle: string;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isSignedIn: boolean;
  onGoogleSignIn: () => void;
  onOpenVoiceCall?: () => void;
  credits: number;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onClearChat,
  onExportChat,
  onOpenProfile,
  onOpenCredits,
  userProfile,
  hasMessages,
  currentView,
  onNavigate,
  isSignedIn,
  onGoogleSignIn,
  onOpenVoiceCall,
  credits,
}) => {
  const [confirmClear, setConfirmClear] = React.useState(false);

  React.useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);

  const getAvatarBg = (colorId?: string) => {
    switch (colorId) {
      case 'indigo':
        return 'bg-indigo-600 border-indigo-400';
      case 'fuchsia':
        return 'bg-fuchsia-600 border-fuchsia-400';
      case 'emerald':
        return 'bg-emerald-600 border-emerald-400';
      case 'slate':
        return 'bg-slate-700 border-slate-500';
      default:
        return 'bg-cyan-600 border-cyan-400';
    }
  };

  return (
    <header className="h-14 px-3 sm:px-6 bg-[#050712]/95 border-b border-[#192241] backdrop-blur-md flex items-center justify-between z-30 sticky top-0">
      {/* Left section: Hamburger + Brand + Page Nav */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#111730] transition-colors cursor-pointer"
          title="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div
          onClick={() => onNavigate('chat')}
          className="flex items-center gap-2 cursor-pointer group shrink-0"
          title="Glitch AI"
        >
          <div className="w-8 h-8 rounded-lg bg-[#090d1f] border border-cyan-500/30 flex items-center justify-center p-1 shadow-sm group-hover:border-fuchsia-400/60 transition-colors">
            <img
              src={GLITCH_EMBLEM_SRC}
              alt="Glitch AI"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-sm font-bold tracking-tight font-display hidden xs:inline glitch-gradient-text whitespace-nowrap">
            Glitch AI <span className="text-[11px] font-mono text-slate-400 font-normal">v{GLITCH_AI_VERSION}</span>
          </span>
        </div>

        <nav className="flex items-center gap-1 ml-1 sm:ml-3">
          <button
            onClick={() => onNavigate('chat')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              currentView === 'chat'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#10162f]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          <button
            onClick={() => onNavigate('home')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              currentView === 'home'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#10162f]'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Overview</span>
          </button>

          <button
            onClick={() => onNavigate('about')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              currentView === 'about'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#10162f]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">About</span>
          </button>
        </nav>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {currentView === 'chat' && hasMessages && (
          <>
            <button
              onClick={onExportChat}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-[#10162f] transition-colors cursor-pointer whitespace-nowrap"
              title="Export conversation as PDF"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              onClick={() => {
                if (confirmClear) {
                  setConfirmClear(false);
                  onClearChat();
                } else {
                  setConfirmClear(true);
                }
              }}
              className={`px-2 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                confirmClear
                  ? 'bg-rose-950/70 border border-rose-500/50 text-rose-200 font-semibold'
                  : 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/30'
              }`}
              title={confirmClear ? 'Click again to confirm clearing chat' : 'Clear current chat'}
            >
              <Trash2 className="w-4 h-4" />
              {confirmClear && <span className="hidden sm:inline">Confirm?</span>}
            </button>
          </>
        )}

        {onOpenVoiceCall && (
          <button
            onClick={onOpenVoiceCall}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/35 text-cyan-300 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0"
            title="Start Live Voice Call"
          >
            <Phone className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Voice Call</span>
          </button>
        )}

        {isSignedIn && (
          <button
            type="button"
            onClick={onOpenCredits}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#090d1e] border border-[#1d284b] hover:border-cyan-500/60 text-slate-200 text-xs font-mono tabular-nums transition-all cursor-pointer whitespace-nowrap shrink-0"
            title="Credit Balance, Lucky Rewards (0–10) & Transfers"
          >
            <Coins className={`w-3.5 h-3.5 ${credits <= 5 ? 'text-rose-400' : 'text-cyan-400'}`} />
            <span>{credits}</span>
            <span className="hidden sm:inline text-cyan-400 font-sans text-[11px] font-semibold">+ Earn</span>
          </button>
        )}

        {!isSignedIn && (
          <button
            onClick={onGoogleSignIn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            title="Sign In"
          >
            <User className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}

        {isSignedIn && (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 py-1 px-2 sm:px-2.5 rounded-xl bg-[#090d1e] border border-[#1d284b] hover:border-cyan-500/60 text-slate-200 hover:text-white transition-all cursor-pointer shrink-0"
            title="Manage Profile, Device Avatar & Settings"
          >
            {userProfile.customAvatar ? (
              <img
                src={userProfile.customAvatar}
                alt="Avatar"
                className="w-5 h-5 rounded-md object-cover border border-cyan-400"
              />
            ) : (
              <div
                className={`w-5 h-5 rounded-md ${getAvatarBg(
                  userProfile.avatarColor
                )} border flex items-center justify-center text-white text-[10px]`}
              >
                <User className="w-3 h-3" />
              </div>
            )}
            <span className="text-xs font-medium max-w-[90px] sm:max-w-[120px] truncate">
              {userProfile.name || 'Set Name'}
            </span>
          </button>
        )}
      </div>
    </header>
  );
};
