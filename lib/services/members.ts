import { z } from "zod";
import type {
  MembershipStatus,
  Prisma,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  CreateMemberSchema,
  UpdateMemberSchema,
} from "@/lib/services/member-schemas";
import { getLeadershipGroupUuid } from "@/lib/sync/authentik/group-mapping";
import {
  buildAuthentikAttributes,
  createAuthentikUser,
  orchestrateAddToGroup,
  orchestrateDeactivate,
  orchestrateRemoveFromGroup,
  orchestrateStatusChange,
  orchestrateUpdateAttributes,
} from "@/lib/sync/authentik/orchestrators";
import {
  orchestrateAddToGoogleGroup,
  orchestrateRemoveFromGoogleGroup,
} from "@/lib/sync/google/orchestrators";
import { getWebsiteStatusLabel } from "@/lib/sync/website/group-mapping";
import {
  orchestrateCreateWebsiteUser,
  orchestrateDeactivateWebsiteUser,
  orchestrateUpdateWebsiteUser,
} from "@/lib/sync/website/orchestrators";
import type { UpdateWebsiteUserInput } from "@/lib/website/users";
import { currentSemester, type UserRole } from "@/types";

export type {
  AssignRoleInput,
  CreateMemberInput,
  UpdateMemberInput,
} from "@/lib/services/member-schemas";
export {
  AssignRoleSchema,
  CreateMemberSchema,
  UpdateMemberSchema,
} from "@/lib/services/member-schemas";

// ─── Actor context ───────────────────────────────────────────────────────────

export interface Actor {
  id: string;
  role: UserRole;
}

const AUTHENTIK_SYNCED_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "mobile",
]);

const WEBSITE_SYNCED_FIELDS = new Set([
  "firstName",
  "lastName",
  "nickname",
  "email",
  "mobile",
  "status",
]);

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
  const status: MembershipStatus = "MEMBER_CANDIDATE_CANDIDATE";

  const authentikUser = await createAuthentikUser({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    mobile: data.mobile ?? null,
    status,
  });

  const websiteUsername = authentikUser.username;
  const joinedSemester = currentSemester();

  const [member] = await prisma.$transaction([
    prisma.member.create({
      data: {
        id: authentikUser.uuid,
        firstName: data.firstName,
        lastName: data.lastName,
        nickname: data.nickname || null,
        email: data.email,
        mobile: data.mobile || null,
        university: data.university || null,
        major: data.major || null,
        dormRoom: data.dormRoom || null,
        status,
        joinedSemester,
      },
    }),
    prisma.timelineEntry.create({
      data: {
        memberId: authentikUser.uuid,
        action: "MEMBER_CREATED",
        status,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: authentikUser.uuid,
        action: "MEMBER_CREATED",
        diff: { created: data } as object,
      },
    }),
    prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "CREATE_USER",
        memberId: authentikUser.uuid,
        payload: {
          username: authentikUser.username,
          name: authentikUser.name,
          email: authentikUser.email,
        },
        status: "SUCCESS",
        attempts: 1,
        result: authentikUser as object,
      },
    }),
  ]);

  const syncErrors: string[] = [];
  const websiteResult = await orchestrateCreateWebsiteUser(prisma, member.id, {
    username: websiteUsername,
    fullname: `${data.lastName} ${data.firstName}`.trim(),
    nickname: data.nickname ?? data.firstName,
    email: data.email,
    mobile: data.mobile ?? "",
    joinedSemester,
  });
  if (websiteResult.success) {
    // Persist the Drupal uid returned by CREATE_USER so later syncs can target
    // the account directly without a username lookup.
    const userId = (websiteResult.result as { userId?: string } | null)?.userId;
    if (userId) {
      await prisma.member.update({
        where: { id: member.id },
        data: { websiteUserId: userId },
      });
      member.websiteUserId = userId;
    }
  } else {
    syncErrors.push(websiteResult.error);
  }

  const googleResult = await orchestrateAddToGoogleGroup(
    prisma,
    member.id,
    data.email,
  );
  if (!googleResult.success) syncErrors.push(googleResult.error);

  return { member, syncErrors };
}

export function ensureCanModifyAvatar(actor: Actor, targetId: string): void {
  const isSelf = actor.id === targetId;
  const isLeaderOrAdmin = (["ADMIN", "LEADER"] as string[]).includes(
    actor.role,
  );
  if (!isSelf && !isLeaderOrAdmin) throw new ForbiddenError();
}

