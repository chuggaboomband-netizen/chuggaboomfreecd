"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
};

export function PendingSubmitButton({
  children,
  pendingLabel = "Loading...",
  className = "button",
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={`${className}${pending ? " is-pending" : ""}`} disabled={pending}>
      {pending ? (
        <>
          <span className="button-spinner" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
