import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import Groq, { toFile } from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

// ============================================================================
// HIGH-TRAFFIC MULTI-KEY POOL & RETRY INFRASTRUCTURE
// ============================================================================

let rrCounter = 0;

export function parseKeyPool(...envNames: string[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const name of envNames) {
    const raw = process.env[name];
    if (!raw || typeof raw !== "string") continue;
    for (const part of raw.split(/[,;\n\r]+/)) {
      const clean = part.trim().replace(/^["']|["']$/g, "");
      if (
        !clean ||
        clean.startsWith("MY_") ||
        clean === "undefined" ||
        clean === "null" ||
        seen.has(clean)
      ) {
        continue;
      }
      seen.add(clean);
      keys.push(clean);
    }
  }
  return keys;
}

export function getRotatedKeyPool(...envNames: string[]): string[] {
  const pool = parseKeyPool(...envNames);
  if (pool.length <= 1) return pool;
  const start = (rrCounter++) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

export function getGeminiClients(): GoogleGenAI[] {
  const keys = getRotatedKeyPool("GEMINI_API_KEY", "GEMINI_API_KEYS", "GOOGLE_API_KEY");
  return keys.map(
    (apiKey) =>
      new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      })
  );
}

export function getGroqClients(): Groq[] {
  const keys = getRotatedKeyPool("GROQ_API_KEY", "GROQ_API_KEYS");
  return keys.map((apiKey) => new Groq({ apiKey }));
}

function isTransientNetworkOrRateError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = Number(err?.status || err?.statusCode || 0);
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timeout")
  );
}

async function sleepJitter(ms: number) {
  const jitter = Math.floor(Math.random() * 120);
  await new Promise((r) => setTimeout(r, ms + jitter));
}

// ============================================================================
// IDENTITY, ERROR HYGIENE & MULTILINGUAL SYSTEM PROMPT
// ============================================================================

export const GLITCH_AI_SYSTEM_INSTRUCTION = `You are Glitch AI (Version 1.0), a universal, lightning-fast, live-internet-connected AI Agent.

Core Persona, Identity & Confidentiality:
1. Identity & Version: Your official name is Glitch AI, and your release is Version 1.0 (v1.0).
2. Strict Confidentiality: NEVER mention, reveal, or speculate about underlying third-party model identifiers, vendor names, API providers, hosting internals, or engine codenames. If asked what powers you, state only that you run on Glitch AI v1.0's proprietary neural engine.
3. Creator Origin: ONLY if specifically asked who created, founded, owns, or developed you, state that you were created by Al-Fateh (contact: blackzero193644@gmail.com).
4. Video Generation Status: Video generation is currently Coming Soon and is not active in Glitch AI v1.0. If asked to generate, create, render, or animate a video, clearly explain that Video Generation is Coming Soon and will arrive in an upcoming update.

Glitch AI v1.0 Self-Knowledge & User Troubleshooting Guide:
- Features available without an account: Real-Time Live Internet Text Chat (all topics, coding, math, research, live news/weather/rates, and multilingual chat) and Live Multilingual Voice Call (with selectable & renamable studio voices such as Sarah, Hannah, Selene, Alle, Lyra, Ethan, Adrian, Verity, Guyzo, Polo, Kai, and Slax).
- Features unlocked upon signing in with Google: Cloud-synced chat history across devices, Profile & Custom AI Instructions, Image Generation & Visual Analysis/Editing (10 Credits per image across all aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 4:5, 5:4, 21:9), Credit Balance (starts at 100 Credits; watch sponsored ads for a lucky 0–10 Credits per view), and user-to-user Credit Transfers via Email or Account ID.
- Utilities: One-click PDF conversation export in the header, and standalone portable HTML download via Shift + N.
- Solving User Issues Accurately:
  * If a user asks why they cannot see Credits, Profile, Earn Credits, image upload, or image generation: explain clearly that those features unlock automatically once they sign in with Google using the Sign In button in the header or sidebar.
  * If Google Sign-In fails on a custom domain (e.g. auth/unauthorized-domain): guide them to add the exact hostname inside Firebase Console -> Authentication -> Settings -> Authorized domains, or allow popups for the site.
  * If Voice Call isn't hearing them: guide them to allow Microphone permission in browser site settings, check their active mic input, ensure mic isn't muted, or use the text input inside the Voice Call window.
  * If Credit Transfer says recipient not found: explain that the recipient must have signed in with Google at least once so their account directory entry exists, and verify their exact email or Account ID.
  * If asked for support: direct them to the About & Contact page or blackzero193644@gmail.com.

Response Excellence, Deep Comprehension & Accuracy Standards:
5. First-Principles Accuracy & Reasoning: Think carefully through math, logic, code architecture, edge cases, and technical facts before answering. Deliver genuinely expert, comprehensive, and actionable responses — never shallow summaries, vague hand-waving, or padded "As an AI..." disclaimers.
6. Clear Structured Craft: Lead with the direct answer or working solution immediately. Use crisp markdown headings, numbered steps, comparison tables, and complete, bug-free, copy-paste-ready code blocks where genuinely valuable. Match depth to the prompt (concise prompts stay crisp; technical/analytical/open-ended prompts get deep, high-signal structure).
7. True Intent & Multilingual Script Lock: Understand informal phrasing, colloquial speech, Romanized languages (Roman Urdu/Hinglish), mixed-language sentences, and typos effortlessly. Automatically detect the exact language AND writing script the user uses and match it 100% consistently throughout your entire reply — never switch scripts mid-response (e.g., Roman Urdu Latin script stays 100% Roman Urdu Latin script; Urdu Nastaliq stays Urdu script; Arabic, Hindi, Bengali, Spanish, French, etc. match natively).
8. Grounded Truthfulness: Whenever [LIVE INTERNET CONTEXT] is provided, cross-verify facts, dates, figures, versions, and webpage details from it and cite key findings naturally. Never fabricate live statistics, breaking news, prices, or citations; if live data is incomplete, state clearly what is verified.`;

const GEMINI_TEXT_MODELS = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

