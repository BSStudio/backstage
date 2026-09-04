import { z } from "zod";

// Any agent may create a row under this id, so a typo in one workstation's config would
// otherwise leave a stray machine on the page forever.
export const ComputerIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{1,31}$/);

// Unknown keys are stripped, so a newer agent cannot quietly widen what the portal renders.
export const ComputerMetadataSchema = z.object({
  os: z.string().trim().max(120).optional(),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryPercent: z.number().min(0).max(100).optional(),
  diskPercent: z.number().min(0).max(100).optional(),
  // Null when nobody is signed in; absent when the agent does not report it at all.
  loggedInUser: z.string().trim().max(120).nullable().optional(),
  // The lock or sign-in screen is up. Reported rather than resolved into "free" here, so
  // changing what counts as free does not mean reinstalling every agent.
  locked: z.boolean().optional(),
  agentVersion: z.string().trim().max(40).optional(),
});

export const PingComputerSchema = z.object({
  metadata: ComputerMetadataSchema.default({}),
});

export type ComputerMetadata = z.infer<typeof ComputerMetadataSchema>;
export type PingComputerInput = z.infer<typeof PingComputerSchema>;
