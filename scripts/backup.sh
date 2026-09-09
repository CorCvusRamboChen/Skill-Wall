#!/usr/bin/env bash
# Nightly dump of the skill-wall database + the uploads volume into
# ~/skill-wall/backups, keeping the last 14 of each. Installed on forum-app by
# deploy/DEPLOY.md (crontab line at the bottom of this file).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%F)
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-skillwall}" "${POSTGRES_DB:-skillwall}" | gzip > "backups/db-$stamp.sql.gz"
docker run --rm -v skill-wall_skillwall-uploads:/src:ro -v "$PWD/backups":/dst alpine \
  tar -czf "/dst/uploads-$stamp.tgz" -C /src . 2>/dev/null || true
ls -1t backups/db-*.sql.gz | tail -n +15 | xargs -r rm -f
ls -1t backups/uploads-*.tgz | tail -n +15 | xargs -r rm -f
echo "backup ok: $(du -sh backups | cut -f1) in backups/"
# crontab -e →  20 4 * * * /home/rambo/skill-wall/scripts/backup.sh >> /home/rambo/skill-wall/backups/cron.log 2>&1
