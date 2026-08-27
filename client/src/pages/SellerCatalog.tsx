import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AlertTriangle, Ban, CalendarClock, PackagePlus, ShieldCheck, ShieldX, ShoppingBag, Tag, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * WINDOW S1 — Seller catalog + purchase-in. The INBOUND side of the B2B shop:
 * what the operator stocks to sell to clinics. Listing and sale are gated by the
 * existing market evidence gate and by batch expiry (fail-closed, logged refusals).
 * Pricing is OPERATOR CONTENT: a missing note renders as "Price set by operator";
 * this page never invents a number.
 */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#64716b]">{label}</span>{children}</label>;
}

function ExpiryBadge({ state }: { state: string }) {
  if (state === "expired") return <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"><Ban className="size-3" /> Expired — blocked from sale</span>;
  if (state === "near_expiry") return <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"><CalendarClock className="size-3" /> Near expiry</span>;
  if (state === "no_expiry_recorded") return <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"><Ban className="size-3" /> No expiry — blocked</span>;
  return <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">In date</span>;
}

function StockBadge({ state, onHand, unit }: { state: string; onHand: number; unit: string }) {
  if (state === "out_of_stock") return <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"><TrendingDown className="size-3" /> Out of stock</span>;
  if (state === "low_stock") return <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"><TrendingDown className="size-3" /> Low stock · {onHand} {unit}</span>;
  return <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{onHand} {unit} on hand</span>;
}

