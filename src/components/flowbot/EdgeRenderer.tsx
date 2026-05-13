import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CanvasNode } from "./types";

interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface EdgeRendererProps {
  edges: Edge[];
  nodes: CanvasNode[];
  connectingFrom: { nodeId: string; handle?: string } | null;
  mousePosition: { x: number; y: number } | null;
  onDeleteEdge?: (edgeId: string) => void;
  zoom?: number;
}

type Point = { x: number; y: number };

// Measure a handle DOM element relative to the .canvas-content (untransformed coords).
function measureHandle(nodeId: string, handle: string | undefined, type: "source" | "target", zoom: number): Point | null {
  const root = document.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
  if (!root) return null;
  const handles = root.querySelectorAll(`[data-handle-type="${type}"]`);
  let el: HTMLElement | null = null;
  const wanted = handle ?? "";
  handles.forEach((h) => {
    if (el) return;
    const hid = h.getAttribute("data-handle-id") ?? "";
    if (hid === wanted) el = h as HTMLElement;
  });
  if (!el && handles.length > 0) el = handles[0] as HTMLElement;
  if (!el) return null;

  const canvas = document.querySelector(".canvas-content") as HTMLElement | null;
  if (!canvas) return null;
  const cRect = canvas.getBoundingClientRect();
  const hRect = el.getBoundingClientRect();
  const z = zoom || 1;
  return {
    x: (hRect.left + hRect.width / 2 - cRect.left) / z,
    y: (hRect.top + hRect.height / 2 - cRect.top) / z,
  };
}

function fallbackNodeCenter(node: CanvasNode | undefined): Point {
  if (!node) return { x: 0, y: 0 };
  return { x: node.position.x + 100, y: node.position.y + 40 };
}

function createCurvePath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const controlPointOffset = Math.min(Math.max(Math.abs(dx) * 0.5, 40), 120);
  if (Math.abs(dx) > Math.abs(dy)) {
    return `M ${from.x} ${from.y} C ${from.x + controlPointOffset} ${from.y}, ${to.x - controlPointOffset} ${to.y}, ${to.x} ${to.y}`;
  } else {
    const v = Math.min(Math.abs(dy) * 0.5, 80);
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + v}, ${to.x} ${to.y - v}, ${to.x} ${to.y}`;
  }
}

export function EdgeRenderer({ edges, nodes, connectingFrom, mousePosition, onDeleteEdge, zoom = 1 }: EdgeRendererProps) {
  const [computed, setComputed] = useState<Array<Edge & { path: string; from: Point; to: Point }>>([]);
  const [connectingPath, setConnectingPath] = useState<{ from: Point; to: Point; path: string } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Recompute paths whenever nodes/edges/zoom change — uses live DOM measurements
  // so handles always line up exactly with the rendered bolinhas.
  useLayoutEffect(() => {
    const compute = () => {
      const nodeMap: Record<string, CanvasNode> = {};
      for (const n of nodes) nodeMap[n.id] = n;
      const next = edges
        .map((edge) => {
          const sNode = nodeMap[edge.source];
          const tNode = nodeMap[edge.target];
          if (!sNode || !tNode) return null;
          const from =
            measureHandle(edge.source, edge.sourceHandle, "source", zoom) ?? fallbackNodeCenter(sNode);
          const to = measureHandle(edge.target, undefined, "target", zoom) ?? fallbackNodeCenter(tNode);
          return { ...edge, from, to, path: createCurvePath(from, to) };
        })
        .filter(Boolean) as Array<Edge & { path: string; from: Point; to: Point }>;
      setComputed(next);
    };
    // Defer one frame so newly mounted handles are measurable.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(compute);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [edges, nodes, zoom]);

  // Recompute the temporary "while-connecting" line as the mouse moves.
  useEffect(() => {
    if (!connectingFrom || !mousePosition) {
      setConnectingPath(null);
      return;
    }
    const from = measureHandle(connectingFrom.nodeId, connectingFrom.handle, "source", zoom);
    if (!from) {
      setConnectingPath(null);
      return;
    }
    setConnectingPath({ from, to: mousePosition, path: createCurvePath(from, mousePosition) });
  }, [connectingFrom, mousePosition, zoom]);

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 0, width: "100%", height: "100%" }}>
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
        </marker>
        <marker id="arrowhead-muted" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" opacity="0.5" />
        </marker>
      </defs>

      {computed.map((edge) => (
        <g key={edge.id} className="group">
          <path
            d={edge.path}
            stroke="transparent"
            strokeWidth="20"
            fill="none"
            className="pointer-events-auto cursor-pointer"
            onClick={() => onDeleteEdge?.(edge.id)}
          />
          <path
            d={edge.path}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrowhead)"
            className="transition-all group-hover:stroke-[3px]"
          />
          <g
            className="opacity-0 group-hover:opacity-100 pointer-events-auto cursor-pointer transition-opacity"
            onClick={() => onDeleteEdge?.(edge.id)}
          >
            <circle cx={(edge.from.x + edge.to.x) / 2} cy={(edge.from.y + edge.to.y) / 2} r="10" fill="hsl(var(--destructive))" />
            <text
              x={(edge.from.x + edge.to.x) / 2}
              y={(edge.from.y + edge.to.y) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="14"
              fontWeight="bold"
            >
              ×
            </text>
          </g>
        </g>
      ))}

      {connectingPath && (
        <path
          d={connectingPath.path}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="2"
          strokeDasharray="5,5"
          fill="none"
          markerEnd="url(#arrowhead-muted)"
          opacity="0.7"
        />
      )}
    </svg>
  );
}
