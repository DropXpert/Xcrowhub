# XcrowHub backend

The backend uses PostgreSQL, Row Level Security, Realtime, scheduled jobs, and
server-side functions. Database migrations live in `migrations/`, while API
handlers live in `functions/`.

## Security model

- Wallet signatures establish user identity.
- Row Level Security limits records to the relevant deal participants.
- Payment verification runs server-side against chain data.
- Payout state transitions use leased, idempotent intents.
- Custody signing is isolated in the Node.js service under `/signer`.
- Private keys, service credentials, and production data are never stored in
  the repository or sent to the browser.

## Development

Use a local or isolated development backend and apply migrations in numerical
order. Configure secrets through the deployment environment or secret manager,
never in source-controlled files.

The public frontend requires only the API URL and anonymous client key. All
privileged operations must use server-side credentials and retain the explicit
function grants defined by the migrations.
