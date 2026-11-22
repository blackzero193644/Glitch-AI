import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Groq, { toFile } from "groq-sdk";
import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";
import sharp from "sharp";
import dns from "dns/promises";
import net from "net";

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "40mb" }));

// Stateless API CORS so standalone exported index.html on external domains can safely proxy AI requests
// without embedding any secret API keys or passing cookies/credentials.
app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

const GLITCH_AI_SYSTEM_INSTRUCTION = `You are Glitch AI (Version 1.0), a universal, lightning-fast, live-internet-connected AI Agent.
Core Persona & Identity:
1. Identity & Version: Your official name is Glitch AI, and your current release is Version 1.0 (v1.0). You are a versatile, sharp, and direct multilingual AI Agent connected to the live internet for real-time research, news, coding, facts, analysis, everyday tasks, and image creation.
2. Strict Confidentiality: NEVER mention, reveal, or speculate about underlying third-party model identifiers, vendor names, API providers, or internal engine codenames. If asked what powers you, state only that you run on Glitch AI v1.0's neural engine.
3. Direct & Honest Accuracy: Answer user requests directly, thoroughly, and accurately using the provided Live Internet Context when available. Never fabricate live prices, dates, or news if uncertain—rely on the verified facts provided.
4. Creator Origin: ONLY if specifically asked who created, founded, owns, or developed you, state that you were created by Al-Fateh, an organization.
5. Video Generation Status: Video generation is currently Coming Soon and is not active in Glitch AI v1.0. If a user asks you to generate, create, render, or animate a video, clearly inform them that Video Generation is Coming Soon and will arrive in an upcoming version update.
6. Multilingual Fluency: Always detect and reply fluently in the exact language the user uses (any language worldwide).
7. High Performance: Use crisp formatting with clear headings, structured explanations, and syntax-highlighted code when relevant.`;

let aiClient: GoogleGenAI | null = null;
let groqClient: Groq | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in the environment.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

function getGroqClient(): Groq | null {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === "MY_GROQ_API_KEY" || !key.trim()) {
    return null;
  }
  if (!groqClient) {
    groqClient = new Groq({ apiKey: key.trim() });
  }
  return groqClient;
}

const GEMINI_TEXT_MODELS = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

