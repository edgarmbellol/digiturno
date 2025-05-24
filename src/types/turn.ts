
import type { Timestamp } from "firebase/firestore";

export interface Turn {
  id: string; // Firestore document ID
  turnNumber: string; // Displayable turn number (e.g., F-101, C-055)
  service: string;
  patientId: string;
  priority: boolean;
  requestedAt: Timestamp; // Firestore Timestamp for server-side consistency
  status: 'pending' | 'called' | 'completed';
  module?: string; // Which module/professional called the turn
  calledAt?: Timestamp; // When the turn was called
}
