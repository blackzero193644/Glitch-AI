import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  ArrowRight,
  Copy,
  Check,
  Lightbulb,
  Sliders,
  User,
  Zap,
  ArrowLeft,
} from 'lucide-react';
import { AppView } from '../types';
import { AD_REWARD_MAX, GLITCH_AI_VERSION, IMAGE_CREDIT_COST, INITIAL_CREDITS } from '../lib/credits';

interface GuidesPageProps {
  onNavigate: (view: AppView) => void;
  onSelectPrompt: (promptText: string, mode?: 'chat' | 'image' | 'video') => void;
}

interface GuideItem {
  id: string;
  category: 'research' | 'code' | 'media' | 'productivity';
  title: string;
  prompt: string;
  explanation: string;
  recommendedMode: 'Agent' | 'Image' | 'Video';
  mode: 'chat' | 'image' | 'video';
}

const GUIDES_LIST: GuideItem[] = [
  {
    id: 'r1',
    category: 'research',
    title: 'First-Principles Technical Deep-Dive',
    prompt:
      'Break down how modern distributed caching prevents thundering-herd failures using singleflight coalescing, jittered TTLs, and probabilistic early expiration.',
    explanation:
      'Get structured, crisp engineering explanations grounded in clear mechanisms and real-world trade-offs.',
    recommendedMode: 'Agent',
    mode: 'chat',
  },
  {
    id: 'r2',
    category: 'research',
    title: 'Scientific Concept Comparison',
    prompt:
      'Compare solid-state lithium batteries vs sodium-ion cells across energy density, thermal safety, cycle life, and manufacturing cost.',
    explanation:
      'Ideal for quick side-by-side analysis across technical, academic, or business domains.',
    recommendedMode: 'Agent',
    mode: 'chat',
  },
  {
    id: 'c1',
    category: 'code',
    title: 'React Concurrent & Render Optimization',
    prompt:
      'Analyze why excessive component re-renders happen in React 19 and provide 3 concrete code patterns using state collocation and memoization to prevent them.',
    explanation:
      'Eliminate UI lag and build responsive interfaces with clean, modern patterns.',
    recommendedMode: 'Agent',
    mode: 'chat',
  },
  {
    id: 'c2',
    category: 'code',
    title: 'TypeScript Generic Utility Types',
    prompt:
      'Write a strict TypeScript utility type DeepPartial<T> and DeepReadonly<T> that works recursively across nested objects, arrays, and tuples.',
    explanation:
      'Type-level building blocks for dependable full-stack codebases.',
    recommendedMode: 'Agent',
    mode: 'chat',
  },
  {
    id: 'm1',
    category: 'media',
    title: 'Photorealistic Architectural Concept',
    prompt:
      'A minimalist timber and glass mountain cabin overlooking a misty pine fjord at sunrise, warm interior lights, 8k photorealistic architectural photography.',
    explanation:
      'Describe lighting, lens mood, and subject details directly in Image mode — Glitch AI handles composition automatically.',
    recommendedMode: 'Image',
    mode: 'image',
  },
  {
    id: 'm2',
    category: 'media',
    title: 'Futuristic Bioluminescent Forest Art',
    prompt:
      'A glowing bioluminescent redwood forest at twilight with crystal streams and soft volumetric light beams, 8k photorealistic.',
    explanation:
      `Generates a high-resolution visual in Image Mode (${IMAGE_CREDIT_COST} Credits per image). Video generation is Coming Soon.`,
    recommendedMode: 'Image',
    mode: 'image',
  },
  {
    id: 'p1',
    category: 'productivity',
    title: '14-Day Solo Product Launch Plan',
    prompt:
      'Apply first-principles thinking to outline a practical 14-day launch roadmap for a niche web tool. Organize into daily deliverables, validation steps, and release checks.',
    explanation:
      'Turn broad goals into focused, actionable execution steps immediately.',
    recommendedMode: 'Agent',
    mode: 'chat',
  },
  {
    id: 'p2',
    category: 'productivity',
    title: 'Executive Project Debrief Template',
    prompt:
      'Create a crisp 1-page template for sprint debriefs highlighting completed milestones, current blockers, key metrics, and next-week priorities.',
    explanation:
      'Clean summaries ready to share with any team or stakeholder.',
    recommendedMode: 'Agent',
    mode: 'chat',
  },
];

