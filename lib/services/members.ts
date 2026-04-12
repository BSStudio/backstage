import { z } from "zod";
import type {
  MembershipStatus,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { currentSemester, MEMBERSHIP_STATUSES, type UserRole } from "@/types";

// ─── Validation schemas ──────────────────────────────────────────────────────

export const CreateMemberSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  nickname: z.string().trim().optional(),
  email: z.email(),
  mobile: z.string().trim().optional(),
  university: z.string().trim().optional(),
  major: z.string().trim().optional(),
  dormRoom: z.string().trim().optional(),
});

export const UpdateMemberSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  nickname: z.string().trim().optional(),
  email: z.email().optional(),
  mobile: z.string().trim().optional(),
  university: z.string().trim().optional(),
  major: z.string().trim().optional(),
  dormRoom: z.string().trim().optional(),
  websiteUsername: z.string().trim().optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});

export const AssignRoleSchema = z.object({
  label: z.string().trim().min(1),
  authentikGroupIds: z.array(z.string()).default([]),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;

// ─── Actor context ───────────────────────────────────────────────────────────

export interface Actor {
  id: string;
  role: UserRole;
}

// ─── Service functions ───────────────────────────────────────────────────────

export async function listMembers(
  prisma: PrismaClient,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.member.findMany({
    where: {
      archived: options.includeArchived ? undefined : false,
    },
    include: {
      leadershipRole: true,
    },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
  });
}

export async function getMember(prisma: PrismaClient, id: string) {
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      leadershipRole: true,
      timeline: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!member) throw new NotFoundError();
  return member;
}

export async function createMember(
  prisma: PrismaClient,
  input: unknown,
  actor: Actor,
) {
  const parsed = CreateMemberSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const data = parsed.data;

  // TODO: ID will come from Authentik when sync is implemented
  const member = await prisma.member.create({
    data: {
      id: crypto.randomUUID(),
      firstName: data.firstName,
      lastName: data.lastName,
      nickname: data.nickname,
      email: data.email,
      mobile: data.mobile,
      university: data.university,
      major: data.major,
      dormRoom: data.dormRoom,
      joinedSemester: currentSemester(),
    },
  });

  await prisma.timelineEntry.create({
    data: {
      memberId: member.id,
      action: "MEMBER_CREATED",
      status: member.status,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      targetId: member.id,
      action: "MEMBER_CREATED",
      diff: { created: data } as object,
    },
  });

  return member;
}

export async function updateMember(
  prisma: PrismaClient,
  id: string,
  input: unknown,
  actor: Actor,
) {
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) throw new NotFoundError();

  // Members can only edit themselves; leaders/admins can edit anyone
  const isSelf = actor.id === member.id;
  const isLeaderOrAdmin = (["ADMIN", "LEADER"] as string[]).includes(
    actor.role,
  );
  if (!isSelf && !isLeaderOrAdmin) throw new ForbiddenError();

  const parsed = UpdateMemberSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const data = { ...parsed.data };

  // Only admins can change websiteUsername
  if (data.websiteUsername !== undefined && actor.role !== "ADMIN") {
    delete data.websiteUsername;
  }

  // Status changes require leader/admin
  const statusChanging = data.status && data.status !== member.status;
  if (statusChanging && !isLeaderOrAdmin) {
    throw new ForbiddenError("Only leaders and admins can change status");
  }

  // Build diff for audit log
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && (member as Record<string, unknown>)[key] !== val) {
      diff[key] = { old: (member as Record<string, unknown>)[key], new: val };
    }
  }

  if (Object.keys(diff).length === 0) return member;

  const updated = await prisma.member.update({ where: { id }, data });

  // Timeline entry for status changes
  if (statusChanging) {
    await prisma.timelineEntry.create({
      data: {
        memberId: member.id,
        action: "STATUS_CHANGED",
        status: data.status,
      },
    });
  }

  // Audit log - separate entries for status changes and field updates
  if (statusChanging) {
    const { status: statusDiff, ...fieldDiff } = diff;
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: member.id,
        action: "STATUS_CHANGED",
        diff: { status: statusDiff } as object,
      },
    });
    if (Object.keys(fieldDiff).length > 0) {
      await prisma.auditLog.create({
        data: {
          actorId: actor.id,
          targetId: member.id,
          action: "MEMBER_UPDATED",
          diff: fieldDiff as object,
        },
      });
    }
  } else {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: member.id,
        action: "MEMBER_UPDATED",
        diff: diff as object,
      },
    });
  }

  return updated;
}

