"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { annotateGoogleGroupEntryAction } from "@/lib/actions/google-group";
import {
  GOOGLE_GROUP_MATCH_LABELS,
  GOOGLE_GROUP_MATCH_VARIANT,
} from "@/lib/google-group";
import { AnnotateEntryFormSchema } from "@/lib/services/google-group-schemas";
import type { GoogleGroupEntryRow, MemberPickerOption } from "./types";

export function EntriesTable({
  entries,
  members,
}: {
  entries: GoogleGroupEntryRow[];
  members: MemberPickerOption[];
}) {
  const router = useRouter();
  const [annotating, setAnnotating] = useState<GoogleGroupEntryRow | null>(
    null,
  );
  const [clearing, setClearing] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function clearAnnotation(email: string) {
    setClearing(email);
    startTransition(async () => {
      const result = await annotateGoogleGroupEntryAction(email, {
        matchStatus: "UNKNOWN",
      });
      setClearing(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Megjelölés visszavonva");
      router.refresh();
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email-cím</TableHead>
              <TableHead>Állapot</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Megjegyzés</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Még nincs beolvasott lista.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.email}>
                  <TableCell className="font-mono text-xs">
                    {entry.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={GOOGLE_GROUP_MATCH_VARIANT[entry.matchStatus]}
                    >
                      {GOOGLE_GROUP_MATCH_LABELS[entry.matchStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.member ? (
                      <Link
                        href={`/members/${entry.member.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {entry.member.lastName} {entry.member.firstName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    {/* A matched address needs no decision; only an unrecognised one does. */}
                    {entry.matchStatus === "SECONDARY_EMAIL" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending && clearing === entry.email}
                        onClick={() => clearAnnotation(entry.email)}
                      >
                        Visszavonás
                      </Button>
                    )}
                    {entry.matchStatus === "UNKNOWN" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAnnotating(entry)}
                      >
                        Másodlagos cím
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet
        open={annotating !== null}
        onOpenChange={(open) => {
          if (!open) setAnnotating(null);
        }}
      >
        <SheetContent>
          {annotating && (
            <AnnotateForm
              entry={annotating}
              members={members}
              onDone={() => {
                setAnnotating(null);
                router.refresh();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AnnotateForm({
  entry,
  members,
  onDone,
}: {
  entry: GoogleGroupEntryRow;
  members: MemberPickerOption[];
  onDone: () => void;
}) {
  const form = useAppForm({
    defaultValues: { memberId: entry.member?.id ?? "", note: entry.note ?? "" },
    validators: { onChange: AnnotateEntryFormSchema },
    onSubmit: async ({ value }) => {
      const result = await annotateGoogleGroupEntryAction(entry.email, {
        matchStatus: "SECONDARY_EMAIL",
        memberId: value.memberId,
        note: value.note,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Cím megjelölve");
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-4 px-4"
    >
      <SheetHeader className="px-0">
        <SheetTitle>Másodlagos cím</SheetTitle>
        <SheetDescription>{entry.email} — melyik tag címe ez?</SheetDescription>
      </SheetHeader>

      <form.AppField name="memberId">
        {(field) => (
          <field.ComboboxField
            label="Tag"
            options={members.map((member) => ({
              value: member.id,
              label: `${member.lastName} ${member.firstName}`,
              hint: member.archived ? "(archivált)" : undefined,
            }))}
          />
        )}
      </form.AppField>
      <form.AppField name="note">
        {(field) => (
          <field.TextField label="Megjegyzés" placeholder="Privát cím" />
        )}
      </form.AppField>

      <SheetFooter className="px-0">
        <form.AppForm>
          <form.SubmitButton>Mentés</form.SubmitButton>
        </form.AppForm>
      </SheetFooter>
    </form>
  );
}
