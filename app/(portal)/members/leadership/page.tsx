import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { getInitials } from "@/lib/members";
import prisma from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vezetőség - Backstage" };

export default async function LeadershipPage() {
  const rawMembers = await prisma.member.findMany({
    where: {
      archived: false,
      leadershipRole: {
        isNot: null,
      },
    },
    include: {
      leadershipRole: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Head of studio ("Stúdióvezető") first, then by last name
  const members = [...rawMembers].sort((a, b) => {
    const aIsHead = a.leadershipRole?.label === "Stúdióvezető" ? 0 : 1;
    const bIsHead = b.leadershipRole?.label === "Stúdióvezető" ? 0 : 1;
    if (aIsHead !== bIsHead) return aIsHead - bIsHead;
    return a.lastName.localeCompare(b.lastName, "hu");
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vezetőség</h1>
        <p className="text-muted-foreground">
          {members.length} vezetőségi tag.
        </p>
      </div>

      {members.length === 0 ? (
        <Card className="p-6">
          <p className="text-muted-foreground">
            Nincs vezetőségi tag rögzítve.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const isHead = m.leadershipRole?.label === "Stúdióvezető";
            return (
              <Card
                key={m.id}
                className={cn(
                  "flex flex-col items-center gap-3 p-6 text-center",
                  isHead && "ring-2 ring-primary",
                )}
              >
                <Link
                  href={`/members/${m.id}`}
                  className="group flex flex-col items-center gap-2"
                >
                  <Avatar className="size-20">
                    {m.avatarUrl && (
                      <AvatarImage
                        src={m.avatarUrl}
                        alt={`${m.lastName} ${m.firstName}`}
                      />
                    )}
                    <AvatarFallback className="text-lg">
                      {getInitials(m.firstName, m.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-medium group-hover:underline">
                      {m.lastName} {m.firstName}
                    </span>
                    {m.leadershipRole && (
                      <span
                        className={cn(
                          "text-sm",
                          isHead
                            ? "font-medium text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {m.leadershipRole.label}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex flex-col items-center gap-1.5">
                  <a
                    href={`mailto:${m.email}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{m.email}</span>
                  </a>
                  {m.mobile && (
                    <a
                      href={`tel:${m.mobile}`}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>{m.mobile}</span>
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
