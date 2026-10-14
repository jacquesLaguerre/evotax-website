-- Retire the last n8n integration.
--
-- The site's client-side JS stopped calling n8n webhooks a while back (see
-- the send-form-email edge function), but a server-side DB trigger on
-- public.tax_submissions was still quietly POSTing every new tax
-- submission straight to n8n (added in migration
-- add_tax_submission_notification_trigger / tighten_rls_and_lock_notify_function,
-- long before this repo tracked migrations). That's the thing actually
-- still "sending the messages" via n8n to yassin@evotax.us.
--
-- The client-side notifyByEmail('tax-submission', ...) call already fires
-- on every submit and now goes through Resend (send-form-email) to the
-- same inbox, so this trigger is fully redundant. Dropping it.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor).

drop trigger if exists on_tax_submission_insert on public.tax_submissions;
drop function if exists public.notify_tax_submission();
