import type {
  SyncJobStatus,
  SyncOperation,
  SyncTarget,
} from "@/app/generated/prisma/client";

export const SYNC_STATUS_LABELS: Record<SyncJobStatus, string> = {
  PENDING: "Függőben",
  IN_PROGRESS: "Folyamatban",
  SUCCESS: "Sikeres",
  FAILED: "Sikertelen",
};

export const SYNC_STATUS_VARIANT: Record<SyncJobStatus, string> = {
  PENDING: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  IN_PROGRESS: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  SUCCESS: "bg-green-500/15 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export const SYNC_TARGET_LABELS: Record<SyncTarget, string> = {
  AUTHENTIK: "Authentik",
  WEBSITE: "Honlap",
};

export const SYNC_OPERATION_LABELS: Record<SyncOperation, string> = {
  CREATE_USER: "Felhasználó létrehozás",
  UPDATE_USER: "Felhasználó módosítás",
  DEACTIVATE_USER: "Felhasználó deaktiválás",
  ADD_TO_GROUP: "Csoporthoz adás",
  REMOVE_FROM_GROUP: "Csoportból törlés",
};
