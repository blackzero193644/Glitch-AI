import React, { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import { Check, Code2, Copy, Eye, Maximize2, Minimize2, RotateCw, X } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

const PREVIEWABLE_LANGS = new Set([
  'html',
  'htm',
  'svg',
  'css',
  'js',
  'javascript',
  'jsx',
  'tsx',
  'react',
]);

function detectPreviewType(language: string, code: string): string | null {
  const norm = (language || '').trim().toLowerCase();
  if (PREVIEWABLE_LANGS.has(norm)) return norm;

  const trimmed = code.trim();
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return 'html';
  }
  if (/^<svg[\s>]/i.test(trimmed) && trimmed.includes('</svg>')) {
    return 'svg';
  }
  if (
    (norm === 'code' || norm === 'xml' || norm === 'text') &&
    /^<(?:div|section|main|header|article|form|table|style|canvas)\b/i.test(trimmed) &&
    /<\/[a-z]+>/i.test(trimmed)
  ) {
    return 'html';
  }
  return null;
}

function escapeClosingScript(raw: string): string {
  return raw.replace(/<\/script>/gi, '<\\/script>');
}

function buildPreviewDocument(previewLang: string, rawCode: string): string {
  const code = rawCode.trim();

  if (previewLang === 'svg') {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;padding:16px;min-height:100vh;box-sizing:border-box;background:#070b18;display:flex;align-items:center;justify-content:center;color:#e2e8f0;font-family:system-ui,sans-serif;}
  svg{max-width:100%;max-height:85vh;height:auto;display:block;}
</style>
</head>
<body>${escapeClosingScript(code)}</body>
</html>`;
  }

  if (previewLang === 'css') {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body{margin:0;padding:20px;font-family:system-ui,-apple-system,sans-serif;background:#090d1e;color:#e2e8f0;}
  ${code}
</style>
</head>
<body>
  <div class="container card box wrapper panel" style="max-width:560px;margin:0 auto;padding:20px;border-radius:14px;border:1px solid rgba(148,163,184,0.22);">
    <h2 class="title heading">Live CSS Preview</h2>
    <p class="text subtitle description">Sample card, typography, grid, and interactive buttons styled by your CSS rules.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
      <button class="btn button primary">Primary Action</button>
      <button class="btn button secondary">Secondary</button>
      <span class="badge tag pill">Badge</span>
    </div>
  </div>
</body>
</html>`;
  }

  if (previewLang === 'js' || previewLang === 'javascript') {
    const safeJs = escapeClosingScript(code);
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;padding:14px;background:#050814;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;}
  #app{margin-bottom:12px;}
  #console{border:1px solid #1e294b;background:#090d1f;border-radius:10px;padding:10px;min-height:90px;white-space:pre-wrap;word-break:break-word;}
  .log{color:#cbd5e1;padding:2px 0;border-bottom:1px solid rgba(30,41,75,0.45);}
  .warn{color:#fbbf24;padding:2px 0;}
  .err{color:#fb7185;padding:2px 0;}
  .empty{color:#64748b;font-style:italic;}
</style>
</head>
<body>
  <div id="app"></div>
  <div id="console"><div class="empty">Console Output:</div></div>
  <script>
    (function(){
      var box = document.getElementById('console');
      var cleared = false;
      function appendLine(cls, args) {
        if (!cleared) { box.innerHTML = ''; cleared = true; }
        var row = document.createElement('div');
        row.className = cls;
        var parts = Array.prototype.slice.call(args).map(function(a) {
          if (typeof a === 'object' && a !== null) {
            try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
          }
          return String(a);
        });
        row.textContent = parts.join(' ');
        box.appendChild(row);
      }
      console.log = function(){ appendLine('log', arguments); };
      console.info = function(){ appendLine('log', arguments); };
      console.warn = function(){ appendLine('warn', arguments); };
      console.error = function(){ appendLine('err', arguments); };
      window.addEventListener('error', function(e){
        appendLine('err', ['RuntimeError: ' + (e.message || 'Unknown error')]);
      });
      try {
        ${safeJs}
      } catch (err) {
        console.error(err && err.message ? err.message : String(err));
      }
    })();
  </script>
</body>
</html>`;
  }

  if (previewLang === 'jsx' || previewLang === 'tsx' || previewLang === 'react') {
    // Strip ES module imports/exports cleanly so Babel browser transform can mount the component
    let transformed = code
      .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/^\s*export\s+default\s+function\s+([A-Za-z0-9_]+)/gm, 'function $1')
      .replace(/^\s*export\s+default\s+/gm, 'const __GlitchExported = ')
      .replace(/^\s*export\s+(const|let|var|function|class)\s+/gm, '$1 ');

    const compMatch =
      transformed.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/) ||
      transformed.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=/) ||
      transformed.match(/class\s+([A-Z][A-Za-z0-9_]*)\s+/);
    const hasExportConst = /const\s+__GlitchExported\s*=/.test(transformed);
    const mountTarget = hasExportConst ? '__GlitchExported' : compMatch?.[1] || '';
    const safeTransformed = escapeClosingScript(transformed);

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
<style>
  html,body{margin:0;padding:16px;background:#070b18;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;}
  #err{color:#fda4af;background:rgba(136,19,55,0.25);border:1px solid rgba(244,63,94,0.35);padding:10px;border-radius:8px;font-family:monospace;font-size:12px;display:none;white-space:pre-wrap;}
</style>
</head>
<body>
  <div id="root"></div>
  <pre id="err"></pre>
  <script>
    window.addEventListener('error', function(e){
      var el = document.getElementById('err');
      el.style.display = 'block';
      el.textContent = e.message || 'Preview error';
    });
    if (!window.React || !window.ReactDOM || !window.Babel) {
      var el = document.getElementById('err');
      el.style.display = 'block';
      el.textContent = 'Interactive React preview requires network access to load preview runtime.';
    } else {
      try {
        var { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment } = React;
        var userSrc = ${JSON.stringify(safeTransformed)};
        var footer = ${JSON.stringify(
          mountTarget
            ? `\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${mountTarget}));`
            : `\n// Try mounting raw JSX expression if no named component detected\n`
        )};
        var compiled = Babel.transform(userSrc + footer, { presets: ['react', 'typescript'] }).code;
        (0, eval)(compiled);
      } catch (err) {
        var el = document.getElementById('err');
        el.style.display = 'block';
        el.textContent = err && err.message ? err.message : String(err);
      }
    }
  </script>
