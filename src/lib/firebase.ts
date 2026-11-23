import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  getDocsFromServer,
  query,
  where,
  onSnapshot,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { ChatMessage, ChatSession, CreditTransferRecord, UserProfile } from '../types';
import {
  INITIAL_CREDITS,
  IMAGE_CREDIT_COST,
  AD_REWARD_MIN,
  AD_REWARD_MAX,
  MAX_CREDITS_CAP,
  MAX_TRANSFER_CREDITS,
} from './credits';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
  getRedirectResult(auth).catch((err) => {
    if (err?.code && err.code !== 'auth/no-auth-event') {
      console.warn('[Firebase Auth] Redirect result note:', err.code);
    }
  });
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client appears offline or firestore connecting...');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  if (
    typeof window !== 'undefined' &&
    window.location.protocol !== 'http:' &&
    window.location.protocol !== 'https:'
  ) {
    const err: any = new Error(
      'Google Sign-In requires hosting over http:// or https:// (such as https://the-glitch-ai.netlify.app/).'
    );
    err.code = 'auth/operation-not-supported-in-this-environment';
    throw err;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    console.error('Google Sign-In failed:', err);
    throw err;
  }
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

function clampCredits(val: unknown): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return INITIAL_CREDITS;
  return Math.max(0, Math.min(MAX_CREDITS_CAP, Math.floor(val)));
}

function mapDocToProfile(data: Record<string, any>): UserProfile {
  const loadedRole = data.role === 'Gamer & Strategist' ? 'AI Explorer' : data.role;
  return {
    name: data.name || 'Glitch User',
    role: loadedRole || 'AI Explorer',
    avatarColor: data.avatarColor || 'cyan',
    customAvatar: data.customAvatar || '',
    customInstructions: data.customInstructions || '',
    email: data.email || '',
    credits: typeof data.credits === 'number' ? clampCredits(data.credits) : INITIAL_CREDITS,
    lastClaimedTransferId: data.lastClaimedTransferId || undefined,
  };
}

