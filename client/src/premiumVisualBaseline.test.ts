import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type SurfaceBaseline = { route: string; requiredClasses: string[]; requiredCopy: string[] };
type Baseline = { capturedViewports: { desktop: [number, number]; mobile: [number, number] }; imageArtifacts: Record<string, string>; surfaces: Record<string, SurfaceBaseline> };

const root = process.cwd();
const readProjectFile = (path: string) => readFile(join(root, path), "utf8");

describe("checked-in premium data-surface baseline", () => {
  it("preserves the desktop and mobile baseline contract for catalogue, sources, and inventory", async () => {
    const [baselineText, catalogue, templates, inventory, styles] = await Promise.all([
      readProjectFile("docs/visual-baselines/premium-data-surfaces.baseline.json"),
      readProjectFile("client/src/pages/MarketCatalogue.tsx"),
      readProjectFile("client/src/pages/Templates.tsx"),
      readProjectFile("client/src/components/InventoryRegister.tsx"),
      readProjectFile("client/src/index.css"),
    ]);
    const baseline = JSON.parse(baselineText) as Baseline;
    expect(baseline.capturedViewports).toEqual({ desktop: [1280, 720], mobile: [375, 812] });
    await Promise.all(Object.values(baseline.imageArtifacts).map(path => access(join(root, path))));
    const checksums = await readProjectFile(baseline.imageArtifacts.checksums);
    expect(checksums).toContain("catalogue-desktop.png");
    expect(checksums).toContain("source-library-desktop.png");
    expect(checksums).toContain("catalogue-mobile.png");
    expect(checksums).toContain("source-library-mobile.png");
    const contentBySurface: Record<string, string> = { catalogue, sourceLibrary: templates, inventoryLedger: inventory };
    for (const [surface, requirements] of Object.entries(baseline.surfaces)) {
      for (const token of requirements.requiredClasses) {
        expect(contentBySurface[surface]).toContain(token);
        expect(styles).toContain(`.${token}`);
      }
      for (const copy of requirements.requiredCopy) expect(contentBySurface[surface]).toContain(copy);
    }
  });
});
