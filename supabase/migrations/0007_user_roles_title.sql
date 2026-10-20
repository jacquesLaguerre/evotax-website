-- 0007: optional display title on user_roles (applied 2026-10-19).
--
-- Lets an account show a label such as "Manager" (rendered red in the admin
-- portal) instead of its role name ("Super Admin" / "contractor").
-- Purely a label: what an account can access is still decided only by
-- user_roles.role, which every RLS policy checks.
alter table public.user_roles add column if not exists title text;

comment on column public.user_roles.title is
  'Optional display label shown instead of the role name (e.g. Manager). Does not grant or limit access — role does.';
