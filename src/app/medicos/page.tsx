
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Stethoscope, ChevronRight, PlayCircle, ListChecks, AlertTriangle, Hourglass, Ban, CheckCheck, Briefcase, Settings, UserCircle2, Search, Hospital } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { AVAILABLE_CONSULTORIOS } from "@/lib/consultorios";

const CONSULTORIO_STORAGE_KEY = "selectedDoctorConsultorio";

export default function MedicosPage() {
  const { currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [waitingTurns, setWaitingTurns] = useState<Turn[]>([]);
  const [calledTurn, setCalledTurn] = useState<Turn | null>(null);
  const [selectedConsultorio, setSelectedConsultorio] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Consultorio selection
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedConsultorio = localStorage.getItem(CONSULTORIO_STORAGE_KEY);
      if (storedConsultorio && AVAILABLE_CONSULTORIOS.includes(storedConsultorio)) {
        setSelectedConsultorio(storedConsultorio);
      }
    }
  }, []);

  const handleConsultorioSelect = (consultorio: string) => {
    setSelectedConsultorio(consultorio);
    if (typeof window !== "undefined") {
      localStorage.setItem(CONSULTORIO_STORAGE_KEY, consultorio);
    }
    toast({ title: "Consultorio Seleccionado", description: `Ahora operando desde ${consultorio}.` });
  };
  
  const clearSelectedConsultorio = () => {
    setSelectedConsultorio(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(CONSULTORIO_STORAGE_KEY);
    }
    toast({ title: "Consultorio Deseleccionado", description: "Por favor, seleccione un consultorio para continuar." });
  }

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.replace("/login"); // Or a specific /medicos/login if you create one
    }
  }, [currentUser, authLoading, router]);

  // Firestore listeners
  useEffect(() => {
    if (!currentUser || !selectedConsultorio) {
        setIsLoading(false); 
        setWaitingTurns([]);
        if(calledTurn) setCalledTurn(null);
        return;
    }
    
    setIsLoading(true);

    // Listener for patients waiting for a doctor (status 'waiting_doctor')
    // These are patients who have completed "Facturación"
    const qWaiting = query(
      collection(db, "turns"), 
      where("status", "==", "waiting_doctor"),
      // where("service", "==", "Facturación"), // Ensuring they came from Facturación
      orderBy("completedAt", "asc") // Order by when they finished the previous step
    );
    const unsubscribeWaiting = onSnapshot(qWaiting, (querySnapshot) => {
      const turnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        turnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });
      setWaitingTurns(turnsData);
      setIsLoading(false); 
    }, (error) => {
      console.error("Error fetching waiting_doctor turns:", error);
      if (error.message && error.message.includes("indexes?create_composite")) {
         toast({ 
            title: "Error de Configuración de Firestore", 
            description: "Se requiere un índice para esta consulta (waiting_doctor). Por favor, revise la consola para el enlace de creación.", 
            variant: "destructive",
            duration: 10000 
        });
      } else {
        toast({ title: "Error", description: "No se pudieron cargar los pacientes en espera para médico.", variant: "destructive" });
      }
      setIsLoading(false);
    });
    
    // Listener for the currently called turn by this doctor at this consultorio
    let unsubscribeCalledByThisDoctorListener: (() => void) | null = null;
    if (currentUser && selectedConsultorio) {
        const qCalledByThisDoctor = query(
            collection(db, "turns"),
            where("status", "==", "called_by_doctor"),
            where("professionalId", "==", currentUser.uid),
            where("module", "==", selectedConsultorio), // 'module' here stores the consultorio
            limit(1)
        );

        unsubscribeCalledByThisDoctorListener = onSnapshot(qCalledByThisDoctor, (querySnapshot) => {
            if (!querySnapshot.empty) {
                const turnDoc = querySnapshot.docs[0];
                setCalledTurn({ id: turnDoc.id, ...turnDoc.data() } as Turn);
            } else {
                setCalledTurn(null);
            }
        }, (error) => {
            console.error("Error fetching current doctor called turn:", error);
        });
    }

    return () => {
      unsubscribeWaiting();
      if (unsubscribeCalledByThisDoctorListener) {
        unsubscribeCalledByThisDoctorListener();
      }
    };
  }, [currentUser, selectedConsultorio, toast]);

  const filteredWaitingTurns = useMemo(() => {
    if (!searchTerm) return waitingTurns;
    return waitingTurns.filter(turn => 
      turn.turnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      turn.patientId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [waitingTurns, searchTerm]);

  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "N/A";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    return formatDistanceToNowStrict(jsDate, { addSuffix: true, locale: es });
  };

  const callPatientByDoctor = async (patientTurn: Turn) => {
    if (!currentUser || !selectedConsultorio) {
      toast({ title: "Error", description: "Debe estar autenticado y haber seleccionado un consultorio.", variant: "destructive" });
      return;
    }
    if (calledTurn) {
      toast({ title: "Atención", description: `Ya está atendiendo el turno ${calledTurn.turnNumber}. Finalícelo antes de llamar a otro.`, variant: "default" });
      return;
    }

    try {
      const turnRef = doc(db, "turns", patientTurn.id);
      await updateDoc(turnRef, {
        status: "called_by_doctor",
        calledAt: serverTimestamp(), // Timestamp of doctor's call
        module: selectedConsultorio, // Store consultorio in module field
        professionalId: currentUser.uid, // Doctor's UID
        professionalDisplayName: currentUser.displayName || currentUser.email, 
      });
      toast({ title: "Paciente Llamado", description: `Llamando a ${patientTurn.turnNumber} al ${selectedConsultorio}.` });
    } catch (error) {
      console.error("Error calling patient by doctor: ", error);
      toast({ title: "Error", description: "No se pudo llamar al paciente.", variant: "destructive" });
    }
  };

  const markDoctorTurnAs = async (status: 'completed_by_doctor' | 'missed_by_doctor') => {
    if (!calledTurn || !currentUser || !selectedConsultorio) {
      toast({ title: "Error", description: "No hay un turno activo o no está configurado el consultorio.", variant: "destructive" });
      return;
    }
    try {
      const turnRef = doc(db, "turns", calledTurn.id);
      let updateData: Partial<Turn> = { status };

      if (status === 'completed_by_doctor') {
        updateData.doctorCompletedAt = serverTimestamp();
      } else if (status === 'missed_by_doctor') {
        updateData.doctorMissedAt = serverTimestamp();
      }
      
      await updateDoc(turnRef, updateData);
      toast({ title: "Consulta Actualizada", description: `La consulta ${calledTurn.turnNumber} ha sido marcada como ${status === 'completed_by_doctor' ? 'completada' : 'paciente no se presentó'}.`});
      setCalledTurn(null);
    } catch (error) {
      console.error("Error updating doctor turn status: ", error);
      toast({ title: "Error", description: "No se pudo actualizar el estado de la consulta.", variant: "destructive" });
    }
  };

  if (authLoading || (!currentUser && !authLoading)) { 
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-secondary/30">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando...</p>
      </main>
    );
  }

  if (!selectedConsultorio) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-blue-500/10 to-background">
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="bg-blue-600 text-white p-6 rounded-t-lg">
            <Hospital className="h-10 w-10 mx-auto mb-3" />
            <CardTitle className="text-2xl font-bold text-center">Seleccionar Consultorio</CardTitle>
            <CardDescription className="text-center text-blue-100 pt-1">
              Por favor, elija el consultorio desde el cual atenderá.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Select onValueChange={handleConsultorioSelect} defaultValue={selectedConsultorio || undefined}>
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder="Elija un consultorio..." />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_CONSULTORIOS.map(mod => (
                  <SelectItem key={mod} value={mod} className="text-base py-2">{mod}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground text-center">Esta selección se recordará para esta sesión.</p>
          </CardContent>
        </Card>
      </main>
    );
  }
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-blue-500/5">
      <div className="w-full max-w-6xl space-y-8">
        <Card className="shadow-xl">
          <CardHeader className="bg-blue-600 text-white rounded-t-lg p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-3xl font-bold flex items-center"><Stethoscope className="mr-3 h-8 w-8"/>Panel Médico</CardTitle>
              <div className="text-right">
                <div className="flex items-center gap-2">
                 <UserCircle2 className="h-7 w-7 inline-block" />
                 <div>
                    <p className="text-lg font-semibold">{currentUser?.displayName || currentUser?.email}</p>
                    <p className="text-xs text-blue-100">{selectedConsultorio}</p>
                 </div>
                 <Button variant="ghost" size="sm" onClick={clearSelectedConsultorio} className="ml-1 p-1 h-auto text-white hover:bg-white/20" title="Cambiar Consultorio">
                    <Settings className="h-4 w-4" />
                 </Button>
                </div>
              </div>
            </div>
            <CardDescription className="text-blue-100 pt-1">
              Pacientes en espera de atención médica desde {selectedConsultorio}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {calledTurn && (
              <Card className="mb-6 bg-green-500/20 border-2 border-green-600 shadow-lg animate-fadeIn">
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl text-green-700 flex items-center">
                    <PlayCircle className="mr-3 h-8 w-8 animate-pulse text-green-600" />
                    Atendiendo Turno: {calledTurn.turnNumber}
                  </CardTitle>
                   <CardDescription className="text-green-700/80">
                    Paciente: ...{calledTurn.patientId.slice(-6, -3)}XXX {/* Masked Patient ID */}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-1 pt-0 pb-3">
                  <p><strong>Servicio Origen:</strong> {calledTurn.service}</p>
                  <p><strong>Prioridad Origen:</strong> {calledTurn.priority ? "Sí" : "No"}</p>
                  <p><strong>Llamado al Consultorio:</strong> {getTimeAgo(calledTurn.calledAt)}</p>
                </CardContent>
                <CardFooter className="gap-3 p-3 border-t border-green-600/30">
                  <Button onClick={() => markDoctorTurnAs('completed_by_doctor')} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                    <CheckCheck className="mr-2 h-5 w-5" /> Consulta Completada
                  </Button>
                  <Button onClick={() => markDoctorTurnAs('missed_by_doctor')} variant="outline" className="flex-1 border-red-500 text-red-600 hover:bg-red-500/10">
                     <Ban className="mr-2 h-5 w-5" /> No se Presentó
                  </Button>
                </CardFooter>
              </Card>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
              <h2 className="text-2xl font-semibold text-gray-700 flex items-center">
                <ListChecks className="mr-3 h-7 w-7 text-blue-600" />
                Pacientes en Espera ({filteredWaitingTurns.length})
              </h2>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input 
                  type="text"
                  placeholder="Buscar por turno o ID paciente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 text-base"
                />
              </div>
            </div>
            
            {isLoading && waitingTurns.length === 0 ? (
                <div className="text-center py-10">
                    <Hourglass className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
                    <p className="text-lg text-muted-foreground mt-2">Buscando pacientes...</p>
                </div>
            ) : filteredWaitingTurns.length === 0 ? (
               <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg">
                 <Hourglass className="mx-auto h-16 w-16 text-gray-400 mb-4 opacity-70" />
                <p className="text-xl text-gray-500">
                  {searchTerm ? `No se encontraron pacientes para "${searchTerm}".` : "No hay pacientes en espera de atención médica en este momento."}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[450px] border rounded-lg p-1 bg-white">
                <div className="space-y-3 p-3">
                  {filteredWaitingTurns.map((turn) => (
                    <Card key={turn.id} className={`shadow-md hover:shadow-lg transition-shadow duration-150 ${turn.priority ? 'border-l-4 border-orange-500 bg-orange-500/5 hover:bg-orange-500/10' : 'bg-gray-50 hover:bg-gray-100'}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start">
                        <div className="mb-3 sm:mb-0 flex-grow">
                          <p className={`text-xl font-semibold ${turn.priority ? 'text-orange-600' : 'text-blue-700'}`}>{turn.turnNumber}</p>
                          <p className="text-sm text-gray-600">Servicio Origen: {turn.service}</p>
                          <p className="text-xs text-gray-500/80">ID: ...{turn.patientId.slice(-6,-3)}XXX</p>
                          {turn.priority && (
                            <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/80 text-white">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Prioridad (Origen)
                            </span>
                          )}
                           <p className="text-xs text-gray-500 mt-1">
                            Esperando desde: {getTimeAgo(turn.completedAt || turn.requestedAt)}
                          </p>
                        </div>
                        <div className="sm:ml-4 flex-shrink-0">
                           <AlertDialog>
                            <AlertDialogTrigger asChild>
                               <Button 
                                size="sm" 
                                className="bg-green-500 text-white hover:bg-green-600 w-full sm:w-auto disabled:opacity-60"
                                disabled={!!calledTurn || isLoading}
                              >
                                Llamar Paciente
                                <ChevronRight className="ml-2 h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Llamada</AlertDialogTitle>
                                <AlertDialogDescription>
                                  ¿Está seguro que desea llamar al paciente con el turno {turn.turnNumber} al consultorio {selectedConsultorio}?
                                  {!!calledTurn && <p className="mt-2 text-destructive">Ya está atendiendo a un paciente. Finalice el turno actual primero.</p>}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => callPatientByDoctor(turn)} disabled={!!calledTurn}>
                                  Llamar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
       <footer className="mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Panel de Médicos.</p>
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
