# ProofHold backend — Supabase + Node signer

ProofHold's backend has two pieces:

1. **Supabase** — Postgres + Auth + Edge Functions + Realtime.
   - All deal state, custody ledger, RLS-protected access.
   - Edge Functions handle wallet-signature auth and on-chain watching.
2. **Node signer service** (`/signer` — separate folder, separate deploy on Fly.io).
   - Holds the custody hot wallet seed in env.
   - Single endpoint: `POST /sign-and-broadcast`, called by a Supabase Edge Function on release/refund.
   - Uses `@nimiq/core` directly (which doesn't run in Workers/Deno — research confirmed this is the only viable path).

## Why this split?

`@nimiq/core` (the WASM-based Albatross PoS client) is **browser + Node.js only**. Cloudflare Workers and Supabase Edge Functions (Deno) can't run it. Since we need server-side custody signing, that piece has to live in a small Node service. Everything else fits Supabase cleanly.

```
    Phone / Nimiq Pay                          ─── ProofHold mini app
            │
            ▼
    Vercel (React UI)
            │
            │ HTTPS + Supabase JS client
            ▼
    ┌───────────────────────┐
    │ Supabase              │
    │   Postgres + RLS      │  ─── source of truth, realtime
    │   Edge Functions      │  ─── wallet-sig auth, watcher, payout trigger
    │   Realtime            │  ─── live deal status updates to UI
    └─────────┬─────────────┘
              │ HTTPS, shared secret
              ▼
    ┌───────────────────────┐
    │ Node signer (Fly.io)  │  ─── holds the NIM seed + EVM key
    │   @nimiq/core         │
    │   ethers v6           │
    └─────────┬─────────────┘
              │
              ▼
       Nimiq + EVM RPCs
```

## Layout

```
supabase/
  migrations/
    0001_initial.sql        — tables + indexes + triggers + enums
    0002_rls.sql            — row-level security policies
    0003_procedures.sql     — stored procedures for state transitions (TODO)
  functions/
    auth/                   — POST /auth: verify wallet sig, mint JWT (TODO)
    watcher/                — pg_cron-triggered tx watcher (TODO)
    payout/                 — calls Node signer when release/refund happens (TODO)
signer/                     — separate Node service for custody signing (TODO)
```

## One-time setup (you do this)

1. Sign up at https://supabase.com (GitHub OAuth).
2. Create a project called `proofhold`. Pick the region closest to your users.
3. **Save the database password** Supabase generates — it's the root key to your DB.
4. From the project dashboard, copy these two values and send them to me:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public key** (Settings → API → "anon public")

These two are safe to share — they're meant for the client bundle and RLS protects everything sensitive. Do **not** send the `service_role` key — that's super-admin.

5. Install the Supabase CLI on this machine:
   ```bash
   npm install -g supabase
   ```
6. Link the local repo to your remote Supabase project:
   ```bash
   supabase link --project-ref <project-ref-from-dashboard>
   supabase db push
   ```
   This applies the migrations in this folder to your live Postgres.

## What's done so far

- [x] Phase 0: Removed the Cloudflare Workers skeleton (wrong fit for Nimiq signing).
- [x] Phase 1: Postgres schema + RLS policies (this commit).
- [ ] Phase 2: Wallet-signature auth Edge Function.
- [ ] Phase 3: Stored procedures for state transitions.
- [ ] Phase 4: Node signer service.
- [ ] Phase 5: On-chain watcher Edge Function.
- [ ] Phase 6: Frontend rewire.
- [ ] Phase 7: Deploy + smoke test.
