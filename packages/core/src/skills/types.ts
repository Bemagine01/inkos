import { z } from "zod";

export const SkillContextTierSchema = z.enum(["protected", "compressible"]);
export type SkillContextTier = z.infer<typeof SkillContextTierSchema>;

export const SkillContextRetrievalSchema = z.enum(["full", "sections", "semantic"]);
export type SkillContextRetrieval = z.infer<typeof SkillContextRetrievalSchema>;

export const SkillContextNeedSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1),
  tier: SkillContextTierSchema,
  appliesTo: z.array(z.string().min(1)).default([]),
  retrieval: SkillContextRetrievalSchema.default("semantic"),
});
export type SkillContextNeed = z.infer<typeof SkillContextNeedSchema>;

export const CapabilitySkillManifestSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  whenToUse: z.string().min(1).max(1024),
  promptPacks: z.array(z.string().min(1)).default([]),
  toolHints: z.array(z.string().min(1)).default([]),
  contextNeeds: z.array(SkillContextNeedSchema).default([]),
  body: z.string().default(""),
  source: z.enum(["builtin", "project", "user", "external"]).default("builtin"),
  baseDir: z.string().min(1).optional(),
});
export type CapabilitySkillManifest = z.infer<typeof CapabilitySkillManifestSchema>;

export const PromptPackManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  prompts: z.array(z.string().min(1)).default([]),
  source: z.enum(["builtin", "project", "user", "external"]).default("builtin"),
});
export type PromptPackManifest = z.infer<typeof PromptPackManifestSchema>;

export interface SkillResolutionInput {
  readonly requestedSkills?: ReadonlyArray<string>;
  readonly disabledSkills?: ReadonlyArray<string>;
}

export interface SkillResolutionResult {
  readonly usedSkills: ReadonlyArray<CapabilitySkillManifest>;
  readonly forcedSkillIds: ReadonlyArray<string>;
  readonly missingSkillIds: ReadonlyArray<string>;
  readonly disabledSkillIds: ReadonlyArray<string>;
  readonly availableSkills: ReadonlyArray<CapabilitySkillManifest>;
  readonly availableSkillIds: ReadonlyArray<string>;
}

export interface SkillRegistry {
  listSkills(): ReadonlyArray<CapabilitySkillManifest>;
  getSkill(id: string): CapabilitySkillManifest | undefined;
  resolveSkills(input: SkillResolutionInput): SkillResolutionResult;
}