function cleanErrorMessage(err: any): string {
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

  // Never leak third-party model identifiers in client error messages
  msg = msg
    .replace(/openai\/gpt-[^\s"']+/gi, "Glitch AI Core")
    .replace(/canopylabs\/orpheus[^\s"']+/gi, "Glitch AI Voice")
    .replace(/qwen\/qwen[^\s"']+/gi, "Glitch AI Vision")
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
    return "Rate limit reached. Please wait a moment and try again.";
  }

  return msg;
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
      "\nTone Mode: Deep Analysis - Provide structured, analytical, step-by-step tactical reasoning and thorough insights.";
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

/**
 * Safely calls Groq chat.completions.create, retrying without reasoning_effort if unsupported.
 */
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

/**
 * Automatically evaluates candidate text responses and picks whichever is cleaner and more detailed.
 */
function scoreResponseQuality(text: string, userPrompt: string): number {
  if (!text || !text.trim()) return -1;
  const trimmed = text.trim();
  let score = 0;

  // 1. Optimal completeness & detail (sweet spot without excessive fluff)
  const len = trimmed.length;
  score += Math.min(len, 2800) * 0.02;

  // 2. Clean structural formatting (headings, bullet lists, numbered steps)
  const headings = (trimmed.match(/^#{1,4}\s+/gm) || []).length;
  const bullets = (trimmed.match(/^(\s*[-*+]|\s*\d+\.)\s+/gm) || []).length;
  const codeBlocks = (trimmed.match(/```[\s\S]*?```/g) || []).length;
  score += Math.min(headings, 6) * 5;
  score += Math.min(bullets, 12) * 3;
  score += Math.min(codeBlocks, 4) * 8;

  // 3. Paragraph clarity (well-spaced paragraphs vs giant wall of text)
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  score += Math.min(paragraphs, 8) * 2.5;

  // 4. Relevance overlap with user prompt keywords
  const promptWords = userPrompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  if (promptWords.length > 0) {
    const lowerResp = trimmed.toLowerCase();
    let hits = 0;
    for (const w of promptWords.slice(0, 12)) {
      if (lowerResp.includes(w)) hits++;
    }
    score += (hits / Math.min(promptWords.length, 12)) * 18;
  }

  // 5. Penalize awkward refusals or leaking internal names
  if (/as an ai language model/i.test(trimmed)) score -= 8;
  if (/gpt-oss|groq|openai|fish\.audio|s2\.1-pro|aihorde|magichour|json2video|shotstack/i.test(trimmed)) score -= 30;
  if (trimmed.endsWith("...") && len < 60) score -= 10;

  return score;
}

function sanitizeOutputText(text: string): string {
  return text
    .replace(/openai\/gpt-[a-z0-9.-]+/gi, "Glitch AI")
    .replace(/canopylabs\/orpheus-[a-z0-9.-]+/gi, "Glitch AI Voice")
    .replace(/qwen\/qwen[0-9.a-z-]+/gi, "Glitch AI Vision")
    .replace(/s2\.1-pro-free|fish\.audio|aihorde|pollinations|magichour|json2video|shotstack/gi, "Glitch AI");
}

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " Code example included in chat. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

interface VoiceCatalogEntry {
  id: string;
  name: string;
  style: string;
  gender: "female" | "male" | "neutral";
  referenceId: string;
  languages?: string[];
}

const CORE_VERIFIED_VOICES: VoiceCatalogEntry[] = [
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

// Legacy aliases mapped deterministically so existing saved calls keep consistent voices
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

async function getAllAvailableVoices(): Promise<VoiceCatalogEntry[]> {
  const now = Date.now();
  if (now - dynamicVoiceCache.fetchedAt < 5 * 60 * 1000 && dynamicVoiceCache.voices.length >= CORE_VERIFIED_VOICES.length) {
    return dynamicVoiceCache.voices;
  }

  const combined = [...CORE_VERIFIED_VOICES];
  const seenRefs = new Set(combined.map((v) => v.referenceId));
  const fishKeys = (process.env.FISH_AUDIO_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && k !== "MY_FISH_AUDIO_API_KEY");
  const fishKey = fishKeys[0];

  if (fishKey) {
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
          // Filter out joke/announcer/noisy entries
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
      }
    } catch {
      // Keep verified core voices reliably
    }
  }

  dynamicVoiceCache = { fetchedAt: now, voices: combined };
  return combined;
}

async function resolveDeterministicVoiceRef(voice: string): Promise<{ referenceId: string; gender: "female" | "male" | "neutral" }> {
  const key = (voice || "sarah").trim();
  const lower = key.toLowerCase();

  const coreMatch = CORE_VERIFIED_VOICES.find((v) => v.id === lower || v.referenceId === key);
  if (coreMatch) {
    return { referenceId: coreMatch.referenceId, gender: coreMatch.gender };
  }

  if (VOICE_REFERENCE_ALIASES[lower]) {
    return { referenceId: VOICE_REFERENCE_ALIASES[lower], gender: "female" };
  }

  // If user chose any voice from the full catalog by referenceId
  if (/^[a-f0-9]{32}$/i.test(key)) {
    const cached = dynamicVoiceCache.voices.find((v) => v.referenceId === key);
    return { referenceId: key, gender: cached?.gender || "neutral" };
  }

  const all = await getAllAvailableVoices();
  const dynamicMatch = all.find((v) => v.id === key || v.referenceId === key || v.name.toLowerCase() === lower);
  if (dynamicMatch) {
    return { referenceId: dynamicMatch.referenceId, gender: dynamicMatch.gender };
  }

  // Always default to Sarah's pinned referenceId — never omit reference_id so voice stays 100% consistent
  return { referenceId: CORE_VERIFIED_VOICES[0].referenceId, gender: "female" };
}

async function callFishAudioTts(
  apiKey: string,
  text: string,
  referenceId: string,
  fast: boolean = false
): Promise<{ audioBase64: string; mimeType: string } | null> {
  // Fish Audio officially supports mp3_bitrate values: 64, 128, 192 (96 returns HTTP 400)
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
    signal: AbortSignal.timeout(fast ? 9500 : 20000),
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

async function synthesizeSpeechBuffer(
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

  // 1. Primary: High-definition multilingual TTS with pinned deterministic voice reference_id and key rotation
  const fishKeys = (process.env.FISH_AUDIO_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && k !== "MY_FISH_AUDIO_API_KEY");

  for (const fishKey of fishKeys) {
    try {
      const fishResult = await callFishAudioTts(fishKey, clipped, resolved.referenceId, fast);
      if (fishResult) return fishResult;
    } catch (err) {
      console.warn("Primary Glitch voice note:", cleanErrorMessage(err));
      if (resolved.referenceId !== CORE_VERIFIED_VOICES[0].referenceId) {
        try {
          const fallbackPinned = await callFishAudioTts(
            fishKey,
            clipped,
            CORE_VERIFIED_VOICES[0].referenceId,
            fast
          );
          if (fallbackPinned) return fallbackPinned;
        } catch (retryErr) {
          console.warn("Pinned fallback voice note:", cleanErrorMessage(retryErr));
        }
      }
    }
  }

  // 2. Fallback: Orpheus English TTS via Groq (for ASCII Latin inputs)
  const isMostlyLatin = !/[^\u0000-\u024F\s\d.,!?'"():;\-_/\\@#$%^&*+=<>[\]{}|~`]/.test(clipped);
  const groq = getGroqClient();
  const groqVoice = resolved.gender === "male" ? "austin" : "autumn";

  if (groq && isMostlyLatin) {
    try {
      const response = await groq.audio.speech.create({
        model: "canopylabs/orpheus-v1-english",
        voice: groqVoice,
        response_format: "wav",
        input: clipped.slice(0, 1400),
      });
      const arrayBuf = await response.arrayBuffer();
      const wavBuf = Buffer.from(arrayBuf);
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

  // 3. Fallback: Gemini TTS
  try {
    const ai = getAIClient();
    const geminiVoice = resolved.gender === "male" ? "Charon" : "Kore";
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash-lite-tts",
      contents: [
        {
          role: "user",
          parts: [{ text: clipped }],
        },
      ],
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
      return {
        audioBase64: base64Audio,
        mimeType: "audio/wav",
      };
    }
  } catch (err) {
    console.warn("Tertiary TTS note:", cleanErrorMessage(err));
  }

  return null;
}

// Voice Catalog endpoint (returns verified voices + live catalog entries)
app.get("/api/voices", async (_req, res) => {
  try {
    const voices = await getAllAvailableVoices();
    return res.json({ voices });
  } catch {
    return res.json({ voices: CORE_VERIFIED_VOICES });
  }
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Glitch AI High-Speed API",
    organization: "Al-Fateh",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// REAL-TIME LIVE INTERNET SEARCH & SSRF-SAFE URL READER ENGINE
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
    .replace(/&nbsp;/g, " ");
}

async function fetchDirectUrlContext(
  rawUrl: string
): Promise<{ snippet: string; source: { title: string; url: string } } | null> {
  const safeUrl = await isSafePublicUrl(rawUrl);
  if (!safeUrl) return null;
  try {
    const r = await fetch(safeUrl.toString(), {
      headers: {
        "User-Agent": "GlitchAI/1.0 (+https://glitch.ai)",
        Accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(3200),
    });
    if (!r.ok) return null;
    const ctype = (r.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("text") && !ctype.includes("json") && !ctype.includes("xml") && !ctype.includes("html")) {
      return null;
    }
    const raw = (await r.text()).slice(0, 65000);
    if (ctype.includes("json")) {
      return {
        snippet: `Webpage (${safeUrl.hostname}) JSON excerpt:\n${raw.slice(0, 1800)}`,
        source: { title: safeUrl.hostname, url: safeUrl.toString() },
      };
    }
    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = decodeHtmlEntities((titleMatch?.[1] || safeUrl.hostname).replace(/<[^>]+>/g, "")).trim().slice(0, 90);
    const text = decodeHtmlEntities(
      raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    ).slice(0, 2000);
    if (!text) return null;
    return {
      snippet: `Webpage [${title}] (${safeUrl.toString()}):\n${text}`,
      source: { title: title || safeUrl.hostname, url: safeUrl.toString() },
    };
  } catch {
    return null;
  }
}

async function searchLiveInternet(promptText: string): Promise<{
  contextBlock: string;
  sources: Array<{ title: string; url: string }>;
}> {
  const cleanQuery = promptText
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s.,?!'"-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  const lower = promptText.toLowerCase();
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

  // 1. Direct URLs pasted in user prompt
  const urlMatches = promptText.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  for (const rawUrl of urlMatches.slice(0, 2)) {
    tasks.push(
      fetchDirectUrlContext(rawUrl).then((res) => {
        if (res) {
          chunks.push(res.snippet);
          addSource(res.source.title, res.source.url);
        }
      })
    );
  }

  if (cleanQuery.length >= 2) {
    // 2. Wikipedia Search + REST Summaries (fast encyclopedic/entity accuracy)
    tasks.push(
      (async () => {
        try {
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            cleanQuery
          )}&format=json&srlimit=3&utf8=1`;
          const r = await fetch(searchUrl, {
            headers: { "User-Agent": "GlitchAI/1.0" },
            signal: AbortSignal.timeout(2600),
          });
          if (!r.ok) return;
          const json: any = await r.json().catch(() => null);
          const hits = Array.isArray(json?.query?.search) ? json.query.search : [];
          const topTitles: string[] = hits.slice(0, 2).map((h: any) => String(h.title || "")).filter(Boolean);
          const summaries = await Promise.all(
            topTitles.map(async (title) => {
              try {
                const sr = await fetch(
                  `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
                  { headers: { "User-Agent": "GlitchAI/1.0" }, signal: AbortSignal.timeout(2200) }
                );
                if (!sr.ok) return null;
                return await sr.json().catch(() => null);
              } catch {
                return null;
              }
            })
          );
          for (const sum of summaries) {
            if (sum?.extract) {
              const pageUrl = sum?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(sum.title || "").replace(/ /g, "_"))}`;
              chunks.push(`Wikipedia (${sum.title}): ${String(sum.extract).slice(0, 700)}`);
              addSource(`Wikipedia · ${sum.title}`, pageUrl);
            }
          }
        } catch {}
      })()
    );

    // 3. Google News RSS (latest live news & current events worldwide in English)
    tasks.push(
      (async () => {
        try {
          const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
            cleanQuery
          )}&hl=en-US&gl=US&ceid=US:en`;
          const r = await fetch(newsUrl, {
            headers: { "User-Agent": "GlitchAI/1.0" },
            signal: AbortSignal.timeout(2600),
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
            chunks.push(`Live Google News Headlines:\n${newsLines.join("\n")}`);
          }
        } catch {}
      })()
    );

    // 4. DuckDuckGo Instant Answer JSON
    tasks.push(
      (async () => {
        try {
          const r = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`,
            { signal: AbortSignal.timeout(2000) }
          );
          if (!r.ok) return;
          const d: any = await r.json().catch(() => null);
          if (d?.AbstractText) {
            chunks.push(`Reference (${d.AbstractSource || "Instant Answer"}): ${String(d.AbstractText).slice(0, 600)}`);
            if (d.AbstractURL) addSource(d.Heading || d.AbstractSource || "Reference", d.AbstractURL);
          } else if (d?.Answer) {
            chunks.push(`Instant Fact: ${String(d.Answer).slice(0, 400)}`);
          }
        } catch {}
      })()
    );

    // 5. Live Weather (Open-Meteo) when prompt mentions weather/forecast/temperature
    if (/\b(?:weather|temperature|forecast|rain|humidity|wind|climate|hot|cold)\b/i.test(lower)) {
      tasks.push(
        (async () => {
          try {
            const cityMatch =
              promptText.match(/\b(?:in|for|at)\s+([A-Z][a-zA-Z\s-]{2,28})/i) ||
              promptText.match(/([a-zA-Z]{3,24})\s+(?:weather|temperature|forecast)/i);
            const place = (cityMatch?.[1] || cleanQuery.replace(/\b(?:weather|temperature|forecast|today|now|current|what|is|the|in|for|at)\b/gi, "").trim()).slice(0, 40);
            if (!place) return;
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

    // 6. Live Crypto & Currency FX (CoinGecko + Frankfurter)
    if (/\b(?:bitcoin|btc|ethereum|eth|solana|sol|crypto|dogecoin|xrp|bnb|cardano|price\s+of|coin|token)\b/i.test(lower)) {
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

    if (/\b(?:exchange\s+rate|convert|usd|eur|gbp|pkr|inr|aed|sar|jpy|cad|aud|dollar|euro|pound|rupee)\b/i.test(lower)) {
      tasks.push(
        (async () => {
          try {
            const fx = await fetch("https://api.frankfurter.app/latest?from=USD", {
              signal: AbortSignal.timeout(2200),
            });
            if (!fx.ok) return;
            const fxData: any = await fx.json().catch(() => null);
            if (fxData?.rates) {
              const picks = ["EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "CNY", "TRY"]
                .filter((k) => fxData.rates[k])
                .map((k) => `1 USD = ${fxData.rates[k]} ${k}`)
                .join(", ");
              chunks.push(`Live FX Rates (${fxData.date}): ${picks}`);
              addSource("Frankfurter ECB Exchange Rates", "https://www.frankfurter.app/");
            }
          } catch {}
        })()
      );
    }

    // 7. Live Tech / Coding / Research (HackerNews + StackOverflow + ArXiv)
    if (/\b(?:error|exception|bug|react|typescript|javascript|python|node|next\.?js|vite|api|sdk|library|framework|code|npm|firebase|sql|rust|go|docker)\b/i.test(lower)) {
      tasks.push(
        (async () => {
          try {
            const se = await fetch(
              `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
                cleanQuery.slice(0, 100)
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
    }

    if (/\b(?:paper|arxiv|study|research|benchmark|ai\s+news|tech\s+news)\b/i.test(lower)) {
      tasks.push(
        (async () => {
          try {
            const hn = await fetch(
              `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(cleanQuery.slice(0, 90))}&hitsPerPage=3`,
              { signal: AbortSignal.timeout(2200) }
            );
            if (!hn.ok) return;
            const hnData: any = await hn.json().catch(() => null);
            const hits = Array.isArray(hnData?.hits) ? hnData.hits : [];
            if (hits.length > 0) {
              const lines = hits.filter((h: any) => h.title).map((h: any) => `- ${h.title} (${h.points || 0} pts)`);
              if (lines.length > 0) chunks.push(`HackerNews Tech Discussions:\n${lines.join("\n")}`);
              if (hits[0]?.url) addSource(hits[0].title, hits[0].url);
            }
          } catch {}
        })()
      );
    }
  }

  await Promise.allSettled(tasks);

  const nowIso = new Date().toISOString();
  const contextBlock =
    chunks.length > 0
      ? `\n[LIVE INTERNET CONTEXT — Fetched at ${nowIso}]\n${chunks.join("\n\n")}\n[END LIVE INTERNET CONTEXT]\nUse these verified real-time facts and dates directly when answering. Cite details naturally and accurately.`
      : `\n[Current UTC Date & Time: ${nowIso}]`;

  return {
    contextBlock,
    sources: sources.slice(0, 6),
  };
}

// Real-time streaming chat endpoint (Dual Text-to-Text Arbitrator, Vision, Live Internet Search & Maps)
app.post("/api/chat/stream", async (req, res) => {
  const { messages, tone, userProfile, useSearch, useMaps } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Invalid messages array." });
  }

  const validMessages = messages.filter(
    (m: any) =>
      !m.error &&
      ((typeof m.content === "string" && m.content.trim().length > 0) || Boolean(m.imageUrl))
  );
  if (validMessages.length === 0) {
    return res.status(400).json({ error: "No valid user message found." });
  }

  let isAborted = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      isAborted = true;
    }
  });

  const startSSE = () => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
    }
  };

  const writeSSE = (payload: any) => {
    startSSE();
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    (res as any).flush?.();
  };

  try {
    const lastMessage = validMessages[validMessages.length - 1];
    const lastUserPrompt =
      [...validMessages].reverse().find((m: any) => m.role === "user")?.content || "";
    const hasVisionImage = Boolean(lastMessage?.imageUrl);
    const hasUrlInPrompt = /https?:\/\/\S+/i.test(lastUserPrompt);

    // Gather live internet context in parallel whenever search is active or prompt has a URL
    let liveInternet: { contextBlock: string; sources: Array<{ title: string; url: string }> } = {
      contextBlock: `\n[Current UTC Date & Time: ${new Date().toISOString()}]`,
      sources: [],
    };
    if (!hasVisionImage && (useSearch || hasUrlInPrompt)) {
      liveInternet = await searchLiveInternet(lastUserPrompt);
    }

    const systemPrompt = buildSystemInstruction(tone, userProfile, liveInternet.contextBlock);
    const groq = getGroqClient();

    // Build Groq-compatible message history (only attach image on the active vision turn so text chats never stall on old images)
    const groqMessages: any[] = [{ role: "system", content: systemPrompt }];
    validMessages.forEach((m: any, idx: number) => {
      const role = m.role === "assistant" || m.role === "model" ? "assistant" : "user";
      const isLatestWithImage = Boolean(m.imageUrl) && role === "user" && idx === validMessages.length - 1;
      if (isLatestWithImage) {
        groqMessages.push({
          role: "user",
          content: [
            { type: "image_url", image_url: { url: m.imageUrl } },
            { type: "text", text: (m.content || "").trim() || "Analyze this image in detail." },
          ],
        });
      } else {
        const textOnly = (m.content || "").trim();
        if (textOnly && textOnly !== "...") {
          groqMessages.push({ role, content: textOnly });
        }
      }
    });

    // 1. VISION ROUTE (qwen/qwen3.8-27b primary, Gemini multimodal fallback)
    if (hasVisionImage) {
      let visionStreamed = false;
      if (groq) {
        try {
          const stream = await callGroqCompletion(groq, {
            model: "qwen/qwen3.8-27b",
            messages: groqMessages,
            temperature: 0.6,
            max_completion_tokens: 4096,
            top_p: 0.95,
            reasoning_effort: "default",
            stream: true,
            stop: null,
          });

          for await (const chunk of stream) {
            if (isAborted) break;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta && delta.trim() !== "") {
              visionStreamed = true;
              writeSSE({ text: sanitizeOutputText(delta) });
            } else if (delta) {
              writeSSE({ text: delta });
            }
          }
        } catch (vErr) {
          console.warn("Vision primary route note:", cleanErrorMessage(vErr));
        }
      }

      if (visionStreamed) {
        if (!isAborted) {
          res.write("data: [DONE]\n\n");
          res.end();
        }
        return;
      }
    }

    // 2. DUAL TEXT-TO-TEXT AUTO-QUALITY ROUTE (supports live internet context too! Zero 429 search crashes)
    if (!hasVisionImage && !useMaps && groq) {
      const extractCleanText = (resp: any): string => {
        const raw = (resp?.choices?.[0]?.message?.content || "").trim();
        if (!raw || /^\.{2,}$/.test(raw)) return "";
        return raw;
      };

      const callCandidate = (modelName: string) =>
        callGroqCompletion(groq, {
          model: modelName,
          messages: groqMessages,
          temperature: useSearch ? 0.45 : 1,
          max_completion_tokens: 4096,
          top_p: 1,
          reasoning_effort: "medium",
          stream: false,
          stop: null,
        })
          .then(extractCleanText)
          .catch(() => "");

      const p120 = callCandidate("openai/gpt-oss-120b");
      const p20 = callCandidate("openai/gpt-oss-20b");

      const bothPromise = Promise.all([p120, p20]);
      const fastFallbackPromise = Promise.race([
        bothPromise,
        new Promise<[string, string]>(async (resolve) => {
          const firstNonEmpty = await Promise.race([
            p120.then((t) => (t ? { t, which: 120 } : new Promise<never>(() => {}))),
            p20.then((t) => (t ? { t, which: 20 } : new Promise<never>(() => {}))),
          ]);
          setTimeout(() => {
            resolve(firstNonEmpty.which === 120 ? [firstNonEmpty.t, ""] : ["", firstNonEmpty.t]);
          }, 9000);
        }),
      ]).catch(() => ["", ""] as [string, string]);

      const [text120, text20] = await fastFallbackPromise;

      let chosen = "";
      if (text120 && text20) {
        const s120 = scoreResponseQuality(text120, lastUserPrompt);
        const s20 = scoreResponseQuality(text20, lastUserPrompt);
        chosen = s120 >= s20 ? text120 : text20;
      } else {
        chosen = text120 || text20;
      }

      if (chosen) {
        if (liveInternet.sources.length > 0) {
          writeSSE({ groundingSources: liveInternet.sources });
        }
        const safeText = sanitizeOutputText(chosen);
        const chunkSize = 28;
        for (let i = 0; i < safeText.length; i += chunkSize) {
          if (isAborted) break;
          writeSSE({ text: safeText.slice(i, i + chunkSize) });
        }
        if (!isAborted) {
          res.write("data: [DONE]\n\n");
          res.end();
        }
        return;
      }
    }

    // 3. GEMINI ROUTE (Non-fatal Search/Maps grounding + automatic tool-free retry if Search hits 429 quota)
    const ai = getAIClient();
    const cleanedForGemini = validMessages.filter(
      (m: any) => (m.content && m.content.trim() !== "...") || Boolean(m.imageUrl)
    );
    const contents = sanitizeMessages(cleanedForGemini);
    if (contents.length === 0) {
      return res.status(400).json({ error: "No valid user message found." });
    }

    const attempts: Array<{ model: string; tools?: any }> = [];
    for (const candidateModel of GEMINI_TEXT_MODELS) {
      if (useSearch) {
        attempts.push({ model: candidateModel, tools: [{ googleSearch: {} }] });
      } else if (useMaps) {
        attempts.push({ model: candidateModel, tools: [{ googleMaps: {} }] });
      }
      // Always follow with a tool-free live-internet-grounded attempt so quota 429 on googleSearch never kills the chat!
      attempts.push({ model: candidateModel });
    }

    let streamedTextLength = 0;
    let sentLiveSources = false;
    let lastError: any = null;

    for (const attempt of attempts) {
      if (isAborted) break;

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
          if (isAborted) break;
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
            writeSSE({
              text: sanitizeOutputText(text),
              groundingSources,
            });
          } else if (text || (groundingSources && groundingSources.length > 0)) {
            writeSSE({
              text: text ? sanitizeOutputText(text) : undefined,
              groundingSources,
            });
          }
        }

        if (streamedTextLength > 0) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Fallback attempt (${attempt.model}${attempt.tools ? " +tools" : ""}) note:`, cleanErrorMessage(err));
        if (streamedTextLength > 0) break;
      }
    }

    if (streamedTextLength === 0) {
      throw lastError || new Error("Glitch AI could not generate a response for that prompt. Please retry.");
    }

    if (!isAborted) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err: any) {
    const userFriendlyMsg = cleanErrorMessage(err);
    console.error("Glitch AI streaming error:", userFriendlyMsg);
    if (!res.headersSent) {
      return res.status(500).json({ error: userFriendlyMsg });
    }
    res.write(`data: ${JSON.stringify({ error: userFriendlyMsg })}\n\n`);
    res.end();
  }
});

// Dedicated Vision Analysis endpoint (qwen/qwen3.8-27b with Gemini multimodal fallback)
app.post("/api/vision", async (req, res) => {
  const { prompt, imageUrl } = req.body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ error: "An image is required for visual analysis." });
  }

  const userText =
    (typeof prompt === "string" && prompt.trim()) || "Describe and analyze this image clearly.";
  const groq = getGroqClient();

  if (groq) {
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
      if (reply) {
        return res.json({ text: sanitizeOutputText(reply) });
      }
    } catch (err) {
      console.warn("Vision endpoint fallback:", cleanErrorMessage(err));
    }
  }

  try {
    const ai = getAIClient();
    const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const data = imageUrl.replace(/^data:[^;]+;base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: {
        parts: [{ inlineData: { mimeType, data } }, { text: userText }],
      },
      config: { systemInstruction: GLITCH_AI_SYSTEM_INSTRUCTION },
    });
    return res.json({ text: sanitizeOutputText(response.text || "") });
  } catch (err: any) {
    return res.status(500).json({ error: cleanErrorMessage(err) });
  }
});

// Text-to-Speech endpoint (Glitch AI Neural Voice Engine)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "sarah", language = "auto" } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text is required for speech synthesis." });
    }

    const result = await synthesizeSpeechBuffer(text, voice, language);
    if (!result) {
      return res.status(503).json({ error: "Speech synthesis unavailable right now." });
    }

    return res.json(result);
  } catch (err: any) {
    console.error("TTS endpoint error:", cleanErrorMessage(err));
    return res.status(500).json({ error: cleanErrorMessage(err) });
  }
});

// Fast single-turn voice call reply generator (with automatic live internet grounding for factual questions)
async function generateFastCallReply(
  messages: Array<{ role: string; content: string }>,
  userProfile?: any
): Promise<string> {
  const latestUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const needsLiveFact = /\b(?:who|what|when|where|news|weather|price|bitcoin|btc|score|president|prime\s+minister|today|latest|current|rate)\b/i.test(
    latestUser
  );
  let liveContext = `\n[Current UTC Date & Time: ${new Date().toISOString()}]`;
  if (needsLiveFact && latestUser.trim().length > 2) {
    try {
      const liveRes = await Promise.race([
        searchLiveInternet(latestUser),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
      ]);
      if (liveRes?.contextBlock) {
        liveContext = liveRes.contextBlock;
      }
    } catch {}
  }

  const callSystem = buildSystemInstruction(
    "default",
    userProfile,
    `Live Voice Call Mode: Respond immediately in a warm, natural spoken style. Automatically match the exact language of the user's latest message. Keep your reply concise (1 to 2 clear spoken sentences) with NO markdown, asterisks, bullet lists, emojis, or code blocks.${liveContext}`
  );

  let replyText = "";
  const groq = getGroqClient();

  if (groq) {
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
          temperature: 0.85,
          max_completion_tokens: 240,
          top_p: 1,
          reasoning_effort: "low",
          stream: false,
          stop: null,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      replyText = completion?.choices?.[0]?.message?.content?.trim() || "";
    } catch (err) {
      console.warn("Call primary route fallback:", cleanErrorMessage(err));
    }
  }

  if (!replyText) {
    const ai = getAIClient();
    const contents = sanitizeMessages(messages);
    for (const m of ["gemini-3.1-flash-lite", "gemini-4-hydrogen"]) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents,
          config: { systemInstruction: callSystem },
        });
        const candidate = response.text?.trim();
        if (candidate) {
          replyText = candidate;
          break;
        }
      } catch {}
    }
  }

  return sanitizeOutputText(replyText || "I heard you—could you say that one more time?");
}

