"use client";

import { Check, Copy, Plus, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  createCardDavTokenAction,
  revokeCardDavTokenAction,
} from "@/lib/actions/carddav";
import { CreateCardDavTokenSchema } from "@/lib/services/carddav-schemas";

export interface CardDavDevice {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function formatDate(value: Date | null): string {
  return value
    ? new Date(value).toLocaleString("hu-HU")
    : "Még nem volt használva";
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Nem sikerült a vágólapra másolni");
      return;
    }
    setCopied(true);
    toast.success("Vágólapra másolva");
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          <span className="sr-only">Másolás</span>
        </Button>
      </div>
    </div>
  );
}

export function CardDavDevices({
  memberId,
  email,
  canCreate,
  devices,
}: {
  memberId: string;
  email: string;
  canCreate: boolean;
  devices: CardDavDevice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minted, setMinted] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isRevoking, startRevoking] = useTransition();

  const form = useAppForm({
    defaultValues: { label: "" },
    validators: { onChange: CreateCardDavTokenSchema },
    onSubmit: async ({ value }) => {
      const result = await createCardDavTokenAction(memberId, value);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setMinted(result.data.token);
      router.refresh();
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMinted(null);
      form.reset();
    }
  }

  function revoke(device: CardDavDevice) {
    setPendingId(device.id);
    startRevoking(async () => {
      const result = await revokeCardDavTokenAction(device.id);
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${device.label} törölve`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Névjegyek szinkronizálása</h2>
          <p className="text-sm text-muted-foreground">
            A stúdió névjegyei CardDAV-on keresztül szinkronizálhatók a
            telefonodra.
          </p>
        </div>
        {canCreate && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Plus />
            Új eszköz
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="px-4">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nincs beállított eszköz.
            </p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Eszköz</TableHead>
                    <TableHead>Hozzáadva</TableHead>
                    <TableHead>Utoljára használva</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <Smartphone className="size-4 text-muted-foreground" />
                          {device.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(device.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(device.lastUsedAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          disabled={isRevoking && pendingId === device.id}
                          onClick={() => revoke(device)}
                        >
                          <Trash2 />
                          Törlés
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          {minted === null ? (
            <form
              className="flex min-w-0 flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                form.handleSubmit();
              }}
            >
              <DialogHeader>
                <DialogTitle>Új eszköz</DialogTitle>
                <DialogDescription>
                  Adj nevet az eszköznek, hogy később felismerd a listában.
                </DialogDescription>
              </DialogHeader>
              <form.AppField name="label">
                {(field) => (
                  <field.TextField label="Eszköz neve" placeholder="iPhone" />
                )}
              </form.AppField>
              <DialogFooter>
                <form.AppForm>
                  <form.SubmitButton>Jelszó kérése</form.SubmitButton>
                </form.AppForm>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Eszköz beállítása</DialogTitle>
                <DialogDescription>
                  A jelszó csak most látható. Ha később szükséged lenne rá,
                  töröld az eszközt, és adj hozzá egy újat.
                </DialogDescription>
              </DialogHeader>
              <CopyField label="Szerver" value={window.location.origin} />
              <CopyField label="Felhasználónév" value={email} />
              <CopyField label="Jelszó" value={minted} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
