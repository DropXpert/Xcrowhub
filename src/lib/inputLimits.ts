export const INPUT_LIMITS = {
  username: 32,
  title: 120,
  listingTitle: 100,
  description: 800,
  terms: 400,
  feedback: 400,
  queryDetails: 600,
  proofExplanation: 800,
  reference: 500,
  attachmentUrl: 2048,
  message: 1000,
  supportSubject: 80,
  bugSummary: 120,
  bugDescription: 4000,
  contact: 180,
  search: 100,
  dealId: 64,
  tag: 20,
  maxTags: 5,
  maxAttachments: 10,
} as const;

export const VALUE_LIMITS = {
  amount: 1_000_000_000,
  quantity: 1_000,
  deadlineHours: 8_760,
} as const;

export function limitText(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
