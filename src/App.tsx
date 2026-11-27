/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { jsPDF } from 'jspdf';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatMessageItem } from './components/ChatMessageItem';
import { ChatInput, ChatComposerMode } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { ProfileModal } from './components/ProfileModal';
import { CreditsModal } from './components/CreditsModal';
import { GlobalAdScripts, NativeBannerAd, Banner320x50Ad } from './components/AdSlots';
import { HomePage } from './components/HomePage';
import { GuidesPage } from './components/GuidesPage';
import { AboutContactPage } from './components/AboutContactPage';
import { LegalPages } from './components/LegalPages';
import { VoiceCallModal } from './components/VoiceCallModal';
import { ChatSession, ChatMessage, ChatTone, UserProfile, AppView, CreditTransferRecord } from './types';
import { apiFetch, isStandaloneBuild } from './lib/api';
import { tryOfflineKnowledgeFallback } from './lib/offlineFallback';
import { generateClientImageFallback, trySilentPuterChat } from './lib/puterBridge';
import {
  signInWithGoogle,
  logOut,
  onAuthChange,
  consumePendingRedirectError,
  ensureCloudUserAccount,
  subscribeToUserProfile,
  saveCloudUserProfile,
  fetchCloudSessions,
  saveCloudSession,
  deleteCloudSession,
  awardAdCredits,
  transferCreditsToUser,
  subscribeToIncomingTransfers,
  claimIncomingTransfer,
  fetchCreditTransferHistory,
} from './lib/firebase';
import {
  GLITCH_AI_VERSION,
  INITIAL_CREDITS,
  rollLuckyAdReward,
  getGuestCredits,
  earnGuestCredits,
} from './lib/credits';

const STORAGE_KEY = 'glitch_ai_sessions_v1';
const USER_PROFILE_KEY = 'glitch_ai_user_profile_v1';
const LEGACY_STORAGE_KEY = 'proo_ai_sessions_v2';
const LEGACY_PROFILE_KEY = 'proo_ai_user_profile_v1';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Glitch User',
  role: 'AI Explorer',
  avatarColor: 'cyan',
  customAvatar: '',
  customInstructions: '',
};

function createNewSession(tone: ChatTone = 'default'): ChatSession {
  const id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  return {
    id,
    title: 'New Conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    tone,
  };
}

function formatFriendlyErrorMessage(err: any): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  let msg = typeof err === 'string' ? err : err?.message || String(err);

  for (let i = 0; i < 3; i++) {
    try {
      if (typeof msg === 'string' && (msg.trim().startsWith('{') || msg.trim().startsWith('['))) {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message && typeof parsed.error.message === 'string') {
          msg = parsed.error.message;
        } else if (parsed?.message && typeof parsed.message === 'string') {
          msg = parsed.message;
        } else if (parsed?.error && typeof parsed.error === 'string') {
          msg = parsed.error;
        }
      }
    } catch {
      break;
    }
  }

  if (
    !msg.includes('No Credits were deducted') &&
    !msg.includes('no Credits were deducted') &&
    (msg.includes('503') ||
      msg.includes('high demand') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('Service Unavailable'))
  ) {
    return 'Glitch AI servers are experiencing a brief surge in traffic. Click Retry Generation below to continue.';
  }

  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Rate limit reached. Please wait a moment and click Retry Generation.';
  }

  return msg;
}

function formatGeneratedImageCaption(
  aspectRatio: string | undefined,
  resLabel: string
): string {
  const ratioPart = aspectRatio ? `${aspectRatio} · ` : '';
  const highlights = [
    `Here is your **4K Ultra-HD** creation (**${ratioPart}${resLabel}**), rendered with rich lighting, crisp fine detail, and balanced depth.`,
    `Your **4K Ultra-HD** visual (**${ratioPart}${resLabel}**) is ready — crafted with sharp focus, natural color depth, and studio composition.`,
    `Crafted in **4K Ultra-HD** (**${ratioPart}${resLabel}**) with high-definition texture, atmospheric lighting, and clean framing.`,
    `Delivered in **4K Ultra-HD** (**${ratioPart}${resLabel}**) with crisp clarity, lifelike tones, and refined visual contrast.`,
  ];
  const chosen = highlights[Math.floor(Math.random() * highlights.length)];
  return `${chosen}\n\n*(Unlimited 4K Ultra-HD · Free)*`;
}

function resolveClientAspectFallback(prompt: string): {
  aspectRatio: string;
  targetWidth: number;
  targetHeight: number;
  genWidth: number;
  genHeight: number;
  sdWidth: number;
  sdHeight: number;
  zImageEnum: string;
  qwenRatio: string;
} {
  const lower = prompt.toLowerCase();
  if (/\b21:9\b|\bultrawide\b|\bpanoram/i.test(lower)) {
    return {
      aspectRatio: '21:9',
      targetWidth: 3840,
      targetHeight: 1646,
      genWidth: 1344,
      genHeight: 576,
      sdWidth: 1280,
      sdHeight: 544,
      zImageEnum: '2048x896 ( 21:9 )',
      qwenRatio: '16:9',
    };
  }
  if (/\b16:9\b|\blandscape\b|\byoutube\s*thumbnail\b|\bdesktop\s*wallpaper\b|\bwidescreen\b/i.test(lower)) {
    return {
      aspectRatio: '16:9',
      targetWidth: 3840,
      targetHeight: 2160,
      genWidth: 1344,
      genHeight: 768,
      sdWidth: 1280,
      sdHeight: 720,
      zImageEnum: '2048x1152 ( 16:9 )',
      qwenRatio: '16:9',
    };
  }
  if (/\b9:16\b|\breels?\b|\btiktok\b|\bshorts\b|\bmobile\s*wallpaper\b|\bphone\s*wallpaper\b|\bvertical\b|\bstory\b/i.test(lower)) {
    return {
      aspectRatio: '9:16',
      targetWidth: 2160,
      targetHeight: 3840,
      genWidth: 768,
      genHeight: 1344,
      sdWidth: 720,
      sdHeight: 1280,
      zImageEnum: '1152x2048 ( 9:16 )',
      qwenRatio: '9:16',
    };
  }
  if (/\b4:3\b|\bclassic\b/i.test(lower)) {
    return {
      aspectRatio: '4:3',
      targetWidth: 2880,
      targetHeight: 2160,
      genWidth: 1152,
      genHeight: 896,
      sdWidth: 1024,
      sdHeight: 768,
      zImageEnum: '1728x1296 ( 4:3 )',
      qwenRatio: '4:3',
    };
  }
  if (/\b3:4\b|\b4:5\b|\bportrait\b|\binstagram\b/i.test(lower)) {
    return {
      aspectRatio: '3:4',
      targetWidth: 2160,
      targetHeight: 2880,
      genWidth: 896,
      genHeight: 1152,
      sdWidth: 768,
      sdHeight: 1024,
      zImageEnum: '1296x1728 ( 3:4 )',
      qwenRatio: '3:4',
    };
  }
  return {
    aspectRatio: '1:1',
    targetWidth: 2160,
    targetHeight: 2160,
    genWidth: 1280,
    genHeight: 1280,
    sdWidth: 1024,
    sdHeight: 1024,
    zImageEnum: '1536x1536 ( 1:1 )',
    qwenRatio: '1:1',
  };
}