</body>
</html>`;
  }

  // HTML / HTM
  if (/<!doctype\s+html/i.test(code) || /<html[\s>]/i.test(code)) {
    return code;
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;background:#ffffff;color:#0f172a;box-sizing:border-box;}
</style>
</head>
<body>${code}</body>
</html>`;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose-glitch text-slate-100 text-[15px] leading-relaxed break-words space-y-3">
      <Markdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            const codeText = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code
                  className="bg-[#0b1024] text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/25 font-mono text-[13px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match ? match[1] : 'code'} code={codeText} />
            );
          },
          p({ children }) {
            return <p className="leading-relaxed mb-3 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 space-y-1.5 my-2.5 marker:text-cyan-400">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 space-y-1.5 my-2.5 marker:text-fuchsia-400">{children}</ol>;
          },
          li({ children }) {
            return <li className="pl-1 leading-relaxed">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold text-white tracking-tight mt-4 mb-2 pb-1 border-b border-[#1d284b]">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold text-white tracking-tight mt-3 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-cyan-200 mt-2.5 mb-1.5">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-cyan-500 bg-cyan-950/15 pl-4 py-1.5 my-3 text-slate-300 italic rounded-r">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-800">
                <table className="w-full text-left border-collapse text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-slate-900/90 text-blue-200 border-b border-slate-800">{children}</thead>;
          },
          th({ children }) {
            return <th className="p-2.5 font-medium">{children}</th>;
          },
          td({ children }) {
            return <td className="p-2.5 border-t border-slate-800/60 text-slate-300">{children}</td>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-white">{children}</strong>;
          },
          hr() {
            return <hr className="border-slate-800 my-4" />;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const previewLang = useMemo(() => detectPreviewType(language, code), [language, code]);
  const previewSrcDoc = useMemo(() => {
    if (!previewLang || (viewMode !== 'preview' && !isFullscreen)) return '';
    return buildPreviewDocument(previewLang, code);
  }, [previewLang, viewMode, isFullscreen, code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="my-3 rounded-lg overflow-hidden border border-slate-800/90 bg-[#050914] shadow-lg">
        <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 bg-[#0a1124] border-b border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] uppercase tracking-wider text-blue-400 font-semibold">
              {language}
            </span>

            {previewLang && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#04060f] border border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode('code')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    viewMode === 'code'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  <span>Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    viewMode === 'preview'
                      ? 'bg-fuchsia-500/20 text-fuchsia-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {previewLang && viewMode === 'preview' && (
              <>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="p-1 rounded bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Reload preview"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="p-1 rounded bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Open fullscreen preview"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-colors text-xs font-medium cursor-pointer"
              title="Copy code"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {previewLang && viewMode === 'preview' ? (
          <div className="bg-[#070b18] w-full">
            <iframe
              key={`inline-${reloadKey}`}
              title={`${language} live preview`}
              sandbox="allow-scripts"
              srcDoc={previewSrcDoc}
              className="w-full h-80 sm:h-96 border-0 bg-white/5"
            />
          </div>
        ) : (
          <div className="p-3.5 overflow-x-auto text-[13.5px] font-mono leading-relaxed text-slate-200">
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>

      {isFullscreen && previewLang && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-3 sm:p-6">
          <div className="flex items-center justify-between px-4 py-2.5 rounded-t-xl bg-[#0a1124] border border-slate-800">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-fuchsia-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                {language} Live Preview
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reload</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/70 text-xs text-slate-200 cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit</span>
                <X className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          </div>
          <iframe
            key={`full-${reloadKey}`}
            title={`${language} fullscreen preview`}
            sandbox="allow-scripts"
            srcDoc={previewSrcDoc}
            className="flex-1 w-full rounded-b-xl border-x border-b border-slate-800 bg-[#070b18]"
          />
        </div>
      )}
    </>
  );
};

