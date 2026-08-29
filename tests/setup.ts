import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { PrismaClient } from "@/app/generated/prisma/client";

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withEnvironment({
      POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=hu-HU",
      LC_COLLATE: "hu_HU.utf8",
      LC_CTYPE: "hu_HU.utf8",
    })
    .start();

  const connectionString = container.getConnectionUri();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: connectionString },
  });

  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

afterEach(async () => {
  // Clean up all test data between tests, respecting FK order
  await prisma.auditLog.deleteMany();
  await prisma.timelineEntry.deleteMany();
  await prisma.leadershipRole.deleteMany();
  await prisma.syncJob.deleteMany();
  await prisma.googleGroupEntry.deleteMany();
  await prisma.cardDAVToken.deleteMany();
  await prisma.member.deleteMany();
});

export function getTestPrisma() {
  return prisma;
}

export function mockPrisma() {
  vi.doMock("@/lib/prisma", () => ({ default: prisma }));
}
