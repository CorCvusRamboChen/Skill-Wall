-- The visual portfolio (../profolio) behind a name card. Keyed by our users so
-- it shares identity, backup and cascade with everything else here; the
-- portfolio container is the only writer, this API only asks "does one exist"
-- (has_portfolio on cards, see routes/profiles.mjs).
--
-- Mirror of profolio/db/portfolios.sql — the two must stay identical; that copy
-- is what the portfolio's own tests run against.
create table if not exists portfolios (
  user_id     uuid primary key references users (id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists portfolio_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  state       jsonb not null,
  stamped_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists portfolio_versions_owner_idx
  on portfolio_versions (user_id, stamped_at desc);
