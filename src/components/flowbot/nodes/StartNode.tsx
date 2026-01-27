import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface StartNodeProps {
  selected?: boolean;
}

export function StartNode({ selected }: StartNodeProps) {
  return (
    <div 
      className={cn(
        "w-32 h-16 rounded-full bg-primary flex items-center justify-center gap-2 text-primary-foreground font-medium shadow-lg transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <Play className="w-4 h-4" />
      Início
    </div>
  );
}
