import type {
  GoogleGroupMatchStatus,
  MembershipStatus,
} from "@/app/generated/prisma/client";

export interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
}

export interface GoogleGroupEntryRow {
  email: string;
  matchStatus: GoogleGroupMatchStatus;
  note: string | null;
  member: MemberOption | null;
}

export interface MissingMemberRow extends MemberOption {
  email: string;
  status: MembershipStatus;
  archived: boolean;
}

export interface MemberPickerOption extends MemberOption {
  archived: boolean;
}
