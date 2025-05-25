
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ChevronRight, PlayCircle, ListChecks, AlertTriangle, Hourglass, Ban, CheckCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Turn } from '@/types/turn';
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';

// Simulate different professional modules, could be dynamic in a real app
const PROFESSIONAL_MODULE = "Módulo Profesional " + Math.ceil(Math.random() * 5); 

export default function ProfessionalPage() {
  const [pendingTurns, setPendingTurns] = useState<Turn[]>([]);
  const [calledTurn, setCalledTurn] = useState<Turn | null>(null); // Turn this professional is handling
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); 

    // Listener for pending turns
    const qPending = query(
      collection(db, "turns"), 
      where("status", "==", "pending"), 
      orderBy("priority", "desc"), 
      orderBy("requestedAt", "asc")
    );
    const unsubscribePending = onSnapshot(qPending, (querySnapshot) => {
      const turnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        turnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });
      setPendingTurns(turnsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching pending turns:", error);
      toast({ title: "Error", description: "No se pudieron cargar los turnos pendientes.", variant: "destructive" });
      setIsLoading(false);
    });

    // Listener for changes to the turn this professional is currently handling
    let unsubscribeCalledTurn: (() => void) | null = null;
    if (calledTurn?.id) {
      const turnRef = doc(db, "turns", calledTurn.id);
      unsubscribeCalledTurn = onSnapshot(turnRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const updatedTurnData = { id: docSnapshot.id, ...docSnapshot.data() } as Turn;
          if (updatedTurnData.status === 'called' && updatedTurnData.module === PROFESSIONAL_MODULE) {
            setCalledTurn(updatedTurnData); // Keep it updated
          } else if (updatedTurnData.status !== 'called' && calledTurn?.id === updatedTurnData.id) {
            // If it's no longer 'called' (e.g., completed, missed) or module changed by another action
            setCalledTurn(null); 
          }
        } else {
          // Document was deleted or no longer exists
          setCalledTurn(null);
        }
      }, (error) => {
        console.error("Error listening to active turn:", error);
        // Optionally clear calledTurn if there's an error fetching its state
        // setCalledTurn(null); 
      });
    }
    
    return () => {
      clearInterval(timer);
      unsubscribePending();
      if (unsubscribeCalledTurn) {
        unsubscribeCalledTurn();
      }
    };
  }, [toast, calledTurn?.id]); // Re-subscribe if calledTurn.id changes

  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "N/A";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
     if (Math.abs(new Date().getTime() - jsDate.getTime()) < 5000) return "Ahora"; // less than 5 seconds
    return formatDistanceToNowStrict(jsDate, { addSuffix: true, locale: es });
  };
  
  const getNextTurnToCall = () => {
    if (pendingTurns.length === 0) return null;
    return pendingTurns[0];
  }

  const callNextPatient = async () => {
    if (calledTurn) {
      toast({ title: "Atención", description: `Ya está atendiendo el turno ${calledTurn.turnNumber}. Finalícelo antes de llamar a otro.`, variant: "default" });
      return;
    }

    const nextTurn = getNextTurnToCall();
    if (!nextTurn) {
      toast({ title: "Información", description: "No hay pacientes en espera.", variant: "default" });
      return;
    }

    try {
      const turnRef = doc(db, "turns", nextTurn.id);
      await updateDoc(turnRef, {
        status: "called",
        calledAt: serverTimestamp(),
        module: PROFESSIONAL_MODULE 
      });
      // Optimistically set: Firestore listener will confirm/update with calledAt
      const optimisticallyCalledTurn = { ...nextTurn, status: 'called', module: PROFESSIONAL_MODULE, calledAt: new Timestamp(Math.floor(Date.now()/1000),0) } as Turn;
      setCalledTurn(optimisticallyCalledTurn); 
      toast({ title: "Paciente Llamado", description: `Llamando a ${nextTurn.turnNumber} desde ${PROFESSIONAL_MODULE}.` });
    } catch (error) {
      console.error("Error updating document: ", error);
      toast({ title: "Error", description: "No se pudo llamar al paciente.", variant: "destructive" });
    }
  };

  const markTurnAs = async (status: 'completed' | 'missed') => {
    if (!calledTurn) {
      toast({ title: "Error", description: "No hay un turno activo para marcar.", variant: "destructive" });
      return;
    }
    try {
      const turnRef = doc(db, "turns", calledTurn.id);
      await updateDoc(turnRef, {
        status: status,
        // You might want to add a 'completedAt' or 'missedAt' timestamp here
      });
      toast({ title: "Turno Actualizado", description: `El turno ${calledTurn.turnNumber} ha sido marcado como ${status === 'completed' ? 'completado' : 'no se presentó'}.`});
      setCalledTurn(null); // Clear the active turn for this professional
    } catch (error) {
      console.error("Error updating turn status: ", error);
      toast({ title: "Error", description: "No se pudo actualizar el estado del turno.", variant: "destructive" });
    }
  };
  
  const nextTurnToDisplayInDialog = getNextTurnToCall();

  if (isLoading && pendingTurns.length === 0 && !calledTurn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-secondary/30">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando panel profesional...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-secondary/30">
      <div className="w-full max-w-5xl space-y-8">
        <Card className="shadow-xl">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-3xl font-bold">Panel Profesional</CardTitle>
              <div className="text-right">
                <Users className="h-8 w-8 inline-block" />
                <p className="text-xs text-primary-foreground/80">{PROFESSIONAL_MODULE}</p>
              </div>
            </div>
            <CardDescription className="text-primary-foreground/80 pt-1">
              Gestione la fila de pacientes y llame al siguiente turno.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {calledTurn && calledTurn.status === 'called' && (
              <Card className="mb-6 bg-accent/20 border-2 border-accent shadow-lg animate-fadeIn">
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl text-accent-foreground flex items-center">
                    <PlayCircle className="mr-3 h-8 w-8 animate-pulse" />
                    Atendiendo Turno: {calledTurn.turnNumber}
                  </CardTitle>
                   <CardDescription className="text-accent-foreground/80">
                    Paciente: {calledTurn.patientId}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-1 pt-0 pb-3">
                  <p><strong>Servicio:</strong> {calledTurn.service}</p>
                  <p><strong>Prioridad:</strong> {calledTurn.priority ? "Sí" : "No"}</p>
                  <p><strong>Módulo Asignado:</strong> {calledTurn.module || PROFESSIONAL_MODULE}</p>
                  <p><strong>Solicitado:</strong> {getTimeAgo(calledTurn.requestedAt)}</p>
                  <p><strong>Llamado:</strong> {getTimeAgo(calledTurn.calledAt)}</p>
                </CardContent>
                <CardFooter className="gap-3 p-3 border-t border-accent/30">
                  <Button onClick={() => markTurnAs('completed')} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                    <CheckCheck className="mr-2 h-5 w-5" /> Completado
                  </Button>
                  <Button onClick={() => markTurnAs('missed')} variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive/10">
                     <Ban className="mr-2 h-5 w-5" /> No se Presentó
                  </Button>
                </CardFooter>
              </Card>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
              <h2 className="text-2xl font-semibold text-foreground flex items-center">
                <ListChecks className="mr-3 h-7 w-7 text-primary" />
                Pacientes en Espera ({pendingTurns.length})
              </h2>
               <AlertDialog>
                <AlertDialogTrigger asChild>
                   <Button 
                    size="lg" 
                    className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto text-base py-6 disabled:opacity-60"
                    disabled={pendingTurns.length === 0 || !!calledTurn} // Disable if no pending or already calling someone
                  >
                    Llamar Siguiente Paciente
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Llamada</AlertDialogTitle>
                    <AlertDialogDescription>
                      {nextTurnToDisplayInDialog ? 
                       `¿Está seguro que desea llamar al paciente con el turno ${nextTurnToDisplayInDialog.turnNumber} (${nextTurnToDisplayInDialog.service}) desde ${PROFESSIONAL_MODULE}?`
                       : "No hay pacientes para llamar."}
                       {!!calledTurn && <p className="mt-2 text-destructive">Ya está atendiendo a un paciente. Finalice el turno actual primero.</p>}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={callNextPatient} disabled={!nextTurnToDisplayInDialog || !!calledTurn}>
                      Llamar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            {pendingTurns.length === 0 ? (
               <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
                 <Hourglass className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-70" />
                <p className="text-xl text-muted-foreground">No hay pacientes en espera actualmente.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] border rounded-lg p-1 bg-background">
                <div className="space-y-3 p-3">
                  {pendingTurns.map((turn) => (
                    <Card key={turn.id} className={`shadow-md hover:shadow-lg transition-shadow duration-150 ${turn.priority ? 'border-l-4 border-destructive bg-destructive/5 hover:bg-destructive/10' : 'bg-card hover:bg-secondary/30'}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <div className="mb-2 sm:mb-0">
                          <p className={`text-lg font-semibold ${turn.priority ? 'text-destructive' : 'text-primary'}`}>{turn.turnNumber}</p>
                          <p className="text-sm text-muted-foreground">{turn.service}</p>
                          <p className="text-xs text-muted-foreground/80">ID: {turn.patientId}</p>
                        </div>
                        <div className="text-left sm:text-right w-full sm:w-auto">
                          {turn.priority && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive text-destructive-foreground mb-1">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Prioritario
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Solicitado: {getTimeAgo(turn.requestedAt)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
       <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Todos los derechos reservados.</p>
      </footer>
       <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </main>
  );
}

