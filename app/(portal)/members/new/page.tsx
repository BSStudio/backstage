"use client";

import { Check, CheckCircle2, Copy, ExternalLink, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createMemberAction } from "@/lib/actions/members";
import { NewMemberFormSchema } from "@/lib/services/member-schemas";

type CreatedMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

const GOOGLE_GROUP_URL = process.env.NEXT_PUBLIC_GOOGLE_GROUP_URL;

const EMPTY_MEMBER = {
  lastName: "",
  firstName: "",
  nickname: "",
  email: "",
  mobile: "",
  university: "",
  major: "",
  dormRoom: "",
};

export default function NewMemberPage() {
  const router = useRouter();
  const [created, setCreated] = useState<CreatedMember | null>(null);

  const form = useAppForm({
    defaultValues: EMPTY_MEMBER,
    validators: { onChange: NewMemberFormSchema },
    onSubmit: async ({ value }) => {
      const result = await createMemberAction(value);
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
    },
  });

  if (created) {
    return (
      <SuccessStep
        created={created}
        onAddAnother={() => {
          form.reset();
          setCreated(null);
        }}
      />
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <form.AppField name="lastName">
                {(field) => (
                  <field.TextField
                    label="Vezetéknév"
                    placeholder="Kovács"
                    required
                  />
                )}
              </form.AppField>
              <form.AppField name="firstName">
                {(field) => (
                  <field.TextField
                    label="Keresztnév"
                    placeholder="János"
                    required
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="nickname">
              {(field) => (
                <field.TextField label="Becenév" placeholder="Jani" />
              )}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  label="Email"
                  type="email"
                  placeholder="kovacs.janos@bsstudio.hu"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="mobile">
              {(field) => (
                <field.TextField
                  label="Telefonszám"
                  type="tel"
                  placeholder="+36 30 123 4567"
                />
              )}
            </form.AppField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <form.AppField name="university">
                {(field) => (
                  <field.TextField label="Egyetem, kar" placeholder="BME-VIK" />
                )}
              </form.AppField>
              <form.AppField name="major">
                {(field) => (
                  <field.TextField
                    label="Szak"
                    placeholder="mérnökinformatikus"
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="dormRoom">
              {(field) => (
                <field.TextField label="Szobaszám" placeholder="SCH 1308" />
              )}
            </form.AppField>

            <div className="flex gap-2 pt-2">
              <form.AppForm>
                <form.SubmitButton>Hozzáadás</form.SubmitButton>
              </form.AppForm>
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
