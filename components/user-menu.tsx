"use client";

import { LogOut, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAvatar } from "@/components/avatar-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/members";

export function UserMenu({
  id,
  firstName,
  lastName,
  email,
}: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}) {
  const displayName = `${lastName} ${firstName}`.trim();
  const router = useRouter();
  const { avatarUrl } = useAvatar();

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative size-8 rounded-full">
          <Avatar key={avatarUrl ?? "fallback"} className="size-8">
            {avatarUrl && (
              <AvatarImage src={avatarUrl} alt={`${lastName} ${firstName}`} />
            )}
            <AvatarFallback>{getInitials(firstName, lastName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/members/${id}`}>
            <UserIcon className="mr-2 size-4" />
            Profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 size-4" />
          Kijelentkezés
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
