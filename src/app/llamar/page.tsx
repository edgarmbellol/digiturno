
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Hourglass } from "lucide-react";
import type { Turn } from '@/types/turn'; // Import Turn type from new location
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, limit, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

// Default empty turn for display when nothing is called
const defaultCurrentTurn: Turn = {
  id: "---",
  turnNumber: "---",
  service: "Esperando llamada...",
  patientId: "",
  priority: false,
  requestedAt: new Timestamp(0,0), // Placeholder, will be updated
  status: 'pending', // or some initial status
  module: "---",
  calledAt: new Timestamp(0,0)
};

export default function CallPatientPage() {
  const [currentTurn, setCurrentTurn] = useState<Turn>(defaultCurrentTurn);
  const [upcomingTurns, setUpcomingTurns] = useState<Turn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const prevTurnNumberRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Initialize AudioContext on user interaction (or attempt)
    // Browsers often block audio until user interaction
    const initAudioContext = () => {
      if (!audioContextRef.current && typeof window !== "undefined") {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    };
    // Call it once, e.g. after a delay or on a button click if needed. For now, auto-init.
    initAudioContext();


    // Listener for the currently called turn
    const qCalled = query(
      collection(db, "turns"),
      where("status", "==", "called"),
      orderBy("calledAt", "desc"),
      limit(1)
    );
    const unsubscribeCalled = onSnapshot(qCalled, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const calledDoc = querySnapshot.docs[0];
        const newCalledTurn = { id: calledDoc.id, ...calledDoc.data() } as Turn;
        
        // Play sound only if the turn number changes to a new, valid turn
        if (newCalledTurn.turnNumber && newCalledTurn.turnNumber !== "---" && newCalledTurn.turnNumber !== prevTurnNumberRef.current) {
           if (audioContextRef.current) {
            const oscillator = audioContextRef.current.createOscillator();
            const gainNode = audioContextRef.current.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            
            oscillator.type = 'sine'; 
            oscillator.frequency.setValueAtTime(523.25, audioContextRef.current.currentTime); // C5 note
            gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime); 

            oscillator.start();
            oscillator.stop(audioContextRef.current.currentTime + 0.3); 
          }
        }
        prevTurnNumberRef.current = newCalledTurn.turnNumber;
        setCurrentTurn(newCalledTurn);

      } else {
        setCurrentTurn(defaultCurrentTurn);
        prevTurnNumberRef.current = null;
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching called turn:", error);
      toast({ title: "Error", description: "No se pudo cargar el turno actual.", variant: "destructive" });
      setCurrentTurn(defaultCurrentTurn);
      setIsLoading(false);
    });

    // Listener for upcoming turns
    const qPending = query(
      collection(db, "turns"),
      where("status", "==", "pending"),
      orderBy("priority", "desc"),
      orderBy("requestedAt", "asc"),
      limit(3) // Show next 3
    );
    const unsubscribePending = onSnapshot(qPending, (querySnapshot) => {
      const turnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        turnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });
      setUpcomingTurns(turnsData);
    }, (error) => {
      console.error("Error fetching upcoming turns:", error);
      // Optional: toast for upcoming turns error
    });
    
    return () => {
      unsubscribeCalled();
      unsubscribePending();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        // audioContextRef.current.close(); // Uncomment if you want to close context on unmount
      }
    };
  }, [toast]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando pantalla de turnos...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-4xl shadow-2xl mb-8 transform transition-all hover:scale-[1.01] duration-300">
        <CardHeader className="bg-primary text-primary-foreground p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-4xl sm:text-5xl font-bold">Turno Actual</CardTitle>
            <Megaphone className={`h-12 w-12 sm:h-16 sm:w-16 ${currentTurn.turnNumber !== '---' ? 'animate-pulse' : ''}`} />
          </div>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 text-center">
          <p className="text-6xl sm:text-8xl font-bold text-accent-foreground mb-2">{currentTurn.turnNumber}</p>
          <p className="text-2xl sm:text-3xl text-muted-foreground mb-1">{currentTurn.service}</p>
          {currentTurn.patientId && currentTurn.turnNumber !== '---' && <p className="text-lg sm:text-xl text-muted-foreground mb-3">Paciente: {currentTurn.patientId.substring(0, Math.min(currentTurn.patientId.length, currentTurn.patientId.length -3)) + 'XXX'}</p>}
          <p className="text-3xl sm:text-4xl font-semibold text-primary-foreground bg-primary/80 rounded-md py-3 px-6 inline-block shadow-md">
            {currentTurn.module || "---"}
          </p>
        </CardContent>
      </Card>

      <Card className="w-full max-w-4xl shadow-xl transform transition-all hover:scale-[1.01] duration-300">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl font-semibold text-primary-foreground">Próximos Turnos</CardTitle>
          <CardDescription>Estos son los siguientes turnos en la fila.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingTurns.length > 0 ? (
            <ul className="space-y-3">
              {upcomingTurns.map((turn, index) => (
                <li key={turn.id} className="p-4 bg-secondary/50 rounded-lg shadow-sm flex justify-between items-center">
                  <span className="text-xl sm:text-2xl font-medium text-secondary-foreground">{turn.turnNumber}</span>
                  <span className="text-base sm:text-lg text-muted-foreground">{turn.service}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted-foreground py-4">No hay más turnos en espera por el momento.</p>
          )}
        </CardContent>
      </Card>
       <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Todos los derechos reservados.</p>
        <p>Una solución innovadora para la gestión de filas.</p>
      </footer>
    </main>
  );
}
