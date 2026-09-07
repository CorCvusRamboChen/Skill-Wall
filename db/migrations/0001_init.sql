-- 技能墙 v1 schema. Users are (realm, subject) pairs from the campus walls'
-- Supabase auth; the service never stores a password.
create extension if not exists pgcrypto;

create table users (
  id            uuid primary key default gen_random_uuid(),
  realm         text not null,                 -- unimelb | monash | go8
  subject       text not null,                 -- Supabase auth.uid() in that realm
  school        text,                          -- unimelb | monash | anu | unsw | ...
  email         text,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (realm, subject)
);
create index users_school_idx on users (school);

-- The name card. One per user; `content` holds the template's fields as JSON
-- (rendered by the site, never as user-supplied HTML).
create table profiles (
  user_id         uuid primary key references users (id) on delete cascade,
  slug            text not null unique,
  program         text,
  pitch           text,
  tags            text[] not null default '{}',
  open_to_team    boolean not null default false,
  open_to_friends boolean not null default true,
  template        text check (template in ('cv', 'gallery', 'dev')),
  site_url        text,
  links           jsonb not null default '[]',
  content         jsonb not null default '{}',
  published       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_tags_idx on profiles using gin (tags);
create index profiles_open_idx on profiles (open_to_team) where published;

create table team_posts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users (id) on delete cascade,
  title       text not null,
  stage       text not null default 'recruiting' check (stage in ('idea', 'recruiting', 'active', 'closed')),
  commitment  text,                             -- "到 11 月底 · 每周 2 次线上"
  description text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index team_posts_stage_idx on team_posts (stage, updated_at desc);
create index team_posts_tags_idx on team_posts using gin (tags);

create table team_roles (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references team_posts (id) on delete cascade,
  position  smallint not null default 0,
  name      text not null,
  needed    smallint not null default 1 check (needed between 1 and 20),
  filled    smallint not null default 0 check (filled between 0 and 20)
);
create index team_roles_post_idx on team_roles (post_id, position);

create table team_applications (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references team_posts (id) on delete cascade,
  role_id       uuid not null references team_roles (id) on delete cascade,
  applicant_id  uuid not null references users (id) on delete cascade,
  message       text,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (post_id, applicant_id)
);
create index team_applications_applicant_idx on team_applications (applicant_id);
