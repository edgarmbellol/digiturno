
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
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
import { CheckCircle2, PartyPopper, UserCheck, ChevronRight, UserX, Loader2, UserPlus, Accessibility, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase"; 
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import type { Turn } from '@/types/turn';
import { useToast } from "@/hooks/use-toast";

import type { ServiceConfig, ServiceDefinitionFront } from "@/config/appConfigTypes";
import { serviceIconMap, DefaultServiceIcon } from "@/lib/iconMapping";
import { AVAILABLE_SERVICES as DEFAULT_SERVICES_STATIC_FALLBACK } from "@/lib/services";


const SERVICE_CONFIG_COLLECTION = "service_configurations";

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
        return selectedPriorityCount === 0;
    } else {
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

  const [availableServices, setAvailableServices] = useState<ServiceDefinitionFront[]>([]);
  const [isLoadingServiceConfig, setIsLoadingServiceConfig] = useState(true);


  const fetchServiceConfiguration = useCallback(async () => {
    setIsLoadingServiceConfig(true);
    try {
      const serviceSnapshot = await getDocs(collection(db, SERVICE_CONFIG_COLLECTION));
      let servicesData: ServiceDefinitionFront[] = [];
      if (serviceSnapshot.empty) {
        toast({ title: "Usando Config. por Defecto", description: "No se encontró config. de servicios en Firestore. Usando valores estáticos.", duration: 5000});
        servicesData = DEFAULT_SERVICES_STATIC_FALLBACK.map(s => ({
          ...s,
          id: s.value, 
        }));
      } else {
        servicesData = serviceSnapshot.docs.map(doc => {
          const data = doc.data() as ServiceConfig;
          return {
            id: data.id,
            value: data.id,
            label: data.label,
            icon: serviceIconMap[data.iconName] || DefaultServiceIcon,
            prefix: data.prefix,
            modules: data.modules,
          };
        });
      }
      setAvailableServices(servicesData);
    } catch (error) {
      console.error("Error fetching service configuration:", error);
      toast({ title: "Error de Configuración", description: "No se pudo cargar la configuración de servicios. Usando valores por defecto.", variant: "destructive" });
      setAvailableServices(DEFAULT_SERVICES_STATIC_FALLBACK.map(s => ({ ...s, id: s.value })));
    } finally {
      setIsLoadingServiceConfig(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchServiceConfiguration();
  }, [fetchServiceConfiguration]);


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
  
  const watchIsNone = watch("isNone");

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
    const selectedServiceInfo = availableServices.find(s => s.id === data.service);
    if (!selectedServiceInfo) {
      toast({ title: "Error", description: "Servicio no encontrado o configuración no cargada.", variant: "destructive" });
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
        <CardHeader className="text-center bg-primary text-primary-foreground p-5 rounded-t-lg">
          <div className="flex flex-col items-center mb-3">
            <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} priority data-ai-hint="hospital logo" />
          </div>
          <div className="mx-auto bg-background/20 text-primary-foreground p-2.5 rounded-full w-fit mb-2.5">
            <PartyPopper className="h-9 w-9" />
          </div>
          <CardTitle className="text-xl font-bold">¡Turno Registrado!</CardTitle>
          <CardDescription className="text-primary-foreground/80 text-sm">
            Su turno <span className="font-semibold">{submittedTurnNumber}</span> ha sido procesado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm p-5">
          <div className="flex justify-between border-b pb-1.5">
            <span className="font-medium text-muted-foreground">Paciente:</span>
            <span className="font-semibold text-foreground">{submittedPatientName}</span>
          </div>
          <div className="flex justify-between border-b pb-1.5">
            <span className="font-medium text-muted-foreground">Identificación:</span>
            <span className="font-semibold text-foreground">CC {submittedIdNumber}</span>
          </div>
          <div className="flex justify-between border-b pb-1.5">
            <span className="font-medium text-muted-foreground">Servicio:</span>
            <span className="font-semibold text-foreground">{submittedServiceLabel}</span>
          </div>
           <p className="text-center text-muted-foreground pt-3 text-xs">
             Por favor, esté atento a la pantalla. Pronto será llamado.
           </p>
        </CardContent>
        <CardFooter className="p-5">
          <Button onClick={handleNewTurn} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-md py-3 h-12">
            <ChevronRight className="mr-2 h-5 w-5 transform rotate-180" />
            Solicitar Nuevo Turno
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="bg-primary text-primary-foreground p-5 rounded-t-lg">
        <div className="flex flex-col items-center mb-3">
          <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={80} height={76} priority data-ai-hint="hospital logo" />
        </div>
        <CardTitle className="text-2xl font-bold text-center">TurnoFacil</CardTitle>
        <CardDescription className="text-center text-primary-foreground/80 pt-0.5">
          Seleccione el servicio y complete sus datos para obtener un turno.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={control}
              name="service"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Tipo de Servicio</FormLabel>
                   {isLoadingServiceConfig ? (
                     <div className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando servicios...</div>
                   ) : availableServices.length === 0 ? (
                     <p className="text-xs text-destructive">No hay servicios configurados. Contacte al administrador.</p>
                   ) : (
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={availableServices.length === 0}>
                        <FormControl>
                        <SelectTrigger className="text-sm h-11">
                            <SelectValue
                            placeholder={
                                <span className="text-muted-foreground">Seleccione un servicio</span>
                            }
                            />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        {availableServices.map((service) => (
                            <SelectItem key={service.id} value={service.id} className="text-sm py-1.5">
                            <div className="flex items-center gap-2">
                                <service.icon className="h-4 w-4 text-muted-foreground" />
                                {service.label}
                            </div>
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                   )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="idNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Número de Cédula/Identificación</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      <Input
                        placeholder="Ej: 1234567890"
                        {...field}
                        className="text-sm h-11"
                        onBlur={(e) => {
                          field.onBlur(); 
                          fetchPatientNameById(e.target.value);
                        }}
                      />
                      {isFetchingPatientName && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
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
                  <FormLabel className="text-sm font-medium">Nombre Completo del Paciente</FormLabel>
                  <FormControl>
                     <Input
                        placeholder="Ingrese nombre completo"
                        {...field}
                        className="text-sm h-11"
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
              <FormLabel className="text-sm font-medium">Condiciones Especiales</FormLabel>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {specialConditions.map((item) => (
                  <FormField
                    key={item.name}
                    control={control}
                    name={item.name}
                    render={({ field }) => (
                      <FormItem
                        className={`flex flex-row items-center space-x-2.5 space-y-0 p-2.5 border rounded-md transition-colors cursor-pointer hover:bg-secondary/70
                                    ${field.value ? 'bg-secondary border-primary ring-1 ring-primary' : 'bg-card hover:border-primary/50'}`}
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checkedState) => {
                                const isChecking = Boolean(checkedState);
                                field.onChange(isChecking); 

                                if (item.name === "isNone") {
                                    if (isChecking) { 
                                        setValue("isSenior", false, { shouldValidate: false });
                                        setValue("isPregnant", false, { shouldValidate: false });
                                        setValue("isDisabled", false, { shouldValidate: false });
                                    }
                                } else { 
                                    if (isChecking) { 
                                        setValue("isNone", false, { shouldValidate: false });
                                        
                                        if (item.name !== "isSenior") setValue("isSenior", false, { shouldValidate: false });
                                        if (item.name !== "isPregnant") setValue("isPregnant", false, { shouldValidate: false });
                                        if (item.name !== "isDisabled") setValue("isDisabled", false, { shouldValidate: false });
                                    }
                                }
                                
                                const senior = getValues("isSenior");
                                const pregnant = getValues("isPregnant");
                                const disabled = getValues("isDisabled");
                                if (!senior && !pregnant && !disabled && item.name !== "isNone" && !isChecking) {
                                   setValue("isNone", true, {shouldValidate: false});
                                }
                                trigger(["isNone", "isSenior", "isPregnant", "isDisabled"]);
                            }}
                            aria-label={item.label}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </FormControl>
                        <item.icon className={`h-4 w-4 ${field.value ? 'text-primary' : 'text-foreground'}`} />
                        <FormLabel
                          htmlFor={field.name} 
                          className={`font-normal text-sm m-0! cursor-pointer w-full ${field.value ? 'text-primary' : 'text-foreground'}`}
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

            <Button type="submit" className="w-full text-md py-3 bg-accent text-accent-foreground hover:bg-accent/90 h-12" disabled={isSubmitting || isFetchingPatientName || isLoadingServiceConfig || availableServices.length === 0}>
              {isSubmitting ? "Registrando..." : (isFetchingPatientName ? "Verificando Cédula..." : (isLoadingServiceConfig ? "Cargando Servicios..." : "Solicitar Turno"))}
              {!isSubmitting && !isFetchingPatientName && !isLoadingServiceConfig && <CheckCircle2 className="ml-2 h-5 w-5" />}
              {(isFetchingPatientName || isLoadingServiceConfig) && !isSubmitting && <Loader2 className="ml-2 h-5 w-5 animate-spin" />}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

