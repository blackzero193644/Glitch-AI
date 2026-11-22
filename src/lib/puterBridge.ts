// Client-side multi-engine fallback bridge (runs silently when user session is active, never exposes model names)

const IMAGE_MODEL_POOL = [
  'x-ai/grok-imagine-image-2.0',
  'black-forest-labs/flux-2-pro',
  'google/gemini-3-pro-image',
  'google/imagen-4.0',
  'openai/gpt-image-2.6-flare',
  'google/gemini-3.1-flash-image',
  'black-forest-labs/flux-2-dev',
  'leonardoai/lucid-origin',
  'qwen/qwen-image',
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-schnell',
  'stabilityai/stable-diffusion-xl-base-1.0',
];

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

export async function generateClientImageFallback(
  prompt: string,
  targetWidth: number,
  targetHeight: number,
  enhancedPrompt?: string
): Promise<string | null> {
  // 1. If user has an active Puter session, try Puter's rich multi-model image pool silently
  const p = getPuter();
  if (p?.ai?.txt2img && isPuterSignedIn()) {
    for (const model of IMAGE_MODEL_POOL.slice(0, 5)) {
      try {
        const imgEl: HTMLImageElement = await p.ai.txt2img(enhancedPrompt || prompt, { model });
        if (imgEl?.src) {
          return imgEl.src;
        }
      } catch {
        // try next model silently
      }
    }
  }

  // 2. Direct browser synthesis via edge image endpoint & clean crop
  const finalPrompt =
    enhancedPrompt ||
    `${prompt}, ultra-realistic 8k photograph, razor-sharp optical focus, natural ambient lighting, crisp textures, masterpiece`;
  const seed = Math.floor(Math.random() * 9000000) + 1000000;
  const genHeight = targetHeight + 52;
  const directUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    finalPrompt
  )}?model=flux-realism&width=${targetWidth}&height=${genHeight}&seed=${seed}&nologo=true&enhance=true&private=true&nofeed=true`;

  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), 20000);
      img.onload = () => {
        clearTimeout(timer);
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(directUrl);
          return;
        }
        const cropH = Math.max(100, img.naturalHeight - 52);
        ctx.drawImage(img, 0, 0, img.naturalWidth, cropH, 0, 0, targetWidth, targetHeight);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch {
          resolve(directUrl);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = directUrl;
    });
  } catch {
    return null;
  }
}

export async function trySilentPuterChat(
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const p = getPuter();
  if (!p?.ai?.chat || !isPuterSignedIn()) return null;

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
  return null;
}