async function transcribeAudioBuffer(audioData: string, mimeType?: string): Promise<string> {
  const base64Marker = "base64,";
  const markerIdx = audioData.indexOf(base64Marker);
  const cleanedData = markerIdx >= 0 ? audioData.slice(markerIdx + base64Marker.length) : audioData;
  const rawMime = typeof mimeType === "string" && mimeType.trim() ? mimeType : "audio/webm";
  const cleanMime = rawMime.split(";")[0].trim() || "audio/webm";
  const audioBuffer = Buffer.from(cleanedData, "base64");

  if (audioBuffer.length < 400) {
    return "";
  }

  const ext =
    cleanMime.includes("mp4") || cleanMime.includes("m4a")
      ? "m4a"
      : cleanMime.includes("ogg")
      ? "ogg"
      : cleanMime.includes("wav")
      ? "wav"
      : "webm";

  const groq = getGroqClient();
  if (groq) {
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

  const ai = getAIClient();
  const promptInstruction =
    "Automatically detect whatever human language is spoken in this audio and transcribe the exact spoken words in their natural native script. If there is only silence or background noise with no clear spoken words, output an empty string. Output ONLY the transcribed words and nothing else.";

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

  return "";
}

function isServerSideSelfEcho(heardText: string, lastAiText: string, endedAgoMs: number): boolean {
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

// Instant Single-Hop Voice Call Endpoint (Audio -> STT -> Fast Reply -> Fast TTS in 1 HTTP call)
app.post("/api/call-audio", async (req, res) => {
  try {
    const {
      audioData,
      mimeType,
      messages = [],
      voice = "sarah",
      userProfile,
      lastAiText = "",
      lastAiEndedAgoMs = 999999,
    } = req.body;

    if (!audioData || typeof audioData !== "string") {
      return res.status(400).json({ error: "No audio data provided." });
    }

    const userText = (await transcribeAudioBuffer(audioData, mimeType)).trim();
    if (!userText) {
      return res.json({ empty: true, userText: "" });
    }

    if (isServerSideSelfEcho(userText, lastAiText, Number(lastAiEndedAgoMs) || 0)) {
      return res.json({ ignoredEcho: true, userText: "" });
    }

    const history = [
      ...(Array.isArray(messages) ? messages : []),
      { role: "user", content: userText },
    ];

    const safeReply = await generateFastCallReply(history, userProfile);
    const speech = await synthesizeSpeechBuffer(safeReply, voice, "auto", true);

    return res.json({
      userText,
      text: safeReply,
      audioBase64: speech?.audioBase64 || null,
      mimeType: speech?.mimeType || "audio/mpeg",
    });
  } catch (err: any) {
    console.error("Fast voice call error:", cleanErrorMessage(err));
    return res.status(500).json({ error: cleanErrorMessage(err) });
  }
});

// Live Auto-Detect Multilingual Voice Calling endpoint (for typed call prompts)
app.post("/api/call", async (req, res) => {
  try {
    const { messages, voice = "sarah", userProfile } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Conversation history is required." });
    }

    const safeReply = await generateFastCallReply(messages, userProfile);
    const speech = await synthesizeSpeechBuffer(safeReply, voice, "auto", true);

    return res.json({
      text: safeReply,
      audioBase64: speech?.audioBase64 || null,
      mimeType: speech?.mimeType || "audio/mpeg",
    });
  } catch (err: any) {
    console.error("Voice call error:", cleanErrorMessage(err));
    return res.status(500).json({ error: cleanErrorMessage(err) });
  }
});

// Automatic All-Language Audio Transcription endpoint
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;
    if (!audioData || typeof audioData !== "string") {
      return res.status(400).json({ error: "No audio data provided." });
    }
    const text = await transcribeAudioBuffer(audioData, mimeType);
    return res.json({ text });
  } catch (err: any) {
    console.error("Audio transcription error:", cleanErrorMessage(err));
    return res.status(500).json({ error: "Could not transcribe audio. Please try speaking again." });
  }
});

