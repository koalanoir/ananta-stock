"use client";

import { Download } from "lucide-react";

export type ExportMovement = {
  date: string;
  product: string;
  type: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  author: string;
};

type MovementExportButtonProps = {
  movements: ExportMovement[];
  storeName: string;
};

export function MovementExportButton({
  movements,
  storeName,
}: MovementExportButtonProps) {
  function exportCsv() {
    const headers = [
      "Date",
      "Article",
      "Mouvement",
      "Quantité",
      "Stock avant",
      "Stock après",
      "Motif",
      "Effectué par",
    ];

    const rows = movements.map((movement) => [
      movement.date,
      movement.product,
      movement.type,
      movement.quantity,
      movement.stockBefore,
      movement.stockAfter,
      movement.reason,
      movement.author,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(";"))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `mouvements-${slugify(storeName)}-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={exportCsv}
      disabled={!movements.length}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold shadow-sm transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
    >
      <Download size={17} aria-hidden="true" />
      Exporter en CSV
    </button>
  );
}

function escapeCsvCell(value: string | number) {
  const normalized = String(value).replaceAll('"', '""');
  return `"${normalized}"`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