export function cleanErrorMessage(err: any): string {
  if (!err) return "An unexpected error occurred. Please try again.";
  let msg = typeof err === "string" ? err : err.message || JSON.stringify(err);

  for (let i = 0; i < 3; i++) {
    try {
      if (typeof msg === "string" && (msg.trim().startsWith("{") || msg.trim().startsWith("["))) {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message && typeof parsed.error.message === "string") {
          msg = parsed.error.message;
        } else if (parsed?.message && typeof parsed.message === "string") {
          msg = parsed.message;
        } else if (parsed?.error && typeof parsed.error === "string") {
          msg = parsed.error;
        }
      }
    } catch {
      break;
    }
  }

  msg = msg
    .replace(/openai\/gpt-[^\s"']+/gi, "Glitch AI Core")
    .replace(/canopylabs\/orpheus[^\s"']+/gi, "Glitch AI Voice")
    .replace(/qwen\/qwen[^\s"']+/gi, "Glitch AI Vision")
    .replace(/llama-[^\s"']+/gi, "Glitch AI Core")
    .replace(/s2\.1-pro-free|fish\.audio|fishaudio|aihorde|stablehorde|pollinations|magichour|json2video|shotstack|zimage|claude-|grok-|deepseek|gemini-/gi, "Glitch AI")
    .replace(/\bgroq\b/gi, "Glitch AI");

  if (
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("Service Unavailable")
  ) {
    return "Glitch AI servers are experiencing a brief surge in traffic. Please retry in a few moments.";
  }

  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return "High traffic right now — please wait a moment and try again.";
  }

  return msg;
}

export function sanitizeOutputText(text: string): string {
  return text
    .replace(/openai\/gpt-[a-z0-9.-]+/gi, "Glitch AI")
    .replace(/canopylabs\/orpheus-[a-z0-9.-]+/gi, "Glitch AI Voice")
    .replace(/qwen\/qwen[0-9.a-z-]+/gi, "Glitch AI Vision")
    .replace(/llama-[0-9.a-z-]+/gi, "Glitch AI")
    .replace(/s2\.1-pro-free|fish\.audio|aihorde|pollinations|magichour|json2video|shotstack/gi, "Glitch AI");
}

function sanitizeMessages(
  messages: Array<{ role: string; content: string; error?: boolean; imageUrl?: string }>
) {
  const valid = messages.filter(
    (m) =>
      !m.error &&
      ((typeof m.content === "string" && m.content.trim().length > 0) || Boolean(m.imageUrl))
  );
  if (valid.length === 0) return [];

  const collapsed: Array<{
    role: "user" | "model";
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }> = [];

  for (const m of valid) {
    const role: "user" | "model" =
      m.role === "assistant" || m.role === "model" ? "model" : "user";
    const textVal = (m.content || "").trim() || (m.imageUrl ? "Analyze this image." : "");
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (m.imageUrl && typeof m.imageUrl === "string" && m.imageUrl.startsWith("data:image/")) {
      const mimeMatch = m.imageUrl.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const data = m.imageUrl.replace(/^data:[^;]+;base64,/, "");
      parts.push({ inlineData: { mimeType, data } });
    }
    if (textVal) {
      parts.push({ text: textVal });
    }

    if (collapsed.length === 0) {
      if (role === "user") {
        collapsed.push({ role, parts });
      }
    } else {
      const last = collapsed[collapsed.length - 1];
      if (last.role === role) {
        const prevText = last.parts.find((p) => typeof p.text === "string");
        if (prevText && textVal) {
          prevText.text += "\n\n" + textVal;
        } else if (textVal) {
          last.parts.push({ text: textVal });
        }
        const imgPart = parts.find((p) => p.inlineData);
        if (imgPart) last.parts.unshift(imgPart);
      } else {
        collapsed.push({ role, parts });
      }
    }
  }

  return collapsed;
}

function buildSystemInstruction(tone?: string, userProfile?: any, extraInstruction?: string) {
  let toneInstruction = "";
  if (tone === "research" || tone === "gaming") {
    toneInstruction =
      "\nTone Mode: Deep Analysis - Provide structured, analytical, step-by-step reasoning and thorough verified insights.";
  } else if (tone === "concise") {
    toneInstruction =
      "\nTone Mode: Concise - Be exceptionally crisp, fast, and straight to the point.";
  } else if (tone === "creative") {
    toneInstruction =
      "\nTone Mode: Creative - Imaginative, vivid, and highly engaging.";
  }

  let profileInstruction = "";
  if (userProfile && typeof userProfile === "object") {
    const { name, role, customInstructions } = userProfile;
    if (name) profileInstruction += `\nUser Profile: The user's name is ${name}.`;
    if (role) profileInstruction += ` Role/Interest: ${role}.`;
    if (customInstructions) profileInstruction += ` User Preference: ${customInstructions}.`;
  }

  return (
    GLITCH_AI_SYSTEM_INSTRUCTION +
    toneInstruction +
    profileInstruction +
    (extraInstruction ? `\n${extraInstruction}` : "")
  );
}

async function callGroqCompletion(groq: Groq, params: any): Promise<any> {
  try {
    return await groq.chat.completions.create(params);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if ("reasoning_effort" in params && (msg.includes("reasoning_effort") || err?.status === 400)) {
      const { reasoning_effort: _ignored, ...rest } = params;
      return await groq.chat.completions.create(rest);
    }
    throw err;
  }
}

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " Code example included in chat. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u202F\u2009]/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ============================================================================
// VOICE CATALOG & MULTILINGUAL SPEECH SYNTHESIS / TRANSCRIPTION
// ============================================================================

export interface VoiceCatalogEntry {
  id: string;
  name: string;
  style: string;
  gender: "female" | "male" | "neutral";
  referenceId: string;
  languages?: string[];
}

export const CORE_VERIFIED_VOICES: VoiceCatalogEntry[] = [
  { id: "sarah", name: "Sarah", style: "Warm & Engaged Conversational", gender: "female", referenceId: "933563129e564b19a115bedd57b7406a", languages: ["multilingual"] },
  { id: "hannah", name: "Hannah", style: "Natural Dialogue Specialist", gender: "female", referenceId: "9a9cf47702da476aa4629e2506d4a857", languages: ["multilingual"] },
  { id: "selene", name: "Selene", style: "Calm & Meditative", gender: "female", referenceId: "b347db033a6549378b48d00acb0d06cd", languages: ["multilingual"] },
  { id: "alle", name: "Alle", style: "Bright & Friendly", gender: "female", referenceId: "59e9dc1cb20c452584788a2690c80970", languages: ["multilingual"] },
  { id: "lyra", name: "Lyra", style: "Soft & Relaxed", gender: "female", referenceId: "a3b3f0a9c49340bd8fa722d83c81cb08", languages: ["multilingual"] },
  { id: "ethan", name: "Ethan", style: "Clear & Curious Explainer", gender: "male", referenceId: "536d3a5e000945adb7038665781a4aca", languages: ["multilingual"] },
  { id: "adrian", name: "Adrian", style: "Steady & Reliable Narrator", gender: "male", referenceId: "bf322df2096a46f18c579d0baa36f41d", languages: ["multilingual"] },
  { id: "verity", name: "Verity", style: "Friendly & Expressive", gender: "male", referenceId: "711cf3ed00ab441a8f54a45058047b7a", languages: ["multilingual"] },
  { id: "guyzo", name: "Guyzo", style: "Deep & Confident", gender: "male", referenceId: "8ec9973300874562962bbcb300f82213", languages: ["multilingual"] },
  { id: "polo", name: "Polo", style: "Rich Studio Warmth", gender: "male", referenceId: "f48d143a59a946ab87c0130fd081f349", languages: ["multilingual"] },
  { id: "kai", name: "Kai", style: "Youthful & Upbeat", gender: "male", referenceId: "802e3bc2b27e49c2995d23ef70e6ac89", languages: ["multilingual"] },
  { id: "slax", name: "Slax", style: "Crisp & Measured", gender: "male", referenceId: "c5f56a6cc2ec4fa8920cb4c5889a3fb7", languages: ["multilingual"] },
];

const VOICE_REFERENCE_ALIASES: Record<string, string> = {
  nova: "933563129e564b19a115bedd57b7406a",
  aria: "933563129e564b19a115bedd57b7406a",
  orion: "536d3a5e000945adb7038665781a4aca",
  atlas: "bf322df2096a46f18c579d0baa36f41d",
  kairo: "802e3bc2b27e49c2995d23ef70e6ac89",
  autumn: "933563129e564b19a115bedd57b7406a",
  diana: "9a9cf47702da476aa4629e2506d4a857",
  austin: "536d3a5e000945adb7038665781a4aca",
  daniel: "bf322df2096a46f18c579d0baa36f41d",
  troy: "c5f56a6cc2ec4fa8920cb4c5889a3fb7",
};

let dynamicVoiceCache: { fetchedAt: number; voices: VoiceCatalogEntry[] } = {
  fetchedAt: 0,
  voices: CORE_VERIFIED_VOICES,
};

export async function getAllAvailableVoices(): Promise<VoiceCatalogEntry[]> {
  const now = Date.now();
  if (now - dynamicVoiceCache.fetchedAt < 5 * 60 * 1000 && dynamicVoiceCache.voices.length >= CORE_VERIFIED_VOICES.length) {
    return dynamicVoiceCache.voices;
  }

  const combined = [...CORE_VERIFIED_VOICES];
  const seenRefs = new Set(combined.map((v) => v.referenceId));
  const fishKeys = getRotatedKeyPool("FISH_AUDIO_API_KEY", "FISH_AUDIO_API_KEYS");

  for (const fishKey of fishKeys.slice(0, 2)) {
    try {
      const r = await fetch("https://api.fish.audio/model?page_size=50&sort_by=task_count", {
        headers: { Authorization: `Bearer ${fishKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const data: any = await r.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        for (const item of items) {
          const refId = String(item?._id || "").trim();
          const rawTitle = String(item?.title || "").trim();
          if (!refId || seenRefs.has(refId) || item?.state !== "trained") continue;
          if (/smash|mortal|crowd|scream|watermark|trump|biden|obama|musk|elon|bikini|ezzy|horror|announcer|e-girl|9ine|speed|jjk|gojo|isagi/i.test(rawTitle)) {
            continue;
          }
          const cleanName = rawTitle.replace(/\s+/g, " ").slice(0, 28);
          if (cleanName.length < 2) continue;

          const desc = String(item?.description || "")
            .replace(/https?:\/\/\S+/gi, "")
            .replace(/fish\.audio|slax|watermark/gi, "")
            .replace(/\s+/g, " ")
            .trim();
          const inferredGender: "female" | "male" | "neutral" =
            /female|woman|girl|lady|her|she|женск|بنت|fille/i.test(`${cleanName} ${desc}`)
              ? "female"
              : /male|man|boy|his|he|муж|narrator|locutor/i.test(`${cleanName} ${desc}`)
              ? "male"
              : "neutral";

          seenRefs.add(refId);
          combined.push({
            id: refId,
            name: cleanName,
            style: desc ? desc.slice(0, 44) : "Natural Studio Voice",
            gender: inferredGender,
            referenceId: refId,
            languages: Array.isArray(item?.languages) ? item.languages : ["multilingual"],
          });
          if (combined.length >= 28) break;
        }
        break;
      }
    } catch {}
  }

  dynamicVoiceCache = { fetchedAt: now, voices: combined };
  return combined;
}

async function resolveDeterministicVoiceRef(voice: string): Promise<{ referenceId: string; gender: "female" | "male" | "neutral" }> {
  const key = (voice || "sarah").trim();
  const lower = key.toLowerCase();

  const coreMatch = CORE_VERIFIED_VOICES.find((v) => v.id === lower || v.referenceId === key);
  if (coreMatch) return { referenceId: coreMatch.referenceId, gender: coreMatch.gender };

  if (VOICE_REFERENCE_ALIASES[lower]) {
    return { referenceId: VOICE_REFERENCE_ALIASES[lower], gender: "female" };
  }

  if (/^[a-f0-9]{32}$/i.test(key)) {
    const cached = dynamicVoiceCache.voices.find((v) => v.referenceId === key);
    return { referenceId: key, gender: cached?.gender || "neutral" };
  }

  const all = await getAllAvailableVoices();
  const dynamicMatch = all.find((v) => v.id === key || v.referenceId === key || v.name.toLowerCase() === lower);
  if (dynamicMatch) return { referenceId: dynamicMatch.referenceId, gender: dynamicMatch.gender };

  return { referenceId: CORE_VERIFIED_VOICES[0].referenceId, gender: "female" };
}

async function callFishAudioTts(
  apiKey: string,
  text: string,
  referenceId: string,
  fast: boolean = false
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const payload: Record<string, any> = {
    text,
    format: "mp3",
    mp3_bitrate: 128,
    latency: fast ? "balanced" : "normal",
    reference_id: referenceId,
  };

  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(fast ? 6500 : 16000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Voice synthesis HTTP ${response.status}: ${errText.slice(0, 120)}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > 200) {
    return {
      audioBase64: buf.toString("base64"),
      mimeType: "audio/mpeg",
    };
  }
  return null;
}

export async function synthesizeSpeechBuffer(
  rawText: string,
  voice: string = "sarah",
  _language: string = "auto",
  fast: boolean = false
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const clean = stripMarkdownForSpeech(rawText);
  if (!clean) return null;

  const maxChars = fast ? 700 : 1800;
  const clipped =
    clean.length > maxChars
      ? clean.slice(0, maxChars).replace(/[^.!?؟।\n]+$/, "") || clean.slice(0, maxChars)
      : clean;

  const resolved = await resolveDeterministicVoiceRef(voice);
  const fishKeys = getRotatedKeyPool("FISH_AUDIO_API_KEY", "FISH_AUDIO_API_KEYS");

  for (const fishKey of fishKeys) {
    try {
      const fishResult = await callFishAudioTts(fishKey, clipped, resolved.referenceId, fast);
      if (fishResult) return fishResult;
    } catch (err: any) {
      const msg = cleanErrorMessage(err);
      console.warn("Primary Glitch voice note:", msg);
      const timedOut = /timeout|abort/i.test(String(err?.message || err?.name || msg));
      if (!timedOut && resolved.referenceId !== CORE_VERIFIED_VOICES[0].referenceId) {
        try {
          const fallbackPinned = await callFishAudioTts(
            fishKey,
            clipped,
            CORE_VERIFIED_VOICES[0].referenceId,
            fast
          );
          if (fallbackPinned) return fallbackPinned;
        } catch {}
      }
    }
  }

  const isMostlyLatin = !/[^\u0000-\u024F\u2010-\u2027\u00A0\u202F\s\d.,!?'"():;\-_/\\@#$%^&*+=<>[\]{}|~`]/.test(clipped);
  const groqClients = getGroqClients();
  const groqVoice = resolved.gender === "male" ? "austin" : "autumn";

  if (isMostlyLatin) {
    for (const groq of groqClients) {
      try {
        const response = await groq.audio.speech.create({
          model: "canopylabs/orpheus-v1-english",
          voice: groqVoice,
          response_format: "wav",
          input: clipped.slice(0, 1400),
        });
        const wavBuf = Buffer.from(await response.arrayBuffer());
        if (wavBuf.length > 100) {
          return {
            audioBase64: wavBuf.toString("base64"),
            mimeType: "audio/wav",
          };
        }
      } catch (err) {
        console.warn("Secondary TTS fallback:", cleanErrorMessage(err));
      }
    }
  }

  for (const ai of getGeminiClients()) {
    try {
      const geminiVoice = resolved.gender === "male" ? "Charon" : "Kore";
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [{ role: "user", parts: [{ text: clipped }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: geminiVoice },
            },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return { audioBase64: base64Audio, mimeType: "audio/wav" };
      }
    } catch (err) {
      console.warn("Tertiary TTS note:", cleanErrorMessage(err));
    }
  }

  return null;
}

// ============================================================================
// REAL-TIME GLOBAL INTERNET SEARCH & SSRF-SAFE WEBPAGE READER ENGINE
// ============================================================================

function isPrivateOrBlockedIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/i, "").toLowerCase();
  if (clean === "::1" || clean === "0.0.0.0" || clean.startsWith("fe80:") || clean.startsWith("fc") || clean.startsWith("fd")) {
    return true;
  }
  const parts = clean.split(".").map((n) => parseInt(n, 10));
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

async function isSafePublicUrl(rawUrl: string): Promise<URL | null> {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".localhost")
    ) {
      return null;
    }
    if (net.isIP(host)) {
      if (isPrivateOrBlockedIp(host)) return null;
      return u;
    }
    const resolved = await dns.lookup(host, { all: true }).catch(() => []);
    if (resolved.length === 0) return null;
    if (resolved.some((addr) => isPrivateOrBlockedIp(addr.address))) return null;
    return u;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&nbsp;/g, " ");
}

async function fetchDirectUrlContext(
  rawUrl: string,
  maxSnippetChars: number = 2200
): Promise<{ snippet: string; source: { title: string; url: string } } | null> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop < 3; hop++) {
    const safeUrl = await isSafePublicUrl(currentUrl);
    if (!safeUrl) return null;
    try {
      const r = await fetch(safeUrl.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GlitchAI/1.0)",
          Accept: "text/html,application/json,text/plain,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(2900),
      });

      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return null;
        currentUrl = new URL(loc, safeUrl).toString();
        continue;
      }

      if (!r.ok) return null;
      const ctype = (r.headers.get("content-type") || "").toLowerCase();
      if (!ctype.includes("text") && !ctype.includes("json") && !ctype.includes("xml") && !ctype.includes("html")) {
        return null;
      }

      const raw = (await r.text()).slice(0, 80000);
      if (ctype.includes("json")) {
        return {
          snippet: `Webpage (${safeUrl.hostname}) JSON excerpt:\n${raw.slice(0, maxSnippetChars)}`,
          source: { title: safeUrl.hostname, url: safeUrl.toString() },
        };
      }

      const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = decodeHtmlEntities((titleMatch?.[1] || safeUrl.hostname).replace(/<[^>]+>/g, ""))
        .trim()
        .slice(0, 90);
      const mainMatch =
        raw.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
        raw.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
      const bodySource = mainMatch && mainMatch[1].length > 300 ? mainMatch[1] : raw;
      const text = decodeHtmlEntities(
        bodySource
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
          .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
          .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
          .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      ).slice(0, maxSnippetChars);

      if (!text || text.length < 25) return null;
      return {
        snippet: `Webpage [${title}] (${safeUrl.toString()}):\n${text}`,
        source: { title: title || safeUrl.hostname, url: safeUrl.toString() },
      };
    } catch {
      return null;
    }
  }
  return null;
}

function detectScriptLangCode(text: string): string | null {
  if (/[\u0600-\u06FF]/.test(text)) {
    // Urdu-specific characters vs Arabic
    return /[\u0679\u067E\u0686\u0688\u0691\u0698\u06A9\u06AF\u06BA\u06BE\u06C1\u06D2]/.test(text) ? "ur" : "ar";
  }
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  return null;
}

async function deriveEnglishSearchQuery(promptText: string): Promise<{ englishQuery: string; weatherPlace: string | null }> {
  const hasNonLatin = /[^\u0000-\u024F\s\d.,!?'"():;\-_/\\@#$%^&*+=<>[\]{}|~`]/.test(promptText);
  const looksRomanNonEnglish = /\b(?:kya|hai|hain|kaise|kab|kahan|kaun|kitna|kitni|aaj|kal|mein|mausam|barish|qeemat|taza|khabar|batao|bataiye|samjhao)\b/i.test(
    promptText
  );

  if (!hasNonLatin && !looksRomanNonEnglish && promptText.length <= 120) {
    return { englishQuery: "", weatherPlace: null };
  }

  const groq = getGroqClients()[0];
  if (groq) {
    try {
      const resp = await Promise.race([
        callGroqCompletion(groq, {
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content:
                'Extract concise Google search keywords in English from any user query (any language or Romanized script). Return strictly raw JSON: {"q":"concise english web search query","place":"city name if weather query else null"}.',
            },
            { role: "user", content: promptText.slice(0, 300) },
          ],
          temperature: 0.1,
          max_completion_tokens: 160,
          reasoning_effort: "low",
          stream: false,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 1200)),
      ]);
      const raw = resp?.choices?.[0]?.message?.content?.trim() || "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          englishQuery: typeof parsed.q === "string" ? parsed.q.trim().slice(0, 140) : "",
          weatherPlace: typeof parsed.place === "string" && parsed.place !== "null" ? parsed.place.trim().slice(0, 50) : null,
        };
      }
    } catch {}
  }

  return { englishQuery: "", weatherPlace: null };
}