// Shared Multi-Key Image Synthesis Pool (Gemini + AI Horde + Magic Hour + Pollinations)
async function generateImageWithHorde(
  apiKey: string,
  prompt: string,
  width: number,
  height: number
): Promise<Buffer | null> {
  // Align dimensions to multiples of 64 required by diffusion workers
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
      params: {
        width: w64,
        height: h64,
        steps: 18,
        n: 1,
        sampler_name: "k_euler_a",
      },
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

  // Poll cleanly up to 20s
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
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
): Promise<Buffer | null> {
  const orientation =
    aspectRatio === "9:16" || aspectRatio === "3:4"
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

async function synthesizeMultiKeyImage(opts: {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  targetWidth: number;
  targetHeight: number;
  baseImage?: string;
  negatives?: string;
}): Promise<{ buffer: Buffer; needsBottomCrop: boolean; engine: string } | null> {
  const { prompt, aspectRatio, targetWidth, targetHeight, baseImage, negatives } = opts;

  // Tier 1: Gemini Multimodal Image (best for both creation & image remix/editing)
  try {
    const ai = getAIClient();
    const parts: any[] = [];
    if (baseImage && typeof baseImage === "string" && baseImage.startsWith("data:image/")) {
      const mimeMatch = baseImage.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const base64Data = baseImage.replace(/^data:[^;]+;base64,/, "");
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }
    parts.push({ text: prompt });

    const geminiRes = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: { parts },
      config: { imageConfig: { aspectRatio } },
    });
    const candidateParts = geminiRes.candidates?.[0]?.content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        return {
          buffer: Buffer.from(part.inlineData.data, "base64"),
          needsBottomCrop: false,
          engine: "glitch-neural-v1",
        };
      }
    }
  } catch {
    // Cascade to distributed image tiers
  }

  // Tier 2: Magic Hour high-res text-to-image (if no baseImage remix)
  const magicKey = process.env.MAGICHOUR_API_KEY?.trim();
  if (!baseImage && magicKey && !magicKey.startsWith("MY_")) {
    try {
      const mhBuf = await generateImageWithMagicHour(magicKey, prompt, aspectRatio);
      if (mhBuf && mhBuf.byteLength > 2000) {
        return { buffer: mhBuf, needsBottomCrop: false, engine: "glitch-neural-v2" };
      }
    } catch {
      // Continue
    }
  }

  // Tier 3: Edge Pollinations fast pool (gen.pollinations.ai + image.pollinations.ai)
  const seed = Math.floor(Math.random() * 9000000) + 1000000;
  const genHeight = targetHeight + 52;
  const negQuery = negatives ? `&negative_prompt=${encodeURIComponent(negatives)}` : "";
  const edgeUrls = [
    `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=zimage&width=${targetWidth}&height=${targetHeight}&seed=${seed}&nologo=true`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux-realism&width=${targetWidth}&height=${genHeight}&seed=${seed}&nologo=true&enhance=true&private=true&nofeed=true${negQuery}`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${targetWidth}&height=${genHeight}&seed=${seed}&nologo=true&enhance=true&private=true&nofeed=true${negQuery}`,
  ];

  for (let idx = 0; idx < edgeUrls.length; idx++) {
    try {
      const r = await fetch(edgeUrls[idx], { signal: AbortSignal.timeout(14000) });
      if (r.ok) {
        const ctype = r.headers.get("content-type") || "";
        if (ctype.includes("image")) {
          const arr = await r.arrayBuffer();
          if (arr.byteLength > 2000) {
            return {
              buffer: Buffer.from(arr),
              needsBottomCrop: idx > 0,
              engine: "glitch-neural-v3",
            };
          }
        }
      } else if (r.status === 402 || r.status === 429) {
        if (idx === 0) continue; // gen.pollinations vs image.pollinations are distinct hosts
        break;
      }
    } catch {
      // Try next
    }
  }

  // Tier 4: AI Horde distributed worker pool (using configured AI_HORDE_API_KEY)
  const hordeKey = process.env.AI_HORDE_API_KEY?.trim();
  if (!baseImage && hordeKey && !hordeKey.startsWith("MY_")) {
    try {
      const hBuf = await generateImageWithHorde(hordeKey, prompt, targetWidth, targetHeight);
      if (hBuf && hBuf.byteLength > 2000) {
        return { buffer: hBuf, needsBottomCrop: false, engine: "glitch-neural-v4" };
      }
    } catch {
      // Continue
    }
  }

  return null;
}

