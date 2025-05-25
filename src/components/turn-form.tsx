
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
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
import { CheckCircle2, PartyPopper, UserCheck, ChevronRight, UserX, Loader2, UserPlus, Accessibility } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase"; 
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { Turn } from '@/types/turn';
import { useToast } from "@/hooks/use-toast";
import { AVAILABLE_SERVICES } from "@/lib/services";

const specialConditions: { name: keyof Pick<FormValues, "isSenior" | "isPregnant" | "isDisabled" | "isNone">; label: string; icon: LucideIcon }[] = [
  { name: "isSenior", label: "Adulto Mayor", icon: UserCheck },
  { name: "isPregnant", label: "Gestante", icon: UserCheck },
  { name: "isDisabled", label: "Discapacitado", icon: Accessibility },
  { name: "isNone", label: "Ninguna", icon: UserX },
];

const formSchema = z.object({
  service: z.string({ required_error: "Por favor seleccione un servicio." }).min(1, "Por favor seleccione un servicio."),
  idNumber: z.string().min(1, "El número de cédula es requerido.").regex(/^[0-9a-zA-Z]+$/, "Solo se permiten números y letras."),
  patientName: z.string().min(1, "El nombre del paciente es requerido.").max(100, "El nombre es demasiado largo."),
  isSenior: z.boolean().default(false),
  isPregnant: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  isNone: z.boolean().default(true),
}).refine(data => {
    const { isNone, isSenior, isPregnant, isDisabled } = data;
    const priorityConditions = [isSenior, isPregnant, isDisabled];
    const selectedPriorityCount = priorityConditions.filter(Boolean).length;

    if (isNone) {
        // If "None" is selected, no other priority condition should be selected.
        return selectedPriorityCount === 0;
    } else {
        // If "None" is NOT selected, exactly one priority condition must be selected.
        return selectedPriorityCount === 1;
    }
}, {
    message: "Seleccione 'Ninguna' o solo una condición de prioridad específica.",
    path: ["isNone"], 
});


type FormValues = z.infer<typeof formSchema>;

const generateTurnSuffix = async () => {
  return Date.now().toString().slice(-3); 
};


