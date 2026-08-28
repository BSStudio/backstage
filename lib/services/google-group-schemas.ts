import { z } from "zod";

export const AnnotateEntrySchema = z
  .object({
    matchStatus: z.enum(["SECONDARY_EMAIL", "UNKNOWN"]),
    memberId: z.string().trim().nullish(),
    note: z.string().trim().max(200).nullish(),
  })
  .refine(
    (input) => input.matchStatus !== "SECONDARY_EMAIL" || input.memberId,
    {
      message: "Másodlagos címhez tagot kell választani",
      path: ["memberId"],
    },
  );

export const AnnotateEntryFormSchema = z.object({
  memberId: z.string().trim().min(1, "Válassz tagot"),
  note: z.string().trim().max(200, "Legfeljebb 200 karakter"),
});