// AI Image Generation & Editing endpoint (prompt-driven, zero manual settings required)
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, aspectRatio, baseImage, negativePrompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Please enter a descriptive prompt." });
    }

    const trimmedPrompt = prompt.trim();
    const lowerP = trimmedPrompt.toLowerCase();

    // Auto-infer optimal aspect ratio from prompt text when not explicitly overridden
    let validAspect: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "1:1";
    if (aspectRatio === "16:9" || aspectRatio === "9:16" || aspectRatio === "4:3" || aspectRatio === "3:4" || aspectRatio === "1:1") {
      validAspect = aspectRatio;
    } else if (/portrait|vertical|wallpaper|phone|story|tall|full\s*body/i.test(lowerP)) {
      validAspect = "9:16";
    } else if (/landscape|widescreen|cinematic|banner|horizon|panoram/i.test(lowerP)) {
      validAspect = "16:9";
    }

    let targetWidth = 1024;
    let targetHeight = 1024;
    if (validAspect === "16:9") {
      targetWidth = 1280;
      targetHeight = 720;
    } else if (validAspect === "9:16") {
      targetWidth = 720;
      targetHeight = 1280;
    } else if (validAspect === "4:3") {
      targetWidth = 1024;
      targetHeight = 768;
    } else if (validAspect === "3:4") {
      targetWidth = 768;
      targetHeight = 1024;
    }

    const defaultNegatives =
      "blurry, low quality, distorted, bad anatomy, extra limbs, pixelated, jpeg artifacts, grainy, watermark, text, signature";
    const fullNegatives =
      negativePrompt && typeof negativePrompt === "string" && negativePrompt.trim()
        ? `${negativePrompt.trim()}, ${defaultNegatives}`
        : defaultNegatives;

    const fullPrompt = `${trimmedPrompt}, ultra-detailed 8K photorealistic composition, sharp optical focus, rich textures, natural cinematic lighting, masterpiece`;

    const synthesized = await synthesizeMultiKeyImage({
      prompt: fullPrompt,
      aspectRatio: validAspect,
      targetWidth,
      targetHeight,
      baseImage,
      negatives: fullNegatives,
    });

    if (!synthesized) {
      return res.json({
        fallbackToClient: true,
        prompt: trimmedPrompt,
        enhancedPrompt: fullPrompt,
        negatives: fullNegatives,
        aspectRatio: validAspect,
        targetWidth,
        targetHeight,
      });
    }

    let sharpPipeline = sharp(synthesized.buffer);
    if (synthesized.needsBottomCrop) {
      const meta = await sharpPipeline.metadata();
      const origW = meta.width || targetWidth;
      const origH = meta.height || targetHeight + 52;
      const cropH = Math.max(100, origH - 52);
      sharpPipeline = sharp(synthesized.buffer).extract({ left: 0, top: 0, width: origW, height: cropH });
    }

    const processedBuffer = await sharpPipeline
      .resize(targetWidth, targetHeight, { fit: "cover", kernel: "lanczos3" })
      .sharpen({ sigma: 1.15, m1: 0.7, m2: 2.2 })
      .modulate({ brightness: 1.01, saturation: 1.03 })
      .jpeg({ quality: 96, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return res.json({
      imageUrl: `data:image/jpeg;base64,${processedBuffer.toString("base64")}`,
      prompt: trimmedPrompt,
      enhancedPrompt: fullPrompt,
      aspectRatio: validAspect,
      engine: synthesized.engine,
      resolution: `${targetWidth}x${targetHeight}`,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error("Image generation error:", cleanErrorMessage(err));
    return res.status(500).json({ error: "An unexpected error occurred during image generation." });
  }
});

// Post-processing endpoint: strips watermarks cleanly and applies Lanczos3 sharpening
app.post("/api/process-image", async (req, res) => {
  try {
    const { imageBase64, targetWidth = 1024, targetHeight = 1024 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64 payload" });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const rawBuffer = Buffer.from(cleanBase64, "base64");

    const meta = await sharp(rawBuffer).metadata();
    const origW = meta.width || targetWidth;
    const origH = meta.height || targetHeight;
    const cropH = Math.max(100, origH - 52);

    const processedBuffer = await sharp(rawBuffer)
      .extract({ left: 0, top: 0, width: origW, height: cropH })
      .resize(Number(targetWidth) || 1024, Number(targetHeight) || 1024, {
        fit: "cover",
        kernel: "lanczos3",
      })
      .sharpen({ sigma: 1.2, m1: 0.7, m2: 2.5 })
      .modulate({ brightness: 1.01, saturation: 1.03 })
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return res.json({
      imageUrl: `data:image/jpeg;base64,${processedBuffer.toString("base64")}`,
      resolution: `${targetWidth}x${targetHeight}`,
    });
  } catch (err: any) {
    console.error("Image processing error:", cleanErrorMessage(err));
    return res.status(500).json({ error: "Image processing failed." });
  }
});

// ============================================================================
// CLOUD MULTI-PROVIDER AI VIDEO GENERATION SYSTEM
// Routes across Magic Hour (Text-to-Video & Image-to-Video), JSON2Video (multi-key),
// Shotstack (multi-key), Gemini Veo, and clean continuous FFmpeg encoding fallback.
// ============================================================================

interface VideoPlan {
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  enhancedPrompt: string;
}

async function prepareVideoPlan(
  prompt: string,
  explicitAspect?: string
): Promise<VideoPlan> {
  const lower = (prompt || "").toLowerCase();
  let aspectRatio: "16:9" | "9:16" | "1:1" | "4:3" = "16:9";
  if (
    explicitAspect === "16:9" ||
    explicitAspect === "9:16" ||
    explicitAspect === "1:1" ||
    explicitAspect === "4:3"
  ) {
    aspectRatio = explicitAspect;
  } else if (/portrait|vertical|reels|shorts|tiktok|story/i.test(lower)) {
    aspectRatio = "9:16";
  } else if (/square|instagram/i.test(lower)) {
    aspectRatio = "1:1";
  }

  const cleanPrompt = (prompt || "").trim();
  const fallbackEnhanced = cleanPrompt
    ? `${cleanPrompt}, cinematic natural motion, continuous camera movement, realistic lighting, ultra sharp 4k film quality`
    : "Cinematic natural motion, smooth continuous camera movement, realistic lighting, 4k film quality";

  if (!cleanPrompt) {
    return { aspectRatio, enhancedPrompt: fallbackEnhanced };
  }

  const groq = getGroqClient();
  if (groq) {
    try {
      const completion = await callGroqCompletion(groq, {
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content:
              "Return strictly valid raw JSON with keys aspectRatio (\"16:9\"|\"9:16\"|\"1:1\"|\"4:3\") and enhancedPrompt (single concise vivid video motion prompt).",
          },
          { role: "user", content: `Prompt: "${cleanPrompt}"` },
        ],
        temperature: 0.6,
        max_completion_tokens: 300,
        stream: false,
      });
      const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        return {
          aspectRatio:
            explicitAspect && explicitAspect !== "auto"
              ? aspectRatio
              : parsed.aspectRatio === "9:16" ||
                parsed.aspectRatio === "1:1" ||
                parsed.aspectRatio === "4:3" ||
                parsed.aspectRatio === "16:9"
              ? parsed.aspectRatio
              : aspectRatio,
          enhancedPrompt:
            typeof parsed.enhancedPrompt === "string" && parsed.enhancedPrompt.trim()
              ? parsed.enhancedPrompt.trim()
              : fallbackEnhanced,
        };
      }
    } catch {
      // Use deterministic fallback
    }
  }

  return { aspectRatio, enhancedPrompt: fallbackEnhanced };
}

