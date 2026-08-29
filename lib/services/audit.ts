import type { PrismaClient } from "@/app/generated/prisma/client";
import { type Actor, ensureCanViewAdminArea } from "@/lib/permissions";
import { pageSlice, totalPages } from "@/lib/services/pagination";

export async function listAuditLogs(
  prisma: PrismaClient,
  actor: Actor,
  { page }: { page: number },
) {
  ensureCanViewAdminArea(actor);

  const [total, logs] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      include: {
        actor: { select: { firstName: true, lastName: true } },
        target: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageSlice(page),
    }),
  ]);

  return { logs, total, totalPages: totalPages(total) };
}

export async function listMemberAuditLogs(
  prisma: PrismaClient,
  actor: Actor,
  memberId: string,
) {
  ensureCanViewAdminArea(actor);

  return prisma.auditLog.findMany({
    where: { targetId: memberId },
    include: { actor: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
}
