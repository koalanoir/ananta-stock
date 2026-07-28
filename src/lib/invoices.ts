import { jsPDF } from "jspdf";

export type InvoiceCustomer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export type InvoiceLine = {
  item_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type InvoiceDocument = {
  id: string;
  invoice_number: string;
  total_amount: number;
  created_at: string;
  table_reference?: string | null;
  email_status: "pending" | "sent" | "failed" | "not_requested";
  customer: InvoiceCustomer | null;
  seller: { full_name: string } | null;
  invoice_items: InvoiceLine[];
};

type InvoicePdfOptions = {
  invoice: InvoiceDocument;
  storeName: string;
  currency: string;
};

export function createInvoicePdf({
  invoice,
  storeName,
  currency,
}: InvoicePdfOptions) {
  const receiptHeight = Math.max(
    125,
    94 + invoice.invoice_items.reduce((height, line) => {
      return height + Math.max(7, Math.ceil(line.description.length / 27) * 4);
    }, 0),
  );
  const doc = new jsPDF({ unit: "mm", format: [80, receiptHeight] });
  const left = 6;
  const right = 74;

  doc.setTextColor(20, 24, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(doc.splitTextToSize(storeName, 39), left, 10);
  doc.setFontSize(12);
  doc.text("FACTURE", right, 10, { align: "right" });
  doc.setFontSize(7);
  doc.text(invoice.invoice_number, right, 15, { align: "right" });
  doc.setDrawColor(35, 35, 35);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(left, 23, right, 23);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Date : ${new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(invoice.created_at))}`,
    left,
    29,
  );
  let customerY = 35;
  if (invoice.table_reference) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Facturé à : ${invoice.table_reference}`, left, customerY);
    customerY += 6;
  } else if (invoice.customer) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Client : ${invoice.customer.full_name}`, left, customerY);
    customerY += 5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Vendeur : ${invoice.seller?.full_name ?? "Équipe de vente"}`, left, customerY);

  let y = customerY + 10;
  drawTableHeader(doc, y);
  y += 7;

  for (const line of invoice.invoice_items) {
    doc.setTextColor(20, 24, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const description = doc.splitTextToSize(line.description, 29);
    doc.text(description, left, y);
    doc.text(formatQuantity(line.quantity), 41, y, { align: "right" });
    doc.text(formatMoney(line.unit_price, currency), 56, y, {
      align: "right",
    });
    doc.setFont("helvetica", "bold");
    doc.text(formatMoney(line.line_total, currency), right, y, {
      align: "right",
    });
    y += Math.max(7, description.length * 4);
  }

  y += 3;
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(30, y, right, y);
  y += 8;
  doc.setTextColor(20, 24, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL :", 31, y);
  doc.text(formatMoney(invoice.total_amount, currency), right, y, {
    align: "right",
  });
  y += 10;
  doc.line(left, y, right, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Merci de votre visite chez ${storeName}.`, 40, y, { align: "center" });

  return doc;
}

export function downloadInvoicePdf(
  invoice: InvoiceDocument,
  storeName: string,
  currency: string,
) {
  createInvoicePdf({ invoice, storeName, currency }).save(
    `${invoice.invoice_number}.pdf`,
  );
}

function drawTableHeader(doc: jsPDF, y: number) {
  doc.setDrawColor(35, 35, 35);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(6, y - 5, 74, y - 5);
  doc.line(6, y + 2, 74, y + 2);
  doc.setTextColor(20, 24, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("ARTICLE", 6, y);
  doc.text("QTÉ", 41, y, { align: "right" });
  doc.text("P.U.", 56, y, { align: "right" });
  doc.text("TOTAL", 74, y, { align: "right" });
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 3,
  }).format(value);
}