async function syncAvatarUrl(
  prisma: PrismaClient,
  memberId: string,
  before: { avatarUrl: string | null },
  after: {
    firstName: string;
    lastName: string;
    mobile: string | null;
    avatarUrl: string | null;
  },
  syncErrors: string[],
): Promise<void> {
  if (before.avatarUrl === after.avatarUrl) return;

  const result = await orchestrateUpdateAttributes(prisma, memberId, {
    attributes: buildAuthentikAttributes(after),
  });
  if (!result.success) syncErrors.push(result.error);
}

export async function uploadMemberAvatar(
  prisma: PrismaClient,
  id: string,
  data: { avatarUrl: string; portraitUrl: string },
  actor: Actor,
) {
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) throw new NotFoundError();
  ensureCanModifyAvatar(actor, id);

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: id,
        action: "AVATAR_UPLOADED",
        diff: {} as object,
      },
    });
    return updated;
  });

  const syncErrors: string[] = [];
  await syncAvatarUrl(prisma, id, member, updated, syncErrors);

  return { member: updated, syncErrors };
}

export async function removeMemberAvatar(
  prisma: PrismaClient,
  id: string,
  actor: Actor,
) {
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) throw new NotFoundError();
  ensureCanModifyAvatar(actor, id);

  if (!member.avatarUrl && !member.portraitUrl) {
    return { member, syncErrors: [] as string[] };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id },
      data: { avatarUrl: null, portraitUrl: null },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: id,
        action: "AVATAR_REMOVED",
        diff: {} as object,
      },
    });
    return updated;
  });

  const syncErrors: string[] = [];
  await syncAvatarUrl(prisma, id, member, updated, syncErrors);

  return { member: updated, syncErrors };
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

  const raw = { ...parsed.data };

  // Convert empty strings to null so clearing a field sets it to null in the DB
  const data = Object.fromEntries(
    Object.entries(raw).map(([key, val]) => [key, val === "" ? null : val]),
  ) as typeof raw;

  // Status changes require leader/admin
  const statusChanging = data.status && data.status !== member.status;
  if (statusChanging && !isLeaderOrAdmin) {
    throw new ForbiddenError("Only leaders and admins can change status");
  }

  // So does the email address
  const emailChanging = data.email && data.email !== member.email;
  if (emailChanging && !isLeaderOrAdmin) {
    throw new ForbiddenError("Only leaders and admins can change the email");
  }

  // Build diff for audit log
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && (member as Record<string, unknown>)[key] !== val) {
      diff[key] = { old: (member as Record<string, unknown>)[key], new: val };
    }
  }

  if (Object.keys(diff).length === 0)
    return { member, syncErrors: [] as string[] };

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({ where: { id }, data });

    const sideEffects: Prisma.PrismaPromise<unknown>[] = [];

    if (statusChanging) {
      sideEffects.push(
        tx.timelineEntry.create({
          data: {
            memberId: member.id,
            action: "STATUS_CHANGED",
            status: data.status,
          },
        }),
      );
      const { status: statusDiff, ...fieldDiff } = diff;
      sideEffects.push(
        tx.auditLog.create({
          data: {
            actorId: actor.id,
            targetId: member.id,
            action: "STATUS_CHANGED",
            diff: { status: statusDiff } as object,
          },
        }),
      );
      if (Object.keys(fieldDiff).length > 0) {
        sideEffects.push(
          tx.auditLog.create({
            data: {
              actorId: actor.id,
              targetId: member.id,
              action: "MEMBER_UPDATED",
              diff: fieldDiff as object,
            },
          }),
        );
      }
    } else {
      sideEffects.push(
        tx.auditLog.create({
          data: {
            actorId: actor.id,
            targetId: member.id,
            action: "MEMBER_UPDATED",
            diff: diff as object,
          },
        }),
      );
    }

    await Promise.all(sideEffects);
    return updated;
  });

  const syncErrors: string[] = [];

  // Sync Authentik attributes if any synced field changed
  const syncedFieldChanged = Object.keys(diff).some((k) =>
    AUTHENTIK_SYNCED_FIELDS.has(k),
  );
  if (syncedFieldChanged) {
    const result = await orchestrateUpdateAttributes(prisma, member.id, {
      name: `${updated.firstName} ${updated.lastName}`.trim(),
      email: updated.email,
      attributes: buildAuthentikAttributes(updated),
    });
    if (!result.success) syncErrors.push(result.error);
  }

  // Sync group membership on status change
  if (statusChanging && data.status) {
    const results = await orchestrateStatusChange(
      prisma,
      member.id,
      member.status,
      data.status,
    );
    for (const r of results) {
      if (!r.success) syncErrors.push(r.error);
    }
  }

  // Sync website if any website-tracked field changed
  const websiteFieldChanged = Object.keys(diff).some((k) =>
    WEBSITE_SYNCED_FIELDS.has(k),
  );
  if (websiteFieldChanged) {
    const fields: UpdateWebsiteUserInput = {};
    if (diff.firstName || diff.lastName) {
      fields.fullname = `${updated.lastName} ${updated.firstName}`.trim();
    }
    if (diff.nickname) fields.nickname = updated.nickname ?? updated.firstName;
    if (diff.email) fields.email = updated.email;
    if (diff.mobile) fields.mobile = updated.mobile ?? "";
    if (diff.status) fields.position = getWebsiteStatusLabel(updated.status);

    const result = await orchestrateUpdateWebsiteUser(
      prisma,
      member.id,
      fields,
    );
    if (!result.success) syncErrors.push(result.error);
  }

  return { member: updated, syncErrors };
}

