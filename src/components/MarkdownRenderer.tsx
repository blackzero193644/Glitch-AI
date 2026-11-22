import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose-glitch text-slate-100 text-[15px] leading-relaxed break-words space-y-3">
      <Markdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
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
    <div className="my-3 rounded-lg overflow-hidden border border-slate-800/90 bg-[#050914] shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0a1124] border-b border-slate-800 text-xs text-slate-400">
        <span className="font-mono text-[11px] uppercase tracking-wider text-blue-400 font-semibold">
          {language}
        </span>
        <button
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
      <div className="p-3.5 overflow-x-auto text-[13.5px] font-mono leading-relaxed text-slate-200">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
