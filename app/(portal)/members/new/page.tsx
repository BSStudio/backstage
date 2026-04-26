"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createMemberAction } from "@/lib/actions/members";

export default function NewMemberPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
      router.push("/members");
    });
  };

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
