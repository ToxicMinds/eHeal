#!/usr/bin/env bash
# Builds and publishes the web app on Render from the latest commit on main, and waits.
# Render only deploys by itself when its GitHub app is installed on the repository;
# until then this script is how a deploy is triggered.
#
# The site was created once with:
#   render services create --name eheal-app --type static_site \
#     --repo https://github.com/ToxicMinds/eHeal --branch main \
#     --build-command "npx --yes pnpm@11.5.2 install --frozen-lockfile && npx --yes pnpm@11.5.2 --filter web build" \
#     --publish-directory apps/web/out \
#     --env-var NODE_VERSION=24.11.1 \
#     --env-var NEXT_PUBLIC_SUPABASE_URL=https://mconctpleszerqhgaarj.supabase.co \
#     --env-var NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the project's publishable key>
# and given these response headers for every path: Content-Security-Policy:
# frame-ancestors 'none'; X-Frame-Options: DENY; X-Content-Type-Options: nosniff;
# Referrer-Policy: no-referrer.
set -euo pipefail
service=${EHEAL_RENDER_SERVICE:-srv-db79jlivcj2c73cpibsg}
render deploys create "$service" --confirm -o json >/dev/null
for _ in $(seq 1 90); do
  status=$(render deploys list "$service" -o json --confirm | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(d.get('deploy', d).get('status'))")
  case "$status" in
    live) echo "deployed"; exit 0 ;;
    build_failed|update_failed|canceled|deactivated) echo "deploy $status"; exit 1 ;;
  esac
  sleep 10
done
echo "deploy still running after 15 minutes"; exit 1