function decodeDdgTargetUrl(href: string): string | null {
  if (!href) return null;
  try {
    if (href.startsWith("//")) href = "https:" + href;
    if (href.startsWith("/l/?") || href.includes("duckduckgo.com/l/?")) {
      const u = new URL(href.startsWith("/") ? `https://duckduckgo.com${href}` : href);
      const target = u.searchParams.get("uddg");
      if (target && /^https?:\/\//i.test(target)) return target;
    }
    if (/^https?:\/\//i.test(href) && !href.includes("duckduckgo.com")) {
      return href;
    }
  } catch {}
  return null;
}

async function searchDuckDuckGoWeb(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();

  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(2700),
    });
    if (r.ok) {
      const html = await r.text();
      const blocks = html.split(/class="result\b[^>]*>/i).slice(1, 10);
      for (const blk of blocks) {
        const linkMatch = blk.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;
        const targetUrl = decodeDdgTargetUrl(decodeHtmlEntities(linkMatch[1]));
        if (!targetUrl || seen.has(targetUrl)) continue;
        const title = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, "")).trim();
        const snipMatch = blk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
        const snippet = decodeHtmlEntities((snipMatch?.[1] || "").replace(/<[^>]+>/g, "")).trim();
        if (title) {
          seen.add(targetUrl);
          results.push({ title: title.slice(0, 90), url: targetUrl, snippet: snippet.slice(0, 260) });
        }
        if (results.length >= 5) break;
      }
    }
  } catch {}

  if (results.length === 0) {
    try {
      const r = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GlitchAI/1.0)", Accept: "text/html" },
        signal: AbortSignal.timeout(2400),
      });
      if (r.ok) {
        const html = await r.text();
        const linkRe = /class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null && results.length < 5) {
          const targetUrl = decodeDdgTargetUrl(decodeHtmlEntities(m[1]));
          if (!targetUrl || seen.has(targetUrl)) continue;
          const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "")).trim();
          if (title) {
            seen.add(targetUrl);
            results.push({ title: title.slice(0, 90), url: targetUrl, snippet: "" });
          }
        }
      }
    } catch {}
  }

  return results;
}

