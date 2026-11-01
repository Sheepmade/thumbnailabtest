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
-- No public policies: the service role key (server-side only, set as a Vercel env var)
-- bypasses RLS. The anon key is never shipped to the client, so /api/* are the only writers.
