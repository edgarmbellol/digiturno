
"use client";

import { useState, useEffect, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { signOut, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { collection, query, where, onSnapshot, Timestamp, or } from "firebase/firestore";
import { UserPlus, ShieldCheck, AlertTriangle, LogIn, UserCircle2, Hourglass, LogOut, ClockWarning, UserList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { Turn } from "@/types/turn";
import { formatDistanceToNowStrict, intervalToDuration } from 'date-fns';
import { es } from 'date-fns/locale';

const ADMIN_EMAIL = "edgarmbellol@gmail.com";
const MAX_WAIT_TIME_PENDING_MINUTES = 15; // 15 minutos para 'pending'
const MAX_WAIT_TIME_DOCTOR_MINUTES = 30; // 30 minutos para 'waiting_doctor'

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

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, isLoading: authLoading } = useAuth();

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [patientsWithLongWait, setPatientsWithLongWait] = useState<PatientWithLongWait[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date()); // Para actualizar dinámicamente los tiempos

  const createUserForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  // Efecto para actualizar la hora actual y recalcular tiempos de espera
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000); // Actualizar cada 30 segundos
    return () => clearInterval(timer);
  }, []);

  // Efecto para escuchar turnos 'pending' y 'waiting_doctor'
  useEffect(() => {
    if (currentUser?.email !== ADMIN_EMAIL) {
      setPatientsWithLongWait([]); // Limpiar si no es admin
      return;
    }

    const q = query(
      collection(db, "turns"),
      or(
        where("status", "==", "pending"),
        where("status", "==", "waiting_doctor")
      )
    );

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
        } else if (turn.status === "waiting_doctor" && turn.completedAt) { // 'completedAt' es cuando terminó facturación y pasa a esperar médico
          thresholdMs = MAX_WAIT_TIME_DOCTOR_MINUTES * 60 * 1000;
          referenceTimeMs = turn.completedAt.toMillis();
          waitType = 'medico';
        } else {
          return; // No es un estado que nos interese para esta alerta
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
      setPatientsWithLongWait(longWaitList.sort((a, b) => (b.requestedAt.toMillis() || 0) - (a.requestedAt.toMillis() || 0) )); // Ordenar por más antiguo
    }, (error) => {
      console.error("Error fetching turns for long wait alert:", error);
      toast({ title: "Error de Carga", description: "No se pudieron cargar los turnos para alertas de espera.", variant: "destructive" });
    });

    return () => unsubscribe();
  }, [currentUser, toast]); // No incluimos 'currentTime' aquí para no re-suscribir a firestore constantemente


  const calculateDynamicWaitTime = (turn: Turn, waitType: 'ventanilla' | 'medico'): string => {
    const now = currentTime.getTime();
    let referenceTimeMs: number | undefined;

    if (waitType === 'ventanilla' && turn.requestedAt) {
      referenceTimeMs = turn.requestedAt.toMillis();
    } else if (waitType === 'medico' && turn.completedAt) {
      referenceTimeMs = turn.completedAt.toMillis();
    }

    if (!referenceTimeMs) return "N/A";

    const waitTimeMs = Math.max(0, now - referenceTimeMs); // Evitar tiempos negativos
    const duration = intervalToDuration({ start: 0, end: waitTimeMs });
    return `${duration.hours ? duration.hours + 'h ' : ''}${duration.minutes || 0}m ${duration.seconds || 0}s`;
  };


  const handleCreateUser = async (data: CreateUserFormValues) => {
    setIsCreatingUser(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: data.displayName,
        });
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
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = `El correo electrónico '${data.email}' ya está en uso.`;
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = "La contraseña es demasiado débil.";
      } else if (err.code === 'auth/operation-not-allowed') {
        friendlyMessage = "La creación de usuarios con correo/contraseña no está habilitada. Revise la configuración de 'Sign-in method' en su Firebase Console.";
      }
      toast({ title: "Error de Creación", description: friendlyMessage, variant: "destructive" });
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Sesión Cerrada", description: "Has cerrado sesión exitosamente."});
    } catch (error) {
      console.error("Error signing out: ", error);
      toast({ title: "Error al Salir", description: "No se pudo cerrar la sesión.", variant: "destructive"});
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-secondary/30">
        <Hourglass className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Verificando acceso...</p>
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
              <LogIn className="mr-2 h-5 w-5" />
              Ir a Inicio de Sesión
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

  // Admin está conectado
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <div className="w-full max-w-4xl space-y-8">
        <Card className="w-full shadow-2xl relative">
          <CardHeader className="text-center bg-primary text-primary-foreground p-6 rounded-t-lg">
              <div className="flex justify-center mb-4">
                  <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} data-ai-hint="hospital logo" />
              </div>
              <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                      <UserCircle2 className="h-7 w-7" />
                      <p className="text-xs text-primary-foreground/80">Admin: {currentUser.email}</p>
                  </div>
                  <Button onClick={handleLogout} variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/20 text-xs">
                      <LogOut className="mr-1 h-4 w-4" /> Salir
                  </Button>
              </div>
            <UserPlus className="mx-auto h-10 w-10 mb-2 mt-2" />
            <CardTitle className="text-2xl font-bold">Crear Usuario Profesional</CardTitle>
            <CardDescription className="text-primary-foreground/80">
              Ingrese los datos para el nuevo profesional.
            </CardDescription>
          </CardHeader>
          <Form {...createUserForm}>
            <form onSubmit={createUserForm.handleSubmit(handleCreateUser)}>
              <CardContent className="space-y-6 p-6">
                 <FormField
                  control={createUserForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="prof-displayName">Nombre del Profesional</Label>
                      <FormControl>
                        <Input id="prof-displayName" placeholder="Ej: Dr. Juan Pérez" {...field} className="text-base h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="prof-email">Correo Electrónico del Profesional</Label>
                      <FormControl>
                        <Input id="prof-email" type="email" placeholder="ej: medico.juan@hospital.com" {...field} className="text-base h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createUserForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="prof-password">Contraseña para el Profesional</Label>
                      <FormControl>
                        <Input id="prof-password" type="password" placeholder="••••••••" {...field} className="text-base h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="p-6">
                <Button type="submit" className="w-full text-lg py-6" disabled={isCreatingUser}>
                  {isCreatingUser ? "Creando Usuario..." : "Crear Profesional"}
                  {!isCreatingUser && <UserPlus className="ml-2 h-5 w-5" />}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>

        {/* Sección de Alertas de Espera Prolongada */}
        <Card className="w-full shadow-xl border-2 border-destructive/50">
          <CardHeader className="bg-destructive/10 text-destructive p-6 rounded-t-lg">
            <div className="flex items-center gap-3">
              <ClockWarning className="h-10 w-10" />
              <div>
                <CardTitle className="text-2xl font-bold">Pacientes con Espera Prolongada</CardTitle>
                <CardDescription className="text-destructive/80 pt-1">
                  Pacientes esperando más de {MAX_WAIT_TIME_PENDING_MINUTES} min (ventanilla) o {MAX_WAIT_TIME_DOCTOR_MINUTES} min (médico).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {patientsWithLongWait.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No hay pacientes con espera prolongada en este momento.</p>
            ) : (
              <ul className="space-y-4">
                {patientsWithLongWait.map((turn) => (
                  <li key={turn.id} className="p-4 border rounded-lg shadow-sm bg-card hover:bg-secondary/20 transition-colors">
                    <div className="flex flex-col sm:flex-row justify-between items-start">
                      <div>
                        <p className="text-lg font-semibold text-primary">{turn.turnNumber}</p>
                        <p className="text-sm text-foreground">{turn.patientName || `ID: ${turn.patientId}`}</p>
                        <p className="text-xs text-muted-foreground">Servicio: {turn.service}</p>
                        <p className="text-xs text-muted-foreground">
                          Esperando para: <span className="font-medium">{turn.waitType === 'ventanilla' ? 'Ventanilla' : 'Médico'}</span>
                        </p>
                      </div>
                      <div className="text-right mt-2 sm:mt-0">
                        <p className="text-lg font-bold text-destructive">{calculateDynamicWaitTime(turn, turn.waitType)}</p>
                        <p className="text-xs text-muted-foreground">
                          {turn.waitType === 'ventanilla' ? `Solicitado: ${formatDistanceToNowStrict(turn.requestedAt.toDate(), { addSuffix: true, locale: es })}` 
                                                          : `Facturación Completada: ${formatDistanceToNowStrict(turn.completedAt!.toDate(), { addSuffix: true, locale: es })}`}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground mt-6 text-center max-w-md">
        **Nota:** Al crear un usuario, ese nuevo usuario profesional será conectado automáticamente en esta sesión del navegador.
        Para crear múltiples usuarios como admin, deberá cerrar la sesión del profesional recién creado y volver a ingresar como <span className="font-semibold">{ADMIN_EMAIL}</span>.
      </p>
    </main>
  );
}