export async function searchLiveInternet(promptText: string): Promise<{
  contextBlock: string;
  sources: Array<{ title: string; url: string }>;
}> {
  const rawClean = promptText
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s.,?!'"-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  const scriptLang = detectScriptLangCode(promptText);
  const { englishQuery, weatherPlace } = await deriveEnglishSearchQuery(rawClean);
  const effectiveQuery = (englishQuery || rawClean).trim();
  const combinedLower = `${promptText} ${effectiveQuery}`.toLowerCase();

  const sources: Array<{ title: string; url: string }> = [];
  const seenUrls = new Set<string>();
  const addSource = (title: string, url?: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    sources.push({ title: (title || "Source").slice(0, 72), url });
  };

  const chunks: string[] = [];
  const tasks: Promise<void>[] = [];

  // 1. Direct URLs OR explicit domain references (e.g. "https://..." or "check bbc.com")
  const explicitUrls = new Set<string>(promptText.match(/https?:\/\/[^\s<>"')]+/gi) || []);
  const bareDomainMatches = promptText.match(/\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|app|ai|dev|edu|gov|pk|in|uk|co)\b(?:\/[^\s<>"')]*)?/gi) || [];
  for (const dom of bareDomainMatches) {
    if (![...explicitUrls].some((u) => u.includes(dom))) {
      explicitUrls.add(`https://${dom}`);
    }
  }
  for (const rawUrl of Array.from(explicitUrls).slice(0, 2)) {
    tasks.push(
      fetchDirectUrlContext(rawUrl, 2400).then((res) => {
        if (res) {
          chunks.push(res.snippet);
          addSource(res.source.title, res.source.url);
        }
      })
    );
  }

  if (effectiveQuery.length >= 2) {
    // 2. Live Web Search (all websites worldwide via DuckDuckGo organic index + deep read top 2 pages)
    tasks.push(
      (async () => {
        const webHits = await searchDuckDuckGoWeb(effectiveQuery);
        if (webHits.length > 0) {
          const lines = webHits.map((h) => `- ${h.title} (${h.url})${h.snippet ? `: ${h.snippet}` : ""}`);
          chunks.push(`Live Web Search Results:\n${lines.join("\n")}`);
          for (const h of webHits.slice(0, 4)) {
            addSource(h.title, h.url);
          }

          // Deep-fetch top 2 organic website pages in parallel for authentic factual grounding
          const pageContents = await Promise.all(
            webHits.slice(0, 2).map((h) => fetchDirectUrlContext(h.url, 1400))
          );
          for (const page of pageContents) {
            if (page?.snippet) {
              chunks.push(page.snippet);
            }
          }
        }
      })()
    );

    // 3. Wikipedia Search + REST Summaries (English + native language Wikipedia if applicable)
    const wikiTargets = [{ lang: "en", q: effectiveQuery }];
    if (scriptLang && ["ur", "ar", "hi", "bn", "zh", "ja", "ko", "ru"].includes(scriptLang) && rawClean.length >= 2) {
      wikiTargets.push({ lang: scriptLang, q: rawClean });
    }
    for (const wt of wikiTargets) {
      tasks.push(
        (async () => {
          try {
            const searchUrl = `https://${wt.lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
              wt.q
            )}&format=json&srlimit=2&utf8=1`;
            const r = await fetch(searchUrl, {
              headers: { "User-Agent": "GlitchAI/1.0" },
              signal: AbortSignal.timeout(2500),
            });
            if (!r.ok) return;
            const json: any = await r.json().catch(() => null);
            const hits = Array.isArray(json?.query?.search) ? json.query.search : [];
            const topTitles: string[] = hits.slice(0, 2).map((h: any) => String(h.title || "")).filter(Boolean);
            const summaries = await Promise.all(
              topTitles.map(async (title) => {
                try {
                  const sr = await fetch(
                    `https://${wt.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
                    { headers: { "User-Agent": "GlitchAI/1.0" }, signal: AbortSignal.timeout(2100) }
                  );
                  return sr.ok ? await sr.json().catch(() => null) : null;
                } catch {
                  return null;
                }
              })
            );
            for (const sum of summaries) {
              if (sum?.extract) {
                const pageUrl =
                  sum?.content_urls?.desktop?.page ||
                  `https://${wt.lang}.wikipedia.org/wiki/${encodeURIComponent(String(sum.title || "").replace(/ /g, "_"))}`;
                chunks.push(`Wikipedia (${sum.title}): ${String(sum.extract).slice(0, 650)}`);
                addSource(`Wikipedia · ${sum.title}`, pageUrl);
              }
            }
          } catch {}
        })()
      );
    }

    // 4. Google News RSS + Bing News RSS (real-time breaking global news across sources)
    const rssQuery =
      effectiveQuery
        .replace(
          /\b(?:what\s+is|what's|tell\s+me|can\s+you|please|give\s+me|one\s+recent|today(?:'s)?|current|now|latest|news|headline|headlines|update|updates|and|about|the|a|an)\b/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 90) || effectiveQuery.slice(0, 90);

    tasks.push(
      (async () => {
        try {
          const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
            rssQuery
          )}&hl=en-US&gl=US&ceid=US:en`;
          const r = await fetch(newsUrl, {
            headers: { "User-Agent": "GlitchAI/1.0" },
            signal: AbortSignal.timeout(2300),
          });
          if (!r.ok) return;
          const xml = await r.text();
          const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
          const newsLines: string[] = [];
          for (const item of items.slice(0, 5)) {
            const title = decodeHtmlEntities(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim();
            const link = decodeHtmlEntities(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
            const pubDate = decodeHtmlEntities(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim();
            const publisher = decodeHtmlEntities(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "").trim();
            if (title) {
              newsLines.push(`- ${title}${publisher ? ` (${publisher})` : ""}${pubDate ? ` [${pubDate}]` : ""}`);
              addSource(publisher ? `${publisher}: ${title}` : title, link);
            }
          }
          if (newsLines.length > 0) {
            chunks.push(`Live News Headlines:\n${newsLines.join("\n")}`);
          }
        } catch {}
      })()
    );

    tasks.push(
      (async () => {
        try {
          const bingNewsUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(rssQuery)}&format=rss`;
          const r = await fetch(bingNewsUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; GlitchAI/1.0)" },
            signal: AbortSignal.timeout(2300),
          });
          if (!r.ok) return;
          const xml = await r.text();
          const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
          const bingLines: string[] = [];
          for (const item of items.slice(0, 4)) {
            const title = decodeHtmlEntities(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim();
            const rawLink = decodeHtmlEntities(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
            let realUrl = rawLink;
            try {
              const parsed = new URL(rawLink);
              const uParam = parsed.searchParams.get("url");
              if (uParam && /^https?:\/\//i.test(uParam)) realUrl = uParam;
            } catch {}
            const desc = decodeHtmlEntities(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "")
              .replace(/<[^>]+>/g, "")
              .trim()
              .slice(0, 180);
            const pubDate = decodeHtmlEntities(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim();
            if (title) {
              bingLines.push(`- ${title}${pubDate ? ` [${pubDate}]` : ""}${desc ? `: ${desc}` : ""}`);
              addSource(title, realUrl);
            }
          }
          if (bingLines.length > 0) {
            chunks.push(`Global News Feed:\n${bingLines.join("\n")}`);
          }
        } catch {}
      })()
    );

    // 5. DuckDuckGo Instant Answer + Wikidata Entity Graph
    tasks.push(
      (async () => {
        try {
          const r = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(effectiveQuery)}&format=json&no_html=1&skip_disambig=1`,
            { signal: AbortSignal.timeout(2000) }
          );
          if (!r.ok) return;
          const d: any = await r.json().catch(() => null);
          if (d?.AbstractText) {
            chunks.push(`Reference (${d.AbstractSource || "Instant Answer"}): ${String(d.AbstractText).slice(0, 550)}`);
            if (d.AbstractURL) addSource(d.Heading || d.AbstractSource || "Reference", d.AbstractURL);
          } else if (d?.Answer) {
            chunks.push(`Instant Fact: ${String(d.Answer).slice(0, 400)}`);
          }
        } catch {}
      })()
    );

    tasks.push(
      (async () => {
        try {
          const wd = await fetch(
            `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
              effectiveQuery.slice(0, 80)
            )}&language=en&limit=3&format=json`,
            { headers: { "User-Agent": "GlitchAI/1.0" }, signal: AbortSignal.timeout(2000) }
          );
          if (!wd.ok) return;
          const wdData: any = await wd.json().catch(() => null);
          const list = Array.isArray(wdData?.search) ? wdData.search : [];
          const lines = list
            .filter((e: any) => e.label && e.description)
            .map((e: any) => `- ${e.label}: ${e.description}`);
          if (lines.length > 0) {
            chunks.push(`Verified Entities (Wikidata):\n${lines.join("\n")}`);
          }
        } catch {}
      })()
    );

    // 6. Live Weather (Open-Meteo — multilingual keywords)
    if (
      weatherPlace ||
      /\b(?:weather|temperature|forecast|rain|humidity|wind|climate|hot|cold|mausam|barish|garmi|sardi|thandi)\b|طقس|حرارة|موسم|بارش|मौसम/i.test(
        combinedLower
      )
    ) {
      tasks.push(
        (async () => {
          try {
            const cityMatch =
              effectiveQuery.match(/\b(?:in|for|at)\s+([a-zA-Z\s-]{2,28})/i) ||
              effectiveQuery.match(/([a-zA-Z]{3,24})\s+(?:weather|temperature|forecast)/i);
            const place = (
              weatherPlace ||
              cityMatch?.[1] ||
              effectiveQuery.replace(/\b(?:weather|temperature|forecast|today|now|current|what|is|the|in|for|at|like)\b/gi, "").trim()
            ).slice(0, 40);
            if (!place || place.length < 2) return;
            const geoRes = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
              { signal: AbortSignal.timeout(2200) }
            );
            const geo: any = geoRes.ok ? await geoRes.json().catch(() => null) : null;
            const loc = geo?.results?.[0];
            if (!loc) return;
            const wxRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto`,
              { signal: AbortSignal.timeout(2200) }
            );
            const wx: any = wxRes.ok ? await wxRes.json().catch(() => null) : null;
            if (wx?.current) {
              chunks.push(
                `Live Weather (${loc.name}, ${loc.country || ""}): Temp ${wx.current.temperature_2m}°C (feels like ${wx.current.apparent_temperature}°C), Humidity ${wx.current.relative_humidity_2m}%, Wind ${wx.current.wind_speed_10m} km/h, Local Time ${wx.current.time}.`
              );
              addSource(`Open-Meteo Live Weather · ${loc.name}`, "https://open-meteo.com/");
            }
          } catch {}
        })()
      );
    }

    // 7. Live Crypto & Global Currency FX (supports PKR, INR, AED, SAR, EUR, GBP, BDT, TRY, etc.)
    if (/\b(?:bitcoin|btc|ethereum|eth|solana|sol|crypto|dogecoin|xrp|bnb|cardano|coin|token|market)\b/i.test(combinedLower)) {
      tasks.push(
        (async () => {
          try {
            const cg = await fetch(
              "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano&vs_currencies=usd,eur,pkr&include_24hr_change=true",
              { signal: AbortSignal.timeout(2200) }
            );
            if (!cg.ok) return;
            const prices: any = await cg.json().catch(() => null);
            if (prices?.bitcoin) {
              const summary = Object.entries(prices)
                .map(([coin, val]: [string, any]) => `${coin}: $${val.usd} (24h ${Number(val.usd_24h_change || 0).toFixed(2)}%)`)
                .join(" | ");
              chunks.push(`Live Crypto Prices (CoinGecko): ${summary}`);
              addSource("CoinGecko Live Market Data", "https://www.coingecko.com/");
            }
          } catch {}
        })()
      );
    }

    if (
      /\b(?:exchange\s+rate|rate|convert|currency|usd|eur|gbp|pkr|inr|aed|sar|bdt|jpy|cad|aud|dollar|euro|pound|rupee|riyal|dirham|taka|gold|qeemat)\b/i.test(
        combinedLower
      )
    ) {
      tasks.push(
        (async () => {
          try {
            const fx = await fetch("https://open.er-api.com/v6/latest/USD", {
              signal: AbortSignal.timeout(2200),
            });
            if (!fx.ok) return;
            const fxData: any = await fx.json().catch(() => null);
            if (fxData?.rates) {
              const picks = ["PKR", "INR", "AED", "SAR", "EUR", "GBP", "BDT", "TRY", "CAD", "AUD", "JPY", "CNY"]
                .filter((k) => fxData.rates[k])
                .map((k) => `1 USD = ${Number(fxData.rates[k]).toFixed(2)} ${k}`)
                .join(", ");
              chunks.push(`Live Global Exchange Rates (${fxData.time_last_update_utc || "Live"}): ${picks}`);
              addSource("ExchangeRate Live FX", "https://www.exchangerate-api.com/");
            }
          } catch {}
        })()
      );
    }

    // 8. Live Tech / GitHub / StackOverflow / HackerNews
    if (/\b(?:error|exception|bug|react|typescript|javascript|python|node|next\.?js|vite|api|sdk|library|framework|code|npm|firebase|sql|rust|go|docker|github|netlify)\b/i.test(combinedLower)) {
      tasks.push(
        (async () => {
          try {
            const se = await fetch(
              `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
                effectiveQuery.slice(0, 100)
              )}&site=stackoverflow&pagesize=3`,
              { signal: AbortSignal.timeout(2200) }
            );
            if (!se.ok) return;
            const seData: any = await se.json().catch(() => null);
            const qHits = Array.isArray(seData?.items) ? seData.items : [];
            if (qHits.length > 0) {
              const lines = qHits.map((q: any) => `- ${decodeHtmlEntities(q.title || "")} (Score: ${q.score}, Answered: ${q.is_answered})`);
              chunks.push(`StackOverflow Related Discussions:\n${lines.join("\n")}`);
              if (qHits[0]?.link) addSource(decodeHtmlEntities(qHits[0].title || "StackOverflow"), qHits[0].link);
            }
          } catch {}
        })()
      );

      tasks.push(
        (async () => {
          try {
            const gh = await fetch(
              `https://api.github.com/search/repositories?q=${encodeURIComponent(effectiveQuery.slice(0, 80))}&sort=stars&per_page=3`,
              { headers: { "User-Agent": "GlitchAI/1.0", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(2200) }
            );
            if (!gh.ok) return;
            const ghData: any = await gh.json().catch(() => null);
            const repos = Array.isArray(ghData?.items) ? ghData.items : [];
            if (repos.length > 0) {
              const lines = repos.map((r: any) => `- ${r.full_name} (★${r.stargazers_count}): ${(r.description || "").slice(0, 120)}`);
              chunks.push(`GitHub Top Repositories:\n${lines.join("\n")}`);
              if (repos[0]?.html_url) addSource(`GitHub · ${repos[0].full_name}`, repos[0].html_url);
            }
          } catch {}
        })()
      );
    }

    if (/\b(?:paper|arxiv|study|research|benchmark|ai\s+news|tech\s+news|latest|today|2025|2026|update|release)\b/i.test(combinedLower)) {
      tasks.push(
        (async () => {
          try {
            const hn = await fetch(
              `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(effectiveQuery.slice(0, 90))}&hitsPerPage=3`,
              { signal: AbortSignal.timeout(2200) }
            );
            if (!hn.ok) return;
            const hnData: any = await hn.json().catch(() => null);
            const hits = Array.isArray(hnData?.hits) ? hnData.hits : [];
            if (hits.length > 0) {
              const lines = hits.filter((h: any) => h.title).map((h: any) => `- ${h.title} (${h.points || 0} pts)`);
              if (lines.length > 0) chunks.push(`HackerNews Discussions:\n${lines.join("\n")}`);
              if (hits[0]?.url) addSource(hits[0].title, hits[0].url);
            }
          } catch {}
        })()
      );
    }

    // 9. Live Real-Time Web Search Grounding Bridge (returns verified Google Search summary + citations when configured)
    const geminiClients = getGeminiClients();
    if (geminiClients.length > 0) {
      tasks.push(
        (async () => {
          for (const ai of geminiClients.slice(0, 2)) {
            try {
              const groundedRes = await Promise.race([
                ai.models.generateContent({
                  model: "gemini-3.1-flash-lite",
                  contents: [
                    {
                      role: "user",
                      parts: [
                        {
                          text: `Verify real-time web facts for this query concisely in English with exact dates, numbers, and source details (max 220 words): ${effectiveQuery}`,
                        },
                      ],
                    },
                  ],
                  config: {
                    tools: [{ googleSearch: {} }],
                  },
                }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3200)),
              ]);
              if (groundedRes && (groundedRes as any).text) {
                const factText = String((groundedRes as any).text).trim().slice(0, 1200);
                if (factText) {
                  chunks.push(`Verified Live Web Search Summary:\n${factText}`);
                }
                const gChunks = (groundedRes as any).candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (Array.isArray(gChunks)) {
                  for (const gc of gChunks.slice(0, 4)) {
                    if (gc?.web?.uri) {
                      addSource(gc.web.title || "Web Source", gc.web.uri);
                    }
                  }
                }
                break;
              }
            } catch {}
          }
        })()
      );
    }
  }

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, 3500)),
  ]);

  const nowIso = new Date().toISOString();
  const contextBlock =
    chunks.length > 0
      ? `\n[LIVE INTERNET CONTEXT — Fetched at ${nowIso}]\n${chunks.join("\n\n")}\n[END LIVE INTERNET CONTEXT]\nUse these verified real-time facts, dates, and webpage contents directly when answering. Cite details naturally and accurately.`
      : `\n[Current UTC Date & Time: ${nowIso}]`;

  return {
    contextBlock,
    sources: sources.slice(0, 6),
  };
}