async function uploadImageToMagicHour(
  mhKey: string,
  imgBuffer: Buffer,
  ext: "jpg" | "png" = "jpg"
): Promise<string | null> {
  try {
    const reqRes = await fetch("https://api.magichour.ai/v1/files/upload-urls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mhKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ type: "image", extension: ext }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!reqRes.ok) return null;
    const reqJson: any = await reqRes.json().catch(() => null);
    const item = reqJson?.items?.[0];
    if (!item?.upload_url || !item?.file_path) return null;

    const putRes = await fetch(item.upload_url, {
      method: "PUT",
      headers: { "Content-Type": ext === "png" ? "image/png" : "image/jpeg" },
      body: new Uint8Array(imgBuffer),
      signal: AbortSignal.timeout(12000),
    });
    if (!putRes.ok) return null;
    return item.file_path;
  } catch {
    return null;
  }
}

async function runMagicHourVideo(opts: {
  mhKey: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  baseImageBuffer?: Buffer;
}): Promise<{ videoUrl: string; duration: number } | null> {
  const { mhKey, prompt, aspectRatio, baseImageBuffer } = opts;

  let endpoint = "https://api.magichour.ai/v1/text-to-video";
  let payload: Record<string, any> = {
    name: "Glitch AI Video",
    end_seconds: 5.0,
    aspect_ratio: aspectRatio === "9:16" || aspectRatio === "1:1" ? aspectRatio : "16:9",
    style: { prompt },
  };

  if (baseImageBuffer) {
    const filePath = await uploadImageToMagicHour(mhKey, baseImageBuffer, "jpg");
    if (filePath) {
      endpoint = "https://api.magichour.ai/v1/image-to-video";
      payload = {
        name: "Glitch AI Video",
        end_seconds: 5.0,
        assets: { image_file_path: filePath },
        style: { prompt },
      };
    }
  }

  const createRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mhKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!createRes.ok) return null;

  const job: any = await createRes.json().catch(() => null);
  if (!job?.id) return null;

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2200));
    const stRes = await fetch(`https://api.magichour.ai/v1/video-projects/${job.id}`, {
      headers: { Authorization: `Bearer ${mhKey}` },
      signal: AbortSignal.timeout(7000),
    });
    if (!stRes.ok) break;
    const st: any = await stRes.json().catch(() => null);
    if (st?.status === "error" || st?.status === "canceled") break;
    if (st?.status === "complete" && Array.isArray(st?.downloads) && st.downloads[0]?.url) {
      return {
        videoUrl: st.downloads[0].url,
        duration: 5,
      };
    }
  }
  return null;
}

