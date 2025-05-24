
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
} from "@/components/ui/alert-dialog"

// Placeholder data for turns
const initialPendingTurns = [
  { id: "F-102", service: "Facturación", patientId: "CC 123XXX789", priority: true, requestedAt: new Date(Date.now() - 5 * 60000) },
  { id: "C-055", service: "Citas Médicas", patientId: "CC 987XXX654", priority: false, requestedAt: new Date(Date.now() - 10 * 60000) },
  { id: "N-030", service: "Nueva EPS", patientId: "CC 456XXX321", priority: true, requestedAt: new Date(Date.now() - 2 * 60000) },
  { id: "F-103", service: "Facturación", patientId: "CC 789XXX012", priority: false, requestedAt: new Date(Date.now() - 15 * 60000) },
  { id: "S-001", service: "Famisanar", patientId: "CC 321XXX654", priority: false, requestedAt: new Date(Date.now() - 8 * 60000) },
];

type Turn = typeof initialPendingTurns[0];

export default function ProfessionalPage() {
  const [pendingTurns, setPendingTurns] = useState<Turn[]>(initialPendingTurns);
  const [calledTurn, setCalledTurn] = useState<Turn | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update time every minute
    return () => clearInterval(timer);
  }, []);

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((currentTime.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " años";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " días";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " horas";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutos";
    return Math.floor(seconds) + " segundos";
  };
  
  const callNextPatient = () => {
    if (pendingTurns.length === 0) {
      // Handle no pending turns (e.g., show a toast or message)
      alert("No hay pacientes en espera.");
      return;
    }
    // Simple priority: true first, then by requestedAt
    const sortedTurns = [...pendingTurns].sort((a, b) => {
        if (a.priority && !b.priority) return -1;
        if (!a.priority && b.priority) return 1;
        return a.requestedAt.getTime() - b.requestedAt.getTime();
    });

    const nextTurn = sortedTurns[0];
    setCalledTurn(nextTurn);
    setPendingTurns(prevTurns => prevTurns.filter(turn => turn.id !== nextTurn.id));
  };

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
            {calledTurn && (
              <Card className="mb-6 bg-accent/20 border-accent shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl text-accent-foreground flex items-center">
                    <PlayCircle className="mr-2 h-7 w-7" />
                    Llamando a: {calledTurn.id}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p><strong>Servicio:</strong> {calledTurn.service}</p>
                  <p><strong>Cédula:</strong> {calledTurn.patientId}</p>
                  <p><strong>Prioridad:</strong> {calledTurn.priority ? "Sí" : "No"}</p>
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
                      {pendingTurns.length > 0 ? 
                       `¿Está seguro que desea llamar al paciente con el turno ${[...pendingTurns].sort((a,b) => {if(a.priority && !b.priority) return -1; if(!a.priority && b.priority) return 1; return a.requestedAt.getTime() - b.requestedAt.getTime()})[0]?.id}?`
                       : "No hay pacientes para llamar."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={callNextPatient} disabled={pendingTurns.length === 0}>
                      Llamar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            {pendingTurns.length === 0 && !calledTurn ? (
               <div className="text-center py-10">
                 <Hourglass className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">No hay pacientes en espera actualmente.</p>
              </div>
            ) : pendingTurns.length === 0 && calledTurn ? (
                 <div className="text-center py-10">
                 <Hourglass className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">No hay más pacientes en espera.</p>
              </div>
            ): (
              <ScrollArea className="h-[400px] border rounded-lg p-1">
                <div className="space-y-3 p-3">
                  {pendingTurns.sort((a,b) => {
                     if (a.priority && !b.priority) return -1;
                     if (!a.priority && b.priority) return 1;
                     return a.requestedAt.getTime() - b.requestedAt.getTime();
                  }).map((turn) => (
                    <Card key={turn.id} className={`shadow-md hover:shadow-lg transition-shadow ${turn.priority ? 'border-l-4 border-destructive bg-destructive/5' : 'bg-card'}`}>
                      <CardContent className="p-4 flex justify-between items-center">
                        <div>
                          <p className="text-lg font-semibold text-primary">{turn.id}</p>
                          <p className="text-sm text-muted-foreground">{turn.service}</p>
                          <p className="text-xs text-muted-foreground/80">C.C. {turn.patientId}</p>
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
    </main>
  );
}
