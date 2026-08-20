export type InventoryLotSelection = { lotNumber: string; expiryDate: Date };

export function applyInventoryLotSelection(lot: InventoryLotSelection) {
  return { lotNumber: lot.lotNumber, expiryDate: new Date(lot.expiryDate).toISOString().slice(0, 10) };
}
