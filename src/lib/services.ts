
import type { LucideIcon } from "lucide-react";
import { Receipt, Stethoscope, HeartPulse, ShieldPlus, Settings } from "lucide-react";
import type { ServiceDefinitionFront } from "@/config/appConfigTypes"; // Use the frontend version


// These are now FALLBACK defaults if Firestore is empty or fails to load.
// The primary source of truth will be Firestore.
// The 'value' here corresponds to 'id' in ServiceConfig stored in Firestore.
// The 'icon' is the actual component, 'iconName' (string) will be in Firestore.

export const AVAILABLE_SERVICES: ServiceDefinitionFront[] = [
  { 
    value: "facturacion", 
    id: "facturacion",
    label: "Facturación", 
    icon: Receipt, 
    iconName: "Receipt", // For reference, actual lookup will use icon
    prefix: "F", 
    modules: ["Ventanilla 1", "Ventanilla 2", "Ventanilla 3"] 
  },
  { 
    value: "citas_medicas", 
    id: "citas_medicas",
    label: "Citas Médicas", 
    icon: Stethoscope, 
    iconName: "Stethoscope",
    prefix: "C",
    modules: ["Ventanilla 1", "Ventanilla 2"]
  },
  { 
    value: "famisanar", 
    id: "famisanar",
    label: "Famisanar", 
    icon: HeartPulse, 
    iconName: "HeartPulse",
    prefix: "FS",
    modules: ["Famisanar Ventanilla 1"]
  },
  { 
    value: "nueva_eps", 
    id: "nueva_eps",
    label: "Nueva EPS", 
    icon: ShieldPlus, 
    iconName: "ShieldPlus",
    prefix: "N",
    modules: ["Nueva EPS Ventanilla 1"]
  },
];