export async function archiveMember(
  prisma: PrismaClient,
  id: string,
  actor: Actor,
) {
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) throw new NotFoundError();

  await prisma.member.update({
    where: { id },
    data: { archived: true, archivedAt: new Date() },
  });

  await prisma.timelineEntry.create({
    data: { memberId: member.id, action: "MEMBER_ARCHIVED" },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      targetId: member.id,
      action: "MEMBER_ARCHIVED",
      diff: { archived: { old: false, new: true } },
    },
  });
}

export async function batchArchive(
  prisma: PrismaClient,
  ids: string[],
  actor: Actor,
) {
  const members = await prisma.member.findMany({
    where: { id: { in: ids }, archived: false },
  });

  const now = new Date();

  await prisma.member.updateMany({
    where: { id: { in: members.map((m) => m.id) } },
    data: { archived: true, archivedAt: now },
  });

  await prisma.timelineEntry.createMany({
    data: members.map((m) => ({
      memberId: m.id,
      action: "MEMBER_ARCHIVED" as const,
    })),
  });

  await prisma.auditLog.createMany({
    data: members.map((m) => ({
      actorId: actor.id,
      targetId: m.id,
      action: "MEMBER_ARCHIVED" as const,
      diff: { archived: { old: false, new: true } },
    })),
  });

  return { count: members.length };
}

export async function batchUpdateStatus(
  prisma: PrismaClient,
  ids: string[],
  status: MembershipStatus,
  actor: Actor,
) {
  // Only update members whose status actually differs
  const members = await prisma.member.findMany({
    where: { id: { in: ids }, archived: false, status: { not: status } },
  });

  await prisma.member.updateMany({
    where: { id: { in: members.map((m) => m.id) } },
    data: { status },
  });

  await prisma.timelineEntry.createMany({
    data: members.map((m) => ({
      memberId: m.id,
      action: "STATUS_CHANGED" as const,
      status,
    })),
  });

  await prisma.auditLog.createMany({
    data: members.map((m) => ({
      actorId: actor.id,
      targetId: m.id,
      action: "STATUS_CHANGED" as const,
      diff: { status: { old: m.status, new: status } },
    })),
  });

  return { count: members.length };
}

export async function assignRole(
  prisma: PrismaClient,
  memberId: string,
  label: string,
  authentikGroupIds: string[],
  actor: Actor,
) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { leadershipRole: true },
  });
  if (!member) throw new NotFoundError();

  if (member.leadershipRole) {
    // Update existing role
    const oldLabel = member.leadershipRole.label;
    const oldGroupIds = member.leadershipRole.authentikGroupIds;

    const labelChanged = oldLabel !== label;
    const oldSet = new Set(oldGroupIds);
    const newSet = new Set(authentikGroupIds);
    const groupsChanged =
      oldSet.size !== newSet.size || [...oldSet].some((id) => !newSet.has(id));

    if (!labelChanged && !groupsChanged) return;

    await prisma.leadershipRole.update({
      where: { memberId },
      data: { label, authentikGroupIds },
    });

    await prisma.timelineEntry.create({
      data: { memberId, action: "ROLE_CHANGED", roleLabel: label },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: memberId,
        action: "ROLE_CHANGED",
        diff: {
          label: { old: oldLabel, new: label },
          authentikGroupIds: { old: oldGroupIds, new: authentikGroupIds },
        },
      },
    });
  } else {
    // Create new role
    await prisma.leadershipRole.create({
      data: { memberId, label, authentikGroupIds },
    });

    await prisma.timelineEntry.create({
      data: { memberId, action: "ROLE_ASSIGNED", roleLabel: label },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: memberId,
        action: "ROLE_ASSIGNED",
        diff: {
          label: { old: null, new: label },
          authentikGroupIds: { old: null, new: authentikGroupIds },
        },
      },
    });
  }
}

export async function removeRole(
  prisma: PrismaClient,
  memberId: string,
  actor: Actor,
) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { leadershipRole: true },
  });
  if (!member) throw new NotFoundError();
  if (!member.leadershipRole) return;

  const oldLabel = member.leadershipRole.label;

  await prisma.leadershipRole.delete({ where: { memberId } });

  await prisma.timelineEntry.create({
    data: { memberId, action: "ROLE_REMOVED", roleLabel: oldLabel },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      targetId: memberId,
      action: "ROLE_REMOVED",
      diff: { label: { old: oldLabel, new: null } },
    },
  });
}
