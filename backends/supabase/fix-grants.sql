-- Run this in the Supabase SQL Editor if you already created the votes table
-- with the original schema.sql (which enabled RLS without granting the
-- service_role key access -> PostgREST 403 "permission denied for table votes").
grant usage on schema public to service_role;
grant select, insert on public.votes to service_role;
revoke all on public.votes from anon, authenticated;
