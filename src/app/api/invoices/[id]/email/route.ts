import { NextResponse } from "next/server";
import { createInvoicePdf, type InvoiceDocument } from "@/lib/invoices";
import { getResendClient } from "@/lib/resend";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const supabase = await getSupabaseServerClient();
  const resend = getResendClient();
  const from = process.env.INVOICE_FROM_EMAIL;

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase n’est pas configuré." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!resend || !from) {
    return NextResponse.json(
      {
        error:
          "L’envoi d’e-mails nécessite RESEND_API_KEY et INVOICE_FROM_EMAIL dans Vercel.",
      },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      total_amount,
      created_at,
      email_status,
      table_reference,
      store:stores(name, currency),
      customer:customers(id, full_name, email, phone),
      seller:profiles!invoices_seller_id_fkey(full_name),
      invoice_items(item_id, description, quantity, unit_price, line_total)
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Facture introuvable." },
      { status: 404 },
    );
  }

  const raw = data as unknown as InvoiceDocument & {
    store: { name: string; currency: string } | null;
  };

  if (!raw.customer?.email) {
    return NextResponse.json(
      { error: "Ce client n’a pas d’adresse e-mail." },
      { status: 400 },
    );
  }

  const invoice: InvoiceDocument = {
    ...raw,
    total_amount: Number(raw.total_amount),
    invoice_items: raw.invoice_items.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      line_total: Number(line.line_total),
    })),
  };

  const storeName = raw.store?.name ?? "Ananta Stock";
  const currency = raw.store?.currency ?? "XAF";
  const pdf = createInvoicePdf({ invoice, storeName, currency });
  const attachment = Buffer.from(pdf.output("arraybuffer"));

  const result = await resend.emails.send({
    from,
    to: raw.customer.email,
    subject: `Votre facture ${invoice.invoice_number} — ${storeName}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#14241e;line-height:1.6">
        <h1 style="font-size:22px">Votre facture ${invoice.invoice_number}</h1>
        <p>Bonjour ${escapeHtml(raw.customer.full_name)},</p>
        <p>Merci pour votre achat auprès de ${escapeHtml(storeName)}.</p>
        <p>Votre facture est jointe à cet e-mail au format PDF.</p>
        <p style="color:#777">Envoyé avec Ananta Stock.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: attachment,
      },
    ],
  });

  if (result.error) {
    await supabase.rpc("mark_invoice_email", {
      target_invoice_id: invoice.id,
      new_status: "failed",
    });

    return NextResponse.json(
      { error: result.error.message },
      { status: 502 },
    );
  }

  await supabase.rpc("mark_invoice_email", {
    target_invoice_id: invoice.id,
    new_status: "sent",
  });

  return NextResponse.json({ id: result.data?.id, status: "sent" });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
