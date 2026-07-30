# XcrowHub

Protected escrow payments for peer-to-peer digital deals, built for Nimiq Pay.

[Website](https://www.xcrowhub.com) · [Open XcrowHub](https://app.xcrowhub.com)

## What it does

XcrowHub helps buyers and sellers transact without relying on direct,
unprotected transfers. A buyer funds a deal, the seller delivers, and the
payment is released after confirmation. If something goes wrong, both parties
can submit evidence for review.

The application is fully functional and supports:

- Private escrow deals
- NIM payments through Nimiq wallets
- Non-custodial USDT smart-contract escrow on Polygon
- Delivery confirmation and proof-based disputes
- A marketplace with offers, stock tracking, and product images
- Wallet-signature authentication without email or passwords
- Referral, notification, support, and feedback flows

## Nimiq Pay integration

Nimiq is part of the core transaction flow, not a visual integration. Users
connect a Nimiq wallet, authenticate by signing a message, create or fund a
deal in NIM, and receive settlement back to a Nimiq address. The responsive
interface works inside Nimiq Pay and in supported desktop browsers.

## Technology

- React, TypeScript, Vite, Tailwind CSS
- A self-hosted VPS backend with PostgreSQL, Row Level Security, Realtime, and
  Edge Functions
- Nimiq wallet and transaction infrastructure
- ethers.js for Polygon USDT escrow interactions
- An immutable USDT escrow contract with buyer release, seller refund, and
  2-of-3 buyer/seller/arbitrator disputed settlements
- A separate Node.js NIM/legacy custody signer with durable payout idempotency

## Repository layout

```text
src/                 Frontend application
supabase/functions/  Server-side API functions
supabase/migrations/ Database schema, policies, and procedures
signer/              Isolated payout signer
public/              Static assets and web metadata
```

## Local development

Requirements:

- Node.js 20 or newer
- A PostgreSQL backend exposing the Supabase-compatible API protocol
- A Nimiq wallet for end-to-end payment testing

```bash
npm install
cp .env.example .env.local
npm run dev
```

Production secrets must remain server-side. Only public `VITE_` configuration
may be placed in the frontend environment. Never commit wallet seeds, private
keys, service-role keys, shared secrets, or production data.

## Verification

```bash
npm run build
npm run typecheck
npm run build --prefix signer
```

## License

XcrowHub is released under the [MIT License](./LICENSE).
Adapted interface components retain their original notices in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Built on [Nimiq Pay](https://www.nimiq.com/nimiq-pay/).
