"use client";

import { Check, Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, use, useState, useTransition } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  CLICK_WINDOW_DAYS,
  PUBLISH_STATE_BADGE_CLASS,
  PUBLISH_STATE_LABELS,
  publishState,
  shortLinkUrl,
} from "@/lib/short-links";
import { toastSync } from "@/lib/toast";
import { RepublishButton } from "./republish-button";
import { ShortLinkForm } from "./short-link-form";

// Null means Cloudflare did not answer; a slug it has no rows for had no clicks in the window.
function ClickCount({
  clicks,
  slug,
}: {
  clicks: Promise<Record<string, number> | null>;
  slug: string;
}) {
  const counts = use(clicks);
  return counts ? (counts[slug] ?? 0) : "—";
}

export function ShortLinksTable({
  links,
  clicks,
  baseUrl,
  canManage,
  canPublish,
  canRepublish,
}: {
  links: ShortLink[];
  clicks: Promise<Record<string, number> | null> | null;
  baseUrl: string | null;
  canManage: boolean;
  canPublish: boolean;
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

  async function copy(base: string, link: ShortLink) {
    try {
      await navigator.clipboard.writeText(shortLinkUrl(base, link.slug));
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

  const columns = 4 + (clicks ? 1 : 0) + (canManage ? 1 : 0);
  const deletePending = deleting !== null && busy(`${deleting.slug}:DELETE`);

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
              <TableHead>Végződés</TableHead>
              <TableHead>Cél</TableHead>
              <TableHead>Megjegyzés</TableHead>
              {clicks && (
                <TableHead className="w-px">
                  Kattintás ({CLICK_WINDOW_DAYS} nap)
                </TableHead>
              )}
              <TableHead className="w-px">Állapot</TableHead>
              {canManage && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns} className="h-24 text-center">
                  Nincs még rövid link rögzítve.
                </TableCell>
              </TableRow>
            ) : (
              links.map((link) => {
                const state = publishState(link);

                return (
                  <TableRow key={link.slug}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-medium">
                          {link.slug}
                        </span>
                        {baseUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Rövid cím másolása"
                            onClick={() => copy(baseUrl, link)}
                          >
                            {copied === link.slug ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                        )}
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
                    <TableCell className="min-w-48 whitespace-normal text-muted-foreground">
                      {link.note ?? "—"}
                    </TableCell>
                    {clicks && (
                      <TableCell className="text-right tabular-nums">
                        <Suspense
                          fallback={<Skeleton className="ml-auto h-4 w-6" />}
                        >
                          <ClickCount clicks={clicks} slug={link.slug} />
                        </Suspense>
                      </TableCell>
                    )}
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
                          {canPublish && state !== "PUBLISHED" && (
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
              A végződés később nem módosítható, a cél igen.
            </DialogDescription>
          </DialogHeader>
          <ShortLinkForm baseUrl={baseUrl} onDone={handleDone} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <span className="font-mono">{editing?.slug}</span> szerkesztése
            </DialogTitle>
            <DialogDescription>
              A rövid cím változatlan marad, csak az átirányítás célja változik.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ShortLinkForm
              link={editing}
              baseUrl={baseUrl}
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
            <AlertDialogTitle>
              <span className="font-mono">{deleting?.slug}</span> törlése
            </AlertDialogTitle>
            <AlertDialogDescription>
              A rövid link megszűnik, és a már kiosztott cím többé nem működik.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              Mégse
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {deletePending ? "Törlés…" : "Törlés"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
