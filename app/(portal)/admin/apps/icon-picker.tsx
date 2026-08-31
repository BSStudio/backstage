"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  APP_LINK_ICON_LABELS,
  APP_LINK_ICONS,
  appLinkIcon,
  appLinkIconLabel,
} from "@/lib/app-links";
import { cn } from "@/lib/utils";
import { APP_LINK_ICON_NAMES, type AppLinkIconName } from "@/types";

// A grid rather than a searchable list: picking an icon means browsing what exists, and
// nobody can search a vocabulary they have not seen yet. All of them fit without scrolling.
export function IconPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (name: AppLinkIconName) => void;
}) {
  const [open, setOpen] = useState(false);
  const Selected = appLinkIcon(value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Ikon</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2">
              <Selected className="size-4" />
              {appLinkIconLabel(value)}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <div className="grid grid-cols-8 gap-1">
            {APP_LINK_ICON_NAMES.map((name) => {
              const Icon = APP_LINK_ICONS[name];
              const label = APP_LINK_ICON_LABELS[name];
              return (
                <button
                  key={name}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={value === name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className={cn(
                    "grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    value === name &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
