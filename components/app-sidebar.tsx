"use client";

import {
  FolderSync,
  Home,
  LayoutGrid,
  Mails,
  Monitor,
  ScrollText,
  Settings,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { NAV_LABELS } from "@/lib/nav-labels";
import type { UserRole } from "@/types";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  children?: { title: string; url: string }[];
};

const mainNav: NavItem[] = [
  {
    title: NAV_LABELS[""],
    url: "/",
    icon: Home,
  },
  {
    title: NAV_LABELS.members,
    url: "/members",
    icon: UsersRound,
    children: [
      { title: NAV_LABELS.membersActive, url: "/members" },
      { title: NAV_LABELS.leadership, url: "/members/leadership" },
      { title: NAV_LABELS.alumni, url: "/members/alumni" },
      { title: NAV_LABELS["studio-leaders"], url: "/members/studio-leaders" },
      { title: NAV_LABELS.archived, url: "/members/archived" },
    ],
  },
  {
    title: NAV_LABELS.apps,
    url: "/apps",
    icon: LayoutGrid,
    disabled: true,
  },
  {
    title: NAV_LABELS.computers,
    url: "/computers",
    icon: Monitor,
    disabled: true,
  },
];

const adminNav: NavItem[] = [
  {
    title: NAV_LABELS.audit,
    url: "/admin/audit",
    icon: ScrollText,
  },
  {
    title: NAV_LABELS["sync-jobs"],
    url: "/admin/sync-jobs",
    icon: FolderSync,
  },
  {
    title: NAV_LABELS["google-group"],
    url: "/admin/google-group",
    icon: Mails,
    disabled: true,
  },
  {
    title: NAV_LABELS.adminApps,
    url: "/admin/apps",
    icon: Settings,
    disabled: true,
  },
];

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            // Parents with children are never marked active - the child indicates the route
            const isActive = !item.children && pathname === item.url;
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.url}>
                {item.disabled ? (
                  <SidebarMenuButton
                    isActive={false}
                    disabled
                    tooltip="Hamarosan"
                    className="opacity-50"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.title}
                    className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground"
                  >
                    <Link href={item.url}>
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                )}
                {item.children && !item.disabled && (
                  <SidebarMenuSub>
                    {item.children.map((child) => (
                      <SidebarMenuSubItem key={child.url}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === child.url}
                          className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground"
                        >
                          <Link href={child.url}>{child.title}</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const isAdmin = role === "ADMIN";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <Image src="/logo.svg" alt="BSS" width={32} height={10} priority />
          <span className="font-heading text-lg font-semibold group-data-[collapsible=icon]:hidden">
            Backstage
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavSection label="Navigáció" items={mainNav} pathname={pathname} />
        {isAdmin && (
          <NavSection label="Admin" items={adminNav} pathname={pathname} />
        )}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