export interface ArchiveOptions {
  removeFromGoogleGroup?: boolean;
}

export async function archiveMember(
  prisma: PrismaClient,
  id: string,
  actor: Actor,
  options: ArchiveOptions = {},
) {
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) throw new NotFoundError();

  await prisma.$transaction([
    prisma.member.update({
      where: { id },
      data: { archived: true, archivedAt: new Date() },
    }),
    prisma.timelineEntry.create({
      data: { memberId: member.id, action: "MEMBER_ARCHIVED" },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: member.id,
        action: "MEMBER_ARCHIVED",
        diff: { archived: { old: false, new: true } },
      },
    }),
  ]);

  const syncErrors: string[] = [];
  const authentikResult = await orchestrateDeactivate(prisma, member.id);
  if (!authentikResult.success) syncErrors.push(authentikResult.error);

  const websiteResult = await orchestrateDeactivateWebsiteUser(
    prisma,
    member.id,
  );
  if (!websiteResult.success) syncErrors.push(websiteResult.error);

  if (options.removeFromGoogleGroup) {
    const googleResult = await orchestrateRemoveFromGoogleGroup(
      prisma,
      member.id,
      member.email,
    );
    if (!googleResult.success) syncErrors.push(googleResult.error);
  }

  return { syncErrors };
}

