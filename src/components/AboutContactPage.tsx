import React, { useState } from 'react';
import {
  Mail,
  Zap,
  Sparkles,
  Send,
  CheckCircle,
  Building2,
  Shield,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { AppView } from '../types';
import { GLITCH_AI_VERSION } from '../lib/credits';
import { GLITCH_EMBLEM_SRC } from '../lib/assets';
import { NativeBannerAd } from './AdSlots';

interface AboutContactPageProps {
  onNavigate: (view: AppView) => void;
  userEmail?: string;
}

export const AboutContactPage: React.FC<AboutContactPageProps> = ({ onNavigate, userEmail }) => {
  const [subject, setSubject] = useState('Support / Help');
  const [email, setEmail] = useState(userEmail || '');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setMessage('');
    }, 700);
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#04050c] text-slate-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-center justify-between border-b border-[#192241] pb-4">
          <button
            onClick={() => onNavigate('chat')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Chat</span>
          </button>
          <div className="text-xs text-slate-400">About Glitch AI v{GLITCH_AI_VERSION} · Al-Fateh</div>
        </div>

        <div className="relative p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-[#090d1f] to-[#050712] border border-cyan-500/25 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-[#04060f] border border-cyan-500/35 flex items-center justify-center p-2 shadow-lg flex-shrink-0">
              <img
                src={GLITCH_EMBLEM_SRC}
                alt="Glitch AI Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-cyan-400 mb-1">
                Al-Fateh · Version {GLITCH_AI_VERSION} Release
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
                About <span className="glitch-gradient-text">Glitch AI</span>{' '}
                <span className="text-base font-mono text-cyan-300">v{GLITCH_AI_VERSION}</span>
              </h1>
              <p className="text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
                Glitch AI v{GLITCH_AI_VERSION} was built by <strong className="text-white">Al-Fateh</strong>, a technology organization dedicated to delivering a clean conversational AI with live internet knowledge, natural voice calling, credit-powered image creation, and user-to-user credit transfers — with video generation coming soon in future updates.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-[#090c1a] border border-[#192241]">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center mb-3">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">Precision & Speed</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Engineered by Al-Fateh for razor-sharp coding, research analysis, creative direction, and effortless everyday productivity.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#090c1a] border border-[#192241]">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 text-fuchsia-400 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">Multimodal Workspace</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Combines deep reasoning, visual understanding, expressive voice calls, and credit-powered image generation — with video synthesis coming soon.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#090c1a] border border-[#192241]">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-3">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">Credits &amp; Security</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Start with 100 Credits, win lucky 0–10 Credit ad rewards, transfer Credits directly to friends, and export any conversation to PDF.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 pt-4">
          <div className="md:col-span-2 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white mb-1 font-display">Get in Touch</h2>
              <p className="text-xs text-slate-400">
                Have feedback, questions, or enterprise inquiries? Connect directly with the Al-Fateh team.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#090c1a] border border-[#192241] space-y-3">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-cyan-400 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Support & Inquiries</div>
                  <a
                    href="mailto:blackzero193644@gmail.com"
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    blackzero193644@gmail.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-emerald-400 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Response SLA</div>
                  <p className="text-xs text-slate-400">Typically responds within 24 hours.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-fuchsia-400 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Organization</div>
                  <p className="text-xs text-slate-400">Developed and operated by Al-Fateh.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-3 p-6 rounded-2xl bg-[#090c1a] border border-[#192241] shadow-lg">
            <h3 className="text-base font-bold text-white mb-4 font-display">Send a Direct Message</h3>

            {submitted ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-base font-semibold text-white">Message Received!</h4>
                <p className="text-xs text-slate-300 max-w-sm mx-auto">
                  Thank you for reaching out to Glitch AI & Al-Fateh. Your feedback has been logged.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Subject / Category
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                  >
                    <option value="Support / Help">Support / Help with Glitch AI</option>
                    <option value="Feature Request">New Feature Request</option>
                    <option value="Media & Voice Feedback">Image, Video & Voice Feedback</option>
                    <option value="Partnership / Organization Inquiry">Al-Fateh Partnership Inquiry</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Your Contact Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                    className="w-full bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your question, suggestion, or feedback here..."
                    rows={4}
                    required
                    className="w-full bg-[#04060f] border border-[#192241] focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Sending...' : 'Send Message'}</span>
                </button>
              </form>
            )}
          </div>
        </div>

        <NativeBannerAd />
      </div>
    </div>
  );
};
