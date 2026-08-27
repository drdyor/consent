import { createHash, randomUUID } from "node:crypto";

export const aiProviderKinds = ["local_openai_compatible", "clinic_managed_endpoint", "approved_cloud"] as const;
export const aiPurposes = ["administrative_draft", "source_governance_draft", "procurement_suggestion", "other_nonclinical"] as const;
export const AI_LEDGER_GENESIS = "0".repeat(64);

export function isSha256(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function createDecisionReference() {
  return `aegis-ai:${randomUUID().replaceAll("-", "")}`;
}

export function hashDecisionEvent(input: {
  eventReference: string;
  eventKind: "assistance_recorded" | "human_review";
  purpose: string;
  modelIdentifier: string | null;
  inputHash: string;
  outputHash: string;
  humanDecision: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  parentEventId: number | null;
  createdAt: Date;
}, previousHash: string) {
  const payload = JSON.stringify({ ...input, createdAt: new Date(Math.floor(input.createdAt.getTime() / 1000) * 1000).toISOString() });
  return createHash("sha256").update(`${previousHash}\n${payload}`).digest("hex");
}

export function isPermittedAiPurpose(value: string): value is (typeof aiPurposes)[number] {
  return (aiPurposes as readonly string[]).includes(value);
}
