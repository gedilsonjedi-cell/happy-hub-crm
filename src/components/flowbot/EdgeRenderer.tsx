import { useMemo } from "react";
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
}

// Node dimensions for calculating handle positions
const NODE_WIDTH = 256; // w-64 = 16rem = 256px
const NODE_HEIGHT_START = 64;
const NODE_HEIGHT_DEFAULT = 120;
const START_NODE_WIDTH = 128;
const TEMPLATE_NODE_WIDTH = 320; // w-80

function estimateTemplateHeight(data: any): number {
  let h = 44; // header bar
  h += 12; // top padding of body container
  if (data?.header_url) h += 132 + 8; // image + gap
  if (data?.body) {
    const lines = Math.min(8, Math.ceil(String(data.body).length / 38));
    h += 16 + lines * 14 + 8; // body box
  }
  if (data?.footer) h += 16;
  const btns = (data?.buttons || []) as any[];
  if (btns.length) h += 4 + btns.length * 32;
  h += 12; // bottom padding
  return h;
}

function getNodeDimensions(node: CanvasNode) {
  if (node.type === "start") {
    return { width: START_NODE_WIDTH, height: NODE_HEIGHT_START };
  }
  if (node.type === "template") {
    return { width: TEMPLATE_NODE_WIDTH, height: estimateTemplateHeight(node.data) };
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT_DEFAULT };
}

function getSourcePosition(node: CanvasNode, handle?: string): { x: number; y: number } {
  const dims = getNodeDimensions(node);
  
  if (node.type === "start") {
    return { x: node.position.x + dims.width, y: node.position.y + dims.height / 2 };
  }
  
  if (node.type === "buttons" && handle) {
    const buttons = (node.data as any).buttons || [];
    const buttonIndex = buttons.findIndex((b: any) => b.id === handle);
    if (buttonIndex >= 0) {
      const headerHeight = 44;
      const buttonAreaStart = headerHeight + 40;
      const buttonSpacing = 24;
      const yOffset = buttonAreaStart + buttonIndex * buttonSpacing + 12;
      return { x: node.position.x + dims.width, y: node.position.y + Math.min(yOffset, dims.height - 10) };
    }
  }
  
  if (node.type === "template" && handle) {
    const data: any = node.data || {};
    const buttons = (data.buttons || []) as any[];
    const buttonIndex = buttons.findIndex((b: any) => b.id === handle);
    if (buttonIndex >= 0) {
      let yStart = 44 + 12;
      if (data.header_url) yStart += 132 + 8;
      if (data.body) {
        const lines = Math.min(8, Math.ceil(String(data.body).length / 38));
        yStart += 16 + lines * 14 + 8;
      }
      if (data.footer) yStart += 16;
      yStart += 4; // pt-1
      const y = yStart + buttonIndex * 32 + 14;
      return { x: node.position.x + dims.width, y: node.position.y + y };
    }
  }
  
  // Default - output from bottom center
  return { x: node.position.x + dims.width / 2, y: node.position.y + dims.height };
}

function getTargetPosition(node: CanvasNode): { x: number; y: number } {
  const dims = getNodeDimensions(node.type);
  
  if (node.type === "start") {
    // Circle node - no input
    return { x: node.position.x, y: node.position.y + dims.height / 2 };
  }
  
  // Default - input from top center
  return { x: node.position.x + dims.width / 2, y: node.position.y };
}

function createCurvePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  
  // Determine curve direction
  const controlPointOffset = Math.min(Math.abs(dy) * 0.5, 80);
  
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominant - curve with horizontal control points
    return `M ${from.x} ${from.y} C ${from.x + controlPointOffset} ${from.y}, ${to.x - controlPointOffset} ${to.y}, ${to.x} ${to.y}`;
  } else {
    // Vertical dominant - curve with vertical control points
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + controlPointOffset}, ${to.x} ${to.y - controlPointOffset}, ${to.x} ${to.y}`;
  }
}

export function EdgeRenderer({ edges, nodes, connectingFrom, mousePosition, onDeleteEdge }: EdgeRendererProps) {
  const nodeMap = useMemo(() => {
    return nodes.reduce((acc, node) => {
      acc[node.id] = node;
      return acc;
    }, {} as Record<string, CanvasNode>);
  }, [nodes]);

  const edgePaths = useMemo(() => {
    return edges.map(edge => {
      const sourceNode = nodeMap[edge.source];
      const targetNode = nodeMap[edge.target];
      
      if (!sourceNode || !targetNode) return null;
      
      const from = getSourcePosition(sourceNode, edge.sourceHandle);
      const to = getTargetPosition(targetNode);
      const path = createCurvePath(from, to);
      
      return { ...edge, path, from, to };
    }).filter(Boolean);
  }, [edges, nodeMap]);

  // Connecting line (when dragging to create a new edge)
  const connectingPath = useMemo(() => {
    if (!connectingFrom || !mousePosition) return null;
    
    const sourceNode = nodeMap[connectingFrom.nodeId];
    if (!sourceNode) return null;
    
    const from = getSourcePosition(sourceNode, connectingFrom.handle);
    const to = mousePosition;
    const path = createCurvePath(from, to);
    
    return { from, to, path };
  }, [connectingFrom, mousePosition, nodeMap]);

  return (
    <svg 
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ zIndex: 0 }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="hsl(var(--primary))"
          />
        </marker>
        <marker
          id="arrowhead-muted"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="hsl(var(--muted-foreground))"
            opacity="0.5"
          />
        </marker>
      </defs>
      
      {/* Existing edges */}
      {edgePaths.map((edge) => edge && (
        <g key={edge.id} className="group">
          {/* Invisible wider path for easier interaction */}
          <path
            d={edge.path}
            stroke="transparent"
            strokeWidth="20"
            fill="none"
            className="pointer-events-auto cursor-pointer"
            onClick={() => onDeleteEdge?.(edge.id)}
          />
          {/* Visible edge */}
          <path
            d={edge.path}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrowhead)"
            className="transition-all group-hover:stroke-[3px]"
          />
          {/* Delete button on hover */}
          <g 
            className="opacity-0 group-hover:opacity-100 pointer-events-auto cursor-pointer transition-opacity"
            onClick={() => onDeleteEdge?.(edge.id)}
          >
            <circle
              cx={(edge.from.x + edge.to.x) / 2}
              cy={(edge.from.y + edge.to.y) / 2}
              r="10"
              fill="hsl(var(--destructive))"
            />
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
      
      {/* Connecting line while dragging */}
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
