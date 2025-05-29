
// src/lib/iconMapping.ts
import type { LucideIcon } from "lucide-react";
import { Receipt, Stethoscope, HeartPulse, ShieldPlus, Settings, Users, UserPlus, AlertTriangle, LogIn, UserCircle2, Hourglass, LogOut, AlarmClock, Hospital, Trash2, PlusCircle, BarChart3, ListChecks, PlayCircle, CheckCheck, Ban, Briefcase, Workflow, Search, ChevronRight, Megaphone, Volume2, CalendarClock, Accessibility, UserX } from "lucide-react";

export const serviceIconMap: { [key: string]: LucideIcon } = {
  Receipt: Receipt,
  Stethoscope: Stethoscope,
  HeartPulse: HeartPulse,
  ShieldPlus: ShieldPlus,
  Settings: Settings,
  UserPlus: UserPlus,
  AlarmClock: AlarmClock,
  Hospital: Hospital,
  Users: Users,
  BarChart3: BarChart3,
  ListChecks: ListChecks,
  PlayCircle: PlayCircle,
  CheckCheck: CheckCheck,
  Ban: Ban,
  Briefcase: Briefcase,
  Workflow: Workflow,
  LogIn: LogIn,
  UserCircle2: UserCircle2,
  Hourglass: Hourglass,
  LogOut: LogOut,
  Trash2: Trash2,
  PlusCircle: PlusCircle,
  Search: Search,
  ChevronRight: ChevronRight,
  AlertTriangle: AlertTriangle,
  Megaphone: Megaphone,
  Volume2: Volume2,
  CalendarClock: CalendarClock,
  Accessibility: Accessibility,
  UserX: UserX,
  // Agrega cualquier otro icono que necesites aquí
};

export const DefaultServiceIcon: LucideIcon = Settings; // Un ícono por defecto si no se encuentra el mapeo
