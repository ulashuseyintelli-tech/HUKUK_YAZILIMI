"use client";

// P3-2B: useGuardedAction — saf runGuarded'ı modal-tabanlı onayla bağlar.
// Kullanım: const { run, modal } = useGuardedAction();
//   await run((confirmation) => api.someMutation(...));  // confirmation retry'da geçer (consume binding P3-2C)
//   return (<>...{modal}</>);
// Backend zarf dönmüyorsa run normal {ok,data} verir, modal hiç açılmaz → mevcut davranış değişmez.

import { useCallback, useState, type ReactNode } from "react";
import {
  runGuarded,
  type GuardedEdgeConfirmation,
  type GuardedEdgeOutcomeEnvelope,
  type GuardedRunResult,
} from "@/lib/guarded-edge";
import { ConfirmActionModal } from "./confirm-action-modal";

export function useGuardedAction() {
  const [pending, setPending] = useState<{ env: GuardedEdgeOutcomeEnvelope; resolve: (ok: boolean) => void } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const askConfirm = useCallback(
    (env: GuardedEdgeOutcomeEnvelope) => new Promise<boolean>((resolve) => setPending({ env, resolve })),
    [],
  );

  const run = useCallback(
    function run<T>(
      requestFn: (confirmation?: GuardedEdgeConfirmation) => Promise<T>,
    ): Promise<GuardedRunResult<T>> {
      return runGuarded<T>(requestFn, askConfirm).finally(() => {
        setPending(null);
        setBusy(false);
      });
    },
    [askConfirm],
  );

  const modal: ReactNode = pending ? (
    <ConfirmActionModal
      envelope={pending.env}
      busy={busy}
      onConfirm={() => {
        setBusy(true); // retry sırasında modal açık + meşgul kalır; run.finally kapatır
        pending.resolve(true);
      }}
      onCancel={() => pending.resolve(false)}
    />
  ) : null;

  return { run, modal };
}
