
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Stethoscope, ChevronRight, PlayCircle, ListChecks, AlertTriangle, Hourglass, Ban, CheckCheck, Briefcase, Settings, UserCircle2, Search, Hospital, LogOut, Loader2, RotateCcw, MessageSquareWarning } from "lucide-react";
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
import { db, auth } from "@/lib/firebase"; 
import { signOut } from "firebase/auth"; 
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, limit, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';

import type { ConsultorioConfig } from "@/config/appConfigTypes";
import { AVAILABLE_CONSULTORIOS as DEFAULT_CONSULTORIOS_STATIC_FALLBACK } from "@/lib/consultorios";

const CONSULTORIO_STORAGE_KEY = "selectedDoctorConsultorio";
const APP_CONFIG_COLLECTION = "app_configurations";
const CONSULTORIOS_DOC_ID = "main_consultorios_config";
const MAX_RECENTLY_MISSED_TURNS_MEDICO = 2;

export default function MedicosPage() {
  const { currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [waitingTurns, setWaitingTurns] = useState<Turn[]>([]);
  const [calledTurn, setCalledTurn] = useState<Turn | null>(null);
  const [recentlyMissedTurnsByMe, setRecentlyMissedTurnsByMe] = useState<Turn[]>([]);
  
  const [availableConsultorios, setAvailableConsultorios] = useState<string[]>([]);
  const [isLoadingConsultorioConfig, setIsLoadingConsultorioConfig] = useState(true);
  const [selectedConsultorio, setSelectedConsultorio] = useState<string | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchConsultorioConfiguration = useCallback(async () => {
    setIsLoadingConsultorioConfig(true);
    try {
      const consultorioDocRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
      const consultorioDocSnap = await getDoc(consultorioDocRef);
      let consultorioNamesData: string[] = [];

      if (consultorioDocSnap.exists()) {
        consultorioNamesData = (consultorioDocSnap.data() as ConsultorioConfig).names;
      } else {
        toast({ title: "Usando Config. por Defecto", description: "No se encontró config. de consultorios en Firestore. Usando valores estáticos.", duration: 5000, variant: "default"});
        consultorioNamesData = [...DEFAULT_CONSULTORIOS_STATIC_FALLBACK];
      }
      
      if (!consultorioNamesData || consultorioNamesData.length === 0) {
          // Fallback again if Firestore data is empty array
          consultorioNamesData = [...DEFAULT_CONSULTORIOS_STATIC_FALLBACK];
      }
      setAvailableConsultorios(consultorioNamesData.sort());


      const storedConsultorio = localStorage.getItem(CONSULTORIO_STORAGE_KEY);
      if (storedConsultorio && consultorioNamesData.includes(storedConsultorio)) {
        setSelectedConsultorio(storedConsultorio);
      } else {
        setSelectedConsultorio(null);
      }

    } catch (error) {
      console.error("Error fetching consultorio configuration:", error);
      toast({ title: "Error de Configuración", description: "No se pudo cargar la configuración de consultorios. Usando valores por defecto.", variant: "destructive" });
      setAvailableConsultorios([...DEFAULT_CONSULTORIOS_STATIC_FALLBACK].sort());
    } finally {
      setIsLoadingConsultorioConfig(false);
    }
  }, [toast]);


  useEffect(() => {
    if(currentUser) {
      fetchConsultorioConfiguration();
    }
  }, [currentUser, fetchConsultorioConfiguration]);


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
    setCalledTurn(null); 
    setWaitingTurns([]); 
    setRecentlyMissedTurnsByMe([]);
    toast({ title: "Consultorio Deseleccionado", description: "Por favor, seleccione un consultorio para continuar." });
  }

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.replace("/login"); 
    }
  }, [currentUser, authLoading, router]);

  useEffect(() => {
    if (!currentUser || !selectedConsultorio || isLoadingConsultorioConfig) {
        setIsLoadingData(false); 
        setWaitingTurns([]);
        setRecentlyMissedTurnsByMe([]);
        if(calledTurn) setCalledTurn(null);
        return;
    }
    
    setIsLoadingData(true);

    // Listener for waiting_doctor turns
    const qWaiting = query(
      collection(db, "turns"), 
      where("status", "==", "waiting_doctor"),
      orderBy("completedAt", "asc") 
    );
    const unsubscribeWaiting = onSnapshot(qWaiting, (querySnapshot) => {
      const turnsData: Turn[] = [];
      querySnapshot.forEach((docSnap) => {
        turnsData.push({ id: docSnap.id, ...docSnap.data() } as Turn);
      });
      setWaitingTurns(turnsData);
      setIsLoadingData(false); 
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
      setIsLoadingData(false);
    });
    
    // Listener for turn called by THIS doctor at THIS consultorio
    const qCalledByThisDoctor = query(
        collection(db, "turns"),
        where("status", "==", "called_by_doctor"),
        where("professionalId", "==", currentUser.uid),
        where("module", "==", selectedConsultorio), 
        limit(1)
    );
    const unsubscribeCalledByThisDoctorListener = onSnapshot(qCalledByThisDoctor, (querySnapshot) => {
        if (!querySnapshot.empty) {
            const turnDoc = querySnapshot.docs[0];
            setCalledTurn({ id: turnDoc.id, ...turnDoc.data() } as Turn);
        } else {
            setCalledTurn(null);
        }
    }, (error) => {
        console.error("Error fetching current doctor called turn:", error);
        toast({ title: "Error de Sincronización", description: "No se pudo verificar el turno activo del médico.", variant: "destructive" });
    });

    // Listener for recently missed turns by this doctor
    const qMissedByMe = query(
      collection(db, "turns"),
      where("status", "==", "missed_by_doctor"),
      where("professionalId", "==", currentUser.uid),
      where("module", "==", selectedConsultorio),
      orderBy("doctorMissedAt", "desc"),
      limit(MAX_RECENTLY_MISSED_TURNS_MEDICO)
    );
    const unsubscribeMissedByMe = onSnapshot(qMissedByMe, (querySnapshot) => {
      const missedTurnsData: Turn[] = [];
      querySnapshot.forEach((docSnap) => {
        missedTurnsData.push({ id: docSnap.id, ...docSnap.data() } as Turn);
      });
      setRecentlyMissedTurnsByMe(missedTurnsData);
    }, (error) => {
      console.error("Error fetching recently missed turns by doctor:", error);
      if (error.message && error.message.includes("indexes?create_composite")) {
        toast({ 
            title: "Error de Firestore (Índice)", 
            description: "Se necesita un índice para ver las consultas no presentadas. Revise la consola.", 
            variant: "destructive",
            duration: 10000 
        });
      }
    });
    

    return () => {
      unsubscribeWaiting();
      unsubscribeCalledByThisDoctorListener();
      unsubscribeMissedByMe();
    };
  }, [currentUser, selectedConsultorio, toast, isLoadingConsultorioConfig]);

  const filteredWaitingTurns = useMemo(() => {
    if (!searchTerm) return waitingTurns;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return waitingTurns.filter(turn => 
      turn.turnNumber.toLowerCase().includes(lowerSearchTerm) ||
      (turn.patientId && turn.patientId.toLowerCase().includes(lowerSearchTerm)) ||
      (turn.patientName && turn.patientName.toLowerCase().includes(lowerSearchTerm))
    );
  }, [waitingTurns, searchTerm]);

  const getTimeAgo = (date: Timestamp | Date | undefined) => {
    if (!date) return "N/A";
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    if (Math.abs(new Date().getTime() - jsDate.getTime()) < 5000) return "Ahora";
    return formatDistanceToNowStrict(jsDate, { addSuffix: true, locale: es });
  };

  const getPatientDisplayName = (patientName?: string, patientId?: string) => {
    if (patientName && patientName.trim() !== "") {
      return patientName;
    }
    if (patientId) {
      const idParts = patientId.split(" ");
      return idParts.length > 1 ? `ID: ...${idParts[1].slice(-6, -3)}XXX` : `ID: ${patientId}`;
    }
    return "Paciente";
  }

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
        calledAt: serverTimestamp(), 
        module: selectedConsultorio, 
        professionalId: currentUser.uid, 
        professionalDisplayName: currentUser.displayName || currentUser.email, 
      });
      toast({ title: "Paciente Llamado", description: `Llamando a ${getPatientDisplayName(patientTurn.patientName, patientTurn.patientId)} (${patientTurn.turnNumber}) al ${selectedConsultorio}.` });
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
      let updateData: Partial<Turn> & { [key:string]: any } = { status }; 

      if (status === 'completed_by_doctor') {
        updateData.doctorCompletedAt = serverTimestamp();
      } else if (status === 'missed_by_doctor') {
        updateData.doctorMissedAt = serverTimestamp(); 
      }
      updateData.professionalId = currentUser.uid;
      updateData.professionalDisplayName = currentUser.displayName || currentUser.email;
      updateData.module = selectedConsultorio;
      
      await updateDoc(turnRef, updateData);
      toast({ title: "Consulta Actualizada", description: `La consulta ${calledTurn.turnNumber} ha sido marcada como ${status === 'completed_by_doctor' ? 'completada' : 'paciente no se presentó'}.`});
    } catch (error) {
      console.error("Error updating doctor turn status: ", error);
      toast({ title: "Error", description: "No se pudo actualizar el estado de la consulta.", variant: "destructive" });
    }
  };

  const reCallDoctorTurn = async (turnToRecall: Turn) => {
    if (!currentUser || !selectedConsultorio) {
      toast({ title: "Error", description: "Configuración de médico incompleta.", variant: "destructive" });
      return;
    }
    if (calledTurn) {
      toast({ title: "Atención", description: `Ya está atendiendo el turno ${calledTurn.turnNumber}. Finalícelo antes de re-llamar.`, variant: "default" });
      return;
    }
    try {
      const turnRef = doc(db, "turns", turnToRecall.id);
      await updateDoc(turnRef, {
        status: "called_by_doctor",
        calledAt: serverTimestamp(),
        professionalId: currentUser.uid,
        professionalDisplayName: currentUser.displayName || currentUser.email,
        module: selectedConsultorio,
        // doctorMissedAt: deleteField() // Or set to null
      });
      toast({ title: "Paciente Re-Llamado", description: `Re-llamando a ${getPatientDisplayName(turnToRecall.patientName, turnToRecall.patientId)} (${turnToRecall.turnNumber}) al consultorio.` });
    } catch (error) {
      console.error("Error re-calling doctor turn: ", error);
      toast({ title: "Error al Re-Llamar", description: "No se pudo re-llamar al paciente.", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Sesión Cerrada", description: "Has cerrado sesión exitosamente."});
      router.push('/login');
    } catch (error) {
      console.error("Error signing out: ", error);
      toast({ title: "Error al Salir", description: "No se pudo cerrar la sesión.", variant: "destructive"});
    }
  };

  if (authLoading || (!currentUser && !authLoading && (typeof router.asPath !== 'string' || !router.asPath.includes('/login')))) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-secondary/30">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando...</p>
      </main>
    );
  }

  if (isLoadingConsultorioConfig && !selectedConsultorio) {
     return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-secondary/30">
        <Loader2 className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando configuración de consultorios...</p>
      </main>
    );
  }

  if (!selectedConsultorio) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-blue-500/10 to-background">
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="bg-blue-600 text-white p-6 rounded-t-lg">
            <div className="flex flex-col items-center mb-4">
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority data-ai-hint="hospital logo"/>
            </div>
            <Hospital className="h-10 w-10 mx-auto mb-3" />
            <CardTitle className="text-2xl font-bold text-center">Seleccionar Consultorio</CardTitle>
            <CardDescription className="text-center text-blue-100 pt-1">
              Por favor, elija el consultorio desde el cual atenderá.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {isLoadingConsultorioConfig ? (
                 <div className="flex justify-center items-center p-4"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /> Cargando consultorios...</div>
            ): availableConsultorios.length === 0 ? (
                <p className="text-center text-muted-foreground">No hay consultorios configurados. Contacte al administrador.</p>
            ) : (
                <Select onValueChange={handleConsultorioSelect} value={selectedConsultorio || undefined}>
                <SelectTrigger className="w-full h-12 text-base">
                    <SelectValue placeholder="Elija un consultorio..." />
                </SelectTrigger>
                <SelectContent>
                    {availableConsultorios.map(mod => (
                    <SelectItem key={mod} value={mod} className="text-base py-2">{mod}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
            )}
            <p className="text-xs text-muted-foreground text-center">Esta selección se recordará para esta sesión.</p>
          </CardContent>
           <CardFooter className="flex flex-col sm:flex-row gap-2 p-6 justify-center">
            <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto">
              <LogOut className="mr-2 h-4 w-4" /> Cerrar Sesión
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-blue-500/5">
      <div className="w-full max-w-6xl space-y-8">
        <Card className="shadow-xl">
          <CardHeader className="bg-blue-600 text-white rounded-t-lg p-6">
            <div className="flex justify-center mb-4">
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} data-ai-hint="hospital logo"/>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
              <div>
                <CardTitle className="text-3xl font-bold flex items-center"><Stethoscope className="mr-3 h-8 w-8"/>Panel Médico</CardTitle>
                <CardDescription className="text-blue-100 pt-1">
                  Pacientes en espera de atención médica desde {selectedConsultorio}.
                </CardDescription>
              </div>
              <div className="text-left sm:text-right mt-3 sm:mt-0">
                 <div className="flex items-center gap-2 mb-2">
                 <UserCircle2 className="h-7 w-7 inline-block" />
                 <div>
                    <p className="text-lg font-semibold">{currentUser?.displayName || currentUser?.email}</p>
                    <p className="text-xs text-blue-100">{selectedConsultorio}</p>
                 </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={clearSelectedConsultorio} className="p-1 h-auto text-white hover:bg-white/20" title="Cambiar Consultorio">
                      <Settings className="h-4 w-4 mr-1" /> <span className="text-xs">Consultorio</span>
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleLogout} className="p-1 h-auto text-xs" title="Cerrar Sesión">
                      <LogOut className="h-4 w-4 mr-1" /> Salir
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {calledTurn && (
              <Card className="mb-6 bg-green-500/20 border-2 border-green-600 shadow-lg animate-fadeIn">
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl text-green-700 flex items-center">
                    <PlayCircle className="mr-3 h-8 w-8 animate-pulse text-green-600" />
                    Atendiendo: {getPatientDisplayName(calledTurn.patientName, calledTurn.patientId)}
                  </CardTitle>
                   <CardDescription className="text-green-700/80">
                     Turno: {calledTurn.turnNumber}
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
                  placeholder="Buscar por turno, ID o nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 text-base"
                />
              </div>
            </div>
            
            {isLoadingData && waitingTurns.length === 0 && !calledTurn ? (
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
                          <p className="text-base text-gray-700">{getPatientDisplayName(turn.patientName, turn.patientId)}</p>
                          <p className="text-sm text-gray-600">Servicio Origen: {turn.service}</p>
                          
                          {turn.priority && (
                            <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/80 text-white">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Prioridad (Origen)
                            </span>
                          )}
                           <p className="text-xs text-gray-500 mt-1">
                            Esperando desde: {getTimeAgo(turn.completedAt || turn.requestedAt)}
                          </p>
                        </div>
                        <div className="sm:ml-4 flex-shrink-0 self-center">
                           <AlertDialog>
                            <AlertDialogTrigger asChild>
                               <Button 
                                size="sm" 
                                className="bg-green-500 text-white hover:bg-green-600 w-full sm:w-auto disabled:opacity-60"
                                disabled={!!calledTurn || isLoadingData}
                              >
                                Llamar Paciente
                                <ChevronRight className="ml-2 h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Llamada</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {`¿Está seguro que desea llamar a ${getPatientDisplayName(turn.patientName, turn.patientId)} (turno ${turn.turnNumber}) al consultorio ${selectedConsultorio}?`}
                                
                                 <div className="mt-2 text-destructive">{!!calledTurn ? `Ya está atendiendo a un paciente. Finalice el turno actual primero.` : ''}</div>
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

             {recentlyMissedTurnsByMe.length > 0 && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold text-foreground flex items-center mb-4">
                  <MessageSquareWarning className="mr-3 h-6 w-6 text-orange-500" />
                  Consultas No Presentadas (Recientes)
                </h2>
                <ScrollArea className="h-[150px] border rounded-lg p-1 bg-background">
                  <div className="space-y-3 p-3">
                    {recentlyMissedTurnsByMe.map((turn) => (
                      <Card key={turn.id} className="shadow-sm bg-orange-500/5 border-orange-500/30">
                        <CardContent className="p-3 flex flex-col sm:flex-row justify-between items-start">
                          <div className="mb-2 sm:mb-0 flex-grow">
                            <p className="text-base font-semibold text-orange-700">{turn.turnNumber}</p>
                            <p className="text-sm text-muted-foreground">{getPatientDisplayName(turn.patientName, turn.patientId)}</p>
                            <p className="text-xs text-muted-foreground/80">No se presentó: {getTimeAgo(turn.doctorMissedAt)}</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="border-orange-500 text-orange-600 hover:bg-orange-500/10 w-full sm:w-auto self-center"
                            onClick={() => reCallDoctorTurn(turn)}
                            disabled={!!calledTurn}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" /> Re-Llamar
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
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

