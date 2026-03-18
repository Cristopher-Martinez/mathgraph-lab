import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

// Colores por "profundidad" en el grafo
const COLORS = [
  "#818cf8",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#fb923c",
  "#38bdf8",
];

function nodeStyle(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 600,
    fontSize: 12,
    border: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    maxWidth: 140,
    textAlign: "center" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.2,
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  };
}

/**
 * Compact hierarchical layout with uniform spacing.
 * Uses barycenter heuristic to minimize edge crossings.
 */
function layoutNodes(
  dagNodes: {
    id: number;
    name: string;
    exerciseCount: number;
    completed: boolean;
    orphan?: boolean;
  }[],
  dagEdges: { parentId: number; childId: number }[],
): Node[] {
  // Scale gaps based on graph size for compact layouts
  const totalNodes = dagNodes.length;
  const X_GAP = totalNodes > 20 ? 150 : totalNodes > 10 ? 170 : 190;
  const Y_GAP = totalNodes > 20 ? 100 : totalNodes > 10 ? 120 : 140;

  // Build adjacency
  const parentMap = new Map<number, number[]>();
  const childMap = new Map<number, number[]>();
  for (const n of dagNodes) {
    parentMap.set(n.id, []);
    childMap.set(n.id, []);
  }
  for (const e of dagEdges) {
    parentMap.get(e.childId)?.push(e.parentId);
    childMap.get(e.parentId)?.push(e.childId);
  }

  const connectedNodes = dagNodes.filter((n) => !n.orphan);
  const orphanNodes = dagNodes.filter((n) => n.orphan);

  // --- Level assignment (max parent level + 1) ---
  const levels = new Map<number, number>();
  const roots = connectedNodes.filter(
    (n) => (parentMap.get(n.id)?.length || 0) === 0,
  );

  if (roots.length === 0 && connectedNodes.length > 0) {
    connectedNodes.forEach((n) => levels.set(n.id, 0));
  } else {
    for (const root of roots) levels.set(root.id, 0);

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
      changed = false;
      iterations++;
      for (const node of connectedNodes) {
        const np = parentMap.get(node.id) || [];
        if (np.length === 0) continue;
        const pLevels = np
          .map((pId) => levels.get(pId))
          .filter((l) => l !== undefined) as number[];
        if (pLevels.length > 0) {
          const newLvl = Math.max(...pLevels) + 1;
          const cur = levels.get(node.id);
          if (cur === undefined || newLvl > cur) {
            levels.set(node.id, newLvl);
            changed = true;
          }
        }
      }
    }
    for (const n of connectedNodes) {
      if (!levels.has(n.id)) levels.set(n.id, 0);
    }
  }

  // Group nodes by level
  const byLevel = new Map<number, typeof connectedNodes>();
  for (const n of connectedNodes) {
    const lvl = levels.get(n.id) || 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(n);
  }
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  // --- Ordering with barycenter to minimize crossings ---
  const positions = new Map<number, number>();

  // Initialize: sort each level by node id for stability
  for (const lvl of sortedLevels) {
    const nodesAtLvl = byLevel.get(lvl)!;
    nodesAtLvl.sort((a, b) => a.id - b.id);
    nodesAtLvl.forEach((n, idx) => positions.set(n.id, idx));
  }

  // Barycenter iterations: 8 passes alternating top-down and bottom-up
  for (let pass = 0; pass < 8; pass++) {
    const levelsToProcess =
      pass % 2 === 0 ? sortedLevels : [...sortedLevels].reverse();

    for (const lvl of levelsToProcess) {
      const nodesAtLvl = byLevel.get(lvl)!;
      if (nodesAtLvl.length <= 1) continue;

      const barycenters: { node: (typeof nodesAtLvl)[0]; value: number }[] = [];
      for (const node of nodesAtLvl) {
        const neighbors =
          pass % 2 === 0
            ? parentMap.get(node.id) || []
            : childMap.get(node.id) || [];
        if (neighbors.length === 0) {
          barycenters.push({ node, value: positions.get(node.id) || 0 });
        } else {
          const avgPos =
            neighbors.reduce((sum, nId) => sum + (positions.get(nId) || 0), 0) /
            neighbors.length;
          barycenters.push({ node, value: avgPos });
        }
      }
      barycenters.sort((a, b) => a.value - b.value);
      barycenters.forEach(({ node }, idx) => positions.set(node.id, idx));
    }
  }

  // --- Build final positions with uniform gaps ---
  const result: Node[] = [];
  const maxLvl =
    sortedLevels.length > 0 ? sortedLevels[sortedLevels.length - 1] : 0;

  for (const lvl of sortedLevels) {
    const nodesAtLvl = byLevel.get(lvl)!;
    const sorted = [...nodesAtLvl].sort(
      (a, b) => (positions.get(a.id) || 0) - (positions.get(b.id) || 0),
    );

    const totalWidth = sorted.length * X_GAP;
    const startX = -totalWidth / 2 + X_GAP / 2;

    sorted.forEach((n, idx) => {
      const colorIdx = lvl % COLORS.length;
      result.push({
        id: String(n.id),
        position: { x: startX + idx * X_GAP, y: lvl * Y_GAP },
        data: {
          label: `${n.name}${n.exerciseCount > 0 ? ` (${n.exerciseCount})` : ""}`,
        },
        style: n.completed
          ? {
              ...nodeStyle(COLORS[colorIdx]),
              border: "3px solid #22c55e",
              boxShadow: "0 0 12px rgba(34,197,94,0.4)",
            }
          : nodeStyle(COLORS[colorIdx]),
      });
    });
  }

  // Orphans at the bottom
  if (orphanNodes.length > 0) {
    const orphanY = (maxLvl + 2) * Y_GAP;
    const totalW = orphanNodes.length * X_GAP;
    const startX = -totalW / 2 + X_GAP / 2;
    orphanNodes.forEach((n, idx) => {
      result.push({
        id: String(n.id),
        position: { x: startX + idx * X_GAP, y: orphanY },
        data: {
          label: `⚠ ${n.name}${n.exerciseCount > 0 ? ` (${n.exerciseCount})` : ""}`,
        },
        style: {
          ...nodeStyle("#6b7280"),
          border: "2px dashed #ef4444",
          opacity: 0.75,
        },
      });
    });
  }

  return result;
}

