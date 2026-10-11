"use client";

import { toast } from "sonner";
import type { ShortLink } from "@/app/generated/prisma/client";
import { useAppForm } from "@/components/form";
import {
  createShortLinkAction,
  updateShortLinkAction,
} from "@/lib/actions/short-links";
import { shortLinkFormSchema } from "@/lib/services/short-link-schemas";
import { toastSync } from "@/lib/toast";

export function ShortLinkForm({
  link,
  shortHost,
  onDone,
}: {
  link?: ShortLink;
  shortHost: string | null;
  onDone: () => void;
}) {
  const form = useAppForm({
    defaultValues: {
      slug: link?.slug ?? "",
      url: link?.url ?? "",
      note: link?.note ?? "",
    },
    validators: { onChange: shortLinkFormSchema(shortHost) },
    onSubmit: async ({ value }) => {
      const result = link
        ? await updateShortLinkAction(link.slug, {
            url: value.url,
            note: value.note,
          })
        : await createShortLinkAction(value);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toastSync(
        link ? `${result.data.slug} módosítva` : `${result.data.slug} felvéve`,
        result.syncErrors,
      );
      onDone();
    },
  });

  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      {!link && (
        <form.AppField name="slug">
          {(field) => (
            <field.TextField
              label="Rövidítés"
              placeholder="gala"
              hint="Ez kerül a rövid cím végére, és később nem módosítható."
              required
            />
          )}
        </form.AppField>
      )}

      <form.AppField name="url">
        {(field) => (
          <field.TextField
            label="Cél"
            placeholder="https://bsstudio.hu/esemenyek/gala"
            required
          />
        )}
      </form.AppField>

      <form.AppField name="note">
        {(field) => (
          <field.TextField
            label="Jegyzet"
            placeholder="Őszi gála plakát"
            hint="Csak itt látszik, hogy fél év múlva is kiderüljön, mire készült."
          />
        )}
      </form.AppField>

      <form.AppForm>
        <form.SubmitButton requireChanges={Boolean(link)}>
          {link ? "Mentés" : "Felvétel"}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}
