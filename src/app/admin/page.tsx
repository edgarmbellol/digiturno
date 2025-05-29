
"use client";

import { useState, useEffect } from "react";
import Image from "next/image"; // Import Image
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
import { auth } from "@/lib/firebase"; 
import { signOut } from "firebase/auth"; 
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { UserPlus, ShieldCheck, AlertTriangle, LogIn, UserCircle2, Hourglass, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext"; 

const ADMIN_EMAIL = "edgarmbellol@gmail.com";

const createUserSchema = z.object({
  displayName: z.string().min(1, "El nombre del profesional es requerido."),
  email: z.string().email("Por favor ingrese un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});
type CreateUserFormValues = z.infer<typeof createUserSchema>;

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, isLoading: authLoading } = useAuth(); 

  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const createUserForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

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
    } catch (err: any)
      {
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
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority />
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
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority />
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
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-lg shadow-2xl relative">
        <CardHeader className="text-center bg-primary text-primary-foreground p-6 rounded-t-lg">
            <div className="flex justify-center mb-4">
                <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} />
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
      <p className="text-xs text-muted-foreground mt-4 text-center max-w-md">
        **Nota:** Al crear un usuario, ese nuevo usuario profesional será conectado automáticamente en esta sesión del navegador.
        Para crear múltiples usuarios como admin, deberá cerrar la sesión del profesional recién creado y volver a ingresar como <span className="font-semibold">{ADMIN_EMAIL}</span>.
      </p>
    </main>
  );
}