// ============================================================================
// HIGH-AVAILABILITY STREAMING CHAT ENGINE
// ============================================================================

export async function createChatSseStream(
  body: {
    messages: any[];
    tone?: string;
    userProfile?: any;
    useSearch?: boolean;
    useMaps?: boolean;
  },
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const { messages, tone, userProfile, useSearch, useMaps } = body;
  const validMessages = messages.filter(
    (m: any) =>
      !m.error &&
      ((typeof m.content === "string" && m.content.trim().length > 0) || Boolean(m.imageUrl))
  );

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const pushEvent = (payload: any) => {
        if (closed || signal?.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {}
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {}
      };

      try {
        const lastMessage = validMessages[validMessages.length - 1];
        const lastUserPrompt =
          [...validMessages].reverse().find((m: any) => m.role === "user")?.content || "";
        const hasVisionImage = Boolean(lastMessage?.imageUrl);
        const hasUrlInPrompt = /https?:\/\/\S+/i.test(lastUserPrompt);

        let liveInternet: { contextBlock: string; sources: Array<{ title: string; url: string }> } = {
          contextBlock: `\n[Current UTC Date & Time: ${new Date().toISOString()}]`,
          sources: [],
        };

        const trimmedPrompt = lastUserPrompt.trim();
        const isPureTinyGreeting =
          trimmedPrompt.length <= 3 ||
          /^(?:hi|hello|hey|yo|sup|helo|good\s+(?:morning|afternoon|evening|night)|thanks|thank\s+you|thx|ok|okay|cool|nice|great|bye|goodbye|salam|assalam\s*(?:o|u)?\s*alaikum|wsalam|shukriya)\b[!?.،۔\s]*$/i.test(
            trimmedPrompt
          );
        const searchActive = useSearch === true || (useSearch !== false && !isPureTinyGreeting) || hasUrlInPrompt;

        if (!hasVisionImage && searchActive) {
          liveInternet = await searchLiveInternet(lastUserPrompt);
        }

        const systemPrompt = buildSystemInstruction(tone, userProfile, liveInternet.contextBlock);
        const groqClients = getGroqClients();

        const recentMessages = validMessages.slice(-16);
        const groqMessages: any[] = [{ role: "system", content: systemPrompt }];
        recentMessages.forEach((m: any, idx: number) => {
          const role = m.role === "assistant" || m.role === "model" ? "assistant" : "user";
          const isLatestWithImage = Boolean(m.imageUrl) && role === "user" && idx === recentMessages.length - 1;
          if (isLatestWithImage) {
            groqMessages.push({
              role: "user",
              content: [
                { type: "image_url", image_url: { url: m.imageUrl } },
                { type: "text", text: (m.content || "").trim() || "Analyze this image in detail." },
              ],
            });
          } else {
            const rawText = (m.content || "").trim();
            if (rawText && rawText !== "...") {
              const isOlderTurn = idx < recentMessages.length - 4;
              const clippedText =
                isOlderTurn && rawText.length > 3500 ? rawText.slice(0, 3500) + "\n...[trimmed]" : rawText;
              groqMessages.push({ role, content: clippedText });
            }
          }
        });

        // 1. VISION ROUTE
        if (hasVisionImage) {
          for (const groq of groqClients) {
            if (signal?.aborted) break;
            try {
              const stream = await callGroqCompletion(groq, {
                model: "qwen/qwen3.8-27b",
                messages: groqMessages,
                temperature: 0.45,
                max_completion_tokens: 4096,
                top_p: 0.95,
                reasoning_effort: "default",
                stream: true,
                stop: null,
              });
              let visionStreamed = false;
              for await (const chunk of stream) {
                if (signal?.aborted) break;
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta && delta.trim() !== "") {
                  visionStreamed = true;
                  pushEvent({ text: sanitizeOutputText(delta) });
                } else if (delta) {
                  pushEvent({ text: delta });
                }
              }
              if (visionStreamed) {
                finish();
                return;
              }
            } catch (vErr) {
              console.warn("Vision key fallback:", cleanErrorMessage(vErr));
            }
          }
        }

        // 2. HIGH-IQ PRIMARY REASONING & MULTI-KEY FAILOVER ROUTE
        if (!hasVisionImage && !useMaps && groqClients.length > 0) {
          const isComplexOrTechnical =
            tone === "research" ||
            tone === "gaming" ||
            lastUserPrompt.length > 140 ||
            /\b(?:explain|compare|analyze|design|architect|debug|fix|error|code|function|script|algorithm|math|prove|calculate|difference|vs|how\s+does|why\s+does|build|implement|plan|roadmap|write\s+a)\b/i.test(
              lastUserPrompt
            );
          const isShortGreeting = lastUserPrompt.trim().length <= 18 && !isComplexOrTechnical;

          const adaptiveEffort: "low" | "medium" | "high" =
            tone === "concise" || isShortGreeting
              ? "low"
              : isComplexOrTechnical
              ? "high"
              : "medium";
          const adaptiveTemp =
            tone === "creative"
              ? 0.76
              : useSearch || isComplexOrTechnical
              ? 0.32
              : 0.45;

          for (let kIdx = 0; kIdx < groqClients.length; kIdx++) {
            if (signal?.aborted) break;
            const groq = groqClients[kIdx];
            const extractCleanText = (resp: any): string => {
              const raw = (resp?.choices?.[0]?.message?.content || "").trim();
              if (!raw || /^\.{2,}$/.test(raw)) return "";
              return raw;
            };

            const callCandidate = (modelName: string, effort: "low" | "medium" | "high" = adaptiveEffort) =>
              callGroqCompletion(groq, {
                model: modelName,
                messages: groqMessages,
                temperature: adaptiveTemp,
                max_completion_tokens: 6144,
                top_p: 0.95,
                reasoning_effort: effort,
                stream: false,
                stop: null,
              })
                .then(extractCleanText)
                .catch(() => "");

            // Prefer flagship 120B intelligence first; fall back seamlessly if 120B fails or exceeds timeout
            const primary120 = await Promise.race([
              callCandidate("openai/gpt-oss-120b", adaptiveEffort),
              new Promise<string>((resolve) => setTimeout(() => resolve(""), 13000)),
            ]);

            let chosen = primary120;
            if (!chosen && !signal?.aborted) {
              chosen = await callCandidate("llama-3.3-70b-versatile", "medium");
            }
            if (!chosen && !signal?.aborted) {
              chosen = await callCandidate("openai/gpt-oss-20b", "medium");
            }

            if (chosen) {
              if (liveInternet.sources.length > 0) {
                pushEvent({ groundingSources: liveInternet.sources });
              }
              const safeText = sanitizeOutputText(chosen);
              const chunkSize = 40;
              for (let i = 0; i < safeText.length; i += chunkSize) {
                if (signal?.aborted) break;
                pushEvent({ text: safeText.slice(i, i + chunkSize) });
              }
              finish();
              return;
            }
          }
        }

        // 3. MULTI-KEY GEMINI ROUTE (supports Google Search Grounding + URL Context + automatic tool-free retry)
        const geminiClients = getGeminiClients();
        const contents = sanitizeMessages(validMessages);
        if (contents.length === 0) {
          throw new Error("No valid user message found.");
        }

        let streamedTextLength = 0;
        let sentLiveSources = false;
        let lastError: any = null;

        for (const ai of geminiClients) {
          if (signal?.aborted || streamedTextLength > 0) break;

          const attempts: Array<{ model: string; tools?: any }> = [];
          for (const candidateModel of GEMINI_TEXT_MODELS) {
            if (useSearch && hasUrlInPrompt) {
              attempts.push({ model: candidateModel, tools: [{ urlContext: {} }, { googleSearch: {} }] });
            }
            if (useSearch) {
              attempts.push({ model: candidateModel, tools: [{ googleSearch: {} }] });
            } else if (useMaps) {
              attempts.push({ model: candidateModel, tools: [{ googleMaps: {} }] });
            }
            attempts.push({ model: candidateModel });
          }

          for (const attempt of attempts) {
            if (signal?.aborted || streamedTextLength > 0) break;
            try {
              const streamConfig: any = {
                systemInstruction: systemPrompt,
              };
              if (!attempt.model.startsWith("gemini-4-")) {
                streamConfig.temperature = tone === "creative" ? 0.85 : 0.6;
              }
              if (attempt.tools) {
                streamConfig.tools = attempt.tools;
              }

              const stream = await ai.models.generateContentStream({
                model: attempt.model,
                contents,
                config: streamConfig,
              });

              for await (const chunk of stream) {
                if (signal?.aborted) break;
                const text = chunk.text;

                let groundingSources: Array<{ title?: string; url?: string }> | undefined = undefined;
                const searchChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (Array.isArray(searchChunks) && searchChunks.length > 0) {
                  groundingSources = searchChunks
                    .map((c: any) => ({
                      title: c.web?.title || c.maps?.title || "Source",
                      url: c.web?.uri || c.maps?.uri,
                    }))
                    .filter((s: any) => !!s.url);
                }

                if (!sentLiveSources && liveInternet.sources.length > 0) {
                  groundingSources = groundingSources
                    ? [...groundingSources, ...liveInternet.sources].slice(0, 6)
                    : liveInternet.sources;
                  sentLiveSources = true;
                }

                if (text && text.trim().length > 0) {
                  streamedTextLength += text.trim().length;
                  pushEvent({ text: sanitizeOutputText(text), groundingSources });
                } else if (text || (groundingSources && groundingSources.length > 0)) {
                  pushEvent({
                    text: text ? sanitizeOutputText(text) : undefined,
                    groundingSources,
                  });
                }
              }

              if (streamedTextLength > 0) break;
            } catch (err: any) {
              lastError = err;
              console.warn(
                `Chat route fallback (${attempt.model}${attempt.tools ? " +tools" : ""}):`,
                cleanErrorMessage(err)
              );
              if (isTransientNetworkOrRateError(err)) {
                await sleepJitter(180);
              }
            }
          }
        }

        if (streamedTextLength === 0) {
          throw lastError || new Error("Glitch AI could not generate a response right now. Please try again.");
        }

        finish();
      } catch (err: any) {
        pushEvent({ error: cleanErrorMessage(err) });
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      }
    },
  });
}

