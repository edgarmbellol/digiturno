
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { signOut, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { collection, query, where, onSnapshot, Timestamp, or, doc, getDoc, setDoc, getDocs, updateDoc, arrayUnion, arrayRemove, writeBatch } from "firebase/firestore";
import { UserPlus, ShieldCheck, AlertTriangle, LogIn, UserCircle2, Hourglass, LogOut, AlarmClock, Settings2, Hospital, Trash2, PlusCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { Turn } from "@/types/turn";
import { formatDistanceToNowStrict, intervalToDuration } from 'date-fns';
import { es } from 'date-fns/locale';

import { AVAILABLE_SERVICES as DEFAULT_SERVICES_STATIC } from "@/lib/services";
import { AVAILABLE_CONSULTORIOS as DEFAULT_CONSULTORIOS_STATIC } from "@/lib/consultorios";
import type { ServiceConfig, ConsultorioConfig, ServiceDefinitionFront } from "@/config/appConfigTypes";
import { serviceIconMap, DefaultServiceIcon } from "@/lib/iconMapping";

const ADMIN_EMAIL = "edgarmbellol@gmail.com";
const MAX_WAIT_TIME_PENDING_MINUTES = 15;
const MAX_WAIT_TIME_DOCTOR_MINUTES = 30;

const createUserSchema = z.object({
  displayName: z.string().min(1, "El nombre del profesional es requerido."),
  email: z.string().email("Por favor ingrese un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});
type CreateUserFormValues = z.infer<typeof createUserSchema>;

interface PatientWithLongWait extends Turn {
  currentWaitTime: string;
  waitType: 'ventanilla' | 'medico';
}

const SERVICE_CONFIG_COLLECTION = "service_configurations";
const APP_CONFIG_COLLECTION = "app_configurations";
const CONSULTORIOS_DOC_ID = "main_consultorios_config";

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, isLoading: authLoading } = useAuth();

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [patientsWithLongWait, setPatientsWithLongWait] = useState<PatientWithLongWait[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [serviceConfigs, setServiceConfigs] = useState<ServiceConfig[]>([]);
  const [consultorioNames, setConsultorioNames] = useState<string[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [selectedServiceForModuleMgmt, setSelectedServiceForModuleMgmt] = useState<string>("");
  const [newModuleName, setNewModuleName] = useState("");
  const [newConsultorioName, setNewConsultorioName] = useState("");


  // Map Firestore data to frontend usable ServiceDefinitionFront
  const editableServices: ServiceDefinitionFront[] = useMemo(() => {
    return serviceConfigs.map(sc => ({
      ...sc,
      value: sc.id, // 'id' from Firestore is 'value' for Select
      icon: serviceIconMap[sc.iconName] || DefaultServiceIcon,
    }));
  }, [serviceConfigs]);


  const fetchAppConfiguration = useCallback(async () => {
    setIsLoadingConfig(true);
    try {
      // Fetch Service Configurations
      const serviceSnapshot = await getDocs(collection(db, SERVICE_CONFIG_COLLECTION));
      if (serviceSnapshot.empty) {
        // If Firestore is empty, use static defaults and offer to save them
        toast({ title: "Configuración Inicial", description: "No se encontró configuración de servicios en Firestore. Usando valores por defecto. Guarde para persistir.", duration: 7000});
        const initialServicesFromStatic = DEFAULT_SERVICES_STATIC.map(s => ({
          id: s.value,
          label: s.label,
          // Find icon name string from map key by component (this is a bit reverse, better to store name)
          iconName: Object.keys(serviceIconMap).find(key => serviceIconMap[key] === s.icon) || "Settings",
          prefix: s.prefix,
          modules: [...s.modules],
        }));
        setServiceConfigs(initialServicesFromStatic);
      } else {
        const servicesData = serviceSnapshot.docs.map(doc => doc.data() as ServiceConfig);
        setServiceConfigs(servicesData);
      }

      // Fetch Consultorio Configurations
      const consultorioDocRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
      const consultorioDocSnap = await getDoc(consultorioDocRef);
      if (consultorioDocSnap.exists()) {
        setConsultorioNames((consultorioDocSnap.data() as ConsultorioConfig).names);
      } else {
         toast({ title: "Configuración Inicial", description: "No se encontró configuración de consultorios en Firestore. Usando valores por defecto. Guarde para persistir.", duration: 7000});
        setConsultorioNames([...DEFAULT_CONSULTORIOS_STATIC]);
      }
    } catch (error) {
      console.error("Error fetching app configuration:", error);
      toast({ title: "Error de Configuración", description: "No se pudo cargar la configuración de servicios/consultorios.", variant: "destructive" });
      // Fallback to static if DB fetch fails
      setServiceConfigs(DEFAULT_SERVICES_STATIC.map(s => ({
        id: s.value, label: s.label, iconName: Object.keys(serviceIconMap).find(key => serviceIconMap[key] === s.icon) || "Settings", prefix: s.prefix, modules: [...s.modules]
      })));
      setConsultorioNames([...DEFAULT_CONSULTORIOS_STATIC]);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

  useEffect(() => {
    if (currentUser?.email === ADMIN_EMAIL) {
      fetchAppConfiguration();
    }
  }, [currentUser, fetchAppConfiguration]);


  const createUserForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentUser?.email !== ADMIN_EMAIL) {
      setPatientsWithLongWait([]);
      return;
    }
    const q = query(collection(db, "turns"), or(where("status", "==", "pending"), where("status", "==", "waiting_doctor")));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const now = Date.now();
      const longWaitList: PatientWithLongWait[] = [];
      querySnapshot.forEach((doc) => {
        const turn = { id: doc.id, ...doc.data() } as Turn;
        let thresholdMs: number;
        let referenceTimeMs: number | undefined;
        let waitType: 'ventanilla' | 'medico' = 'ventanilla';

        if (turn.status === "pending" && turn.requestedAt) {
          thresholdMs = MAX_WAIT_TIME_PENDING_MINUTES * 60 * 1000;
          referenceTimeMs = turn.requestedAt.toMillis();
          waitType = 'ventanilla';
        } else if (turn.status === "waiting_doctor" && turn.completedAt) {
          thresholdMs = MAX_WAIT_TIME_DOCTOR_MINUTES * 60 * 1000;
          referenceTimeMs = turn.completedAt.toMillis();
          waitType = 'medico';
        } else {
          return;
        }
        if (referenceTimeMs) {
          const waitTimeMs = now - referenceTimeMs;
          if (waitTimeMs > thresholdMs) {
            const duration = intervalToDuration({ start: 0, end: waitTimeMs });
            const formattedWaitTime = `${duration.hours ? duration.hours + 'h ' : ''}${duration.minutes}m ${duration.seconds}s`;
            longWaitList.push({ ...turn, currentWaitTime: formattedWaitTime, waitType });
          }
        }
      });
      setPatientsWithLongWait(longWaitList.sort((a, b) => (b.requestedAt.toMillis() || 0) - (a.requestedAt.toMillis() || 0)));
    }, (error) => {
      console.error("Error fetching turns for long wait alert:", error);
      toast({ title: "Error de Carga", description: "No se pudieron cargar los turnos para alertas de espera.", variant: "destructive" });
    });
    return () => unsubscribe();
  }, [currentUser, toast]);

  const calculateDynamicWaitTime = (turn: Turn, waitType: 'ventanilla' | 'medico'): string => {
    const now = currentTime.getTime();
    let referenceTimeMs: number | undefined;
    if (waitType === 'ventanilla' && turn.requestedAt) referenceTimeMs = turn.requestedAt.toMillis();
    else if (waitType === 'medico' && turn.completedAt) referenceTimeMs = turn.completedAt.toMillis();
    if (!referenceTimeMs) return "N/A";
    const waitTimeMs = Math.max(0, now - referenceTimeMs);
    const duration = intervalToDuration({ start: 0, end: waitTimeMs });
    return `${duration.hours ? duration.hours + 'h ' : ''}${duration.minutes || 0}m ${duration.seconds || 0}s`;
  };

  const handleCreateUser = async (data: CreateUserFormValues) => {
    setIsCreatingUser(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: data.displayName });
      }
      toast({
        title: "Usuario Profesional Creado",
        description: `El usuario ${data.displayName} (${data.email}) ha sido creado. El nuevo profesional está ahora conectado. Para crear otro usuario, el administrador debe volver a iniciar sesión.`,
        duration: 8000,
      });
      createUserForm.reset();
    } catch (err: any) {
      console.error("Error creating user:", err);
      let friendlyMessage = "Ocurrió un error al crear el usuario.";
      if (err.code === 'auth/email-already-in-use') friendlyMessage = `El correo electrónico '${data.email}' ya está en uso.`;
      else if (err.code === 'auth/weak-password') friendlyMessage = "La contraseña es demasiado débil.";
      else if (err.code === 'auth/operation-not-allowed') friendlyMessage = "La creación de usuarios con correo/contraseña no está habilitada. Revise la configuración de 'Sign-in method' en su Firebase Console.";
      toast({ title: "Error de Creación", description: friendlyMessage, variant: "destructive" });
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Sesión Cerrada", description: "Has cerrado sesión exitosamente." });
    } catch (error) {
      console.error("Error signing out: ", error);
      toast({ title: "Error al Salir", description: "No se pudo cerrar la sesión.", variant: "destructive" });
    }
  };

  // Module Management Functions
  const handleAddModule = async () => {
    if (!newModuleName.trim() || !selectedServiceForModuleMgmt) return;
    const serviceId = selectedServiceForModuleMgmt; // selectedServiceForModuleMgmt is the service ID

    const serviceRef = doc(db, SERVICE_CONFIG_COLLECTION, serviceId);
    try {
      await updateDoc(serviceRef, {
        modules: arrayUnion(newModuleName.trim())
      });
      setServiceConfigs(prevConfigs =>
        prevConfigs.map(sc =>
          sc.id === serviceId
            ? { ...sc, modules: [...sc.modules, newModuleName.trim()] }
            : sc
        )
      );
      setNewModuleName("");
      toast({ title: "Módulo Añadido", description: `Módulo "${newModuleName.trim()}" añadido a ${serviceConfigs.find(s => s.id === serviceId)?.label} y guardado en Firestore.` });
    } catch (error) {
      console.error("Error adding module to Firestore:", error);
      toast({ title: "Error al Guardar", description: "No se pudo añadir el módulo a Firestore.", variant: "destructive" });
    }
  };

  const handleRemoveModule = async (serviceValue: string, moduleNameToRemove: string) => {
     const serviceId = serviceValue;
     const serviceRef = doc(db, SERVICE_CONFIG_COLLECTION, serviceId);
    try {
      await updateDoc(serviceRef, {
        modules: arrayRemove(moduleNameToRemove)
      });
      setServiceConfigs(prevConfigs =>
        prevConfigs.map(sc =>
          sc.id === serviceId
            ? { ...sc, modules: sc.modules.filter(m => m !== moduleNameToRemove) }
            : sc
        )
      );
      toast({ title: "Módulo Eliminado", description: `Módulo "${moduleNameToRemove}" eliminado de ${serviceConfigs.find(s => s.id === serviceId)?.label} y guardado en Firestore.` });
    } catch (error) {
      console.error("Error removing module from Firestore:", error);
      toast({ title: "Error al Guardar", description: "No se pudo eliminar el módulo de Firestore.", variant: "destructive" });
    }
  };

  // Consultorio Management Functions
  const handleAddConsultorio = async () => {
    if (!newConsultorioName.trim()) return;
    const consultorioDocRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
    try {
      // Ensure document exists before trying to update array, or use setDoc with merge
      const currentConfigSnap = await getDoc(consultorioDocRef);
      if (currentConfigSnap.exists()) {
        await updateDoc(consultorioDocRef, {
          names: arrayUnion(newConsultorioName.trim())
        });
      } else {
        await setDoc(consultorioDocRef, { id: CONSULTORIOS_DOC_ID, names: [newConsultorioName.trim()] });
      }
      setConsultorioNames(prev => [...prev, newConsultorioName.trim()]);
      setNewConsultorioName("");
      toast({ title: "Consultorio Añadido", description: `Consultorio "${newConsultorioName.trim()}" añadido y guardado en Firestore.` });
    } catch (error) {
       console.error("Error adding consultorio to Firestore:", error);
       toast({ title: "Error al Guardar", description: "No se pudo añadir el consultorio a Firestore.", variant: "destructive" });
    }
  };

  const handleRemoveConsultorio = async (consultorioNameToRemove: string) => {
    const consultorioDocRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
    try {
      await updateDoc(consultorioDocRef, {
          names: arrayRemove(consultorioNameToRemove)
      });
      setConsultorioNames(prev => prev.filter(c => c !== consultorioNameToRemove));
      toast({ title: "Consultorio Eliminado", description: `Consultorio "${consultorioNameToRemove}" eliminado y guardado en Firestore.` });
    } catch (error) {
       console.error("Error removing consultorio from Firestore:", error);
       toast({ title: "Error al Guardar", description: "No se pudo eliminar el consultorio de Firestore.", variant: "destructive" });
    }
  };
  
  // Initial Save of Default Config to Firestore (if empty)
  const handleInitialSaveConfig = async () => {
    const batch = writeBatch(db);

    // Services
    const servicesFromStatic = DEFAULT_SERVICES_STATIC.map(s => ({
      id: s.value,
      label: s.label,
      iconName: Object.keys(serviceIconMap).find(key => serviceIconMap[key] === s.icon) || "Settings",
      prefix: s.prefix,
      modules: [...s.modules],
    }));

    servicesFromStatic.forEach(serviceConfig => {
      const serviceRef = doc(db, SERVICE_CONFIG_COLLECTION, serviceConfig.id);
      batch.set(serviceRef, serviceConfig);
    });
    
    // Consultorios
    const consultorioConfig: ConsultorioConfig = {
      id: CONSULTORIOS_DOC_ID,
      names: [...DEFAULT_CONSULTORIOS_STATIC]
    };
    const consultorioRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
    batch.set(consultorioRef, consultorioConfig);

    try {
      await batch.commit();
      toast({ title: "Configuración Guardada", description: "La configuración por defecto ha sido guardada en Firestore." });
      // Re-fetch to ensure UI is in sync with DB
      await fetchAppConfiguration();
    } catch (error) {
      console.error("Error saving initial config to Firestore:", error);
      toast({ title: "Error al Guardar Config.", description: "No se pudo guardar la configuración inicial en Firestore.", variant: "destructive" });
    }
  };


  const currentModulesForSelectedService = useMemo(() => {
    // Use serviceConfigs which is ServiceConfig[] (data from DB or initial static)
    return serviceConfigs.find(s => s.id === selectedServiceForModuleMgmt)?.modules || [];
  }, [serviceConfigs, selectedServiceForModuleMgmt]);


  if (authLoading || isLoadingConfig) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-secondary/30">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">
          {authLoading ? "Verificando acceso..." : "Cargando configuración..."}
        </p>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-destructive/10 via-background to-background">
        <Card className="w-full max-w-md shadow-2xl text-center">
          <CardHeader className="bg-destructive text-destructive-foreground p-6 rounded-t-lg">
            <div className="flex flex-col items-center mb-4">
              <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority data-ai-hint="hospital logo" />
            </div>
            <AlertTriangle className="mx-auto h-12 w-12 mb-2" />
            <CardTitle className="text-2xl font-bold">Acceso Denegado</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-lg text-foreground">Debe iniciar sesión como administrador para acceder a esta sección.</p>
            <Button onClick={() => router.push('/login')} className="w-full">
              <LogIn className="mr-2 h-5 w-5" /> Ir a Inicio de Sesión
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (currentUser.email !== ADMIN_EMAIL) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-destructive/10 via-background to-background">
        <Card className="w-full max-w-md shadow-2xl text-center">
          <CardHeader className="bg-destructive text-destructive-foreground p-6 rounded-t-lg">
            <div className="flex flex-col items-center mb-4">
              <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority data-ai-hint="hospital logo" />
            </div>
            <ShieldCheck className="mx-auto h-12 w-12 mb-2" />
            <CardTitle className="text-2xl font-bold">Acceso Denegado</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-2">
            <p className="text-lg text-foreground">No tiene permisos para acceder a esta sección.</p>
            <p className="text-sm text-muted-foreground">Esta área es solo para administradores autorizados ({ADMIN_EMAIL}).</p>
            <p className="text-sm text-muted-foreground mt-2">Usuario conectado: {currentUser.email}</p>
            <Button onClick={handleLogout} variant="outline" className="mt-4">
              <LogOut className="mr-2 h-4 w-4" /> Cerrar Sesión Actual
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="w-full max-w-5xl space-y-8">
        <Card className="w-full shadow-xl">
            <CardHeader className="text-center bg-primary/10 p-6 rounded-t-lg">
                <div className="flex justify-center mb-4">
                    <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} data-ai-hint="hospital logo" />
                </div>
                <div className="flex items-center justify-between w-full mb-4">
                    <div className="flex items-center gap-2">
                        <UserCircle2 className="h-7 w-7 text-primary" />
                        <p className="text-xs text-muted-foreground">Admin: {currentUser.email}</p>
                    </div>
                    <Button onClick={handleLogout} variant="outline" size="sm" className="text-xs">
                        <LogOut className="mr-1 h-4 w-4" /> Salir
                    </Button>
                </div>
                <CardTitle className="text-3xl font-bold text-primary">Panel de Administración</CardTitle>
                <CardDescription className="text-muted-foreground pt-1">
                    Gestione usuarios, monitoree tiempos de espera y configure el sistema.
                </CardDescription>
                 <div className="mt-4">
                    <Button onClick={handleInitialSaveConfig} variant="outline" size="sm">
                        Inicializar/Restablecer Configuración en DB
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                        (Use esto si la configuración en Firestore está vacía o para restaurar los valores por defecto de los archivos).
                    </p>
                </div>
            </CardHeader>
             <CardContent className="p-0 sm:p-2 md:p-4">
                <Tabs defaultValue="crear-usuario" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto md:h-12">
                    <TabsTrigger value="crear-usuario" className="py-2 text-xs sm:text-sm"><UserPlus className="mr-1 h-4 w-4"/>Crear Usuarios</TabsTrigger>
                    <TabsTrigger value="espera-prolongada" className="py-2 text-xs sm:text-sm"><AlarmClock className="mr-1 h-4 w-4"/>Espera Prolongada</TabsTrigger>
                    <TabsTrigger value="gestionar-ventanillas" className="py-2 text-xs sm:text-sm"><Settings2 className="mr-1 h-4 w-4"/>Ventanillas</TabsTrigger>
                    <TabsTrigger value="gestionar-consultorios" className="py-2 text-xs sm:text-sm"><Hospital className="mr-1 h-4 w-4"/>Consultorios</TabsTrigger>
                  </TabsList>

                  <TabsContent value="crear-usuario" className="p-4 md:p-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserPlus className="h-6 w-6" />Crear Usuario Profesional</CardTitle>
                        <CardDescription>Ingrese los datos para el nuevo profesional.</CardDescription>
                      </CardHeader>
                      <Form {...createUserForm}>
                        <form onSubmit={createUserForm.handleSubmit(handleCreateUser)}>
                          <CardContent className="space-y-6">
                            <FormField control={createUserForm.control} name="displayName" render={({ field }) => (
                                <FormItem>
                                  <Label htmlFor="prof-displayName">Nombre del Profesional</Label>
                                  <FormControl><Input id="prof-displayName" placeholder="Ej: Dr. Juan Pérez" {...field} className="text-base h-11" /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField control={createUserForm.control} name="email" render={({ field }) => (
                                <FormItem>
                                  <Label htmlFor="prof-email">Correo Electrónico</Label>
                                  <FormControl><Input id="prof-email" type="email" placeholder="ej: medico.juan@hospital.com" {...field} className="text-base h-11" /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField control={createUserForm.control} name="password" render={({ field }) => (
                                <FormItem>
                                  <Label htmlFor="prof-password">Contraseña</Label>
                                  <FormControl><Input id="prof-password" type="password" placeholder="••••••••" {...field} className="text-base h-11" /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </CardContent>
                          <CardFooter>
                            <Button type="submit" className="w-full text-lg py-3" disabled={isCreatingUser}>
                              {isCreatingUser ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}
                              {isCreatingUser ? "Creando..." : "Crear Profesional"}
                            </Button>
                          </CardFooter>
                        </form>
                      </Form>
                    </Card>
                  </TabsContent>

                  <TabsContent value="espera-prolongada" className="p-4 md:p-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive"><AlarmClock className="h-6 w-6" />Pacientes con Espera Prolongada</CardTitle>
                        <CardDescription className="text-destructive/80">
                          Pacientes esperando más de {MAX_WAIT_TIME_PENDING_MINUTES} min (ventanilla) o {MAX_WAIT_TIME_DOCTOR_MINUTES} min (médico).
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {patientsWithLongWait.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4">No hay pacientes con espera prolongada.</p>
                        ) : (
                          <ul className="space-y-4 max-h-[500px] overflow-y-auto">
                            {patientsWithLongWait.map((turn) => (
                              <li key={turn.id} className="p-4 border rounded-lg shadow-sm bg-card hover:bg-secondary/20">
                                <div className="flex flex-col sm:flex-row justify-between items-start">
                                  <div>
                                    <p className="text-lg font-semibold text-primary">{turn.turnNumber}</p>
                                    <p className="text-sm text-foreground">{turn.patientName || `ID: ${turn.patientId}`}</p>
                                    <p className="text-xs text-muted-foreground">Servicio: {turn.service}</p>
                                    <p className="text-xs text-muted-foreground">Esperando para: <span className="font-medium">{turn.waitType === 'ventanilla' ? 'Ventanilla' : 'Médico'}</span></p>
                                  </div>
                                  <div className="text-right mt-2 sm:mt-0">
                                    <p className="text-lg font-bold text-destructive">{calculateDynamicWaitTime(turn, turn.waitType)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {turn.waitType === 'ventanilla' && turn.requestedAt ? `Solicitado: ${formatDistanceToNowStrict(turn.requestedAt.toDate(), { addSuffix: true, locale: es })}` 
                                                                      : (turn.completedAt ? `Facturación Completada: ${formatDistanceToNowStrict(turn.completedAt.toDate(), { addSuffix: true, locale: es })}` : '')}
                                    </p>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="gestionar-ventanillas" className="p-4 md:p-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings2 className="h-6 w-6" />Gestionar Ventanillas por Servicio</CardTitle>
                        <CardDescription>
                          Añada o elimine ventanillas para cada servicio. Los cambios se guardan en Firestore.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <Label htmlFor="select-service-module">Seleccionar Servicio</Label>
                          <Select value={selectedServiceForModuleMgmt} onValueChange={setSelectedServiceForModuleMgmt}>
                            <SelectTrigger id="select-service-module" className="h-11">
                              <SelectValue placeholder="Seleccione un servicio" />
                            </SelectTrigger>
                            <SelectContent>
                              {editableServices.map(service => ( // Use editableServices (ServiceDefinitionFront)
                                <SelectItem key={service.value} value={service.value}>{service.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedServiceForModuleMgmt && (
                          <div>
                            <h4 className="font-medium mb-2">Ventanillas para {editableServices.find(s=>s.value === selectedServiceForModuleMgmt)?.label}:</h4>
                            {currentModulesForSelectedService.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No hay ventanillas definidas para este servicio.</p>
                            ) : (
                                <ul className="space-y-2 border rounded-md p-3 max-h-60 overflow-y-auto">
                                {currentModulesForSelectedService.map(moduleName => (
                                    <li key={moduleName} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                                    <span>{moduleName}</span>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Confirmar Eliminación</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                ¿Está seguro que desea eliminar la ventanilla "{moduleName}"? Este cambio se guardará en Firestore.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleRemoveModule(selectedServiceForModuleMgmt, moduleName)} className="bg-destructive hover:bg-destructive/90">
                                                Eliminar
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    </li>
                                ))}
                                </ul>
                            )}
                            <div className="mt-4 flex gap-2">
                              <Input
                                type="text"
                                placeholder="Nueva ventanilla"
                                value={newModuleName}
                                onChange={(e) => setNewModuleName(e.target.value)}
                                className="h-11"
                              />
                              <Button onClick={handleAddModule} disabled={!newModuleName.trim()} className="h-11">
                                <PlusCircle className="mr-2 h-4 w-4"/> Añadir
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="gestionar-consultorios" className="p-4 md:p-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Hospital className="h-6 w-6" />Gestionar Consultorios Médicos</CardTitle>
                        <CardDescription>
                          Añada o elimine consultorios médicos. Los cambios se guardan en Firestore.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                         {consultorioNames.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay consultorios definidos.</p>
                          ) : (
                            <ul className="space-y-2 border rounded-md p-3 max-h-72 overflow-y-auto">
                            {consultorioNames.map(consultorioName => (
                                <li key={consultorioName} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                                <span>{consultorioName}</span>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Eliminación</AlertDialogTitle>
                                            <AlertDialogDescription>
                                            ¿Está seguro que desea eliminar el consultorio "{consultorioName}"? Este cambio se guardará en Firestore.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleRemoveConsultorio(consultorioName)} className="bg-destructive hover:bg-destructive/90">
                                            Eliminar
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                </li>
                            ))}
                            </ul>
                        )}
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Nuevo consultorio"
                            value={newConsultorioName}
                            onChange={(e) => setNewConsultorioName(e.target.value)}
                            className="h-11"
                          />
                          <Button onClick={handleAddConsultorio} disabled={!newConsultorioName.trim()} className="h-11">
                            <PlusCircle className="mr-2 h-4 w-4"/> Añadir
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground mt-6 text-center max-w-md">
          **Nota:** Al crear un usuario, ese nuevo usuario profesional será conectado automáticamente en esta sesión del navegador.
          Para crear múltiples usuarios como admin, deberá cerrar la sesión del profesional recién creado y volver a ingresar como <span className="font-semibold">{ADMIN_EMAIL}</span>.
        </p>
      </div>
    </main>
  );
}
