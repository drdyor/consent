import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  records: [{ id: 1, brandName: "Lemon Bottle", manufacturer: "SID Medicos", category: "lipolysis", productClassification: "medicinal_product", marketScope: "EU research", evidenceTier: "regulator", evidenceTitle: "Swissmedic warning", evidenceUrl: "https://example.test/evidence", evidenceLanguage: "en", documentVersion: "26 March 2024", identifierLabel: null, identifierValue: null, researchStatus: "restricted", distributionStatus: "not_eligible", summary: "Restricted evidence-led research record.", nextStep: "Do not create a patient-ready source.", retrievedAt: new Date() }],
  summary: { total: 1, curationReady: 0, restricted: 1, evidenceIncomplete: 0 },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketCatalogue: {
      list: { useQuery: () => ({ data: state.records, isLoading: false, error: null }) },
      summary: { useQuery: () => ({ data: state.summary, isLoading: false, error: null }) },
    },
    workspace: { overview: { useQuery: () => ({ data: { membership: { role: "admin" } } }) } },
  },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock("wouter", () => ({ Link: ({ children, href }: any) => <a href={href}>{children}</a> }));

import MarketCatalogue from "./MarketCatalogue";

describe("MarketCatalogue premium rendered surface", () => {
  it("renders the governing hero, restricted evidence state, and clinical boundary for a research record", () => {
    const markup = renderToStaticMarkup(<MarketCatalogue />);
    expect(markup).toContain("A discerning view of the");
    expect(markup).toContain("Clinical boundary preserved");
    expect(markup).toContain("Lemon Bottle");
    expect(markup).toContain("Restricted");
    expect(markup).toContain("Open source library");
  });
});
