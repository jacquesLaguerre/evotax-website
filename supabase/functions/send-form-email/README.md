# send-form-email

Replaces the old n8n webhooks. The site's client-side JS calls this Supabase
Edge Function (via `_sb.functions.invoke('send-form-email', ...)`) right
after each form's data is saved to Supabase. This function sends the
notification email through [Resend](https://resend.com) instead — all three
form types notify the same inbox, `yassin@evotax.us`.

| Form | Supabase table |
|---|---|
| Job application | `preparer_applications` |
| Tax submission | `tax_submissions` |
| Contact form | `contact_messages` |

**Deployed:** version 1 is live on the `asbdodzmqdvxjbdsnnhq` project.

## Remaining one-time setup

1. **Set the Resend API key as a Supabase secret** (never put this in the
   client-side site code) — not done yet as of this writing, confirmed by
   testing the deployed function (`{"error":"RESEND_API_KEY is not
   configured"}`):
   ```
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx --project-ref asbdodzmqdvxjbdsnnhq
   ```
   Or via Dashboard → Edge Functions → `send-form-email` → Secrets. No MCP
   tool exists for setting Edge Function secrets, so this has to be done via
   the CLI or Dashboard directly.
2. **Verify the sending domain in Resend.** In the Resend dashboard, add
   `evotaxadmin.com` (or a subdomain like `mail.evotaxadmin.com`) and add the
   SPF/DKIM DNS records it gives you to the domain's DNS. Sending will fail,
   or land in spam, until this is verified. `yassin@evotax.us` is just the
   destination inbox — it needs no setup of its own.
3. **Drop the leftover n8n trigger** (migration
   `0005_drop_legacy_n8n_tax_trigger.sql`) — written but **not yet applied**
   to the DB (the apply was declined when attempted). Until it's dropped,
   every tax submission still POSTs to the old n8n webhook
   (`https://jacqueslaguerre.app.n8n.cloud/webhook/evotax-tax-submission`)
   *in addition to* this function, so tax submissions will double-notify
   once the Resend secret above is set. Run the migration's SQL in the
   Supabase SQL editor, or re-approve the migration apply.

## Redeploying after a code change

```
supabase functions deploy send-form-email --project-ref asbdodzmqdvxjbdsnnhq
```
(No CLI installed locally? Paste `index.ts` directly into Supabase Dashboard
→ Edge Functions → `send-form-email`.)

## Changing the sender address

`FROM_ADDRESS` in `index.ts` is currently
`Evotax Notifications <notifications@evotaxadmin.com>` for all three form
types. Update it once you know what you want the "from" name/address to be
site-wide (must be on the verified domain).
