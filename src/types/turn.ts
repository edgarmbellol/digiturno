
import type { Timestamp } from "firebase/firestore";

export type TurnStatus =
  | 'pending'
  | 'called'
  | 'completed'
  | 'missed'
  | 'waiting_doctor'
  | 'called_by_doctor'
  | 'completed_by_doctor'
  | 'missed_by_doctor';

export interface Turn {
  id: string; // Firestore document ID
  turnNumber: string; // Displayable turn number (e.g., F-101, C-055)
  service: string; // Label del servicio, ej. "Facturación"
  patientId: string; // Cedula del paciente, ej CC 12345
  patientName?: string; // Nombre completo del paciente
  priority: boolean;
  requestedAt: Timestamp; // Firestore Timestamp for server-side consistency
  status: TurnStatus;
  module?: string; // Qué ventanilla/consultorio/profesional llamó el turno
  calledAt?: Timestamp; // Cuándo el turno fue llamado (por ventanilla o médico)
  completedAt?: Timestamp; // Cuándo el turno fue completado por ventanilla
  missedAt?: Timestamp; // Cuándo el turno fue marcado como no presentado por ventanilla
  professionalId?: string; // UID del profesional/médico que llamó/manejó el turno
  professionalDisplayName?: string; // Nombre del profesional/médico
  doctorCompletedAt?: Timestamp; // Cuándo el médico completó la consulta
  doctorMissedAt?: Timestamp; // Cuándo el médico marcó como no presentado
}
