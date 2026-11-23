import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AuthError, requireStaff } from "@/lib/serverAuth";
import { getAdminOrder } from "@/lib/adminOrders";
import { buildPosReceiptFromOrder } from "@/lib/posReceipt";
import {
  MESSAGE_KINDS,
  billFromReceipt,
  emailHtml,
  getTemplate,
  messageVars,
  parseOccasionCoupons,
  plainForEmail,
  renderTemplate,
  withOccasionCoupons,
  toCustomer,
  toIssuedCoupon,
  validateEmail,
  type MessageKind,
} from "@/lib/messaging";

/**
 * Sends a bill / birthday / anniversary / offer email through a Gmail account
 * (GMAIL_USER + GMAIL_APP_PASSWORD). Staff may send bills; only admins send
 * the other kinds, and only to customers who agreed to receive offers.
 */
export async function POST(request: Request) {
  let body: { kind?: string; phone?: string; email?: string | null; orderId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = body.kind as MessageKind;
  if (!MESSAGE_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown message type" }, { status: 400 });
  }

  const gmailUser = process.env.GMAIL_USER?.trim();
  // Google shows App Passwords as "abcd efgh ijkl mnop"; SMTP wants the 16 letters only.
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      {
        error:
          "Email is not set up. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.local (a Gmail App Password, not the normal password) and restart the server.",
      },
      { status: 503 }
    );
  }

  let userId: string;
  try {
    ({ userId } = await requireStaff(request, kind === "BILL" ? ["admin", "manager", "staff"] : ["admin"]));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const admin = getSupabaseAdmin();
  const phone = String(body.phone ?? "").replace(/\D/g, "").slice(-10);
  let email = String(body.email ?? "").trim().toLowerCase();
  let name = "";
  let couponCode: string | null = null;

  const log = (status: "SENT" | "FAILED", error?: string) =>
    admin.from("message_log").insert({
      kind,
      channel: "EMAIL",
      phone: phone || null,
      email: email || null,
      customer_name: name || null,
      order_id: body.orderId ?? null,
      coupon_code: couponCode,
      status,
      error: error?.slice(0, 500) ?? null,
      sent_by: userId,
    });

  try {
    const { data: customerRow } = await admin.from("customers").select("*").eq("phone", phone).maybeSingle();
    const customer = toCustomer(customerRow as Record<string, unknown> | null);
    name = customer?.name ?? "";
    if (!email) email = customer?.email ?? "";
    if (!email) {
      return NextResponse.json({ error: "No email saved for this customer." }, { status: 400 });
    }
    const emailProblem = validateEmail(email);
    if (emailProblem) return NextResponse.json({ error: emailProblem }, { status: 400 });

    if (kind !== "BILL" && !customer?.marketing_opt_in) {
      return NextResponse.json(
        { error: "This customer hasn't agreed to receive offers." },
        { status: 400 }
      );
    }

    let bill = null;
    if (kind === "BILL") {
      if (!body.orderId) return NextResponse.json({ error: "Which bill?" }, { status: 400 });
      const order = await getAdminOrder(admin, body.orderId);
      if (!order) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
      bill = billFromReceipt(buildPosReceiptFromOrder(order, order.attended_by ?? ""));
      if (bill && order.created_at) {
        bill.dateLabel = new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }).format(new Date(order.created_at));
      }
      name = order.shipping?.customer_name || name;
    }

    const template = await getTemplate(admin, kind);
    const issued = await admin.rpc("_issue_customer_coupon", {
      p_kind: kind,
      p_phone: phone,
      p_order_id: body.orderId ?? null,
    });
    if (issued.error) throw new Error(issued.error.message);
    const coupon = toIssuedCoupon(issued.data);

    // Birthday / anniversary month: the bill email carries that coupon too (if 038 is run).
    let extras: ReturnType<typeof parseOccasionCoupons> = [];
    if (kind === "BILL") {
      const occasion = await admin.rpc("_bill_occasion_coupons", { p_phone: phone });
      if (!occasion.error) extras = parseOccasionCoupons(occasion.data);
    }
    couponCode = [coupon?.code, ...extras.map((extra) => extra.code)].filter(Boolean).join(", ") || null;

    const vars = messageVars({ name, bill, coupon });
    const subject = renderTemplate(template.email_subject, vars);
    const text = plainForEmail(withOccasionCoupons(renderTemplate(template.email_body, vars), extras));
    const boxes = [
      ...(coupon ? [{ label: kind === "BILL" ? "Next-visit gift" : "Your code", coupon }] : []),
      ...extras.map((extra) => ({
        label: extra.occasion === "BIRTHDAY" ? "Birthday gift" : "Anniversary gift",
        coupon: extra,
      })),
    ];

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transport.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || "Eshwari Vastra"}" <${gmailUser}>`,
      to: email,
      subject,
      text,
      html: emailHtml(text, boxes),
    });

    await log("SENT");
    return NextResponse.json({ ok: true, to: email, coupon: couponCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email could not be sent";
    console.error("[messages/email] failed", err);
    await log("FAILED", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
