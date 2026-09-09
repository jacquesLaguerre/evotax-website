-- Leads: admin portal access.
--
-- 0001 only gave the site's anon key insert/update on partial leads. The
-- evotax-admin portal signs real users in (authenticated role), so it needs
-- its own policy to read and manage leads. This mirrors the
-- admin_all_contact policy on contact_messages: full access for users whose
-- user_roles.role is 'admin'. Contractors get nothing here.
--
-- Also adds archived_at so an admin can dismiss a followed-up lead from the
-- portal's active list without deleting the record.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor), after
-- 0001.

alter table public.leads add column if not exists archived_at timestamptz;
create index if not exists leads_archived_at_idx on public.leads (archived_at);

drop policy if exists "admin_all_leads" on public.leads;
create policy "admin_all_leads"
    on public.leads for all
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_roles.user_id = auth.uid()
              and user_roles.role = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_roles
            where user_roles.user_id = auth.uid()
              and user_roles.role = 'admin'
        )
    );
