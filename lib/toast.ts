"use client";

import { toast } from "sonner";

export function toastSync(success: string, syncErrors?: string[]): void {
  if (syncErrors && syncErrors.length > 0) {
    toast.warning(
      `${success}, de a szinkronizálás során hiba történt: ${syncErrors.join(", ")}`,
    );
    return;
  }
  toast.success(success);
}
