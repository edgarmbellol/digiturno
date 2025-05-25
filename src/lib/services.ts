
import type { LucideIcon } from "lucide-react";
import { Receipt, Stethoscope, HeartPulse, ShieldPlus } from "lucide-react";

export interface ServiceDefinition {
  value: string;
  label: string;
  icon: LucideIcon;
  prefix: string;
}

export const AVAILABLE_SERVICES: ServiceDefinition[] = [
  { value: "facturacion", label: "Facturación", icon: Receipt, prefix: "F" },
  { value: "citas_medicas", label: "Citas Médicas", icon: Stethoscope, prefix: "C" },
  { value: "famisanar", label: "Famisanar", icon: HeartPulse, prefix: "FS" },
  { value: "nueva_eps", label: "Nueva EPS", icon: ShieldPlus, prefix: "N" },
];
