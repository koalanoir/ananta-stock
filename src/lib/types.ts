export type StockKind = "commercialise" | "outil";
export type StockStatus = "ok" | "surveillance" | "rupture";
export type MovementType = "entree" | "sortie" | "perte" | "ajustement";

export type StockItem = {
  id: string;
  name: string;
  category: string;
  kind: StockKind;
  unit: string;
  quantity: number;
  threshold: number;
  unitCost: number;
};

export type StockMovement = {
  id: string;
  itemName: string;
  type: MovementType;
  delta: number;
  author: string;
  occurredAt: string;
  reason?: string;
};

export function getStockStatus(item: Pick<StockItem, "quantity" | "threshold">): StockStatus {
  if (item.quantity <= 0) return "rupture";
  if (item.quantity <= item.threshold) return "surveillance";
  return "ok";
}

export function formatCurrency(value: number, currency = "XAF") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
