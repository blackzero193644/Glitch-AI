import { apiFetch } from './api';

// Glitch AI 4K Ultra-HD Multi-Tier Browser Engine (100% Key-Free — zero Pollinations)

const CHAT_MODEL_POOL = [
  'x-ai/grok-4.7',
  'claude-sonnet-5-5',
  'deepseek/deepseek-v4.1-flash',
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'deepseek/deepseek-v4-pro',
];

function isHttpOrigin(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

function getPuter(): any {
  if (!isHttpOrigin()) return null;
  return typeof window !== 'undefined' ? (window as any).puter : null;
}

export function isPuterSignedIn(): boolean {
  try {
    if (!isHttpOrigin()) return false;
    const p = getPuter();
    return Boolean(p?.auth?.isSignedIn?.());
  } catch {
    return false;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (!blob || blob.size < 4096) return null;
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function runBrowserGradioNode(
  baseUrl: string,
  endpoint: string,
  data: any[],
  timeoutMs: number = 22000
): Promise<{ dataUrl: string | null; quotaLimited: boolean }> {
  const startedAt = Date.now();
  try {
    const submitRes = await fetch(`${baseUrl}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(7000),
    });
    if (!submitRes.ok) return { dataUrl: null, quotaLimited: false };
    const submitJson = await submitRes.json().catch(() => null);
    const eventId = submitJson?.event_id;
    if (!eventId) return { dataUrl: null, quotaLimited: false };

    const sseRes = await fetch(`${baseUrl}/gradio_api/call/${endpoint}/${eventId}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!sseRes.ok) return { dataUrl: null, quotaLimited: false };
    const sseText = await sseRes.text();
    const completeIdx = sseText.indexOf('event: complete');
    if (completeIdx === -1) {
      const elapsedMs = Date.now() - startedAt;
      const quotaLimited =
        sseText.includes('event: error') &&
        (/zerogpu|quota/i.test(sseText) || elapsedMs < 3500);
      return { dataUrl: null, quotaLimited };
    }

    const after = sseText.slice(completeIdx);
    const dataLine = after.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) return { dataUrl: null, quotaLimited: false };

    const parsed = JSON.parse(dataLine.slice(6));
    const fileUrl: string | undefined =
      parsed?.[0]?.url ||
      parsed?.[0]?.[0]?.image?.url ||
      parsed?.[0]?.[0]?.url ||
      (typeof parsed?.[0]?.path === 'string'
        ? `${baseUrl}/gradio_api/file=${parsed[0].path}`
        : undefined);

    if (!fileUrl || typeof fileUrl !== 'string') {
      return { dataUrl: null, quotaLimited: false };
    }

    const imgRes = await fetch(fileUrl, { signal: AbortSignal.timeout(12000) });
    if (!imgRes.ok) return { dataUrl: null, quotaLimited: false };
    const blob = await imgRes.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, quotaLimited: false };
  } catch {
    return { dataUrl: null, quotaLimited: false };
  }
}

let cachedG4fImageModels: { ts: number; models: string[] } = { ts: 0, models: [] };

async function getLiveOpenBrowserImageModels(): Promise<string[]> {
  const defaults = [
    'Airforce:nano-banana-2',
    'Arena:flux-3-image-klein',
    'srv_mrdypihj16e8b1776409:black-forest-labs/flux.2-klein-4b',
    'srv_mrdypihj16e8b1776409:community/sharktide/inferenceport-ai-lightning-image-turbo',
  ];

  if (Date.now() - cachedG4fImageModels.ts < 120000 && cachedG4fImageModels.models.length > 0) {
    return cachedG4fImageModels.models;
  }

  try {
    const res = await fetch('https://g4f.space/v1/models', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return defaults;
    const json = await res.json().catch(() => null);
    const arr: any[] = Array.isArray(json?.data) ? json.data : [];
    const discovered = arr
      .map((m) => String(m?.id || m?.model || ''))
      .filter(
        (id) =>
          id &&
          !id.toLowerCase().includes('pollinations') &&
          /flux|nano-banana|image-turbo|imagen|sdxl|seedream|krea|z-image/i.test(id)
      );

    const ordered = Array.from(
      new Set([
        ...discovered.filter((id) => /nano-banana|flux-3|flux\.2|flux/i.test(id)),
        ...defaults,
        ...discovered,
      ])
    ).slice(0, 6);

    cachedG4fImageModels = { ts: Date.now(), models: ordered };
    return ordered;
  } catch {
    return defaults;
  }
}

async function runOpenBrowserRouterImages(
  prompt: string,
  wGen: number,
  hGen: number
): Promise<string | null> {
  const models = await getLiveOpenBrowserImageModels();
  const sizeStr = `${wGen}x${hGen}`;

  for (const model of models) {
    try {
      const res = await fetch('https://g4f.space/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: sizeStr,
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(22000),
      });
      if (!res.ok) continue;

      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (ctype.startsWith('image/')) {
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) return dataUrl;
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!data) continue;

      const b64: string | undefined = data?.data?.[0]?.b64_json || data?.image;
      if (b64 && typeof b64 === 'string' && b64.length > 2000) {
        return b64.startsWith('data:image/') ? b64 : `data:image/png;base64,${b64}`;
      }

      const rawUrl: string | undefined = data?.data?.[0]?.url || data?.url;
      if (rawUrl && typeof rawUrl === 'string' && !rawUrl.toLowerCase().includes('pollinations')) {
        if (rawUrl.startsWith('data:image/')) return rawUrl;
        if (/^https?:\/\//i.test(rawUrl)) {
          const imgRes = await fetch(rawUrl, { signal: AbortSignal.timeout(12000) }).catch(() => null);
          if (imgRes?.ok) {
            const dataUrl = await blobToDataUrl(await imgRes.blob());
            if (dataUrl) return dataUrl;
          }
        }
      }
    } catch {
      // try next model cleanly
    }
  }
  return null;
}

