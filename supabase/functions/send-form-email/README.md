# send-form-email

Replaces the old n8n webhooks. The site's client-side JS calls this Supabase
Edge Function (via `_sb.functions.invoke('send-form-email', ...)`) right
after each form's data is saved to Supabase. This function sends the
notification email through [Resend](https://resend.com) instead.

| Form | Supabase table | Notified inbox |
|---|---|---|
| Job application | `preparer_applications` | `jobapplication@evotaxadmin.com` |
| Tax submission | `tax_submissions` | `taxsubmission@evotaxadmin.com` |
| Contact form | `contact_messages` | `contact@evotaxadmin.com` |

## One-time setup

1. **Verify the sending domain in Resend.** In the Resend dashboard, add
   `evotaxadmin.com` (or a subdomain like `mail.evotaxadmin.com`) and add the
   SPF/DKIM DNS records it gives you to the domain's DNS. Sending will fail,
   or land in spam, until this is verified.
2. **Set up the three mailboxes.** Resend only *sends* mail — it doesn't
   provide inboxes. `jobapplication@`, `taxsubmission@`, and
   `contact@evotaxadmin.com` need to be real mailboxes somewhere (Google
   Workspace, Zoho Mail, etc.) with MX records pointed at that provider, or
   the notifications will have nowhere to land.
3. **Set the Resend API key as a Supabase secret** (never put this in the
   client-side site code):
   ```
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx --project-ref asbdodzmqdvxjbdsnnhq
   ```
4. **Deploy the function:**
   ```
   supabase functions deploy send-form-email --project-ref asbdodzmqdvxjbdsnnhq
   ```
   (No CLI installed locally? You can also paste `index.ts` directly into
   Supabase Dashboard → Edge Functions → Create a new function, and add the
   `RESEND_API_KEY` secret under Edge Functions → Manage secrets.)

## Changing the sender address

`FROM_ADDRESS` in `index.ts` is currently
`Evotax Notifications <notifications@evotaxadmin.com>` for all three form
types. Update it once you know what you want the "from" name/address to be
site-wide (must be on the verified domain).
