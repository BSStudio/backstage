"use client";

import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createMemberAction } from "@/lib/actions/members";

type CreatedMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

const GOOGLE_GROUP_URL = process.env.NEXT_PUBLIC_GOOGLE_GROUP_URL;

export default function NewMemberPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<CreatedMember | null>(null);

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const input: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      input[key] = value.toString().trim();
    }

    startTransition(async () => {
      const result = await createMemberAction(input);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.syncErrors && result.syncErrors.length > 0) {
        toast.warning(
          `Tag hozzáadva, de a szinkronizálás során hiba történt: ${result.syncErrors.join(", ")}`,
        );
      } else {
        toast.success("Tag hozzáadva");
      }
      setCreated(result.data as CreatedMember);
    });
  };

  if (created) {
    return (
      <SuccessStep created={created} onAddAnother={() => setCreated(null)} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Új tag hozzáadása</h1>
        <p className="text-muted-foreground">
          Új tag rögzítése jelölt-jelölt státusszal.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="px-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="lastName"
                label="Vezetéknév"
                placeholder="Kovács"
                required
              />
              <FormField
                name="firstName"
                label="Keresztnév"
                placeholder="János"
                required
              />
            </div>
            <FormField name="nickname" label="Becenév" placeholder="Jani" />
            <FormField
              name="email"
              label="Email"
              type="email"
              placeholder="kovacs.janos@bsstudio.hu"
              required
            />
            <FormField
              name="mobile"
              label="Telefonszám"
              type="tel"
              placeholder="+36 30 123 4567"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="university"
                label="Egyetem, kar"
                placeholder="BME-VIK"
              />
              <FormField
                name="major"
                label="Szak"
                placeholder="mérnökinformatikus"
              />
            </div>
            <FormField
              name="dormRoom"
              label="Szobaszám"
              placeholder="SCH 1308"
            />

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Hozzáadás
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/members")}
              >
                Mégse
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SuccessStep({
  created,
  onAddAnother,
}: {
  created: CreatedMember;
  onAddAnother: () => void;
}) {
  const router = useRouter();
  const [emailCopied, setEmailCopied] = useState(false);
  const fullName = `${created.lastName} ${created.firstName}`;

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(created.email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      toast.error("Nem sikerült másolni az email-címet");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tag hozzáadva</h1>
          <p className="text-muted-foreground">
            {fullName} sikeresen rögzítve.
          </p>
        </div>
      </div>

      <Card className="max-w-2xl border-primary/40 bg-primary/5">
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4" />
            Még egy lépés: Google Group
          </div>
          <p className="text-sm text-muted-foreground">
            Add hozzá az új tag email-címét a stúdió Google csoportjához. Ez nem
            történik meg automatikusan.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyEmail}>
              {emailCopied ? (
                <Check className="mr-2 size-3.5" />
              ) : (
                <Copy className="mr-2 size-3.5" />
              )}
              {emailCopied ? "Másolva" : "Email másolása"}
            </Button>
            {GOOGLE_GROUP_URL ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={GOOGLE_GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Group megnyitása
                  <ExternalLink className="ml-2 size-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => router.push(`/members/${created.id}`)}>
          Profil megnyitása
        </Button>
        <Button variant="outline" onClick={() => router.push("/members")}>
          Vissza a listához
        </Button>
        <Button variant="ghost" onClick={onAddAnother}>
          Új tag hozzáadása
        </Button>
      </div>
    </div>
  );
}
