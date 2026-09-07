-- Optional cover image for a recruit post (an http(s) URL; uploads come later with R2).
alter table team_posts add column if not exists cover_url text;
