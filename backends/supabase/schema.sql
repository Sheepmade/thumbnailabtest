create table if not exists votes (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  "sessionId" text not null,
  "pairId" text not null,
  "roundIndex" int,
  choice text not null check (choice in ('ai','human')),
  "choiceSide" text check ("choiceSide" in ('left','right')),
  ua text default '',
  referrer text default '',
  "storedAt" timestamptz not null default now()
);

create index if not exists votes_pair_idx on votes ("pairId");
create index if not exists votes_session_idx on votes ("sessionId");

alter table votes enable row level security;

-- New Supabase keys: the "service_role" JWT authenticates as role `service_role`,
-- which does NOT automatically bypass RLS (that was the legacy behavior). Grant it
-- explicitly; no public policies are created, so the anon key still cannot read/write.
grant usage on schema public to service_role;
grant select, insert on public.votes to service_role;
revoke all on public.votes from anon, authenticated;
