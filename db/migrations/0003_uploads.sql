-- Uploaded images (covers, work thumbnails). Bytes live on the uploads volume
-- (UPLOAD_DIR); this table is the ledger: who uploaded what, for quotas and
-- for moving everything to R2 later without losing ownership.
create table uploads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users (id) on delete cascade,
  file        text not null unique,          -- "<id>.<ext>" on disk
  mime        text not null,
  bytes       integer not null,
  created_at  timestamptz not null default now()
);
create index uploads_owner_idx on uploads (owner_id, created_at desc);