function inferExecutionMode(
  text: string,
  explicitMode?: ChatComposerMode,
  hasImage?: boolean
): ChatComposerMode {
  if (explicitMode === 'image' || explicitMode === 'video') {
    return explicitMode;
  }
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. Explicit meta-talk, negation, debugging, or coding/web discussion NEVER triggers image generation
  if (
    /\b(?:don'?t|do\s+not|stop|avoid|never|not\s+asking(?:\s+you)?\s+to|without)\s+(?:generate|generating|create|creating|make|making|draw|drawing|render|rendering)\s+(?:an?\s+|the\s+)?(?:image|pic|picture|photo|visual|artwork)\b/i.test(
      lower
    ) ||
    /\b(?:mention(?:ed|ing)?|say(?:ing)?|type|typed|typing|word)\s+["']?(?:image|pic|picture|photo|logo|drawing)["']?/i.test(
      lower
    ) ||
    /\b(?:image\s+generation|your\s+image|img\s+tag|<\s*img\b|background-image|image\s+(?:url|src|path|slider|carousel|gallery|uploader|upload|viewer|compression|resizer|format|quality|resolution|error|bug|issue)|profile\s+pic\s+code)\b/i.test(
      lower
    )
  ) {
    return 'chat';
  }

  const isTechCodeOrQuestion =
    /^\s*(?:how\s+(?:to|do\s+i|can\s+i|does)|what\s+(?:is|are|does|do)|why\s+(?:is|are|does|do|did|was)|when\s+(?:should|to)|where\s+(?:can|do|is)|which\s+(?:image|photo|pic|format|tool|one)|explain\b|define\b|describe\b|compare\b|fix\s+(?:this|my|the)\b|debug\b|troubleshoot\b|review\b|refactor\b|kaise\b|kya\s+hai\b|kyun\b|samjhao\b|batao\b)/i.test(
      trimmed
    ) ||
    /\b(?:html|css|scss|tailwind|javascript|typescript|react|next\.?js|vue|svelte|python|java|node|express|sql|api|json|base64|svg\s+code|component|function|class|script|program|database|regex|algorithm|error\s+in|bug\s+in)\b/i.test(
      lower
    );

  if (isTechCodeOrQuestion) {
    return 'chat';
  }

  // 2. If user attached a reference image, default to Vision Chat unless they give an explicit visual edit or animation command
  if (hasImage) {
    if (/\b(?:animate(?:\s+this)?|turn\s+this\s+into\s+a\s+video|make\s+a\s+video)\b/i.test(lower)) {
      return 'video';
    }
    if (
      /\b(?:edit\s+this(?:\s+(?:image|photo|pic|picture))?|reimagine\s+this|remix\s+this|turn\s+(?:this|it)\s+into|change\s+the\s+background|remove\s+the\s+background|replace\s+the\b|restyle\s+this|make\s+(?:this|it)\s+look\s+like|background\s+change|badal\s+do)\b/i.test(
        lower
      )
    ) {
      return 'image';
    }
    return 'chat';
  }

  // 3. Video generation intent (Coming Soon notice)
  if (
    /^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:generate|create|make|render|produce|synthesize|animate|banao)\s+(?:me\s+)?(?:a|an|the|ek)?\s*(?:\S+\s+){0,5}(?:video|animation|clip|movie|film|reel)\b/i.test(
      trimmed
    )
  ) {
    return 'video';
  }

  // 4. Genuine direct image creation directives only (never casual conversation mentions)
  const mediaNouns =
    '(?:image|images|pic|pics|picture|pictures|photo|photos|photograph|portrait|selfie|headshot|logo|logos|illustration|artwork|wallpaper|poster|posters|thumbnail|banner|avatar|pfp|caricature|drawing|sketch|painting|tasveer|tasweer)';
  const nonVisualFollower =
    '(?!\\s+(?:generation|generator|feature|system|quality|issue|bug|error|problem|tag|url|src|path|code|component|slider|carousel|gallery|upload|uploader|viewer|format|compression|extension|prompt|prompts))';
  const creationVerbs =
    '(?:generate|create|make|draw|paint|render|design|illustrate|sketch|imagine|visualize|banao|banado|bana\\s+do|tayyar\\s+karo)';

  const directCommandRegex = new RegExp(
    `^\\s*(?:please\\s+|plz\\s+|pls\\s+|can\\s+you\\s+|could\\s+you\\s+|would\\s+you\\s+|i\\s+want\\s+you\\s+to\\s+|i\\s+need\\s+you\\s+to\\s+)?${creationVerbs}\\s+(?:me\\s+)?(?:a|an|the|ek|aik)?\\s*(?:\\S+\\s+){0,6}${mediaNouns}${nonVisualFollower}(?:\\s+(?:of|with|showing|featuring|for|in|style|looking|wearing|standing|sitting|at|on|under|from|ki|ka)\\b|\\s*$)`,
    'i'
  );
  const directShowMeVisualRegex = new RegExp(
    `^\\s*(?:show\\s+me|give\\s+me|get\\s+me)\\s+(?:a|an|the|ek)?\\s*(?:realistic|photorealistic|hyperrealistic|ultra[-\\s]?realistic|4k|8k|hd|cinematic|anime|3d|cartoon|minimalist|custom|new)?\\s*${mediaNouns}${nonVisualFollower}\\s+(?:of|for|featuring|showing)\\b`,
    'i'
  );
  const nounThenUrduVerbRegex = new RegExp(
    `\\b${mediaNouns}${nonVisualFollower}[\\s\\S]{0,40}\\b(?:banao|banado|bana\\s+do|banani\\s+hai|generate\\s+karo|create\\s+karo)\\b`,
    'i'
  );
  const directArtVerbRegex =
    /^\s*(?:draw|paint|sketch|illustrate)\s+(?:me\s+)?(?:a|an|the|ek)?\s*(?!(?:diagram\s+of\s+how|chart\s+of\s+code|conclusion|attention|comparisons?|out\s+(?:a|an)\s+(?:plan|roadmap|architecture|system|flow)))[a-z0-9\u0600-\u06FF\u0900-\u097F]/i;

  const trimmedNoQuestion = trimmed.replace(/[?!.]+$/, '');
  const looksLikeGeneralQuestion =
    trimmed.endsWith('?') &&
    !/^\s*(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:generate|create|make|draw|paint|render|design|illustrate|sketch)\b/i.test(
      trimmed
    );

  if (
    !looksLikeGeneralQuestion &&
    (directCommandRegex.test(trimmedNoQuestion) ||
      directShowMeVisualRegex.test(trimmedNoQuestion) ||
      nounThenUrduVerbRegex.test(trimmedNoQuestion) ||
      directArtVerbRegex.test(trimmedNoQuestion) ||
      (trimmed.length < 160 &&
        /\b(?:21:9|16:9|9:16|4:5|5:4|3:2|2:3)\b/i.test(trimmed) &&
        new RegExp(`\\b${mediaNouns}${nonVisualFollower}\\b`, 'i').test(trimmed)))
  ) {
    return 'image';
  }

  return 'chat';
}

