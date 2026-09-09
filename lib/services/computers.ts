import { z } from "zod";
import type { Computer, PrismaClient } from "@/app/generated/prisma/client";
import {
  type ComputerStatus,
  computerStatus,
  formatComputerName,
} from "@/lib/computers";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, ensureCanAdminister } from "@/lib/permissions";
import { buildRdpFile, isRdpConfigured } from "@/lib/rdp";
import {
  ComputerIdSchema,
  type ComputerMetadata,
  ComputerMetadataSchema,
  PingComputerSchema,
} from "./computer-schemas";

export type { ComputerMetadata } from "./computer-schemas";
export {
  ComputerIdSchema,
  ComputerMetadataSchema,
  PingComputerSchema,
} from "./computer-schemas";

export interface ComputerView {
  id: string;
  name: string;
  status: ComputerStatus;
  lastSeenAt: Date;
  metadata: ComputerMetadata;
}

// Re-parsed rather than cast, so a row written by an older agent is still readable.
function toView(computer: Computer, now: Date): ComputerView {
  return {
    id: computer.id,
    name: formatComputerName(computer.id),
    status: computerStatus(computer.lastSeenAt, now),
    lastSeenAt: computer.lastSeenAt,
    metadata: ComputerMetadataSchema.catch({}).parse(computer.metadata),
  };
}

/** Every member may see which workstations are free, so this takes no actor. */
export async function listComputers(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<ComputerView[]> {
  const computers = await prisma.computer.findMany({
    orderBy: { id: "asc" },
  });
  return computers.map((computer) => toView(computer, now));
}

export async function recordComputerPing(
  prisma: PrismaClient,
  id: string,
  input: unknown,
  agent: { sub: string },
): Promise<{ computer: Computer; registered: boolean }> {
  const parsedId = ComputerIdSchema.safeParse(id);
  if (!parsedId.success)
    throw new ValidationError(z.treeifyError(parsedId.error));

  const parsed = PingComputerSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const existing = await prisma.computer.findUnique({
    where: { id: parsedId.data },
  });

  // Every agent token sits on a machine members can walk up to, so the first account to
  // claim an id owns it — one lifted off a workstation cannot rewrite another's status.
  if (existing && existing.agentSub !== agent.sub) {
    throw new ForbiddenError("Computer is claimed by another agent");
  }

  const data = { metadata: parsed.data.metadata, lastSeenAt: new Date() };

  // agentSub is written on create only: the read above and this write are not one
  // transaction, so an update branch that reset it would hand ownership to whichever
  // agent raced in second.
  const computer = await prisma.computer.upsert({
    where: { id: parsedId.data },
    create: { id: parsedId.data, agentSub: agent.sub, ...data },
    update: data,
  });

  return { computer, registered: existing === null };
}

/** Not permanent: the machine comes back the next time its agent pings. */
export async function deleteComputer(
  prisma: PrismaClient,
  id: string,
  actor: Actor,
) {
  ensureCanAdminister(actor);

  const computer = await prisma.computer.findUnique({ where: { id } });
  if (!computer) throw new NotFoundError();

  const name = formatComputerName(computer.id);

  await prisma.$transaction([
    prisma.computer.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetLabel: name,
        action: "COMPUTER_DELETED",
        diff: { name: { old: name, new: null } } as object,
      },
    }),
  ]);

  return { deleted: true };
}

/** Takes no actor for the same reason `listComputers` does not: any member may sit down at one. */
export async function buildComputerRdp(
  prisma: PrismaClient,
  id: string,
  username: string | null,
): Promise<{ filename: string; content: string }> {
  // A deployment with no workstation DNS configured has no such endpoint to speak of.
  if (!isRdpConfigured()) throw new NotFoundError();

  const computer = await prisma.computer.findUnique({ where: { id } });
  if (!computer) throw new NotFoundError();

  return {
    filename: `${formatComputerName(computer.id)}.rdp`,
    content: buildRdpFile(computer.id, username),
  };
}