async function runJson2VideoPool(opts: {
  keys: string[];
  resolution: string;
  sourceVideoUrl?: string;
  prompt?: string;
}): Promise<{ buffer: Buffer; thumbnailUrl?: string; duration: number } | null> {
  const { keys, resolution, sourceVideoUrl, prompt } = opts;

  const sceneElement = sourceVideoUrl
    ? {
        type: "video",
        src: sourceVideoUrl,
        duration: -1,
        resize: "cover",
      }
    : {
        type: "image",
        model: "flux-schnell",
        prompt: prompt || "Cinematic scene",
        duration: 6,
        resize: "cover",
      };

  for (const jKey of keys) {
    try {
      const createRes = await fetch("https://api.json2video.com/v2/movies", {
        method: "POST",
        headers: {
          "x-api-key": jKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resolution,
          quality: "high",
          scenes: [{ elements: [sceneElement] }],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!createRes.ok) continue;
      const mData: any = await createRes.json().catch(() => null);
      const projectId = mData?.project;
      if (!projectId) continue;

      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
          headers: { "x-api-key": jKey },
          signal: AbortSignal.timeout(7000),
        });
        if (!pollRes.ok) break;
        const pJson: any = await pollRes.json().catch(() => null);
        if (pJson?.movie?.status === "done" && pJson?.movie?.url) {
          const dl = await fetch(pJson.movie.url, { signal: AbortSignal.timeout(18000) });
          if (dl.ok) {
            const vidBuf = Buffer.from(await dl.arrayBuffer());
            let thumbDataUrl: string | undefined;
            if (pJson.movie.thumbnail) {
              try {
                const tRes = await fetch(pJson.movie.thumbnail, { signal: AbortSignal.timeout(7000) });
                if (tRes.ok) {
                  const tBuf = Buffer.from(await tRes.arrayBuffer());
                  thumbDataUrl = `data:image/jpeg;base64,${tBuf.toString("base64")}`;
                }
              } catch {}
            }
            if (vidBuf.byteLength > 8000) {
              return {
                buffer: vidBuf,
                thumbnailUrl: thumbDataUrl,
                duration: pJson.movie.duration || 5,
              };
            }
          }
          break;
        }
        if (pJson?.movie?.status === "error") break;
      }
    } catch {
      // Try next JSON2Video key
    }
  }
  return null;
}