export const GuidesPage: React.FC<GuidesPageProps> = ({ onNavigate, onSelectPrompt }) => {
  const [filter, setFilter] = useState<'all' | 'research' | 'code' | 'media' | 'productivity'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filteredGuides = GUIDES_LIST.filter((g) => {
    const matchesFilter = filter === 'all' || g.category === filter;
    const matchesSearch =
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.prompt.toLowerCase().includes(search.toLowerCase()) ||
      g.explanation.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleCopy = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#04050c] text-slate-100 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-[#192241] pb-4">
          <button
            onClick={() => onNavigate('chat')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Chat</span>
          </button>
          <div className="text-xs text-slate-400">Glitch AI Guide</div>
        </div>

        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-[#090d1f] text-cyan-300 border border-cyan-500/30">
            <Lightbulb className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Using Glitch AI</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-display">
            Guides & Tips <span className="text-lg font-mono text-cyan-400">v{GLITCH_AI_VERSION}</span>
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Explore prompts for research, coding, credit-powered image creation, and voice workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-[#090c1a] border border-[#192241] text-left">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center mb-2.5">
              <Sliders className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white mb-1">1. Switch Modes in Chat</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Toggle between <strong>Chat</strong> and <strong>Image</strong> right above the chat box — Video Generation is Coming Soon.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#090c1a] border border-[#192241] text-left">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-2.5">
              <User className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white mb-1">2. Custom Instructions</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Open your Profile to set your name, role, and preferences so Glitch AI tailors every reply to you.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#090c1a] border border-[#192241] text-left">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-2.5">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white mb-1">3. Live Voice & Voices</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Start a Voice Call anytime. Glitch AI understands your spoken language automatically and lets you preview or rename voices.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#090c1a] border border-[#192241] text-left">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 text-fuchsia-400 flex items-center justify-center mb-2.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white mb-1">4. {INITIAL_CREDITS} Credits &amp; Transfers</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Start with {INITIAL_CREDITS} Credits ({IMAGE_CREDIT_COST} per image), win 0–{AD_REWARD_MAX} Credits per ad, or send Credits to friends.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#192241]">
          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            {(
              [
                { id: 'all', label: 'All Guides' },
                { id: 'research', label: 'Research' },
                { id: 'code', label: 'Code & Dev' },
                { id: 'media', label: 'Images' },
                { id: 'productivity', label: 'Strategy' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  filter === cat.id
                    ? 'glitch-btn-primary'
                    : 'bg-[#090c1a] text-slate-400 hover:text-white border border-[#192241]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts & guides..."
              className="w-full bg-[#090c1a] border border-[#192241] focus:border-cyan-500 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGuides.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl bg-[#090c1a] border border-[#192241] hover:border-cyan-500/45 transition-all flex flex-col justify-between text-left group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-950/50 border border-cyan-500/30">
                    {item.recommendedMode} Mode
                  </span>
                  <span className="text-[11px] text-slate-500 capitalize">{item.category}</span>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors mb-1.5">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{item.explanation}</p>

                <div className="p-3 rounded-xl bg-[#04060f] border border-[#192241] text-xs text-slate-200 font-mono mb-4 leading-relaxed relative">
                  "{item.prompt}"
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#151d38]">
                <button
                  onClick={(e) => handleCopy(item.id, item.prompt, e)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-[#111730] transition-colors cursor-pointer"
                  title="Copy prompt text"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => onSelectPrompt(item.prompt, item.mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glitch-btn-primary text-xs font-semibold cursor-pointer"
                >
                  <span>Run in Chat</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