function shouldUseLiveSearch(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/https?:\/\/[^\s]+/i.test(trimmed)) return true;

  // Skip purely trivial short conversational greetings/acknowledgments in any script
  const isPureGreeting =
    /^(?:hi|hello|hey|yo|sup|helo|good\s+(?:morning|afternoon|evening|night)|thanks|thank\s+you|thx|ok|okay|k|cool|nice|great|bye|goodbye|salam|assalam\s*(?:o|u)?\s*alaikum|wsalam|walikum\s*assalam|shukriya|namaste|hola|bonjour)\b[!?.،۔\s]*$/i.test(
      trimmed
    );
  if (isPureGreeting || trimmed.length <= 3) return false;

  // Skip pure code-block paste debugging without a factual web question
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) return false;

  // Enable real-time live internet grounding broadly across all languages and topics
  return true;
}

function persistSessionsSafely(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Strip heavy base64 video/image blobs so text chat history stays safely persisted
    try {
      const compact = sessions.map((s) => ({
        ...s,
        messages: s.messages.map((m) => ({
          ...m,
          videoUrl: m.videoUrl && m.videoUrl.length > 200000 ? undefined : m.videoUrl,
          generatedImageUrl:
            m.generatedImageUrl && m.generatedImageUrl.length > 350000
              ? undefined
              : m.generatedImageUrl,
        })),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // ignore if quota completely full
    }
  }
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [createNewSession()];
  });

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(USER_PROFILE_KEY) || localStorage.getItem(LEGACY_PROFILE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.name === 'string') {
          return {
            ...parsed,
            name: parsed.name === 'Proo User' ? 'Glitch User' : parsed.name,
            role: parsed.role === 'Gamer & Strategist' ? 'AI Explorer' : parsed.role || 'AI Explorer',
          };
        }
      }
    } catch {}
    return DEFAULT_PROFILE;
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || '';
  });

  const [currentView, setCurrentView] = useState<AppView>('chat');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [credits, setCredits] = useState<number>(() => getGuestCredits());
  const [transferHistory, setTransferHistory] = useState<CreditTransferRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [incomingTransferNotice, setIncomingTransferNotice] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const wasSignedInRef = useRef(false);
  const isSendingRef = useRef(false);
  const isExportingHtmlRef = useRef(false);
  const claimingTxIdsRef = useRef<Set<string>>(new Set());
  const cloudReadyPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const sessionsRef = useRef(sessions);
  const userProfileRef = useRef(userProfile);

  useEffect(() => {
    if (isStandaloneBuild()) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey) return;
      if (e.key !== 'N' && e.key !== 'n') return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      e.preventDefault();
      if (isExportingHtmlRef.current) return;
      isExportingHtmlRef.current = true;
      setExportNotice('Preparing standalone index.html download...');

      try {
        const res = await apiFetch('/api/export-standalone', {
          method: 'GET',
          headers: { Accept: 'text/html' },
        });
        if (!res.ok) {
          let errMsg = 'Could not generate standalone index.html.';
          try {
            const errJson = await res.json();
            if (errJson?.error) errMsg = errJson.error;
          } catch {}
          throw new Error(errMsg);
        }
        const htmlContent = await res.text();
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'index.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportNotice('Downloaded standalone index.html (ready to deploy to your domain).');
        window.setTimeout(() => setExportNotice(null), 5000);
      } catch (err: any) {
        setExportNotice(err?.message || 'Standalone index.html export failed.');
      } finally {
        isExportingHtmlRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
    persistSessionsSafely(sessions);
  }, [sessions]);

  useEffect(() => {
    userProfileRef.current = userProfile;
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(userProfile));
    } catch {}
  }, [userProfile]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeTransfers: (() => void) | null = null;
    let isDisposed = false;

    const pendingErr = consumePendingRedirectError();
    if (pendingErr) {
      if (pendingErr?.code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setAuthNotice(
          `Add "${host}" under Firebase Console -> Authentication -> Settings -> Authorized domains to enable Google Sign-In.`
        );
      } else {
        setAuthNotice('Google Sign-In could not finish: ' + (pendingErr?.message || 'Please try again.'));
      }
    }

    const unsubscribeAuth = onAuthChange(async (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      if (unsubscribeTransfers) {
        unsubscribeTransfers();
        unsubscribeTransfers = null;
      }

      setCurrentUser(user);

      if (user) {
        wasSignedInRef.current = true;
        setAuthNotice(null);
        setUserProfile((prev) => ({
          ...prev,
          name:
            prev.name === 'Glitch User' || !prev.name
              ? user.displayName || prev.name
              : prev.name,
          email: user.email || prev.email || '',
          customAvatar: prev.customAvatar || user.photoURL || '',
        }));
        setIsSyncing(true);
        const initPromise = (async () => {
          try {
            const { profile: cloudProf, isNewAccount } = await ensureCloudUserAccount(
              user,
              userProfileRef.current
            );
            if (isDisposed) return;

            setUserProfile((prev) => ({
              ...prev,
              name: cloudProf.name || prev.name,
              role: cloudProf.role || prev.role,
              avatarColor: cloudProf.avatarColor || prev.avatarColor,
              customAvatar: cloudProf.customAvatar ?? prev.customAvatar,
              customInstructions: cloudProf.customInstructions ?? prev.customInstructions,
              email: cloudProf.email || user.email || '',
              credits: typeof cloudProf.credits === 'number' ? cloudProf.credits : INITIAL_CREDITS,
            }));
            setCredits(typeof cloudProf.credits === 'number' ? cloudProf.credits : INITIAL_CREDITS);

            unsubscribeProfile = subscribeToUserProfile(user.uid, (liveProfile) => {
              setUserProfile((prev) => ({
                ...prev,
                ...liveProfile,
                email: liveProfile.email || user.email || '',
              }));
              if (typeof liveProfile.credits === 'number') {
                setCredits(liveProfile.credits);
              }
            });

            unsubscribeTransfers = subscribeToIncomingTransfers(user.uid, async (pending) => {
              for (const tx of pending) {
                if (claimingTxIdsRef.current.has(tx.id)) continue;
                claimingTxIdsRef.current.add(tx.id);
                try {
                  const nextBal = await claimIncomingTransfer(user.uid, tx);
                  if (!isDisposed && typeof nextBal === 'number') {
                    setCredits(nextBal);
                    setIncomingTransferNotice(
                      `Received +${tx.amount} Credits from ${tx.fromName || 'another user'}.`
                    );
                    fetchCreditTransferHistory(user.uid)
                      .then((history) => {
                        if (!isDisposed) setTransferHistory(history);
                      })
                      .catch(() => {});
                  }
                } catch (err) {
                  console.warn('Transfer claim note:', err);
                  claimingTxIdsRef.current.delete(tx.id);
                }
              }
            });

            fetchCreditTransferHistory(user.uid)
              .then((history) => {
                if (!isDisposed) setTransferHistory(history);
              })
              .catch(() => {});

            const cloudSessions = await fetchCloudSessions(user.uid);
            if (isDisposed) return;

            if (cloudSessions && cloudSessions.length > 0) {
              setSessions(cloudSessions);
              setActiveSessionId(cloudSessions[0].id);
            } else {
              const localNonEmpty = sessionsRef.current.filter((s) => s.messages.length > 0);
              if (isNewAccount && localNonEmpty.length > 0) {
                for (const s of localNonEmpty) {
                  await saveCloudSession(user.uid, s);
                }
              } else {
                const fresh = createNewSession();
                setSessions([fresh]);
                setActiveSessionId(fresh.id);
              }
            }
          } catch (e: any) {
            console.error('Error synchronizing account on auth:', e);
            if (!isDisposed) {
              setAuthNotice(
                `Signed in as ${user.email || 'Google user'}, but cloud sync hit an error: ${e?.message || 'Check Firestore rules or connection.'}`
              );
            }
          } finally {
            if (!isDisposed) setIsSyncing(false);
          }
        })();
        cloudReadyPromiseRef.current = initPromise;
        await initPromise;
      } else if (wasSignedInRef.current) {
        cloudReadyPromiseRef.current = Promise.resolve();
        wasSignedInRef.current = false;
        claimingTxIdsRef.current.clear();
        setIsProfileOpen(false);
        setIsCreditsOpen(false);
        setTransferHistory([]);
        setIncomingTransferNotice(null);
        const fresh = createNewSession();
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
        setUserProfile(DEFAULT_PROFILE);
        setCredits(getGuestCredits());
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(USER_PROFILE_KEY);
        } catch {}
      } else {
        cloudReadyPromiseRef.current = Promise.resolve();
        setIsProfileOpen(false);
        setIsCreditsOpen(false);
        setTransferHistory([]);
        setCredits(getGuestCredits());
      }
    });

    return () => {
      isDisposed = true;
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeTransfers) unsubscribeTransfers();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!sessions.some((s) => s.id === activeSessionId)) {
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      } else {
        const fresh = createNewSession();
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
      }
    }
  }, [sessions, activeSessionId]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [activeSessionId, currentView]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    shouldAutoScrollRef.current = isNearBottom;
  };

  const handleCreateNewChat = () => {
    if (isStreaming) {
      handleStopStreaming();
    }
    const newSession = createNewSession(activeSession?.tone || 'default');
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setCurrentView('chat');
    shouldAutoScrollRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 100);

    if (currentUser) {
      saveCloudSession(currentUser.uid, newSession).catch(() => {});
    }
  };

  const handleDeleteSession = (id: string) => {
    if (isStreaming && activeSessionId === id) {
      handleStopStreaming();
    }
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      return remaining.length === 0 ? [createNewSession()] : remaining;
    });

    if (currentUser) {
      deleteCloudSession(currentUser.uid, id).catch(() => {});
    }
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    let updatedSession: ChatSession | null = null;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          updatedSession = { ...s, title: newTitle, updatedAt: Date.now() };
          return updatedSession;
        }
        return s;
      })
    );

    if (currentUser && updatedSession) {
      saveCloudSession(currentUser.uid, updatedSession).catch(() => {});
    }
  };

  const handleClearAllSessions = () => {
    if (isStreaming) handleStopStreaming();
    const prevSessions = sessions;
    const fresh = createNewSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);

    if (currentUser) {
      for (const s of prevSessions) {
        deleteCloudSession(currentUser.uid, s.id).catch(() => {});
      }
      saveCloudSession(currentUser.uid, fresh).catch(() => {});
    }
  };

  const handleClearCurrentChat = () => {
    if (isStreaming) handleStopStreaming();
    let clearedSession: ChatSession | null = null;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSessionId) {
          clearedSession = { ...s, messages: [], updatedAt: Date.now() };
          return clearedSession;
        }
        return s;
      })
    );

    if (currentUser && clearedSession) {
      saveCloudSession(currentUser.uid, clearedSession).catch(() => {});
    }
  };

  const handleSaveProfile = async (newProf: UserProfile) => {
    setUserProfile(newProf);
    if (currentUser) {
      setIsSyncing(true);
      try {
        await cloudReadyPromiseRef.current;
        await saveCloudUserProfile(currentUser.uid, newProf, currentUser.email || undefined);
      } catch (err) {
        console.error('Failed to save profile to Firebase:', err);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleOpenProfile = () => {
    if (!currentUser) return;
    setIsProfileOpen(true);
  };

  const handleOpenCredits = () => {
    if (!currentUser) return;
    setIsCreditsOpen(true);
  };

  const handleGoogleSignIn = async () => {
    setAuthNotice(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-supported-in-this-environment') {
        setAuthNotice(
          'Google Sign-In requires http:// or https:// hosting (for example, once deployed to your domain). Chat and Voice Call work anytime.'
        );
      } else if (err?.code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setAuthNotice(
          `Add "${host}" under Firebase Console -> Authentication -> Settings -> Authorized domains to enable Google Sign-In on this domain.`
        );
      } else if (err?.code === 'auth/popup-blocked') {
        setAuthNotice(
          'Your browser blocked the Google Sign-In popup. Please allow popups for this site in your address bar and click Sign In again.'
        );
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setAuthNotice('Sign-in popup was closed before finishing. Click Sign In to try again.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setAuthNotice('A previous sign-in window was still open. Please click Sign In once more.');
      } else {
        setAuthNotice('Could not sign in with Google: ' + (err?.message || 'Please try again.'));
      }
    }
  };

  const handleSignOut = async () => {
    try {
      setIsProfileOpen(false);
      setIsCreditsOpen(false);
      await logOut();
      setCurrentUser(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  const handleClaimAdReward = async (): Promise<{ awarded: number; nextCredits: number }> => {
    const awarded = rollLuckyAdReward();
    if (currentUser) {
      await cloudReadyPromiseRef.current;
      const nextCredits = await awardAdCredits(currentUser.uid, awarded);
      setCredits(nextCredits);
      return { awarded, nextCredits };
    }
    const nextCredits = earnGuestCredits(awarded);
    setCredits(nextCredits);
    return { awarded, nextCredits };
  };

  const handleRefreshTransfers = async (): Promise<void> => {
    if (!currentUser) {
      setTransferHistory([]);
      return;
    }
    await cloudReadyPromiseRef.current;
    const history = await fetchCreditTransferHistory(currentUser.uid);
    setTransferHistory(history);
  };

  const handleTransferCredits = async (params: {
    recipientInput: string;
    amount: number;
    note?: string;
  }): Promise<{ transferId: string; nextCredits: number; recipientName: string }> => {
    if (!currentUser) {
      throw new Error('Please sign in with Google to transfer credits.');
    }
    await cloudReadyPromiseRef.current;
    const result = await transferCreditsToUser({
      senderUid: currentUser.uid,
      senderName: userProfile.name || currentUser.displayName || 'Glitch User',
      recipientInput: params.recipientInput,
      amount: params.amount,
      note: params.note,
    });
    setCredits(result.nextCredits);
    fetchCreditTransferHistory(currentUser.uid)
      .then((history) => setTransferHistory(history))
      .catch(() => {});
    return result;
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSendingRef.current = false;
    setIsStreaming(false);

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.isStreaming || m.isGeneratingMedia
              ? { ...m, isStreaming: false, isGeneratingMedia: false }
              : m
          ),
        };
      })
    );
  };

  const updateBotMessage = (
    targetSessionId: string,
    botMessageId: string,
    patch: Partial<ChatMessage>
  ) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== targetSessionId) return s;
        return {
          ...s,
          updatedAt: Date.now(),
          messages: s.messages.map((m) => (m.id === botMessageId ? { ...m, ...patch } : m)),
        };
      })
    );
  };

  const handleSendMessage = async (
    text: string,
    options?: {
      useSearch?: boolean;
      useMaps?: boolean;
      imageUrl?: string;
      mode?: ChatComposerMode;
    },
    customHistory?: ChatMessage[]
  ) => {
    if ((!text.trim() && !options?.imageUrl) || isStreaming || isSendingRef.current) return;
    isSendingRef.current = true;

    if (currentView !== 'chat') {
      setCurrentView('chat');
    }

    const effectiveMode = inferExecutionMode(text, options?.mode, Boolean(options?.imageUrl));
    const autoUseSearch = options?.useSearch ?? (effectiveMode === 'chat' && shouldUseLiveSearch(text));
    const targetSessionId = activeSession.id;

    const userMessage: ChatMessage = {
      id: 'msg_' + Date.now() + '_u',
      role: 'user',
      content: text.trim() || 'Analyze this image.',
      timestamp: Date.now(),
      imageUrl: options?.imageUrl,
    };

    const botMessageId = 'msg_' + (Date.now() + 1) + '_b';
    const isImageMode = effectiveMode === 'image';
    const requiresAuthForImage = isImageMode && !currentUser;
    const botPlaceholder: ChatMessage = {
      id: botMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: !isImageMode && effectiveMode !== 'video',
      isGeneratingMedia: isImageMode && !requiresAuthForImage,
      mediaType: isImageMode && !requiresAuthForImage ? 'image' : undefined,
      mediaProgressLabel: isImageMode && !requiresAuthForImage ? 'Rendering 4K Ultra-HD artwork...' : undefined,
    };

    const baseHistory = (customHistory || activeSession.messages).filter(
      (m) => !m.error && m.content.trim() !== '...'
    );
    const isFirstMessage = baseHistory.length === 0;
    const computedTitle = isFirstMessage
      ? text.length > 32
        ? text.slice(0, 32) + '...'
        : text
      : activeSession.title;

    const updatedMessages = [...baseHistory, userMessage];

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== targetSessionId) return s;
        return {
          ...s,
          title: computedTitle,
          updatedAt: Date.now(),
          messages: [...updatedMessages, botPlaceholder],
        };
      })
    );

    shouldAutoScrollRef.current = true;
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const persistThreadSafely = async (finalMsg: ChatMessage) => {
      if (!currentUser) return;
      try {
        await cloudReadyPromiseRef.current;
        await saveCloudSession(currentUser.uid, {
          ...activeSession,
          title: computedTitle,
          updatedAt: Date.now(),
          messages: [...updatedMessages, finalMsg],
        });
      } catch (e) {
        console.warn('Cloud session sync note:', e);
      }
    };

    try {
      // 1. VIDEO GENERATION (COMING SOON IN FUTURE VERSION)
      if (effectiveMode === 'video') {
        const mediaDetail = currentUser
          ? `Right now, you can continue using **Chat**, **Live Voice Call**, and **Unlimited 4K Ultra-HD Image Generation** (Free).`
          : `Right now, you can continue using **Chat** and **Live Voice Call**.`;
        const comingSoonMessage: ChatMessage = {
          id: botMessageId,
          role: 'assistant',
          content: `**Video Generation is Coming Soon!**\n\nVideo creation is temporarily paused in **Glitch AI v${GLITCH_AI_VERSION}** and will launch in an upcoming version update.\n\n${mediaDetail}`,
          timestamp: Date.now(),
          isStreaming: false,
          isGeneratingMedia: false,
        };

        updateBotMessage(targetSessionId, botMessageId, comingSoonMessage);
        await persistThreadSafely(comingSoonMessage);
        return;
      }

      // 2. UNLIMITED FREE 4K ULTRA-HD IMAGE GENERATION (REQUIRES GOOGLE SIGN-IN, 0 CREDITS)
      if (effectiveMode === 'image') {
        if (!currentUser) {
          const signInRequiredMsg: ChatMessage = {
            id: botMessageId,
            role: 'assistant',
            content: `**Sign In Required**\n\nPlease sign in with your Google account to unlock Unlimited Free 4K Ultra-HD Image Generation and editing.`,
            timestamp: Date.now(),
            isStreaming: false,
            isGeneratingMedia: false,
          };
          updateBotMessage(targetSessionId, botMessageId, signInRequiredMsg);
          return;
        }

        await cloudReadyPromiseRef.current;

        const clientAspect = resolveClientAspectFallback(userMessage.content);
        let data: any = {
          fallbackToClient: true,
          prompt: userMessage.content,
          ...clientAspect,
        };

        try {
          const res = await apiFetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: userMessage.content,
              baseImage: options?.imageUrl,
            }),
            signal: abortController.signal,
          });
          if (res.ok) {
            const serverJson = await res.json().catch(() => null);
            if (serverJson && typeof serverJson === 'object') {
              data = serverJson;
            }
          }
        } catch (imgErr: any) {
          if (imgErr?.name === 'AbortError') throw imgErr;
          // Gracefully continue with client-side 4K Ultra-HD multi-tier neural cluster
        }

        let finalImageUrl = data.imageUrl;
        if (data.fallbackToClient || !finalImageUrl) {
          finalImageUrl = await generateClientImageFallback(
            data.prompt || userMessage.content,
            data.targetWidth || clientAspect.targetWidth,
            data.targetHeight || clientAspect.targetHeight,
            data.enhancedPrompt,
            data.negatives,
            data.genWidth || clientAspect.genWidth,
            data.genHeight || clientAspect.genHeight,
            data.sdWidth || clientAspect.sdWidth,
            data.sdHeight || clientAspect.sdHeight,
            data.zImageEnum || clientAspect.zImageEnum,
            data.qwenRatio || clientAspect.qwenRatio,
            (progressText) => {
              updateBotMessage(targetSessionId, botMessageId, {
                mediaProgressLabel: progressText,
              });
            }
          );
        }

        if (!finalImageUrl) {
          throw new Error('Glitch AI could not complete rendering this visual right now. Click Retry Generation below to try again.');
        }

        const resLabel = data.resolution || `${data.targetWidth || clientAspect.targetWidth}x${data.targetHeight || clientAspect.targetHeight}`;
        const finalBotMessage: ChatMessage = {
          id: botMessageId,
          role: 'assistant',
          content: formatGeneratedImageCaption(data.aspectRatio || clientAspect.aspectRatio, resLabel),
          timestamp: Date.now(),
          isStreaming: false,
          isGeneratingMedia: false,
          mediaType: 'image',
          generatedImageUrl: finalImageUrl,
        };

        updateBotMessage(targetSessionId, botMessageId, finalBotMessage);
        await persistThreadSafely(finalBotMessage);
        return;
      }

      // 3. STANDARD / VISION / AUTO-GROUNDED CHAT STREAM
      let accumulatedText = '';
      let accumulatedSources: Array<{ title?: string; url?: string }> = [];

      const sanitizedHistory = updatedMessages
        .filter((m) => !m.error && m.content.trim() !== '...' && ((m.content && m.content.trim().length > 0) || m.imageUrl))
        .map((m) => ({
          role: m.role,
          content: m.content,
          imageUrl: m.imageUrl,
        }));

      try {
        const response = await apiFetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: sanitizedHistory,
            tone: activeSession.tone,
            userProfile: currentUser ? userProfile : DEFAULT_PROFILE,
            useSearch: autoUseSearch,
            useMaps: options?.useMaps,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let errMessage = 'Failed to generate response.';
          try {
            const errData = await response.json();
            if (errData?.error) errMessage = errData.error;
          } catch {}
          throw new Error(errMessage);
        }

        if (!response.body) {
          throw new Error('Streaming response body is missing.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const dataPayload = trimmed.slice(6);
            if (dataPayload === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataPayload);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.groundingSources && Array.isArray(parsed.groundingSources)) {
                accumulatedSources = parsed.groundingSources;
              }
              if (parsed.text) {
                accumulatedText += parsed.text;
                updateBotMessage(targetSessionId, botMessageId, {
                  content: accumulatedText,
                  isStreaming: true,
                  groundingSources:
                    accumulatedSources.length > 0 ? accumulatedSources : undefined,
                });
                scrollToBottom('auto');
              }
            } catch (e: any) {
              if (e instanceof SyntaxError) {
                continue;
              }
              throw e;
            }
          }
        }
      } catch (streamErr: any) {
        if (streamErr?.name === 'AbortError') throw streamErr;
        if (!accumulatedText.trim()) {
          const silentReply = await trySilentPuterChat(
            sanitizedHistory.map((m) => ({ role: m.role, content: m.content }))
          );
          if (silentReply && silentReply.trim() && silentReply.trim() !== '...') {
            accumulatedText = silentReply.trim();
          } else {
            const offlineAnswer = tryOfflineKnowledgeFallback(userMessage.content);
            if (offlineAnswer) {
              accumulatedText = offlineAnswer;
            } else {
              throw streamErr;
            }
          }
        }
      }

      if (!accumulatedText.trim() || /^\.{2,}$/.test(accumulatedText.trim())) {
        const silentReply = await trySilentPuterChat(
          sanitizedHistory.map((m) => ({ role: m.role, content: m.content }))
        );
        if (silentReply && silentReply.trim() && !/^\.{2,}$/.test(silentReply.trim())) {
          accumulatedText = silentReply.trim();
        } else {
          throw new Error('Could not receive a complete reply right now. Click Retry Generation below.');
        }
      }

      const finalBotMessage: ChatMessage = {
        id: botMessageId,
        role: 'assistant',
        content: accumulatedText,
        timestamp: Date.now(),
        isStreaming: false,
        groundingSources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
      };

      updateBotMessage(targetSessionId, botMessageId, finalBotMessage);
      await persistThreadSafely(finalBotMessage);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request stopped by user');
      } else {
        console.error('Request error:', err);
        const friendlyError = formatFriendlyErrorMessage(err);
        updateBotMessage(targetSessionId, botMessageId, {
          content: friendlyError,
          isStreaming: false,
          isGeneratingMedia: false,
          error: true,
        });
      }
    } finally {
      isSendingRef.current = false;
      setIsStreaming(false);
      abortControllerRef.current = null;
      setTimeout(() => scrollToBottom(), 50);
    }
  };

  const handleRetryLastMessage = () => {
    if (activeSession.messages.length === 0 || isStreaming || isSendingRef.current) return;
    const lastUserIdx = activeSession.messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx < 0) return;
    const lastUserMsg = activeSession.messages[lastUserIdx];
    const priorHistory = activeSession.messages
      .slice(0, lastUserIdx)
      .filter((m) => !m.error && m.content.trim() !== '...');

    handleSendMessage(
      lastUserMsg.content,
      { imageUrl: lastUserMsg.imageUrl },
      priorHistory
    );
  };

  const handleExportChat = () => {
    if (activeSession.messages.length === 0) return;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 44;
    const maxLineWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Header Block
    doc.setFillColor(10, 14, 28);
    doc.roundedRect(margin, y, maxLineWidth, 56, 8, 8, 'F');
    doc.setTextColor(34, 211, 238);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Glitch AI v${GLITCH_AI_VERSION}  |  by Al-Fateh`, margin + 16, y + 23);

    doc.setTextColor(203, 213, 225);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const metaLine = `${activeSession.title}  •  ${new Date(activeSession.createdAt).toLocaleString()}`;
    const metaWrapped = doc.splitTextToSize(metaLine, maxLineWidth - 32);
    doc.text(metaWrapped[0] || activeSession.title, margin + 16, y + 42);
    y += 76;

    activeSession.messages.forEach((m) => {
      const author = m.role === 'user' ? (currentUser ? userProfile.name || 'User' : 'You') : 'Glitch AI';
      const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      ensureSpace(36);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      if (m.role === 'user') {
        doc.setTextColor(14, 116, 144);
      } else {
        doc.setTextColor(67, 56, 202);
      }
      doc.text(`${author} (${timeStr})`, margin, y);
      y += 16;

      let bodyText = (m.content || '')
        .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').replace(/```/g, ''))
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .trim();

      if (m.imageUrl && !bodyText) {
        bodyText = '[User uploaded an image]';
      } else if (m.generatedImageUrl) {
        bodyText = bodyText ? `${bodyText}\n[Generated Image Attached]` : '[Generated Image Attached]';
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);

      const lines: string[] = doc.splitTextToSize(bodyText || ' ', maxLineWidth);
      for (const line of lines) {
        ensureSpace(15);
        doc.text(line, margin, y);
        y += 14;
      }

      if (m.groundingSources && m.groundingSources.length > 0) {
        ensureSpace(20);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        const sourceTitles = m.groundingSources
          .slice(0, 4)
          .map((s) => s.title || s.url)
          .filter(Boolean)
          .join(' • ');
        if (sourceTitles) {
          const sLines: string[] = doc.splitTextToSize(`Sources: ${sourceTitles}`, maxLineWidth);
          for (const sl of sLines) {
            ensureSpace(13);
            doc.text(sl, margin, y);
            y += 12;
          }
        }
      }

      y += 8;
      ensureSpace(12);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 16;
    });

    const safeTitle =
      activeSession.title.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Conversation';
    doc.save(`Glitch_AI_${safeTitle}.pdf`);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#04050c] text-slate-100 font-sans">
      <GlobalAdScripts />
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleCreateNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAllSessions={handleClearAllSessions}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        userProfile={currentUser ? userProfile : DEFAULT_PROFILE}
        onOpenProfileModal={handleOpenProfile}
        onOpenCreditsModal={handleOpenCredits}
        currentView={currentView}
        onNavigate={setCurrentView}
        isSignedIn={!!currentUser}
        onGoogleSignIn={handleGoogleSignIn}
        onOpenVoiceCall={() => setIsVoiceCallOpen(true)}
        credits={credits}
      />

      <div className="flex-1 flex flex-col h-full min-w-0 bg-gradient-to-b from-[#050711] via-[#04050c] to-[#03040a]">
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onClearChat={handleClearCurrentChat}
          onExportChat={handleExportChat}
          onOpenProfile={handleOpenProfile}
          onOpenCredits={handleOpenCredits}
          userProfile={currentUser ? userProfile : DEFAULT_PROFILE}
          hasMessages={activeSession.messages.length > 0}
          activeSessionTitle={activeSession.title}
          currentView={currentView}
          onNavigate={setCurrentView}
          isSignedIn={!!currentUser}
          onGoogleSignIn={handleGoogleSignIn}
          onOpenVoiceCall={() => setIsVoiceCallOpen(true)}
          credits={credits}
        />

        {authNotice && (
          <div className="mx-4 mt-2 px-3.5 py-2 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
            <span>{authNotice}</span>
            <button
              type="button"
              onClick={() => setAuthNotice(null)}
              className="text-rose-300 hover:text-white font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {incomingTransferNotice && (
          <div className="mx-4 mt-2 px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2">
            <span>{incomingTransferNotice}</span>
            <button
              type="button"
              onClick={() => setIncomingTransferNotice(null)}
              className="text-emerald-300 hover:text-white font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {exportNotice && (
          <div className="mx-4 mt-2 px-3.5 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-xs text-cyan-200 flex items-center justify-between gap-2">
            <span>{exportNotice}</span>
            <button
              type="button"
              onClick={() => setExportNotice(null)}
              className="text-cyan-300 hover:text-white font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {currentView === 'home' && (
          <HomePage
            onNavigate={setCurrentView}
            onStartChat={(prompt, mode) => {
              setCurrentView('chat');
              if (prompt) {
                setTimeout(() => handleSendMessage(prompt, { mode }), 80);
              }
            }}
            onOpenVoiceCall={() => setIsVoiceCallOpen(true)}
            onOpenCredits={handleOpenCredits}
            isSignedIn={!!currentUser}
            onGoogleSignIn={handleGoogleSignIn}
          />
        )}

        {currentView === 'guides' && (
          <GuidesPage
            onNavigate={setCurrentView}
            isSignedIn={!!currentUser}
            onSelectPrompt={(prompt, mode) => {
              setCurrentView('chat');
              setTimeout(() => handleSendMessage(prompt, { mode }), 80);
            }}
          />
        )}

        {currentView === 'about' && (
          <AboutContactPage
            onNavigate={setCurrentView}
            userEmail={currentUser?.email || undefined}
            isSignedIn={!!currentUser}
          />
        )}

        {(currentView === 'privacy' || currentView === 'terms') && (
          <LegalPages
            initialTab={currentView === 'terms' ? 'terms' : 'privacy'}
            onNavigate={setCurrentView}
          />
        )}

        {currentView === 'chat' && (
          <>
            <div
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col"
            >
              <div className="w-full max-w-4xl mx-auto px-4 pt-2.5 shrink-0">
                <NativeBannerAd />
              </div>

              {activeSession.messages.length === 0 ? (
                <EmptyState
                  onOpenVoiceCall={() => setIsVoiceCallOpen(true)}
                  onOpenCredits={handleOpenCredits}
                  credits={credits}
                  isSignedIn={!!currentUser}
                />
              ) : (
                <div className="flex-1 py-3 space-y-1">
                  {activeSession.messages.map((msg, index) => (
                    <ChatMessageItem
                      key={msg.id}
                      message={msg}
                      userProfile={currentUser ? userProfile : DEFAULT_PROFILE}
                      onOpenCredits={handleOpenCredits}
                      isSignedIn={!!currentUser}
                      onGoogleSignIn={handleGoogleSignIn}
                      onRetry={
                        index === activeSession.messages.length - 1 && msg.error
                          ? handleRetryLastMessage
                          : undefined
                      }
                    />
                  ))}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </div>

            <div className="bg-gradient-to-t from-[#03040a] via-[#04050c] to-transparent pt-1.5">
              <Banner320x50Ad className="mb-1" />
              <ChatInput
                onSendMessage={handleSendMessage}
                isStreaming={isStreaming}
                onStopStreaming={handleStopStreaming}
                inputRef={inputRef}
                isSignedIn={!!currentUser}
              />
            </div>
          </>
        )}
      </div>

      {currentUser && (
        <>
          <ProfileModal
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            profile={userProfile}
            onSaveProfile={handleSaveProfile}
            isSignedIn={true}
            userEmail={currentUser.email || undefined}
            onGoogleSignIn={handleGoogleSignIn}
            onSignOut={handleSignOut}
            isSyncing={isSyncing}
            credits={credits}
            onOpenCredits={handleOpenCredits}
          />

          <CreditsModal
            isOpen={isCreditsOpen}
            onClose={() => setIsCreditsOpen(false)}
            credits={credits}
            onClaimAdReward={handleClaimAdReward}
            onTransferCredits={handleTransferCredits}
            transferHistory={transferHistory}
            onRefreshTransfers={handleRefreshTransfers}
            isSignedIn={true}
            currentUserId={currentUser.uid}
            userEmail={currentUser.email || undefined}
            onGoogleSignIn={handleGoogleSignIn}
            onOpenProfile={handleOpenProfile}
          />
        </>
      )}

      <VoiceCallModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        userProfile={currentUser ? userProfile : DEFAULT_PROFILE}
      />
    </div>
  );
}
