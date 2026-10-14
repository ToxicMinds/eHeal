# web

The Watson web app: a static Next.js build. See the [root README](../../README.md).

    node scripts/use-local-stack.mjs   # point the app at the local Supabase stack
    pnpm dev                           # http://localhost:3000
    pnpm test                          # unit and access-control tests (needs `supabase start`)
    pnpm e2e                           # build, then drive the app in a real browser
