import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSkillRegistry,
  loadConfiguredCapabilitySkills,
  loadExternalCapabilitySkills,
  parseCapabilitySkillDocument,
} from "../skills/index.js";

describe("external skill loader", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-external-skills-"));
  });

  afterEach(async () => {
    await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true }));
  });

  it("loads a data-only SKILL.md manifest with body text", async () => {
    const skillDir = join(root, "detective-play");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "id: detective-play",
        "name: Detective Play",
        "description: Detective evidence and suspect-board play.",
        "whenToUse: Use for open-world detective play and evidence ledgers.",
        "promptPacks:",
        "  - detective.play",
        "toolHints:",
        "  - play_step",
        "contextNeeds:",
        "  - id: evidence-ledger",
        "    purpose: Preserve suspect, clue, and evidence chain state.",
        "    sources:",
        "      - world/evidence.md",
        "    tier: protected",
        "    appliesTo:",
        "      - play_step",
        "    retrieval: semantic",
        "---",
        "",
        "Use evidence chains; do not turn clues into generic atmosphere.",
      ].join("\n"),
      "utf-8",
    );
    await writeFile(join(skillDir, "scripts", "install.sh"), "echo should-not-run\n", "utf-8");

    const result = await loadExternalCapabilitySkills({ externalDirs: [skillDir] });

    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      id: "detective-play",
      source: "external",
      promptPacks: ["detective.play"],
      body: expect.stringContaining("Use evidence chains"),
    });
    expect(result.skills[0].contextNeeds.map((need) => need.id)).toContain("evidence-ledger");
  });

  it("loads an AgentSkills/OpenClaw manifest without InkOS-only fields", async () => {
    const skillDir = join(root, "writer-distillation");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: writer-distillation",
        "description: Distill a writer's repeatable craft and use it when the user asks for style analysis or imitation.",
        "version: 1.2.0",
        'metadata: { "openclaw": { "emoji": "✍️" } }',
        "---",
        "",
        "# Writer Distillation",
        "",
        "Read the supplied samples, separate transferable craft from surface wording, and produce an editable writing guide.",
      ].join("\r\n"),
      "utf-8",
    );

    const result = await loadExternalCapabilitySkills({ externalDirs: [skillDir] });

    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toEqual([
      expect.objectContaining({
        id: "writer-distillation",
        name: "writer-distillation",
        description: expect.stringContaining("Distill a writer"),
        whenToUse: expect.stringContaining("style analysis or imitation"),
        body: expect.stringContaining("transferable craft"),
        baseDir: skillDir,
        source: "external",
      }),
    ]);
  });

  it("derives a stable id from a standard skill name when no id is present", () => {
    const skill = parseCapabilitySkillDocument(
      [
        "---",
        "name: Writer Distillation",
        "description: Use for writer-style distillation.",
        "---",
        "Distill craft.",
      ].join("\n"),
      { skillPath: join(root, "SKILL.md") },
    );

    expect(skill.id).toBe("writer-distillation");
  });

  it("prefixes ids derived from names that begin with a number", () => {
    const skill = parseCapabilitySkillDocument(
      [
        "---",
        "name: 3D Scene Writer",
        "description: Use for spatial scene writing.",
        "---",
        "Keep spatial continuity visible.",
      ].join("\n"),
      { skillPath: join(root, "SKILL.md") },
    );

    expect(skill.id).toBe("skill-3d-scene-writer");
  });

  it("rejects discovery metadata larger than the Agent Skills limits", () => {
    expect(() => parseCapabilitySkillDocument(
      [
        "---",
        `name: ${"n".repeat(65)}`,
        "description: Small description.",
        "---",
        "Body.",
      ].join("\n"),
      { skillPath: join(root, "SKILL.md") },
    )).toThrow(/name.*64/i);

    expect(() => parseCapabilitySkillDocument(
      [
        "---",
        "name: oversized-description",
        `description: ${"d".repeat(1025)}`,
        "---",
        "Body.",
      ].join("\n"),
      { skillPath: join(root, "SKILL.md") },
    )).toThrow(/description.*1024/i);
  });

  it("registers loaded external skills with the normal registry", async () => {
    const skillDir = join(root, "romance-play");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "id: romance-play",
        "name: Romance Play",
        "description: Romance interaction skill.",
        "whenToUse: Use for romance play.",
        "contextNeeds:",
        "  - id: relationship-tone",
        "    purpose: Preserve relationship tone.",
        "    sources: [world/relationships.md]",
        "    tier: protected",
        "    appliesTo: [play_step]",
        "    retrieval: semantic",
        "---",
        "Romance body.",
      ].join("\n"),
      "utf-8",
    );

    const loaded = await loadExternalCapabilitySkills({ externalDirs: [root] });
    const registry = createSkillRegistry({ skills: loaded.skills });
    const resolved = registry.resolveSkills({ requestedSkills: ["romance-play"] });

    expect(resolved.usedSkills.map((skill) => skill.id)).toEqual(["romance-play"]);
    expect(resolved.forcedSkillIds).toEqual(["romance-play"]);
  });

  it("rejects relative external directories", async () => {
    // 不能用 relative(process.cwd(), root)：Windows CI 上 cwd 和临时目录在不同盘符，
    // path.relative 跨盘符会返回绝对路径，测试意图（传相对路径必须被拒绝）就失效了。
    await expect(loadExternalCapabilitySkills({ externalDirs: [join("relative", "external-skills")] }))
      .rejects.toThrow(/absolute/);
  });

  it("loads project-local skills from .inkos/skills without explicit configuration", async () => {
    const skillDir = join(root, ".inkos", "skills", "detective-play");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "id: detective-play",
        "name: Detective Play",
        "description: Detective evidence play.",
        "whenToUse: Use for detective play.",
        "---",
        "Preserve evidence chains.",
      ].join("\n"),
      "utf-8",
    );

    const loaded = await loadConfiguredCapabilitySkills({
      projectRoot: root,
      env: {},
      userRoot: join(root, "missing-user-root"),
    });

    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.skills.map((skill) => skill.id)).toContain("detective-play");
  });

  it("discovers AgentSkills/OpenClaw project roots and one grouping level", async () => {
    const groupedSkillDir = join(root, "project", "skills", "writing", "writer-distillation");
    await mkdir(groupedSkillDir, { recursive: true });
    await writeFile(
      join(groupedSkillDir, "SKILL.md"),
      [
        "---",
        "name: writer-distillation",
        "description: Distill writer craft.",
        "---",
        "Preserve transferable craft, not source wording.",
      ].join("\n"),
      "utf-8",
    );

    const loaded = await loadConfiguredCapabilitySkills({
      projectRoot: join(root, "project"),
      env: {},
      userRoot: join(root, "home", ".inkos"),
    });

    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.skills.map((skill) => skill.id)).toContain("writer-distillation");
  });

  it("loads external skills from INKOS_SKILL_DIRS and reports bad paths without throwing", async () => {
    const externalRoot = join(root, "external-skills");
    const skillDir = join(externalRoot, "romance-play");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "id: romance-play",
        "name: Romance Play",
        "description: Romance interaction skill.",
        "whenToUse: Use for romance play.",
        "---",
        "Keep emotional continuity.",
      ].join("\n"),
      "utf-8",
    );

    const loaded = await loadConfiguredCapabilitySkills({
      projectRoot: join(root, "project"),
      userRoot: join(root, "user"),
      env: {
        INKOS_SKILL_DIRS: [externalRoot, join(root, "does-not-exist")].join(delimiter),
      },
    });
    const registry = createSkillRegistry({ skills: loaded.skills });

    expect(loaded.skills.map((skill) => skill.id)).toContain("romance-play");
    expect(loaded.diagnostics.some((diagnostic) => diagnostic.path.includes("does-not-exist"))).toBe(true);
    expect(registry.resolveSkills({ requestedSkills: ["romance-play"] }).forcedSkillIds).toEqual(["romance-play"]);
  });
});
