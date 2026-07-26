export interface StudioSkill {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly whenToUse?: string;
  readonly promptPacks?: ReadonlyArray<string>;
  readonly toolHints?: ReadonlyArray<string>;
  readonly contextNeeds?: ReadonlyArray<string>;
  readonly body?: string;
  readonly source?: string;
  readonly editable?: boolean;
  readonly path?: string;
}

export interface SkillDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly whenToUse: string;
  readonly promptPacks: string;
  readonly body: string;
}

export interface SkillPayload {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly whenToUse?: string;
  readonly promptPacks?: string[];
  readonly body?: string;
}

export interface SkillImportFilePayload {
  readonly path: string;
  readonly dataUrl: string;
}

const MAX_SKILL_IMPORT_FILES = 128;
const MAX_SKILL_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SKILL_IMPORT_TOTAL_BYTES = 8 * 1024 * 1024;

export function createEmptySkillDraft(): SkillDraft {
  return {
    id: "",
    name: "",
    description: "",
    whenToUse: "",
    promptPacks: "",
    body: "",
  };
}

export function normalizeSkillId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id) return "";
  return /^[a-z]/.test(id) ? id : `skill-${id}`;
}

export function splitSkillList(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(/[,，\n]/)) {
    const item = part.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function toggleSelectedSkillIds(selected: ReadonlyArray<string>, skillId: string): string[] {
  const id = normalizeSkillId(skillId);
  if (!id) return [...selected];
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  return [...selected, id];
}

export function selectedSkillIdsForSend(selected: ReadonlyArray<string>): string[] | undefined {
  const ids = Array.from(new Set(selected.map(normalizeSkillId).filter(Boolean)));
  return ids.length > 0 ? ids : undefined;
}

export function skillDraftFromSkill(skill: StudioSkill): SkillDraft {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? "",
    whenToUse: skill.whenToUse ?? "",
    promptPacks: (skill.promptPacks ?? []).join(", "),
    body: skill.body ?? "",
  };
}

export function skillDraftToPayload(draft: SkillDraft, includeId = true): SkillPayload {
  const id = normalizeSkillId(draft.id);
  return {
    ...(includeId && id ? { id } : {}),
    name: draft.name.trim() || id,
    description: draft.description.trim(),
    whenToUse: draft.whenToUse.trim(),
    promptPacks: splitSkillList(draft.promptPacks),
    body: draft.body.trim(),
  };
}

export async function serializeSkillFolder(files: FileList | ReadonlyArray<File>): Promise<SkillImportFilePayload[]> {
  const selectedFiles = Array.from(files);
  if (selectedFiles.length > MAX_SKILL_IMPORT_FILES) {
    throw new Error(`A skill may contain at most ${MAX_SKILL_IMPORT_FILES} files.`);
  }
  let totalBytes = 0;
  for (const file of selectedFiles) {
    if (file.size > MAX_SKILL_IMPORT_FILE_BYTES) {
      throw new Error(`${file.name} exceeds ${MAX_SKILL_IMPORT_FILE_BYTES} bytes.`);
    }
    totalBytes += file.size;
    if (totalBytes > MAX_SKILL_IMPORT_TOTAL_BYTES) {
      throw new Error(`Skill folder exceeds ${MAX_SKILL_IMPORT_TOTAL_BYTES} bytes.`);
    }
  }
  const out: SkillImportFilePayload[] = [];
  for (const file of selectedFiles) {
    const path = (file as File & { readonly webkitRelativePath?: string }).webkitRelativePath || file.name;
    const bytes = new Uint8Array(await file.arrayBuffer());
    out.push({
      path,
      dataUrl: `data:${file.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`,
    });
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