export default function SellerCatalog() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const workspace = trpc.workspace.overview.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const isAdmin = workspace.data?.membership.role === "admin";
  const catalog = trpc.shop.sellerCatalog.useQuery(undefined, { enabled: isAuthenticated });
  const alerts = trpc.shop.stockAlerts.useQuery(undefined, { enabled: isAuthenticated });
  const orders = trpc.supplierOps.purchaseOrders.useQuery(undefined, { enabled: isAuthenticated && isAdmin });
  const refresh = () => { utils.shop.sellerCatalog.invalidate(); utils.shop.stockAlerts.invalidate(); utils.supplierOps.purchaseOrders.invalidate(); };

  const listLot = trpc.shop.listLotForSale.useMutation({ onSuccess: () => { toast.success("Lot listed for sale — evidence and expiry gates passed"); refresh(); }, onError: error => toast.error(error.message) });
  const delist = trpc.shop.delistLot.useMutation({ onSuccess: () => { toast.success("Lot removed from the seller catalog"); refresh(); }, onError: error => toast.error(error.message) });
  const sell = trpc.shop.recordSale.useMutation({ onSuccess: result => { toast.success(`Sale recorded — ${result.onHand} on hand remaining`); refresh(); }, onError: error => toast.error(error.message) });
  const savePriceNote = trpc.shop.setSellPriceNote.useMutation({ onSuccess: () => { toast.success("Operator price note saved"); refresh(); }, onError: error => toast.error(error.message) });

  const [saleQuantities, setSaleQuantities] = useState<Record<number, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});

  if (!isAuthenticated) return <main className="workspace-page"><section className="clinical-panel p-8"><h1 className="serif text-4xl text-[#24453e]">Sign in to manage the seller catalog</h1><p className="mt-3 text-sm text-muted-foreground">Stock, batch expiry, and sale listings are visible only in the authenticated clinic workspace.</p></section></main>;

  const alertData = alerts.data;
  const alertCount = alertData ? alertData.expired.length + alertData.nearExpiry.length + alertData.lowStock.length + alertData.missingExpiry.length : 0;

  return <main className="workspace-page space-y-7">
    <section className="clinical-panel relative overflow-hidden p-8">
      <div className="relative grid gap-6 xl:grid-cols-[1.25fr_.75fr] xl:items-end">
        <div>
          <div className="supply-hero-kicker"><ShoppingBag className="size-3.5" /> Seller catalog</div>
          <h1 className="serif mt-5 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-tight text-[#24453e] sm:text-5xl">Stock you can stand behind, <em className="font-normal">batch by batch.</em></h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5e6c66]">What is bought to resell: purchases become expiry-tracked lots, and only evidence-approved, in-date batches can be listed or sold. Refusals are fail-closed and logged.</p>
        </div>
        <div className="supply-hero-assurance"><ShieldCheck className="size-5 text-[#a56f25]" /><div><p className="text-sm font-semibold text-[#24453e]">Evidence gate applies to sales</p><p className="mt-1 text-xs leading-5 text-[#64716b]">A device or injectable without approved market evidence cannot be listed. Expired lots are blocked from sale automatically.</p></div></div>
      </div>
    </section>

    <section className="clinical-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e8e3d9] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="metric-label">Batch and stock watch</p><h2 className="serif mt-1 text-3xl text-[#24453e]">Expiry and stock alerts</h2></div>
        <span className={`ledger-status ${alertCount ? "ledger-status-attention" : ""}`}>{alertCount} open</span>
      </div>
      {alerts.isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading batch states…</div> : !alertData || alertCount === 0 ? <div className="p-6 text-sm text-muted-foreground">No expired, near-expiry, or low-stock lots right now. Alerts appear here as soon as a batch approaches its expiry date ({catalog.data?.[0]?.nearExpiryDays ?? 90} days ahead) or stock runs low.</div> : <div className="divide-y divide-[#ece7df]">
        {[...alertData.expired.map(item => ({ ...item, kind: "Expired — blocked from sale", tone: "text-red-700" })), ...alertData.missingExpiry.map(item => ({ ...item, kind: "No expiry recorded — blocked", tone: "text-red-700" })), ...alertData.nearExpiry.map(item => ({ ...item, kind: "Near expiry", tone: "text-amber-700" })), ...alertData.lowStock.map(item => ({ ...item, kind: item.stockState === "out_of_stock" ? "Out of stock" : "Low stock", tone: "text-amber-700" }))].map(item => <div key={`${item.kind}-${item.lotId}`} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium text-[#24453e]">{item.productName} · lot {item.lotNumber}</p><p className="mt-1 text-xs text-muted-foreground">Expiry {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : "not recorded"} · {item.onHand} {item.quantityUnit} on hand{item.isListed ? " · listed" : ""}</p></div>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${item.tone}`}><AlertTriangle className="size-3.5" /> {item.kind}</span>
        </div>)}
      </div>}
    </section>

    <section className="clinical-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e8e3d9] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="metric-label">Sellable products</p><h2 className="serif mt-1 text-3xl text-[#24453e]">Catalog with market evidence</h2></div>
      </div>
      {catalog.isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading the seller catalog…</div> : !catalog.data?.length ? <div className="p-6 text-sm text-muted-foreground">No products yet. Products enter the seller catalog once a governed source exists under Templates &amp; sources; stock arrives through the purchase-in flow below.</div> : <div className="divide-y divide-[#ece7df]">
        {catalog.data.map(entry => <div key={entry.product.id} className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-[#24453e]">{entry.product.name} <span className="text-xs text-muted-foreground">· {entry.product.manufacturer} · {entry.product.category.replaceAll("_", " ")}</span></p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {entry.sellable ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"><ShieldCheck className="size-3" /> Market evidence approved</span> : <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-700"><ShieldX className="size-3" /> Not sellable — {entry.source.reviewStatus !== "approved" ? "source not approved" : entry.evidenceGate.message}</span>}
                <span className="text-muted-foreground">Source #{entry.source.id} · {entry.source.documentKind.toUpperCase()} · {entry.source.jurisdiction}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="inline-flex items-center gap-1 text-sm font-medium text-[#24453e]"><Tag className="size-3.5 text-[#a56f25]" /> {entry.product.sellPriceNote || "Price set by operator"}</p>
              {isAdmin && <div className="mt-2 flex items-center gap-2">
                <Input className="h-8 w-48 text-xs" placeholder="Operator price note" value={priceDrafts[entry.product.id] ?? entry.product.sellPriceNote ?? ""} onChange={event => setPriceDrafts({ ...priceDrafts, [entry.product.id]: event.target.value })} />
                <Button size="sm" variant="outline" disabled={savePriceNote.isPending} onClick={() => savePriceNote.mutate({ productId: entry.product.id, sellPriceNote: (priceDrafts[entry.product.id] ?? entry.product.sellPriceNote ?? "").trim() || null })}>Save</Button>
              </div>}
            </div>
          </div>
          {!entry.lots.length ? <p className="mt-4 rounded-xl border border-[#e6ddca] bg-[#fcf8ed] p-3 text-xs leading-5 text-[#6c6047]">No stock lots yet for this product. Receive a purchase-order line below to create the first expiry-tracked batch.</p> : <div className="mt-4 space-y-2">
            {entry.lots.map(lot => <div key={lot.id} className="flex flex-col gap-3 rounded-xl border border-[#ece7df] bg-white/60 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-[#24453e]">Lot {lot.lotNumber} <span className="text-xs text-muted-foreground">· expiry {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : "not recorded"}</span></p>
                <p className="mt-1 flex flex-wrap items-center gap-2"><ExpiryBadge state={lot.expiryState} /><StockBadge state={lot.stockState} onHand={lot.onHand} unit={lot.quantityUnit} />{lot.isListed && <span className="inline-flex items-center rounded-md bg-[#24453e] px-2 py-0.5 text-xs font-medium text-white">Listed for sale</span>}</p>
                <p className="mt-1 text-xs text-muted-foreground">{lot.supplierName ? `Bought from ${lot.supplierName}` : "Supplier not recorded (pre-shop lot)"}{lot.unitCostBought ? ` at ${lot.unitCostBought} ${lot.costCurrency || ""}/unit` : ""} · received {lot.receivedQuantity} · sold {lot.soldQuantity}</p>
                {lot.delistedAt && <p className="mt-1 text-xs text-amber-700">Delisted: {lot.delistReason}</p>}
              </div>
              {isAdmin && <div className="flex flex-wrap items-center gap-2">
                {!lot.isListed && <Button size="sm" className="bg-[#24453e] text-white" disabled={listLot.isPending || lot.saleBlocked} title={lot.saleBlocked ? "Blocked: expired, unapproved evidence, or no stock" : undefined} onClick={() => listLot.mutate({ inventoryLotId: lot.id })}>List for sale</Button>}
                {!lot.isListed && lot.saleBlocked && <span className="text-xs text-red-700">Listing blocked (gate)</span>}
                {lot.isListed && <>
                  <Input className="h-8 w-24 text-xs" type="number" min="0.01" step="0.01" placeholder={`Qty (${lot.quantityUnit})`} value={saleQuantities[lot.id] ?? ""} onChange={event => setSaleQuantities({ ...saleQuantities, [lot.id]: event.target.value })} />
                  <Button size="sm" variant="outline" disabled={sell.isPending || !Number(saleQuantities[lot.id])} onClick={() => sell.mutate({ inventoryLotId: lot.id, quantity: Number(saleQuantities[lot.id]) })}>Record sale</Button>
                  <Button size="sm" variant="ghost" disabled={delist.isPending} onClick={() => delist.mutate({ inventoryLotId: lot.id, reason: "Removed by operator from seller catalog" })}>Delist</Button>
                </>}
              </div>}
            </div>)}
          </div>}
        </div>)}
      </div>}
    </section>

    {isAdmin && <PurchaseIn orders={orders.data || []} onReceived={refresh} />}
  </main>;
}

function PurchaseIn({ orders, onReceived }: { orders: any[]; onReceived: () => void }) {
  const receive = trpc.shop.receivePurchaseLine.useMutation({ onSuccess: result => { toast.success(result.expiryState === "expired" ? "Receipt recorded — lot is ALREADY EXPIRED and stays blocked from sale" : "Purchase received into an expiry-tracked lot"); onReceived(); setForm({ ...form, lotNumber: "", expiryDate: "", receivedQuantity: "", unitCostBought: "" }); }, onError: error => toast.error(error.message) });
  const openLines = useMemo(() => orders.flatMap(entry => entry.lines.filter((item: any) => !item.line.receivedQuantity || !item.lots?.length).map((item: any) => ({ order: entry.order, line: item.line, product: item.product }))), [orders]);
  const [form, setForm] = useState({ purchaseOrderLineId: "", receivedQuantity: "", lotNumber: "", expiryDate: "", unitCostBought: "", costCurrency: "PLN", supplierName: "" });
  const selected = openLines.find(item => String(item.line.id) === form.purchaseOrderLineId);

  return <section className="clinical-panel p-6">
    <div className="flex items-start justify-between gap-4">
      <div><p className="metric-label">Purchase-in</p><h2 className="serif mt-1 text-3xl text-[#24453e]">Receive stock with provenance</h2></div>
      <PackagePlus className="size-5 text-[#b7904c]" />
    </div>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Receiving a purchase-order line creates a batch lot. Supplier, unit cost bought, and expiry date are mandatory — a receipt missing any of them is refused (cost provenance gate).</p>
    {!openLines.length ? <p className="mt-4 rounded-xl border border-[#e6ddca] bg-[#fcf8ed] p-3 text-xs leading-5 text-[#6c6047]">No open purchase-order lines to receive. Raise a purchase order under Supplier governance first; its lines become receivable here.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Field label="Purchase-order line"><select className="catalogue-select w-full" value={form.purchaseOrderLineId} onChange={event => { const next = openLines.find(item => String(item.line.id) === event.target.value); setForm({ ...form, purchaseOrderLineId: event.target.value, receivedQuantity: next ? String(next.line.expectedQuantity) : form.receivedQuantity, lotNumber: next?.line.expectedLotNumber || form.lotNumber }); }}><option value="">Choose a line…</option>{openLines.map(item => <option key={item.line.id} value={item.line.id}>{item.order.purchaseOrderNumber} · {item.product.name} · expect {item.line.expectedQuantity} {item.line.quantityUnit}</option>)}</select></Field>
      <Field label="Received quantity"><Input type="number" min="0.01" step="0.01" value={form.receivedQuantity} onChange={event => setForm({ ...form, receivedQuantity: event.target.value })} /></Field>
      <Field label="Lot number"><Input value={form.lotNumber} onChange={event => setForm({ ...form, lotNumber: event.target.value })} placeholder="e.g. A2311-07" /></Field>
      <Field label="Expiry date"><Input type="date" value={form.expiryDate} onChange={event => setForm({ ...form, expiryDate: event.target.value })} /></Field>
      <Field label="Unit cost bought"><Input type="number" min="0.01" step="0.01" value={form.unitCostBought} onChange={event => setForm({ ...form, unitCostBought: event.target.value })} placeholder="per unit" /></Field>
      <Field label="Currency"><Input maxLength={3} value={form.costCurrency} onChange={event => setForm({ ...form, costCurrency: event.target.value.toUpperCase() })} /></Field>
      <Field label="Supplier (defaults to the order's supplier)"><Input value={form.supplierName} onChange={event => setForm({ ...form, supplierName: event.target.value })} placeholder={selected?.order.supplierName || "Supplier name"} /></Field>
    </div>}
    {openLines.length > 0 && <div className="mt-5"><Button className="bg-[#24453e] text-white" disabled={receive.isPending || !form.purchaseOrderLineId || !form.lotNumber || !form.expiryDate || !Number(form.receivedQuantity) || !Number(form.unitCostBought)} onClick={() => receive.mutate({ purchaseOrderLineId: Number(form.purchaseOrderLineId), receivedQuantity: Number(form.receivedQuantity), lotNumber: form.lotNumber.trim(), expiryDate: new Date(`${form.expiryDate}T00:00:00.000Z`), unitCostBought: Number(form.unitCostBought), costCurrency: form.costCurrency || "PLN", supplierName: form.supplierName.trim() || undefined })}>Receive into stock</Button></div>}
  </section>;
}
