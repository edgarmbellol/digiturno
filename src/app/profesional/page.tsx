
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image"; // Import Image
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, ChevronRight, PlayCircle, ListChecks, AlertTriangle, Hourglass, Ban, CheckCheck, Briefcase, Settings, UserCircle2, Workflow, LogOut } from "lucide-react";
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
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { AVAILABLE_SERVICES, type ServiceDefinition } from "@/lib/services";

const MODULE_STORAGE_KEY = "selectedProfessionalModule";
const SERVICE_STORAGE_KEY = "selectedProfessionalService";


export default function ProfessionalPage() {
  const { currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [pendingTurns, setPendingTurns] = useState<Turn[]>([]);
  const [calledTurn, setCalledTurn] = useState<Turn | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedServiceValue = localStorage.getItem(SERVICE_STORAGE_KEY);
      if (storedServiceValue) {
        const serviceDef = AVAILABLE_SERVICES.find(s => s.value === storedServiceValue);
        if (serviceDef) {
          setSelectedService(serviceDef); 

          const storedModule = localStorage.getItem(MODULE_STORAGE_KEY);
          if (storedModule && serviceDef.modules.includes(storedModule)) {
            setSelectedModule(storedModule);
          } else {
            setSelectedModule(null);
            if (typeof window !== "undefined") {
                localStorage.removeItem(MODULE_STORAGE_KEY);
            }
          }
        } else {
          setSelectedService(null);
          setSelectedModule(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(SERVICE_STORAGE_KEY);
            localStorage.removeItem(MODULE_STORAGE_KEY);
          }
        }
      }
    }
  }, []);


  const handleModuleSelect = (moduleValue: string) => {
    if (!selectedService || !selectedService.modules.includes(moduleValue)) {
      toast({ title: "Error de Selección", description: "Este módulo no es válido para el servicio actual.", variant: "destructive"});
      return;
    }
    setSelectedModule(moduleValue);
    if (typeof window !== "undefined") {
      localStorage.setItem(MODULE_STORAGE_KEY, moduleValue);
    }
    toast({ title: "Ventanilla Seleccionada", description: `Ahora operando desde ${moduleValue} para ${selectedService.label}.` });
  };
  
  const clearSelectedModuleAndService = () => { 
    setSelectedModule(null);
    setSelectedService(null); 
    if (typeof window !== "undefined") {
      localStorage.removeItem(MODULE_STORAGE_KEY);
      localStorage.removeItem(SERVICE_STORAGE_KEY);
    }
    setPendingTurns([]);
    setCalledTurn(null);
    toast({ title: "Configuración Deseleccionada", description: "Por favor, seleccione un servicio y ventanilla para continuar." });
  };

  const handleServiceSelect = (serviceValue: string) => {
    const serviceDef = AVAILABLE_SERVICES.find(s => s.value === serviceValue);
    if (serviceDef) {
        setSelectedService(serviceDef);
        if (typeof window !== "undefined") {
            localStorage.setItem(SERVICE_STORAGE_KEY, serviceDef.value);
        }
        setPendingTurns([]); 
        setCalledTurn(null); 

        if (selectedModule && !serviceDef.modules.includes(selectedModule)) {
          setSelectedModule(null); 
          if (typeof window !== "undefined") {
            localStorage.removeItem(MODULE_STORAGE_KEY); 
          }
          toast({ title: "Módulo Anterior No Válido", description: "Por favor, seleccione una nueva ventanilla para el servicio elegido.", variant: "default" });
        }
        toast({ title: "Servicio Seleccionado", description: `Atendiendo ${serviceDef.label}.` });
    }
  };

  const clearSelectedService = () => { 
    setSelectedService(null);
    setSelectedModule(null);
     if (typeof window !== "undefined") {
      localStorage.removeItem(SERVICE_STORAGE_KEY);
      localStorage.removeItem(MODULE_STORAGE_KEY);
    }
    setPendingTurns([]);
    setCalledTurn(null);
    toast({ title: "Servicio Deseleccionado", description: "Por favor, seleccione un servicio para continuar." });
  };

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.replace("/login");
    }
  }, [currentUser, authLoading, router]);

  useEffect(() => {
    if (!currentUser || !selectedModule || !selectedService) {
        setIsLoading(false); 
        setPendingTurns([]); 
        if (calledTurn) setCalledTurn(null); 
        return;
    }
    
    setIsLoading(true);

    const qPending = query(
      collection(db, "turns"), 
      where("status", "==", "pending"), 
      where("service", "==", selectedService.label),
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
      if (error.message && error.message.includes("indexes?create_composite")) {
         toast({ 
            title: "Error de Configuración de Firestore", 
            description: "Se requiere un índice para esta consulta. Por favor, revise la consola del navegador para obtener el enlace para crear el índice y créelo en Firebase Console.", 
            variant: "destructive",
            duration: 10000 
        });
      } else {
        toast({ title: "Error", description: "No se pudieron cargar los turnos pendientes para este servicio.", variant: "destructive" });
      }
      setIsLoading(false);
    });

    let unsubscribeCalledTurnListener: (() => void) | null = null;
    if (currentUser && selectedModule && selectedService) { 
        const qCalledByThisProfessional = query(
            collection(db, "turns"),
            where("status", "==", "called"),
            where("professionalId", "==", currentUser.uid),
            where("module", "==", selectedModule),
            where("service", "==", selectedService.label), 
            limit(1)
        );

        unsubscribeCalledTurnListener = onSnapshot(qCalledByThisProfessional, (querySnapshot) => {
            if (!querySnapshot.empty) {
                const turnDoc = querySnapshot.docs[0];
                setCalledTurn({ id: turnDoc.id, ...turnDoc.data() } as Turn);
            } else {
                setCalledTurn(null);
            }
        }, (error) => {
            console.error("Error fetching current called turn:", error);
            toast({ title: "Error de Sincronización", description: "No se pudo verificar el turno activo.", variant: "destructive" });
        });
    }
    
    return () => {
      unsubscribePending();
      if (unsubscribeCalledTurnListener) {
        unsubscribeCalledTurnListener();
      }
    };
  }, [currentUser, selectedModule, selectedService, toast]); 


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
  };

  const getNextTurnToCall = useCallback(() => {
    if (pendingTurns.length === 0) return null;
    return pendingTurns[0];
  }, [pendingTurns]);

  const callNextPatient = async () => {
    if (!currentUser || !selectedModule || !selectedService) {
      toast({ title: "Error", description: "Debe estar autenticado, haber seleccionado ventanilla y servicio.", variant: "destructive" });
      return;
    }
    if (calledTurn) {
      toast({ title: "Atención", description: `Ya está atendiendo el turno ${calledTurn.turnNumber}. Finalícelo antes de llamar a otro.`, variant: "default" });
      return;
    }

    const nextTurn = getNextTurnToCall();
    if (!nextTurn) {
      toast({ title: "Información", description: `No hay pacientes en espera para ${selectedService.label}.`, variant: "default" });
      return;
    }

    try {
      const turnRef = doc(db, "turns", nextTurn.id);
      await updateDoc(turnRef, {
        status: "called",
        calledAt: serverTimestamp(),
        module: selectedModule,
        professionalId: currentUser.uid,
        professionalDisplayName: currentUser.displayName || currentUser.email, 
      });
      toast({ title: "Paciente Llamado", description: `Llamando a ${getPatientDisplayName(nextTurn.patientName, nextTurn.patientId)} (${nextTurn.turnNumber}) para ${selectedService.label} desde ${selectedModule}.` });
    } catch (error) {
      console.error("Error updating document: ", error);
      toast({ title: "Error", description: "No se pudo llamar al paciente.", variant: "destructive" });
    }
  };

  const markTurnAs = async (newStatus: 'completed' | 'missed') => {
    if (!calledTurn || !currentUser || !selectedModule || !selectedService) {
      toast({ title: "Error", description: "No hay un turno activo o no está configurada la ventanilla/servicio.", variant: "destructive" });
      return;
    }
    try {
      const turnRef = doc(db, "turns", calledTurn.id);
      let updateData: Partial<Turn> = {
        professionalId: currentUser.uid, 
        professionalDisplayName: currentUser.displayName || currentUser.email,
        module: selectedModule, 
      };

      let toastMessageAction = "completado";

      if (newStatus === 'completed') {
        if (calledTurn.service === "Facturación") {
          updateData.status = 'waiting_doctor';
          toastMessageAction = "listo para médico";
        } else {
          updateData.status = 'completed';
        }
        updateData.completedAt = serverTimestamp();
      } else if (newStatus === 'missed') {
        updateData.status = 'missed';
        updateData.missedAt = serverTimestamp();
        toastMessageAction = "no se presentó";
      }
      
      await updateDoc(turnRef, updateData as any);

      toast({ title: "Turno Actualizado", description: `El turno ${calledTurn.turnNumber} ha sido marcado como ${toastMessageAction}.`});
      setCalledTurn(null); 
    } catch (error) {
      console.error("Error updating turn status: ", error);
      toast({ title: "Error", description: "No se pudo actualizar el estado del turno.", variant: "destructive" });
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

  if (!selectedService) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-accent/10 to-background">
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="bg-accent text-accent-foreground p-6 rounded-t-lg">
            <div className="flex flex-col items-center mb-4">
             <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority />
            </div>
            <Workflow className="h-10 w-10 mx-auto mb-3" />
            <CardTitle className="text-2xl font-bold text-center">Seleccionar Servicio</CardTitle>
            <CardDescription className="text-center text-accent-foreground/80 pt-1">
              Elija el tipo de servicio que atenderá.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Select onValueChange={handleServiceSelect} value={selectedService?.value || undefined}>
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder="Elija un servicio..." />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_SERVICES.map(service => (
                  <SelectItem key={service.value} value={service.value} className="text-base py-2">
                     <div className="flex items-center gap-2">
                        <service.icon className="h-5 w-5 text-muted-foreground" />
                        {service.label}
                      </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  
  if (!selectedModule) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 to-background">
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="bg-primary text-primary-foreground p-6 rounded-t-lg">
            <div className="flex flex-col items-center mb-4">
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority />
            </div>
            <Briefcase className="h-10 w-10 mx-auto mb-3" />
            <CardTitle className="text-2xl font-bold text-center">Seleccionar Ventanilla/Recepción</CardTitle>
            <CardDescription className="text-center text-primary-foreground/80 pt-1">
              Atendiendo servicio: <span className="font-semibold">{selectedService.label}</span>.
              Por favor, elija la ventanilla o recepción desde la cual atenderá.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Select onValueChange={handleModuleSelect} value={selectedModule || undefined}>
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder="Elija una ventanilla/recepción..." />
              </SelectTrigger>
              <SelectContent>
                {selectedService.modules.map(mod => (
                  <SelectItem key={mod} value={mod} className="text-base py-2">{mod}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground text-center">Esta selección se recordará para esta sesión.</p>
          </CardContent>
           <CardFooter className="flex flex-col sm:flex-row gap-2 p-6">
            <Button variant="outline" onClick={clearSelectedService} className="w-full sm:w-auto">Cambiar Servicio</Button>
             <Button variant="destructive" onClick={handleLogout} className="w-full sm:w-auto">
              <LogOut className="mr-2 h-4 w-4" /> Cerrar Sesión
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-secondary/30">
      <div className="w-full max-w-5xl space-y-8">
        <Card className="shadow-xl">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg p-6">
             <div className="flex justify-center mb-4">
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
              <div>
                <CardTitle className="text-3xl font-bold">Panel Profesional</CardTitle>
                <CardDescription className="text-primary-foreground/80 pt-1">
                  Gestione la fila de pacientes para <span className="font-semibold">{selectedService.label}</span> desde {selectedModule}.
                </CardDescription>
              </div>
              <div className="text-left sm:text-right mt-3 sm:mt-0">
                <div className="flex items-center gap-2 mb-2">
                 <UserCircle2 className="h-7 w-7 inline-block" />
                 <div>
                    <p className="text-lg font-semibold">{currentUser?.displayName || currentUser?.email}</p>
                    <p className="text-xs text-primary-foreground/80">{selectedModule} - {selectedService.label}</p>
                 </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={clearSelectedService} className="p-1 h-auto text-primary-foreground hover:bg-primary-foreground/20" title="Cambiar Servicio">
                        <Workflow className="h-4 w-4 mr-1" /> <span className="text-xs">Servicio</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedModule(null); if (typeof window !== "undefined") localStorage.removeItem(MODULE_STORAGE_KEY); }} className="p-1 h-auto text-primary-foreground hover:bg-primary-foreground/20" title="Cambiar Ventanilla/Recepción">
                        <Settings className="h-4 w-4 mr-1" /> <span className="text-xs">Ventanilla</span>
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
              <Card className="mb-6 bg-accent/20 border-2 border-accent shadow-lg animate-fadeIn">
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl text-accent-foreground flex items-center">
                    <PlayCircle className="mr-3 h-8 w-8 animate-pulse" />
                     Atendiendo: {getPatientDisplayName(calledTurn.patientName, calledTurn.patientId)}
                  </CardTitle>
                   <CardDescription className="text-accent-foreground/80">
                     Turno: {calledTurn.turnNumber}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-1 pt-0 pb-3">
                  <p><strong>Servicio:</strong> {calledTurn.service}</p>
                  <p><strong>Prioridad:</strong> {calledTurn.priority ? "Sí" : "No"}</p>
                  <p><strong>Módulo Asignado:</strong> {calledTurn.module || selectedModule}</p>
                  <p><strong>Solicitado:</strong> {getTimeAgo(calledTurn.requestedAt)}</p>
                  <p><strong>Llamado:</strong> {getTimeAgo(calledTurn.calledAt)}</p>
                </CardContent>
                <CardFooter className="gap-3 p-3 border-t border-accent/30">
                  <Button onClick={() => markTurnAs('completed')} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                    <CheckCheck className="mr-2 h-5 w-5" /> {calledTurn.service === "Facturación" ? "Listo para Médico" : "Completado"}
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
                Pacientes en Espera ({pendingTurns.length}) para {selectedService.label}
              </h2>
               <AlertDialog>
                <AlertDialogTrigger asChild>
                   <Button 
                    size="lg" 
                    className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto text-base py-6 disabled:opacity-60"
                    disabled={pendingTurns.length === 0 || !!calledTurn || !selectedModule || !selectedService || isLoading}
                  >
                    {isLoading ? "Cargando..." : "Llamar Siguiente Paciente"}
                    {!isLoading && <ChevronRight className="ml-2 h-5 w-5" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Llamada</AlertDialogTitle>
                    <AlertDialogDescription>
                      {getNextTurnToCall() ? 
                       `¿Está seguro que desea llamar a ${getPatientDisplayName(getNextTurnToCall()!.patientName, getNextTurnToCall()!.patientId)} (${getNextTurnToCall()!.turnNumber}) para ${getNextTurnToCall()!.service} desde ${selectedModule}?`
                       : `No hay pacientes para llamar para ${selectedService.label}.`}
                    
                     {!!calledTurn && <div className="mt-2 text-destructive">Ya está atendiendo a un paciente. Finalice el turno actual primero.</div>}
                     {(!selectedModule || !selectedService) && <div className="mt-2 text-destructive">Debe seleccionar una ventanilla y servicio primero.</div>}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={callNextPatient} disabled={!getNextTurnToCall() || !!calledTurn || !selectedModule || !selectedService}>
                      Llamar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            {pendingTurns.length === 0 && selectedModule && selectedService && !isLoading ? (
               <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
                 <Hourglass className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-70" />
                <p className="text-xl text-muted-foreground">No hay pacientes en espera actualmente para {selectedService.label}.</p>
              </div>
            ) : (!selectedModule || !selectedService) && pendingTurns.length === 0 && !isLoading ? (
                <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
                    <Settings className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-70" />
                    <p className="text-xl text-muted-foreground">Seleccione una ventanilla/recepción y un servicio para ver los pacientes en espera.</p>
                </div>
            ) : isLoading && pendingTurns.length === 0 && !calledTurn ? ( 
                <div className="text-center py-10">
                    <Hourglass className="mx-auto h-12 w-12 text-primary animate-spin" />
                    <p className="text-lg text-muted-foreground mt-2">Buscando pacientes...</p>
                </div>
            ) : (
              <ScrollArea className="h-[400px] border rounded-lg p-1 bg-background">
                <div className="space-y-3 p-3">
                  {pendingTurns.map((turn) => (
                    <Card key={turn.id} className={`shadow-md hover:shadow-lg transition-shadow duration-150 ${turn.priority ? 'border-l-4 border-destructive bg-destructive/5 hover:bg-destructive/10' : 'bg-card hover:bg-secondary/30'}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <div className="mb-2 sm:mb-0 flex-grow">
                          <p className={`text-lg font-semibold ${turn.priority ? 'text-destructive' : 'text-primary'}`}>{turn.turnNumber}</p>
                          <p className="text-sm text-foreground">{getPatientDisplayName(turn.patientName, turn.patientId)}</p>
                          <p className="text-xs text-muted-foreground/80">Servicio: {turn.service}</p>
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
    
