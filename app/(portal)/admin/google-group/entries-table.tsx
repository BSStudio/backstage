"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { SortIcon } from "@/app/(portal)/members/columns";
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
  GOOGLE_GROUP_MATCH_ORDER,
  GOOGLE_GROUP_MATCH_VARIANT,
} from "@/lib/google-group";
import {
  AnnotateEntryFormSchema,
  KnownAddressFormSchema,
} from "@/lib/services/google-group-schemas";
import type { GoogleGroupEntryRow, MemberPickerOption } from "./types";

type SortColumn = "email" | "status";
type AnnotationTarget = { entry: GoogleGroupEntryRow; known: boolean };

export function EntriesTable({
  entries,
  members,
  canManage,
}: {
  entries: GoogleGroupEntryRow[];
  members: MemberPickerOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [annotating, setAnnotating] = useState<AnnotationTarget | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sort, setSort] = useState<{
    column: SortColumn;
    direction: "asc" | "desc";
  }>({ column: "email", direction: "asc" });

  const sorted = useMemo(() => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      const byEmail = a.email.localeCompare(b.email);
      if (sort.column === "email") return factor * byEmail;
      const byState =
        GOOGLE_GROUP_MATCH_ORDER[a.matchStatus] -
        GOOGLE_GROUP_MATCH_ORDER[b.matchStatus];
      return byState === 0 ? byEmail : factor * byState;
    });
  }, [entries, sort]);

  function toggleSort(column: SortColumn) {
    setSort((current) =>
      current.column === column
        ? {
            column,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { column, direction: "asc" },
    );
  }

  function sortedState(column: SortColumn) {
    return sort.column === column ? sort.direction : false;
  }

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
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8"
                  onClick={() => toggleSort("email")}
                >
                  Email-cím
                  <SortIcon sorted={sortedState("email")} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8"
                  onClick={() => toggleSort("status")}
                >
                  Állapot
                  <SortIcon sorted={sortedState("status")} />
                </Button>
              </TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Megjegyzés</TableHead>
              {canManage ? <TableHead className="w-44" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 5 : 4}
                  className="text-center text-muted-foreground"
                >
                  Még nincs beolvasott lista.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((entry) => (
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
                  {canManage ? (
                    <TableCell>
                      {/* A matched address needs no decision; only an unrecognised one does. */}
                      {(entry.matchStatus === "SECONDARY_EMAIL" ||
                        entry.matchStatus === "KNOWN_ADDRESS") && (
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
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setAnnotating({ entry, known: false })
                            }
                          >
                            Másodlagos cím
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setAnnotating({ entry, known: true })
                            }
                          >
                            Ismert cím
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  ) : null}
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
          {annotating &&
            (annotating.known ? (
              <KnownAddressForm
                entry={annotating.entry}
                onDone={() => {
                  setAnnotating(null);
                  router.refresh();
                }}
              />
            ) : (
              <AnnotateForm
                entry={annotating.entry}
                members={members}
                onDone={() => {
                  setAnnotating(null);
                  router.refresh();
                }}
              />
            ))}
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

function KnownAddressForm({
  entry,
  onDone,
}: {
  entry: GoogleGroupEntryRow;
  onDone: () => void;
}) {
  const form = useAppForm({
    defaultValues: { note: entry.note ?? "" },
    validators: { onChange: KnownAddressFormSchema },
    onSubmit: async ({ value }) => {
      const result = await annotateGoogleGroupEntryAction(entry.email, {
        matchStatus: "KNOWN_ADDRESS",
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
        <SheetTitle>Ismert cím</SheetTitle>
        <SheetDescription>
          {entry.email} — nem tartozik hozzá tag, de rendben van.
        </SheetDescription>
      </SheetHeader>

      <form.AppField name="note">
        {(field) => (
          <field.TextField
            label="Megjegyzés"
            placeholder="Másik levelezőlista"
            required
          />
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
