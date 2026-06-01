import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildPlayEntityImagePrompt,
  buildPlaySceneImagePrompt,
  readPlayImageManifest,
  setPlayImageEntry,
  playImageFileName,
} from "../play/play-image.js";

describe("play image prompts", () => {
  it("frames an actor as a portrait and anchors it to the world premise", () => {
    const prompt = buildPlayEntityImagePrompt(
      { type: "actor", label: "林深", summary: "急诊科医生，能读濒死者的记忆" },
      "都市超自然：触碰濒死者会读到对方一段记忆，代价是丢失自己的记忆。",
    );
    expect(prompt).toContain("半身肖像");
    expect(prompt).toContain("林深");
    expect(prompt).toContain("世界设定");
    expect(prompt).toContain("急诊科医生");
    expect(prompt).toContain("无任何文字"); // no-text/watermark guard
  });

  it("frames an item as a neutral-background still", () => {
    const prompt = buildPlayEntityImagePrompt({ type: "item", label: "红线手环" });
    expect(prompt).toContain("静物特写");
    expect(prompt).toContain("红线手环");
  });

  it("falls back to a generic concept frame for unknown entity types", () => {
    const prompt = buildPlayEntityImagePrompt({ type: "rule", label: "记忆债规则" });
    expect(prompt).toContain("记忆债规则");
    expect(prompt).toContain("贴合世界设定");
  });

  it("builds a wide cinematic prompt for a moment from its scene prose", () => {
    const prompt = buildPlaySceneImagePrompt("雨夜，她站在便利店门口，没有抬头。", "情感悬疑");
    expect(prompt).toContain("横构图");
    expect(prompt).toContain("便利店门口");
  });

  it("clamps overly long premises/summaries so prompts stay bounded", () => {
    const long = "设".repeat(2000);
    const prompt = buildPlayEntityImagePrompt({ type: "actor", label: "X", summary: long }, long);
    expect(prompt.length).toBeLessThan(1600);
    expect(prompt).toContain("…");
  });
});

describe("play image manifest", () => {
  let runDir: string;
  beforeEach(async () => { runDir = await mkdtemp(join(tmpdir(), "inkos-playimg-")); });
  afterEach(async () => { await rm(runDir, { recursive: true, force: true }); });

  it("returns {} for a run with no manifest yet", async () => {
    expect(await readPlayImageManifest(runDir)).toEqual({});
  });

  it("round-trips an entry and merges without dropping existing keys", async () => {
    await setPlayImageEntry(runDir, "actor-1", { status: "ready", file: "actor-1.png" });
    await setPlayImageEntry(runDir, "item-2", { status: "failed", error: "503" });
    const manifest = await readPlayImageManifest(runDir);
    expect(manifest["actor-1"]).toEqual({ status: "ready", file: "actor-1.png" });
    expect(manifest["item-2"]).toEqual({ status: "failed", error: "503" });
    // persisted to disk as JSON
    const raw = JSON.parse(await readFile(join(runDir, "images", "manifest.json"), "utf-8"));
    expect(Object.keys(raw)).toHaveLength(2);
  });
});

describe("playImageFileName", () => {
  it("sanitizes ids into safe leaf names with the right extension", () => {
    expect(playImageFileName("actor-1", "png")).toBe("actor-1.png");
    expect(playImageFileName("scene/turn:3 评论", "jpg")).toBe("scene_turn_3___.jpg");
  });

  it("never produces an empty name", () => {
    expect(playImageFileName("！！！", "png")).toBe("___.png");
  });
});
