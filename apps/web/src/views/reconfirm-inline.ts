import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { ApiClient } from "../api/client.js";
import type { ReconfirmCardResponse } from "../api/types.js";

export const RECONFIRM_CARD_QUERY_KEY = "reconfirm-card";

export interface ReconfirmAnswered {
  readonly verdict: "confirm" | "reject";
}

/**
 * Shared fetch + answer state for the reconfirm card. The GET is a
 * server-side per-day gate (`reconfirm-card` returns `{ card: null }` once
 * today's question is answered from ANY surface), so Home's `ReconfirmCard`
 * and Chat's inline strip read/write through this one hook instead of each
 * duplicating the query/mutation wiring. `enabled` lets a caller (Chat) gate
 * the fetch on its own precondition (empty session) without touching the
 * query/mutation logic itself.
 */
export function useReconfirmCard(client: ApiClient, options?: { readonly enabled?: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = [RECONFIRM_CARD_QUERY_KEY, client.baseUrl];
  const query = useQuery({
    enabled: options?.enabled ?? true,
    queryFn: () => client.get<ReconfirmCardResponse>("/api/user-model/reconfirm-card"),
    queryKey,
    retry: false
  });
  const [answered, setAnswered] = useState<ReconfirmAnswered | undefined>();
  const respond = useMutation({
    mutationFn: ({ slotId, verdict }: { readonly slotId: string; readonly verdict: "confirm" | "reject" }) =>
      client.post(`/api/user-model/reconfirm-card/${encodeURIComponent(slotId)}`, { verdict }),
    onSuccess: (_result, variables) => {
      setAnswered({ verdict: variables.verdict });
      return queryClient.invalidateQueries({ queryKey });
    }
  });
  return { answered, card: query.data?.card, respond };
}
