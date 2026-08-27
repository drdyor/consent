import { describe, expect, it } from "vitest";
import { AI_LEDGER_GENESIS, hashDecisionEvent, isPermittedAiPurpose, isSha256 } from "./aiGovernance";

const event = { eventReference: "aegis-ai:0123456789abcdef", eventKind: "assistance_recorded" as const, purpose: "administrative_draft", modelIdentifier: "controlled-model" as string | null, inputHash: "a".repeat(64), outputHash: "b".repeat(64), humanDecision: "pending" as const, decisionNote: null as string | null, parentEventId: null as number | null, createdAt: new Date("2026-08-27T12:00:00.250Z") };

describe("AI governance ledger primitives", () => {
  it("canonicalizes event time and produces a deterministic hash linked to its predecessor", () => {
    const first = hashDecisionEvent(event, AI_LEDGER_GENESIS); const equivalentMilliseconds = hashDecisionEvent({ ...event, createdAt: new Date("2026-08-27T12:00:00.999Z") }, AI_LEDGER_GENESIS);
    expect(first).toMatch(/^[a-f0-9]{64}$/); expect(equivalentMilliseconds).toBe(first); expect(hashDecisionEvent(event, "c".repeat(64))).not.toBe(first);
  });

  it("recognizes only the explicit non-clinical purposes and SHA-256 references", () => {
    expect(isPermittedAiPurpose("procurement_suggestion")).toBe(true); expect(isPermittedAiPurpose("clinical_diagnosis")).toBe(false); expect(isSha256("d".repeat(64))).toBe(true); expect(isSha256("raw patient prompt")).toBe(false);
  });
});
