
"use client";

import { useState } from "react";
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
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { UserPlus, ShieldCheck, AlertTriangle, LogIn } from "lucide-react";

// Admin credentials (HARCODED - NOT FOR PRODUCTION)
const ADMIN_USERNAME = "EMBL";
const ADMIN_PASSWORD = "1993";
const PROFESSIONAL_EMAIL_DOMAIN = "turnofacil.app"; // Domain to append to username

const adminLoginSchema = z.object({
  username: z.string().min(1, "Nombre de usuario requerido."),
  password: z.string().min(1, "Contraseña requerida."),
});
type AdminLoginValues = z.infer<typeof adminLoginSchema>;

const createUserSchema = z.object({
  username: z.string().min(3, "El nombre de usuario debe tener al menos 3 caracteres.").regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y guion bajo permitidos."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});
type CreateUserFormValues = z.infer<typeof createUserSchema>;

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const adminLoginForm = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { username: "", password: "" },
  });

  const createUserForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: "", password: "" },
  });

  const handleAdminLogin = (data: AdminLoginValues) => {
    setIsSubmittingAdmin(true);
    setAdminError(null);
    if (data.username === ADMIN_USERNAME && data.password === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      toast({ title: "Acceso de Administrador Concedido" });
    } else {
      setAdminError("Credenciales de administrador incorrectas.");
      toast({ title: "Error de Acceso", description: "Credenciales de administrador incorrectas.", variant: "destructive" });
    }
    setIsSubmittingAdmin(false);
  };

  const handleCreateUser = async (data: CreateUserFormValues) => {
    setIsCreatingUser(true);
    const emailForFirebase = `${data.username.toLowerCase()}@${PROFESSIONAL_EMAIL_DOMAIN}`;
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, emailForFirebase, data.password);
      toast({
        title: "Usuario Profesional Creado",
        description: `El usuario ${data.username} (login: ${emailForFirebase}) ha sido creado. El nuevo profesional está ahora conectado. Para crear otro usuario, por favor salga y vuelva a ingresar como admin.`,
        duration: 7000, // Longer duration for important info
      });
      createUserForm.reset();
      // The new user is now signed in.
    } catch (err: any) {
      console.error("Error creating user:", err);
      let friendlyMessage = "Ocurrió un error al crear el usuario.";
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = `El nombre de usuario '${data.username}' (email '${emailForFirebase}') ya está en uso.`;
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = "La contraseña es demasiado débil.";
      }
      toast({ title: "Error de Creación", description: friendlyMessage, variant: "destructive" });
    } finally {
      setIsCreatingUser(false);
    }
  };
  
  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setAdminError(null);
    adminLoginForm.reset();
    toast({title: "Sesión de Admin cerrada"});
  }

  if (!isAdminAuthenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-destructive/10 via-background to-background">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center bg-destructive text-destructive-foreground p-6 rounded-t-lg">
            <ShieldCheck className="mx-auto h-12 w-12 mb-2" />
            <CardTitle className="text-2xl font-bold">Acceso de Administrador</CardTitle>
            <CardDescription className="text-destructive-foreground/80">
              Ingrese credenciales de administrador.
            </CardDescription>
          </CardHeader>
          <Form {...adminLoginForm}>
            <form onSubmit={adminLoginForm.handleSubmit(handleAdminLogin)}>
              <CardContent className="space-y-6 p-6">
                <FormField
                  control={adminLoginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="admin-username">Usuario Admin</Label>
                      <FormControl>
                        <Input id="admin-username" placeholder="EMBL" {...field} className="text-base h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={adminLoginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="admin-password">Contraseña Admin</Label>
                      <FormControl>
                        <Input id="admin-password" type="password" placeholder="••••" {...field} className="text-base h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {adminError && (
                  <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    {adminError}
                  </div>
                )}
              </CardContent>
              <CardFooter className="p-6">
                <Button type="submit" className="w-full text-lg py-6 bg-destructive hover:bg-destructive/90" disabled={isSubmittingAdmin}>
                  {isSubmittingAdmin ? "Verificando..." : "Ingresar como Admin"}
                  {!isSubmittingAdmin && <LogIn className="ml-2 h-5 w-5" />}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </main>
    );
  }

  // Admin is authenticated, show user creation form
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-lg shadow-2xl relative">
         <Button 
            variant="ghost" 
            size="sm"
            onClick={handleAdminLogout} 
            className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"
          >
            Cerrar Sesión Admin
        </Button>
        <CardHeader className="text-center bg-primary text-primary-foreground p-6 rounded-t-lg">
          <UserPlus className="mx-auto h-12 w-12 mb-2" />
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
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="prof-username">Nombre de Usuario del Profesional</Label>
                    <FormControl>
                      <Input id="prof-username" placeholder="ej: medico_juan_01" {...field} className="text-base h-11" />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground mt-1">
                      El profesional iniciará sesión con: &lt;nombredeusuario&gt;@{PROFESSIONAL_EMAIL_DOMAIN}
                    </p>
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
        Para crear múltiples usuarios como admin, deberá cerrar la sesión del profesional recién creado (si la UI lo permite) y volver a ingresar sus credenciales de admin.
      </p>
    </main>
  );
}
