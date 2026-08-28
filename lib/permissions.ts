import { ForbiddenError } from "@/lib/errors";
import type { UserRole } from "@/types";

export interface Actor {
  id: string;
  role: UserRole;
}

export function canManageMembers(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "LEADER";
}

export function canViewAdminArea(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "LEADER";
}

export function canAdminister(role: UserRole | undefined): boolean {
  return role === "ADMIN";
}

export function canModifyMember(actor: Actor, targetId: string): boolean {
  return actor.id === targetId || canManageMembers(actor.role);
}

export function ensureCanManageMembers(actor: Actor): void {
  if (!canManageMembers(actor.role)) throw new ForbiddenError();
}

export function ensureCanAdminister(actor: Actor): void {
  if (!canAdminister(actor.role)) throw new ForbiddenError();
}

export function ensureCanModifyMember(actor: Actor, targetId: string): void {
  if (!canModifyMember(actor, targetId)) throw new ForbiddenError();
}
