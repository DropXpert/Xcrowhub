const DEAL_ID_RE = /\bPH-[A-Z0-9]{4}-[A-Z0-9]{4}\b/i;

function normalizeDealId(value: string): string | null {
  const match = value.match(DEAL_ID_RE);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Pull a deal ID out of whatever the user provided: a full pay URL,
 * a Nimiq Pay mini-app deeplink, or a bare ID.
 */
export function extractDealId(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // Not URI-encoded.
  }

  for (const candidate of candidates) {
    const pathMatch = candidate.match(/\/deal\/([^/?#\s]+)/i);
    if (pathMatch) {
      const id = normalizeDealId(pathMatch[1]);
      if (id) return id;
    }

    const id = normalizeDealId(candidate);
    if (id) return id;
  }

  return null;
}

export function dealPayPath(dealId: string): string {
  return `/deal/${encodeURIComponent(dealId)}/pay`;
}

export function dealStatusPath(dealId: string): string {
  return `/deal/${encodeURIComponent(dealId)}/status`;
}
