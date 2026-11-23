import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Check,
  Trash2,
  LogOut,
  UserCheck,
  AlertCircle,
  Camera,
  Coins,
  PlayCircle,
} from 'lucide-react';
import { UserProfile } from '../types';
import { AD_REWARD_MAX, GLITCH_AI_VERSION, IMAGE_CREDIT_COST, INITIAL_CREDITS } from '../lib/credits';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
  isSignedIn: boolean;
  userEmail?: string;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  isSyncing?: boolean;
  credits: number;
  onOpenCredits: () => void;
}

const AVATAR_COLORS = [
  { id: 'cyan', label: 'Electric Cyan', bg: 'bg-cyan-600', border: 'border-cyan-400', text: 'text-cyan-300' },
  { id: 'indigo', label: 'Deep Indigo', bg: 'bg-indigo-600', border: 'border-indigo-400', text: 'text-indigo-300' },
  { id: 'fuchsia', label: 'Glitch Magenta', bg: 'bg-fuchsia-600', border: 'border-fuchsia-400', text: 'text-fuchsia-300' },
  { id: 'emerald', label: 'Emerald Jade', bg: 'bg-emerald-600', border: 'border-emerald-400', text: 'text-emerald-300' },
  { id: 'slate', label: 'Stealth Slate', bg: 'bg-slate-700', border: 'border-slate-500', text: 'text-slate-300' },
];

const SUGGESTED_ROLES = [
  'AI Explorer',
  'Creator & Designer',
  'Software Engineer',
  'Researcher & Student',
  'Business & Strategy',
];

function compressAndResizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  isSignedIn,
  userEmail,
  onGoogleSignIn,
  onSignOut,
  isSyncing = false,
  credits,
  onOpenCredits,
}) => {
  const [name, setName] = useState(profile.name || '');
  const [role, setRole] = useState(profile.role || '');
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor || 'cyan');
  const [customAvatar, setCustomAvatar] = useState(profile.customAvatar || '');
  const [customInstructions, setCustomInstructions] = useState(profile.customInstructions || '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(profile.name || '');
      setRole(profile.role || '');
      setAvatarColor(profile.avatarColor || 'cyan');
      setCustomAvatar(profile.customAvatar || '');
      setCustomInstructions(profile.customInstructions || '');
      setUploadError(null);
      setSavedSuccess(false);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WebP, etc.).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image size exceeds 8MB. Please choose a smaller picture.');
      return;
    }

    try {
      setUploadError(null);
      const compressedDataUrl = await compressAndResizeImage(file);
      setCustomAvatar(compressedDataUrl);
    } catch (err) {
      console.error('Image compression failed:', err);
      setUploadError('Failed to process image. Please try another file.');
    }
  };

  const handleRemovePhoto = () => {
    setCustomAvatar('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      name: name.trim() || 'Glitch User',
      role: role.trim() || 'AI Explorer',
      avatarColor,
      customAvatar,
      customInstructions: customInstructions.trim(),
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const selectedColorObj = AVATAR_COLORS.find((c) => c.id === avatarColor) || AVATAR_COLORS[0];
  const creditPercent = Math.max(0, Math.min(100, Math.round((credits / INITIAL_CREDITS) * 100)));
  const remainingImages = Math.floor(credits / IMAGE_CREDIT_COST);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#080b18] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-black/80 text-left max-h-[92vh] overflow-y-auto scrollbar-thin">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 flex items-center justify-between pr-8">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Account, Credits &amp; Settings</h3>
            <p className="text-xs text-slate-400">
              Glitch AI v{GLITCH_AI_VERSION} · Profile &amp; Credit Balance
            </p>
          </div>
          <span className="text-[11px] font-mono font-semibold text-cyan-300 bg-[#050814] border border-cyan-500/30 px-2 py-0.5 rounded-md">
            v{GLITCH_AI_VERSION}
          </span>
        </div>

        {/* Credit Balance Setting Card */}
        <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-[#071124] via-[#060b1a] to-[#0f0820] border border-cyan-500/35 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-300">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">Credit Balance</div>
                <div className="text-[11px] text-slate-400">
                  {IMAGE_CREDIT_COST} Credits per image · {remainingImages} {remainingImages === 1 ? 'image' : 'images'} available
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-extrabold font-mono tabular-nums text-white leading-none">
                {credits}
              </div>
              <div className="text-[10px] text-cyan-400 font-medium mt-0.5">Credits Left</div>
            </div>
          </div>

          <div className="w-full h-2 rounded-full bg-[#04060f] border border-[#192241] overflow-hidden mb-3">
            <div
              className={`h-full transition-all duration-300 ${
                credits <= IMAGE_CREDIT_COST
                  ? 'bg-rose-500'
                  : credits <= 30
                  ? 'bg-amber-400'
                  : 'bg-gradient-to-r from-cyan-400 to-fuchsia-400'
              }`}
              style={{ width: `${creditPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCredits();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glitch-btn-primary text-xs font-semibold cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Watch Ad (Get 0–{AD_REWARD_MAX})</span>
            </button>
          </div>
        </div>

        {/* Account Banner */}
        <div className="mb-5 p-3.5 rounded-xl bg-[#050712] border border-[#192241]">
          {isSignedIn ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Signed-In Account</div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {userEmail || 'Signed In'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-900/50 text-xs transition-colors cursor-pointer flex-shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <User className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Guest Session</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Sign in with Google to generate images and transfer Credits.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In with Google</span>
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[#050a18] border border-blue-950/80">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Profile Picture / Device Avatar
            </label>

            <div className="flex items-center gap-4">
              <div className="relative">
                {customAvatar ? (
                  <img
                    src={customAvatar}
                    alt="Custom Avatar"
                    className="w-14 h-14 rounded-xl object-cover border-2 border-blue-400 shadow-md"
                  />
                ) : (
                  <div
                    className={`w-14 h-14 rounded-xl ${selectedColorObj.bg} border-2 ${selectedColorObj.border} flex items-center justify-center text-white shadow-md`}
                  >
                    <User className="w-7 h-7" />
                  </div>
                )}
                {customAvatar && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    title="Remove custom photo"
                    className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-sm cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-200 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{customAvatar ? 'Change Photo from Device' : 'Upload from Device'}</span>
                </button>
                <p className="text-[10px] text-slate-400">
                  Select any photo from your phone or PC. Automatically scaled & optimized for cloud storage.
                </p>
                {uploadError && (
                  <div className="flex items-center gap-1 text-[11px] text-rose-400">
                    <AlertCircle className="w-3 h-3" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>
            </div>

            {!customAvatar && (
              <div className="mt-3 pt-2.5 border-t border-blue-950/60">
                <span className="block text-[11px] text-slate-400 mb-1.5">
                  Or pick an avatar accent color:
                </span>
                <div className="flex items-center gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setAvatarColor(c.id)}
                      className={`w-6 h-6 rounded-lg ${c.bg} border-2 transition-all cursor-pointer flex items-center justify-center ${
                        avatarColor === c.id ? 'border-white scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                      title={c.label}
                    >
                      {avatarColor === c.id && <Check className="w-3 h-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Display Name / Alias
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex, Sam, Noor"
              maxLength={40}
              required
              className="w-full bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Your Role / Focus
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. AI Explorer, Software Engineer, Designer"
              maxLength={50}
              className="w-full bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_ROLES.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    role === r
                      ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50'
                      : 'bg-[#0b1024] text-slate-400 border-[#192241] hover:text-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Custom AI Instructions (Personalized Memory)
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Always address me by name, keep answers concise, format code in TypeScript..."
              rows={2}
              maxLength={300}
              className="w-full bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all resize-none"
            />
          </div>

          <div className="mt-5 pt-3 border-t border-[#192241] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Profile Saved!</span>
                </>
              ) : (
                <span>Save Profile & Settings</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
