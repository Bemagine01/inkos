import { describe, expect, it } from "vitest";
import { enumerateRuntimePaths } from "../interactive-film/paths.js";
import { StoryGraphSchema, type StoryGraph } from "../interactive-film/graph-schema.js";

function g(over: Record<string, unknown>): StoryGraph {
  return StoryGraphSchema.parse({ schemaVersion: 1, projectId: "p", title: "T", variables: [], nodes: [], endings: [], ...over });
}

describe("enumerateRuntimePaths", () => {
  it("enumerates both branches to two endings", () => {
    const graph = g({
      nodes: [
        { id: "s", type: "start", choices: [{ id: "a", text: "好", targetNodeId: "e1" }, { id: "b", text: "坏", targetNodeId: "e2" }] },
        { id: "e1", type: "ending", choices: [] },
        { id: "e2", type: "ending", choices: [] },
      ],
      endings: [{ id: "g1", nodeId: "e1", title: "好", type: "good" }, { id: "b1", nodeId: "e2", title: "坏", type: "bad" }],
    });
    const { paths } = enumerateRuntimePaths(graph);
    expect(paths.length).toBe(2);
    expect(paths.map((p) => p.endingId).sort()).toEqual(["b1", "g1"]);
    expect(paths.every((p) => p.nodeIds[0] === "s")).toBe(true);
  });

  it("respects variable-gated choices (hidden when condition unmet)", () => {
    const graph = g({
      variables: [{ name: "trust", type: "counter", default: 0, desc: "" }],
      nodes: [
        { id: "s", type: "start", choices: [
          { id: "a", text: "需信任", targetNodeId: "e1", condition: { var: "trust", op: ">=", value: 1 } },
          { id: "b", text: "总能走", targetNodeId: "e2" },
        ] },
        { id: "e1", type: "ending", choices: [] },
        { id: "e2", type: "ending", choices: [] },
      ],
      endings: [{ id: "g1", nodeId: "e1", title: "好", type: "good" }, { id: "b1", nodeId: "e2", title: "坏", type: "bad" }],
    });
    const { paths } = enumerateRuntimePaths(graph);
    // trust starts 0, choice a hidden → only the path to e2
    expect(paths.length).toBe(1);
    expect(paths[0].endingId).toBe("b1");
  });

  it("guards against cycles and truncates at maxPaths", () => {
    const graph = g({
      nodes: [
        { id: "s", type: "start", choices: [{ id: "c", text: "loop", targetNodeId: "s" }, { id: "d", text: "out", targetNodeId: "e" }] },
        { id: "e", type: "ending", choices: [] },
      ],
      endings: [{ id: "g1", nodeId: "e", title: "好", type: "good" }],
    });
    const { paths } = enumerateRuntimePaths(graph, { maxPaths: 50 });
    // cycle guard: 's' not re-entered in a single path → finite; the 'out' path reaches e
    expect(paths.some((p) => p.endingId === "g1")).toBe(true);
    expect(paths.length).toBeLessThanOrEqual(50);
  });
});
