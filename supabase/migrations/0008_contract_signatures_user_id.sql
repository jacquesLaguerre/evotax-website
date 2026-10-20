-- 0008: link a contract to the contractor's portal login (applied 2026-10-20).
--
-- Set from the admin portal's Contractors panel ("Link a signed contract" /
-- "Link to their portal login"), so a signed contract shows on that
-- contractor's profile. Contracts left unlinked are matched by recipient
-- name instead. Cleared automatically if the login is deleted.
alter table public.contract_signatures
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.contract_signatures.user_id is
  'Portal login this contract belongs to (linked in the admin Contractors panel). Null = not linked; the panel then matches by recipient name.';