let puterLoadPromise: Promise<any> | null = null;

async function ensurePuterLoaded(): Promise<any> {
  if (!isHttpOrigin()) return null;
  if (typeof window === 'undefined') return null;
  if ((window as any).puter?.ai?.txt2img) return (window as any).puter;

  if (!puterLoadPromise) {
    puterLoadPromise = new Promise((resolve) => {
      try {
        const existing = document.querySelector('script[src*="js.puter.com/v2"]');
        if (existing) {
          const checkTimer = setInterval(() => {
            if ((window as any).puter?.ai?.txt2img) {
              clearInterval(checkTimer);
              resolve((window as any).puter);
            }
          }, 150);
          setTimeout(() => {
            clearInterval(checkTimer);
            resolve((window as any).puter || null);
          }, 5000);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://js.puter.com/v2/';
        script.async = true;
        script.onload = () => resolve((window as any).puter || null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      } catch {
        resolve(null);
      }
    });
  }
  return puterLoadPromise;
}

async function runPuterBrowserImageFallback(prompt: string): Promise<string | null> {
  if (!isHttpOrigin()) return null;
  const p = await ensurePuterLoaded();
  if (!p?.ai?.txt2img) return null;

  const attempts: Array<Record<string, any> | undefined> = [
    { model: 'black-forest-labs/FLUX.1-dev' },
    { model: 'black-forest-labs/FLUX.1-schnell' },
    { model: 'gpt-image-1' },
    undefined,
  ];

  for (const opts of attempts) {
    try {
      const imgEl: HTMLImageElement = opts
        ? await p.ai.txt2img(prompt, opts)
        : await p.ai.txt2img(prompt);
      if (!imgEl || !imgEl.src) continue;

      await new Promise<void>((resolve) => {
        if (imgEl.complete && imgEl.naturalWidth > 0) return resolve();
        imgEl.onload = () => resolve();
        imgEl.onerror = () => resolve();
        setTimeout(resolve, 6000);
      });

      if (imgEl.src.startsWith('data:image/')) return imgEl.src;
      if (/^https?:\/\//i.test(imgEl.src)) {
        const fetched = await fetch(imgEl.src, { signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (fetched?.ok) {
          const dataUrl = await blobToDataUrl(await fetched.blob());
          if (dataUrl) return dataUrl;
        }
      }
      if (imgEl.naturalWidth > 64 && imgEl.naturalHeight > 64) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            ctx.drawImage(imgEl, 0, 0);
            return canvas.toDataURL('image/png');
          } catch {
            return imgEl.src;
          }
        }
      }
    } catch {
      // try next option silently
    }
  }
  return null;
}

async function runBrowserStableHordeImage(
  finalPrompt: string,
  neg: string,
  targetWidth: number,
  targetHeight: number
): Promise<string | null> {
  try {
    const ratio = targetWidth / Math.max(1, targetHeight);
    let w = 512;
    let h = 512;
    if (ratio > 1.35) {
      w = 768;
      h = 512;
    } else if (ratio < 0.74) {
      w = 512;
      h = 768;
    } else if (ratio > 1.1) {
      w = 640;
      h = 512;
    } else if (ratio < 0.9) {
      w = 512;
      h = 640;
    }

    const submitRes = await fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: '0000000000',
        'Client-Agent': 'GlitchAI:1.0:alfateh@cc.cc',
      },
      body: JSON.stringify({
        prompt: `${finalPrompt} ### ${neg}`,
        params: {
          width: w,
          height: h,
          steps: 10,
          n: 1,
          sampler_name: 'k_euler_a',
          cfg_scale: 7,
        },
        nsfw: false,
        censor_nsfw: true,
        r2: true,
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!submitRes.ok) return null;
    const submitJson = await submitRes.json().catch(() => null);
    const id = submitJson?.id;
    if (!id) return null;

    const deadline = Date.now() + 26000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1800));
      const statusRes = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`, {
        headers: { 'Client-Agent': 'GlitchAI:1.0:alfateh@cc.cc' },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (!statusRes?.ok) continue;
      const statusJson = await statusRes.json().catch(() => null);
      if (statusJson?.faulted) return null;
      if (statusJson?.done && Array.isArray(statusJson.generations) && statusJson.generations[0]?.img) {
        const imgVal: string = statusJson.generations[0].img;
        if (imgVal.startsWith('data:image/')) return imgVal;
        if (imgVal.startsWith('http')) {
          const dl = await fetch(imgVal, { signal: AbortSignal.timeout(10000) }).catch(() => null);
          if (dl?.ok) {
            const b64 = await blobToDataUrl(await dl.blob());
            if (b64) return b64;
          }
          return imgVal;
        }
        return `data:image/webp;base64,${imgVal}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function masterTo4kInBrowser(
  dataUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  // Prefer Glitch AI server-side Lanczos3 sharp 4K UHD mastering
  try {
    const procRes = await apiFetch('/api/process-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: dataUrl,
        targetWidth,
        targetHeight,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (procRes.ok) {
      const procData = await procRes.json().catch(() => null);
      if (procData?.imageUrl) return procData.imageUrl;
    }
  } catch {
    // Fall back cleanly to browser high-quality canvas mastering
  }

  try {
    return await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const srcRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
        const dstRatio = targetWidth / Math.max(1, targetHeight);
        let sx = 0;
        let sy = 0;
        let sw = img.naturalWidth;
        let sh = img.naturalHeight;
        if (srcRatio > dstRatio) {
          sw = img.naturalHeight * dstRatio;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = img.naturalWidth / dstRatio;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.94));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  } catch {
    return dataUrl;
  }
}

export async function generateClientImageFallback(
  prompt: string,
  targetWidth: number,
  targetHeight: number,
  enhancedPrompt?: string,
  negatives?: string,
  genWidth?: number,
  genHeight?: number,
  sdWidth?: number,
  sdHeight?: number,
  zImageEnum?: string,
  qwenRatio?: string,
  onProgress?: (label: string) => void
): Promise<string | null> {
  if (!isHttpOrigin()) return null;

  const finalPrompt =
    enhancedPrompt ||
    `${prompt}, ultra-sharp 4K photorealistic photography, crisp fine surface textures, natural volumetric lighting, masterpiece`;
  const seed = Math.floor(Math.random() * 90000000) + 1000000;
  const wGen = genWidth || Math.min(1344, Math.max(768, Math.round((targetWidth / 2.8) / 64) * 64));
  const hGen = genHeight || Math.min(1344, Math.max(768, Math.round((targetHeight / 2.8) / 64) * 64));
  const wSd = sdWidth || Math.min(1280, wGen);
  const hSd = sdHeight || Math.min(1280, hGen);
  const neg =
    negatives ||
    'blurry, low quality, lowres, deformed face, distorted eyes, pixelated, over-smoothed skin, watermark, text, cropped head';

  let rawDataUrl: string | null = null;
  let quotaBlocks = 0;

  // TIER 1: High-Availability Key-Free Non-ZeroGPU Nodes + Low-Step Neural Cluster
  onProgress?.('Synthesizing 4K Neural Diffusion...');
  const flashAttempt = await runBrowserGradioNode(
    'https://kingnish-sdxl-flash.hf.space',
    'run',
    [finalPrompt, neg, true, seed, Math.min(1024, wSd), Math.min(1024, hSd), 3, 8, true],
    18000
  );
  if (flashAttempt.dataUrl) rawDataUrl = flashAttempt.dataUrl;

  if (!rawDataUrl) {
    const n1 = await runBrowserGradioNode(
      'https://tongyi-mai-z-image-turbo.hf.space',
      'generate',
      [finalPrompt, zImageEnum || '1536x1536 ( 1:1 )', seed, 8, 3, true, []],
      18000
    );
    if (n1.dataUrl) rawDataUrl = n1.dataUrl;
    else if (n1.quotaLimited) quotaBlocks++;
  }

  if (!rawDataUrl && quotaBlocks < 2) {
    const n2 = await runBrowserGradioNode(
      'https://black-forest-labs-flux-2-klein-9b.hf.space',
      'generate',
      [finalPrompt, [], 'Distilled (4 steps)', seed, true, wGen, hGen, 4, 1, true],
      18000
    );
    if (n2.dataUrl) rawDataUrl = n2.dataUrl;
    else if (n2.quotaLimited) quotaBlocks++;
  }

  if (!rawDataUrl && quotaBlocks < 2) {
    const n3 = await runBrowserGradioNode(
      'https://black-forest-labs-flux-1-schnell.hf.space',
      'infer',
      [finalPrompt, seed, true, wGen, hGen, 4],
      18000
    );
    if (n3.dataUrl) rawDataUrl = n3.dataUrl;
    else if (n3.quotaLimited) quotaBlocks++;
  }

  if (!rawDataUrl && quotaBlocks < 2) {
    const n4 = await runBrowserGradioNode(
      'https://black-forest-labs-flux-1-krea-dev.hf.space',
      'infer',
      [finalPrompt, seed, true, wGen, hGen, 4.5, 12],
      20000
    );
    if (n4.dataUrl) rawDataUrl = n4.dataUrl;
    else if (n4.quotaLimited) quotaBlocks++;
  }

  if (!rawDataUrl && quotaBlocks < 2) {
    const n7 = await runBrowserGradioNode(
      'https://qwen-qwen-image.hf.space',
      'infer',
      [finalPrompt, seed, true, qwenRatio || '1:1', 4, 16, true],
      20000
    );
    if (n7.dataUrl) rawDataUrl = n7.dataUrl;
    else if (n7.quotaLimited) quotaBlocks++;
  }

  // TIER 2: Distributed Key-Free Stable Diffusion Worker Grid
  if (!rawDataUrl) {
    onProgress?.('Rendering via Glitch AI Distributed Cluster...');
    rawDataUrl = await runBrowserStableHordeImage(finalPrompt, neg, targetWidth, targetHeight);
  }

  // TIER 3: Zero-ZeroGPU Open Web Router directly from visitor IP
  if (!rawDataUrl) {
    onProgress?.('Routing via Glitch AI High-Availability Node...');
    rawDataUrl = await runOpenBrowserRouterImages(finalPrompt, wGen, hGen);
  }

  // TIER 4: Browser Key-Free AI Engine Backup (HTTP/HTTPS only)
  if (!rawDataUrl) {
    onProgress?.('Completing on Glitch AI Backup Renderer...');
    rawDataUrl = await runPuterBrowserImageFallback(finalPrompt);
  }

  if (!rawDataUrl) return null;

  onProgress?.('Mastering 4K Ultra-HD Resolution...');
  return await masterTo4kInBrowser(rawDataUrl, targetWidth, targetHeight);
}

export async function trySilentPuterChat(
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const p = getPuter();
  if (p?.ai?.chat && isPuterSignedIn()) {
    for (const model of CHAT_MODEL_POOL.slice(0, 3)) {
      try {
        const res = await p.ai.chat(messages, { model });
        const text =
          typeof res === 'string'
            ? res
            : res?.message?.content?.[0]?.text || res?.message?.content || res?.text;
        if (typeof text === 'string' && text.trim()) {
          return text.trim();
        }
      } catch {
        // try next silently
      }
    }
  }

  // Key-free browser fallback for standalone/offline-backend deployments
  try {
    const recent = messages
      .filter((m) => typeof m?.content === 'string' && m.content.trim() && m.content.trim() !== '...')
      .slice(-5)
      .map((m) => `${m.role === 'assistant' || m.role === 'model' ? 'Assistant' : 'User'}: ${m.content.trim().slice(0, 700)}`)
      .join('\n');

    const prompt = [
      'System: You are Glitch AI v1.0, created by Al-Fateh (contact: alfateh@cc.cc). Provide accurate, clear answers matching the user language and script.',
      recent,
      'Assistant:',
    ]
      .filter(Boolean)
      .join('\n\n');

    const submitRes = await fetch('https://stablehorde.net/api/v2/generate/text/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: '0000000000',
        'Client-Agent': 'GlitchAI:1.0:alfateh@cc.cc',
      },
      body: JSON.stringify({
        prompt,
        params: {
          max_length: 320,
          max_context_length: 2048,
          temperature: 0.45,
          top_p: 0.92,
          stop_sequence: ['\nUser:', 'User:', '\nHuman:', 'Human:', '<|im_end|>', '<|eot_id|>', '</s>'],
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!submitRes.ok) return null;
    const submitJson = await submitRes.json().catch(() => null);
    const id = submitJson?.id;
    if (!id) return null;

    const deadline = Date.now() + 14000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1100));
      const statusRes = await fetch(`https://stablehorde.net/api/v2/generate/text/status/${id}`, {
        headers: { 'Client-Agent': 'GlitchAI:1.0:alfateh@cc.cc' },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null);
      if (!statusRes?.ok) continue;
      const statusJson = await statusRes.json().catch(() => null);
      if (statusJson?.faulted) return null;
      if (statusJson?.done && Array.isArray(statusJson.generations) && statusJson.generations[0]?.text) {
        const clean = String(statusJson.generations[0].text)
          .replace(/(?:<\|im_end\|>|<\|eot_id\|>|<\/s>|\nUser:[\s\S]*|\nHuman:[\s\S]*)/gi, '')
          .trim();
        if (clean) return clean;
        return null;
      }
    }
  } catch {}
  return null;
}