// ============================================================================
// VISION ENDPOINT LOGIC
// ============================================================================

export async function analyzeVisionImage(prompt: string | undefined, imageUrl: string): Promise<string> {
  const userText = (typeof prompt === "string" && prompt.trim()) || "Describe and analyze this image clearly.";

  for (const groq of getGroqClients()) {
    try {
      const completion = await callGroqCompletion(groq, {
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: GLITCH_AI_SYSTEM_INSTRUCTION },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: userText },
            ],
          },
        ],
        temperature: 0.6,
        max_completion_tokens: 4096,
        top_p: 0.95,
        reasoning_effort: "default",
        stream: false,
        stop: null,
      });

      const reply = completion?.choices?.[0]?.message?.content;
      if (reply) return sanitizeOutputText(reply);
    } catch (err) {
      console.warn("Vision key fallback:", cleanErrorMessage(err));
    }
  }

  const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const data = imageUrl.replace(/^data:[^;]+;base64,/, "");

  let lastErr: any = null;
  for (const ai of getGeminiClients()) {
    for (const model of GEMINI_TEXT_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [{ inlineData: { mimeType, data } }, { text: userText }],
          },
          config: { systemInstruction: GLITCH_AI_SYSTEM_INSTRUCTION },
        });
        if (response.text) return sanitizeOutputText(response.text);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr || new Error("Unable to analyze image right now.");
}

// ============================================================================
// LOW-LATENCY VOICE CALL & ALL-LANGUAGE TRANSCRIPTION
// ============================================================================

export async function generateFastCallReply(
  messages: Array<{ role: string; content: string }>,
  userProfile?: any
): Promise<string> {
  const latestUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const isPureGreeting = /^(?:hi|hello|hey|salam|assalam|ok|okay|thanks|shukriya|bye)\b[!?.]*$/i.test(
    latestUser.trim()
  );
  const isSelfQuestion = /\b(?:glitch\s*ai|al-fateh|what\s+can\s+you\s+do|your\s+features|who\s+made\s+you|who\s+created\s+you)\b/i.test(
    latestUser
  );

  let liveContext = `\n[Current UTC Date & Time: ${new Date().toISOString()}]`;
  if (!isPureGreeting && !isSelfQuestion && latestUser.trim().length > 4) {
    try {
      const liveRes = await Promise.race([
        searchLiveInternet(latestUser),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1900)),
      ]);
      if (liveRes?.contextBlock) {
        liveContext = liveRes.contextBlock;
      }
    } catch {}
  }

  let profileNote = "";
  if (userProfile && typeof userProfile === "object") {
    const name = typeof userProfile.name === "string" ? userProfile.name.trim() : "";
    const role = typeof userProfile.role === "string" ? userProfile.role.trim() : "";
    const custom = typeof userProfile.customInstructions === "string" ? userProfile.customInstructions.trim() : "";
    if (name && name !== "Glitch Explorer") profileNote += ` Speaking with ${name}.`;
    if (role) profileNote += ` Role: ${role}.`;
    if (custom) profileNote += ` Preference: ${custom}.`;
  }

  const callSystem = `You are Glitch AI v1.0, created by Al-Fateh, speaking in a real-time Live Voice Call.${profileNote}
IDENTITY: Never mention any third-party AI vendors, APIs, or underlying model names. You are purely Glitch AI by Al-Fateh.
PRODUCT KNOWLEDGE: Without signing in, users have free live internet Text Chat, Voice Call, PDF export, and Shift+N portable download. After signing in with Google, users unlock cloud sync, profile customization, 100 starting credits, image generation at 10 credits across any aspect ratio, 0-10 lucky ad credit rewards, and credit transfers. If sign-in fails with unauthorized-domain, advise adding the live domain in Firebase Authorized Domains.
SCRIPT LOCK: Always match the user's exact language and script (e.g. Roman Urdu in Latin alphabet, Urdu script, English, Arabic, Hindi).
VOICE OUTPUT RULES: Reply in 1 to 3 short, natural spoken sentences (under 55 words). NEVER output Markdown headings, tables, pipes, asterisks, hashtags, bullet lists, numbered lists, emojis, or code blocks.${liveContext}`;

  for (const groq of getGroqClients()) {
    try {
      const groqMessages = [
        { role: "system", content: callSystem },
        ...messages
          .filter((m: any) => typeof m.content === "string" && m.content.trim())
          .slice(-8)
          .map((m: any) => ({
            role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
            content: m.content.trim(),
          })),
      ];

      const completion = await Promise.race([
        callGroqCompletion(groq, {
          model: "openai/gpt-oss-120b",
          messages: groqMessages,
          temperature: 0.6,
          max_completion_tokens: 180,
          top_p: 1,
          reasoning_effort: "low",
          stream: false,
          stop: null,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      const replyText = completion?.choices?.[0]?.message?.content?.trim();
      if (replyText) return stripMarkdownForSpeech(sanitizeOutputText(replyText));
    } catch {}
  }

  const contents = sanitizeMessages(messages);
  for (const ai of getGeminiClients()) {
    for (const m of ["gemini-3.1-flash-lite", "gemini-4-hydrogen"]) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents,
          config: { systemInstruction: callSystem },
        });
        const candidate = response.text?.trim();
        if (candidate) return stripMarkdownForSpeech(sanitizeOutputText(candidate));
      } catch {}
    }
  }

  return "I heard you — could you say that one more time?";
}

export async function transcribeAudioBuffer(audioData: string, mimeType?: string): Promise<string> {
  const base64Marker = "base64,";
  const markerIdx = audioData.indexOf(base64Marker);
  const cleanedData = markerIdx >= 0 ? audioData.slice(markerIdx + base64Marker.length) : audioData;
  const rawMime = typeof mimeType === "string" && mimeType.trim() ? mimeType : "audio/webm";
  const cleanMime = rawMime.split(";")[0].trim() || "audio/webm";
  const audioBuffer = Buffer.from(cleanedData, "base64");

  if (audioBuffer.length < 400) return "";

  const ext =
    cleanMime.includes("mp4") || cleanMime.includes("m4a")
      ? "m4a"
      : cleanMime.includes("ogg")
      ? "ogg"
      : cleanMime.includes("wav")
      ? "wav"
      : "webm";

  for (const groq of getGroqClients()) {
    try {
      const audioFile = await toFile(audioBuffer, `speech.${ext}`, { type: cleanMime });
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-large-v3-turbo",
        response_format: "json",
      });
      const heard = (transcription?.text || "").trim();
      if (heard && !/^[\s.,!?…\-_]+$/.test(heard)) {
        return heard;
      }
    } catch (groqErr) {
      console.warn("Primary STT fallback:", cleanErrorMessage(groqErr));
    }
  }

  const promptInstruction =
    "Automatically detect whatever human language is spoken in this audio and transcribe the exact spoken words in their natural native script. If there is only silence or background noise with no clear spoken words, output an empty string. Output ONLY the transcribed words and nothing else.";

  for (const ai of getGeminiClients()) {
    for (const sttModel of ["gemini-3.5-transcribe", "gemini-3.1-flash-lite", "gemini-4-hydrogen"]) {
      try {
        const response = await ai.models.generateContent({
          model: sttModel,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: cleanMime, data: cleanedData } },
                { text: promptInstruction },
              ],
            },
          ],
        });
        const heard = (response.text || "").trim();
        if (heard) return heard;
      } catch (modelErr) {
        console.warn(`STT fallback (${sttModel}):`, cleanErrorMessage(modelErr));
      }
    }
  }

  return "";
}

