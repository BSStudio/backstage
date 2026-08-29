import { z } from "zod";

const labelError = "Az eszköz nevének megadása kötelező";

export const CreateCardDavTokenSchema = z.object({
  label: z
    .string({ error: labelError })
    .trim()
    .min(1, { error: labelError })
    .max(60, { error: "Legfeljebb 60 karakter" }),
});

export type CreateCardDavTokenInput = z.infer<typeof CreateCardDavTokenSchema>;
