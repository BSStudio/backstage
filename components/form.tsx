"use client";

import {
  createFormHook,
  createFormHookContexts,
  useSelector,
} from "@tanstack/react-form";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

export type FieldOption<T extends string = string> = {
  value: T;
  label: string;
};

// cmdk scores a fuzzy subsequence by default, which matches any name carrying the query's
// letters in order. Substring only, accent-insensitive so "kovacs" still finds "Kovács".
function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// `hint` is shown beside the label but stays out of the search text, so a marker like
// "archivált" cannot match every archived member at once.
export type ComboboxOption = FieldOption & { hint?: string };

function messagesOf(errors: unknown[]): string[] {
  const messages = errors.map((error) =>
    typeof error === "string"
      ? error
      : (error as { message?: string })?.message,
  );
  return [
    ...new Set(messages.filter((message): message is string => !!message)),
  ];
}

// Half-typed input should not be flagged as invalid mid-keystroke.
function useFieldErrors(): string[] {
  const field = useFieldContext<unknown>();
  const submitted = useSelector(
    field.form.store,
    (state) => state.submissionAttempts > 0,
  );
  const { errors, isBlurred } = field.state.meta;
  return isBlurred || submitted ? messagesOf(errors) : [];
}

// Each validation cause owns a slot in `errorMap` and `meta.errors` flattens
// all of them, so forms register the schema on `onChange` alone and blur
// re-runs that one. Adding it to `onBlur` renders two messages at once.
function useBlurHandler(): () => void {
  const field = useFieldContext<unknown>();
  return () => {
    field.handleBlur();
    field.validate("change");
  };
}

function FieldErrors({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {messages.join(" ")}
    </p>
  );
}

function TextField({
  label,
  type = "text",
  placeholder,
  required = false,
  hint,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  const field = useFieldContext<string>();
  const errors = useFieldErrors();
  const handleBlur = useBlurHandler();
  const errorId = `${field.name}-error`;
  const hintId = `${field.name}-hint`;
  const describedBy =
    [hint ? hintId : null, errors.length > 0 ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.name}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        placeholder={placeholder}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={handleBlur}
        aria-invalid={errors.length > 0}
        aria-describedby={describedBy}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
      />
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      <FieldErrors id={errorId} messages={errors} />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  options,
}: {
  label: string;
  options: FieldOption<T>[];
}) {
  const field = useFieldContext<T>();
  const errors = useFieldErrors();
  const handleBlur = useBlurHandler();
  const errorId = `${field.name}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.name}>{label}</Label>
      <Select
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value as T)}
      >
        <SelectTrigger
          id={field.name}
          onBlur={handleBlur}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length > 0 ? errorId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldErrors id={errorId} messages={errors} />
    </div>
  );
}

function ComboboxField({
  label,
  options,
  placeholder = "Válassz…",
  searchPlaceholder = "Keresés…",
}: {
  label: string;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const field = useFieldContext<string>();
  const errors = useFieldErrors();
  const handleBlur = useBlurHandler();
  const [open, setOpen] = useState(false);
  const errorId = `${field.name}-error`;
  const selected = options.find((option) => option.value === field.state.value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.name}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={field.name}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={errors.length > 0}
            aria-describedby={errors.length > 0 ? errorId : undefined}
            onBlur={handleBlur}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="truncate">
                {selected.label}
                {selected.hint ? (
                  <span className="ml-2 text-muted-foreground">
                    {selected.hint}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {/* Matching the trigger width keeps long names from widening the popover past the field. */}
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command
            filter={(value, search) =>
              searchable(value).includes(searchable(search)) ? 1 : 0
            }
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Nincs találat.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      field.handleChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        option.value === field.state.value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {option.label}
                    {option.hint ? (
                      <span className="ml-2 text-muted-foreground text-xs">
                        {option.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <FieldErrors id={errorId} messages={errors} />
    </div>
  );
}

function CheckboxGroupField({
  label,
  options,
}: {
  label: string;
  options: FieldOption[];
}) {
  const field = useFieldContext<string[]>();
  const errors = useFieldErrors();
  const errorId = `${field.name}-error`;
  const selected = field.state.value;

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((id) => id !== value)
      : [...selected, value];
    // Sorted so that unchecking and rechecking a box does not read as a change.
    field.handleChange(next.sort());
    // A click is a finished interaction; there is no later blur to wait for.
    field.handleBlur();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div
        className="flex flex-col gap-1.5"
        aria-describedby={errors.length > 0 ? errorId : undefined}
      >
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={`${field.name}-${option.value}`}
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
            />
            <Label
              htmlFor={`${field.name}-${option.value}`}
              className="font-normal"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>
      <FieldErrors id={errorId} messages={errors} />
    </div>
  );
}

function SubmitButton({
  children,
  disabled = false,
  requireChanges = false,
  size,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  requireChanges?: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);

  return (
    <Button
      type="submit"
      size={size}
      disabled={disabled || isSubmitting || (requireChanges && unchanged)}
    >
      {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export const { useAppForm } = createFormHook({
  fieldComponents: {
    TextField,
    SelectField,
    ComboboxField,
    CheckboxGroupField,
  },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});
