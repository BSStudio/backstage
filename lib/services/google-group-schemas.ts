import { z } from "zod";

export const AnnotateEntrySchema = z
  .object({
    matchStatus: z.enum(["SECONDARY_EMAIL", "KNOWN_ADDRESS", "UNKNOWN"]),
    memberId: z.string().trim().nullish(),
    note: z.string().trim().max(200).nullish(),
  })
  .refine(
    (input) => input.matchStatus !== "SECONDARY_EMAIL" || input.memberId,
    {
      message: "Másodlagos címhez tagot kell választani",
      path: ["memberId"],
    },
  )
  .refine((input) => input.matchStatus !== "KNOWN_ADDRESS" || input.note, {
    message: "Ismert címhez megjegyzés kell",
    path: ["note"],
  });

const noteSchema = z.string().trim().max(200, "Legfeljebb 200 karakter");

export const AnnotateEntryFormSchema = z.object({
  memberId: z.string().trim().min(1, "Válassz tagot"),
  note: noteSchema,
});

export const KnownAddressFormSchema = z.object({
  note: noteSchema.min(1, "Írd le, mi ez a cím"),
});
