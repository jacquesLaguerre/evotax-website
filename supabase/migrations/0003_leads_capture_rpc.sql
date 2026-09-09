-- Anonymous lead capture via SECURITY DEFINER RPCs.
--
-- Supersedes the two anon table policies from 0001. Those don't actually
-- work: the site's anon key has no SELECT policy on public.leads (on
-- purpose - the anon key is public in the site's JS, and a SELECT policy
-- would let anyone harvest every visitor's name/phone/email). But without
-- SELECT, a browser-side `UPDATE ... WHERE session_id = ?` matches zero
-- rows, and `.upsert()` is rejected by RLS on the ON CONFLICT path. So the
-- INSERT policy was the only thing that ever worked, and only for the very
-- first write of a session.
--
-- All anonymous writes now go through these two functions, which run as
-- the owner (bypassing RLS), only ever touch the caller's own session_id
-- row, and return nothing.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor), after
-- 0001 and 0002.

create or replace function public.capture_lead(
    p_session_id text,
    p_form_type  text,
    p_name       text default null,
    p_email      text default null,
    p_phone      text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_session_id is null or length(p_session_id) = 0 or length(p_session_id) > 100 then
        raise exception 'invalid session_id';
    end if;
    if p_form_type not in ('tax-submission', 'contact') then
        raise exception 'invalid form_type';
    end if;

    insert into public.leads (session_id, form_type, name, email, phone)
    values (
        p_session_id,
        p_form_type,
        nullif(left(p_name,  200), ''),
        nullif(left(p_email, 200), ''),
        nullif(left(p_phone, 60),  '')
    )
    on conflict (session_id) do update
        set name  = coalesce(excluded.name,  public.leads.name),
            email = coalesce(excluded.email, public.leads.email),
            phone = coalesce(excluded.phone, public.leads.phone)
        where public.leads.status = 'partial';
end;
$$;

create or replace function public.mark_lead_submitted(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    update public.leads
       set status = 'submitted'
     where session_id = p_session_id
       and status = 'partial';
end;
$$;

revoke all on function public.capture_lead(text, text, text, text, text)      from public;
revoke all on function public.mark_lead_submitted(text)                       from public;
grant execute on function public.capture_lead(text, text, text, text, text)   to anon;
grant execute on function public.mark_lead_submitted(text)                    to anon;

-- The security linter will flag capture_lead / mark_lead_submitted as
-- "SECURITY DEFINER function executable by anon" - that is the whole point
-- here and is safe: no dynamic SQL, inputs are validated and length-capped,
-- each call only ever touches its own session_id row, and nothing is
-- returned. This is the standard pattern for anonymous write-only RPCs.

-- Pin search_path on the 0001 trigger function too (linter WARN).
create or replace function public.leads_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Redundant / ineffective now - all public writes go via the RPCs above,
-- leaving admin_all_leads as the table's only policy.
drop policy if exists "Public can insert leads"        on public.leads;
drop policy if exists "Public can update partial leads" on public.leads;
