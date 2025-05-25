
import type { Timestamp } from "firebase/firestore";

export interface Turn {
  id: string; // Firestore document ID
  turnNumber: string; // Displayable turn number (e.g., F-101, C-055)
  service: string;
  patientId: string;
  priority: boolean;
  requestedAt: Timestamp; // Firestore Timestamp for server-side consistency
  status: 'pending' | 'called' | 'completed' | 'missed'; // Added 'missed' status
  module?: string; // Which module/professional called the turn
  calledAt?: Timestamp; // When the turn was called
  professionalId?: string; // UID of the professional who called/handled the turn
  professionalDisplayName?: string; // Optional display name of the professional
}

