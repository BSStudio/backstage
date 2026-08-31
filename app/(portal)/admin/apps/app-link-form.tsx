"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import type { AppLink, AppLinkAccent } from "@/app/generated/prisma/client";
import { useAppForm } from "@/components/form";
import { Label } from "@/components/ui/label";
import {
  createAppLinkAction,
  updateAppLinkAction,
} from "@/lib/actions/app-links";
import { APP_LINK_ACCENT_LABELS, APP_LINK_TILE_CLASS } from "@/lib/app-links";
import { AppLinkFormSchema } from "@/lib/services/app-link-schemas";
import { cn } from "@/lib/utils";
import { APP_LINK_ACCENTS } from "@/types";
import { IconPicker } from "./icon-picker";

export function AppLinkForm({
  link,
  onDone,
}: {
  link?: AppLink;
  onDone: () => void;
}) {
  const iconId = useId();

  const form = useAppForm({
    defaultValues: {
      name: link?.name ?? "",
      description: link?.description ?? "",
      url: link?.url ?? "",
      icon: link?.icon ?? "globe",
      accent: link?.accent ?? "BLUE",
      featured: link?.featured ?? false,
    },
    validators: { onChange: AppLinkFormSchema },
    onSubmit: async ({ value }) => {
      const result = link
        ? await updateAppLinkAction(link.id, value)
        : await createAppLinkAction(value);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        link ? `${result.data.name} módosítva` : `${result.data.name} felvéve`,
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
      <form.AppField name="name">
        {(field) => <field.TextField label="Név" placeholder="Wiki" required />}
      </form.AppField>

      <form.AppField name="description">
        {(field) => (
          <field.TextField
            label="Leírás"
            placeholder="Dokumentáció és jegyzőkönyvek"
            hint="A kártyán a név alatt jelenik meg."
          />
        )}
      </form.AppField>

      <form.AppField name="url">
        {(field) => (
          <field.TextField
            label="Webcím"
            placeholder="https://wiki.bsstudio.hu"
            required
          />
        )}
      </form.AppField>

      <form.AppField name="icon">
        {(field) => (
          <IconPicker
            id={iconId}
            value={field.state.value}
            onChange={(name) => {
              field.handleChange(name);
              field.handleBlur();
            }}
          />
        )}
      </form.AppField>

      <form.AppField name="accent">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label>Szín</Label>
            <div className="flex flex-wrap gap-2">
              {APP_LINK_ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  title={APP_LINK_ACCENT_LABELS[accent]}
                  aria-label={APP_LINK_ACCENT_LABELS[accent]}
                  aria-pressed={field.state.value === accent}
                  onClick={() => field.handleChange(accent)}
                  className={cn(
                    "grid size-9 place-items-center rounded-lg border border-transparent transition-colors",
                    APP_LINK_TILE_CLASS[accent as AppLinkAccent],
                    field.state.value === accent && "border-current",
                  )}
                >
                  {field.state.value === accent && <Check className="size-4" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </form.AppField>

      <form.AppField name="featured">
        {(field) => (
          <field.CheckboxField
            label="Kiemelt"
            hint="A kiemelt alkalmazások a kezdőlapon is megjelennek."
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
