
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Megaphone, UserCheck } from "lucide-react";

// Placeholder data - in a real app, this would come from a real-time data source
const currentTurn = {
  id: "F-102",
  service: "Facturación",
  patientId: "CC 123XXX789",
  module: "Módulo 3",
};

const upcomingTurns = [
  { id: "C-055", service: "Citas Médicas" },
  { id: "N-030", service: "Nueva EPS" },
  { id: "F-103", service: "Facturación" },
];

export default function CallPatientPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-4xl shadow-2xl mb-8 transform transition-all hover:scale-[1.01] duration-300">
        <CardHeader className="bg-primary text-primary-foreground p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-4xl sm:text-5xl font-bold">Turno Actual</CardTitle>
            <Megaphone className="h-12 w-12 sm:h-16 sm:w-16" />
          </div>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 text-center">
          <p className="text-6xl sm:text-8xl font-bold text-accent-foreground mb-2">{currentTurn.id}</p>
          <p className="text-2xl sm:text-3xl text-muted-foreground mb-1">{currentTurn.service}</p>
          <p className="text-3xl sm:text-4xl font-semibold text-primary-foreground bg-primary/80 rounded-md py-3 px-6 inline-block shadow-md">
            {currentTurn.module}
          </p>
        </CardContent>
      </Card>

      <Card className="w-full max-w-4xl shadow-xl transform transition-all hover:scale-[1.01] duration-300">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl font-semibold text-primary-foreground">Próximos Turnos</CardTitle>
          <CardDescription>Estos son los siguientes turnos en la fila.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {upcomingTurns.map((turn, index) => (
              <li key={index} className="p-4 bg-secondary/50 rounded-lg shadow-sm flex justify-between items-center">
                <span className="text-xl sm:text-2xl font-medium text-secondary-foreground">{turn.id}</span>
                <span className="text-base sm:text-lg text-muted-foreground">{turn.service}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
       <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TurnoFacil. Todos los derechos reservados.</p>
        <p>Una solución innovadora para la gestión de filas.</p>
      </footer>
    </main>
  );
}
