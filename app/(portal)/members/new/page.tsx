"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createMemberAction } from "@/lib/actions/members";

export default function NewMemberPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const input: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      const str = value.toString().trim();
      if (str) input[key] = str;
    }

    startTransition(async () => {
      const result = await createMemberAction(input);
      if (!result.success) {
        setError(result.error);
        return;
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Mentés..." : "Hozzáadás"}
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