function buildSanitizedProfileFields(profile: UserProfile, email?: string) {
  const safeAvatar =
    profile.customAvatar && profile.customAvatar.length <= 200000 ? profile.customAvatar : '';
  return {
    name: (profile.name.trim() || 'Glitch User').slice(0, 60),
    role: (profile.role.trim() || 'AI Explorer').slice(0, 60),
    avatarColor: (profile.avatarColor || 'cyan').slice(0, 30),
    customAvatar: safeAvatar,
    customInstructions: (profile.customInstructions || '').slice(0, 500),
    email: (email || profile.email || auth.currentUser?.email || '').slice(0, 120),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Publishes privacy-preserving recipient lookup keys in `/creditDirectory`:
 * - `uid_<userId>`
 * - `email_<sha256(lowercase(email))>` (zero plaintext email stored!)
 */
export async function syncCreditDirectoryEntry(
  userId: string,
  displayName: string,
  email?: string | null
): Promise<void> {
  const cleanName = (displayName.trim() || 'Glitch User').slice(0, 60);
  const keysToPublish: string[] = [`uid_${userId}`];

  const normalizedEmail = (email || auth.currentUser?.email || '').trim().toLowerCase();
  if (normalizedEmail && normalizedEmail.includes('@')) {
    try {
      const hash = await sha256Hex(normalizedEmail);
      keysToPublish.push(`email_${hash}`);
    } catch {}
  }

  for (const lookupId of keysToPublish) {
    const path = `creditDirectory/${lookupId}`;
    try {
      await setDoc(doc(db, 'creditDirectory', lookupId), {
        lookupId,
        userId,
        displayName: cleanName,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn(`Directory entry sync note (${path}):`, err);
    }
  }
}

/**
 * Ensures the signed-in user's permanent account exists in Firestore.
 */
export async function ensureCloudUserAccount(
  user: FirebaseUser,
  fallbackProfile: UserProfile
): Promise<{ profile: UserProfile; isNewAccount: boolean }> {
  const userId = user.uid;
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  try {
    let snap;
    try {
      snap = await getDocFromServer(userRef);
    } catch {
      snap = await getDoc(userRef);
    }

    if (snap.exists()) {
      const data = snap.data();
      let resolvedProfile: UserProfile;
      if (typeof data.credits !== 'number') {
        await updateDoc(userRef, {
          credits: INITIAL_CREDITS,
          updatedAt: serverTimestamp(),
        });
        resolvedProfile = {
          ...mapDocToProfile(data),
          email: data.email || user.email || '',
          credits: INITIAL_CREDITS,
        };
      } else {
        resolvedProfile = {
          ...mapDocToProfile(data),
          email: data.email || user.email || '',
        };
      }

      // Refresh directory index quietly so other users can transfer credits to this account
      syncCreditDirectoryEntry(userId, resolvedProfile.name, resolvedProfile.email).catch(() => {});
      return { profile: resolvedProfile, isNewAccount: false };
    }

    const initialName = (
      user.displayName ||
      (fallbackProfile.name && fallbackProfile.name !== 'Glitch User' ? fallbackProfile.name : 'Glitch User')
    )
      .trim()
      .slice(0, 60);

    const sanitized = buildSanitizedProfileFields(
      { ...fallbackProfile, name: initialName || 'Glitch User' },
      user.email || undefined
    );

    await setDoc(userRef, {
      userId,
      ...sanitized,
      credits: INITIAL_CREDITS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    syncCreditDirectoryEntry(userId, sanitized.name, sanitized.email).catch(() => {});

    return {
      profile: {
        ...sanitized,
        credits: INITIAL_CREDITS,
      },
      isNewAccount: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCloudUserProfile(userId: string): Promise<UserProfile | null> {
  const path = `users/${userId}`;
  try {
    let snap;
    try {
      snap = await getDocFromServer(doc(db, 'users', userId));
    } catch {
      snap = await getDoc(doc(db, 'users', userId));
    }
    if (snap.exists()) {
      return mapDocToProfile(snap.data());
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeToUserProfile(
  userId: string,
  onProfile: (profile: UserProfile) => void
): Unsubscribe {
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);
  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        onProfile(mapDocToProfile(snap.data()));
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Updates editable profile fields without ever altering or resetting `credits` or `createdAt`.
 */
export async function saveCloudUserProfile(userId: string, profile: UserProfile, email?: string): Promise<void> {
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);
  try {
    const sanitized = buildSanitizedProfileFields(profile, email);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      await updateDoc(userRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        userId,
        ...sanitized,
        credits: INITIAL_CREDITS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    syncCreditDirectoryEntry(userId, sanitized.name, sanitized.email).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Atomically deducts credits from a permanent Firestore user account.
 */
export async function deductUserCredits(
  userId: string,
  cost: number = IMAGE_CREDIT_COST
): Promise<number> {
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) {
        throw new Error('Account record not found.');
      }
      const data = snap.data();
      const currentCredits = typeof data.credits === 'number' ? clampCredits(data.credits) : INITIAL_CREDITS;
      if (currentCredits < cost) {
        throw new Error('INSUFFICIENT_CREDITS');
      }
      const nextCredits = Math.max(0, Math.min(MAX_CREDITS_CAP, currentCredits - cost));
      transaction.update(userRef, {
        credits: nextCredits,
        updatedAt: serverTimestamp(),
      });
      return nextCredits;
    });
  } catch (error: any) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_CREDITS') {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Atomically awards lucky ad credits (0 to 10) after completing a sponsored ad view.
 * When lucky reward is 0, reads the authoritative balance cleanly without modifying Firestore.
 */
export async function awardAdCredits(userId: string, reward: number): Promise<number> {
  const safeReward = Math.max(AD_REWARD_MIN, Math.min(AD_REWARD_MAX, Math.floor(reward)));
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  try {
    if (safeReward <= 0) {
      const snap = await getDocFromServer(userRef);
      if (!snap.exists()) throw new Error('Account record not found.');
      const data = snap.data();
      return typeof data.credits === 'number' ? clampCredits(data.credits) : INITIAL_CREDITS;
    }

    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) {
        throw new Error('Account record not found.');
      }
      const data = snap.data();
      const currentCredits = typeof data.credits === 'number' ? clampCredits(data.credits) : INITIAL_CREDITS;
      const nextCredits = Math.min(MAX_CREDITS_CAP, currentCredits + safeReward);
      transaction.update(userRef, {
        credits: nextCredits,
        updatedAt: serverTimestamp(),
      });
      return nextCredits;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Resolves a recipient by email address or Account ID without ever querying or exposing private user lists.
 */
export async function lookupCreditRecipient(
  recipientInput: string
): Promise<{ userId: string; displayName: string } | null> {
  const raw = recipientInput.trim();
  if (!raw) return null;

  let lookupId = '';
  if (raw.includes('@')) {
    const hash = await sha256Hex(raw);
    lookupId = `email_${hash}`;
  } else if (raw.startsWith('uid_') && /^[a-zA-Z0-9_\-]+$/.test(raw)) {
    lookupId = raw;
  } else if (/^[a-zA-Z0-9_\-]+$/.test(raw)) {
    lookupId = `uid_${raw}`;
  } else {
    return null;
  }

  const path = `creditDirectory/${lookupId}`;
  try {
    const ref = doc(db, 'creditDirectory', lookupId);
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch {
      snap = await getDoc(ref);
    }
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data?.userId) return null;
    return {
      userId: String(data.userId),
      displayName: String(data.displayName || 'Glitch User'),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Atomically sends credits from sender to another verified Glitch AI user via two-phase writeBatch.
 */
export async function transferCreditsToUser(params: {
  senderUid: string;
  senderName: string;
  recipientInput: string;
  amount: number;
  note?: string;
}): Promise<{ transferId: string; nextCredits: number; recipientName: string }> {
  const { senderUid, senderName, recipientInput, amount, note } = params;
  const intAmount = Math.floor(Number(amount));
  if (!Number.isFinite(intAmount) || intAmount < 1 || intAmount > MAX_TRANSFER_CREDITS) {
    throw new Error(`Enter a valid amount between 1 and ${MAX_TRANSFER_CREDITS} Credits.`);
  }

  const recipient = await lookupCreditRecipient(recipientInput);
  if (!recipient) {
    throw new Error('Recipient account not found. Ask them to sign in once, or verify their email / Account ID.');
  }
  if (recipient.userId === senderUid) {
    throw new Error('You cannot transfer credits to your own account.');
  }

  const userRef = doc(db, 'users', senderUid);
  const transferId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const transferRef = doc(db, 'creditTransfers', transferId);
  const path = `creditTransfers/${transferId}`;

  try {
    let senderSnap;
    try {
      senderSnap = await getDocFromServer(userRef);
    } catch {
      senderSnap = await getDoc(userRef);
    }
    if (!senderSnap.exists()) {
      throw new Error('Sender account not found.');
    }

    const senderData = senderSnap.data();
    const currentCredits =
      typeof senderData.credits === 'number' ? clampCredits(senderData.credits) : INITIAL_CREDITS;

    if (currentCredits < intAmount) {
      throw new Error(`Insufficient balance (${currentCredits} Credits available).`);
    }

    const nextCredits = currentCredits - intAmount;
    const safeSenderName = (senderName.trim() || 'Glitch User').slice(0, 60);
    const safeRecipientName = (recipient.displayName.trim() || 'Glitch User').slice(0, 60);
    const safeNote = (note || '').trim().slice(0, 120);

    const batch = writeBatch(db);
    batch.update(userRef, {
      credits: nextCredits,
      updatedAt: serverTimestamp(),
    });

    const transferPayload: Record<string, any> = {
      id: transferId,
      fromUserId: senderUid,
      fromName: safeSenderName,
      toUserId: recipient.userId,
      toName: safeRecipientName,
      amount: intAmount,
      status: 'pending',
      createdAt: serverTimestamp(),
    };
    if (safeNote) {
      transferPayload.note = safeNote;
    }

    batch.set(transferRef, transferPayload);
    await batch.commit();

    return {
      transferId,
      nextCredits,
      recipientName: safeRecipientName,
    };
  } catch (error: any) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient balance') ||
        error.message.includes('not found') ||
        error.message.includes('valid amount'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function mapTransferDoc(id: string, data: Record<string, any>): CreditTransferRecord {
  return {
    id,
    fromUserId: String(data.fromUserId || ''),
    fromName: String(data.fromName || 'Glitch User'),
    toUserId: String(data.toUserId || ''),
    toName: String(data.toName || 'Glitch User'),
    amount: typeof data.amount === 'number' ? data.amount : 0,
    note: data.note ? String(data.note) : undefined,
    status: data.status === 'claimed' ? 'claimed' : 'pending',
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
    claimedAt: data.claimedAt?.toMillis ? data.claimedAt.toMillis() : undefined,
  };
}

/**
 * Listens in real time for pending incoming credit transfers addressed to `userId`.
 */
export function subscribeToIncomingTransfers(
  userId: string,
  onPendingTransfers: (transfers: CreditTransferRecord[]) => void
): Unsubscribe {
  const path = 'creditTransfers';
  const q = query(
    collection(db, 'creditTransfers'),
    where('toUserId', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pending = snapshot.docs.map((d) => mapTransferDoc(d.id, d.data()));
      onPendingTransfers(pending);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Atomically claims a pending incoming credit transfer into the recipient's permanent balance.
 */
export async function claimIncomingTransfer(
  userId: string,
  transfer: CreditTransferRecord
): Promise<number | null> {
  const userRef = doc(db, 'users', userId);
  const transferRef = doc(db, 'creditTransfers', transfer.id);
  const path = `creditTransfers/${transfer.id}`;

  try {
    const [userSnap, txSnap] = await Promise.all([
      getDocFromServer(userRef).catch(() => getDoc(userRef)),
      getDocFromServer(transferRef).catch(() => getDoc(transferRef)),
    ]);

    if (!userSnap.exists() || !txSnap.exists()) return null;
    const txData = txSnap.data();
    if (txData.status !== 'pending' || txData.toUserId !== userId) return null;

    const currentCredits =
      typeof userSnap.data().credits === 'number' ? clampCredits(userSnap.data().credits) : INITIAL_CREDITS;
    const txAmount = typeof txData.amount === 'number' ? Math.floor(txData.amount) : 0;
    if (txAmount <= 0 || currentCredits + txAmount > MAX_CREDITS_CAP) return null;

    const nextCredits = currentCredits + txAmount;
    const batch = writeBatch(db);
    batch.update(userRef, {
      credits: nextCredits,
      lastClaimedTransferId: transfer.id,
      updatedAt: serverTimestamp(),
    });
    batch.update(transferRef, {
      status: 'claimed',
      claimedAt: serverTimestamp(),
    });

    await batch.commit();
    return nextCredits;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCreditTransferHistory(userId: string): Promise<CreditTransferRecord[]> {
  const path = 'creditTransfers';
  try {
    const sentQ = query(collection(db, 'creditTransfers'), where('fromUserId', '==', userId));
    const recvQ = query(collection(db, 'creditTransfers'), where('toUserId', '==', userId));

    const [sentSnap, recvSnap] = await Promise.all([
      getDocsFromServer(sentQ).catch(() => getDocs(sentQ)),
      getDocsFromServer(recvQ).catch(() => getDocs(recvQ)),
    ]);

    const byId = new Map<string, CreditTransferRecord>();
    sentSnap.docs.forEach((d) => byId.set(d.id, mapTransferDoc(d.id, d.data())));
    recvSnap.docs.forEach((d) => byId.set(d.id, mapTransferDoc(d.id, d.data())));

    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

async function compactDataUrlForFirestore(dataUrl?: string): Promise<string | undefined> {
  if (!dataUrl || typeof dataUrl !== 'string') return undefined;
  if (dataUrl.length <= 700000) return dataUrl;
  if (!dataUrl.startsWith('data:image/')) return undefined;

  try {
    return await new Promise<string | undefined>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        let w = img.naturalWidth || 960;
        let h = img.naturalHeight || 960;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(64, Math.round(w * ratio));
          h = Math.max(64, Math.round(h * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const jpeg = canvas.toDataURL('image/jpeg', 0.78);
        resolve(jpeg.length <= 820000 ? jpeg : undefined);
      };
      img.onerror = () => resolve(undefined);
      img.src = dataUrl;
    });
  } catch {
    return undefined;
  }
}

export async function fetchCloudSessions(userId: string): Promise<ChatSession[]> {
  const threadsPath = `users/${userId}/threads`;
  try {
    const threadsRef = collection(db, 'users', userId, 'threads');
    const threadsQuery = query(threadsRef, where('userId', '==', userId));

    let threadsSnap;
    try {
      threadsSnap = await getDocsFromServer(threadsQuery);
    } catch {
      threadsSnap = await getDocs(threadsQuery);
    }

    const sessions: ChatSession[] = [];

    for (const threadDoc of threadsSnap.docs) {
      const tData = threadDoc.data();
      const threadId = threadDoc.id;

      const messagesRef = collection(db, 'users', userId, 'threads', threadId, 'messages');
      const messagesQuery = query(messagesRef, where('userId', '==', userId));

      let messagesSnap;
      try {
        messagesSnap = await getDocsFromServer(messagesQuery);
      } catch {
        messagesSnap = await getDocs(messagesQuery);
      }

      const messages: ChatMessage[] = messagesSnap.docs
        .map((mDoc) => {
          const mData = mDoc.data();
          return {
            id: mDoc.id,
            role: (mData.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: mData.content || '',
            timestamp: typeof mData.timestamp === 'number' ? mData.timestamp : Date.now(),
            mediaType: mData.mediaType,
            generatedImageUrl: mData.generatedImageUrl,
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      sessions.push({
        id: threadId,
        title: tData.title || 'Conversation',
        createdAt: tData.createdAt?.toMillis ? tData.createdAt.toMillis() : Date.now(),
        updatedAt: tData.updatedAt?.toMillis ? tData.updatedAt.toMillis() : Date.now(),
        tone: tData.tone === 'gaming' ? 'research' : tData.tone || 'default',
        messages,
      });
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, threadsPath);
  }
}

export async function saveCloudSession(userId: string, session: ChatSession): Promise<void> {
  const threadPath = `users/${userId}/threads/${session.id}`;
  try {
    const threadRef = doc(db, 'users', userId, 'threads', session.id);
    const lastMsg = session.messages[session.messages.length - 1];
    const safeTitle = (session.title || 'New Conversation').trim().slice(0, 95) || 'New Conversation';
    const safeTone = (session.tone || 'default').slice(0, 30);
    const safeSnippet = lastMsg ? lastMsg.content.slice(0, 200) : '';

    const threadSnap = await getDoc(threadRef);
    if (threadSnap.exists()) {
      await updateDoc(threadRef, {
        title: safeTitle,
        tone: safeTone,
        messageCount: session.messages.length,
        lastMessageSnippet: safeSnippet,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(threadRef, {
        id: session.id,
        userId,
        title: safeTitle,
        tone: safeTone,
        messageCount: session.messages.length,
        lastMessageSnippet: safeSnippet,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const messagesRef = collection(db, 'users', userId, 'threads', session.id, 'messages');
    const existingMessagesSnap = await getDocs(query(messagesRef, where('userId', '==', userId)));
    const existingMsgIds = new Set(existingMessagesSnap.docs.map((d) => d.id));

    const validMessages = session.messages.filter(
      (m) => !m.error && !m.isGeneratingMedia && m.content && m.content.trim().length > 0
    );

    await Promise.all(
      validMessages.map(async (msg) => {
        const compactedImg = await compactDataUrlForFirestore(msg.generatedImageUrl);
        const safeContent = msg.content.slice(0, 95000);
        const safeTimestamp = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();

        if (existingMsgIds.has(msg.id)) {
          const updatePayload: Record<string, any> = {
            content: safeContent,
            timestamp: safeTimestamp,
          };
          if (msg.mediaType) updatePayload.mediaType = msg.mediaType;
          if (compactedImg) updatePayload.generatedImageUrl = compactedImg;
          return updateDoc(doc(messagesRef, msg.id), updatePayload);
        }

        const createPayload: Record<string, any> = {
          id: msg.id,
          threadId: session.id,
          userId,
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: safeContent,
          timestamp: safeTimestamp,
          createdAt: serverTimestamp(),
        };
        if (msg.mediaType) createPayload.mediaType = msg.mediaType;
        if (compactedImg) createPayload.generatedImageUrl = compactedImg;

        return setDoc(doc(messagesRef, msg.id), createPayload);
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, threadPath);
  }
}

export async function deleteCloudSession(userId: string, sessionId: string): Promise<void> {
  const threadPath = `users/${userId}/threads/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'threads', sessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, threadPath);
  }
}
