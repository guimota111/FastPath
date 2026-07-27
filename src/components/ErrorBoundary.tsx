// FastPath - Catches render errors so a crash shows a message instead of a
// blank (or, worse, transparent) window with no indication anything broke.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FastPath crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-2 bg-white p-6 text-center">
          <span className="text-sm font-extrabold text-ink">Algo deu errado.</span>
          <span className="max-w-sm text-xs font-semibold text-muted">
            {this.state.error.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
