// Supabase Edge Function: send-form-email
//
// Replaces the old n8n webhooks. Called from the site's client-side JS
// after a form's data is already saved to Supabase. Sends a notification
// email via Resend to a dedicated inbox per form type, instead of routing
// everything through a personal email address.
//
// Deploy:
//   supabase functions deploy send-form-email
// Secret (one time):
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
//
// Required in Resend before this will actually deliver mail:
//   1. Verify the sending domain (evotaxadmin.com, or a subdomain like
//      mail.evotaxadmin.com) in the Resend dashboard — add the SPF/DKIM
//      DNS records it gives you.
//   2. Make sure jobapplication@ / taxsubmission@ / contact@evotaxadmin.com
//      are real mailboxes that receive mail (Resend only sends — you need
//      separate email hosting, e.g. Google Workspace or Zoho Mail, with MX
//      records on evotaxadmin.com for those addresses to actually exist).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Update this once the sending domain is verified in Resend.
const FROM_ADDRESS = "Evotax Notifications <notifications@evotaxadmin.com>";

const RECIPIENTS: Record<string, string> = {
  "job-application": "jobapplication@evotaxadmin.com",
  "tax-submission": "taxsubmission@evotaxadmin.com",
  "contact": "contact@evotaxadmin.com",
};

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

function row(label: string, value: unknown) {
  return `<p style="margin:0 0 10px;"><strong>${esc(label)}:</strong> ${value}</p>`;
}

// deno-lint-ignore no-explicit-any
function buildEmail(type: string, data: any): { subject: string; html: string } | null {
  switch (type) {
    case "job-application":
      return {
        subject: `New job application — ${data.full_name || "Unknown"}`,
        html: [
          "<h2>New Tax Preparer Application</h2>",
          row("Name", esc(data.full_name)),
          row("Email", esc(data.email)),
          row("Phone", esc(data.phone)),
          row("Social Media", esc(data.social_media || "—")),
          row(
            "Resume",
            data.resume_url
              ? `<a href="${esc(data.resume_url)}">${esc(data.resume_name || "Download")}</a>`
              : "—"
          ),
        ].join("\n"),
      };

    case "tax-submission": {
      const files = Array.isArray(data.files) && data.files.length
        ? data.files
            .map((f: any) => {
              const url = typeof f === "string" ? f : f.url;
              const name = typeof f === "string" ? f : (f.name || f.url);
              return `<a href="${esc(url)}">${esc(name)}</a>`;
            })
            .join("<br>")
        : "—";
      return {
        subject: `New tax document submission — ${data.name || "Unknown"}`,
        html: [
          "<h2>New Tax Submission</h2>",
          row("Name", esc(data.name)),
          row("Email", esc(data.email)),
          row("Phone", esc(data.phone)),
          row("Tax Year", esc(data.tax_year)),
          row("Assistant", esc(data.assistant || "—")),
          row("Files", files),
        ].join("\n"),
      };
    }

    case "contact":
      return {
        subject: `New contact form message — ${data.name || "Unknown"}`,
        html: [
          "<h2>New Contact Message</h2>",
          row("Name", esc(data.name)),
          row("Email", esc(data.email)),
          "<p><strong>Message:</strong></p>",
          `<p>${esc(data.message).replace(/\n/g, "<br>")}</p>`,
        ].join("\n"),
      };

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
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY is not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const { type, ...data } = await req.json();
    const to = RECIPIENTS[type];
    if (!to) {
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
        to: [to],
        reply_to: replyTo,
        subject: email.subject,
        html: email.html,
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
