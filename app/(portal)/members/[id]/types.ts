import type { MembershipStatus } from "@/app/generated/prisma/client";

export type MemberData = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  mobile: string | null;
  university: string | null;
  major: string | null;
  dormRoom: string | null;
  status: MembershipStatus;
  websiteUsername: string | null;
  archived: boolean;
};

export type RoleData = {
  label: string;
  authentikGroupIds: string[];
} | null;

export type AuthentikGroupOption = {
  authentikGroupId: string;
  displayName: string;
};
