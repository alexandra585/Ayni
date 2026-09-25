"use client";
import { useUi } from "@/store/ui";

export function Toast() {
  const msg = useUi((u) => u.toastMsg);
  if (!msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {msg}
    </div>
  );
}
