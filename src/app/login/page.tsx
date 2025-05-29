
"use client";

import { useState } from "react";
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
import { signInWithEmailAndPassword } from "firebase/auth";
import { LogIn, AlertTriangle } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Por favor ingrese un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: "Inicio de Sesión Exitoso", description: "Bienvenido al panel profesional." });
      router.push("/profesional"); 
    } catch (err: any) {
      console.error("Login error:", err);
      let friendlyMessage = "Ocurrió un error al iniciar sesión. Verifique sus credenciales.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        friendlyMessage = "Correo electrónico o contraseña incorrectos.";
      }
      setError(friendlyMessage);
      toast({ title: "Error de Inicio de Sesión", description: friendlyMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center bg-primary text-primary-foreground p-6 rounded-t-lg">
          <div className="flex flex-col items-center mb-4">
            <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={100} height={96} priority />
          </div>
          <LogIn className="mx-auto h-10 w-10 mb-2" />
          <CardTitle className="text-2xl font-bold">Acceso Profesional</CardTitle>
          <CardDescription className="text-primary-foreground/80">
            Ingrese sus credenciales para gestionar los turnos.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 p-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <FormControl>
                      <Input id="email" type="email" placeholder="su.correo@ejemplo.com" {...field} className="text-base h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="password">Contraseña</Label>
                    <FormControl>
                      <Input id="password" type="password" placeholder="••••••••" {...field} className="text-base h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && (
                <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter className="p-6">
              <Button type="submit" className="w-full text-lg py-6" disabled={isLoading}>
                {isLoading ? "Ingresando..." : "Ingresar"}
                {!isLoading && <LogIn className="ml-2 h-5 w-5" />}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
       <footer className="mt-8 text-center text-xs text-muted-foreground/80 w-full">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Acceso restringido.</p>
      </footer>
    </main>
  );
}
