import fs from "fs";
import path from "path";
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
} from "../../server/aiEngine";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

async function readJsonBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  // Support both /api/<route> and /.netlify/functions/api/<route>
  let pathname = url.pathname;
  if (pathname.startsWith("/.netlify/functions/api")) {
    pathname = pathname.slice("/.netlify/functions/api".length) || "/";
  }
  if (!pathname.startsWith("/api/") && pathname !== "/api") {
    pathname = pathname.startsWith("/") ? `/api${pathname}` : `/api/${pathname}`;
  }

  // GET /api/health
  if (req.method === "GET" && pathname === "/api/health") {
    return jsonResponse({
      status: "ok",
      service: "Glitch AI Serverless API",
      organization: "Al-Fateh",
      timestamp: new Date().toISOString(),
    });
  }

  // GET /api/voices
  if (req.method === "GET" && pathname === "/api/voices") {
    try {
      const voices = await getAllAvailableVoices();
      return jsonResponse({ voices });
    } catch {
      return jsonResponse({ voices: CORE_VERIFIED_VOICES });
    }
  }

  // GET /api/export-standalone
  if (req.method === "GET" && pathname === "/api/export-standalone") {
    try {
      const candidatePaths = [
        path.resolve(process.cwd(), "dist-standalone", "index.html"),
        path.resolve(process.cwd(), "dist", "index.html"),
      ];
      let rawHtml: string | null = null;
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          rawHtml = fs.readFileSync(p, "utf8");
          break;
        }
      }
      if (!rawHtml) {
        return jsonResponse({ error: "Standalone index.html package is not present in this build." }, 404);
      }

      const apiBaseUrl = resolvePublicBackendOriginFromHeaders({
        host: req.headers.get("host") || undefined,
        forwardedHost: req.headers.get("x-forwarded-host") || undefined,
        forwardedProto: req.headers.get("x-forwarded-proto") || undefined,
        protocol: url.protocol.replace(":", ""),
      });

      const finalHtml = injectStandaloneRuntimeHtml(rawHtml, apiBaseUrl);
      return new Response(finalHtml, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": 'attachment; filename="index.html"',
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      });
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // POST /api/chat/stream (Native streaming SSE via Netlify Functions v2 Web Response)
  if (req.method === "POST" && pathname === "/api/chat/stream") {
    const body = await readJsonBody(req);
    const { messages, tone, userProfile, useSearch, useMaps } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "Invalid messages array." }, 400);
    }

    const validMessages = messages.filter(
      (m: any) =>
        !m.error &&
        ((typeof m.content === "string" && m.content.trim().length > 0) || Boolean(m.imageUrl))
    );
    if (validMessages.length === 0) {
      return jsonResponse({ error: "No valid user message found." }, 400);
    }

    try {
      const stream = await createChatSseStream(
        { messages: validMessages, tone, userProfile, useSearch, useMaps },
        req.signal
      );

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          ...CORS_HEADERS,
        },
      });
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // POST /api/vision
  if (req.method === "POST" && pathname === "/api/vision") {
    try {
      const { prompt, imageUrl } = await readJsonBody(req);
      if (!imageUrl || typeof imageUrl !== "string") {
        return jsonResponse({ error: "An image is required for visual analysis." }, 400);
      }
      const text = await analyzeVisionImage(prompt, imageUrl);
      return jsonResponse({ text });
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // POST /api/tts
  if (req.method === "POST" && pathname === "/api/tts") {
    try {
      const { text, voice = "sarah", language = "auto" } = await readJsonBody(req);
      if (!text || typeof text !== "string" || !text.trim()) {
        return jsonResponse({ error: "Text is required for speech synthesis." }, 400);
      }
      const result = await synthesizeSpeechBuffer(text, voice, language);
      if (!result) {
        return jsonResponse({ error: "Speech synthesis unavailable right now." }, 503);
      }
      return jsonResponse(result);
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // POST /api/call-audio
  if (req.method === "POST" && pathname === "/api/call-audio") {
    try {
      const {
        audioData,
        mimeType,
        messages = [],
        voice = "sarah",
        userProfile,
        lastAiText = "",
        lastAiEndedAgoMs = 999999,
      } = await readJsonBody(req);

      if (!audioData || typeof audioData !== "string") {
        return jsonResponse({ error: "No audio data provided." }, 400);
      }

      const userText = (await transcribeAudioBuffer(audioData, mimeType)).trim();
      if (!userText) {
        return jsonResponse({ empty: true, userText: "" });
      }

      if (isServerSideSelfEcho(userText, lastAiText, Number(lastAiEndedAgoMs) || 0)) {
        return jsonResponse({ ignoredEcho: true, userText: "" });
      }

      const history = [
        ...(Array.isArray(messages) ? messages : []),
        { role: "user", content: userText },
      ];

      const safeReply = await generateFastCallReply(history, userProfile);
      const speech = await synthesizeSpeechBuffer(safeReply, voice, "auto", true);

      return jsonResponse({
        userText,
        text: safeReply,
        audioBase64: speech?.audioBase64 || null,
        mimeType: speech?.mimeType || "audio/mpeg",
      });
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // POST /api/call
  if (req.method === "POST" && pathname === "/api/call") {
    try {
      const { messages, voice = "sarah", userProfile } = await readJsonBody(req);
      if (!Array.isArray(messages) || messages.length === 0) {
        return jsonResponse({ error: "Conversation history is required." }, 400);
      }
      const safeReply = await generateFastCallReply(messages, userProfile);
      const speech = await synthesizeSpeechBuffer(safeReply, voice, "auto", true);
      return jsonResponse({
        text: safeReply,
        audioBase64: speech?.audioBase64 || null,
        mimeType: speech?.mimeType || "audio/mpeg",
      });
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // POST /api/transcribe
  if (req.method === "POST" && pathname === "/api/transcribe") {
    try {
      const { audioData, mimeType } = await readJsonBody(req);
      if (!audioData || typeof audioData !== "string") {
        return jsonResponse({ error: "No audio data provided." }, 400);
      }
      const text = await transcribeAudioBuffer(audioData, mimeType);
      return jsonResponse({ text });
    } catch {
      return jsonResponse({ error: "Could not transcribe audio. Please try speaking again." }, 500);
    }
  }

  // POST /api/generate-image
  if (req.method === "POST" && pathname === "/api/generate-image") {
    try {
      const { prompt, aspectRatio, baseImage, negativePrompt } = await readJsonBody(req);
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return jsonResponse({ error: "Please enter a descriptive prompt." }, 400);
      }
      const payload = await generateImageResponse({ prompt, aspectRatio, baseImage, negativePrompt });
      return jsonResponse(payload);
    } catch (err: any) {
      console.error("Serverless image generation error:", cleanErrorMessage(err));
      return jsonResponse({ error: "An unexpected error occurred during image generation." }, 500);
    }
  }

  // POST /api/process-image
  if (req.method === "POST" && pathname === "/api/process-image") {
    try {
      const { imageBase64, targetWidth = 1024, targetHeight = 1024 } = await readJsonBody(req);
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return jsonResponse({ error: "Missing imageBase64 payload" }, 400);
      }
      const result = await processImageBase64(
        imageBase64,
        Number(targetWidth) || 1024,
        Number(targetHeight) || 1024
      );
      return jsonResponse(result);
    } catch (err: any) {
      return jsonResponse({ error: cleanErrorMessage(err) }, 500);
    }
  }

  // Video endpoints (Coming Soon)
  if (
    req.method === "POST" &&
    (pathname === "/api/generate-video" || pathname === "/api/video-status" || pathname === "/api/video-download")
  ) {
    return jsonResponse(
      {
        comingSoon: true,
        version: "1.0",
        error: "Video generation is coming soon! This feature will be available in an upcoming release after Glitch AI v1.0.",
      },
      503
    );
  }

  return jsonResponse({ error: `Endpoint not found: ${pathname}` }, 404);
}
