export interface StandaloneRuntimeConfig {
  enabled?: boolean;
  apiBaseUrl?: string;
}

declare global {
  interface Window {
    __GLITCH_STANDALONE__?: StandaloneRuntimeConfig;
  }
}

const PRIMARY_PUBLIC_API_ORIGIN = 'https://the-glitch-ai.netlify.app';

export function isStandaloneBuild(): boolean {
  return Boolean(typeof window !== 'undefined' && window.__GLITCH_STANDALONE__?.enabled);
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol;
  const isWebOrigin = proto === 'http:' || proto === 'https:';
  // When hosted on any live web domain (e.g. Netlify, AI Studio, custom domain), prefer same-origin first
  if (isWebOrigin && !isStandaloneBuild()) {
    return '';
  }
  const raw = window.__GLITCH_STANDALONE__?.apiBaseUrl;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/+$/, '');
  }
  return isWebOrigin ? '' : PRIMARY_PUBLIC_API_ORIGIN;
}

function getCandidateApiBases(): string[] {
  if (typeof window === 'undefined') return [''];
  const bases: string[] = [];
  const pushUnique = (val: string) => {
    const clean = val.trim().replace(/\/+$/, '');
    if (!bases.includes(clean)) {
      bases.push(clean);
    }
  };

  const proto = window.location.protocol;
  const isWebOrigin = proto === 'http:' || proto === 'https:';
  if (isWebOrigin) {
    pushUnique('');
  }

  const configured = window.__GLITCH_STANDALONE__?.apiBaseUrl?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    pushUnique(configured);
  }

  pushUnique(PRIMARY_PUBLIC_API_ORIGIN);
  return bases;
}

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Resilient API fetch helper:
 * - Uses same-origin `/api/*` first on web domains (`the-glitch-ai.netlify.app`, AI Studio, etc.)
 * - Automatically falls back across configured public Glitch AI API origins if a static host returns HTML 404 or network failure.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const candidates = getCandidateApiBases();
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const base of candidates) {
    const url = base ? `${base}${cleanPath}` : cleanPath;
    try {
      const res = await fetch(url, init);
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      // If a static CDN served an HTML 404/SPA fallback page for /api/*, try the next backend candidate
      if ((res.status === 404 || res.status === 405) && !ctype.includes('application/json')) {
        lastResponse = res;
        continue;
      }
      return res;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw err;
      }
      lastError = err;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('Network connection failed.');
}
