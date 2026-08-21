import React from "react";
import type { TreatmentMapConsentContext } from "@shared/treatmentMapContext";

export function TreatmentMapContextCards({ context, pointCount }: { context: TreatmentMapConsentContext; pointCount: number }) {
  return <div className="mt-5 grid gap-2 sm:grid-cols-4"><div className="rounded-xl bg-[#f7f5f0] p-3"><p className="metric-label">Product</p><p className="mt-1 text-xs font-semibold text-[#24453e]">{context.product.name}</p></div><div className="rounded-xl bg-[#f7f5f0] p-3"><p className="metric-label">Lot / expiry</p><p className="mt-1 text-xs font-semibold text-[#24453e]">{context.lotNumber} · {new Date(context.expiryDate).toLocaleDateString()}</p></div><div className="rounded-xl bg-[#f7f5f0] p-3"><p className="metric-label">Practitioner</p><p className="mt-1 text-xs font-semibold text-[#24453e]">{context.practitioner.displayName || "Clinic practitioner"}</p></div><div className="rounded-xl bg-[#f7f5f0] p-3"><p className="metric-label">Saved points</p><p className="mt-1 text-xs font-semibold text-[#24453e]">{pointCount}</p></div></div>;
}
