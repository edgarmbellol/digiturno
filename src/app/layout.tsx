
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Button } from '@/components/ui/button';
import { Home, Users, Contact } from 'lucide-react';


const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'TurnoFacil',
  description: 'Sistema de turnos TurnoFacil',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="bg-primary text-primary-foreground p-4 shadow-md">
          <nav className="container mx-auto flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold hover:opacity-80 transition-opacity">
              TurnoFacil
            </Link>
            <div className="space-x-2 sm:space-x-4">
              <Button variant="ghost" asChild className="hover:bg-primary-foreground/10">
                <Link href="/">
                  <Home className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Inicio</span>
                </Link>
              </Button>
              <Button variant="ghost" asChild className="hover:bg-primary-foreground/10">
                <Link href="/llamar">
                 <Contact className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Llamar</span>
                </Link>
              </Button>
              <Button variant="ghost" asChild className="hover:bg-primary-foreground/10">
                <Link href="/profesional">
                  <Users className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Profesional</span>
                </Link>
              </Button>
            </div>
          </nav>
        </header>
        <div className="pt-2"> {/* Added padding top to prevent content overlap with fixed header */}
         {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
