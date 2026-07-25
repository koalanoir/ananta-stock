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
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 18;
  const right = 192;

  doc.setFillColor(31, 62, 50);
  doc.rect(0, 0, 210, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ANANTA STOCK", left, 15);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(storeName, left, 23);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURE", right, 15, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number, right, 23, { align: "right" });

  doc.setTextColor(20, 36, 30);
  doc.setFontSize(9);
  doc.text(
    `Émise le ${new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(invoice.created_at))}`,
    left,
    45,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Client", left, 57);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(invoice.customer?.full_name ?? "Client comptoir", left, 64);
  if (invoice.customer?.email) doc.text(invoice.customer.email, left, 70);
  if (invoice.customer?.phone) doc.text(invoice.customer.phone, left, 76);

  doc.setFont("helvetica", "bold");
  doc.text("Vendeur", 120, 57);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.seller?.full_name ?? "Équipe de vente", 120, 64);

  let y = 90;
  drawTableHeader(doc, y);
  y += 10;

  for (const line of invoice.invoice_items) {
    if (y > 260) {
      doc.addPage();
      y = 20;
      drawTableHeader(doc, y);
      y += 10;
    }

    doc.setTextColor(20, 36, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const description = doc.splitTextToSize(line.description, 82);
    doc.text(description, left, y);
    doc.text(formatQuantity(line.quantity), 118, y, { align: "right" });
    doc.text(formatMoney(line.unit_price, currency), 153, y, {
      align: "right",
    });
    doc.setFont("helvetica", "bold");
    doc.text(formatMoney(line.line_total, currency), right, y, {
      align: "right",
    });
    y += Math.max(10, description.length * 5);
    doc.setDrawColor(225, 218, 205);
    doc.line(left, y - 4, right, y - 4);
  }

  y = Math.min(273, y + 8);
  doc.setFillColor(247, 242, 234);
  doc.roundedRect(112, y - 7, 80, 20, 3, 3, "F");
  doc.setTextColor(20, 36, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", 120, y + 5);
  doc.setFontSize(13);
  doc.text(formatMoney(invoice.total_amount, currency), 186, y + 5, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(115, 112, 104);
  doc.text(
    "Merci pour votre confiance. Facture générée avec Ananta Stock.",
    105,
    289,
    { align: "center" },
  );

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
  doc.setFillColor(247, 242, 234);
  doc.roundedRect(18, y - 6, 174, 9, 2, 2, "F");
  doc.setTextColor(105, 104, 98);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ARTICLE", 22, y);
  doc.text("QTÉ", 118, y, { align: "right" });
  doc.text("PRIX UNIT.", 153, y, { align: "right" });
  doc.text("TOTAL", 188, y, { align: "right" });
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

