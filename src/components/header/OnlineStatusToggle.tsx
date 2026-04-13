// Online/Offline status toggle component
import { Signal, SignalZero } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAttendantStatus } from "@/hooks/useAttendantStatus";
import { cn } from "@/lib/utils";

export function OnlineStatusToggle() {
  const { isOnline, loading, toggleStatus } = useAttendantStatus();

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleStatus}
          className={cn(
            "h-8 px-2 gap-1.5 text-xs font-medium transition-all",
            isOnline
              ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {isOnline ? (
            <>
              <Signal className="w-4 h-4" />
              <span className="hidden sm:inline">Online</span>
            </>
          ) : (
            <>
              <SignalZero className="w-4 h-4" />
              <span className="hidden sm:inline">Offline</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isOnline
          ? "Você está online - recebendo atendimentos automaticamente"
          : "Você está offline - clique para ficar online"}
      </TooltipContent>
    </Tooltip>
  );
}
