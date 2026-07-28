const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChar() {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

function randomBlock(len: number) {
  let out = "";
  for (let i = 0; i < len; i++) out += randomChar();
  return out;
}

// Deal IDs look like PH-4F7K-9XQ2 — short, scannable, and recognizably ours.
export function newDealId() {
  return `PH-${randomBlock(4)}-${randomBlock(4)}`;
}

export function newId(prefix: string) {
  return `${prefix}_${randomBlock(8).toLowerCase()}`;
}

// Mock blockchain-style hashes for the MockWalletProvider.
export function mockTxHash() {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 64; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

export function mockWalletAddress() {
  // Nimiq-style human address: 36 chars, groups of 4
  const groups = 9;
  const block = () => randomBlock(4);
  const parts: string[] = [];
  for (let i = 0; i < groups; i++) parts.push(block());
  return `NQ${randomBlock(2)} ${parts.join(" ")}`;
}