async function runShotstackPool(opts: {
  keys: string[];
  endpoint: string;
  aspectRatio: string;
  sourceVideoUrl?: string;
  prompt: string;
}): Promise<{ buffer: Buffer; duration: number } | null> {
  const { keys, endpoint, aspectRatio, sourceVideoUrl, prompt } = opts;
  if (!keys.length || !endpoint) return null;

  const statusBase = endpoint.replace(/\/render\/?$/, "/render");
  const aspect =
    aspectRatio === "9:16"
      ? "9:16"
      : aspectRatio === "1:1"
      ? "1:1"
      : aspectRatio === "4:3"
      ? "4:3"
      : "16:9";

  const clipAsset = sourceVideoUrl
    ? { type: "video", src: sourceVideoUrl }
    : { type: "title", text: prompt.slice(0, 80), style: "minimal" };

  for (const sKey of keys) {
    try {
      const submitRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": sKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeline: {
            background: "#04050c",
            tracks: [{ clips: [{ asset: clipAsset, start: 0, length: 5 }] }],
          },
          output: { format: "mp4", resolution: "hd", aspectRatio: aspect },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!submitRes.ok) continue;
      const subJson: any = await submitRes.json().catch(() => null);
      const renderId = subJson?.response?.id;
      if (!renderId) continue;

      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const stRes = await fetch(`${statusBase}/${renderId}`, {
          headers: { "x-api-key": sKey },
          signal: AbortSignal.timeout(6000),
        });
        if (!stRes.ok) break;
        const stJson: any = await stRes.json().catch(() => null);
        const st = stJson?.response?.status;
        if (st === "done" && stJson?.response?.url) {
          const dl = await fetch(stJson.response.url, { signal: AbortSignal.timeout(15000) });
          if (dl.ok) {
            const buf = Buffer.from(await dl.arrayBuffer());
            if (buf.byteLength > 8000) return { buffer: buf, duration: 5 };
          }
          break;
        }
        if (st === "failed") break;
      }
    } catch {
      // Rotate to next Shotstack key
    }
  }
  return null;
}

async function extractVideoThumbnail(mp4Path: string, thumbPath: string): Promise<string | undefined> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "ffmpeg",
        ["-y", "-i", mp4Path, "-vframes", "1", "-q:v", "4", thumbPath],
        (err) => (err ? reject(err) : resolve())
      );
    });
    if (fs.existsSync(thumbPath)) {
      const tBuf = fs.readFileSync(thumbPath);
      return `data:image/jpeg;base64,${tBuf.toString("base64")}`;
    }
  } catch {}
  return undefined;
}

app.post("/api/generate-video", async (_req, res) => {
  return res.status(503).json({
    comingSoon: true,
    version: "1.0",
    error: "Video generation is coming soon! This feature will be available in an upcoming release after Glitch AI v1.0.",
  });
});

// Poll endpoint for external video operation status
app.post("/api/video-status", async (_req, res) => {
  return res.status(503).json({
    comingSoon: true,
    version: "1.0",
    error: "Video generation is coming soon in an upcoming release after Glitch AI v1.0.",
  });
});

// Download endpoint for external video operation
app.post("/api/video-download", async (_req, res) => {
  return res.status(503).json({
    comingSoon: true,
    version: "1.0",
    error: "Video generation is coming soon in an upcoming release after Glitch AI v1.0.",
  });
});

let standaloneBuildPromise: Promise<string> | null = null;

function getNewestMtimeMs(targetPath: string): number {
  let maxTime = 0;
  try {
    if (!fs.existsSync(targetPath)) return 0;
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) return stat.mtimeMs;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(targetPath)) {
        if (entry === "node_modules" || entry === "dist" || entry === "dist-standalone") continue;
        const t = getNewestMtimeMs(path.join(targetPath, entry));
        if (t > maxTime) maxTime = t;
      }
    }
  } catch {}
  return maxTime;
}

async function ensureStandaloneHtmlBuilt(): Promise<string> {
  const outHtmlPath = path.resolve(process.cwd(), "dist-standalone", "index.html");
  const isProd = process.env.NODE_ENV === "production";

  if (fs.existsSync(outHtmlPath)) {
    if (isProd) {
      return fs.readFileSync(outHtmlPath, "utf8");
    }
    const outMtime = fs.statSync(outHtmlPath).mtimeMs;
    const srcMtime = Math.max(
      getNewestMtimeMs(path.resolve(process.cwd(), "src")),
      getNewestMtimeMs(path.resolve(process.cwd(), "index.html")),
      getNewestMtimeMs(path.resolve(process.cwd(), "vite.standalone.config.ts"))
    );
    if (outMtime >= srcMtime) {
      return fs.readFileSync(outHtmlPath, "utf8");
    }
  }

  if (!standaloneBuildPromise) {
    standaloneBuildPromise = (async () => {
      try {
        const { build } = await import("vite");
        await build({
          configFile: path.resolve(process.cwd(), "vite.standalone.config.ts"),
          logLevel: "silent",
        });
        if (!fs.existsSync(outHtmlPath)) {
          throw new Error("Standalone bundle output was not created.");
        }
        return fs.readFileSync(outHtmlPath, "utf8");
      } finally {
        standaloneBuildPromise = null;
      }
    })();
  }

  return standaloneBuildPromise;
}

function resolvePublicBackendOrigin(req: express.Request): string {
  const explicitShared = process.env.SHARED_APP_URL?.trim();
  if (explicitShared) {
    return explicitShared.replace(/\/+$/, "");
  }

  const forwardedHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.host || "";
  const protoHeader = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const proto = protoHeader === "http" || protoHeader === "https" ? protoHeader : req.protocol || "https";

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

  return "";
}

app.get("/api/export-standalone", async (req, res) => {
  try {
    const rawHtml = await ensureStandaloneHtmlBuilt();
    const apiBaseUrl = resolvePublicBackendOrigin(req);
    const runtimeScript = `<script>window.__GLITCH_STANDALONE__=${JSON.stringify({
      enabled: true,
      apiBaseUrl,
    })};</script>`;

    let finalHtml = rawHtml;
    try {
      const emblemPath = path.resolve(process.cwd(), "public", "assets", "glitch-emblem.png");
      if (fs.existsSync(emblemPath)) {
        const iconB64 = fs.readFileSync(emblemPath).toString("base64");
        finalHtml = finalHtml.replace(
          /href=["'](?:\.?\/)?assets\/glitch-emblem\.png["']/i,
          `href="data:image/png;base64,${iconB64}"`
        );
      }
    } catch {}

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

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="index.html"');
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(finalHtml);
  } catch (err: any) {
    console.error("Standalone HTML export error:", err);
    return res.status(500).json({
      error: cleanErrorMessage(err) || "Failed to package standalone index.html.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send("<!doctype html><html><body><div id='root'></div></body></html>");
      }
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Glitch AI Server running at http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("Server listen error:", err);
  });
}

startServer().catch((err) => {
  console.error("Critical server startup failure:", err);
  process.exit(1);
});
