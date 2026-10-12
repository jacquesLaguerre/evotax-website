-- Which of the source document's three "CHOOSE ONE" compensation
-- structures applies to this specific contract, decided by the admin at
-- send time (not by the signer) — plus the dollar amounts that structure
-- needs. 'percentage' needs none (fixed 30/35/40 tiers); 'manager' and
-- 'flat_fee' need the hourly rate + flat-fee-per-client; 'manager' alone
-- also needs the deposit.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor) against
-- the "Evotax Back end" project.

alter table public.contract_signatures
  add column if not exists compensation_type text check (compensation_type in ('manager', 'flat_fee', 'percentage')),
  add column if not exists comp_hourly_rate numeric,
  add column if not exists comp_deposit numeric,
  add column if not exists comp_flat_fee numeric;

-- get_contract_signature needs to return the new columns too.
drop function if exists public.get_contract_signature(text);

create or replace function public.get_contract_signature(p_token text)
returns table (
    recipient_name text,
    field_values jsonb,
    signature_data_url text,
    status text,
    signed_at timestamptz,
    compensation_type text,
    comp_hourly_rate numeric,
    comp_deposit numeric,
    comp_flat_fee numeric
)
language sql
security definer
set search_path = public
as $$
    select recipient_name, field_values, signature_data_url, status, signed_at,
           compensation_type, comp_hourly_rate, comp_deposit, comp_flat_fee
    from public.contract_signatures
    where token = p_token;
$$;

grant execute on function public.get_contract_signature(text) to anon;
