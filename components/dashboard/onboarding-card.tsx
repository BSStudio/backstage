import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { onboardingSteps } from "@/lib/members";
import { readOwnProfile } from "./profile-card";

export async function OnboardingCard({ memberId }: { memberId: string }) {
  const member = await readOwnProfile(memberId);
  if (!member) return null;

  const steps = onboardingSteps(member);
  // Nothing left to ask for, so the card is gone rather than congratulatory.
  if (steps.every((step) => step.done)) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Indulás</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 text-xs">
        {steps.map((step) =>
          step.done ? (
            <span
              key={step.key}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <CheckCircle2 className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
              {step.label}
            </span>
          ) : (
            // Both open steps are closed on the member's own profile, so each row goes
            // there rather than the card repeating one link under the list.
            <Link
              key={step.key}
              href={`/members/${member.id}`}
              className="flex items-center gap-2 font-medium text-primary hover:underline"
            >
              <Circle className="size-3.5 shrink-0" />
              {step.label}
            </Link>
          ),
        )}
      </CardContent>
    </Card>
  );
}
