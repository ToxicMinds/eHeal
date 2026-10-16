#!/usr/bin/env bash
# Watson's own WhatsApp gateway on the owner's Google Cloud (owner's decision of 16 Oct 2026).
# Creates the machine once (free-tier e2-micro with a standard disk; its internet address costs about
# $3.65 a month), then copies apps/whatsapp-gateway there, builds it and (re)starts it. The pairing
# with the WhatsApp number lives on the machine and survives every redeploy.
# usage: CLOUDSDK_ACTIVE_CONFIG_NAME=watson scripts/deploy-whatsapp-gateway.sh <google-cloud-project>
# The secret (shared with the whatsapp function) is in ~/.config/watson/whatsapp-gateway-secret.
set -euo pipefail
: "${CLOUDSDK_ACTIVE_CONFIG_NAME:?run with CLOUDSDK_ACTIVE_CONFIG_NAME=watson, the gcloud configuration of the owner account}"
project=${1:?usage: scripts/deploy-whatsapp-gateway.sh <google-cloud-project>}
zone=us-central1-a # a free-tier region
vm=watson-whatsapp
secret=$(cat ~/.config/watson/whatsapp-gateway-secret)
url="https://mconctpleszerqhgaarj.supabase.co/functions/v1/whatsapp"
g() { gcloud --project "$project" "$@"; }
on_vm() { g compute ssh "$vm" --zone "$zone" --command "$1"; }

if ! g compute instances describe "$vm" --zone "$zone" >/dev/null 2>&1; then
  g compute instances create "$vm" --zone "$zone" --machine-type e2-micro \
    --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB --boot-disk-type pd-standard \
    --metadata startup-script='#!/bin/sh
command -v docker >/dev/null || (apt-get update && apt-get install -y docker.io)'
fi
on_vm 'until command -v docker >/dev/null; do sleep 5; done; mkdir -p gateway'
g compute scp --zone "$zone" apps/whatsapp-gateway/{Dockerfile,package.json,package-lock.json,server.mjs,filter.mjs} "$vm:gateway/"
on_vm "umask 077; printf 'WATSON_URL=%s\nWATSON_GATEWAY_SECRET=%s\n' '$url' '$secret' > gateway/gateway.env"
on_vm 'set -e; cd gateway
  sudo docker build -q -t watson-whatsapp .
  sudo mkdir -p /var/lib/watson-whatsapp && sudo chown 1000:1000 /var/lib/watson-whatsapp
  sudo docker rm -f watson-whatsapp >/dev/null 2>&1 || true
  sudo docker run -d --name watson-whatsapp --restart unless-stopped -p 127.0.0.1:8080:8080 \
    -v /var/lib/watson-whatsapp:/sessions --env-file gateway.env watson-whatsapp'
echo "Deployed. To link a number: gcloud --project $project compute ssh $vm --zone $zone -- -L 8080:127.0.0.1:8080 -N"
echo "then open http://localhost:8080 and scan the code with WhatsApp (Settings, Linked devices, Link a device)."
