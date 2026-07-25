export type ProfitabilityLine = {
  quantity: number | string;
  line_total: number | string;
  line_cost: number | string;
  gross_margin: number | string;
  item: {
    id: string;
    name: string;
    brand: string;
    category: { id: string; name: string } | null;
  } | null;
};

export type ProfitabilitySale = {
  id: string;
  created_at: string;
  total_amount: number | string;
  sale_items: ProfitabilityLine[];
};

export type ProfitabilityLoss = {
  quantity_delta: number | string;
  created_at: string;
  item: {
    id: string;
    name: string;
    brand: string;
    unit_cost: number | string;
  } | null;
};

export type ProfitabilityRanking = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginRate: number;
};

export function calculateProfitability(
  sales: ProfitabilitySale[],
  losses: ProfitabilityLoss[],
  periodStart: string,
) {
  const periodSales = sales.filter((sale) => sale.created_at >= periodStart);
  const periodLosses = losses.filter((loss) => loss.created_at >= periodStart);
  const lines = periodSales.flatMap((sale) => sale.sale_items);
  const revenue = sum(lines, "line_total");
  const costOfGoods = sum(lines, "line_cost");
  const grossMargin = sum(lines, "gross_margin");
  const unitsSold = sum(lines, "quantity");
  const unitsLost = periodLosses.reduce(
    (total, loss) => total + Math.abs(Number(loss.quantity_delta)),
    0,
  );
  const lossCost = periodLosses.reduce(
    (total, loss) =>
      total +
      Math.abs(Number(loss.quantity_delta)) *
        Number(loss.item?.unit_cost ?? 0),
    0,
  );

  return {
    salesCount: periodSales.length,
    revenue,
    costOfGoods,
    grossMargin,
    marginRate: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
    estimatedProfit: grossMargin - lossCost,
    unitsSold,
    unitsLost,
    lossCost,
    products: buildRanking(lines, (line) => ({
      id: line.item?.id ?? "",
      name: line.item
        ? productName(line.item.name, line.item.brand)
        : "Article",
    })),
    categories: buildRanking(lines, (line) => ({
      id: line.item?.category?.id ?? "sans-categorie",
      name: line.item?.category?.name ?? "Sans catégorie",
    })),
    losses: periodLosses,
  };
}

function sum(
  lines: ProfitabilityLine[],
  field: "quantity" | "line_total" | "line_cost" | "gross_margin",
) {
  return lines.reduce((total, line) => total + Number(line[field]), 0);
}

function buildRanking(
  lines: ProfitabilityLine[],
  identify: (line: ProfitabilityLine) => { id: string; name: string },
) {
  const ranking = new Map<string, Omit<ProfitabilityRanking, "marginRate">>();

  for (const line of lines) {
    if (!line.item) continue;
    const identity = identify(line);
    const current = ranking.get(identity.id) ?? {
      ...identity,
      quantity: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
    };
    current.quantity += Number(line.quantity);
    current.revenue += Number(line.line_total);
    current.cost += Number(line.line_cost);
    current.margin += Number(line.gross_margin);
    ranking.set(identity.id, current);
  }

  return Array.from(ranking.values())
    .map((entry) => ({
      ...entry,
      marginRate:
        entry.revenue > 0 ? (entry.margin / entry.revenue) * 100 : 0,
    }))
    .sort((first, second) => second.margin - first.margin);
}

function productName(name: string, brand: string) {
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name;
  return `${name} ${brand}`;
}
