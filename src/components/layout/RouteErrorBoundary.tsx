import React from "react";
import { Button } from "@/components/ui/button";

type Props = { children: React.ReactNode; resetKey?: string };
type State = { error: Error | null };

/** Mostra o erro da página na própria tela, sem recarregar nem redirecionar. */
export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-6 rounded-lg border border-destructive/40 bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">Não foi possível abrir esta página</h2>
        <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
          Tentar novamente
        </Button>
      </div>
    );
  }
}
