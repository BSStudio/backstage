import {
  BookOpen,
  Calendar,
  Camera,
  Clapperboard,
  ClipboardList,
  Cloud,
  Database,
  FileText,
  Film,
  Folder,
  Globe,
  HardDrive,
  Headphones,
  Image,
  Key,
  LayoutDashboard,
  Link,
  type LucideIcon,
  Mail,
  MessageSquare,
  Mic,
  Monitor,
  Music,
  Newspaper,
  Projector,
  Server,
  Settings,
  ShieldCheck,
  Ticket,
  Tv,
  Users,
  Video,
  Wrench,
} from "lucide-react";
import type { AppLinkAccent } from "@/app/generated/prisma/client";
import type { AppLinkIconName } from "@/types";

/** The lucide component behind every name the picker offers. */
export const APP_LINK_ICONS: Record<AppLinkIconName, LucideIcon> = {
  globe: Globe,
  "book-open": BookOpen,
  "clipboard-list": ClipboardList,
  "file-text": FileText,
  newspaper: Newspaper,
  calendar: Calendar,
  mail: Mail,
  "message-square": MessageSquare,
  users: Users,
  ticket: Ticket,
  key: Key,
  "shield-check": ShieldCheck,
  settings: Settings,
  wrench: Wrench,
  link: Link,
  cloud: Cloud,
  folder: Folder,
  "hard-drive": HardDrive,
  server: Server,
  database: Database,
  monitor: Monitor,
  tv: Tv,
  projector: Projector,
  video: Video,
  camera: Camera,
  film: Film,
  clapperboard: Clapperboard,
  image: Image,
  mic: Mic,
  music: Music,
  headphones: Headphones,
  "layout-dashboard": LayoutDashboard,
};

/**
 * The component for a stored icon name. Falls back rather than throwing: the schema keeps
 * writes inside the list, but a name dropped from it later would otherwise crash the card.
 */
export function appLinkIcon(name: string): LucideIcon {
  return APP_LINK_ICONS[name as AppLinkIconName] ?? APP_LINK_ICONS.link;
}

/** Hungarian names for the picker - the lucide identifier means nothing to an admin. */
export const APP_LINK_ICON_LABELS: Record<AppLinkIconName, string> = {
  globe: "Földgömb",
  "book-open": "Könyv",
  "clipboard-list": "Űrlap",
  "file-text": "Dokumentum",
  newspaper: "Újság",
  calendar: "Naptár",
  mail: "Boríték",
  "message-square": "Üzenet",
  users: "Emberek",
  ticket: "Jegy",
  key: "Kulcs",
  "shield-check": "Pajzs",
  settings: "Fogaskerék",
  wrench: "Csavarkulcs",
  link: "Lánc",
  cloud: "Felhő",
  folder: "Mappa",
  "hard-drive": "Merevlemez",
  server: "Szerver",
  database: "Adatbázis",
  monitor: "Monitor",
  tv: "Televízió",
  projector: "Projektor",
  video: "Videókamera",
  camera: "Fényképezőgép",
  film: "Filmszalag",
  clapperboard: "Csapó",
  image: "Kép",
  mic: "Mikrofon",
  music: "Hangjegy",
  headphones: "Fejhallgató",
  "layout-dashboard": "Irányítópult",
};

/**
 * Tailwind classes for the tile behind the icon. Written out per accent rather than
 * interpolated - Tailwind only ships classes it can see in the source.
 */
export const APP_LINK_TILE_CLASS: Record<AppLinkAccent, string> = {
  BLUE: "bg-app-blue/12 text-app-blue",
  TEAL: "bg-app-teal/12 text-app-teal",
  GREEN: "bg-app-green/12 text-app-green",
  AMBER: "bg-app-amber/12 text-app-amber",
  ORANGE: "bg-app-orange/12 text-app-orange",
  RED: "bg-app-red/12 text-app-red",
  VIOLET: "bg-app-violet/12 text-app-violet",
  PINK: "bg-app-pink/12 text-app-pink",
};

export const APP_LINK_ACCENT_LABELS: Record<AppLinkAccent, string> = {
  BLUE: "Kék",
  TEAL: "Türkiz",
  GREEN: "Zöld",
  AMBER: "Borostyán",
  ORANGE: "Narancs",
  RED: "Piros",
  VIOLET: "Lila",
  PINK: "Rózsaszín",
};

/**
 * The host shown on the card, so two similarly named apps are still tellable apart.
 * A stored URL has been through the schema, but the card is not the place to throw.
 */
export function appLinkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
