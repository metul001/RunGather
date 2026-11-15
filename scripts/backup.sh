#!/usr/bin/env bash
# Requires PostgreSQL client tools, a private DATABASE_URL and a private backup directory.
# Database backups do NOT include image-object bytes; export those separately.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL privately; never commit it}"
: "${BACKUP_DIR:?Set a private backup directory outside the repository}"
umask 077
mkdir -p "$BACKUP_DIR"
backup_file="$BACKUP_DIR/rungather-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
printf 'Backup created: %s\n' "$backup_file"
