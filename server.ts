import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import {
  analyzeVisionImage,
  cleanErrorMessage,
  CORE_VERIFIED_VOICES,
  createChatSseStream,
  generateFastCallReply,
  generateImageResponse,
  getAllAvailableVoices,
  injectStandaloneRuntimeHtml,
  isServerSideSelfEcho,
  processImageBase64,
  resolvePublicBackendOriginFromHeaders,
  synthesizeSpeechBuffer,
  transcribeAudioBuffer,
} from "./server/aiEngine";

dotenv.config({ override: true });

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "40mb" }));

// Stateless API CORS so standalone exported index.html or custom domains can safely access /api/*
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

app.get("/api/voices", async (_req, res) => {
  try {
    const voices = await getAllAvailableVoices();
    return res.json({ voices });
  } catch {
    return res.json({ voices: CORE_VERIFIED_VOICES });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Glitch AI High-Speed API",
    organization: "Al-Fateh",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/chat/stream", async (req, res) => {
  const { messages, tone, userProfile, useSearch, useMaps } = req.body || {};

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

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const stream = await createChatSseStream(
      { messages: validMessages, tone, userProfile, useSearch, useMaps },
      abortController.signal
    );

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done || abortController.signal.aborted) break;
      if (value) {
        res.write(Buffer.from(value));
        (res as any).flush?.();
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
  } catch (err: any) {
    const userFriendlyMsg = cleanErrorMessage(err);
    console.error("Glitch AI streaming error:", userFriendlyMsg);
    if (!res.headersSent) {
      return res.status(500).json({ error: userFriendlyMsg });
    }
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: userFriendlyMsg })}\n\n`);
      res.end();
    }
  }
});

app.post("/api/vision", async (req, res) => {
  try {
    const { prompt, imageUrl } = req.body || {};
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "An image is required for visual analysis." });
    }
    const text = await analyzeVisionImage(prompt, imageUrl);
    return res.json({ text });
  } catch (err: any) {
    return res.status(500).json({ error: cleanErrorMessage(err) });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "sarah", language = "auto" } = req.body || {};
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
    } = req.body || {};

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

app.post("/api/call", async (req, res) => {
  try {
    const { messages, voice = "sarah", userProfile } = req.body || {};
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

app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType } = req.body || {};
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

app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, aspectRatio, baseImage, negativePrompt } = req.body || {};
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Please enter a descriptive prompt." });
    }
    const payload = await generateImageResponse({ prompt, aspectRatio, baseImage, negativePrompt });
    return res.json(payload);
  } catch (err: any) {
    console.error("Image generation error:", cleanErrorMessage(err));
    return res.status(500).json({ error: "An unexpected error occurred during image generation." });
  }
});

app.post("/api/process-image", async (req, res) => {
  try {
    const { imageBase64, targetWidth = 2160, targetHeight = 2160 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64 payload" });
    }
    const result = await processImageBase64(
      imageBase64,
      Number(targetWidth) || 2160,
      Number(targetHeight) || 2160
    );
    return res.json(result);
  } catch (err: any) {
    console.error("Image processing error:", cleanErrorMessage(err));
    return res.status(500).json({ error: "Image processing failed." });
  }
});

app.post("/api/generate-video", async (_req, res) => {
  return res.status(503).json({
    comingSoon: true,
    version: "1.0",
    error: "Video generation is coming soon! This feature will be available in an upcoming release after Glitch AI v1.0.",
  });
});

app.post("/api/video-status", async (_req, res) => {
  return res.status(503).json({
    comingSoon: true,
    version: "1.0",
    error: "Video generation is coming soon in an upcoming release after Glitch AI v1.0.",
  });
});

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

app.get("/api/export-standalone", async (req, res) => {
  try {
    const rawHtml = await ensureStandaloneHtmlBuilt();
    const apiBaseUrl = resolvePublicBackendOriginFromHeaders({
      host: req.headers.host,
      forwardedHost: req.headers["x-forwarded-host"] as string | undefined,
      forwardedProto: req.headers["x-forwarded-proto"] as string | undefined,
      protocol: req.protocol,
    });

    let emblemB64: string | undefined;
    try {
      const emblemPath = path.resolve(process.cwd(), "public", "assets", "glitch-emblem.png");
      if (fs.existsSync(emblemPath)) {
        emblemB64 = fs.readFileSync(emblemPath).toString("base64");
      }
    } catch {}

    const finalHtml = injectStandaloneRuntimeHtml(rawHtml, apiBaseUrl, emblemB64);

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
