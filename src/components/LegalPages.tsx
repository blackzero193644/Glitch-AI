import React, { useState } from 'react';
import { Shield, FileText, ArrowLeft, Lock, Database, UserCheck, CheckCircle2 } from 'lucide-react';
import { AppView } from '../types';
import { NativeBannerAd } from './AdSlots';

interface LegalPagesProps {
  initialTab?: 'privacy' | 'terms';
  onNavigate: (view: AppView) => void;
}

export const LegalPages: React.FC<LegalPagesProps> = ({ initialTab = 'privacy', onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#04050c] text-slate-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b border-[#192241] pb-4">
          <button
            onClick={() => onNavigate('chat')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Chat Workstation</span>
          </button>

          {/* Tab Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#090c1a] border border-[#192241] rounded-xl">
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'privacy'
                  ? 'glitch-btn-primary'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Privacy Policy</span>
            </button>
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'terms'
                  ? 'glitch-btn-primary'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Terms of Service</span>
            </button>
          </div>
        </div>

        {/* Content Box */}
        <div className="p-6 sm:p-10 rounded-2xl bg-[#090c1a] border border-[#192241] shadow-xl space-y-8 text-left leading-relaxed">
          {activeTab === 'privacy' ? (
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 mb-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Effective Date: 2026-09-22 · Al-Fateh</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
                  Glitch AI Privacy Policy
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Commitment by Al-Fateh to data security, cloud isolation, and zero unauthorized sharing.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-[#060814] border border-[#192241]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 mb-1">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span>Guest Trial Privacy</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Use Glitch AI freely without creating an account or supplying personal details.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#060814] border border-[#192241]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300 mb-1">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>Account Isolation</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    User conversations and settings are isolated by strict security rules.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#060814] border border-[#192241]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-300 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-fuchsia-400" />
                    <span>Device Photos Safe</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Device avatar uploads are scaled client-side and saved only to your account.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs text-slate-300">
                <h2 className="text-sm font-bold text-white pt-2">1. Information We Collect</h2>
                <p>
                  <strong>Guest Mode:</strong> When using Glitch AI in guest mode, session history and profile settings are stored strictly in your browser's local client storage. No identifying information is harvested.
                </p>
                <p>
                  <strong>Authenticated Accounts:</strong> When signing in, Glitch AI authenticates securely and stores your user ID, email address, custom instructions, and conversation history in isolated cloud storage.
                </p>
                <p>
                  <strong>Device Profile Pictures:</strong> If you upload a profile picture from your phone or PC, it is compressed in your browser and saved solely to your private profile.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">2. How We Use Information</h2>
                <p>
                  Collected data is used solely to operate and maintain your Glitch AI conversational sessions, remember your preferences, and enable multi-device continuity.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">3. Processing & Third Parties</h2>
                <p>
                  Requests are transmitted over encrypted TLS channels to generate responses. Al-Fateh does not sell, rent, or trade your personal data or conversation records with advertisers.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">4. Data Retention & Your Rights</h2>
                <p>
                  You retain full ownership of your data and may delete individual chat sessions or wipe your full history at any time using "Clear History" or "Clear Chat".
                </p>

                <h2 className="text-sm font-bold text-white pt-2">5. Contact & Inquiries</h2>
                <p>
                  For privacy questions or data deletion requests, contact Al-Fateh at{' '}
                  <a href="mailto:alfateh@cc.cc" className="text-cyan-400 hover:underline">
                    alfateh@cc.cc
                  </a>
                  .
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 mb-2">
                  <FileText className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Updated: 2026-09-22 · Al-Fateh</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
                  Glitch AI Terms of Service
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Conditions of access and operational policies for Glitch AI services operated by Al-Fateh.
                </p>
              </div>

              <div className="space-y-4 text-xs text-slate-300">
                <h2 className="text-sm font-bold text-white pt-2">1. Agreement to Terms</h2>
                <p>
                  By accessing or utilizing Glitch AI (whether via guest trial or authenticated account), you acknowledge that you have read and agreed to these Terms of Service.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">2. Acceptable Use Policy</h2>
                <p>Users agree to engage with Glitch AI responsibly. Prohibited behaviors include:</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li>Generating malicious software, exploits, or cyber-attack scripts.</li>
                  <li>Harassing, defamatory, or unlawful automated queries.</li>
                  <li>Attempting to bypass security protections or tamper with service infrastructure.</li>
                </ul>

                <h2 className="text-sm font-bold text-white pt-2">3. Artificial Intelligence Disclaimer</h2>
                <p>
                  Glitch AI utilizes probabilistic neural intelligence. While engineered by Al-Fateh for high accuracy, outputs should be verified for mission-critical engineering or life-safety tasks.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">4. Intellectual Property</h2>
                <p>
                  Glitch AI branding, visual identity, logos, and interface software are intellectual properties of <strong>Al-Fateh</strong>. You retain ownership of your original prompts and generated outputs.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">5. Service Availability</h2>
                <p>
                  Glitch AI is provided "as is" and may undergo periodic updates or upgrades by Al-Fateh to improve capability and reliability.
                </p>

                <h2 className="text-sm font-bold text-white pt-2">6. Governing Contact</h2>
                <p>
                  Inquiries regarding these terms should be addressed to Al-Fateh at{' '}
                  <a href="mailto:alfateh@cc.cc" className="text-cyan-400 hover:underline">
                    alfateh@cc.cc
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
        </div>

        <NativeBannerAd />
      </div>
    </div>
  );
};