interface DAGGraphProps {
  onNodeClick?: (topicId: number) => void;
  refreshKey?: number;
  resetPositions?: boolean;
}

const POSITIONS_KEY = "dag-node-positions";

export default function DAGGraph({
  onNodeClick,
  refreshKey,
  resetPositions,
}: DAGGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getDAG()
      .then((dag) => {
        let layouted = layoutNodes(dag.nodes, dag.edges);

        // Apply saved positions from localStorage if not resetting
        if (!resetPositions) {
          try {
            const saved = localStorage.getItem(POSITIONS_KEY);
            if (saved) {
              const savedPositions: Record<string, { x: number; y: number }> =
                JSON.parse(saved);
              layouted = layouted.map((node) => {
                if (savedPositions[node.id]) {
                  return { ...node, position: savedPositions[node.id] };
                }
                return node;
              });
            }
          } catch (err) {
            console.error("Error loading saved positions:", err);
          }
        } else {
          // Clear saved positions when resetting
          localStorage.removeItem(POSITIONS_KEY);
        }

        setNodes(layouted);

        const flowEdges: Edge[] = dag.edges.map((e: any) => ({
          id: `e${e.parentId}-${e.childId}`,
          source: String(e.parentId),
          target: String(e.childId),
          type: "smoothstep",
          animated: true,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        }));
        setEdges(flowEdges);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, resetPositions]);

  const handleNodeClick = useCallback(
    (_: any, node: Node) => {
      const topicId = parseInt(node.id, 10);
      if (onNodeClick) onNodeClick(topicId);
    },
    [onNodeClick],
  );

  // Custom handler to save positions when nodes are dragged
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);

      // Detect position changes (drag end)
      const positionChanges = changes.filter(
        (change) => change.type === "position" && change.dragging === false,
      );

      if (positionChanges.length > 0) {
        // Get current node positions and save to localStorage
        setNodes((currentNodes) => {
          const positions: Record<string, { x: number; y: number }> = {};
          currentNodes.forEach((node) => {
            positions[node.id] = node.position;
          });
          try {
            localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
          } catch (err) {
            console.error("Error saving positions:", err);
          }
          return currentNodes;
        });
      }
    },
    [onNodesChange, setNodes],
  );

  if (loading) {
    return (
      <div className="h-[400px] sm:h-[500px] lg:h-[700px] flex items-center justify-center text-gray-500 dark:text-gray-400">
        Cargando DAG...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-[400px] sm:h-[500px] lg:h-[700px] flex items-center justify-center text-gray-500 dark:text-gray-400">
        No hay temas en el DAG aún. Registra una clase para comenzar.
      </div>
    );
  }

  return (
    <div className="h-[400px] sm:h-[500px] lg:h-[700px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.1}
        maxZoom={2}>
        <Background variant={BackgroundVariant.Dots} gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
