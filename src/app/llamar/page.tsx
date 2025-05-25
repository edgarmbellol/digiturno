
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Hourglass, Users, CalendarClock, Stethoscope, UserCircle, Volume2, AlertTriangle } from "lucide-react";
import type { Turn } from '@/types/turn';
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, limit, Timestamp, or } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { speakText } from '@/lib/tts';

const MAX_RECENTLY_CALLED_TURNS = 4; 
const MAX_UPCOMING_TURNS = 5; 

export default function CallPatientPage() {
  const [recentlyCalledTurns, setRecentlyCalledTurns] = useState<Turn[]>([]);
  const [upcomingTurns, setUpcomingTurns] = useState<Turn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const prevTopCalledTurnIdRef = useRef<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const beepBufferRef = useRef<AudioBuffer | null>(null);
  const userInteractedRef = useRef(false);
  const [showInteractionPrompt, setShowInteractionPrompt] = useState(false);


  useEffect(() => {
    console.log("CallPatientPage: useEffect para inicialización de audio ejecutándose.");
    if (typeof window !== "undefined") {
      try {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = context;

        const sampleRate = context.sampleRate;
        const duration = 0.15;
        const bufferSize = sampleRate * duration;
        const buffer = context.createBuffer(1, bufferSize, sampleRate);
        const data = buffer.getChannelData(0);
        const frequency = 880;
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.05; // Volumen bajo para el beep
        }
        beepBufferRef.current = buffer;
        console.log("AudioContext y Beep Buffer creados. Estado inicial del AudioContext:", context.state);

        if (context.state === 'suspended') {
          console.log("AudioContext está suspendido. Esperando interacción del usuario.");
          if (!userInteractedRef.current) setShowInteractionPrompt(true);
        } else {
          userInteractedRef.current = true; 
          setShowInteractionPrompt(false); // Asegurarse que se oculte si ya está activo
          console.log("AudioContext está activo (running).");
        }
      } catch (error) {
        console.error("Error inicializando AudioContext o Beep Buffer:", error);
        toast({ title: "Error de Audio", description: "No se pudo inicializar el sistema de sonido para notificaciones.", variant: "destructive" });
      }
    }

    const handleFirstInteraction = async () => {
      console.log("handleFirstInteraction llamado.");
      if (audioContextRef.current && audioContextRef.current.state === 'suspended' && !userInteractedRef.current) {
        try {
          await audioContextRef.current.resume();
          userInteractedRef.current = true;
          setShowInteractionPrompt(false);
          console.log("AudioContext reanudado por interacción del usuario. Nuevo estado:", audioContextRef.current.state);
          toast({ title: "Audio Activado", description: "Los anuncios de voz y sonidos están activos.", duration: 3000 });
        } catch (e) {
          console.error("Error reanudando AudioContext en la interacción:", e);
        }
      }
      // Remover listeners después del intento de reanudar o si ya no es necesario
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    
    const interactionTimeoutId = setTimeout(() => {
        if (audioContextRef.current?.state === 'suspended' && !userInteractedRef.current) {
            console.log("Añadiendo listeners para interacción del usuario.");
            window.addEventListener('click', handleFirstInteraction);
            window.addEventListener('touchstart', handleFirstInteraction);
            window.addEventListener('keydown', handleFirstInteraction);
        } else if (audioContextRef.current?.state === 'running') {
             console.log("AudioContext ya está 'running', no se necesitan listeners de interacción.");
             userInteractedRef.current = true;
             setShowInteractionPrompt(false);
        }
    }, 100);


    return () => {
      console.log("CallPatientPage: Limpiando useEffect de inicialización de audio.");
      clearTimeout(interactionTimeoutId);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      audioContextRef.current?.close().catch(e => console.error("Error cerrando AudioContext", e));
    };
  }, [toast]);


  const playNotificationSound = () => {
    console.log("Intentando reproducir sonido de notificación...");
    if (!audioContextRef.current) {
      console.warn("playNotificationSound: AudioContext no está inicializado.");
      return;
    }
    if (audioContextRef.current.state !== 'running') {
      console.warn(`playNotificationSound: AudioContext no está 'running'. Estado actual: ${audioContextRef.current.state}. Se requiere interacción del usuario.`);
      if (!userInteractedRef.current) setShowInteractionPrompt(true);
      return;
    }
    if (!beepBufferRef.current) {
      console.warn("playNotificationSound: Beep Buffer no está cargado.");
      return;
    }

    try {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = beepBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start();
      console.log("Sonido de notificación reproducido.");
    } catch (error) {
      console.error("Error reproduciendo sonido de notificación:", error);
    }
  };
  
  useEffect(() => {
    console.log("CallPatientPage: useEffect para suscripción a Firestore ejecutándose.");
    const qCalled = query(
      collection(db, "turns"),
      or(
        where("status", "==", "called"),
        where("status", "==", "called_by_doctor")
      ),
      orderBy("calledAt", "desc"),
      limit(MAX_RECENTLY_CALLED_TURNS)
    );

    const unsubscribeCalled = onSnapshot(qCalled, (querySnapshot) => {
      const calledTurnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        calledTurnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });
      console.log('Firestore: Nuevos datos de turnos llamados recibidos. Cantidad:', calledTurnsData.length);
      
      if (calledTurnsData.length > 0) {
        const latestCalledTurn = calledTurnsData[0];
        const latestCalledTurnId = latestCalledTurn.id;

        console.log(`Firestore: Turno más reciente ID = ${latestCalledTurnId}, ID previo guardado = ${prevTopCalledTurnIdRef.current}`);

        if (latestCalledTurnId && latestCalledTurnId !== prevTopCalledTurnIdRef.current && prevTopCalledTurnIdRef.current !== null) {
          console.log("Nuevo turno detectado para anuncio:", latestCalledTurn);
          playNotificationSound();

          const patientDisplayName = getPatientDisplayName(latestCalledTurn.patientName, latestCalledTurn.patientId);
          const moduleName = latestCalledTurn.module || (latestCalledTurn.status === 'called_by_doctor' ? "Consultorio" : "Módulo");
          let announcement = `Turno ${latestCalledTurn.turnNumber}, ${patientDisplayName}, diríjase a ${moduleName}.`;
          
          // Log antes de setTimeout
          console.log("Preparando anuncio de voz:", `"${announcement}"`, "AudioContext state:", audioContextRef.current?.state, "User interacted:", userInteractedRef.current);

          setTimeout(() => {
            // Log dentro de setTimeout, justo antes de llamar a speakText
            console.log("Dentro de setTimeout - Intentando anuncio de voz:", `"${announcement}"`, "AudioContext state:", audioContextRef.current?.state, "User interacted:", userInteractedRef.current);
            if (!userInteractedRef.current && audioContextRef.current?.state !== 'running'){
                 console.warn("Anuncio de voz omitido: El contexto de audio principal no está activo. Se requiere interacción del usuario.");
                 if(!showInteractionPrompt) setShowInteractionPrompt(true);
                 return;
            }
            speakText(announcement, 'es-CO') 
              .then(() => console.log("Anuncio de voz completado."))
              .catch(err => {
                console.error("Error al pronunciar el anuncio:", err);
                toast({ title: "Error de Anuncio de Voz", description: `No se pudo reproducir: ${err.message}`, variant: "destructive" });
              });
          }, 300); 
        } else if (latestCalledTurnId && prevTopCalledTurnIdRef.current === null) {
            console.log("Carga inicial de turnos llamados, no se reproducirá sonido/voz para el primero en la lista.");
        }
        prevTopCalledTurnIdRef.current = latestCalledTurnId;
      } else {
        console.log("Firestore: No hay turnos llamados actualmente.");
        prevTopCalledTurnIdRef.current = null;
      }
      setRecentlyCalledTurns(calledTurnsData);
      if (isLoading) setIsLoading(false); 
    }, (error) => {
      console.error("Error fetching called/called_by_doctor turns:", error);
       if (error.message && error.message.includes("indexes?create_composite")) {
         toast({ 
            title: "Error de Configuración de Firestore", 
            description: "Se requiere un índice para la consulta de turnos llamados. Revise la consola del navegador para el enlace de creación.", 
            variant: "destructive",
            duration: 10000 
        });
      } else {
        toast({ title: "Error", description: "No se pudieron cargar los turnos llamados.", variant: "destructive" });
      }
      setIsLoading(false);
    });

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
      console.log("CallPatientPage: Limpiando suscripciones de Firestore.");
      unsubscribeCalled();
      unsubscribePending();
    };
  }, [toast]); // Dependencias: solo toast. isLoading y showInteractionPrompt son manejados internamente.
  
  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    return formatDistanceToNowStrict(jsDate, { addSuffix: true, locale: es });
  };

  const getPatientDisplayName = (patientName?: string, patientId?: string) => {
    if (patientName && patientName.trim() !== "") {
      return patientName;
    }
    if (patientId) {
      const idParts = patientId.split(" ");
      const lastPart = idParts[idParts.length - 1];
      if (lastPart && lastPart.length > 3) {
        return `${idParts.slice(0, -1).join(" ")} ...${lastPart.slice(-3)}`;
      }
      return patientId;
    }
    return "Paciente";
  }


  if (isLoading && recentlyCalledTurns.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando pantalla de turnos...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen bg-gradient-to-br from-primary/5 via-background to-background items-center p-2 sm:p-4 md:p-6">
      {showInteractionPrompt && !userInteractedRef.current && (
        <Card className="w-full max-w-xl mb-4 shadow-lg border-2 border-yellow-500 bg-yellow-500/10">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
              <div>
                <p className="font-semibold text-yellow-700">El audio está desactivado.</p>
                <p className="text-sm text-yellow-600">Por favor, haz clic en cualquier parte de la página para activar los sonidos y anuncios de voz.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="w-full max-w-7xl">
        <Card className="w-full shadow-2xl mb-6 bg-card/80 backdrop-blur-sm">
          <CardHeader className="bg-primary/10 text-primary-foreground p-4 rounded-t-lg">
             <div className="flex items-center justify-center gap-2">
                <Volume2 className="h-8 w-8 text-primary" />
                <CardTitle className="text-3xl sm:text-4xl font-bold text-center text-primary">
                Turnos Llamados Recientemente
                </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {recentlyCalledTurns.length === 0 && !isLoading && (
              <div className="text-center py-10">
                <Megaphone className="mx-auto h-20 w-20 text-muted-foreground mb-4 opacity-50" />
                <p className="text-2xl text-muted-foreground">Esperando llamadas...</p>
                <p className="text-sm text-muted-foreground">Aún no se ha llamado a ningún paciente.</p>
              </div>
            )}
            <div className={`grid grid-cols-1 ${recentlyCalledTurns.length > 1 ? 'md:grid-cols-2' : ''} ${recentlyCalledTurns.length > 0 ? 'xl:grid-cols-2' : ''} gap-4`}>
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
                      {turn.status === 'called_by_doctor' ? (
                        <Stethoscope className={`h-10 w-10 sm:h-12 sm:w-12 ${index === 0 ? 'text-accent-foreground animate-pulse' : 'text-primary/80'}`} />
                      ) : (
                        <Megaphone className={`h-10 w-10 sm:h-12 sm:w-12 ${index === 0 ? 'text-accent-foreground animate-pulse' : 'text-primary/80'}`} />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 text-center">
                     <p className={`text-xl sm:text-2xl font-semibold mb-1 truncate ${index === 0 ? 'text-accent-foreground' : 'text-foreground'}`}>
                        {getPatientDisplayName(turn.patientName, turn.patientId)}
                    </p>
                     <p className={`text-lg sm:text-xl ${index === 0 ? 'text-accent-foreground/90' : 'text-muted-foreground'}`}>
                      {turn.module || (turn.status === 'called_by_doctor' ? "Consultorio Médico" : "Ventanilla")}
                    </p>
                    <p className={`text-md sm:text-base ${index === 0 ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>
                      Servicio: {turn.service}
                    </p>
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
              <Users className="mr-3 h-7 w-7" /> Próximos Turnos (Ventanilla/Recepción)
            </CardTitle>
            <CardDescription className="text-muted-foreground">Estos son los siguientes pacientes en espera para servicios generales.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {upcomingTurns.length > 0 ? (
              <ul className="space-y-3">
                {upcomingTurns.map((turn) => (
                  <li key={turn.id} className="p-3 bg-secondary/30 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center mb-1 sm:mb-0">
                      <span className={`text-lg sm:text-xl font-medium ${turn.priority ? 'text-destructive' : 'text-secondary-foreground'}`}>{turn.turnNumber}</span>
                       {turn.priority && <span className="ml-2 text-xs bg-destructive/80 text-destructive-foreground px-2 py-0.5 rounded-full">Prioritario</span>}
                    </div>
                    <div className="text-sm text-muted-foreground mb-1 sm:mb-0 sm:mx-2 flex-grow text-left sm:text-center truncate">
                        {getPatientDisplayName(turn.patientName, turn.patientId)} ({turn.service})
                    </div>
                    <span className="text-xs text-muted-foreground/80 self-start sm:self-center whitespace-nowrap"><CalendarClock className="inline h-3 w-3 mr-1"/> {getTimeAgo(turn.requestedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-muted-foreground py-6">No hay más turnos en espera para servicios generales por el momento.</p>
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
        .truncate {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </main>
  );
}
