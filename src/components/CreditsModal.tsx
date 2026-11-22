import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Coins,
  PlayCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  User,
  Send,
  Copy,
  Check,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
} from 'lucide-react';
import {
  AD_REWARD_MAX,
  GLITCH_AI_VERSION,
  IMAGE_CREDIT_COST,
  MAX_TRANSFER_CREDITS,
  getRandomAdsterraSmartLink,
} from '../lib/credits';
import { CreditTransferRecord } from '../types';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credits: number;
  onClaimAdReward: () => Promise<{ awarded: number; nextCredits: number }>;
  onTransferCredits: (params: {
    recipientInput: string;
    amount: number;
    note?: string;
  }) => Promise<{ transferId: string; nextCredits: number; recipientName: string }>;
  transferHistory: CreditTransferRecord[];
  onRefreshTransfers: () => Promise<void>;
  isSignedIn: boolean;
  currentUserId?: string;
  userEmail?: string;
  onGoogleSignIn: () => void;
  onOpenProfile: () => void;
}

const AD_WATCH_SECONDS = 8;

export const CreditsModal: React.FC<CreditsModalProps> = ({
  isOpen,
  onClose,
  credits,
  onClaimAdReward,
  onTransferCredits,
  transferHistory,
  onRefreshTransfers,
  isSignedIn,
  currentUserId,
  userEmail,
  onGoogleSignIn,
  onOpenProfile,
}) => {
  const [activeTab, setActiveTab] = useState<'earn' | 'transfer'>('earn');
  const [adState, setAdState] = useState<'idle' | 'watching' | 'claiming' | 'claimed' | 'error'>('idle');
  const [lastAwarded, setLastAwarded] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(AD_WATCH_SECONDS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentAdLink, setCurrentAdLink] = useState<string>(() => getRandomAdsterraSmartLink());
  const timerRef = useRef<number | null>(null);

  // Transfer form state
  const [recipientInput, setRecipientInput] = useState('');
  const [amountInput, setAmountInput] = useState('10');
  const [noteInput, setNoteInput] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setAdState('idle');
      setLastAwarded(null);
      setSecondsLeft(AD_WATCH_SECONDS);
      setErrorMsg(null);
      setTransferSuccess(null);
      setTransferError(null);
    } else {
      setCurrentAdLink((prev) => getRandomAdsterraSmartLink(prev));
      if (isSignedIn) {
        onRefreshTransfers().catch(() => {});
      }
    }
  }, [isOpen, isSignedIn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleStartWatchingAd = () => {
    if (adState === 'watching' || adState === 'claiming') return;

    setErrorMsg(null);
    setLastAwarded(null);
    setAdState('watching');
    setSecondsLeft(AD_WATCH_SECONDS);

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }

    let remaining = AD_WATCH_SECONDS;
    timerRef.current = window.setInterval(async () => {
      remaining -= 1;
      setSecondsLeft(Math.max(0, remaining));

      if (remaining <= 0) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setAdState('claiming');
        try {
          const res = await onClaimAdReward();
          setLastAwarded(res.awarded);
          setAdState('claimed');
          setCurrentAdLink((prev) => getRandomAdsterraSmartLink(prev));
        } catch (err: any) {
          setErrorMsg(err?.message || 'Could not update credits right now. Please try again.');
          setAdState('error');
          setCurrentAdLink((prev) => getRandomAdsterraSmartLink(prev));
        }
      }
    }, 1000);
  };

  const handleCopyAccountId = async () => {
    if (!currentUserId) return;
    try {
      await navigator.clipboard.writeText(currentUserId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {}
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTransferring) return;

    setTransferError(null);
    setTransferSuccess(null);

    const amt = Math.floor(Number(amountInput));
    if (!recipientInput.trim()) {
      setTransferError('Enter a recipient email or Account ID.');
      return;
    }
    if (!Number.isFinite(amt) || amt < 1 || amt > MAX_TRANSFER_CREDITS) {
      setTransferError(`Enter an amount between 1 and ${MAX_TRANSFER_CREDITS} Credits.`);
      return;
    }
    if (amt > credits) {
      setTransferError(`Insufficient balance (${credits} Credits available).`);
      return;
    }

    setIsTransferring(true);
    try {
      const res = await onTransferCredits({
        recipientInput: recipientInput.trim(),
        amount: amt,
        note: noteInput.trim() || undefined,
      });
      setTransferSuccess(`Sent ${amt} Credits to ${res.recipientName}!`);
      setRecipientInput('');
      setNoteInput('');
      onRefreshTransfers().catch(() => {});
    } catch (err: any) {
      setTransferError(err?.message || 'Transfer failed. Please check the recipient and try again.');
    } finally {
      setIsTransferring(false);
    }
  };

  const remainingImages = Math.floor(credits / IMAGE_CREDIT_COST);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#080b18] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-black/80 text-left max-h-[92vh] overflow-y-auto scrollbar-thin">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 pr-8">
          <h3 className="text-lg font-bold text-white tracking-tight">Credits &amp; Transfers</h3>
          <p className="text-xs text-slate-400">
            Glitch AI v{GLITCH_AI_VERSION} · Win 0–{AD_REWARD_MAX} Credits per ad
          </p>
        </div>

        {/* Current Balance Card */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-[#071124] via-[#060b1a] to-[#0f0820] border border-cyan-500/30 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-300">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Available Balance</div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-white leading-tight">
                  {credits} <span className="text-xs font-normal text-slate-400">Credits</span>
                </div>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <div>{IMAGE_CREDIT_COST} Credits / image</div>
              <div className="text-cyan-300 font-medium mt-0.5">
                {remainingImages} {remainingImages === 1 ? 'image' : 'images'} ready
              </div>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#050814] border border-[#192241] mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('earn')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'earn'
                ? 'glitch-btn-primary'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Earn (0–{AD_REWARD_MAX})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transfer')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'transfer'
                ? 'glitch-btn-primary'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transfer Credits</span>
          </button>
        </div>

        {activeTab === 'earn' ? (
          <div className="p-4 rounded-xl bg-[#050814] border border-[#192241] space-y-3 mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Lucky Ad Reward (0–{AD_REWARD_MAX} Credits)</div>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Open the sponsored ad page for {AD_WATCH_SECONDS} seconds to win a random luck-based reward between{' '}
                <span className="text-cyan-300 font-semibold">0 and {AD_REWARD_MAX} Credits</span>. Rarely you may roll 0 — watch another ad anytime to try again!
              </p>
            </div>

            {adState === 'watching' && (
              <div className="p-3 rounded-xl bg-cyan-950/35 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Verifying ad view...</span>
                </span>
                <span className="font-mono font-bold tabular-nums">{secondsLeft}s</span>
              </div>
            )}

            {adState === 'claiming' && (
              <div className="p-3 rounded-xl bg-cyan-950/35 border border-cyan-500/30 flex items-center gap-2 text-xs text-cyan-200">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Rolling your lucky credit reward...</span>
              </div>
            )}

            {adState === 'claimed' && lastAwarded !== null && (
              lastAwarded === 0 ? (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/35 flex items-center gap-2 text-xs text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Unlucky spin! You got 0 Credits this time — watch another ad to try again.</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/35 flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    {lastAwarded === AD_REWARD_MAX ? 'Jackpot! ' : 'Lucky spin! '}
                    +{lastAwarded} {lastAwarded === 1 ? 'Credit' : 'Credits'} added to your balance!
                  </span>
                </div>
              )
            )}

            {adState === 'error' && errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/35 text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            <a
              href={currentAdLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleStartWatchingAd}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all ${
                adState === 'watching' || adState === 'claiming'
                  ? 'bg-[#121833] text-slate-400 border border-[#1f2950] pointer-events-none'
                  : 'glitch-btn-primary cursor-pointer'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              <span>
                {adState === 'watching'
                  ? `Verifying View (${secondsLeft}s)...`
                  : adState === 'claimed'
                  ? `Watch Another Ad (Win 0–${AD_REWARD_MAX})`
                  : `Watch Ad (Win 0–${AD_REWARD_MAX} Credits)`}
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {!isSignedIn ? (
              <div className="p-4 rounded-xl bg-[#050814] border border-[#192241] space-y-3 text-center">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Sign in with Google to send Credits to friends or receive incoming Credit transfers.
                </p>
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  <span>Sign In with Google</span>
                </button>
              </div>
            ) : (
              <>
                {/* Your Receive Details */}
                <div className="p-3 rounded-xl bg-[#050814] border border-[#192241] flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Your Receive Info
                    </div>
                    <div className="text-slate-200 font-mono truncate mt-0.5">
                      {userEmail || currentUserId}
                    </div>
                  </div>
                  {currentUserId && (
                    <button
                      type="button"
                      onClick={handleCopyAccountId}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#090d1f] hover:bg-[#111834] border border-[#1d284b] text-[11px] text-cyan-300 cursor-pointer shrink-0"
                      title="Copy your Account ID"
                    >
                      {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId ? 'Copied ID' : 'Copy ID'}</span>
                    </button>
                  )}
                </div>

                {/* Send Form */}
                <form
                  onSubmit={handleTransferSubmit}
                  className="p-4 rounded-xl bg-[#050814] border border-[#192241] space-y-3"
                >
                  <div className="text-xs font-semibold text-white">Send Credits to Another User</div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Recipient Email or Account ID
                    </label>
                    <input
                      type="text"
                      value={recipientInput}
                      onChange={(e) => setRecipientInput(e.target.value)}
                      placeholder="friend@gmail.com or Account ID"
                      className="w-full bg-[#090d1f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Amount</label>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, Math.min(credits, MAX_TRANSFER_CREDITS))}
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        className="w-full bg-[#090d1f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Note (optional)</label>
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        maxLength={80}
                        placeholder="For images"
                        className="w-full bg-[#090d1f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {transferError && (
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/35 text-xs text-rose-300">
                      {transferError}
                    </div>
                  )}

                  {transferSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/35 text-xs text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{transferSuccess}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isTransferring || credits < 1}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isTransferring ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Transferring...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Credits</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Recent Transfer Activity */}
                {transferHistory.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#050814] border border-[#192241] space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Recent Transfers
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                      {transferHistory.slice(0, 6).map((tx) => {
                        const isSent = tx.fromUserId === currentUserId;
                        return (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#090d1f] border border-[#192241] text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isSent ? (
                                <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              ) : (
                                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-slate-200 truncate">
                                  {isSent ? `To ${tx.toName}` : `From ${tx.fromName}`}
                                </div>
                                {tx.note && (
                                  <div className="text-[10px] text-slate-500 truncate">{tx.note}</div>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={`font-mono font-bold ${
                                  isSent ? 'text-rose-300' : 'text-emerald-300'
                                }`}
                              >
                                {isSent ? `-${tx.amount}` : `+${tx.amount}`}
                              </div>
                              <div className="text-[10px] text-slate-500 capitalize">{tx.status}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#192241] text-xs">
          {isSignedIn ? (
            <span className="text-slate-400 truncate max-w-[240px]">
              {userEmail || 'Signed In'}
            </span>
          ) : (
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign in with Google</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProfile();
            }}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};
