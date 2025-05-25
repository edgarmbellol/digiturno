
import type { Timestamp } from "firebase/firestore";

export interface Turn {
  id: string; // Firestore document ID
  turnNumber: string; // Displayable turn number (e.g., F-101, C-055)
  service: string; // Label del servicio, ej. "Facturación"
  patientId: string;
  priority: boolean;
  requestedAt: Timestamp; // Firestore Timestamp for server-side consistency
  status: 
    | 'pending' 
    | 'called' 
    | 'completed' // Para servicios como facturación, este es el estado final de esa etapa
    | 'missed' 
    | 'waiting_doctor' // Paciente completó facturación, esperando ser llamado por médico
    | 'called_by_doctor' // Médico ha llamado al paciente
    | 'completed_by_doctor' // Médico completó la consulta
    | 'missed_by_doctor'; // Paciente no se presentó al médico
  module?: string; // Qué ventanilla/consultorio/profesional llamó el turno
  calledAt?: Timestamp; // Cuándo el turno fue llamado (por ventanilla o médico)
  completedAt?: Timestamp; // Cuándo el turno fue completado por ventanilla
  missedAt?: Timestamp; // Cuándo el turno fue marcado como no presentado por ventanilla
  professionalId?: string; // UID del profesional/médico que llamó/manejó el turno
  professionalDisplayName?: string; // Nombre del profesional/médico
  doctorCompletedAt?: Timestamp; // Cuándo el médico completó la consulta
  doctorMissedAt?: Timestamp; // Cuándo el médico marcó como no presentado
}