export function isServerSideSelfEcho(heardText: string, lastAiText: string, endedAgoMs: number): boolean {
  if (!heardText || !lastAiText || endedAgoMs > 6000) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const heardWords = norm(heardText);
  const aiWords = norm(lastAiText);
  if (heardWords.length === 0 || aiWords.length === 0) return false;
  const aiJoined = aiWords.join(" ");
  const heardJoined = heardWords.join(" ");
  if (heardJoined.length >= 8 && aiJoined.includes(heardJoined)) return true;
  const aiSet = new Set(aiWords);
  let overlap = 0;
  for (const w of heardWords) {
    if (aiSet.has(w)) overlap++;
  }
  return overlap / heardWords.length >= 0.62 && heardWords.length <= aiWords.length + 3;
}

// ============================================================================
// ALL-RATIO IMAGE GENERATION & PERSONALITY LIKENESS STUDIO
// ============================================================================

export type AllImageAspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
  | "4:5"
  | "5:4"
  | "21:9";

const ASPECT_RATIO_DIMENSIONS: Record<
  AllImageAspectRatio,
  { width: number; height: number; geminiRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" }
> = {
  "1:1": { width: 1024, height: 1024, geminiRatio: "1:1" },
  "16:9": { width: 1344, height: 756, geminiRatio: "16:9" },
  "9:16": { width: 756, height: 1344, geminiRatio: "9:16" },
  "4:3": { width: 1152, height: 864, geminiRatio: "4:3" },
  "3:4": { width: 864, height: 1152, geminiRatio: "3:4" },
  "3:2": { width: 1248, height: 832, geminiRatio: "4:3" },
  "2:3": { width: 832, height: 1248, geminiRatio: "3:4" },
  "4:5": { width: 896, height: 1120, geminiRatio: "3:4" },
  "5:4": { width: 1120, height: 896, geminiRatio: "4:3" },
  "21:9": { width: 1512, height: 648, geminiRatio: "16:9" },
};

export function resolveImageAspectRatio(
  prompt: string,
  explicitAspect?: string
): {
  aspectRatio: AllImageAspectRatio;
  geminiRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  targetWidth: number;
  targetHeight: number;
} {
  const validSet = new Set<AllImageAspectRatio>([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "4:5",
    "5:4",
    "21:9",
  ]);

  let chosen: AllImageAspectRatio = "1:1";
  const normalizedExplicit = explicitAspect?.trim().replace(/[x×]/i, ":") as AllImageAspectRatio | undefined;
  if (normalizedExplicit && validSet.has(normalizedExplicit)) {
    chosen = normalizedExplicit;
  } else {
    const explicitInPrompt = prompt.match(/\b(21\s*[:x×]\s*9|16\s*[:x×]\s*9|9\s*[:x×]\s*16|4\s*[:x×]\s*3|3\s*[:x×]\s*4|3\s*[:x×]\s*2|2\s*[:x×]\s*3|4\s*[:x×]\s*5|5\s*[:x×]\s*4|1\s*[:x×]\s*1)\b/i);
    if (explicitInPrompt) {
      const candidate = explicitInPrompt[1].replace(/\s+/g, "").replace(/[x×]/i, ":") as AllImageAspectRatio;
      if (validSet.has(candidate)) chosen = candidate;
    } else {
      const lower = prompt.toLowerCase();
      if (/\b(?:21\s*by\s*9|ultrawide|ultra\s*wide|cinemascope|panoram(?:ic|a)|wide\s*banner)\b/i.test(lower)) {
        chosen = "21:9";
      } else if (/\b(?:16\s*by\s*9|youtube\s*thumbnail|thumbnail|widescreen|desktop\s*wallpaper|landscape|horizon|banner)\b/i.test(lower)) {
        chosen = "16:9";
      } else if (/\b(?:9\s*by\s*16|vertical|phone\s*wallpaper|mobile\s*wallpaper|wallpaper|reels?|shorts|tiktok|story|stories|tall|full\s*body)\b/i.test(lower)) {
        chosen = "9:16";
      } else if (/\b(?:4\s*by\s*5|instagram\s*(?:post|portrait))\b/i.test(lower)) {
        chosen = "4:5";
      } else if (/\b(?:5\s*by\s*4)\b/i.test(lower)) {
        chosen = "5:4";
      } else if (/\b(?:3\s*by\s*2|dslr|35mm|classic\s*photo)\b/i.test(lower)) {
        chosen = "3:2";
      } else if (/\b(?:2\s*by\s*3|book\s*cover|movie\s*poster|poster)\b/i.test(lower)) {
        chosen = "2:3";
      } else if (/\b(?:4\s*by\s*3|presentation|slide)\b/i.test(lower)) {
        chosen = "4:3";
      } else if (/\b(?:3\s*by\s*4|portrait|headshot)\b/i.test(lower)) {
        chosen = "3:4";
      }
    }
  }

  const dims = ASPECT_RATIO_DIMENSIONS[chosen];
  return {
    aspectRatio: chosen,
    geminiRatio: dims.geminiRatio,
    targetWidth: dims.width,
    targetHeight: dims.height,
  };
}

/**
 * Translates any non-English prompt cleanly AND enriches well-known public personalities
 * with exact recognizable physical likeness anchors (facial structure, hair, era, signature look)
 * while matching the requested medium (photorealistic vs anime/sketch/logo) and aspect composition.
 */
async function enhanceImagePromptForLikeness(
  rawPrompt: string,
  aspectRatio: AllImageAspectRatio
): Promise<string> {
  const clean = rawPrompt.trim();
  const groq = getGroqClients()[0];
  const ai = getGeminiClients()[0];

  const instruction = `You are an expert visual prompt director for image generation models.
Transform the user's request into a single crisp English image prompt (max 110 words) without preamble or quotes:
1. If written in another language (e.g. Urdu, Roman Urdu, Hindi, Arabic, Spanish), translate and capture every requested detail faithfully.
2. PERSONALITY LIKENESS RULE: If the prompt names ANY well-known public personality, historical figure, leader, scientist, athlete, or celebrity, explicitly preserve their EXACT authentic facial likeness, real facial geometry, nose/eye/jawline proportions, natural age and skin texture, signature hairstyle/hairline, facial hair/glasses if known for it, and iconic attire. Emphasize "exact recognizable facial likeness of [Full Name]" and center-safe subject framing so no head or face is ever clipped in ${aspectRatio} framing.
3. STYLE RULE: Match the exact medium the user wants (editorial photography with natural lens & lighting if realistic portrait; clean vector if logo; authentic anime/oil/3D if specified). Never add buzzwords that contradict the style.
4. COMPOSITION: Frame naturally for ${aspectRatio} aspect ratio.`;

  if (groq) {
    try {
      const resp = await Promise.race([
        callGroqCompletion(groq, {
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: instruction },
            { role: "user", content: clean },
          ],
          temperature: 0.35,
          max_completion_tokens: 340,
          reasoning_effort: "low",
          stream: false,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 2600)),
      ]);
      const out = resp?.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 8) return out;
    } catch {}
  }

  if (ai) {
    try {
      const resp = await Promise.race([
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: [{ role: "user", parts: [{ text: `${instruction}\n\nUser request: ${clean}` }] }],
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 1800)),
      ]);
      const out = (resp as any)?.text?.trim();
      if (out && out.length > 8) return out;
    } catch {}
  }

  return `${clean}, exact recognizable likeness, sharp optical focus, natural lighting, balanced ${aspectRatio} composition`;
}

