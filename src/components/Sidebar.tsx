import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  User,
  Settings,
  ChevronLeft,
  Home,
  Info,
  Phone,
  Coins,
} from 'lucide-react';
import { AppView, ChatSession, UserProfile } from '../types';
import { GLITCH_AI_VERSION } from '../lib/credits';
import { GLITCH_EMBLEM_SRC } from '../lib/assets';
import { Banner300x250Ad } from './AdSlots';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClearAllSessions: () => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  userProfile: UserProfile;
  onOpenProfileModal: () => void;
  onOpenCreditsModal: () => void;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isSignedIn: boolean;
  onGoogleSignIn: () => void;
  onOpenVoiceCall?: () => void;
  credits: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onClearAllSessions,
  isOpen,
  onCloseMobile,
  userProfile,
  onOpenProfileModal,
  onOpenCreditsModal,
  currentView,
  onNavigate,
  isSignedIn,
  onGoogleSignIn,
  onOpenVoiceCall,
  credits,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  React.useEffect(() => {
    if (!confirmClearAll) return;
    const t = window.setTimeout(() => setConfirmClearAll(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmClearAll]);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const saveRename = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const getAvatarBg = (colorId: string) => {
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

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    onCloseMobile();
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-xs z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-80 max-w-[92vw] bg-[#060814] border-r border-[#192241] transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header */}
        <div className="p-3.5 border-b border-[#192241] flex items-center justify-between">
          <div
            onClick={() => handleNavClick('chat')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-[#04060f] border border-cyan-500/35 flex items-center justify-center p-1 shadow-sm group-hover:border-fuchsia-400/60 transition-colors">
              <img
                src={GLITCH_EMBLEM_SRC}
                alt="Glitch AI Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight font-display glitch-gradient-text">
                Glitch AI
              </h2>
              <span className="text-[10px] text-slate-400 font-medium block">
                v{GLITCH_AI_VERSION} · by Al-Fateh
              </span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#111730] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Navigation */}
        <div className="p-2 space-y-0.5 border-b border-[#192241]">
          <button
            onClick={() => handleNavClick('chat')}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              currentView === 'chat'
                ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#0d1226]'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <span>Chat</span>
          </button>

          {onOpenVoiceCall && (
            <button
              onClick={() => {
                onOpenVoiceCall();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-fuchsia-300 hover:text-white hover:bg-fuchsia-950/35 transition-all cursor-pointer"
            >
              <Phone className="w-4 h-4 text-fuchsia-400" />
              <span>Live Voice Call</span>
            </button>
          )}

          <button
            onClick={() => handleNavClick('home')}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              currentView === 'home'
                ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#0d1226]'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => handleNavClick('about')}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              currentView === 'about'
                ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#0d1226]'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>About & Contact</span>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewChat();
              onNavigate('chat');
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl glitch-btn-primary text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search bar if multiple sessions */}
        {sessions.length > 2 && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-[#090d1f] border border-[#192241] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>
        )}

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 scrollbar-thin">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Recent Conversations
          </div>

          {filteredSessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              {searchQuery ? 'No chats match your search.' : 'No conversations yet.'}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = currentView === 'chat' && s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelectSession(s.id);
                    onNavigate('chat');
                    onCloseMobile();
                  }}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0e1530] text-white border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1124]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isActive ? 'text-cyan-400' : 'text-slate-500'
                      }`}
                    />
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(s.id, e);
                          if (e.key === 'Escape') cancelRename(e as any);
                        }}
                        className="bg-[#050712] border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white w-full focus:outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate">{s.title}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingId === s.id ? (
                      <>
                        <button
                          onClick={(e) => saveRename(s.id, e)}
                          className="p-1 hover:text-emerald-400"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={cancelRename} className="p-1 hover:text-rose-400">
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => startRename(s, e)}
                          className="p-1 text-slate-400 hover:text-cyan-300"
                          title="Rename"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(s.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div className="pt-3 flex justify-center">
            <Banner300x250Ad />
          </div>
        </div>

        {/* Footer: User Profile & Session Controls */}
        <div className="p-3 border-t border-[#192241] bg-[#04060e] space-y-2">
          {!isSignedIn && (
            <button
              onClick={onGoogleSignIn}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg glitch-btn-primary text-xs font-semibold cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {sessions.length > 1 && (
            <button
              onClick={() => {
                if (confirmClearAll) {
                  setConfirmClearAll(false);
                  onClearAllSessions();
                } else {
                  setConfirmClearAll(true);
                }
              }}
              className={`w-full flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg text-xs transition-colors cursor-pointer ${
                confirmClearAll
                  ? 'bg-rose-950/60 border border-rose-500/45 text-rose-200 font-semibold'
                  : 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/30'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmClearAll ? 'Confirm Clear All?' : 'Clear History'}</span>
            </button>
          )}

          <div className="flex items-center justify-between px-1 text-[10px] text-slate-500">
            <button
              onClick={() => handleNavClick('privacy')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>·</span>
            <button
              onClick={() => handleNavClick('terms')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Terms
            </button>
            <span>·</span>
            <button
              onClick={() => handleNavClick('about')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Contact
            </button>
          </div>

          {isSignedIn && (
            <>
              <button
                type="button"
                onClick={() => {
                  onOpenCreditsModal();
                  onCloseMobile();
                }}
                className="w-full px-2.5 py-2 rounded-xl bg-[#070b1a] border border-[#192241] hover:border-cyan-500/50 transition-colors cursor-pointer flex items-center justify-between text-xs"
                title="View Credit Balance, Lucky Rewards (0–10) & Transfers"
              >
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <Coins className={`w-3.5 h-3.5 ${credits <= 5 ? 'text-rose-400' : 'text-cyan-400'}`} />
                  <span>{credits} Credits</span>
                </span>
                <span className="text-[11px] font-semibold text-cyan-400">
                  Get 0–10
                </span>
              </button>

              <div
                onClick={onOpenProfileModal}
                className="p-2 rounded-xl bg-[#090d1f] border border-[#192241] hover:border-cyan-500/50 transition-colors cursor-pointer flex items-center justify-between group"
                title="Manage profile, device avatar and name"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {userProfile.customAvatar ? (
                    <img
                      src={userProfile.customAvatar}
                      alt="Custom Avatar"
                      className="w-7 h-7 rounded-lg object-cover border border-cyan-400 flex-shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-7 h-7 rounded-lg ${getAvatarBg(
                        userProfile.avatarColor
                      )} border flex items-center justify-center text-white flex-shrink-0`}
                    >
                      <User className="w-4 h-4" />
                    </div>
                  )}
                  <div className="text-left min-w-0">
                    <div className="text-xs font-semibold text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
                      {userProfile.name || 'Set Your Name'}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {userProfile.role || 'AI Explorer'}
                    </div>
                  </div>
                </div>
                <Settings className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors flex-shrink-0" />
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
