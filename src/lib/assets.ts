import glitchEmblemSrc from '../assets/glitch-emblem.png';
import glitchLogoSrc from '../assets/glitch-logo.png';

export const GLITCH_EMBLEM_SRC = glitchEmblemSrc;
export const GLITCH_LOGO_SRC = glitchLogoSrc;

export function syncStandaloneFavicon(): void {
  if (typeof document === 'undefined') return;
  try {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = GLITCH_EMBLEM_SRC;
  } catch {
    // ignore
  }
}
