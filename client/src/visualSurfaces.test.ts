import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) => join(process.cwd(), path);

describe("premium clinical data-surface contract", () => {
  it("keeps the evidence-ledger hierarchy on catalogue, source, and inventory surfaces", async () => {
    const [catalogue, templates, inventory, styles] = await Promise.all([
      readFile(projectFile("client/src/pages/MarketCatalogue.tsx"), "utf8"),
      readFile(projectFile("client/src/pages/Templates.tsx"), "utf8"),
      readFile(projectFile("client/src/components/InventoryRegister.tsx"), "utf8"),
      readFile(projectFile("client/src/index.css"), "utf8"),
    ]);

    expect(catalogue).toContain("catalogue-hero");
    expect(catalogue).toContain("catalogue-surface");
    expect(catalogue).toContain("catalogue-chip");
    expect(templates).toContain("source-ledger-panel");
    expect(templates).toContain("source-evidence-panel");
    expect(inventory).toContain("inventory-ledger");
    expect(styles).toContain(".catalogue-row");
    expect(styles).toContain(".source-ledger-row");
    expect(styles).toContain(".source-evidence-row");
    expect(styles).toContain(".inventory-ledger-row");
  });
});
