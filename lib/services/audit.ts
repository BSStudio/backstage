import type { PrismaClient } from "@/app/generated/prisma/client";
import { type Actor, ensureCanViewAdminArea } from "@/lib/permissions";

const PAGE_SIZE = 50;

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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return { logs, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
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
