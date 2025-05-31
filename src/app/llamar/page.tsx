
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image"; 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Hourglass, Users, CalendarClock, Stethoscope, UserCircle, Volume2, AlertTriangle, Info } from "lucide-react";
import type { Turn } from '@/types/turn';
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, limit, Timestamp, or } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { speakText } from '@/lib/tts';

const MAX_RECENTLY_CALLED_TURNS = 4;
const MAX_UPCOMING_TURNS_DISPLAY = 6; // Mostrar hasta 6 próximos turnos en la TV

export default function CallPatientPage() {
  const [recentlyCalledTurns, setRecentlyCalledTurns] = useState<Turn[]>([]);
  const [upcomingTurns, setUpcomingTurns] = useState<Turn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const prevTopCalledTurnIdRef = useRef<string | null>(null);
  const announcementTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const beepBufferRef = useRef<AudioBuffer | null>(null);
  const userInteractedRef = useRef(false);
  const [showInteractionPrompt, setShowInteractionPrompt] = useState(false);

  useEffect(() => {
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
          data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.05; 
        }
        beepBufferRef.current = buffer;

        if (context.state === 'suspended') {
          if (!userInteractedRef.current) setShowInteractionPrompt(true);
        } else {
          userInteractedRef.current = true;
          setShowInteractionPrompt(false); 
        }
      } catch (error) {
        console.error("Error inicializando AudioContext o Beep Buffer:", error);
        toast({ title: "Error de Audio", description: "No se pudo inicializar el sistema de sonido para notificaciones.", variant: "destructive" });
      }
    }

    const handleFirstInteraction = async () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended' && !userInteractedRef.current) {
        try {
          await audioContextRef.current.resume();
          userInteractedRef.current = true;
          setShowInteractionPrompt(false);
          toast({ title: "Audio Activado", description: "Los anuncios de voz y sonidos están activos.", duration: 3000 });
        } catch (e) {
          console.error("Error reanudando AudioContext en la interacción:", e);
        }
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    
    const interactionTimeoutId = setTimeout(() => {
        if (audioContextRef.current?.state === 'suspended' && !userInteractedRef.current) {
            window.addEventListener('click', handleFirstInteraction);
            window.addEventListener('touchstart', handleFirstInteraction);
            window.addEventListener('keydown', handleFirstInteraction);
        } else if (audioContextRef.current?.state === 'running') {
             userInteractedRef.current = true;
             setShowInteractionPrompt(false);
        }
    }, 100);

    return () => {
      clearTimeout(interactionTimeoutId);
      if (announcementTimeoutIdRef.current) {
        clearTimeout(announcementTimeoutIdRef.current);
      }
      if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel(); 
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      audioContextRef.current?.close().catch(e => console.error("Error cerrando AudioContext", e));
    };
  }, [toast]);

  const playNotificationSound = () => {
    if (!audioContextRef.current || audioContextRef.current.state !== 'running' || !beepBufferRef.current) {
      if (!userInteractedRef.current) setShowInteractionPrompt(true);
      return;
    }
    try {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = beepBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (error) {
      console.error("Error reproduciendo sonido de notificación:", error);
    }
  };
  
  useEffect(() => {
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
      
      if (calledTurnsData.length > 0) {
        const latestCalledTurn = calledTurnsData[0];
        const latestCalledTurnId = latestCalledTurn.id;
        
        if (latestCalledTurnId && latestCalledTurnId !== prevTopCalledTurnIdRef.current) {
          playNotificationSound();
          const patientDisplayName = getPatientDisplayName(latestCalledTurn.patientName, latestCalledTurn.patientId);
          const moduleName = latestCalledTurn.module || (latestCalledTurn.status === 'called_by_doctor' ? "Consultorio" : "Módulo");
          let announcement = `Turno ${latestCalledTurn.turnNumber}, ${patientDisplayName}, diríjase a ${moduleName}.`;
          if (latestCalledTurn.status === 'called_by_doctor' && latestCalledTurn.professionalDisplayName) {
            announcement = `Turno ${latestCalledTurn.turnNumber}, ${patientDisplayName}, diríjase a ${moduleName}. Será atendido por ${latestCalledTurn.professionalDisplayName}.`;
          }
          if (announcementTimeoutIdRef.current) clearTimeout(announcementTimeoutIdRef.current);
          announcementTimeoutIdRef.current = setTimeout(() => {
            if (!userInteractedRef.current && audioContextRef.current?.state !== 'running'){
                 if(!showInteractionPrompt) setShowInteractionPrompt(true);
                 return;
            }
            speakText(announcement, 'es-CO')
              .catch(err => {
                console.error("Error al pronunciar el anuncio:", err);
                toast({ title: "Error de Anuncio de Voz", description: `No se pudo reproducir: ${err.message}`, variant: "destructive" });
              });
          }, 300); 
        }
         prevTopCalledTurnIdRef.current = latestCalledTurnId;
      } else {
        if (prevTopCalledTurnIdRef.current) prevTopCalledTurnIdRef.current = null;
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
      limit(MAX_UPCOMING_TURNS_DISPLAY)
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
      if (announcementTimeoutIdRef.current) clearTimeout(announcementTimeoutIdRef.current);
    };
  }, [toast, isLoading]); // isLoading dependency is important here
  
  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    return formatDistanceToNowStrict(jsDate, { addSuffix: true, locale: es });
  };

  const getPatientDisplayName = (patientName?: string, patientId?: string) => {
    if (patientName && patientName.trim() !== "") return patientName;
    if (patientId) {
      const idParts = patientId.split(" ");
      const lastPart = idParts[idParts.length - 1];
      if (lastPart && lastPart.length > 3) {
        const prefix = idParts.length > 1 ? idParts.slice(0, -1).join(" ") : (patientId.startsWith("CC") ? "CC" : "ID");
        return `${prefix} ...${lastPart.slice(-3)}`;
      }
      return patientId; 
    }
    return "Paciente";
  }

  if (isLoading && recentlyCalledTurns.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
        <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={120} height={115} priority data-ai-hint="hospital logo"/>
        <Hourglass className="h-16 w-16 text-primary animate-spin mt-8" />
        <p className="text-xl text-muted-foreground mt-4">Cargando pantalla de turnos...</p>
      </main>
    );
  }

  const mainCalledTurn = recentlyCalledTurns.length > 0 ? recentlyCalledTurns[0] : null;
  const secondaryCalledTurns = recentlyCalledTurns.slice(1);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-to-br from-primary/5 via-background to-background items-center p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="w-full flex justify-center mb-4 lg:mb-8">
        <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={120} height={115} priority data-ai-hint="hospital logo"/>
      </div>
      {showInteractionPrompt && !userInteractedRef.current && (
        <Card className="w-full max-w-xl mb-4 shadow-lg border-2 border-yellow-500 bg-yellow-500/10">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
              <div>
                <p className="font-semibold text-yellow-700 text-lg">El audio está desactivado.</p>
                <p className="text-md text-yellow-600">Por favor, haz clic en cualquier parte de la página para activar los sonidos y anuncios de voz.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="w-full max-w-screen-xl">
        <Card className="w-full shadow-2xl mb-6 lg:mb-8 bg-card/80 backdrop-blur-sm">
          <CardHeader className="bg-primary/10 text-primary-foreground p-4 lg:p-6 rounded-t-lg">
             <div className="flex items-center justify-center gap-2 lg:gap-3">
                <Volume2 className="h-8 w-8 lg:h-10 lg:w-10 text-primary" />
                <CardTitle className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center text-primary">
                Turnos Llamados
                </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 lg:p-6">
            {!mainCalledTurn && !isLoading && (
              <div className="text-center py-10 lg:py-20">
                <Megaphone className="mx-auto h-20 w-20 lg:h-28 lg:w-28 text-muted-foreground mb-4 opacity-50" />
                <p className="text-2xl lg:text-3xl text-muted-foreground">Esperando llamadas...</p>
                <p className="text-sm lg:text-base text-muted-foreground">Aún no se ha llamado a ningún paciente.</p>
              </div>
            )}
            {mainCalledTurn && (
                <Card
                  key={mainCalledTurn.id}
                  className="shadow-xl transform transition-all duration-500 ease-out border-2 border-accent bg-accent/10 scale-100 animate-fadeIn mb-4 lg:mb-6"
                >
                  <CardHeader className="p-4 sm:p-6 rounded-t-md bg-accent/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-5xl sm:text-6xl lg:text-7xl font-bold text-accent-foreground">{mainCalledTurn.turnNumber}</CardTitle>
                      {mainCalledTurn.status === 'called_by_doctor' ? (
                        <Stethoscope className="h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 text-accent-foreground animate-pulse" />
                      ) : (
                        <Megaphone className="h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 text-accent-foreground animate-pulse" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 text-center">
                     <p className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-1 truncate text-accent-foreground">
                        {getPatientDisplayName(mainCalledTurn.patientName, mainCalledTurn.patientId)}
                    </p>
                     <p className="text-xl sm:text-2xl lg:text-3xl text-accent-foreground/90">
                      {mainCalledTurn.module || (mainCalledTurn.status === 'called_by_doctor' ? "Consultorio Médico" : "Ventanilla")}
                    </p>
                    <p className="text-lg sm:text-xl lg:text-2xl text-accent-foreground/80">
                      Servicio: {mainCalledTurn.service}
                    </p>
                    {mainCalledTurn.status === 'called_by_doctor' && mainCalledTurn.professionalDisplayName && (
                      <p className="text-md sm:text-lg lg:text-xl mt-1 text-accent-foreground/80 font-medium">
                        Atiende: {mainCalledTurn.professionalDisplayName}
                      </p>
                    )}
                    {mainCalledTurn.calledAt && (
                       <p className="text-sm sm:text-base mt-2 text-accent-foreground/70">
                        Llamado {getTimeAgo(mainCalledTurn.calledAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
            )}
            {secondaryCalledTurns.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {secondaryCalledTurns.map((turn) => (
                  <Card
                    key={turn.id}
                    className="shadow-lg bg-card opacity-90 hover:opacity-100 scale-95 hover:scale-[0.97] animate-fadeIn"
                  >
                    <CardHeader className="p-3 sm:p-4 rounded-t-md bg-primary/10">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-3xl sm:text-4xl font-bold text-primary">{turn.turnNumber}</CardTitle>
                         {turn.status === 'called_by_doctor' ? (
                          <Stethoscope className="h-8 w-8 sm:h-10 sm:w-10 text-primary/80" />
                        ) : (
                          <Megaphone className="h-8 w-8 sm:h-10 sm:w-10 text-primary/80" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 text-center">
                      <p className="text-lg sm:text-xl font-semibold mb-1 truncate text-foreground">
                          {getPatientDisplayName(turn.patientName, turn.patientId)}
                      </p>
                      <p className="text-md sm:text-lg text-muted-foreground">
                        {turn.module || (turn.status === 'called_by_doctor' ? "Consultorio" : "Ventanilla")}
                      </p>
                       <p className="text-sm text-muted-foreground/80">
                        Servicio: {turn.service}
                      </p>
                       {turn.status === 'called_by_doctor' && turn.professionalDisplayName && (
                        <p className="text-xs sm:text-sm mt-0.5 text-muted-foreground/80 font-medium">
                          Atiende: {turn.professionalDisplayName}
                        </p>
                      )}
                      {turn.calledAt && (
                        <p className="text-xs mt-1.5 text-muted-foreground/70">
                          Llamado {getTimeAgo(turn.calledAt)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="bg-secondary/20 p-4 lg:p-6 rounded-t-lg">
            <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-secondary-foreground flex items-center">
              <Users className="mr-3 h-7 w-7 lg:h-9 lg:w-9" /> Próximos Turnos (Ventanilla)
            </CardTitle>
             <CardDescription className="text-muted-foreground text-sm lg:text-base">Siguientes pacientes en espera para servicios generales.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 lg:p-6">
            {upcomingTurns.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {upcomingTurns.map((turn) => (
                  <Card key={turn.id} className={`p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-150 ${turn.priority ? 'bg-destructive/10 border-l-4 border-destructive' : 'bg-secondary/30'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-2xl lg:text-3xl font-bold ${turn.priority ? 'text-destructive' : 'text-secondary-foreground'}`}>{turn.turnNumber}</span>
                       {turn.priority && <span className="text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded-full font-semibold">PRIORITARIO</span>}
                    </div>
                    <p className="text-lg lg:text-xl font-medium text-foreground truncate" title={getPatientDisplayName(turn.patientName, turn.patientId)}>
                        {getPatientDisplayName(turn.patientName, turn.patientId)}
                    </p>
                    <p className="text-md lg:text-lg text-muted-foreground mb-2">{turn.service}</p>
                    <div className="flex items-center text-xs lg:text-sm text-muted-foreground/80">
                        <CalendarClock className="inline h-4 w-4 mr-1.5"/> 
                        Solicitado {getTimeAgo(turn.requestedAt)}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-6 lg:py-10 text-lg lg:text-xl">No hay más turnos en espera para servicios generales.</p>
            )}
          </CardContent>
        </Card>
      </div>
       <footer className="mt-8 lg:mt-12 text-center text-xs text-muted-foreground/80 w-full">
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

  