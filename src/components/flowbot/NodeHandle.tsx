import { cn } from "@/lib/utils";

interface NodeHandleProps {
  type: "source" | "target";
  position: "top" | "bottom" | "left" | "right";
  handleId?: string;
  isConnecting?: boolean;
  onStartConnect?: (handleId?: string) => void;
  onEndConnect?: () => void;
  className?: string;
}

// Marker class so the EdgeRenderer can locate the handle DOM nodes precisely.
const HANDLE_MARKER_CLASS = "flowbot-handle";

export function NodeHandle({ 
  type, 
  position, 
  handleId,
  isConnecting,
  onStartConnect,
  onEndConnect,
  className 
}: NodeHandleProps) {
  const positionStyles = {
    top: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
    bottom: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
    left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
    right: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (type === "source" && onStartConnect) {
      e.stopPropagation();
      onStartConnect(handleId);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (type === "target" && onEndConnect) {
      e.stopPropagation();
      onEndConnect();
    }
  };

  return (
    <div
      className={cn(
        HANDLE_MARKER_CLASS,
        "absolute w-4 h-4 rounded-full border-2 border-primary bg-background z-20 transition-all",
        type === "source" && "cursor-crosshair hover:bg-primary hover:scale-125",
        type === "target" && isConnecting && "bg-primary/50 scale-125 animate-pulse",
        positionStyles[position],
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      data-handle-type={type}
      data-handle-id={handleId ?? ""}
      data-flowbot-handle="true"
    />
  );
}
