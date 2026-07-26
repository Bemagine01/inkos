import { describe, expect, it } from "vitest";
import {
  createSkillRegistry,
  BUILTIN_CAPABILITY_SKILLS,
} from "../skills/index.js";

describe("capability skill registry", () => {
  it("ships the first built-in writing/play/film skills with context needs", () => {
    const registry = createSkillRegistry();
    const ids = registry.listSkills().map((skill) => skill.id).sort();

    expect(ids).toEqual([
      "interactive-film-authoring",
      "longform-writing",
      "open-world-play",
    ]);
    for (const skill of registry.listSkills()) {
      expect(skill.contextNeeds.length).toBeGreaterThan(0);
      expect(skill.promptPacks.length).toBeGreaterThan(0);
    }
  });

  it("resolves user-forced skills", () => {
    const registry = createSkillRegistry();

    const result = registry.resolveSkills({
      requestedSkills: ["interactive-film-authoring"],
    });

    expect(result.usedSkills.map((skill) => skill.id)).toEqual(["interactive-film-authoring"]);
    expect(result.forcedSkillIds).toEqual(["interactive-film-authoring"]);
    expect(result.missingSkillIds).toEqual([]);
  });

  it("reports unknown forced skills instead of silently dropping them", () => {
    const registry = createSkillRegistry();

    const result = registry.resolveSkills({
      requestedSkills: ["not-a-skill", "longform-writing"],
    });

    expect(result.usedSkills.map((skill) => skill.id)).toEqual(["longform-writing"]);
    expect(result.missingSkillIds).toEqual(["not-a-skill"]);
  });

  it("excludes disabled skills from forced selection", () => {
    const registry = createSkillRegistry();

    const result = registry.resolveSkills({
      disabledSkills: ["interactive-film-authoring"],
      requestedSkills: ["interactive-film-authoring"],
    });

    expect(result.usedSkills.map((skill) => skill.id)).not.toContain("interactive-film-authoring");
    expect(result.disabledSkillIds).toEqual(["interactive-film-authoring"]);
  });

  it("does not auto-load skills without an explicit request", () => {
    const registry = createSkillRegistry();

    expect(registry.resolveSkills({}).usedSkills.map((skill) => skill.id)).toEqual([]);
  });

  it("keeps built-in manifests schema-valid at module load time", () => {
    expect(BUILTIN_CAPABILITY_SKILLS).toHaveLength(3);
  });
});
