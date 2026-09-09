-- Leads: partial/abandoned form capture.
--
-- The tax submission and contact forms save a row here as soon as someone
-- has filled in the minimum identifying info (name + phone, or name +
-- email), even if they never finish/submit the form. This lets you follow
-- up on people who started but didn't complete.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor).

create table if not exists public.leads (
    id          uuid primary key default gen_random_uuid(),
    form_type   text not null check (form_type in ('tax-submission', 'contact')),
    session_id  text not null unique,
    name        text,
    email       text,
    phone       text,
    status      text not null default 'partial' check (status in ('partial', 'submitted')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists leads_status_idx    on public.leads (status);
create index if not exists leads_form_type_idx on public.leads (form_type);

create or replace function public.leads_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
    before update on public.leads
    for each row execute function public.leads_set_updated_at();

alter table public.leads enable row level security;

-- The site's anon key can create a partial lead...
drop policy if exists "Public can insert leads" on public.leads;
create policy "Public can insert leads"
    on public.leads for insert
    to anon
    with check (true);

-- ...and can keep updating it (as more fields get filled in, or to mark it
-- submitted) only while it's still 'partial'. Once a lead is 'submitted'
-- this policy no longer matches it, so it's effectively locked from the
-- public side.
drop policy if exists "Public can update partial leads" on public.leads;
create policy "Public can update partial leads"
    on public.leads for update
    to anon
    using (status = 'partial')
    with check (true);

-- Intentionally no SELECT (or DELETE) policy for anon: the anon key is
-- visible in the site's client-side code, so a public read policy here
-- would let anyone harvest every visitor's name/phone/email. View leads
-- via the Supabase Table Editor (or a future authenticated admin portal)
-- using the service role, which bypasses RLS.
