// Supabase Edge Function: send-form-email
//
// Replaces the old n8n webhooks (both the client-side fetch() calls, long
// gone, and a leftover server-side DB trigger on tax_submissions that was
// still quietly POSTing to n8n — dropped in migration 0005). Called from
// the site's client-side JS after a form's data is already saved to
// Supabase. Sends a notification email via Resend to yassin@evotax.us.
// The card-style template below matches the original n8n email design.
//
// Deploy:
//   supabase functions deploy send-form-email
// Secret (one time) — named evotax_email in this project's Supabase
// secrets, not the more conventional RESEND_API_KEY:
//   supabase secrets set evotax_email=re_xxxxxxxxxxxx
//
// Required in Resend before this will actually deliver mail: verify the
// sending domain (evotaxadmin.com, or a subdomain like mail.evotaxadmin.com)
// in the Resend dashboard — add the SPF/DKIM DNS records it gives you.
// yassin@evotax.us is just the destination inbox and needs no setup itself.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Read lazily, inside the handler, rather than once at module load — so a
// secret added/changed after the isolate warmed up is picked up on the next
// request instead of needing a redeploy.
function getResendKey(): string | undefined {
  return Deno.env.get("evotax_email");
}

// Update this once the sending domain is verified in Resend.
const FROM_ADDRESS = "Evotax Notifications <notifications@evotaxadmin.com>";

// All three form types notify the same inbox.
const RECIPIENT = "yassin@evotax.us";

const ADMIN_PANEL_URL = "https://evotaxadmin.com";

