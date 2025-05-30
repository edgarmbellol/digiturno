
"use client";

import type { ReactNode, FC } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Hourglass } from 'lucide-react';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  setCurrentUser: (user: User | null) => void; // Allow manual setting if needed, e.g., after profile update
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("AuthProvider: useEffect for onAuthStateChanged mounting.");
    const unsubscribe = onAuthStateChanged(auth, 
      (user) => {
        try {
          console.log("AuthProvider: onAuthStateChanged callback fired. User:", user ? user.uid : 'null');
          setCurrentUser(user);
        } catch (error) {
          console.error("AuthProvider: Error in onAuthStateChanged callback (setting user):", error);
        } finally {
          console.log("AuthProvider: onAuthStateChanged finally block, setting isLoading to false.");
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("AuthProvider: Error with onAuthStateChanged listener itself:", error);
        setIsLoading(false); // Ensure loading state is unset even if listener fails
      }
    );

    return () => {
      console.log("AuthProvider: useEffect for onAuthStateChanged unmounting.");
      unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
        <Hourglass className="h-16 w-16 text-primary animate-spin mb-4" />
        <p className="text-xl">Verificando sesión...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, setCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
