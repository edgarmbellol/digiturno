
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
  FormLabel as ShadcnFormLabel, // Renamed to avoid conflict if we use Radix Label directly
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
import { CheckCircle2, PartyPopper, UserCheck, ChevronRight, Loader2, UserPlus, Accessibility, Settings, Ticket, PersonStanding, Baby, HeartHandshake } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import type { Turn } from '@/types/turn';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import type { ServiceConfig, ServiceDefinitionFront } from "@/config/appConfigTypes";
import { serviceIconMap, DefaultServiceIcon } from "@/lib/iconMapping";
import { AVAILABLE_SERVICES as DEFAULT_SERVICES_STATIC_FALLBACK } from "@/lib/services";

const SERVICE_CONFIG_COLLECTION = "service_configurations";

const specialConditions: { name: keyof Pick<FormValues, "isSenior" | "isPregnant" | "isDisabled" | "isNone">; label: string; icon: LucideIcon }[] = [
  { name: "isSenior", label: "Adulto Mayor (60+)", icon: PersonStanding },
  { name: "isPregnant", label: "Gestante", icon: Baby },
  { name: "isDisabled", label: "Discapacidad", icon: Accessibility },
  { name: "isNone", label: "Ninguna Condición", icon: HeartHandshake },
];

const formSchema = z.object({
  service: z.string({ required_error: "Por favor seleccione un servicio." }).min(1, "Por favor seleccione un servicio."),
  idNumber: z.string().min(3, "El número de identificación es requerido.").regex(/^[0-9a-zA-Z]+$/, "Solo se permiten números y letras."),
  patientName: z.string().min(3, "El nombre del paciente es requerido.").max(100, "El nombre es demasiado largo."),
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
        return selectedPriorityCount >= 1;
    }
}, {
    message: "Si no tiene condiciones especiales, seleccione 'Ninguna'. Puede seleccionar una o más condiciones prioritarias si aplica, o 'Ninguna Condición' si no aplica ninguna.",
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
        servicesData = serviceSnapshot.docs.map(docSnap => {
          const data = docSnap.data() as ServiceConfig;
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

  const { reset, control, setValue, getValues, trigger } = form;

  const handleDependentSpecialConditions = (
    conditionName: keyof Pick<FormValues, "isSenior" | "isPregnant" | "isDisabled" | "isNone">,
    isChecked: boolean
  ) => {
    // The primary field (conditionName) is assumed to be already updated via field.onChange by RHF.
    // This function now only handles the *dependent* logic.

    if (conditionName === 'isNone') {
      if (isChecked) { // If "Ninguna" was just checked
        // Uncheck all other priority conditions
        setValue('isSenior', false, { shouldValidate: false });
        setValue('isPregnant', false, { shouldValidate: false });
        setValue('isDisabled', false, { shouldValidate: false });
      }
      // If "Ninguna" was unchecked, Zod's refine will handle validation if no priority is selected.
    } else { // A priority condition (isSenior, isPregnant, isDisabled) was just changed
      if (isChecked) { // If a priority condition was just checked
        // Uncheck "Ninguna"
        setValue('isNone', false, { shouldValidate: false });
      }
      // If a priority condition was unchecked, Zod's refine handles validation.
    }
    // After all dependent setValue calls, trigger validation for the group.
    trigger(['isNone', 'isSenior', 'isPregnant', 'isDisabled']);
  };


  const fetchPatientNameById = async (idDocument: string) => {
    if (!idDocument.trim() || idDocument.trim().length < 3) {
      setValue("patientName", "");
      setShowManualNameInput(true);
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
        setValue("patientName", "");
        if (response.status === 404) {
          console.warn(`Paciente no encontrado en API externa (404) para ID: ${idDocument}.`);
          toast({
            title: "Paciente No Encontrado",
            description: `Cédula ${idDocument} no encontrada. Ingrese el nombre manualmente.`,
            variant: "default",
            duration: 5000,
          });
        } else {
          console.error(`Error de API externa al buscar ID: ${idDocument}. Status: ${response.status}.`);
          toast({
            title: "Error de API",
            description: `Consulta de cédula ${idDocument} falló (Error ${response.status}). Ingrese nombre manualmente.`,
            variant: "destructive",
            duration: 5000,
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
          duration: 3000,
        });
        setShowManualNameInput(false);
      } else {
        setValue("patientName", "");
        toast({
          title: "Nombre No Encontrado",
          description: "Cédula encontrada pero sin nombre. Ingrese el nombre manualmente.",
          variant: "default",
          duration: 5000,
        });
        setShowManualNameInput(true);
      }
    } catch (error) {
      console.error("Error en fetchPatientNameById (red/CORS):", error);
      setValue("patientName", "");
      toast({
        title: "Error al Buscar Paciente",
        description: "No se pudo verificar la cédula (red/CORS). Ingrese nombre manualmente.",
        variant: "destructive",
        duration: 5000,
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
      <Card className="w-full max-w-xl shadow-xl transform transition-all duration-300">
        <CardHeader className="text-center bg-primary text-primary-foreground p-6 rounded-t-lg">
          <div className="flex flex-col items-center mb-3">
            <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={70} height={66} priority data-ai-hint="hospital logo" />
          </div>
          <div className="mx-auto bg-background/20 text-primary-foreground p-2.5 rounded-full w-fit mb-3">
            <PartyPopper className="h-10 w-10" />
          </div>
          <CardTitle className="text-2xl font-bold">¡Turno Registrado!</CardTitle>
          <CardDescription className="text-primary-foreground/80 text-base mt-1">
            Su turno <span className="font-semibold">{submittedTurnNumber}</span> ha sido procesado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-lg p-6">
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Paciente:</span>
            <span className="font-semibold text-foreground text-right">{submittedPatientName}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Identificación:</span>
            <span className="font-semibold text-foreground">CC {submittedIdNumber}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Servicio:</span>
            <span className="font-semibold text-foreground text-right">{submittedServiceLabel}</span>
          </div>
           <p className="text-center text-muted-foreground pt-4 text-base">
             Por favor, esté atento a la pantalla. Pronto será llamado.
           </p>
        </CardContent>
        <CardFooter className="p-4">
          <Button onClick={handleNewTurn} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-lg py-3 h-12">
            <ChevronRight className="mr-2 h-6 w-6 transform rotate-180" />
            Solicitar Nuevo Turno
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl shadow-2xl overflow-hidden">
      <CardHeader className="bg-primary text-primary-foreground p-4 md:p-6 rounded-t-lg text-center">
        <div className="flex flex-col items-center mb-2">
          <Image src="/logo-hospital.png" alt="Logo Hospital Divino Salvador de Sopó" width={70} height={66} priority data-ai-hint="hospital logo" />
        </div>
        <div className="flex items-center justify-center gap-2">
            <Ticket className="h-8 w-8 md:h-10 md:w-10" />
            <CardTitle className="text-2xl md:text-3xl font-bold">Solicitar Turno</CardTitle>
        </div>
        <CardDescription className="text-primary-foreground/90 pt-1 text-md md:text-lg">
          Complete los datos para obtener su turno.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="p-4 md:p-6">
            <div className="grid md:grid-cols-2 md:gap-x-10 gap-y-8">

              <div className="space-y-8">
                <FormField
                  control={control}
                  name="idNumber"
                  render={({ field }) => (
                    <FormItem>
                      <ShadcnFormLabel className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <UserCheck className="h-7 w-7 text-primary" />
                        1. Su Identificación
                      </ShadcnFormLabel>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Input
                            placeholder="Número de cédula"
                            {...field}
                            className="text-2xl h-16"
                            onBlur={(e) => {
                              field.onBlur();
                              fetchPatientNameById(e.target.value);
                            }}
                          />
                          {isFetchingPatientName && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
                        </div>
                      </FormControl>
                      <FormMessage className="text-lg"/>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="patientName"
                  render={({ field }) => (
                    <FormItem className={(showManualNameInput || getValues("patientName")) ? "block" : "hidden"}>
                      <ShadcnFormLabel className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                         <UserPlus className="h-7 w-7 text-primary" />
                        2. Su Nombre Completo
                      </ShadcnFormLabel>
                      <FormControl>
                         <Input
                            placeholder="Nombre como aparece en la cédula"
                            {...field}
                            className="text-2xl h-16"
                            disabled={isFetchingPatientName || (!showManualNameInput && !!getValues("patientName") && !form.formState.errors.patientName)}
                          />
                      </FormControl>
                       {showManualNameInput && !isFetchingPatientName && (
                        <p className="text-base text-muted-foreground mt-1">
                          No pudimos encontrar su nombre, por favor ingréselo.
                        </p>
                      )}
                      <FormMessage className="text-lg"/>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-8">
                 <FormField
                  control={control}
                  name="service"
                  render={({ field }) => (
                    <FormItem>
                      <ShadcnFormLabel className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Settings className="h-7 w-7 text-primary" />
                        3. ¿Qué Servicio Necesita?
                      </ShadcnFormLabel>
                       {isLoadingServiceConfig ? (
                         <div className="flex items-center text-lg text-muted-foreground pt-2"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Cargando servicios...</div>
                       ) : availableServices.length === 0 ? (
                         <p className="text-lg text-destructive pt-2">No hay servicios disponibles. Contacte al administrador.</p>
                       ) : (
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={availableServices.length === 0}>
                            <FormControl>
                            <SelectTrigger className="text-2xl h-16">
                                <SelectValue
                                placeholder={
                                    <span className="text-muted-foreground">Toque para seleccionar</span>
                                }
                                />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {availableServices.map((service) => (
                                <SelectItem key={service.id} value={service.id} className="text-xl py-3">
                                <div className="flex items-center gap-3">
                                    <service.icon className="h-7 w-7 text-muted-foreground" />
                                    {service.label}
                                </div>
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                       )}
                      <FormMessage className="text-lg"/>
                    </FormItem>
                  )}
                />
                <div className="space-y-3">
                    <ShadcnFormLabel className="text-lg font-semibold text-foreground mb-2 block flex items-center gap-2">
                        <Accessibility className="h-7 w-7 text-primary" />
                        4. ¿Alguna Condición Especial?
                    </ShadcnFormLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {specialConditions.map((item) => (
                        <FormField
                        key={item.name}
                        control={control}
                        name={item.name as keyof FormValues}
                        render={({ field }) => (
                            <div // Outer div for styling the clickable area
                                className={cn(
                                    "flex flex-col items-center justify-center space-y-1.5 p-3 border-2 rounded-lg transition-all cursor-pointer hover:border-primary/80 min-h-[120px]",
                                    field.value ? 'bg-primary/20 border-primary ring-2 ring-primary/40 shadow-md' : 'bg-card hover:bg-secondary/30 border-input'
                                )}
                                onClick={() => {
                                    // This onClick now directly triggers the field's onChange and then dependent logic
                                    const newValue = !field.value;
                                    field.onChange(newValue); // Update the current field's state via RHF
                                    handleDependentSpecialConditions(item.name as keyof FormValues, newValue);
                                }}
                                role="button" // Can act as a button, label association is via htmlFor to sr-only checkbox
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === ' ' || e.key === 'Enter') {
                                    e.preventDefault();
                                    const newValue = !field.value;
                                    field.onChange(newValue);
                                    handleDependentSpecialConditions(item.name as keyof FormValues, newValue);
                                    }
                                }}
                                >
                                <ShadcnFormLabel // This label wraps the visual content making it clickable for the checkbox
                                    htmlFor={field.name}
                                    className="contents cursor-pointer" // Use 'contents' to not affect layout, just make children part of label
                                >
                                    <item.icon className={cn("h-10 w-10 mb-1.5", field.value ? 'text-primary' : 'text-foreground/60')} />
                                    <span
                                    className={cn("font-semibold text-base text-center m-0 leading-tight", field.value ? 'text-primary' : 'text-foreground/80')}
                                    >
                                    {item.label}
                                    </span>
                                </ShadcnFormLabel>
                                <Checkbox // This is the actual RHF controlled input, sr-only for visuals
                                    {...field} // Spread field to connect RHF (ref, name, etc.)
                                    checked={field.value}
                                    onCheckedChange={(checkedValue) => { // This is RHF's field.onChange
                                        field.onChange(checkedValue); // Update the field
                                        handleDependentSpecialConditions(item.name as keyof FormValues, !!checkedValue); // Handle dependent logic
                                    }}
                                    id={field.name}
                                    className="sr-only"
                                />
                            </div>
                        )}
                        />
                    ))}
                    </div>
                    <FormMessage className="pt-1 text-lg">{form.formState.errors.isNone?.message || form.formState.errors.isSenior?.message || form.formState.errors.isPregnant?.message || form.formState.errors.isDisabled?.message}</FormMessage>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-4 md:p-6 border-t mt-6 md:mt-8">
            <Button type="submit" className="w-full text-2xl py-4 bg-accent text-accent-foreground hover:bg-accent/90 h-20" disabled={isSubmitting || isFetchingPatientName || isLoadingServiceConfig || availableServices.length === 0}>
              {isSubmitting ? "Registrando..." : (isFetchingPatientName ? "Verificando..." : (isLoadingServiceConfig ? "Cargando..." : "Confirmar y Solicitar Turno"))}
              {!isSubmitting && !isFetchingPatientName && !isLoadingServiceConfig && <CheckCircle2 className="ml-3 h-8 w-8" />}
              {(isFetchingPatientName || isLoadingServiceConfig || isSubmitting) && <Loader2 className="ml-3 h-8 w-8 animate-spin" />}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
