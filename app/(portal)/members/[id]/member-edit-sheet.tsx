"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { MEMBERSHIP_STATUS_LABELS, MEMBERSHIP_STATUSES } from "@/types";
import type { AuthentikGroupOption, MemberData, RoleData } from "./types";

export function MemberEditSheet({
  member,
  currentRole,
  authentikGroups,
  canChangeStatus,
  canChangeUsername,
  canManageRole,
  open,
  onOpenChange,
}: {
  member: MemberData;
  currentRole: RoleData;
  authentikGroups: AuthentikGroupOption[];
  canChangeStatus: boolean;
  canChangeUsername: boolean;
  canManageRole: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "profile" | "assignRole" | "removeRole" | null
  >(null);
  const [roleLabel, setRoleLabel] = useState(currentRole?.label ?? "");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    currentRole?.authentikGroupIds ?? [],
  );

  useEffect(() => {
    if (open) setPendingAction(null);
  }, [open]);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  function handleAssignRole() {
    if (!roleLabel.trim()) {
      toast.error("Pozíció neve kötelező");
      return;
    }

    setPendingAction("assignRole");
    startTransition(async () => {
      const result = await assignRoleAction(
        member.id,
        roleLabel.trim(),
        selectedGroupIds,
      );
      if (!result.success) {
        toast.error(result.error);
        setPendingAction(null);
        return;
      }
      toast.success("Pozíció mentve");
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleRemoveRole() {
    setPendingAction("removeRole");
    startTransition(async () => {
      const result = await removeRoleAction(member.id);
      if (!result.success) {
        toast.error(result.error);
        setPendingAction(null);
        return;
      }
      toast.success("Pozíció elvéve");
      setRoleLabel("");
      setSelectedGroupIds([]);
      onOpenChange(false);
      router.refresh();
    });
  }

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const input: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      input[key] = value.toString().trim();
    }

    setPendingAction("profile");
    startTransition(async () => {
      const result = await updateMemberAction(member.id, input);
      if (!result.success) {
        toast.error(result.error);
        setPendingAction(null);
        return;
      }
      toast.success("Adatok mentve");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Tag szerkesztése</SheetTitle>
          <SheetDescription>
            {member.lastName} {member.firstName} adatainak módosítása.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              name="lastName"
              label="Vezetéknév"
              defaultValue={member.lastName}
              required
            />
            <FormField
              name="firstName"
              label="Keresztnév"
              defaultValue={member.firstName}
              required
            />
          </div>
          <FormField
            name="nickname"
            label="Becenév"
            defaultValue={member.nickname ?? ""}
          />
          <FormField
            name="email"
            label="Email"
            type="email"
            defaultValue={member.email}
            required
          />
          <FormField
            name="mobile"
            label="Telefonszám"
            type="tel"
            defaultValue={member.mobile ?? ""}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              name="university"
              label="Egyetem, kar"
              defaultValue={member.university ?? ""}
            />
            <FormField
              name="major"
              label="Szak"
              defaultValue={member.major ?? ""}
            />
          </div>
          <FormField
            name="dormRoom"
            label="Szobaszám"
            defaultValue={member.dormRoom ?? ""}
          />

          {canChangeStatus && (
            <div className="flex flex-col gap-1.5">
              <Label>Státusz</Label>
              <Select name="status" defaultValue={member.status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMBERSHIP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {MEMBERSHIP_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {canChangeUsername && (
            <FormField
              name="websiteUsername"
              label="Weboldal felhasználónév"
              defaultValue={member.websiteUsername ?? ""}
            />
          )}

          <SheetFooter className="mb-2">
            <Button type="submit" disabled={isPending}>
              {pendingAction === "profile" && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Mentés
            </Button>
          </SheetFooter>
        </form>

        {canManageRole && (
          <>
            <Separator />
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div>
                <h3 className="text-sm font-medium">Vezetőségi pozíció</h3>
                <p className="text-xs text-muted-foreground">
                  Pozíció és Authentik csoportok hozzárendelése.
                </p>
              </div>

              <FormField
                name="roleLabel"
                label="Pozíció neve"
                defaultValue={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
              />

              {authentikGroups.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Authentik csoportok</Label>
                  <div className="flex flex-col gap-1.5">
                    {authentikGroups.map((group) => (
                      <div
                        key={group.authentikGroupId}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          id={`group-${group.authentikGroupId}`}
                          checked={selectedGroupIds.includes(
                            group.authentikGroupId,
                          )}
                          onCheckedChange={() =>
                            toggleGroup(group.authentikGroupId)
                          }
                        />
                        <Label
                          htmlFor={`group-${group.authentikGroupId}`}
                          className="font-normal"
                        >
                          {group.displayName}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={handleAssignRole}
                >
                  {pendingAction === "assignRole" && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {currentRole ? "Pozíció frissítése" : "Pozíció kiosztása"}
                </Button>
                {currentRole && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={handleRemoveRole}
                  >
                    {pendingAction === "removeRole" && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Pozíció elvétele
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
