"use client";

import {
  createFormHook,
  createFormHookContexts,
  useSelector,
} from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

export type FieldOption<T extends string = string> = {
  value: T;
  label: string;
};

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
}: {
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const field = useFieldContext<string>();
  const errors = useFieldErrors();
  const handleBlur = useBlurHandler();
  const errorId = `${field.name}-error`;

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
        aria-describedby={errors.length > 0 ? errorId : undefined}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
      />
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
  fieldComponents: { TextField, SelectField, CheckboxGroupField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});
