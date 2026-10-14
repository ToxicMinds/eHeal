#!/usr/bin/env bash
# Applies the hosted Supabase project's sign-in rules (MASTER_BUILD_SPEC.md section 11):
# no public sign-up, passwords of at least 8 characters, and the app's address.
# usage: scripts/configure-hosted-auth.sh [https://app-address]
set -euo pipefail
: "${SUPABASE_ACCESS_TOKEN:?set by .envrc}" "${SUPABASE_PROJECT_REF:?set by .envrc}"
settings='{"disable_signup": true, "password_min_length": 8'
if [ $# -ge 1 ]; then settings="$settings, \"site_url\": \"$1\", \"uri_allow_list\": \"$1/**\""; fi
curl -fsS -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "$settings}" |
  python3 -c "import json,sys; c=json.load(sys.stdin); print({k: c.get(k) for k in ('disable_signup','password_min_length','site_url','uri_allow_list')})"
