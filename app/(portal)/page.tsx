import type { Metadata } from "next";
import { Suspense } from "react";
import { HeroEvent, UpcomingEvents } from "@/components/dashboard/calendar";
import { ComputersCard } from "@/components/dashboard/computers-card";
import {
  ProfileCard,
  readOwnProfile,
} from "@/components/dashboard/profile-card";
import { QuickLinks } from "@/components/dashboard/quick-links";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFullDate } from "@/lib/calendar";
import { pageActor } from "@/lib/session";
import { civilDate } from "@/types";

export const metadata: Metadata = { title: "Kezdőlap - Backstage" };

export default async function DashboardPage() {
  const actor = await pageActor();
  const member = await readOwnProfile(actor.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {member ? `Szia, ${member.firstName}!` : "Kezdőlap"}
        </h1>
        <p className="text-muted-foreground">
          {formatFullDate(civilDate(new Date()))}
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-28 w-full rounded-xl" />}>
        <HeroEvent />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-[1.85fr_1fr] lg:items-start">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <UpcomingEvents />
        </Suspense>

        <div className="flex flex-col gap-4">
          <ProfileCard memberId={actor.id} />
          <QuickLinks />
          <ComputersCard />
        </div>
      </div>
    </div>
  );
}
