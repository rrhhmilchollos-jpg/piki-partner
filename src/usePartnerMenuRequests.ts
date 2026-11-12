import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

/** A cancelled transport may still settle: every continuation must also check current(). */
export function usePartnerMenuRequests(token: string, locationId: string | undefined, apiOrigin: string, onUnauthorized: () => void, access = "") {
  const epoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  // Object identity also prevents a retained callback from opening work in a later lifetime.
  const identity = useMemo(() => ({ token, locationId, apiOrigin, onUnauthorized, access }), [token, locationId, apiOrigin, onUnauthorized, access]);
  const active = useRef<{ identity: typeof identity; epoch: number } | null>(null);
  useLayoutEffect(() => {
    active.current = { identity, epoch: ++epoch.current };
    const ownedControllers = controllers.current;
    return () => {
      active.current = null;
      epoch.current += 1;
      for (const controller of ownedControllers) controller.abort();
      ownedControllers.clear();
    };
  }, [identity]);

  return useCallback(() => {
    const controller = new AbortController();
    const expectedEpoch = epoch.current;
    const current = () => active.current?.identity === identity && active.current.epoch === expectedEpoch && !controller.signal.aborted;
    if (current()) controllers.current.add(controller);
    else controller.abort();
    return {
      signal: controller.signal,
      current,
      finish: () => { controllers.current.delete(controller); },
    };
  }, [identity]);
}
