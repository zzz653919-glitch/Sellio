import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

/** Keeps one broken page from blanking the whole app; resets when the route changes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h2 className="mt-3 text-lg font-bold">This page failed to load</h2>
        <p className="mt-1 text-sm muted">{this.state.error.message}</p>
        <button className="mt-5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