export async function batchArchive(
  prisma: PrismaClient,
  ids: string[],
  actor: Actor,
  options: ArchiveOptions = {},
) {
  const members = await prisma.member.findMany({
    where: { id: { in: ids }, archived: false },
  });

  const now = new Date();
  const memberIds = members.map((m) => m.id);

  await prisma.$transaction([
    prisma.member.updateMany({
      where: { id: { in: memberIds } },
      data: { archived: true, archivedAt: now },
    }),
    prisma.timelineEntry.createMany({
      data: members.map((m) => ({
        memberId: m.id,
        action: "MEMBER_ARCHIVED" as const,
      })),
    }),
    prisma.auditLog.createMany({
      data: members.map((m) => ({
        actorId: actor.id,
        targetId: m.id,
        action: "MEMBER_ARCHIVED" as const,
        diff: { archived: { old: false, new: true } },
      })),
    }),
  ]);

  const syncResults = await Promise.all(
    members.flatMap((m) => [
      orchestrateDeactivate(prisma, m.id),
      orchestrateDeactivateWebsiteUser(prisma, m.id),
      ...(options.removeFromGoogleGroup
        ? [orchestrateRemoveFromGoogleGroup(prisma, m.id, m.email)]
        : []),
    ]),
  );
  const syncErrors = syncResults
    .filter((r): r is { success: false; error: string } => !r.success)
    .map((r) => r.error);

  return { count: members.length, syncErrors };
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

  const memberIds = members.map((m) => m.id);

  await prisma.$transaction([
    prisma.member.updateMany({
      where: { id: { in: memberIds } },
      data: { status },
    }),
    prisma.timelineEntry.createMany({
      data: members.map((m) => ({
        memberId: m.id,
        action: "STATUS_CHANGED" as const,
        status,
      })),
    }),
    prisma.auditLog.createMany({
      data: members.map((m) => ({
        actorId: actor.id,
        targetId: m.id,
        action: "STATUS_CHANGED" as const,
        diff: { status: { old: m.status, new: status } },
      })),
    }),
  ]);

  const groupResultsPerMember = await Promise.all(
    members.map((m) => orchestrateStatusChange(prisma, m.id, m.status, status)),
  );
  const websiteResults = await Promise.all(
    members.map((m) =>
      orchestrateUpdateWebsiteUser(prisma, m.id, {
        position: getWebsiteStatusLabel(status),
      }),
    ),
  );
  const syncErrors = [...groupResultsPerMember.flat(), ...websiteResults]
    .filter((r): r is { success: false; error: string } => !r.success)
    .map((r) => r.error);

  return { count: members.length, syncErrors };
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

  let toAdd: string[] = [];
  let toRemove: string[] = [];

  if (member.leadershipRole) {
    // Update existing role
    const oldLabel = member.leadershipRole.label;
    const oldGroupIds = member.leadershipRole.authentikGroupIds;

    const labelChanged = oldLabel !== label;
    const oldSet = new Set(oldGroupIds);
    const newSet = new Set(authentikGroupIds);
    const groupsChanged =
      oldSet.size !== newSet.size || [...oldSet].some((id) => !newSet.has(id));

    if (!labelChanged && !groupsChanged) return { syncErrors: [] as string[] };

    toAdd = authentikGroupIds.filter((id) => !oldSet.has(id));
    toRemove = oldGroupIds.filter((id) => !newSet.has(id));

    await prisma.$transaction([
      prisma.leadershipRole.update({
        where: { memberId },
        data: { label, authentikGroupIds },
      }),
      prisma.timelineEntry.create({
        data: { memberId, action: "ROLE_CHANGED", roleLabel: label },
      }),
      prisma.auditLog.create({
        data: {
          actorId: actor.id,
          targetId: memberId,
          action: "ROLE_CHANGED",
          diff: {
            label: { old: oldLabel, new: label },
            authentikGroupIds: { old: oldGroupIds, new: authentikGroupIds },
          },
        },
      }),
    ]);
  } else {
    // Create new role
    toAdd = [getLeadershipGroupUuid(), ...authentikGroupIds];

    await prisma.$transaction([
      prisma.leadershipRole.create({
        data: { memberId, label, authentikGroupIds },
      }),
      prisma.timelineEntry.create({
        data: { memberId, action: "ROLE_ASSIGNED", roleLabel: label },
      }),
      prisma.auditLog.create({
        data: {
          actorId: actor.id,
          targetId: memberId,
          action: "ROLE_ASSIGNED",
          diff: {
            label: { old: null, new: label },
            authentikGroupIds: { old: null, new: authentikGroupIds },
          },
        },
      }),
    ]);
  }

  const addResults = await Promise.all(
    toAdd.map((groupId) => orchestrateAddToGroup(prisma, memberId, groupId)),
  );
  const removeResults = await Promise.all(
    toRemove.map((groupId) =>
      orchestrateRemoveFromGroup(prisma, memberId, groupId),
    ),
  );

  const websiteResult = await orchestrateUpdateWebsiteUser(prisma, memberId, {
    role: label,
  });

  const syncErrors = [...addResults, ...removeResults, websiteResult]
    .filter((r): r is { success: false; error: string } => !r.success)
    .map((r) => r.error);

  return { syncErrors };
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
  if (!member.leadershipRole) return { syncErrors: [] as string[] };

  const oldLabel = member.leadershipRole.label;
  const oldGroupIds = member.leadershipRole.authentikGroupIds;

  await prisma.$transaction([
    prisma.leadershipRole.delete({ where: { memberId } }),
    prisma.timelineEntry.create({
      data: { memberId, action: "ROLE_REMOVED", roleLabel: oldLabel },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: memberId,
        action: "ROLE_REMOVED",
        diff: { label: { old: oldLabel, new: null } },
      },
    }),
  ]);

  const groupsToRemove = [getLeadershipGroupUuid(), ...oldGroupIds];
  const removeResults = await Promise.all(
    groupsToRemove.map((groupId) =>
      orchestrateRemoveFromGroup(prisma, memberId, groupId),
    ),
  );

  const websiteResult = await orchestrateUpdateWebsiteUser(prisma, memberId, {
    role: "",
  });

  const syncErrors = [...removeResults, websiteResult]
    .filter((r): r is { success: false; error: string } => !r.success)
    .map((r) => r.error);

  return { syncErrors };
}
