/**
 * Interactive-world (Play) illustration: turn world-graph entities and key
 * moments into images. Reuses the same image-provider plumbing as cover
 * generation (resolveCoverGenerationRequest + generateImageFromPrompt) so a
 * single cover-API configuration drives both.
 *
 * Images and their status live in a per-run sidecar (run/images/) decoupled
 * from the event log — generation is async and is not part of game state.
 */
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateImageFromPrompt,
  resolveCoverGenerationRequest,
} from "../pipeline/short-fiction-runner.js";

/** Per-type framing so an actor reads as a portrait, an item as a still, etc. */
const SHOT_BY_TYPE: Record<string, string> = {
  actor: "为这个角色画一张半身肖像",
  location: "为这个地点画一张环境立绘",
  item: "为这件物品画一张静物特写（中性背景）",
  evidence: "为这件证物画一张特写",
  clue: "为这条线索画一张特写",
  claim: "为这个主张画一张示意特写",
  proof_chain: "为这条证据链画一张示意图",
  organization: "为这个组织画一张代表性图像（标志或场所）",
};

function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Build a style-consistent image prompt for a world entity. The world premise
 * anchors era / setting / art style so every illustration in one run looks like
 * it belongs to the same world.
 */
export function buildPlayEntityImagePrompt(
  entity: { readonly type: string; readonly label: string; readonly summary?: string },
  worldPremise?: string,
): string {
  const premise = worldPremise?.trim();
  const subject = SHOT_BY_TYPE[entity.type] ?? "为这个对象画一张贴合世界设定的概念图";
  const summary = entity.summary?.trim();
  return [
    premise ? `世界设定（决定时代、场景与整体美术风格，必须贴合）：${clamp(premise, 600)}` : "",
    subject,
    `对象：${entity.label}`,
    summary ? `细节：${clamp(summary, 400)}` : "",
    "要求：写实或半写实，单一主体清晰，构图聚焦，无任何文字、水印或多格拼贴。",
  ].filter(Boolean).join("\n");
}

/** Build a wide illustration prompt for the current moment from its scene prose. */
export function buildPlaySceneImagePrompt(sceneText: string, worldPremise?: string): string {
  const premise = worldPremise?.trim();
  return [
    premise ? `世界设定（决定时代、场景与整体美术风格，必须贴合）：${clamp(premise, 600)}` : "",
    "为下面这一刻画一张电影感的横构图插画，捕捉当下的动作、氛围与情绪：",
    clamp(sceneText, 900),
    "要求：写实或半写实，重氛围与光影，无任何文字、水印或多格拼贴。",
  ].filter(Boolean).join("\n");
}

export type PlayImageStatus = "ready" | "failed";

export interface PlayImageEntry {
  readonly status: PlayImageStatus;
  readonly file?: string;
  readonly error?: string;
}

export type PlayImageManifest = Record<string, PlayImageEntry>;

function manifestPath(runDir: string): string {
  return join(runDir, "images", "manifest.json");
}

export async function readPlayImageManifest(runDir: string): Promise<PlayImageManifest> {
  try {
    const raw = await readFile(manifestPath(runDir), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PlayImageManifest) : {};
  } catch {
    return {};
  }
}

export async function writePlayImageManifest(runDir: string, manifest: PlayImageManifest): Promise<void> {
  await mkdir(join(runDir, "images"), { recursive: true });
  await writeFile(manifestPath(runDir), JSON.stringify(manifest, null, 2), "utf-8");
}

/** Immutably set one manifest entry and persist it. Returns the new manifest. */
export async function setPlayImageEntry(
  runDir: string,
  key: string,
  entry: PlayImageEntry,
): Promise<PlayImageManifest> {
  const current = await readPlayImageManifest(runDir);
  const next = { ...current, [key]: entry };
  await writePlayImageManifest(runDir, next);
  return next;
}

/** Filesystem-safe leaf name derived from an entity id / scene key. */
export function playImageFileName(key: string, extension: "png" | "jpg"): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "image";
  return `${safe}.${extension}`;
}

/**
 * Generate one image for a Play key (entity id or scene key), write it under
 * run/images/, and record the result in the manifest. Never throws on a
 * generation failure — it records {status:"failed"} so the caller/UI can
 * surface it and retry. Throws only if cover generation is not configured.
 */
export async function generatePlayImage(input: {
  readonly root: string;
  readonly runDir: string;
  readonly key: string;
  readonly prompt: string;
  readonly size?: string;
}): Promise<PlayImageEntry> {
  // Resolution failure (no cover API configured) is a real misconfiguration —
  // let it surface so the endpoint can return a clear "configure first".
  const request = await resolveCoverGenerationRequest({ root: input.root });
  try {
    const { buffer, extension } = await generateImageFromPrompt(
      request,
      input.prompt,
      input.size ?? "1024x1024",
    );
    const file = playImageFileName(input.key, extension);
    await mkdir(join(input.runDir, "images"), { recursive: true });
    await writeFile(join(input.runDir, "images", file), buffer);
    const entry: PlayImageEntry = { status: "ready", file };
    await setPlayImageEntry(input.runDir, input.key, entry);
    return entry;
  } catch (error) {
    const entry: PlayImageEntry = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    await setPlayImageEntry(input.runDir, input.key, entry);
    return entry;
  }
}
