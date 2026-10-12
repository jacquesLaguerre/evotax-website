-- Employment contract e-signature flow.
--
-- One contract (Independent Contractor Agreement for tax preparers) is sent
-- to approved preparer applicants. Content/layout is hardcoded in the
-- website's sign-contract.html (not stored here — "one contract for now",
-- no template library). Each send creates a row here with a unique token;
-- the signer fills in field_values + draws signature_data_url, then status
-- flips to 'signed'. Mirrors the leads table's security pattern: anon never
-- gets table-level SELECT/UPDATE, only two SECURITY DEFINER RPCs.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor) against
-- the "Evotax Back end" project.

create table if not exists public.contract_signatures (
    id              uuid primary key default gen_random_uuid(),
    application_id  uuid references public.preparer_applications(id) on delete set null,
    recipient_name  text not null,
    recipient_email text,
    token           text not null unique,
    field_values    jsonb,
    signature_data_url text,
    status          text not null default 'pending' check (status in ('pending', 'signed')),
    sent_at         timestamptz not null default now(),
    signed_at       timestamptz
);

create index if not exists contract_signatures_token_idx  on public.contract_signatures (token);
create index if not exists contract_signatures_status_idx on public.contract_signatures (status);

alter table public.contract_signatures enable row level security;

-- Admins: full access (listing sent contracts, viewing signed ones).
drop policy if exists "admin_all_contract_signatures" on public.contract_signatures;
create policy "admin_all_contract_signatures"
    on public.contract_signatures for all
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

-- No anon policies at all: the anon key is public in the site's client JS,
-- and a token-keyed SELECT/UPDATE policy would still let anyone enumerate
-- every pending contract's recipient name/email via a blank query. All
-- public access goes through the two RPCs below instead.

-- Look up one contract by its signing token (used to render the signing
-- page). Returns nothing if the token doesn't exist — never raises, so it
-- can't be used to distinguish "wrong token" from "network error".
create or replace function public.get_contract_signature(p_token text)
returns table (
    recipient_name text,
    field_values jsonb,
    status text,
    signed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select recipient_name, field_values, status, signed_at
    from public.contract_signatures
    where token = p_token;
$$;

grant execute on function public.get_contract_signature(text) to anon;

-- Submit the filled-in fields + signature for one contract. Only succeeds
-- while the contract is still 'pending' — once signed it's locked from the
-- public side, same as leads once 'submitted'.
create or replace function public.submit_contract_signature(
    p_token text,
    p_field_values jsonb,
    p_signature_data_url text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.contract_signatures
    set field_values = p_field_values,
        signature_data_url = p_signature_data_url,
        status = 'signed',
        signed_at = now()
    where token = p_token
      and status = 'pending';

    return found;
end;
$$;

grant execute on function public.submit_contract_signature(text, jsonb, text) to anon;
