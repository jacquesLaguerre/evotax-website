-- Replace the per-client flat fee and manager deposit with two optional rate
-- fields (monthly, bi-weekly) for the Flat-Fee and Manager compensation
-- structures. comp_deposit / comp_flat_fee are left in place (not dropped)
-- so already-signed contracts created before this change keep their data —
-- the admin UI and sign-contract.html just stop writing/reading them for new
-- or re-adjusted contracts going forward.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor) against
-- the "Evotax Back end" project.

alter table public.contract_signatures
  add column if not exists comp_monthly_rate  numeric,
  add column if not exists comp_biweekly_rate numeric;

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
    comp_flat_fee numeric,
    comp_monthly_rate numeric,
    comp_biweekly_rate numeric
)
language sql
security definer
set search_path = public
as $$
    select recipient_name, field_values, signature_data_url, status, signed_at,
           compensation_type, comp_hourly_rate, comp_deposit, comp_flat_fee,
           comp_monthly_rate, comp_biweekly_rate
    from public.contract_signatures
    where token = p_token;
$$;

grant execute on function public.get_contract_signature(text) to anon;
