
// src/config/appConfigTypes.ts
import type { LucideIcon } from "lucide-react";

export interface ServiceConfig {
  id: string; // ej: "facturacion"
  label: string; // ej: "Facturación"
  iconName: string; // ej: "Receipt" (nombre del icono en lucide-react)
  prefix: string; // ej: "F"
  modules: string[]; // ej: ["Ventanilla 1", "Ventanilla 2"]
}

// Esta interfaz se usará en el frontend después de mapear iconName a un componente Icon
export interface ServiceDefinitionFront extends Omit<ServiceConfig, 'iconName'> {
  icon: LucideIcon;
  value: string; // 'id' se usará como 'value' para los Selects
}

export interface ConsultorioConfig {
  id: "main_consultorios_config"; // ID fijo para el documento único
  names: string[];
}
