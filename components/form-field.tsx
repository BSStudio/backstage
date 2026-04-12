import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormField({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required = false,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        onChange={onChange}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
      />
    </div>
  );
}
