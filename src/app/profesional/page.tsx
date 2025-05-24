
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ChevronRight, PlayCircle, ListChecks, AlertTriangle, Hourglass } from "lucide-react";
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
import type { Turn } from '@/types/turn'; // Import Turn type from new location
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function ProfessionalPage() {
  const [pendingTurns, setPendingTurns] = useState<Turn[]>([]);
  const [calledTurn, setCalledTurn] = useState<Turn | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update current time every minute

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

    // Listener for the currently called turn (most recent one with status 'called')
    // This assumes only one professional is calling at a time or you display the latest called by any professional.
    const qCalled = query(
      collection(db, "turns"),
      where("status", "==", "called"),
      orderBy("calledAt", "desc"), // Get the most recently called
      // limit(1) // If you only want to show one
    );
    const unsubscribeCalled = onSnapshot(qCalled, (querySnapshot) => {
      if (!querySnapshot.empty) {
        // For this panel, we might want to show the turn *this* professional called.
        // The current logic will show the latest globally called turn.
        // If multiple professionals, this needs more specific logic (e.g. filter by professional ID or module)
        // For now, let's find if any of the "called" turns was the one *just* called by this panel.
        // This simplistic approach might need refinement in a multi-professional setup.
        const lastCalledByThisSession = querySnapshot.docs.find(d => d.id === calledTurn?.id);
        if (lastCalledByThisSession) {
             setCalledTurn({ id: lastCalledByThisSession.id, ...lastCalledByThisSession.data() } as Turn);
        } else if (querySnapshot.docs.length > 0 && !calledTurn) {
            // If no specific turn was called by this session, show the latest global one on initial load or if panel was refreshed.
            setCalledTurn({ id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as Turn);
        }
        // If calledTurn is already set (meaning this panel initiated a call), don't override it with another professional's call
        // unless it's an update to the same turn. This logic is tricky for multi-professional display on a single panel.
        // A simpler model for this panel: only show the turn *this* panel called.
      } else {
        // If no turns are 'called', and this panel previously had one, clear it.
        // setCalledTurn(null); // This might clear too aggressively if another professional is working.
      }
    }, (error) => {
      console.error("Error fetching called turn:", error);
      // toast({ title: "Error", description: "No se pudo cargar el turno llamado.", variant: "destructive" });
    });

    return () => {
      clearInterval(timer);
      unsubscribePending();
      unsubscribeCalled();
    };
  }, [toast, calledTurn?.id]); // Add calledTurn.id to dependencies to potentially refetch/re-evaluate called turn if its ID changes

  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "N/A";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    const seconds = Math.floor((currentTime.getTime() - jsDate.getTime()) / 1000);
    if (seconds < 0) return "Ahora";
    if (seconds < 60) return `${seconds} seg`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hrs`;
    const days = Math.floor(hours / 24);
    return `${days} días`;
  };
  
  const getNextTurnToCall = () => {
    // Pending turns are already sorted by Firestore query
    if (pendingTurns.length === 0) return null;
    return pendingTurns[0];
  }

  const callNextPatient = async () => {
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
        module: "Módulo Profesional 1" // Example module
      });
      setCalledTurn(nextTurn); // Optimistically update UI, Firestore listener will confirm
      toast({ title: "Paciente Llamado", description: `Llamando a ${nextTurn.turnNumber}.` });
    } catch (error) {
      console.error("Error updating document: ", error);
      toast({ title: "Error", description: "No se pudo llamar al paciente.", variant: "destructive" });
    }
  };
  
  const nextTurnToDisplayInDialog = getNextTurnToCall();

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-secondary/30">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando turnos...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-secondary/30">
      <div className="w-full max-w-5xl space-y-8">
        <Card className="shadow-xl">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-3xl font-bold">Panel Profesional</CardTitle>
              <Users className="h-8 w-8" />
            </div>
            <CardDescription className="text-primary-foreground/80 pt-1">
              Gestione la fila de pacientes y llame al siguiente turno.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {calledTurn && calledTurn.status === 'called' && (
              <Card className="mb-6 bg-accent/20 border-accent shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl text-accent-foreground flex items-center">
                    <PlayCircle className="mr-2 h-7 w-7" />
                    Llamando a: {calledTurn.turnNumber}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Servicio:</strong> {calledTurn.service}</p>
                  <p><strong>Identificación:</strong> {calledTurn.patientId}</p>
                  <p><strong>Prioridad:</strong> {calledTurn.priority ? "Sí" : "No"}</p>
                  <p><strong>Módulo:</strong> {calledTurn.module || "N/A"}</p>
                  <p><strong>Solicitado hace:</strong> {getTimeAgo(calledTurn.requestedAt)}</p>
                  <p><strong>Llamado hace:</strong> {getTimeAgo(calledTurn.calledAt)}</p>
                </CardContent>
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
                    className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto"
                    disabled={pendingTurns.length === 0}
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
                       `¿Está seguro que desea llamar al paciente con el turno ${nextTurnToDisplayInDialog.turnNumber} (${nextTurnToDisplayInDialog.service})?`
                       : "No hay pacientes para llamar."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={callNextPatient} disabled={!nextTurnToDisplayInDialog}>
                      Llamar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            {pendingTurns.length === 0 ? (
               <div className="text-center py-10">
                 <Hourglass className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">No hay pacientes en espera actualmente.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] border rounded-lg p-1">
                <div className="space-y-3 p-3">
                  {pendingTurns.map((turn) => (
                    <Card key={turn.id} className={`shadow-md hover:shadow-lg transition-shadow ${turn.priority ? 'border-l-4 border-destructive bg-destructive/5' : 'bg-card'}`}>
                      <CardContent className="p-4 flex justify-between items-center">
                        <div>
                          <p className="text-lg font-semibold text-primary">{turn.turnNumber}</p>
                          <p className="text-sm text-muted-foreground">{turn.service}</p>
                          <p className="text-xs text-muted-foreground/80">{turn.patientId}</p>
                        </div>
                        <div className="text-right">
                          {turn.priority && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive text-destructive-foreground mb-1">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Prioritario
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Solicitado hace: {getTimeAgo(turn.requestedAt)}
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
    </main>
  );
}
