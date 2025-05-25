
"use client"; 

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Users, LogIn, LogOut, UserCog, Stethoscope } from 'lucide-react'; // Added Stethoscope
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

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

  return (
    <>
      <header className="bg-primary text-primary-foreground p-4 shadow-md sticky top-0 z-50">
        <nav className="container mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold hover:opacity-80 transition-opacity">
            TurnoFacil
          </Link>
          <div className="space-x-1 sm:space-x-2">
            <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
              <Link href="/">
                <Home className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Inicio</span>
              </Link>
            </Button>
            {/* Llamar page is public */}
            <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
              <Link href="/llamar">
               <Users className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Ver Llamados</span>
              </Link>
            </Button>
            
            {currentUser ? (
              <>
                <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
                  <Link href="/profesional">
                    <Users className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Profesional</span>
                  </Link>
                </Button>
                 <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
                  <Link href="/medicos">
                    <Stethoscope className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Médicos</span>
                  </Link>
                </Button>
                <Button variant="ghost" onClick={handleLogout} className="hover:bg-primary-foreground/10 px-2 sm:px-3">
                  <LogOut className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
                <Link href="/login">
                  <LogIn className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Login</span>
                </Link>
              </Button>
            )}
            <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
              <Link href="/admin">
                <UserCog className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Admin</span>
              </Link>
            </Button>
          </div>
        </nav>
      </header>
      <div className="pt-2">
       {children}
      </div>
    </>
  );
}
