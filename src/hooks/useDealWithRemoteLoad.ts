import { useEffect, useState } from "react";
import { useDealStore } from "@/store/dealStore";

export function useDealWithRemoteLoad(id?: string) {
  const deal = useDealStore((s) => (id ? s.getDeal(id) : undefined));
  const loadDealById = useDealStore((s) => s.loadDealById);
  const [loadedId, setLoadedId] = useState<string | null>(deal && id ? id : null);

  useEffect(() => {
    if (!id) {
      setLoadedId(null);
      return;
    }

    if (deal) {
      setLoadedId(id);
      return;
    }

    let cancelled = false;
    setLoadedId(null);
    Promise.resolve(loadDealById(id)).finally(() => {
      if (!cancelled) setLoadedId(id);
    });

    return () => {
      cancelled = true;
    };
  }, [id, deal, loadDealById]);

  return {
    deal,
    loading: Boolean(id && !deal && loadedId !== id),
    loaded: Boolean(deal || (id && loadedId === id)),
  };
}
