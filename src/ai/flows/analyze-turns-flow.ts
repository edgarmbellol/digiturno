
'use server';
/**
 * @fileOverview An AI agent for analyzing turn data.
 *
 * - analyzeTurns - A function that handles the turn data analysis process.
 * - AnalyzeTurnsInput - The input type for the analyzeTurns function.
 * - AnalyzeTurnsOutput - The return type for the analyzeTurns function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { TurnStatus } from '@/types/turn'; // Assuming TurnStatus is exported or use string

// Define a Zod schema for the turn data we'll pass to the AI
// Ensure all optional fields are marked as such and dates are strings
const TurnDataForAISchema = z.object({
  turnNumber: z.string(),
  service: z.string(),
  patientId: z.string().optional(),
  patientName: z.string().optional(),
  priority: z.boolean(),
  status: z.string(), // Simplified status as string for AI
  requestedAt: z.string().optional().describe("ISO date string when the turn was requested"),
  calledAt: z.string().optional().describe("ISO date string when the turn was first called (by reception or doctor)"),
  completedAt: z.string().optional().describe("ISO date string when the turn was completed by reception/professional (e.g., facturación)"),
  doctorCompletedAt: z.string().optional().describe("ISO date string when the doctor completed the consultation"),
  module: z.string().optional().describe("The module or consultorio that handled the turn"),
  professionalDisplayName: z.string().optional().describe("Name of the professional or doctor"),
});
export type TurnDataForAI = z.infer<typeof TurnDataForAISchema>;

const AnalyzeTurnsInputSchema = z.object({
  turns: z.array(TurnDataForAISchema).describe("An array of turn data objects to be analyzed."),
});
export type AnalyzeTurnsInput = z.infer<typeof AnalyzeTurnsInputSchema>;

const AnalyzeTurnsOutputSchema = z.object({
  analysisText: z.string().describe("A textual summary of the turn data analysis, including key insights, patterns, and potential bottlenecks."),
});
export type AnalyzeTurnsOutput = z.infer<typeof AnalyzeTurnsOutputSchema>;

export async function analyzeTurns(input: AnalyzeTurnsInput): Promise<AnalyzeTurnsOutput> {
  // In a real app, you might pre-process or validate input further here
  return analyzeTurnsFlow(input);
}

const analysisPrompt = ai.definePrompt({
  name: 'turnAnalysisPrompt',
  input: {schema: AnalyzeTurnsInputSchema},
  output: {schema: AnalyzeTurnsOutputSchema},
  model: 'googleai/gemini-1.5-flash-latest', // Specify the model here
  prompt: `Eres un analista de datos experto especializado en la gestión de colas de servicio para hospitales.
Analiza los siguientes datos de turnos para el sistema TurnoFacil y proporciona un resumen conciso de las ideas clave.

Enfócate en:
- Demanda de servicios: ¿Qué servicios son los más solicitados?
- Tiempos de espera:
    - Tiempo de espera inicial (desde 'requestedAt' hasta 'calledAt' para servicios de recepción/profesionales).
    - Tiempo de espera para el médico (desde 'completedAt' (recepción) hasta 'calledAt' (por el médico), para turnos que pasaron a 'waiting_doctor' y luego a 'called_by_doctor').
- Tiempos de procesamiento:
    - Tiempo de procesamiento en recepción/profesional (desde 'calledAt' hasta 'completedAt' para servicios como Facturación).
    - Tiempo de consulta médica (desde 'calledAt' (por el médico) hasta 'doctorCompletedAt').
- Impacto de la prioridad: ¿Los turnos prioritarios afectan significativamente el flujo general? Observa cualquier patrón.
- Actividad de profesionales/módulos: Comenta brevemente si algún módulo o profesional maneja un volumen significativamente mayor/menor si los datos están disponibles.
- Posibles cuellos de botella o áreas de mejora basadas en los datos.
- Observaciones generales de eficiencia.

Las marcas de tiempo se proporcionan como cadenas de fecha ISO. Calcula las duraciones basándote en esto. Ten en cuenta las marcas de tiempo faltantes, lo que significa que esa etapa no ha ocurrido o no se registró para ese turno.
'requestedAt': El paciente solicitó el turno.
'calledAt': Turno llamado por recepción/profesional O por un médico. Esta marca de tiempo se actualiza cuando un médico llama a un paciente que estaba en 'waiting_doctor'.
'completedAt': Turno procesado por recepción/profesional. Si el servicio conduce a un médico, esto marca el final de la fase de recepción (el estado podría convertirse en 'waiting_doctor').
'doctorCompletedAt': Consulta completada por el médico.

Proporciona tu análisis en un formato claro y estructurado. Usa viñetas para los hallazgos clave.
**IMPORTANTE: Todo el análisis y el texto de respuesta deben estar en español.**

Datos de los Turnos:
{{#if turns.length}}
{{#each turns}}
- Turno: {{turnNumber}}
  Servicio: {{service}}
  Prioridad: {{priority}}
  Estado: {{status}}
  Solicitado en: {{#if requestedAt}}{{requestedAt}}{{else}}N/A{{/if}}
  Llamado en: {{#if calledAt}}{{calledAt}}{{else}}N/A{{/if}}
  Recepción Completada en: {{#if completedAt}}{{completedAt}}{{else}}N/A{{/if}}
  Médico Completó en: {{#if doctorCompletedAt}}{{doctorCompletedAt}}{{else}}N/A{{/if}}
  Módulo/Consultorio: {{#if module}}{{module}}{{else}}N/A{{/if}}
  Profesional: {{#if professionalDisplayName}}{{professionalDisplayName}}{{else}}N/A{{/if}}
{{/each}}
{{else}}
No se proporcionaron datos de turnos para el análisis.
{{/if}}

Tu Análisis (en español):
`,
});

const analyzeTurnsFlow = ai.defineFlow(
  {
    name: 'analyzeTurnsFlow',
    inputSchema: AnalyzeTurnsInputSchema,
    outputSchema: AnalyzeTurnsOutputSchema,
  },
  async (input) => {
    if (!input.turns || input.turns.length === 0) {
      return { analysisText: "No se proporcionaron datos de turnos para analizar. Asegúrese de que los turnos estén cargados antes de solicitar el análisis." };
    }
    try {
      const {output} = await analysisPrompt(input);
      return output!;
    } catch (error) {
      console.error("Error en analyzeTurnsFlow:", error);
      return { analysisText: "Ocurrió un error al generar el análisis. Por favor, inténtelo de nuevo." };
    }
  }
);

// Make sure this file is imported in src/ai/dev.ts for Genkit to discover the flow
// e.g., import './flows/analyze-turns-flow';
