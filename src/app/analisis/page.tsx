
"use client";

import { useState, useEffect } from "react";
import Image from "next/image"; // Import Image
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea"; 
import { Lightbulb, Loader2, AlertTriangle, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, getDocs, Timestamp } from "firebase/firestore";
import type { Turn } from "@/types/turn";
import { analyzeTurns, type TurnDataForAI } from "@/ai/flows/analyze-turns-flow";

const MAX_TURNS_FOR_ANALYSIS = 100; 

export default function AnalisisPage() {
  const { currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.replace("/login");
    }
  }, [currentUser, authLoading, router]);

  const transformTurnForAI = (turn: Turn): TurnDataForAI => {
    return {
      turnNumber: turn.turnNumber,
      service: turn.service,
      patientId: turn.patientId,
      patientName: turn.patientName,
      priority: turn.priority,
      status: turn.status,
      requestedAt: turn.requestedAt instanceof Timestamp ? turn.requestedAt.toDate().toISOString() : undefined,
      calledAt: turn.calledAt instanceof Timestamp ? turn.calledAt.toDate().toISOString() : undefined,
      completedAt: turn.completedAt instanceof Timestamp ? turn.completedAt.toDate().toISOString() : undefined,
      doctorCompletedAt: turn.doctorCompletedAt instanceof Timestamp ? turn.doctorCompletedAt.toDate().toISOString() : undefined,
      module: turn.module,
      professionalDisplayName: turn.professionalDisplayName,
    };
  };

  const handleGenerateAnalysis = async () => {
    setIsLoadingAnalysis(true);
    setAnalysisResult(null);
    setError(null);

    try {
      const turnsQuery = query(
        collection(db, "turns"),
        orderBy("requestedAt", "desc"),
        limit(MAX_TURNS_FOR_ANALYSIS)
      );
      const querySnapshot = await getDocs(turnsQuery);
      const turnsData: Turn[] = [];
      querySnapshot.forEach((doc) => {
        turnsData.push({ id: doc.id, ...doc.data() } as Turn);
      });

      if (turnsData.length === 0) {
        setError("No hay datos de turnos recientes para analizar.");
        toast({ title: "Sin Datos", description: "No se encontraron turnos recientes para el análisis.", variant: "default" });
        setIsLoadingAnalysis(false);
        return;
      }

      const transformedTurns = turnsData.map(transformTurnForAI);
      const result = await analyzeTurns({ turns: transformedTurns });
      
      if (result.analysisText) {
        setAnalysisResult(result.analysisText);
      } else {
        setError("La IA no generó un análisis. Intente de nuevo.");
        toast({ title: "Error de IA", description: "No se pudo generar el análisis.", variant: "destructive" });
      }

    } catch (err: any) {
      console.error("Error generating analysis:", err);
      setError("Ocurrió un error al generar el análisis. Verifique la consola para más detalles.");
      toast({ title: "Error", description: "No se pudo conectar con el servicio de análisis.", variant: "destructive" });
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  if (authLoading || (!authLoading && !currentUser && (typeof router.asPath !== 'string' || !router.asPath.includes("/login")))) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-secondary/30">
        <Loader2 className="h-16 w-16 text-primary animate-spin" />
        <p className="text-xl text-muted-foreground mt-4">Cargando...</p>
      </main>
    );
  }
  
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-indigo-500/10 to-background">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="bg-indigo-600 text-white p-6 rounded-t-lg">
          <div className="flex justify-center mb-4">
             <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} />
          </div>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-10 w-10" />
            <div>
              <CardTitle className="text-3xl font-bold">Análisis de Turnos con IA</CardTitle>
              <CardDescription className="text-indigo-100 pt-1">
                Obtenga información sobre la operativa de los turnos utilizando inteligencia artificial.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="text-sm text-muted-foreground bg-indigo-500/5 p-3 rounded-md border border-indigo-500/20">
            <p>
              Esta herramienta utiliza IA para analizar los datos de los últimos {MAX_TURNS_FOR_ANALYSIS} turnos registrados. 
              El análisis puede ayudar a identificar patrones de demanda, tiempos de espera y posibles áreas de mejora.
            </p>
          </div>
          
          <Button 
            onClick={handleGenerateAnalysis} 
            disabled={isLoadingAnalysis}
            className="w-full text-lg py-6 bg-indigo-500 hover:bg-indigo-600 text-white"
          >
            {isLoadingAnalysis ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generando Análisis...
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 h-5 w-5" />
                Generar Análisis de los Últimos {MAX_TURNS_FOR_ANALYSIS} Turnos
              </>
            )}
          </Button>

          {error && (
            <div className="mt-4 p-4 bg-destructive/10 text-destructive border border-destructive/30 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          )}

          {analysisResult && !isLoadingAnalysis && (
            <div className="mt-6 space-y-3">
              <h3 className="text-xl font-semibold text-indigo-700">Resultados del Análisis:</h3>
              <Textarea
                value={analysisResult}
                readOnly
                className="min-h-[250px] text-base bg-indigo-500/5 border-indigo-500/30 focus:ring-indigo-500"
                placeholder="El análisis de la IA aparecerá aquí..."
              />
            </div>
          )}
        </CardContent>
      </Card>
       <footer className="mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Módulo de Análisis.</p>
      </footer>
    </main>
  );
}
    
