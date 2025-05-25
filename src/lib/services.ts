
import type { LucideIcon } from "lucide-react";
import { Receipt, Stethoscope, HeartPulse, ShieldPlus } from "lucide-react";

export interface ServiceDefinition {
  value: string;
  label: string;
  icon: LucideIcon;
  prefix: string;
  modules: string[]; // Módulos específicos para este servicio
}

export const AVAILABLE_SERVICES: ServiceDefinition[] = [
  { 
    value: "facturacion", 
    label: "Facturación", 
    icon: Receipt, 
    prefix: "F", 
    modules: ["Ventanilla 1", "Ventanilla 2", "Ventanilla 3"] 
  },
  { 
    value: "citas_medicas", 
    label: "Citas Médicas", 
    icon: Stethoscope, 
    prefix: "C",
    modules: ["Ventanilla 1", "Ventanilla 2"]
  },
  { 
    value: "famisanar", 
    label: "Famisanar", 
    icon: HeartPulse, 
    prefix: "FS",
    modules: ["Famisanar Ventanilla 1"]
  },
  { 
    value: "nueva_eps", 
    label: "Nueva EPS", 
    icon: ShieldPlus, 
    prefix: "N",
    modules: ["Nueva EPS Ventanilla 1"]
  },
];
