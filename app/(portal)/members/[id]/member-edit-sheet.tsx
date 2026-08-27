"use client";

import { useSelector } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { MembershipStatus } from "@/app/generated/prisma/client";
import { type FieldOption, useAppForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  assignRoleAction,
  removeRoleAction,
  updateMemberAction,
} from "@/lib/actions/members";
import {
  EditMemberFormSchema,
  RoleFormSchema,
} from "@/lib/services/member-schemas";
import { MEMBERSHIP_STATUS_LABELS, MEMBERSHIP_STATUSES } from "@/types";
import type { AuthentikGroupOption, MemberData, RoleData } from "./types";

const STATUS_OPTIONS: FieldOption<MembershipStatus>[] = MEMBERSHIP_STATUSES.map(
  (status) => ({
    value: status,
    label: MEMBERSHIP_STATUS_LABELS[status],
  }),
);

type EditProps = {
  member: MemberData;
  currentRole: RoleData;
  authentikGroups: AuthentikGroupOption[];
  canChangeEmail: boolean;
  canChangeStatus: boolean;
  canManageRole: boolean;
};

export function MemberEditSheet({
  open,
  onOpenChange,
  ...props
}: EditProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Tag szerkesztése</SheetTitle>
          <SheetDescription>
            {props.member.lastName} {props.member.firstName} adatainak
            módosítása.
          </SheetDescription>
        </SheetHeader>
        <EditForms {...props} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function EditForms({
  member,
  currentRole,
  authentikGroups,
  canChangeEmail,
  canChangeStatus,
  canManageRole,
  onClose,
}: EditProps & { onClose: () => void }) {
  const router = useRouter();
  const [isRemovingRole, startRemoveRole] = useTransition();

  const profileForm = useAppForm({
    defaultValues: {
      lastName: member.lastName,
      firstName: member.firstName,
      nickname: member.nickname ?? "",
      email: member.email,
      mobile: member.mobile ?? "",
      university: member.university ?? "",
      major: member.major ?? "",
      dormRoom: member.dormRoom ?? "",
      status: member.status,
    },
    validators: { onChange: EditMemberFormSchema },
    onSubmit: async ({ value }) => {
      const { status, email, ...profile } = value;
      const result = await updateMemberAction(member.id, {
        ...profile,
        ...(canChangeEmail ? { email } : {}),
        ...(canChangeStatus ? { status } : {}),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      notifySync(result.syncErrors, "Adatok mentve");
      onClose();
      router.refresh();
    },
  });

  const roleForm = useAppForm({
    defaultValues: {
      label: currentRole?.label ?? "",
      // Sorted to match the order the checkbox field produces, so an unchanged
      // selection stays unchanged for the dirty check.
      authentikGroupIds: [...(currentRole?.authentikGroupIds ?? [])].sort(),
    },
    validators: { onChange: RoleFormSchema },
    onSubmit: async ({ value }) => {
      const result = await assignRoleAction(
        member.id,
        value.label,
        value.authentikGroupIds,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      notifySync(result.syncErrors, "Pozíció mentve");
      onClose();
      router.refresh();
    },
  });

  const savingProfile = useSelector(
    profileForm.store,
    (state) => state.isSubmitting,
  );
  const savingRole = useSelector(roleForm.store, (state) => state.isSubmitting);
  const busy = savingProfile || savingRole || isRemovingRole;

  function handleRemoveRole() {
    startRemoveRole(async () => {
      const result = await removeRoleAction(member.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      notifySync(result.syncErrors, "Pozíció elvéve");
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          profileForm.handleSubmit();
        }}
        className="flex flex-col gap-4 px-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <profileForm.AppField name="lastName">
            {(field) => <field.TextField label="Vezetéknév" required />}
          </profileForm.AppField>
          <profileForm.AppField name="firstName">
            {(field) => <field.TextField label="Keresztnév" required />}
          </profileForm.AppField>
        </div>
        <profileForm.AppField name="nickname">
          {(field) => <field.TextField label="Becenév" />}
        </profileForm.AppField>
        {canChangeEmail && (
          <profileForm.AppField name="email">
            {(field) => <field.TextField label="Email" type="email" required />}
          </profileForm.AppField>
        )}
        <profileForm.AppField name="mobile">
          {(field) => <field.TextField label="Telefonszám" type="tel" />}
        </profileForm.AppField>
        <div className="grid grid-cols-2 gap-4">
          <profileForm.AppField name="university">
            {(field) => <field.TextField label="Egyetem, kar" />}
          </profileForm.AppField>
          <profileForm.AppField name="major">
            {(field) => <field.TextField label="Szak" />}
          </profileForm.AppField>
        </div>
        <profileForm.AppField name="dormRoom">
          {(field) => <field.TextField label="Szobaszám" />}
        </profileForm.AppField>

        {canChangeStatus && (
          <profileForm.AppField name="status">
            {(field) => (
              <field.SelectField label="Státusz" options={STATUS_OPTIONS} />
            )}
          </profileForm.AppField>
        )}

        <SheetFooter className="mb-2">
          <profileForm.AppForm>
            <profileForm.SubmitButton disabled={busy} requireChanges>
              Mentés
            </profileForm.SubmitButton>
          </profileForm.AppForm>
        </SheetFooter>
      </form>

      {canManageRole && (
        <>
          <Separator />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              roleForm.handleSubmit();
            }}
            className="flex flex-col gap-4 px-4 pb-4"
          >
            <div>
              <h3 className="text-sm font-medium">Vezetőségi pozíció</h3>
              <p className="text-xs text-muted-foreground">
                Pozíció és Authentik csoportok hozzárendelése.
              </p>
            </div>

            <roleForm.AppField name="label">
              {(field) => <field.TextField label="Pozíció neve" required />}
            </roleForm.AppField>

            {authentikGroups.length > 0 && (
              <roleForm.AppField name="authentikGroupIds">
                {(field) => (
                  <field.CheckboxGroupField
                    label="Authentik csoportok"
                    options={authentikGroups.map((group) => ({
                      value: group.authentikGroupId,
                      label: group.displayName,
                    }))}
                  />
                )}
              </roleForm.AppField>
            )}

            <div className="flex gap-2">
              <roleForm.AppForm>
                <roleForm.SubmitButton size="sm" disabled={busy} requireChanges>
                  {currentRole ? "Pozíció frissítése" : "Pozíció kiosztása"}
                </roleForm.SubmitButton>
              </roleForm.AppForm>
              {currentRole && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={handleRemoveRole}
                >
                  {isRemovingRole && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Pozíció elvétele
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </>
  );
}

function notifySync(syncErrors: string[] | undefined, success: string) {
  if (syncErrors && syncErrors.length > 0) {
    toast.warning(
      `${success}, de a szinkronizálás során hiba történt: ${syncErrors.join(", ")}`,
    );
  } else {
    toast.success(success);
  }
}
