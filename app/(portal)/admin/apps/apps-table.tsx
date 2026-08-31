"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AppLink } from "@/app/generated/prisma/client";
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
  deleteAppLinkAction,
  moveAppLinkAction,
} from "@/lib/actions/app-links";
import { APP_LINK_TILE_CLASS, appLinkHost, appLinkIcon } from "@/lib/app-links";
import { cn } from "@/lib/utils";
import { AppLinkForm } from "./app-link-form";

export function AppsTable({
  links,
  canManage,
}: {
  links: AppLink[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AppLink | null>(null);
  const [deleting, setDeleting] = useState<AppLink | null>(null);
  // Several buttons share one transition, so this says which one is busy.
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function busy(action: string) {
    return isPending && pendingAction === action;
  }

  function move(link: AppLink, direction: "UP" | "DOWN") {
    setPendingAction(`${link.id}:${direction}`);
    startTransition(async () => {
      const result = await moveAppLinkAction(link.id, direction);
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmDelete() {
    const link = deleting;
    if (!link) return;

    setPendingAction(`${link.id}:DELETE`);
    startTransition(async () => {
      const result = await deleteAppLinkAction(link.id);
      setPendingAction(null);
      setDeleting(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${link.name} törölve`);
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
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Új alkalmazás
          </Button>
        </div>
      )}

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alkalmazás</TableHead>
              <TableHead>Webcím</TableHead>
              <TableHead className="w-px">Kiemelt</TableHead>
              {canManage && <TableHead className="w-px">Sorrend</TableHead>}
              {canManage && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 5 : 3}
                  className="h-24 text-center"
                >
                  Nincs még alkalmazás rögzítve.
                </TableCell>
              </TableRow>
            ) : (
              links.map((link, index) => {
                const Icon = appLinkIcon(link.icon);
                return (
                  <TableRow key={link.id}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-lg",
                            APP_LINK_TILE_CLASS[link.accent],
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="flex flex-col">
                          <span className="font-medium">{link.name}</span>
                          {link.description && (
                            <span className="text-sm text-muted-foreground">
                              {link.description}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:underline"
                      >
                        {appLinkHost(link.url)}
                      </a>
                    </TableCell>
                    <TableCell>
                      {link.featured && (
                        <Badge variant="outline" className="whitespace-nowrap">
                          <Star className="size-3 fill-current" />
                          Kiemelt
                        </Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <span className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Feljebb"
                            disabled={index === 0 || busy(`${link.id}:UP`)}
                            onClick={() => move(link, "UP")}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Lejjebb"
                            disabled={
                              index === links.length - 1 ||
                              busy(`${link.id}:DOWN`)
                            }
                            onClick={() => move(link, "DOWN")}
                          >
                            <ArrowDown />
                          </Button>
                        </span>
                      </TableCell>
                    )}
                    {canManage && (
                      <TableCell>
                        <span className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Szerkesztés"
                            onClick={() => setEditing(link)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Törlés"
                            disabled={busy(`${link.id}:DELETE`)}
                            onClick={() => setDeleting(link)}
                          >
                            <Trash2 />
                          </Button>
                        </span>
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
            <DialogTitle>Új alkalmazás</DialogTitle>
            <DialogDescription>
              Az alkalmazás megjelenik az Alkalmazások oldalon.
            </DialogDescription>
          </DialogHeader>
          <AppLinkForm onDone={handleDone} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.name} szerkesztése</DialogTitle>
            <DialogDescription>
              A módosítás azonnal látszik mindenkinek.
            </DialogDescription>
          </DialogHeader>
          {editing && <AppLinkForm link={editing} onDone={handleDone} />}
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
              A(z) {deleting?.name} törlésre kerül az Alkalmazások oldalról. A
              hivatkozott alkalmazás maga érintetlen marad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
