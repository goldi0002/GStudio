import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#141414] text-[#F5F5F7] p-6">
          <div className="max-w-md w-full rounded-xl bg-[#202023] border border-white/10 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FF453A]/15 text-[#FF453A] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">GStudio Recovery</h1>
                <p className="text-xs text-[#99999F]">
                  Your autosaved projects remain safely stored locally in IndexedDB.
                </p>
              </div>
            </div>
            <p className="text-xs text-[#99999F] bg-[#1B1B1D] rounded-lg p-3 border border-white/5 font-mono-tabular break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reload Studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