export default function TurnForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedTurnNumber, setSubmittedTurnNumber] = useState<string | null>(null);
  const [submittedServiceLabel, setSubmittedServiceLabel] = useState<string | null>(null);
  const [submittedIdNumber, setSubmittedIdNumber] = useState<string | null>(null);
  const [submittedPatientName, setSubmittedPatientName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const [isFetchingPatientName, setIsFetchingPatientName] = useState(false);
  const [showManualNameInput, setShowManualNameInput] = useState(false);


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      service: "",
      idNumber: "",
      patientName: "",
      isSenior: false,
      isPregnant: false,
      isDisabled: false,
      isNone: true,
    },
  });

  const { reset, control, setValue, getValues, trigger, watch } = form;
  
  const watchIsNone = watch("isNone"); // Keep this for visual styling if needed, but not for disabling

  const fetchPatientNameById = async (idDocument: string) => {
    if (!idDocument.trim()) {
      setValue("patientName", "");
      setShowManualNameInput(false);
      return;
    }
    setIsFetchingPatientName(true);
    setShowManualNameInput(false); 
    setValue("patientName", "", { shouldValidate: true }); 

    try {
      const response = await fetch('https://hospitalsopo.comsopo.org/api/info_paciente', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documento: idDocument }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); 
        setValue("patientName", ""); 

        if (response.status === 404) {
          console.warn(`Paciente no encontrado en API externa (404) para ID: ${idDocument}. Respuesta:`, errorData);
          toast({
            title: "Paciente No Encontrado",
            description: `Cédula ${idDocument} no encontrada en el sistema externo. Por favor, ingrese el nombre manualmente.`,
            variant: "default", 
            duration: 7000,
          });
        } else {
          console.error(`Error de API externa al buscar ID: ${idDocument}. Status: ${response.status}. Respuesta:`, errorData);
          toast({
            title: "Error de API al Buscar Paciente",
            description: `La consulta de cédula ${idDocument} falló (Error: ${response.status}). Ingrese el nombre manualmente.`,
            variant: "destructive",
            duration: 7000,
          });
        }
        setShowManualNameInput(true); 
        return; 
      }

      const data = await response.json();

      if (data && data.nombre_completo) {
        setValue("patientName", data.nombre_completo, { shouldValidate: true });
        toast({
          title: "Paciente Encontrado",
          description: `Nombre: ${data.nombre_completo}`,
        });
        setShowManualNameInput(false); 
      } else {
        setValue("patientName", ""); 
        toast({
          title: "Nombre No Encontrado",
          description: "La cédula fue encontrada pero no se devolvió un nombre. Por favor, ingrese el nombre manualmente.",
          variant: "default",
          duration: 7000,
        });
        setShowManualNameInput(true);
      }
    } catch (error) { 
      console.error("Error en fetchPatientNameById (red/CORS):", error);
      setValue("patientName", ""); 
      toast({
        title: "Error al Buscar Paciente",
        description: "No se pudo verificar la cédula. Esto puede ser un problema de red o CORS. Por favor, ingrese el nombre manualmente.",
        variant: "destructive",
        duration: 7000,
      });
      setShowManualNameInput(true); 
    } finally {
      setIsFetchingPatientName(false);
    }
  };

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    const selectedServiceInfo = AVAILABLE_SERVICES.find(s => s.value === data.service);
    if (!selectedServiceInfo) {
      toast({ title: "Error", description: "Servicio no encontrado.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const priority = data.isSenior || data.isPregnant || data.isDisabled;

    try {
      const turnSuffix = await generateTurnSuffix();
      const newTurnNumber = `${selectedServiceInfo.prefix}-${turnSuffix.padStart(3, '0')}`;

      const newTurnData: Omit<Turn, 'id' | 'requestedAt'> & { requestedAt: any } = {
        turnNumber: newTurnNumber,
        service: selectedServiceInfo.label, 
        patientId: `CC ${data.idNumber}`,
        patientName: data.patientName,
        priority: priority,
        status: 'pending',
        requestedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "turns"), newTurnData);

      setSubmittedTurnNumber(newTurnNumber);
      setSubmittedServiceLabel(selectedServiceInfo.label);
      setSubmittedIdNumber(data.idNumber);
      setSubmittedPatientName(data.patientName); 
      setIsSubmitted(true);
      toast({ title: "Turno Registrado", description: `Tu turno ${newTurnNumber} para ${data.patientName} ha sido creado.` });
    } catch (error) {
      console.error("Error adding document: ", error);
      toast({ title: "Error", description: "No se pudo registrar el turno. Intente de nuevo.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewTurn() {
    setIsSubmitted(false);
    setSubmittedTurnNumber(null);
    setSubmittedPatientName(null); 
    setShowManualNameInput(false); 
    reset({
        service: "",
        idNumber: "",
        patientName: "", 
        isSenior: false,
        isPregnant: false,
        isDisabled: false,
        isNone: true,
    });
  }

  if (isSubmitted && submittedTurnNumber && submittedServiceLabel && submittedIdNumber && submittedPatientName) {
    return (
      <Card className="w-full max-w-lg shadow-xl transform transition-all duration-300">
        <CardHeader className="text-center bg-primary text-primary-foreground p-6 rounded-t-lg">
          <div className="mx-auto bg-background/20 text-primary-foreground p-3 rounded-full w-fit mb-3">
            <PartyPopper className="h-10 w-10" />
          </div>
          <CardTitle className="text-2xl font-bold">¡Turno Registrado!</CardTitle>
          <CardDescription className="text-primary-foreground/80">
            Su turno <span className="font-semibold">{submittedTurnNumber}</span> ha sido procesado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm p-6">
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Paciente:</span>
            <span className="font-semibold text-foreground">{submittedPatientName}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Identificación:</span>
            <span className="font-semibold text-foreground">CC {submittedIdNumber}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Servicio:</span>
            <span className="font-semibold text-foreground">{submittedServiceLabel}</span>
          </div>
           <p className="text-center text-muted-foreground pt-4">
             Por favor, esté atento a la pantalla. Pronto será llamado.
           </p>
        </CardContent>
        <CardFooter className="p-6">
          <Button onClick={handleNewTurn} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-lg py-3">
            <ChevronRight className="mr-2 h-5 w-5 transform rotate-180" />
            Solicitar Nuevo Turno
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="bg-primary text-primary-foreground p-6 rounded-t-lg">
        <div className="mx-auto mb-3">
            <UserPlus className="h-12 w-12 text-primary-foreground/80" />
        </div>
        <CardTitle className="text-3xl font-bold text-center">TurnoFacil</CardTitle>
        <CardDescription className="text-center text-primary-foreground/80 pt-1">
          Seleccione el servicio y complete sus datos para obtener un turno.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={control}
              name="service"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Tipo de Servicio</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger className="text-base h-12">
                        <SelectValue
                          placeholder={
                            <span className="text-muted-foreground">Seleccione un servicio</span>
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AVAILABLE_SERVICES.map((service) => (
                        <SelectItem key={service.value} value={service.value} className="text-base py-2">
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
              control={control}
              name="idNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Número de Cédula/Identificación</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      <Input
                        placeholder="Ej: 1234567890"
                        {...field}
                        className="text-base h-12"
                        onBlur={(e) => {
                          field.onBlur(); 
                          fetchPatientNameById(e.target.value);
                        }}
                      />
                      {isFetchingPatientName && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="patientName"
              render={({ field }) => (
                <FormItem className={(showManualNameInput || getValues("patientName")) ? "block" : "hidden"}>
                  <FormLabel className="text-base font-semibold">Nombre Completo del Paciente</FormLabel>
                  <FormControl>
                     <Input
                        placeholder="Ingrese nombre completo"
                        {...field}
                        className="text-base h-12"
                        disabled={isFetchingPatientName || (!showManualNameInput && !!getValues("patientName") && !form.formState.errors.patientName)}
                      />
                  </FormControl>
                   {showManualNameInput && !isFetchingPatientName && ( 
                    <p className="text-xs text-muted-foreground mt-1">
                      No se encontró el nombre, por favor ingréselo.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />


            <FormItem>
              <FormLabel className="text-base font-semibold">Condiciones Especiales</FormLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {specialConditions.map((item) => (
                  <FormField
                    key={item.name}
                    control={control}
                    name={item.name}
                    render={({ field }) => (
                      <FormItem
                        className={`flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md transition-colors cursor-pointer hover:bg-secondary/70
                                    ${field.value ? 'bg-secondary border-primary ring-2 ring-primary' : 'bg-card hover:border-primary/50'}`}
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checkedValue) => {
                              const isChecking = Boolean(checkedValue);
                              
                              if (item.name === "isNone") {
                                setValue("isNone", isChecking, { shouldValidate: false });
                                if (isChecking) {
                                  setValue("isSenior", false, { shouldValidate: false });
                                  setValue("isPregnant", false, { shouldValidate: false });
                                  setValue("isDisabled", false, { shouldValidate: false });
                                }
                              } else { // One of the priority conditions
                                const currentFieldName = item.name as "isSenior" | "isPregnant" | "isDisabled";
                                setValue(currentFieldName, isChecking, { shouldValidate: false });
                                
                                if (isChecking) {
                                  setValue("isNone", false, { shouldValidate: false });
                                  // Uncheck other priority conditions
                                  if (currentFieldName !== "isSenior") setValue("isSenior", false, { shouldValidate: false });
                                  if (currentFieldName !== "isPregnant") setValue("isPregnant", false, { shouldValidate: false });
                                  if (currentFieldName !== "isDisabled") setValue("isDisabled", false, { shouldValidate: false });
                                } else {
                                  // If this priority is being unchecked, check if any other priority is active.
                                  // If not, 'isNone' must become true.
                                  const anyOtherPriorityActive =
                                    (currentFieldName === "isSenior" ? false : getValues("isSenior")) ||
                                    (currentFieldName === "isPregnant" ? false : getValues("isPregnant")) ||
                                    (currentFieldName === "isDisabled" ? false : getValues("isDisabled"));
                                  if (!anyOtherPriorityActive) {
                                    setValue("isNone", true, { shouldValidate: false });
                                  }
                                }
                              }
                              trigger(["isNone", "isSenior", "isPregnant", "isDisabled"]);
                            }}
                            aria-label={item.label}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </FormControl>
                        <item.icon className={`h-5 w-5 ${field.value ? 'text-primary' : 'text-muted-foreground'}`} />
                        <FormLabel
                          htmlFor={field.name} 
                          className={`font-normal text-base m-0! cursor-pointer w-full ${field.value ? 'text-primary' : 'text-foreground'}`}
                        >
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
               <FormMessage>{form.formState.errors.isNone?.message}</FormMessage>
            </FormItem>

            <Button type="submit" className="w-full text-lg py-6 bg-accent text-accent-foreground hover:bg-accent/90 h-14" disabled={isSubmitting || isFetchingPatientName}>
              {isSubmitting ? "Registrando..." : (isFetchingPatientName ? "Verificando Cédula..." : "Solicitar Turno")}
              {!isSubmitting && !isFetchingPatientName && <CheckCircle2 className="ml-2 h-6 w-6" />}
              {isFetchingPatientName && <Loader2 className="ml-2 h-6 w-6 animate-spin" />}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

    