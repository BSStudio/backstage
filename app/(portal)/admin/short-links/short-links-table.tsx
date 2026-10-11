"use client";

import { Check, Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ShortLink } from "@/app/generated/prisma/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteShortLinkAction,
  publishShortLinkAction,
} from "@/lib/actions/short-links";
import {
  PUBLISH_STATE_BADGE_CLASS,
  PUBLISH_STATE_LABELS,
  publishState,
  shortLinkUrl,
} from "@/lib/short-links";
import { toastSync } from "@/lib/toast";
import { RepublishButton } from "./republish-button";
import { ShortLinkForm } from "./short-link-form";

export function ShortLinksTable({
  links,
  clicks,
  baseUrl,
  shortHost,
  canManage,
  canRepublish,
}: {
  links: ShortLink[];
  clicks: Record<string, number>;
  baseUrl: string | null;
  shortHost: string | null;
  canManage: boolean;
  canRepublish: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ShortLink | null>(null);
  const [deleting, setDeleting] = useState<ShortLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Several buttons share one transition, so this says which one is busy.
  function busy(action: string) {
    return isPending && pendingAction === action;
  }

  async function copy(link: ShortLink) {
    try {
      await navigator.clipboard.writeText(shortLinkUrl(baseUrl, link.slug));
      setCopied(link.slug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("A vágólapra írás nem sikerült");
    }
  }

  function publish(link: ShortLink) {
    setPendingAction(`${link.slug}:PUBLISH`);
    startTransition(async () => {
      const result = await publishShortLinkAction(link.slug);
      setPendingAction(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toastSync(`${link.slug} publikálva`, result.syncErrors);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const link = deleting;
    setPendingAction(`${link.slug}:DELETE`);
    startTransition(async () => {
      const result = await deleteShortLinkAction(link.slug);
      setPendingAction(null);
      setDeleting(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toastSync(`${link.slug} törölve`, result.syncErrors);
      router.refresh();
    });
  }

  function handleDone() {
    setCreating(false);
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {(canManage || canRepublish) && (
        <div className="flex gap-2">
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 size-4" />
              Új link
            </Button>
          )}
          {canRepublish && <RepublishButton />}
        </div>
      )}

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rövidítés</TableHead>
              <TableHead>Cél</TableHead>
              <TableHead>Jegyzet</TableHead>
              <TableHead className="w-px">Kattintás</TableHead>
              <TableHead className="w-px">Állapot</TableHead>
              {canManage && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 6 : 5}
                  className="h-24 text-center"
                >
                  Nincs még rövid link rögzítve.
                </TableCell>
              </TableRow>
            ) : (
              links.map((link) => {
                const state = publishState(link);
                const count = clicks[link.slug];

                return (
                  <TableRow key={link.slug}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-medium">
                          {link.slug}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Rövid cím másolása"
                          onClick={() => copy(link)}
                        >
                          {copied === link.slug ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm hover:underline"
                      >
                        {link.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {link.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={PUBLISH_STATE_BADGE_CLASS[state]}
                      >
                        {PUBLISH_STATE_LABELS[state]}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          {state !== "PUBLISHED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Publikálás"
                              disabled={busy(`${link.slug}:PUBLISH`)}
                              onClick={() => publish(link)}
                            >
                              <Upload className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Szerkesztés"
                            onClick={() => setEditing(link)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Törlés"
                            disabled={busy(`${link.slug}:DELETE`)}
                            onClick={() => setDeleting(link)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Radix unmounts the content on close, so the form remounts with fresh values. */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Új rövid link</DialogTitle>
            <DialogDescription>
              A rövidítés később nem módosítható, a cél igen.
            </DialogDescription>
          </DialogHeader>
          <ShortLinkForm shortHost={shortHost} onDone={handleDone} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.slug} szerkesztése</DialogTitle>
            <DialogDescription>
              A rövid cím változatlan marad, csak az átirányítás célja változik.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ShortLinkForm
              link={editing}
              shortHost={shortHost}
              onDone={handleDone}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Törlés megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              A {deleting?.slug} rövidítés megszűnik, és a már kiosztott cím
              többé nem működik.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
