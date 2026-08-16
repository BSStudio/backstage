import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface, type Interface } from "node:readline/promises";
import { z } from "zod";
import { MEMBERSHIP_STATUSES } from "../types";
import { fail, info } from "./utils";

export const DEV_USER_FILE = ".dev-user.json";

const DevUserSchema = z.object({
  // The Authentik `sub` claim: it becomes the Member id, so SSO login lands on this row.
  id: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  nickname: z.string().trim().nullable().default(null),
  email: z.email(),
  status: z.enum(MEMBERSHIP_STATUSES).default("MEMBER"),
});

export type DevUser = z.infer<typeof DevUserSchema>;

export async function resolveDevUser(reset: boolean): Promise<DevUser> {
  const stored = await readDevUser();
  if (stored && !reset) return stored;

  const devUser = await promptDevUser(stored);
  await writeFile(
    DEV_USER_FILE,
    `${JSON.stringify(devUser, null, 2)}\n`,
    "utf8",
  );
  info(`Saved to ${DEV_USER_FILE} (gitignored) — reruns will not ask again.`);
  return devUser;
}

async function readDevUser(): Promise<DevUser | null> {
  if (!existsSync(DEV_USER_FILE)) return null;

  const raw = await readFile(DEV_USER_FILE, "utf8");
  const parsed = DevUserSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    fail(
      `${DEV_USER_FILE} is invalid: ${z.prettifyError(parsed.error)}\n` +
        "  Fix it by hand, or delete the file and rerun.",
    );
  }
  return parsed.data;
}

async function promptDevUser(defaults: DevUser | null): Promise<DevUser> {
  if (!process.stdin.isTTY) {
    fail(
      `No ${DEV_USER_FILE} and no interactive terminal. Create the file by hand:\n` +
        `  {"id":"<authentik sub>","firstName":"…","lastName":"…","nickname":null,"email":"…","status":"MEMBER"}`,
    );
  }

  console.log(`
Who are you? This creates your own member record in the dev database.

The Authentik ID is the "sub" claim of your Authentik account — it becomes the
Member id, so logging in through SSO finds this record instead of creating a
second one. Find it in your id_token, or in Authentik under
Directory → Users → your user.
`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const firstName = await ask(rl, "First name", defaults?.firstName);
    const lastName = await ask(rl, "Last name", defaults?.lastName);
    const nickname = await ask(rl, "Nickname", defaults?.nickname, {
      optional: true,
    });
    const email = await ask(rl, "Email", defaults?.email, {
      validate: (value) =>
        z.email().safeParse(value).success ? null : "Not an email address.",
    });
    const id = await ask(rl, "Authentik ID (sub)", defaults?.id);

    return {
      firstName,
      lastName,
      nickname: nickname || null,
      email,
      id,
      status: defaults?.status ?? "MEMBER",
    };
  } finally {
    rl.close();
  }
}

interface AskOptions {
  optional?: boolean;
  validate?: (value: string) => string | null;
}

async function ask(
  rl: Interface,
  label: string,
  fallback?: string | null,
  { optional = false, validate }: AskOptions = {},
): Promise<string> {
  const suffix = fallback
    ? `${optional ? " (- to clear)" : ""} [${fallback}]`
    : optional
      ? " (optional)"
      : "";
  for (;;) {
    const answer = (await rl.question(`  ${label}${suffix}: `)).trim();
    if (optional && answer === "-") return "";
    const value = answer || fallback || "";

    if (!value) {
      if (optional) return "";
      console.log("    Required.");
      continue;
    }

    const error = validate?.(value);
    if (error) {
      console.log(`    ${error}`);
      continue;
    }
    return value;
  }
}
