import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { isStandaloneBuild } from '../lib/api';

const THREE_MINUTES_MS = 3 * 60 * 1000;

const SOCIAL_BAR_SRC = 'https://bauval.org/14/b631e514203a52f206940e4c0a36cca5';
const POPUNDER_SRC = 'https://abscloud.org/1/cf51252f4694c42ee0ef85fb16b90bd5';
const NATIVE_BANNER_SRC = 'https://bauval.org/21/ef798aec983e8a53c7e55e1aef36636b';

function buildAdFrameHtml(
  key: '365b94b3096fc9710412796d18413765' | '7531970a68a9bff574b33b33dd3f64d6',
  width: number,
  height: number
): string {
  const lt = '\x3c';
  return (
    `${lt}!doctype html>${lt}html lang="en">${lt}head>${lt}meta charset="utf-8" />` +
    `${lt}style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center;}${lt}/style>` +
    `${lt}/head>${lt}body>` +
    `${lt}script>window.atOptions={key:'${key}',format:'iframe',height:${height},width:${width},params:{}};${lt}/script>` +
    `${lt}script src="https://bauval.org/22/${key}">${lt}/script>` +
    `${lt}/body>${lt}/html>`
  );
}

interface AdSlotProps {
  className?: string;
}

/**
 * Global Social Bar + Popunder controller.
 * Loads on mount and re-triggers cleanly every 3 minutes so impressions stay active
 * even after a user closes or dismisses an overlay.
 */
export const GlobalAdScripts: React.FC = () => {
  useEffect(() => {
    const injectTaggedScript = (id: string, src: string) => {
      const existing = document.getElementById(id);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      const script = document.createElement('script');
      script.id = id;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.src = src;
      document.body.appendChild(script);
    };

    const triggerGlobalAds = () => {
      injectTaggedScript('glitch-ad-social-bar', SOCIAL_BAR_SRC);
      injectTaggedScript('glitch-ad-popunder', POPUNDER_SRC);
    };

    triggerGlobalAds();
    const intervalId = window.setInterval(triggerGlobalAds, THREE_MINUTES_MS);

    return () => {
      window.clearInterval(intervalId);
      const s = document.getElementById('glitch-ad-social-bar');
      if (s && s.parentNode) s.parentNode.removeChild(s);
      const p = document.getElementById('glitch-ad-popunder');
      if (p && p.parentNode) p.parentNode.removeChild(p);
    };
  }, []);

  return null;
};

/**
 * Native Banner (bauval.org/21/ef798aec983e8a53c7e55e1aef36636b).
 * Dismissible with a 3-minute reappear timer and automatic 3-minute refresh.
 */
export const NativeBannerAd: React.FC<AdSlotProps> = ({ className = '' }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [cycle, setCycle] = useState(0);

  // When closed, automatically reappear after 3 minutes
  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => {
      setCycle((c) => c + 1);
      setVisible(true);
    }, THREE_MINUTES_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  // While visible, refresh cleanly every 3 minutes for continuous impressions
  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => {
      setCycle((c) => c + 1);
    }, THREE_MINUTES_MS);
    return () => window.clearInterval(interval);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const host = hostRef.current;
    if (!host) return;

    const container = host.querySelector<HTMLDivElement>('#container-ef798aec983e8a53c7e55e1aef36636b');
    if (container) {
      container.innerHTML = '';
    }

    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.src = NATIVE_BANNER_SRC;
    host.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [visible, cycle]);

  if (!visible) return null;

  return (
    <div
      ref={hostRef}
      className={`relative rounded-xl border border-[#192241]/75 bg-[#060914]/75 px-3 py-2 overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-slate-500">Sponsored</span>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
          title="Close ad (returns in 3m)"
          aria-label="Close ad"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div id="container-ef798aec983e8a53c7e55e1aef36636b" />
    </div>
  );
};

/**
 * Compact 320x50 Mobile/Workspace Banner (key: 7531970a68a9bff574b33b33dd3f64d6).
 * Uses same-origin /ad-frame.html so atOptions & document.write execute natively.
 * Reappears 3 minutes after close and refreshes every 3 minutes.
 */
export const Banner320x50Ad: React.FC<AdSlotProps> = ({ className = '' }) => {
  const [visible, setVisible] = useState(true);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => {
      setCycle((c) => c + 1);
      setVisible(true);
    }, THREE_MINUTES_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => {
      setCycle((c) => c + 1);
    }, THREE_MINUTES_MS);
    return () => window.clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={`w-full flex justify-center px-2 ${className}`}>
      <div className="relative inline-flex items-center gap-1.5 rounded-lg border border-[#192241]/80 bg-[#060914]/80 px-1.5 py-1 max-w-full overflow-hidden">
        <iframe
          key={`320x50_${cycle}`}
          title="Sponsored Banner"
          {...(isStandaloneBuild()
            ? { srcDoc: buildAdFrameHtml('7531970a68a9bff574b33b33dd3f64d6', 320, 50) }
            : { src: `/ad-frame.html?key=7531970a68a9bff574b33b33dd3f64d6&r=${cycle}` })}
          width={320}
          height={50}
          scrolling="no"
          className="w-[320px] max-w-full h-[50px] border-0 rounded overflow-hidden bg-transparent block"
        />
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 transition-colors cursor-pointer shrink-0"
          title="Close banner (returns in 3m)"
          aria-label="Close banner"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

/**
 * 300x250 Display Banner (key: 365b94b3096fc9710412796d18413765).
 * Uses same-origin /ad-frame.html so atOptions & document.write execute natively.
 * Reappears 3 minutes after close and refreshes every 3 minutes.
 */
export const Banner300x250Ad: React.FC<AdSlotProps> = ({ className = '' }) => {
  const [visible, setVisible] = useState(true);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => {
      setCycle((c) => c + 1);
      setVisible(true);
    }, THREE_MINUTES_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => {
      setCycle((c) => c + 1);
    }, THREE_MINUTES_MS);
    return () => window.clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`rounded-xl border border-[#192241]/80 bg-[#060914]/80 p-2 flex flex-col items-center shrink-0 ${className}`}
    >
      <div className="w-full flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-slate-500">Sponsored</span>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
          title="Close ad (returns in 3m)"
          aria-label="Close ad"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <iframe
        key={`300x250_${cycle}`}
        title="Sponsored Display"
        {...(isStandaloneBuild()
          ? { srcDoc: buildAdFrameHtml('365b94b3096fc9710412796d18413765', 300, 250) }
          : { src: `/ad-frame.html?key=365b94b3096fc9710412796d18413765&r=${cycle}` })}
        width={300}
        height={250}
        scrolling="no"
        className="w-[300px] h-[250px] border-0 rounded-lg overflow-hidden bg-transparent block"
      />
    </div>
  );
};
