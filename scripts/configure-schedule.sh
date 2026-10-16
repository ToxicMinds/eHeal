#!/usr/bin/env bash
# Lets the hosted database's five-minute schedule (migration 20261016110000) call the google and
# whatsapp functions: one shared secret, kept in ~/.config/watson/cron-secret, set as the
# functions' CRON_SECRET and stored in the database's Vault with the functions' address.
# Safe to run again.
set -euo pipefail
: "${SUPABASE_ACCESS_TOKEN:?set by .envrc}" "${SUPABASE_PROJECT_REF:?set by .envrc}"
dir="$HOME/.config/watson"
if [ ! -s "$dir/cron-secret" ]; then
  openssl rand -hex 32 | tr -d '\n' > "$dir/cron-secret"
  chmod 600 "$dir/cron-secret"
fi
secret=$(cat "$dir/cron-secret")
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" CRON_SECRET="$secret" >/dev/null
query="delete from vault.secrets where name in ('functions_url', 'cron_secret');
select vault.create_secret('https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1', 'functions_url');
select vault.create_secret('$secret', 'cron_secret');"
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$query" |
  curl -fsS -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @- >/dev/null
echo "Schedule can call the functions of $SUPABASE_PROJECT_REF"
