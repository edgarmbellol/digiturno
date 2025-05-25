
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Hourglass, Users, CalendarClock } from "lucide-react";
import type { Turn } from '@/types/turn';
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, limit, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_RECENTLY_CALLED_TURNS = 4; // Show up to 4 recently called turns
const MAX_UPCOMING_TURNS = 5; // Show up to 5 upcoming turns

export default function CallPatientPage() {
  const [recentlyCalledTurns, setRecentlyCalledTurns] = useState<Turn[]>([]);
  const [upcomingTurns, setUpcomingTurns] = useState<Turn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const prevTopCalledTurnIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);


  // Function to initialize AudioContext and load sound
  const initializeAudio = async () => {
    if (typeof window !== "undefined") {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      // Ensure context is running (important for autoplay policies)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      // Load a subtle notification sound
      if (!audioBufferRef.current && audioContextRef.current) {
        try {
          // A simple, short, and royalty-free notification sound (replace with your desired sound URL or generate one)
          // Using a placeholder beep for now. You can find short .wav or .mp3 files for notifications.
          // For this example, we'll generate a simple tone if fetching fails or as a fallback.
          // This is a data URI for a very short beep sound.
          const beepSound = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"+Array(1e3).join("123");
          const response = await fetch(beepSound); // You can replace this with a URL to an actual sound file
          const arrayBuffer = await response.arrayBuffer();
          audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
        } catch (error) {
          console.error("Error loading notification sound:", error);
          // Fallback: generate a simple tone if loading fails
          if (audioContextRef.current && !audioBufferRef.current) {
            // Create a buffer for a simple sine wave beep
            const sampleRate = audioContextRef.current.sampleRate;
            const duration = 0.2; // seconds
            const bufferSize = sampleRate * duration;
            const buffer = audioContextRef.current.createBuffer(1, bufferSize, sampleRate);
            const data = buffer.getChannelData(0);
            const frequency = 880; // A5 note
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.1; // 0.1 gain
            }
            audioBufferRef.current = buffer;
          }
        }
      }
    }
  };

  const playNotificationSound = () => {
    if (audioContextRef.current && audioBufferRef.current && audioContextRef.current.state === 'running') {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start();
    } else {
      console.warn("Audio context not running or sound buffer not loaded. Sound not played.");
      // Attempt to resume if suspended (e.g., due to browser autoplay policy)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(playNotificationSound).catch(e => console.error("Error resuming audio context:", e));
      }
    }
  };
  
  // Effect to initialize audio once
  useEffect(() => {
    // Add a global click listener to resume AudioContext if needed
    const handleFirstInteraction = async () => {
      await initializeAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        // audioContextRef.current.close(); // Consider if you want to close context on unmount
      }
    };
  }, []);


  useEffect(() => {
    // Listener for recently called turns
    const qCalled = query(
      collection(db, "turns"),
      where("status", "==", "called"),
      orderBy("calledAt", "desc"),
      limit(MAX_RECENTLY_CALLED_TURNS)
    );
    const unsubscribeCalled = onSnapshot(qCalled, (querySnapshot) => {
      const calledTurnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        calledTurnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });
      setRecentlyCalledTurns(calledTurnsData);

      if (calledTurnsData.length > 0) {
        const latestCalledTurnId = calledTurnsData[0].id;
        // Play sound only if the top-most called turn is new
        if (latestCalledTurnId && latestCalledTurnId !== prevTopCalledTurnIdRef.current) {
          playNotificationSound();
        }
        prevTopCalledTurnIdRef.current = latestCalledTurnId;
      } else {
        prevTopCalledTurnIdRef.current = null;
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching called turns:", error);
      toast({ title: "Error", description: "No se pudieron cargar los turnos llamados.", variant: "destructive" });
      setIsLoading(false);
    });

    // Listener for upcoming turns
    const qPending = query(
      collection(db, "turns"),
      where("status", "==", "pending"),
      orderBy("priority", "desc"),
      orderBy("requestedAt", "asc"),
      limit(MAX_UPCOMING_TURNS)
    );
    const unsubscribePending = onSnapshot(qPending, (querySnapshot) => {
      const turnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        turnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });
      setUpcomingTurns(turnsData);
    }, (error) => {
      console.error("Error fetching upcoming turns:", error);
    });
    
    return () => {
      unsubscribeCalled();
      unsubscribePending();
    };
  }, [toast]);
  
  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    return formatDistanceToNowStrict(jsDate, { addSuffix: true, locale: es });
  };


  if (isLoading && recentlyCalledTurns.length === 0) { // Show loading only if no turns are initially displayed
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando pantalla de turnos...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen bg-gradient-to-br from-primary/5 via-background to-background items-center p-2 sm:p-4 md:p-6">
      <div className="w-full max-w-7xl">
        <Card className="w-full shadow-2xl mb-6 bg-card/80 backdrop-blur-sm">
          <CardHeader className="bg-primary/10 text-primary-foreground p-4 rounded-t-lg">
            <CardTitle className="text-3xl sm:text-4xl font-bold text-center text-primary">
              Turnos Llamados Recientemente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {recentlyCalledTurns.length === 0 && !isLoading && (
              <div className="text-center py-10">
                <Megaphone className="mx-auto h-20 w-20 text-muted-foreground mb-4 opacity-50" />
                <p className="text-2xl text-muted-foreground">Esperando llamadas...</p>
                <p className="text-sm text-muted-foreground">Aún no se ha llamado a ningún paciente.</p>
              </div>
            )}
            <div className={`grid grid-cols-1 ${recentlyCalledTurns.length > 1 ? 'md:grid-cols-2' : ''} ${recentlyCalledTurns.length > 3 ? 'lg:grid-cols-2 xl:grid-cols-2' : ''} gap-4`}>
              {recentlyCalledTurns.map((turn, index) => (
                <Card 
                  key={turn.id} 
                  className={`shadow-xl transform transition-all duration-500 ease-out
                              ${index === 0 ? 'border-2 border-accent bg-accent/10 scale-100' : 'bg-card opacity-90 hover:opacity-100 scale-95 hover:scale-[0.97]'}
                              animate-fadeIn`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardHeader className={`p-4 rounded-t-md ${index === 0 ? 'bg-accent/20' : 'bg-primary/10'}`}>
                    <div className="flex items-center justify-between">
                      <CardTitle className={`text-4xl sm:text-5xl font-bold ${index === 0 ? 'text-accent-foreground' : 'text-primary'}`}>{turn.turnNumber}</CardTitle>
                      <Megaphone className={`h-10 w-10 sm:h-12 sm:w-12 ${index === 0 ? 'text-accent-foreground animate-pulse' : 'text-primary/80'}`} />
                    </div>
                     {turn.patientId && turn.turnNumber !== '---' && <p className={`text-xs sm:text-sm ${index === 0 ? 'text-accent-foreground/80' : 'text-muted-foreground'} mt-1`}>Paciente: ...{turn.patientId.slice(-6, -3)}XXX</p>}
                  </CardHeader>
                  <CardContent className="p-4 text-center">
                    <p className={`text-xl sm:text-2xl font-semibold mb-2 ${index === 0 ? 'text-accent-foreground' : 'text-foreground'}`}>
                      {turn.module || "Módulo no especificado"}
                    </p>
                    <p className={`text-md sm:text-lg ${index === 0 ? 'text-accent-foreground/90' : 'text-muted-foreground'}`}>{turn.service}</p>
                    {turn.calledAt && (
                       <p className={`text-xs mt-2 ${index === 0 ? 'text-accent-foreground/70' : 'text-muted-foreground/70'}`}>
                        Llamado {getTimeAgo(turn.calledAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="w-full shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="bg-secondary/20 p-4 rounded-t-lg">
            <CardTitle className="text-2xl sm:text-3xl font-semibold text-secondary-foreground flex items-center">
              <Users className="mr-3 h-7 w-7" /> Próximos Turnos en Fila
            </CardTitle>
            <CardDescription className="text-muted-foreground">Estos son los siguientes pacientes en espera.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {upcomingTurns.length > 0 ? (
              <ul className="space-y-3">
                {upcomingTurns.map((turn) => (
                  <li key={turn.id} className="p-3 bg-secondary/30 rounded-lg shadow-sm flex justify-between items-center hover:bg-secondary/50 transition-colors">
                    <div>
                      <span className={`text-lg sm:text-xl font-medium ${turn.priority ? 'text-destructive' : 'text-secondary-foreground'}`}>{turn.turnNumber}</span>
                       {turn.priority && <span className="ml-2 text-xs bg-destructive/80 text-destructive-foreground px-2 py-0.5 rounded-full">Prioritario</span>}
                    </div>
                    <span className="text-sm sm:text-base text-muted-foreground">{turn.service}</span>
                    <span className="text-xs text-muted-foreground/80 hidden sm:inline"><CalendarClock className="inline h-3 w-3 mr-1"/> {getTimeAgo(turn.requestedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-muted-foreground py-6">No hay más turnos en espera por el momento.</p>
            )}
          </CardContent>
        </Card>
      </div>
       <footer className="mt-8 text-center text-xs text-muted-foreground/80 w-full">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Todos los derechos reservados.</p>
        <p>Una solución innovadora para la gestión de filas.</p>
      </footer>
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </main>
  );
}
