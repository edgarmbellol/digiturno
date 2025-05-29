
"use client";

import { useState, useEffect, useMemo, useCallback }
from "react";
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
import { UserPlus, ShieldCheck, AlertTriangle, LogIn, UserCircle2, Hourglass, LogOut, AlarmClock, Settings2, Hospital, Trash2, PlusCircle, Loader2, ClipboardList, PlayCircle, CheckCircle2, UserX, Cog } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { Turn } from "@/types/turn";
import { formatDistanceToNowStrict, intervalToDuration, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { AVAILABLE_SERVICES as DEFAULT_SERVICES_STATIC } from "@/lib/services";
import { AVAILABLE_CONSULTORIOS as DEFAULT_CONSULTORIOS_STATIC } from "@/lib/consultorios";
import type { ServiceConfig, ConsultorioConfig, ServiceDefinitionFront } from "@/config/appConfigTypes";
import { serviceIconMap, DefaultServiceIcon } from "@/lib/iconMapping";

const ADMIN_EMAIL = "edgarmbellol@gmail.com";

// Default values, will be overridden by Firestore config if available
const DEFAULT_MAX_WAIT_TIME_PENDING_MINUTES = 15;
const DEFAULT_MAX_WAIT_TIME_DOCTOR_MINUTES = 30;

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

interface TurnStats {
  totalToday: number;
  pendingNow: number;
  inProgressNow: number;
  completedToday: number;
  missedToday: number;
}

interface AlertThresholds {
  maxWaitTimePendingMinutes: number;
  maxWaitTimeDoctorMinutes: number;
}

const SERVICE_CONFIG_COLLECTION = "service_configurations";
const APP_CONFIG_COLLECTION = "app_configurations";
const CONSULTORIOS_DOC_ID = "main_consultorios_config";
const ALERT_THRESHOLDS_DOC_ID = "alert_thresholds";


export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, isLoading: authLoading } = useAuth();

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [patientsWithLongWait, setPatientsWithLongWait] = useState<PatientWithLongWait[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [serviceConfigs, setServiceConfigs] = useState<ServiceConfig[]>([]);
  const [consultorioNames, setConsultorioNames] = useState<string[]>([]);
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>({
    maxWaitTimePendingMinutes: DEFAULT_MAX_WAIT_TIME_PENDING_MINUTES,
    maxWaitTimeDoctorMinutes: DEFAULT_MAX_WAIT_TIME_DOCTOR_MINUTES,
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isLoadingAlertConfig, setIsLoadingAlertConfig] = useState(true);

  const [selectedServiceForModuleMgmt, setSelectedServiceForModuleMgmt] = useState<string>("");
  const [newModuleName, setNewModuleName] = useState("");
  const [newConsultorioName, setNewConsultorioName] = useState("");

  const [turnStats, setTurnStats] = useState<TurnStats>({
    totalToday: 0,
    pendingNow: 0,
    inProgressNow: 0,
    completedToday: 0,
    missedToday: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [editablePendingThreshold, setEditablePendingThreshold] = useState(DEFAULT_MAX_WAIT_TIME_PENDING_MINUTES.toString());
  const [editableDoctorThreshold, setEditableDoctorThreshold] = useState(DEFAULT_MAX_WAIT_TIME_DOCTOR_MINUTES.toString());
  const [isSavingAlertConfig, setIsSavingAlertConfig] = useState(false);


  // Map Firestore data to frontend usable ServiceDefinitionFront
  const editableServices: ServiceDefinitionFront[] = useMemo(() => {
    return serviceConfigs.map(sc => ({
      id: sc.id,
      value: sc.id,
      label: sc.label,
      icon: serviceIconMap[sc.iconName] || DefaultServiceIcon,
      prefix: sc.prefix,
      modules: sc.modules,
    }));
  }, [serviceConfigs]);


  const fetchAppConfiguration = useCallback(async () => {
    setIsLoadingConfig(true);
    try {
      // Fetch Service Configurations
      const serviceSnapshot = await getDocs(collection(db, SERVICE_CONFIG_COLLECTION));
      if (serviceSnapshot.empty) {
        toast({ title: "Configuración de Servicios Vacía", description: "No se encontró configuración de servicios en Firestore. Puede inicializarla con valores por defecto.", duration: 7000 });
        setServiceConfigs([]);
      } else {
        const servicesData = serviceSnapshot.docs.map(doc => doc.data() as ServiceConfig);
        setServiceConfigs(servicesData);
      }

      // Fetch Consultorio Configurations
      const consultorioDocRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
      const consultorioDocSnap = await getDoc(consultorioDocRef);
      if (consultorioDocSnap.exists()) {
        const consultorioData = consultorioDocSnap.data() as ConsultorioConfig;
        setConsultorioNames(consultorioData.names || []);
      } else {
        toast({ title: "Configuración de Consultorios Vacía", description: "No se encontró configuración de consultorios en Firestore. Puede inicializarla con valores por defecto.", duration: 7000 });
        setConsultorioNames([]);
      }
    } catch (error) {
      console.error("Error fetching app configuration:", error);
      toast({ title: "Error de Configuración", description: "No se pudo cargar la configuración de la base de datos.", variant: "destructive" });
      setServiceConfigs([]);
      setConsultorioNames([]);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

  const fetchAlertThresholds = useCallback(async () => {
    setIsLoadingAlertConfig(true);
    try {
      const thresholdsDocRef = doc(db, APP_CONFIG_COLLECTION, ALERT_THRESHOLDS_DOC_ID);
      const thresholdsDocSnap = await getDoc(thresholdsDocRef);
      if (thresholdsDocSnap.exists()) {
        const data = thresholdsDocSnap.data() as AlertThresholds;
        setAlertThresholds(data);
        setEditablePendingThreshold(data.maxWaitTimePendingMinutes.toString());
        setEditableDoctorThreshold(data.maxWaitTimeDoctorMinutes.toString());
      } else {
        setAlertThresholds({
            maxWaitTimePendingMinutes: DEFAULT_MAX_WAIT_TIME_PENDING_MINUTES,
            maxWaitTimeDoctorMinutes: DEFAULT_MAX_WAIT_TIME_DOCTOR_MINUTES,
        });
        setEditablePendingThreshold(DEFAULT_MAX_WAIT_TIME_PENDING_MINUTES.toString());
        setEditableDoctorThreshold(DEFAULT_MAX_WAIT_TIME_DOCTOR_MINUTES.toString());
        toast({ title: "Configuración de Alertas por Defecto", description: "No se encontró config. de umbrales de alerta en Firestore. Usando valores por defecto. Puede guardarlos para crearlos.", duration: 5000});
      }
    } catch (error) {
      console.error("Error fetching alert thresholds:", error);
      toast({ title: "Error en Umbrales", description: "No se pudo cargar la configuración de umbrales de alerta.", variant: "destructive" });
    } finally {
      setIsLoadingAlertConfig(false);
    }
  }, [toast]);


  useEffect(() => {
    if (currentUser?.email === ADMIN_EMAIL) {
      fetchAppConfiguration();
      fetchAlertThresholds();
    }
  }, [currentUser, fetchAppConfiguration, fetchAlertThresholds]);

  // Fetch Turn Statistics
  useEffect(() => {
    if (currentUser?.email !== ADMIN_EMAIL) {
      setTurnStats({ totalToday: 0, pendingNow: 0, inProgressNow: 0, completedToday: 0, missedToday: 0 });
      setIsLoadingStats(false);
      return;
    }
    setIsLoadingStats(true);

    const todayStart = Timestamp.fromDate(startOfDay(new Date()));
    const todayEnd = Timestamp.fromDate(endOfDay(new Date()));

    const q = query(collection(db, "turns")); // Query all turns first

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let totalTodayCount = 0;
      let pendingNowCount = 0;
      let inProgressNowCount = 0;
      let completedTodayCount = 0;
      let missedTodayCount = 0;

      querySnapshot.forEach((docSnap) => {
        const turn = docSnap.data() as Turn;
        const requestedAtDate = turn.requestedAt.toDate();

        // For "Today" stats
        if (requestedAtDate >= todayStart.toDate() && requestedAtDate <= todayEnd.toDate()) {
          totalTodayCount++;
          if (turn.status === 'completed' || turn.status === 'completed_by_doctor') {
            completedTodayCount++;
          }
          if (turn.status === 'missed' || turn.status === 'missed_by_doctor') {
            missedTodayCount++;
          }
        }

        // For "Now" stats
        if (turn.status === 'pending') {
          pendingNowCount++;
        }
        if (turn.status === 'called' || turn.status === 'called_by_doctor') {
          inProgressNowCount++;
        }
      });

      setTurnStats({
        totalToday: totalTodayCount,
        pendingNow: pendingNowCount,
        inProgressNow: inProgressNowCount,
        completedToday: completedTodayCount,
        missedToday: missedTodayCount,
      });
      setIsLoadingStats(false);
    }, (error) => {
      console.error("Error fetching turn statistics:", error);
      toast({ title: "Error de Estadísticas", description: "No se pudieron cargar las estadísticas de turnos.", variant: "destructive" });
      setIsLoadingStats(false);
    });

    return () => unsubscribe();
  }, [currentUser, toast]);


  const createUserForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentUser?.email !== ADMIN_EMAIL || isLoadingAlertConfig) {
      setPatientsWithLongWait([]);
      return;
    }
    const qTurnsAlert = query(collection(db, "turns"), or(where("status", "==", "pending"), where("status", "==", "waiting_doctor")));
    const unsubscribeAlerts = onSnapshot(qTurnsAlert, (querySnapshot) => {
      const now = Date.now();
      const longWaitList: PatientWithLongWait[] = [];
      querySnapshot.forEach((docSnap) => {
        const turn = { id: docSnap.id, ...docSnap.data() } as Turn;
        let thresholdMs: number;
        let referenceTimeMs: number | undefined;
        let waitType: 'ventanilla' | 'medico' = 'ventanilla';

        if (turn.status === "pending" && turn.requestedAt) {
          thresholdMs = alertThresholds.maxWaitTimePendingMinutes * 60 * 1000;
          referenceTimeMs = turn.requestedAt.toMillis();
          waitType = 'ventanilla';
        } else if (turn.status === "waiting_doctor" && turn.completedAt) {
          thresholdMs = alertThresholds.maxWaitTimeDoctorMinutes * 60 * 1000;
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
    return () => unsubscribeAlerts();
  }, [currentUser, toast, alertThresholds, isLoadingAlertConfig]);

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
    const serviceId = selectedServiceForModuleMgmt;
    const serviceRef = doc(db, SERVICE_CONFIG_COLLECTION, serviceId);

    try {
      await setDoc(serviceRef, {
        modules: arrayUnion(newModuleName.trim())
      }, { merge: true });

      const currentService = serviceConfigs.find(s => s.id === serviceId);
      if (currentService) {
        setServiceConfigs(prevConfigs =>
          prevConfigs.map(sc =>
            sc.id === serviceId
              ? { ...sc, modules: [...(sc.modules || []), newModuleName.trim()].sort() }
              : sc
          )
        );
      } else {
        // If the service doc didn't exist, it was created by setDoc. 
        // We should fetch to get the full config object if needed elsewhere, or ensure defaults.
        // For simplicity now, we assume if it wasn't found, it only has `modules`. 
        // Better: call fetchAppConfiguration() to re-sync.
        await fetchAppConfiguration();
      }

      setNewModuleName("");
      toast({ title: "Módulo Añadido", description: `Módulo "${newModuleName.trim()}" añadido a ${serviceConfigs.find(s => s.id === serviceId)?.label || serviceId} y guardado en Firestore.` });
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
            ? { ...sc, modules: sc.modules.filter(m => m !== moduleNameToRemove).sort() }
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
      await setDoc(consultorioDocRef, {
        id: CONSULTORIOS_DOC_ID,
        names: arrayUnion(newConsultorioName.trim())
      }, { merge: true });

      setConsultorioNames(prev => {
        const newNames = [...prev, newConsultorioName.trim()];
        return Array.from(new Set(newNames)).sort();
      });
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
      setConsultorioNames(prev => prev.filter(c => c !== consultorioNameToRemove).sort());
      toast({ title: "Consultorio Eliminado", description: `Consultorio "${consultorioNameToRemove}" eliminado y guardado en Firestore.` });
    } catch (error) {
      console.error("Error removing consultorio from Firestore:", error);
      toast({ title: "Error al Guardar", description: "No se pudo eliminar el consultorio de Firestore.", variant: "destructive" });
    }
  };

  const handleInitialSaveConfig = async () => {
    setIsLoadingConfig(true);
    const batch = writeBatch(db);

    const servicesFromStatic: ServiceConfig[] = DEFAULT_SERVICES_STATIC.map(s => ({
      id: s.value,
      label: s.label,
      iconName: Object.keys(serviceIconMap).find(key => serviceIconMap[key] === s.icon) || "Settings",
      prefix: s.prefix,
      modules: [...s.modules].sort(),
    }));

    servicesFromStatic.forEach(serviceConfig => {
      const serviceRef = doc(db, SERVICE_CONFIG_COLLECTION, serviceConfig.id);
      batch.set(serviceRef, serviceConfig);
    });

    const consultorioConfig: ConsultorioConfig = {
      id: CONSULTORIOS_DOC_ID,
      names: [...DEFAULT_CONSULTORIOS_STATIC].sort()
    };
    const consultorioRef = doc(db, APP_CONFIG_COLLECTION, CONSULTORIOS_DOC_ID);
    batch.set(consultorioRef, consultorioConfig);
    
    // Also save default alert thresholds
    const defaultAlerts: AlertThresholds = {
        maxWaitTimePendingMinutes: DEFAULT_MAX_WAIT_TIME_PENDING_MINUTES,
        maxWaitTimeDoctorMinutes: DEFAULT_MAX_WAIT_TIME_DOCTOR_MINUTES,
    };
    const alertThresholdsRef = doc(db, APP_CONFIG_COLLECTION, ALERT_THRESHOLDS_DOC_ID);
    batch.set(alertThresholdsRef, defaultAlerts);


    try {
      await batch.commit();
      toast({ title: "Configuración Guardada", description: "La configuración por defecto ha sido guardada en Firestore." });
      await fetchAppConfiguration();
      await fetchAlertThresholds();
    } catch (error) {
      console.error("Error saving initial config to Firestore:", error);
      toast({ title: "Error al Guardar Config.", description: "No se pudo guardar la configuración inicial en Firestore.", variant: "destructive" });
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleSaveAlertThresholds = async () => {
    const pendingMinutes = parseInt(editablePendingThreshold, 10);
    const doctorMinutes = parseInt(editableDoctorThreshold, 10);

    if (isNaN(pendingMinutes) || pendingMinutes < 0 || isNaN(doctorMinutes) || doctorMinutes < 0) {
        toast({ title: "Valores Inválidos", description: "Los tiempos de espera deben ser números positivos.", variant: "destructive" });
        return;
    }
    setIsSavingAlertConfig(true);
    const newThresholds: AlertThresholds = {
        maxWaitTimePendingMinutes: pendingMinutes,
        maxWaitTimeDoctorMinutes: doctorMinutes,
    };
    try {
        const thresholdsDocRef = doc(db, APP_CONFIG_COLLECTION, ALERT_THRESHOLDS_DOC_ID);
        await setDoc(thresholdsDocRef, newThresholds, { merge: true }); // merge:true to create if not exists
        setAlertThresholds(newThresholds);
        toast({ title: "Umbrales Guardados", description: "Los umbrales de alerta de espera han sido actualizados en Firestore." });
    } catch (error) {
        console.error("Error saving alert thresholds:", error);
        toast({ title: "Error al Guardar", description: "No se pudieron guardar los umbrales de alerta.", variant: "destructive" });
    } finally {
        setIsSavingAlertConfig(false);
    }
  };


  const currentModulesForSelectedService = useMemo(() => {
    return serviceConfigs.find(s => s.id === selectedServiceForModuleMgmt)?.modules.sort() || [];
  }, [serviceConfigs, selectedServiceForModuleMgmt]);


  if (authLoading || (currentUser?.email === ADMIN_EMAIL && (isLoadingConfig || isLoadingAlertConfig))) {
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
              <Button onClick={handleInitialSaveConfig} variant="outline" size="sm" disabled={isLoadingConfig}>
                {isLoadingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Inicializar/Restablecer Configuración en DB
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                (Use esto para poblar Firestore con los valores por defecto o para restaurarlos).
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-2 md:p-4">
            <Tabs defaultValue="crear-usuario" className="w-full">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto md:h-12">
                <TabsTrigger value="crear-usuario" className="py-2 text-xs sm:text-sm"><UserPlus className="mr-1 h-4 w-4" />Crear Usuarios</TabsTrigger>
                <TabsTrigger value="espera-prolongada" className="py-2 text-xs sm:text-sm"><AlarmClock className="mr-1 h-4 w-4" />Espera Prolongada</TabsTrigger>
                <TabsTrigger value="estadisticas" className="py-2 text-xs sm:text-sm"><ClipboardList className="mr-1 h-4 w-4" />Estadísticas</TabsTrigger>
                <TabsTrigger value="gestionar-ventanillas" className="py-2 text-xs sm:text-sm"><Settings2 className="mr-1 h-4 w-4" />Ventanillas</TabsTrigger>
                <TabsTrigger value="gestionar-consultorios" className="py-2 text-xs sm:text-sm"><Hospital className="mr-1 h-4 w-4" />Consultorios</TabsTrigger>
                <TabsTrigger value="config-alertas" className="py-2 text-xs sm:text-sm"><Cog className="mr-1 h-4 w-4" />Alertas</TabsTrigger>
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
                      Pacientes esperando más de {alertThresholds.maxWaitTimePendingMinutes} min (ventanilla) o {alertThresholds.maxWaitTimeDoctorMinutes} min (médico).
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

              <TabsContent value="estadisticas" className="p-4 md:p-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ClipboardList className="h-6 w-6" />Estadísticas de Turnos</CardTitle>
                    <CardDescription>Resumen del flujo de turnos.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingStats ? (
                      <div className="flex justify-center items-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="ml-2 text-muted-foreground">Cargando estadísticas...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="p-4 bg-secondary/30">
                          <CardHeader className="p-2 pb-1">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><ClipboardList className="h-4 w-4 mr-2" />Total Turnos (Hoy)</CardTitle>
                          </CardHeader>
                          <CardContent className="p-2">
                            <p className="text-2xl font-bold text-primary">{turnStats.totalToday}</p>
                          </CardContent>
                        </Card>
                        <Card className="p-4 bg-secondary/30">
                          <CardHeader className="p-2 pb-1">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><Hourglass className="h-4 w-4 mr-2" />Pendientes (Ahora)</CardTitle>
                          </CardHeader>
                          <CardContent className="p-2">
                            <p className="text-2xl font-bold text-orange-500">{turnStats.pendingNow}</p>
                          </CardContent>
                        </Card>
                        <Card className="p-4 bg-secondary/30">
                          <CardHeader className="p-2 pb-1">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><PlayCircle className="h-4 w-4 mr-2" />En Atención (Ahora)</CardTitle>
                          </CardHeader>
                          <CardContent className="p-2">
                            <p className="text-2xl font-bold text-blue-500">{turnStats.inProgressNow}</p>
                          </CardContent>
                        </Card>
                        <Card className="p-4 bg-secondary/30">
                          <CardHeader className="p-2 pb-1">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><CheckCircle2 className="h-4 w-4 mr-2" />Completados (Hoy)</CardTitle>
                          </CardHeader>
                          <CardContent className="p-2">
                            <p className="text-2xl font-bold text-green-600">{turnStats.completedToday}</p>
                          </CardContent>
                        </Card>
                        <Card className="p-4 bg-secondary/30 md:col-span-2">
                          <CardHeader className="p-2 pb-1">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><UserX className="h-4 w-4 mr-2" />No Presentados (Hoy)</CardTitle>
                          </CardHeader>
                          <CardContent className="p-2">
                            <p className="text-2xl font-bold text-red-500">{turnStats.missedToday}</p>
                          </CardContent>
                        </Card>
                      </div>
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
                          {editableServices.map(service => (
                            <SelectItem key={service.value} value={service.value}>{service.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedServiceForModuleMgmt && (
                      <div>
                        <h4 className="font-medium mb-2">Ventanillas para {editableServices.find(s => s.value === selectedServiceForModuleMgmt)?.label}:</h4>
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
                            <PlusCircle className="mr-2 h-4 w-4" /> Añadir
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
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="config-alertas" className="p-4 md:p-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Cog className="h-6 w-6" />Configuración de Alertas de Espera</CardTitle>
                    <CardDescription>
                      Ajuste los tiempos máximos de espera antes de que se genere una alerta. Los cambios se guardan en Firestore.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormItem>
                        <Label htmlFor="pending-threshold">Tiempo Máx. Espera Ventanilla (minutos)</Label>
                        <Input 
                            id="pending-threshold"
                            type="number" 
                            value={editablePendingThreshold}
                            onChange={(e) => setEditablePendingThreshold(e.target.value)}
                            className="text-base h-11"
                            min="1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Tiempo en minutos antes de alertar para turnos en estado 'pendiente'.</p>
                    </FormItem>
                     <FormItem>
                        <Label htmlFor="doctor-threshold">Tiempo Máx. Espera Médico (minutos)</Label>
                        <Input 
                            id="doctor-threshold"
                            type="number" 
                            value={editableDoctorThreshold}
                            onChange={(e) => setEditableDoctorThreshold(e.target.value)}
                            className="text-base h-11"
                            min="1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Tiempo en minutos antes de alertar para turnos en estado 'esperando médico'.</p>
                    </FormItem>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={handleSaveAlertThresholds} disabled={isLoadingAlertConfig || isSavingAlertConfig} className="w-full text-lg py-3">
                        {isSavingAlertConfig ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Cog className="mr-2 h-5 w-5" />}
                        {isSavingAlertConfig ? "Guardando..." : "Guardar Umbrales"}
                    </Button>
                  </CardFooter>
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