const SITE_LINK = `<a href="https://evotax.us" style="color:#7eb6ff;text-decoration:underline;">evotax.us</a>`;
const ADMIN_LINK = `<a href="${ADMIN_PANEL_URL}" style="color:#2563eb;text-decoration:none;font-weight:700;">EVOTAX Admin Panel</a>`;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(str: unknown): string {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function mailtoLink(email: string): string {
  return `<a href="mailto:${esc(email)}" style="color:#2563eb;text-decoration:none;">${esc(email)}</a>`;
}

// One row of the label/value table. `last` drops the row's bottom divider.
function row(label: string, valueHtml: string, last = false): string {
  const border = last ? "" : "border-bottom:1px solid #e9ebef;";
  return `<tr>
    <td style="padding:14px 0;${border}font-size:15px;color:#6b7280;width:160px;vertical-align:top;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${esc(label)}</td>
    <td style="padding:14px 0 14px 16px;${border}font-size:15px;color:#111827;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${valueHtml}</td>
  </tr>`;
}

// The card: dark header (title + subtitle), light body (the rows table),
// white footer with a link to the admin panel.
function wrapEmail(headerBg: string, title: string, subtitleHtml: string, rowsHtml: string, footerHtml: string): string {
  return `<div style="background:#ffffff;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;border-collapse:separate;">
    <tr>
      <td style="background:${headerBg};padding:28px 32px;">
        <div style="font-size:26px;font-weight:800;color:#ffffff;line-height:1.3;">${esc(title)}</div>
        <div style="margin-top:8px;font-size:15px;color:rgba(255,255,255,.65);line-height:1.5;">${subtitleHtml}</div>
      </td>
    </tr>
    <tr>
      <td style="background:#f8f9fb;padding:24px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${rowsHtml}
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;padding:20px 32px 26px;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:14px;color:#6b7280;line-height:1.6;">${footerHtml}</div>
      </td>
    </tr>
  </table>
</div>`;
}

// Plain-text alternative, required alongside the HTML part — an HTML-only
// email with no text version is itself a spam signal, on top of being the
// right thing to send for text-only mail clients.
function plainText(title: string, subtitle: string, pairs: [string, string][], footer: string): string {
  const lines = pairs.map(([label, value]) => `${label}: ${value}`);
  return [title, subtitle, "", ...lines, "", footer].join("\n");
}

// deno-lint-ignore no-explicit-any
function buildEmail(type: string, data: any): { subject: string; html: string; text: string } | null {
  switch (type) {
    case "job-application": {
      const rows = [
        row("Name", `<strong>${esc(data.full_name)}</strong>`),
        row("Email", mailtoLink(data.email)),
        row("Phone", esc(data.phone)),
        row("Social Media", esc(data.social_media || "Not provided")),
        row(
          "Resume",
          data.resume_url
            ? `<a href="${esc(data.resume_url)}" style="color:#2563eb;text-decoration:none;font-weight:700;">${esc(data.resume_name || "Download")}</a>`
            : "Not provided",
          true
        ),
      ].join("\n");
      return {
        subject: `New Job Application — ${data.full_name || "Unknown"}`,
        html: wrapEmail(
          "#1e3b60",
          "New Job Application",
          `Someone just applied to become a tax preparer on ${SITE_LINK}`,
          rows,
          `Log in to the ${ADMIN_LINK} to review the full application.`
        ),
        text: plainText(
          "New Job Application",
          "Someone just applied to become a tax preparer on evotax.us",
          [
            ["Name", data.full_name || ""],
            ["Email", data.email || ""],
            ["Phone", data.phone || ""],
            ["Social Media", data.social_media || "Not provided"],
            ["Resume", data.resume_url || "Not provided"],
          ],
          `Log in to the EVOTAX Admin Panel to review the full application: ${ADMIN_PANEL_URL}`
        ),
      };
    }

    case "tax-submission": {
      const fileCount = Array.isArray(data.files) ? data.files.length : 0;
      const rows = [
        row("Name", `<strong>${esc(data.name)}</strong>`),
        row("Email", mailtoLink(data.email)),
        row("Phone", esc(data.phone)),
        row("Filing Status", esc(data.filing_status || "Not provided")),
        row("Files Uploaded", `${fileCount} document(s)`),
        row("Assigned To", esc(data.assistant || "Not assigned"), true),
      ].join("\n");
      return {
        subject: `New Tax Submission — ${data.name || "Unknown"}`,
        html: wrapEmail(
          "#0e1e3d",
          "New Tax Submission",
          `A client just submitted their tax documents on ${SITE_LINK}`,
          rows,
          `Log in to the ${ADMIN_LINK} to review the full submission and uploaded documents.`
        ),
        text: plainText(
          "New Tax Submission",
          "A client just submitted their tax documents on evotax.us",
          [
            ["Name", data.name || ""],
            ["Email", data.email || ""],
            ["Phone", data.phone || ""],
            ["Filing Status", data.filing_status || "Not provided"],
            ["Files Uploaded", `${fileCount} document(s)`],
            ["Assigned To", data.assistant || "Not assigned"],
          ],
          `Log in to the EVOTAX Admin Panel to review the full submission and uploaded documents: ${ADMIN_PANEL_URL}`
        ),
      };
    }

    case "contact": {
      const rows = [
        row("Name", `<strong>${esc(data.name)}</strong>`),
        row("Email", mailtoLink(data.email)),
        row("Message", esc(data.message).replace(/\n/g, "<br>"), true),
      ].join("\n");
      return {
        subject: `New Contact Message — ${data.name || "Unknown"}`,
        html: wrapEmail(
          "#1e3b60",
          "New Contact Message",
          `Someone just submitted the contact form on ${SITE_LINK}`,
          rows,
          `Log in to the ${ADMIN_LINK} to review the full message.`
        ),
        text: plainText(
          "New Contact Message",
          "Someone just submitted the contact form on evotax.us",
          [
            ["Name", data.name || ""],
            ["Email", data.email || ""],
            ["Message", data.message || ""],
          ],
          `Log in to the EVOTAX Admin Panel to review the full message: ${ADMIN_PANEL_URL}`
        ),
      };
    }

    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const RESEND_API_KEY = getResendKey();
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "evotax_email secret is not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const { type, ...data } = await req.json();
    if (!["job-application", "tax-submission", "contact"].includes(type)) {
      return new Response(JSON.stringify({ error: `Unknown form type: ${type}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const email = buildEmail(type, data);
    if (!email) {
      return new Response(JSON.stringify({ error: "Could not build email" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const replyTo = typeof data.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
      ? data.email
      : undefined;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [RECIPIENT],
        reply_to: replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      return new Response(JSON.stringify({ error: "Resend request failed", detail }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
