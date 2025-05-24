
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import type { Turn } from '@/components/turn-form'; // Import Turn type

const CURRENT_TURN_KEY = 'turnoFacil_currentTurn';
const PENDING_TURNS_KEY = 'turnoFacil_pendingTurns';

// Define a type for the turn being displayed
interface DisplayTurn extends Turn {
  module: string; // Add module to the display turn
}

// Default empty turn for display when nothing is called
const defaultCurrentTurn: DisplayTurn = {
  id: "---",
  service: "Esperando llamada...",
  patientId: "",
  priority: false,
  requestedAt: new Date(),
  module: "---",
};

export default function CallPatientPage() {
  const [currentTurn, setCurrentTurn] = useState<DisplayTurn>(defaultCurrentTurn);
  const [upcomingTurns, setUpcomingTurns] = useState<Pick<Turn, 'id' | 'service'>[]>([]);

  useEffect(() => {
    const loadDataFromLocalStorage = () => {
      try {
        const storedCurrentTurn = localStorage.getItem(CURRENT_TURN_KEY);
        if (storedCurrentTurn) {
          const parsedTurn: Turn = JSON.parse(storedCurrentTurn);
           // Ensure requestedAt is a Date object
          if (parsedTurn.requestedAt) {
            parsedTurn.requestedAt = new Date(parsedTurn.requestedAt);
          }
          setCurrentTurn({ ...parsedTurn, module: "Módulo Asignado" }); // Assign a module
        } else {
          setCurrentTurn(defaultCurrentTurn);
        }

        const storedPendingTurns = localStorage.getItem(PENDING_TURNS_KEY);
        if (storedPendingTurns) {
          const parsedPending: Turn[] = JSON.parse(storedPendingTurns).map((t: any) => ({
            ...t,
            requestedAt: new Date(t.requestedAt)
          }));
          // Sort pending turns: priority first, then by requestedAt
          const sortedPending = parsedPending.sort((a, b) => {
            if (a.priority && !b.priority) return -1;
            if (!a.priority && b.priority) return 1;
            return a.requestedAt.getTime() - b.requestedAt.getTime();
          });
          setUpcomingTurns(sortedPending.slice(0, 3).map(turn => ({ id: turn.id, service: turn.service })));
        } else {
          setUpcomingTurns([]);
        }
      } catch (error) {
        console.error("Error loading from localStorage:", error);
        setCurrentTurn(defaultCurrentTurn);
        setUpcomingTurns([]);
      }
    };

    loadDataFromLocalStorage(); // Load on initial render

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === CURRENT_TURN_KEY || event.key === PENDING_TURNS_KEY) {
        loadDataFromLocalStorage();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Sound effect for new turn - only if turn changes from '---' or a different ID
    if (currentTurn.id !== "---" && currentTurn.id !== defaultCurrentTurn.id) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContext) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.type = 'sine'; // sine, square, sawtooth, triangle
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Volume

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3); // Play for 0.3 seconds
        }
    }


    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentTurn.id]); // Re-run effect if currentTurn.id changes to play sound for new turn

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-4xl shadow-2xl mb-8 transform transition-all hover:scale-[1.01] duration-300">
        <CardHeader className="bg-primary text-primary-foreground p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-4xl sm:text-5xl font-bold">Turno Actual</CardTitle>
            <Megaphone className="h-12 w-12 sm:h-16 sm:w-16 animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 text-center">
          <p className="text-6xl sm:text-8xl font-bold text-accent-foreground mb-2">{currentTurn.id}</p>
          <p className="text-2xl sm:text-3xl text-muted-foreground mb-1">{currentTurn.service}</p>
          {currentTurn.patientId && <p className="text-lg sm:text-xl text-muted-foreground mb-3">Paciente: {currentTurn.patientId}</p>}
          <p className="text-3xl sm:text-4xl font-semibold text-primary-foreground bg-primary/80 rounded-md py-3 px-6 inline-block shadow-md">
            {currentTurn.module}
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
                <li key={index} className="p-4 bg-secondary/50 rounded-lg shadow-sm flex justify-between items-center">
                  <span className="text-xl sm:text-2xl font-medium text-secondary-foreground">{turn.id}</span>
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

    