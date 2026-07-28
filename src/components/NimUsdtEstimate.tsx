import { useEffect, useMemo, useState } from "react";

const KUCOIN_RATE_URL =
  "https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=NIM-USDT";
const COINGECKO_FALLBACK_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd";
const CACHE_MS = 5 * 60 * 1000;

let cachedRate: { value: number; expiresAt: number } | null = null;
let pendingRate: Promise<number> | null = null;

async function fetchNimUsdtRate(): Promise<number> {
  if (cachedRate && cachedRate.expiresAt > Date.now()) {
    return cachedRate.value;
  }

  if (!pendingRate) {
    pendingRate = fetch(KUCOIN_RATE_URL, {
      headers: { Accept: "application/json" },
    })
      .then(async (response): Promise<number> => {
        if (!response.ok) {
          throw new Error(`Price request failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          code?: string;
          data?: { price?: string };
        };
        const value = Number(data.data?.price);
        if (data.code !== "200000" || !Number.isFinite(value) || value <= 0) {
          throw new Error("NIM/USDT market rate is unavailable.");
        }
        return value;
      })
      .catch(async () => {
        const response = await fetch(COINGECKO_FALLBACK_URL, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Fallback price request failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          "nimiq-2"?: { usd?: number };
        };
        const value = Number(data["nimiq-2"]?.usd);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("NIM market rate is unavailable.");
        }
        return value;
      })
      .then((value) => {
        cachedRate = { value, expiresAt: Date.now() + CACHE_MS };
        return value;
      })
      .finally(() => {
        pendingRate = null;
      });
  }

  return pendingRate;
}

function formatUsdt(value: number): string {
  const maximumFractionDigits =
    value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(value);
}

export function NimUsdtEstimate({ nimAmount }: { nimAmount: string }) {
  const amount = Number(nimAmount);
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const [rate, setRate] = useState<number | null>(
    cachedRate?.expiresAt && cachedRate.expiresAt > Date.now()
      ? cachedRate.value
      : null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasAmount || rate) return;
    let active = true;
    setFailed(false);

    void fetchNimUsdtRate()
      .then((value) => {
        if (active) setRate(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [hasAmount, rate]);

  const usdtValue = useMemo(
    () => (hasAmount && rate ? amount * rate : null),
    [amount, hasAmount, rate]
  );

  if (!hasAmount) return null;

  return (
    <span
      className="block rounded-lg border border-edge/70 bg-bg px-3 py-2 text-[12px] leading-relaxed text-muted"
      aria-live="polite"
    >
      {usdtValue !== null ? (
        <>
          ≈{" "}
          <strong className="font-semibold text-ink">
            {formatUsdt(usdtValue)} USDT
          </strong>{" "}
          at the current market rate
        </>
      ) : failed ? (
        "Live USDT estimate is temporarily unavailable."
      ) : (
        "Checking the current NIM value…"
      )}
    </span>
  );
}
