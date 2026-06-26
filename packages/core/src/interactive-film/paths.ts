import type { StoryGraph } from "./graph-schema.js";
import { visibleChoices, applyEffects, initVarState } from "./evaluator.js";
import type { VarState } from "./evaluator.js";

export interface RuntimePath {
  readonly nodeIds: readonly string[];
  readonly endingId: string | null;
  readonly length: number;
}

const DEFAULT_MAX_PATHS = 200;

export function enumerateRuntimePaths(
  graph: StoryGraph,
  opts?: { maxPaths?: number },
): { paths: RuntimePath[]; truncated: boolean } {
  const maxPaths = opts?.maxPaths ?? DEFAULT_MAX_PATHS;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const endingByNodeId = new Map(graph.endings.map((e) => [e.nodeId, e.id]));
  const start = graph.nodes.find((n) => n.type === "start");
  const paths: RuntimePath[] = [];
  let truncated = false;
  if (!start) return { paths, truncated };

  const walk = (nodeId: string, vars: VarState, trail: string[], onPath: Set<string>): void => {
    if (truncated || paths.length >= maxPaths) { truncated = true; return; }
    const node = nodeById.get(nodeId);
    if (!node) return;
    const nextTrail = [...trail, nodeId];
    if (node.type === "ending") {
      paths.push({ nodeIds: nextTrail, endingId: endingByNodeId.get(nodeId) ?? null, length: nextTrail.length });
      return;
    }
    const choices = visibleChoices(node, vars);
    if (choices.length === 0) {
      // dead-end leaf (no ending): record as a terminal path with null ending
      paths.push({ nodeIds: nextTrail, endingId: null, length: nextTrail.length });
      return;
    }
    for (const choice of choices) {
      if (paths.length >= maxPaths) { truncated = true; return; }
      if (onPath.has(choice.targetNodeId)) continue; // cycle guard: don't re-enter a node already on this path
      const nextVars = applyEffects(vars, choice.effects);
      const nextOnPath = new Set(onPath);
      nextOnPath.add(choice.targetNodeId);
      walk(choice.targetNodeId, nextVars, nextTrail, nextOnPath);
    }
  };

  walk(start.id, initVarState(graph.variables), [], new Set([start.id]));
  return { paths, truncated };
}
