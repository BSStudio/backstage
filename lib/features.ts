import {
  CalendarDays,
  LayoutGrid,
  type LucideIcon,
  Monitor,
  MonitorUp,
  ScrollText,
  Smartphone,
} from "lucide-react";
import { NAV_LABELS } from "@/lib/nav-labels";
import { canViewAdminArea } from "@/lib/permissions";
import type { UserRole } from "@/types";

/** The query that opens the guide, so any surface can link to it instead of sharing state. */
export const FEATURE_GUIDE_QUERY = "features";

export interface FeatureHighlight {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}

export interface FeatureContext {
  memberId: string;
  role: UserRole;
  /** False drops the `.rdp` download from `/computers`, leaving nothing to point at. */
  rdpConfigured: boolean;
  /** False drops the calendar from the dashboard. */
  calendarConfigured: boolean;
}

// Worth telling a member about because none of it is on the page they land on. An entry
// whose feature this deployment does not have is left out rather than listed and refused,
// the same way the `.rdp` button is dropped.
export function featureHighlights({
  memberId,
  role,
  rdpConfigured,
  calendarConfigured,
}: FeatureContext): FeatureHighlight[] {
  const highlights: FeatureHighlight[] = [
    {
      key: "carddav",
      icon: Smartphone,
      title: "Kontaktok a telefonodon",
      description:
        "A stúdiósok elérhetőségei a saját névjegyeid között, maguktól frissülve.",
      href: `/members/${memberId}`,
      linkLabel: "Profilom",
    },
    {
      key: "computers",
      icon: Monitor,
      title: "Szabad vágógépek",
      description:
        "Melyiknél ül valaki éppen, és melyik szabad, mielőtt lemész.",
      href: "/computers",
      linkLabel: NAV_LABELS.computers,
    },
  ];

  if (rdpConfigured) {
    highlights.push({
      key: "rdp",
      icon: MonitorUp,
      title: "Távoli belépés a vágógépre",
      description:
        "Egy .rdp fájl a nevedre kitöltve — a jelszót a belépésnél kéri, nem a fájlból.",
      href: "/computers",
      linkLabel: NAV_LABELS.computers,
    });
  }

  if (calendarConfigured) {
    highlights.push({
      key: "calendar",
      icon: CalendarDays,
      title: "A stúdió naptára",
      description:
        "Felvételek, események és foglalások, a kezdőlapon a következő hetekre.",
      href: "/",
      linkLabel: NAV_LABELS[""],
    });
  }

  highlights.push({
    key: "apps",
    icon: LayoutGrid,
    title: "A stúdió rendszerei",
    description:
      "Adásweb, wiki, felkéréskezelő, Planka — egy helyen, egy belépéssel.",
    href: "/apps",
    linkLabel: NAV_LABELS.apps,
  });

  if (canViewAdminArea(role)) {
    highlights.push({
      key: "admin",
      icon: ScrollText,
      title: "Admin felületek",
      description:
        "Audit napló, a külső rendszerek szinkronizációja és a levelezőlista egyeztetése.",
      href: "/admin/audit",
      linkLabel: NAV_LABELS.admin,
    });
  }

  return highlights;
}
