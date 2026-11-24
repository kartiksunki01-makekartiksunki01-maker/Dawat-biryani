-- APPLIED IN PRODUCTION on 2026-11-24 (migration: dawat_v2_1_hardening).
-- Visitors never need is_admin(): every policy that calls it is for signed-in users only.
revoke execute on function public.is_admin() from anon;
comment on table public.bill_counters is 'Bill number sequence per day. No policies on purpose: only SECURITY DEFINER order functions may touch it.';
