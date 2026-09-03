"use client";

import {
  ExternalLink,
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
import { canViewAdminArea } from "@/lib/permissions";
import type { UserRole } from "@/types";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; url: string; external?: boolean }[];
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
      {
        title: NAV_LABELS["studio-leaders"],
        url: "https://wiki.bsstudio.hu/doc/studiovezetok-AdWWlRMuAI",
        external: true,
      },
      { title: NAV_LABELS.archived, url: "/members/archived" },
    ],
  },
  {
    title: NAV_LABELS.apps,
    url: "/apps",
    icon: LayoutGrid,
  },
  {
    title: NAV_LABELS.computers,
    url: "/computers",
    icon: Monitor,
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
  },
  {
    title: NAV_LABELS.adminApps,
    url: "/admin/apps",
    icon: Settings,
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
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.title}
                  className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground"
                >
                  <Link href={item.url}>
                    <Icon className="size-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.children && (
                  <SidebarMenuSub>
                    {item.children.map((child) => (
                      <SidebarMenuSubItem key={child.url}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={!child.external && pathname === child.url}
                          className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground"
                        >
                          {child.external ? (
                            <a
                              href={child.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5"
                            >
                              <span>{child.title}</span>
                              <ExternalLink className="size-3 opacity-60" />
                            </a>
                          ) : (
                            <Link href={child.url}>{child.title}</Link>
                          )}
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
  const canSeeAdminNav = canViewAdminArea(role);

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
        {canSeeAdminNav && (
          <NavSection label="Admin" items={adminNav} pathname={pathname} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <a
          href={
            process.env.NEXT_PUBLIC_APP_VERSION?.startsWith("dev")
              ? process.env.NEXT_PUBLIC_COMMIT_HASH
                ? `https://github.com/BSStudio/backstage/commit/${process.env.NEXT_PUBLIC_COMMIT_HASH}`
                : "https://github.com/BSStudio/backstage"
              : `https://github.com/BSStudio/backstage/releases/tag/${process.env.NEXT_PUBLIC_APP_VERSION?.split("-")[0]}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 pb-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground group-data-[collapsible=icon]:hidden"
        >
          {process.env.NEXT_PUBLIC_APP_VERSION}
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