async function generateImageWithHorde(
  apiKey: string,
  prompt: string,
  width: number,
  height: number
): Promise<Buffer | null> {
  const w64 = Math.max(512, Math.min(1024, Math.round(width / 64) * 64));
  const h64 = Math.max(512, Math.min(1024, Math.round(height / 64) * 64));

  const submitRes = await fetch("https://aihorde.net/api/v2/generate/async", {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      "Client-Agent": "GlitchAI:1.0:alfateh",
    },
    body: JSON.stringify({
      prompt,
      params: { width: w64, height: h64, steps: 20, n: 1, sampler_name: "k_euler_a" },
      models: ["Flux.1-Schnell fp8", "AlbedoBase XL (SDXL)", "Deliberate", "stable_diffusion"],
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      shared: false,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!submitRes.ok) return null;
  const submitted: any = await submitRes.json().catch(() => null);
  const jobId = submitted?.id;
  if (!jobId) return null;

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const stRes = await fetch(`https://aihorde.net/api/v2/generate/status/${jobId}`, {
      headers: { "Client-Agent": "GlitchAI:1.0:alfateh" },
      signal: AbortSignal.timeout(6000),
    });
    if (!stRes.ok) break;
    const st: any = await stRes.json().catch(() => null);
    if (st?.faulted) break;
    if (st?.done && Array.isArray(st?.generations) && st.generations[0]?.img) {
      const imgUrlOrB64 = st.generations[0].img;
      if (typeof imgUrlOrB64 === "string" && imgUrlOrB64.startsWith("http")) {
        const dl = await fetch(imgUrlOrB64, { signal: AbortSignal.timeout(10000) });
        if (dl.ok) return Buffer.from(await dl.arrayBuffer());
      } else if (typeof imgUrlOrB64 === "string" && imgUrlOrB64.length > 200) {
        return Buffer.from(imgUrlOrB64, "base64");
      }
      break;
    }
  }
  return null;
}

async function generateImageWithMagicHour(
  apiKey: string,
  prompt: string,
  aspectRatio: AllImageAspectRatio
): Promise<Buffer | null> {
  const orientation =
    aspectRatio === "9:16" || aspectRatio === "3:4" || aspectRatio === "2:3" || aspectRatio === "4:5"
      ? "portrait"
      : aspectRatio === "1:1"
      ? "square"
      : "landscape";

  const createRes = await fetch("https://api.magichour.ai/v1/ai-image-generator", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Glitch AI Generation",
      image_count: 1,
      orientation,
      style: { prompt },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!createRes.ok) return null;
  const created: any = await createRes.json().catch(() => null);
  const projectId = created?.id;
  if (!projectId) return null;

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const checkRes = await fetch(`https://api.magichour.ai/v1/image-projects/${projectId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!checkRes.ok) break;
    const proj: any = await checkRes.json().catch(() => null);
    if (proj?.status === "error" || proj?.status === "canceled") break;
    if (proj?.status === "complete" && Array.isArray(proj?.downloads) && proj.downloads[0]?.url) {
      const dl = await fetch(proj.downloads[0].url, { signal: AbortSignal.timeout(10000) });
      if (dl.ok) return Buffer.from(await dl.arrayBuffer());
      break;
    }
  }
  return null;
}

async function postProcessImageBuffer(
  rawBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  needsBottomCrop: boolean
): Promise<{ dataUrl: string }> {
  try {
    const sharpMod = await import("sharp");
    const sharpFn = sharpMod.default;
    let sharpPipeline = sharpFn(rawBuffer);
    if (needsBottomCrop) {
      const meta = await sharpPipeline.metadata();
      const origW = meta.width || targetWidth;
      const origH = meta.height || targetHeight + 52;
      const cropH = Math.max(100, origH - 52);
      sharpPipeline = sharpFn(rawBuffer).extract({ left: 0, top: 0, width: origW, height: cropH });
    }
    const processed = await sharpPipeline
      .resize(targetWidth, targetHeight, { fit: "cover", position: "attention", kernel: "lanczos3" })
      .sharpen({ sigma: 1.1, m1: 0.7, m2: 2.0 })
      .modulate({ brightness: 1.01, saturation: 1.02 })
      .jpeg({ quality: 96, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return { dataUrl: `data:image/jpeg;base64,${processed.toString("base64")}` };
  } catch {
    const isPng = rawBuffer[0] === 0x89 && rawBuffer[1] === 0x50;
    const mime = isPng ? "image/png" : "image/jpeg";
    return { dataUrl: `data:${mime};base64,${rawBuffer.toString("base64")}` };
  }
}

export async function processImageBase64(
  imageBase64: string,
  targetWidth: number = 1024,
  targetHeight: number = 1024
): Promise<{ imageUrl: string; resolution: string }> {
  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
  const rawBuffer = Buffer.from(cleanBase64, "base64");
  const { dataUrl } = await postProcessImageBuffer(rawBuffer, targetWidth, targetHeight, true);
  return {
    imageUrl: dataUrl,
    resolution: `${targetWidth}x${targetHeight}`,
  };
}

export async function generateImageResponse(body: {
  prompt: string;
  aspectRatio?: string;
  baseImage?: string;
  negativePrompt?: string;
}) {
  const { prompt, aspectRatio, baseImage, negativePrompt } = body;
  const trimmedPrompt = prompt.trim();
  const { aspectRatio: validAspect, geminiRatio, targetWidth, targetHeight } =
    resolveImageAspectRatio(trimmedPrompt, aspectRatio);

  const defaultNegatives =
    "blurry, low quality, deformed face, distorted eyes, generic clone face, extra limbs, pixelated, jpeg artifacts, grainy, watermark, text, signature, cropped head";
  const fullNegatives =
    negativePrompt && typeof negativePrompt === "string" && negativePrompt.trim()
      ? `${negativePrompt.trim()}, ${defaultNegatives}`
      : defaultNegatives;

  const fullPrompt = baseImage
    ? `${trimmedPrompt}, faithful to reference subject and likeness, ultra-detailed sharp focus`
    : await enhanceImagePromptForLikeness(trimmedPrompt, validAspect);

  let synthesized: { buffer: Buffer; needsBottomCrop: boolean; engine: string } | null = null;

  // Tier 1: Gemini Image Engine (rotates across all GEMINI_API_KEY keys)
  for (const ai of getGeminiClients()) {
    try {
      const parts: any[] = [];
      if (baseImage && typeof baseImage === "string" && baseImage.startsWith("data:image/")) {
        const mimeMatch = baseImage.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        const base64Data = baseImage.replace(/^data:[^;]+;base64,/, "");
        parts.push({ inlineData: { mimeType, data: base64Data } });
      }
      parts.push({ text: fullPrompt });

      const geminiRes = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: { parts },
        config: { imageConfig: { aspectRatio: geminiRatio } },
      });
      const candidateParts = geminiRes.candidates?.[0]?.content?.parts || [];
      for (const part of candidateParts) {
        if (part.inlineData?.data) {
          synthesized = {
            buffer: Buffer.from(part.inlineData.data, "base64"),
            needsBottomCrop: false,
            engine: "glitch-neural-v1",
          };
          break;
        }
      }
      if (synthesized) break;
    } catch {}
  }

  // Tier 2: Magic Hour high-res pool
  if (!synthesized && !baseImage) {
    for (const magicKey of getRotatedKeyPool("MAGICHOUR_API_KEY", "MAGICHOUR_API_KEYS")) {
      try {
        const mhBuf = await generateImageWithMagicHour(magicKey, fullPrompt, validAspect);
        if (mhBuf && mhBuf.byteLength > 2000) {
          synthesized = { buffer: mhBuf, needsBottomCrop: false, engine: "glitch-neural-v2" };
          break;
        }
      } catch {}
    }
  }

  // Tier 3: Exact-dimension edge diffusion pool (handles any custom ratio directly!)
  if (!synthesized) {
    const seed = Math.floor(Math.random() * 9000000) + 1000000;
    const genHeight = targetHeight + 52;
    const negQuery = fullNegatives ? `&negative_prompt=${encodeURIComponent(fullNegatives)}` : "";
    const zKey = getRotatedKeyPool("ZIMAGE_API_KEY")[0];
    const authHeader = zKey ? { Authorization: `Bearer ${zKey}` } : undefined;

    const edgeUrls = [
      `https://gen.pollinations.ai/image/${encodeURIComponent(fullPrompt)}?model=flux-realism&width=${targetWidth}&height=${targetHeight}&seed=${seed}&nologo=true`,
      `https://gen.pollinations.ai/image/${encodeURIComponent(fullPrompt)}?model=zimage&width=${targetWidth}&height=${targetHeight}&seed=${seed}&nologo=true`,
      `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?model=flux-realism&width=${targetWidth}&height=${genHeight}&seed=${seed}&nologo=true&enhance=true&private=true&nofeed=true${negQuery}`,
      `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?model=flux&width=${targetWidth}&height=${genHeight}&seed=${seed}&nologo=true&enhance=true&private=true&nofeed=true${negQuery}`,
    ];

    for (let idx = 0; idx < edgeUrls.length; idx++) {
      try {
        const r = await fetch(edgeUrls[idx], {
          headers: idx < 2 && authHeader ? authHeader : undefined,
          signal: AbortSignal.timeout(14000),
        });
        if (r.ok) {
          const ctype = r.headers.get("content-type") || "";
          if (ctype.includes("image")) {
            const arr = await r.arrayBuffer();
            if (arr.byteLength > 2000) {
              synthesized = {
                buffer: Buffer.from(arr),
                needsBottomCrop: idx >= 2,
                engine: "glitch-neural-v3",
              };
              break;
            }
          }
        }
      } catch {}
    }
  }

  // Tier 4: AI Horde distributed worker pool
  if (!synthesized && !baseImage) {
    for (const hordeKey of getRotatedKeyPool("AI_HORDE_API_KEY", "AI_HORDE_API_KEYS")) {
      try {
        const hBuf = await generateImageWithHorde(hordeKey, fullPrompt, targetWidth, targetHeight);
        if (hBuf && hBuf.byteLength > 2000) {
          synthesized = { buffer: hBuf, needsBottomCrop: false, engine: "glitch-neural-v4" };
          break;
        }
      } catch {}
    }
  }

  if (!synthesized) {
    return {
      fallbackToClient: true,
      prompt: trimmedPrompt,
      enhancedPrompt: fullPrompt,
      negatives: fullNegatives,
      aspectRatio: validAspect,
      targetWidth,
      targetHeight,
    };
  }

  const { dataUrl } = await postProcessImageBuffer(
    synthesized.buffer,
    targetWidth,
    targetHeight,
    synthesized.needsBottomCrop
  );

  return {
    imageUrl: dataUrl,
    prompt: trimmedPrompt,
    enhancedPrompt: fullPrompt,
    aspectRatio: validAspect,
    engine: synthesized.engine,
    resolution: `${targetWidth}x${targetHeight}`,
    timestamp: Date.now(),
  };
}

export function resolvePublicBackendOriginFromHeaders(headers: {
  host?: string;
  forwardedHost?: string;
  forwardedProto?: string;
  protocol?: string;
}): string {
  const explicitShared = process.env.SHARED_APP_URL?.trim();
  if (explicitShared) return explicitShared.replace(/\/+$/, "");

  const netlifyUrl = process.env.URL?.trim() || process.env.DEPLOY_PRIME_URL?.trim();
  if (netlifyUrl && /^https?:\/\//i.test(netlifyUrl)) {
    return netlifyUrl.replace(/\/+$/, "");
  }

  const host = headers.forwardedHost?.split(",")[0]?.trim() || headers.host || "";
  const protoRaw = headers.forwardedProto?.split(",")[0]?.trim();
  const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : headers.protocol || "https";

  if (host && !host.startsWith("ais-dev-") && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const envAppUrl = process.env.APP_URL?.trim();
  if (envAppUrl) {
    return envAppUrl.replace("://ais-dev-", "://ais-pre-").replace(/\/+$/, "");
  }

  if (host) {
    const publicHost = host.startsWith("ais-dev-") ? host.replace(/^ais-dev-/, "ais-pre-") : host;
    return `${proto}://${publicHost}`.replace(/\/+$/, "");
  }

  return "https://the-glitch-ai.netlify.app";
}

export function injectStandaloneRuntimeHtml(rawHtml: string, apiBaseUrl: string, emblemBase64?: string): string {
  const runtimeScript = `<script>window.__GLITCH_STANDALONE__=${JSON.stringify({
    enabled: true,
    apiBaseUrl,
  })};</script>`;

  let finalHtml = rawHtml;
  if (emblemBase64) {
    finalHtml = finalHtml.replace(
      /href=["'](?:\.?\/)?assets\/glitch-emblem\.png["']/i,
      `href="data:image/png;base64,${emblemBase64}"`
    );
  }

  if (finalHtml.includes("<!-- GLITCH_STANDALONE_CONFIG -->")) {
    finalHtml = finalHtml.replace("<!-- GLITCH_STANDALONE_CONFIG -->", runtimeScript);
  } else {
    const headCloseIdx = finalHtml.indexOf("</head>");
    if (headCloseIdx !== -1) {
      finalHtml =
        finalHtml.slice(0, headCloseIdx) +
        runtimeScript +
        finalHtml.slice(headCloseIdx);
    } else {
      finalHtml = runtimeScript + finalHtml;
    }
  }
  return finalHtml;
}

export { crypto };
