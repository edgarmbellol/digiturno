
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
import { Receipt, Stethoscope, HeartPulse, ShieldPlus, CheckCircle2, PartyPopper, UserCheck, ChevronRight, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { Turn } from '@/types/turn';
import { useToast } from "@/hooks/use-toast";

const services: { value: string; label: string; icon: LucideIcon, prefix: string }[] = [
  { value: "facturacion", label: "Facturación", icon: Receipt, prefix: "F" },
  { value: "citas_medicas", label: "Citas Médicas", icon: Stethoscope, prefix: "C" },
  { value: "famisanar", label: "Famisanar", icon: HeartPulse, prefix: "FS" },
  { value: "nueva_eps", label: "Nueva EPS", icon: ShieldPlus, prefix: "N" },
];

const specialConditions: { name: keyof FormValues; label: string; icon: LucideIcon }[] = [
  { name: "isSenior", label: "Adulto Mayor", icon: UserCheck },
  { name: "isPregnant", label: "Gestante", icon: UserCheck }, // Consider a more specific icon if available
  { name: "isDisabled", label: "Discapacitado", icon: UserCheck },
  { name: "isNone", label: "Ninguna", icon: UserX },
];

const formSchema = z.object({
  service: z.string({ required_error: "Por favor seleccione un servicio." }),
  idNumber: z.string().min(1, "El número de cédula es requerido.").regex(/^[0-9a-zA-Z]+$/, "Solo se permiten números y letras."),
  isSenior: z.boolean().default(false),
  isPregnant: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  isNone: z.boolean().default(false), // Ninguna de las anteriores
}).refine(data => {
    // If "Ninguna" is checked, no other special condition should be checked.
    if (data.isNone && (data.isSenior || data.isPregnant || data.isDisabled)) {
        return false;
    }
    // If any other special condition is checked, "Ninguna" should not be.
    if (!data.isNone && !(data.isSenior || data.isPregnant || data.isDisabled) && !data.isNone) {
        // This case implies no special conditions are selected, which is valid if isNone is also false.
        // If user unchecks "Ninguna", they must select one or re-check "Ninguna"
        // However, for optionality, we allow no conditions if isNone is also false.
        // To make at least one selection mandatory if "Ninguna" is not chosen:
        // return (data.isSenior || data.isPregnant || data.isDisabled);
    }
    return true;
}, {
    message: "Seleccione 'Ninguna' o una condición específica, pero no ambas.",
    path: ["isNone"], // Path to show error under
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      service: "",
      idNumber: "",
      isSenior: false,
      isPregnant: false,
      isDisabled: false,
      isNone: true, 
    },
  });

  const { watch, setValue, reset, trigger } = form;
  const watchIsSenior = watch("isSenior");
  const watchIsPregnant = watch("isPregnant");
  const watchIsDisabled = watch("isDisabled");
  const watchIsNone = watch("isNone");

  useEffect(() => {
    if (watchIsNone) {
      setValue("isSenior", false, { shouldValidate: true });
      setValue("isPregnant", false, { shouldValidate: true });
      setValue("isDisabled", false, { shouldValidate: true });
    }
  }, [watchIsNone, setValue]);

  useEffect(() => {
    if (watchIsSenior || watchIsPregnant || watchIsDisabled) {
      setValue("isNone", false, { shouldValidate: true });
    }
  }, [watchIsSenior, watchIsPregnant, watchIsDisabled, setValue]);


  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    const selectedServiceInfo = services.find(s => s.value === data.service);
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
        priority: priority,
        status: 'pending',
        requestedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "turns"), newTurnData);
      
      setSubmittedTurnNumber(newTurnNumber);
      setSubmittedServiceLabel(selectedServiceInfo.label);
      setSubmittedIdNumber(data.idNumber);
      setIsSubmitted(true);
      toast({ title: "Turno Registrado", description: `Tu turno ${newTurnNumber} ha sido creado.` });
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
    reset({ 
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

  if (isSubmitted && submittedTurnNumber && submittedServiceLabel && submittedIdNumber) {
    return (
      <Card className="w-full max-w-lg shadow-xl transform transition-all hover:scale-[1.02] duration-300">
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
            <span className="font-medium text-muted-foreground">Servicio:</span>
            <span className="font-semibold text-foreground">{submittedServiceLabel}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-medium text-muted-foreground">Identificación:</span>
            <span className="font-semibold text-foreground">CC {submittedIdNumber}</span>
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
    <Card className="w-full max-w-lg shadow-xl transform transition-all hover:scale-[1.02] duration-300">
      <CardHeader className="bg-primary text-primary-foreground -mx-0 -mt-0 p-6 rounded-t-lg">
        <CardTitle className="text-3xl font-bold text-center">TurnoFacil</CardTitle>
        <CardDescription className="text-center text-primary-foreground/80 pt-1">
          Seleccione el servicio y complete sus datos para obtener un turno.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="service"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Tipo de Servicio</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-base h-12">
                        {currentSelectedService ? (
                          <div className="flex items-center gap-2">
                            <currentSelectedService.icon className="h-5 w-5 text-primary" />
                            {currentSelectedService.label}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Seleccione un servicio</span>
                        )}
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {services.map((service) => (
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
              control={form.control}
              name="idNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Número de Cédula/Identificación</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 1234567890" {...field} className="text-base h-12" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel className="text-base font-semibold">Condiciones Especiales (Opcional)</FormLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {specialConditions.map((item) => (
                  <FormField
                    key={item.name}
                    control={form.control}
                    name={item.name as keyof FormValues}
                    render={({ field }) => (
                      <FormItem 
                        className={`flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md transition-colors cursor-pointer hover:bg-secondary/70
                                    ${field.value ? 'bg-secondary border-primary ring-2 ring-primary' : 'bg-card hover:border-primary/50'}
                                    ${((item.name === "isSenior" && (watchIsPregnant || watchIsDisabled)) ||
                                      (item.name === "isPregnant" && (watchIsSenior || watchIsDisabled)) ||
                                      (item.name === "isDisabled" && (watchIsSenior || watchIsPregnant)) ||
                                      (item.name !== "isNone" && watchIsNone)) ? 'opacity-50 cursor-not-allowed hover:bg-card' : ''
                                    }`}
                        onClick={() => {
                            const currentlyDisabled = ((item.name === "isSenior" && (watchIsPregnant || watchIsDisabled)) ||
                                                    (item.name === "isPregnant" && (watchIsSenior || watchIsDisabled)) ||
                                                    (item.name === "isDisabled" && (watchIsSenior || watchIsPregnant)) ||
                                                    (item.name !== "isNone" && watchIsNone));
                            if (!currentlyDisabled) {
                                field.onChange(!field.value);
                                trigger(); // Manually trigger validation for the form or specific fields
                            }
                        }}
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value as boolean}
                            onCheckedChange={(checked) => { // Keep this for accessibility, though click is on item
                                field.onChange(checked);
                                trigger();
                            }}
                            aria-label={item.label}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            disabled={
                                (item.name === "isSenior" && (watchIsPregnant || watchIsDisabled)) ||
                                (item.name === "isPregnant" && (watchIsSenior || watchIsDisabled)) ||
                                (item.name === "isDisabled" && (watchIsSenior || watchIsPregnant)) ||
                                (item.name !== "isNone" && watchIsNone)
                            }
                          />
                        </FormControl>
                        <item.icon className={`h-5 w-5 ${field.value ? 'text-primary' : 'text-muted-foreground'}`} />
                        <FormLabel className={`font-normal text-base m-0! cursor-pointer w-full ${field.value ? 'text-primary' : 'text-foreground'}
                           ${((item.name === "isSenior" && (watchIsPregnant || watchIsDisabled)) ||
                            (item.name === "isPregnant" && (watchIsSenior || watchIsDisabled)) ||
                            (item.name === "isDisabled" && (watchIsSenior || watchIsPregnant)) ||
                            (item.name !== "isNone" && watchIsNone)) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}>
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
               <FormMessage>{form.formState.errors.isNone?.message || form.formState.errors.isSenior?.message || form.formState.errors.isPregnant?.message || form.formState.errors.isDisabled?.message}</FormMessage>
            </FormItem>
            
            <Button type="submit" className="w-full text-lg py-6 bg-accent text-accent-foreground hover:bg-accent/90 h-14" disabled={isSubmitting}>
              {isSubmitting ? "Registrando..." : "Solicitar Turno"}
              {!isSubmitting && <CheckCircle2 className="ml-2 h-6 w-6" />}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

