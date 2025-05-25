
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
import { CheckCircle2, PartyPopper, UserCheck, ChevronRight, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase"; 
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { Turn } from '@/types/turn'; 
import { useToast } from "@/hooks/use-toast";
import { AVAILABLE_SERVICES } from "@/lib/services"; // Import shared services

const specialConditions: { name: keyof FormValues; label: string; icon: LucideIcon }[] = [
  { name: "isSenior", label: "Adulto Mayor", icon: UserCheck },
  { name: "isPregnant", label: "Gestante", icon: UserCheck },
  { name: "isDisabled", label: "Discapacitado", icon: UserCheck },
  { name: "isNone", label: "Ninguna", icon: UserX },
];

const formSchema = z.object({
  service: z.string({ required_error: "Por favor seleccione un servicio." }).min(1, "Por favor seleccione un servicio."),
  idNumber: z.string().min(1, "El número de cédula es requerido.").regex(/^[0-9a-zA-Z]+$/, "Solo se permiten números y letras."),
  isSenior: z.boolean().default(false),
  isPregnant: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  isNone: z.boolean().default(true),
}).refine(data => {
    if (data.isNone && (data.isSenior || data.isPregnant || data.isDisabled)) {
        return false;
    }
    if (!data.isNone && !data.isSenior && !data.isPregnant && !data.isDisabled) {
      return false;
    }
    return true;
}, {
    message: "Seleccione 'Ninguna' o una condición específica. Si no aplica ninguna, 'Ninguna' debe estar marcada.",
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

  const { watch, setValue, reset, trigger, getValues } = form;
  const watchIsSenior = watch("isSenior");
  const watchIsPregnant = watch("isPregnant");
  const watchIsDisabled = watch("isDisabled");
  const watchIsNone = watch("isNone");

  useEffect(() => {
    const currentIsNone = getValues("isNone");
    if (watchIsNone && !currentIsNone) { // User just checked "isNone"
        if (getValues("isSenior")) setValue("isSenior", false, { shouldValidate: false });
        if (getValues("isPregnant")) setValue("isPregnant", false, { shouldValidate: false });
        if (getValues("isDisabled")) setValue("isDisabled", false, { shouldValidate: false });
        trigger(); // Validate the whole form after programmatic changes
    }
  }, [watchIsNone, setValue, trigger, getValues]);

  useEffect(() => {
    const anyPriorityChecked = watchIsSenior || watchIsPregnant || watchIsDisabled;
    const currentIsNone = getValues("isNone");

    if (anyPriorityChecked && currentIsNone) {
        setValue("isNone", false, { shouldValidate: false });
        trigger();
    } else if (!anyPriorityChecked && !currentIsNone) {
        setValue("isNone", true, { shouldValidate: false });
        trigger();
    }
  }, [watchIsSenior, watchIsPregnant, watchIsDisabled, setValue, trigger, getValues]);


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
        service: selectedServiceInfo.label, // Save the label of the service
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

  if (isSubmitted && submittedTurnNumber && submittedServiceLabel && submittedIdNumber) {
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
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="bg-primary text-primary-foreground p-6 rounded-t-lg">
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
                    name={item.name as keyof FormValues} // item.name must be a key of FormValues
                    render={({ field }) => (
                      <FormItem
                        className={`flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md transition-colors cursor-pointer hover:bg-secondary/70
                                    ${field.value ? 'bg-secondary border-primary ring-2 ring-primary' : 'bg-card hover:border-primary/50'}
                                    ${(item.name !== "isNone" && watchIsNone) ? 'opacity-50 cursor-not-allowed hover:bg-card' : ''
                                    }`}
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value as boolean}
                            onCheckedChange={(checkedState) => {
                                field.onChange(checkedState);
                                trigger(item.name as keyof FormValues); 
                                trigger(); // validate all form
                            }}
                            aria-label={item.label}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            disabled={(item.name !== "isNone" && watchIsNone)}
                          />
                        </FormControl>
                        <item.icon className={`h-5 w-5 ${field.value ? 'text-primary' : 'text-muted-foreground'} ${(item.name !== "isNone" && watchIsNone) ? 'opacity-50' : '' }`} />
                        <FormLabel
                          className={`font-normal text-base m-0! cursor-pointer w-full ${field.value ? 'text-primary' : 'text-foreground'}
                           ${(item.name !== "isNone" && watchIsNone) ? 'opacity-50 cursor-not-allowed' : '' }`}
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
