# XcrowHub USDT escrow

`XcrowHubEscrowV2.sol` is the immutable Polygon settlement rail for new USDT
deals. It deliberately has no owner, proxy, pause authority, rescue method, or
arbitrary withdrawal function.

V2 derives every storage key from both the XcrowHub deal reference and the
funding buyer. Copying a pending `fund` transaction therefore creates a
different key for the copier and cannot reserve or block the buyer's escrow.

## Settlement rules

- The buyer can release the full deal amount to the fixed seller.
- The seller can refund the full deal amount to the fixed buyer.
- A split or disputed outcome needs two different EIP-712 signatures from the
  buyer, seller, and immutable XcrowHub arbitrator.
- The arbitrator cannot move principal alone.
- The marketplace fee is applied only to a full seller release.

## Local verification

```bash
npm run contracts:test
npm run contracts:compile
```

## Polygon deployment

Current V2 mainnet deployment:

- Contract: [`0x639e0fB779e3D796cAC219850a26Ec3bDcE5d93c`](https://polygonscan.com/address/0x639e0fB779e3D796cAC219850a26Ec3bDcE5d93c)
- Deployment transaction: [`0x5c4a9bbb83a9538f6a318ea2dd9ca1bd42fdf8956b70b4d7e25b3871af2bcb19`](https://polygonscan.com/tx/0x5c4a9bbb83a9538f6a318ea2dd9ca1bd42fdf8956b70b4d7e25b3871af2bcb19)
- Sourcify verification: exact creation and runtime match
- Chain ID: `137`
- Token: Polygon USDT0 (`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`)

The earlier V1 deployment at
[`0x031879875E802de714D59cdC318d08Db91371F7b`](https://polygonscan.com/address/0x031879875E802de714D59cdC318d08Db91371F7b)
was never activated for production deals and is deprecated.

Set these variables in a local, uncommitted environment file:

```text
POLYGON_RPC_URL=
ESCROW_DEPLOYER_PRIVATE_KEY=
USDT_CONTRACT=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
EVM_ARBITRATOR_ADDRESS=
ESCROW_TREASURY_ADDRESS=
```

Then run `npm run contracts:deploy:polygon`. After deployment, configure the
same address as `VITE_USDT_ESCROW_CONTRACT_ADDR`,
`USDT_ESCROW_CONTRACT_ADDR` in the verification functions, and
`USDT_ESCROW_CONTRACT_ADDR` in the signer. The signer arbitrator private key
must match the immutable arbitrator address passed to the constructor.

Finally, activate the rail for newly created USDT deals:

```sql
insert into public.platform_config (key, value)
values ('usdt_escrow_contract_addr', '<DEPLOYED_CONTRACT>')
on conflict (key) do update
set value = excluded.value, updated_at = now();
```

Until this key contains a valid non-zero EVM address, migration 0053 keeps new
USDT deals on the managed rail. This makes database deployment fail-safe.
