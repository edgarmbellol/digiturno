
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Stethoscope, HeartPulse, ShieldPlus, CheckCircle2, PartyPopper } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PENDING_TURNS_KEY = 'turnoFacil_pendingTurns';

// Definimos el tipo Turn para consistencia
export type Turn = {
  id: string;
  service: string;
  patientId: string;
  priority: boolean;
  requestedAt: Date;
};


const services: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "facturacion", label: "Facturación", icon: Receipt },
  { value: "citas_medicas", label: "Citas Médicas", icon: Stethoscope },
  { value: "famisanar", label: "Famisanar", icon: HeartPulse },
  { value: "nueva_eps", label: "Nueva EPS", icon: ShieldPlus },
];

const formSchema = z.object({
  service: z.string({ required_error: "Por favor seleccione un servicio." }),
  idNumber: z.string().min(1, "El número de cédula es requerido.").regex(/^[0-9]+$/, "Solo se permiten números."),
  isSenior: z.boolean().default(false),
  isPregnant: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  isNone: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

export default function TurnForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<FormValues & { turnId?: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      service: "",
      idNumber: "",
      isSenior: false,
      isPregnant: false,
      isDisabled: false,
      isNone: true, // Default to Ninguna
    },
  });

  const { watch, setValue, reset } = form;
  const isSenior = watch("isSenior");
  const isPregnant = watch("isPregnant");
  const isDisabled = watch("isDisabled");
  const isNone = watch("isNone");

  useEffect(() => {
    if (isNone) {
      setValue("isSenior", false);
      setValue("isPregnant", false);
      setValue("isDisabled", false);
    }
  }, [isNone, setValue]);

  useEffect(() => {
    if (isSenior || isPregnant || isDisabled) {
      setValue("isNone", false);
    }
  }, [isSenior, isPregnant, isDisabled, setValue]);

  function onSubmit(data: FormValues) {
    const selectedServiceInfo = services.find(s => s.value === data.service);
    if (!selectedServiceInfo) {
      // Should not happen if validation is correct
      console.error("Servicio no encontrado");
      return;
    }

    const newTurn: Turn = {
      id: `${selectedServiceInfo.label.substring(0,1).toUpperCase()}-${Date.now().toString().slice(-5)}`,
      service: selectedServiceInfo.label,
      patientId: `CC ${data.idNumber}`, // Format as in professional page
      priority: data.isSenior || data.isPregnant || data.isDisabled,
      requestedAt: new Date(),
    };

    try {
      const storedPendingTurns = localStorage.getItem(PENDING_TURNS_KEY);
      let pendingTurns: Turn[] = storedPendingTurns ? JSON.parse(storedPendingTurns).map((t: any) => ({...t, requestedAt: new Date(t.requestedAt)})) : [];
      pendingTurns.push(newTurn);
      localStorage.setItem(PENDING_TURNS_KEY, JSON.stringify(pendingTurns));
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      // Handle error, maybe show a toast to the user
    }
    
    setSubmittedData({...data, turnId: newTurn.id});
    setIsSubmitted(true);
  }

  function handleNewTurn() {
    setIsSubmitted(false);
    setSubmittedData(null);
    reset({ // Reset with 'Ninguna' checked by default
        service: "",
        idNumber: "",
        isSenior: false,
        isPregnant: false,
        isDisabled: false,
        isNone: true,
    });
  }
  
  const selectedServiceValue = watch("service");
  const currentSelectedService = services.find(s => s.value === selectedServiceValue);


  if (isSubmitted && submittedData) {
    const submittedService = services.find(s => s.value === submittedData.service);
    return (
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-accent/30 text-accent-foreground p-3 rounded-full w-fit mb-4">
            <PartyPopper className="h-10 w-10" />
          </div>
          <CardTitle className="text-2xl font-bold">¡Turno Registrado!</CardTitle>
          <CardDescription className="text-muted-foreground">
            Su turno <span className="font-semibold text-primary">{submittedData.turnId}</span> ha sido procesado exitosamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">Servicio:</span>
            <span>{submittedService?.label || "No especificado"}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Número de Cédula:</span>
            <span>{submittedData.idNumber}</span>
          </div>
           <p className="text-center text-muted-foreground pt-4">Pronto será llamado. Gracias por su paciencia.</p>
        </CardContent>
        <CardFooter>
          <Button onClick={handleNewTurn} className="w-full bg-primary hover:bg-primary/90">
            Solicitar Nuevo Turno
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader>
        <CardTitle className="text-3xl font-bold text-center text-primary-foreground bg-primary -mx-6 -mt-6 p-6 rounded-t-lg">TurnoFacil</CardTitle>
        <CardDescription className="text-center pt-2">
          Seleccione el servicio deseado y complete sus datos para obtener un turno.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="service"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Servicio</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-base">
                        {currentSelectedService ? (
                          <div className="flex items-center gap-2">
                            <currentSelectedService.icon className="h-5 w-5 text-muted-foreground" />
                            {currentSelectedService.label}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Seleccione un servicio</span>
                        )}
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.value} value={service.value} className="text-base">
                          <div className="flex items-center gap-2">
                            <service.icon className="h-5 w-5 text-muted-foreground" />
                            {service.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="idNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Cédula</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 1234567890" {...field} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Condiciones Especiales (Opcional)</FormLabel>
              <div className="space-y-3 pt-2">
                {[
                  { name: "isSenior", label: "Adulto Mayor" },
                  { name: "isPregnant", label: "Gestante" },
                  { name: "isDisabled", label: "Discapacitado" },
                  { name: "isNone", label: "Ninguna" },
                ].map((item) => (
                  <FormField
                    key={item.name}
                    control={form.control}
                    name={item.name as keyof FormValues}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                        <FormControl>
                          <Checkbox
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                            aria-label={item.label}
                            disabled={
                                (item.name === "isSenior" && (isPregnant || isDisabled)) ||
                                (item.name === "isPregnant" && (isSenior || isDisabled)) ||
                                (item.name === "isDisabled" && (isSenior || isPregnant)) ||
                                (item.name !== "isNone" && isNone)
                            }
                          />
                        </FormControl>
                        <FormLabel className={`font-normal text-base m-0! cursor-pointer ${
                            ((item.name === "isSenior" && (isPregnant || isDisabled)) ||
                            (item.name === "isPregnant" && (isSenior || isDisabled)) ||
                            (item.name === "isDisabled" && (isSenior || isPregnant)) ||
                            (item.name !== "isNone" && isNone)) ? 'text-muted-foreground opacity-50 cursor-not-allowed' : ''
                        }`}>
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
               <FormMessage>{form.formState.errors.isNone?.message || form.formState.errors.isSenior?.message /* etc. or a general message */}</FormMessage>
            </FormItem>
            
            <Button type="submit" className="w-full text-lg py-6 bg-accent text-accent-foreground hover:bg-accent/90">
              Solicitar Turno
              <CheckCircle2 className="ml-2 h-5 w-5" />
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

    