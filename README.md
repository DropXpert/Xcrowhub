# XcrowHub

**Protected crypto escrow for digital deals — zero fees, proof-based, built on Nimiq Pay.**

[xcrowhub.com](https://www.xcrowhub.com) · [Open in Nimiq Pay](https://app.xcrowhub.com)

---

## What is XcrowHub?

XcrowHub is a peer-to-peer escrow layer for crypto deals. When buyer and seller agree on a deal, funds are held securely until delivery is confirmed. No platform cut. No hidden fees. Only you and your counterparty.

- **Buyer** sends funds into escrow
- **Seller** delivers the goods or service
- **Funds release** on confirmed delivery — or trigger a proof-based dispute if something goes wrong

Works with **NIM** (Nimiq) and **USDT** (Polygon).

---

## Key Features

| Feature | Details |
|---|---|
| Zero fees | No platform commission, ever |
| Wallet auth | Sign-in via Nimiq wallet — no email, no password |
| Proof-based disputes | Either party submits evidence; admin reviews and decides |
| Marketplace | Sellers publish recurring listings; buyers open protected deals instantly |
| Private | No public profiles, no follower counts, no algorithm |
| Dual currency | NIM via Nimiq Pay · USDT via EVM wallet |

---

## Architecture

```
Browser (www.xcrowhub.com)   →   Marketing / Landing page
Nimiq Pay (app.xcrowhub.com) →   Mini app (wallet-gated)
```

| Layer | Stack |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Auth | Wallet-signature JWT (nonce → sign → Edge Function mints token) |
| Database | Supabase (PostgreSQL + RLS + Edge Functions) |
| NIM payments | Nimiq Pay Mini App SDK |
| USDT payments | ethers.js + Polygon |
| Custody signer | Node.js service (`/signer`) — holds hot wallet keys |
| Hosting | Vercel (frontend) · Fly.io (signer) · Supabase (backend) |

---

## Project Structure

```
/
├── src/
│   ├── pages/          # App screens + public marketing pages
│   ├── components/     # Shared UI components
│   ├── store/          # Zustand state (deals, auth, notifications)
│   ├── lib/            # Supabase client, host detection, config
│   └── wallet/         # Nimiq + EVM wallet providers
├── signer/             # Custody signer microservice (Node.js)
├── supabase/           # Edge Functions + DB migrations
├── public/             # Static assets, manifest, service worker
└── index.html
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Nimiq Pay wallet (for testing the mini app)
- Supabase project (for auth + deal storage)

### Local Development

```bash
npm install
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

> In dev mode the Nimiq Pay host gate is bypassed so you can work in any browser.

### Build

```bash
npm run build
npm run preview
```

### Signer Service

The custody signer is a separate Node.js microservice. See [`/signer`](./signer/README.md) for setup and deployment instructions.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

See `.env.example` for the full list.

---

## Deployment

| Service | Platform |
|---|---|
| Frontend | Vercel — connect repo, set env vars, deploy |
| Signer | Fly.io / Railway / Render (any persistent Node host) |
| Backend | Supabase — push migrations with `supabase db push` |

The frontend is served at `www.xcrowhub.com`. The mini app entry point is `app.xcrowhub.com`.

---

## License

[MIT](./LICENSE)

---

*Built on [Nimiq Pay](https://www.nimiq.com/nimiq-pay/).*
