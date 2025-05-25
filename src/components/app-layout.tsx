
"use client"; // This component uses client-side hooks

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Users, Contact, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login'); // Redirect to login page after logout
    } catch (error) {
      console.error("Error signing out: ", error);
      // Optionally show a toast message for logout error
    }
  };

  return (
    <>
      <header className="bg-primary text-primary-foreground p-4 shadow-md">
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
            <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
              <Link href="/llamar">
               <Contact className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Llamar</span>
              </Link>
            </Button>
            
            {currentUser ? (
              <>
                <Button variant="ghost" asChild className="hover:bg-primary-foreground/10 px-2 sm:px-3">
                  <Link href="/profesional">
                    <Users className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Profesional</span>
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
          </div>
        </nav>
      </header>
      <div className="pt-2">
       {children}
      </div>
    </>
  );
}
