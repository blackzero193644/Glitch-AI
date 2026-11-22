import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        if (friendly.startsWith('{')) {
          const parsed = JSON.parse(friendly);
          if (parsed?.error) friendly = parsed.error;
        }
      } catch {}

      return (
        <div className="min-h-screen w-screen bg-[#04050c] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#090c1a] border border-rose-500/40 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white">Something went wrong</h2>
            <p className="text-xs text-slate-300 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glitch-btn-primary text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Glitch AI</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
