export interface StandaloneRuntimeConfig {
  enabled?: boolean;
  apiBaseUrl?: string;
}

declare global {
  interface Window {
    __GLITCH_STANDALONE__?: StandaloneRuntimeConfig;
  }
}

export function isStandaloneBuild(): boolean {
  return Boolean(typeof window !== 'undefined' && window.__GLITCH_STANDALONE__?.enabled);
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const raw = window.__GLITCH_STANDALONE__?.apiBaseUrl;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/+$/, '');
  }
  return '';
}

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}
