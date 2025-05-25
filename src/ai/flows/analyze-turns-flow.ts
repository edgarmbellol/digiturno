
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
  prompt: `You are an expert data analyst specializing in service queue management for hospitals.
Analyze the following turn data for TurnoFacil system and provide a concise summary of key insights.

Focus on:
- Service demand: Which services are most requested?
- Wait times:
    - Initial wait time (from 'requestedAt' to 'calledAt' for reception/professional services).
    - Wait time for doctor (from 'completedAt' (reception) to 'calledAt' (by doctor), for turns that went to 'waiting_doctor' then 'called_by_doctor').
- Processing times:
    - Reception/Professional processing time (from 'calledAt' to 'completedAt' for services like Facturación).
    - Doctor consultation time (from 'calledAt' (by doctor) to 'doctorCompletedAt').
- Priority impact: Do priority turns significantly affect overall flow? Note any patterns.
- Professional/Module activity: Briefly comment if any modules or professionals handle significantly more/less volume if data is available.
- Potential bottlenecks or areas for improvement based on the data.
- Overall efficiency observations.

Timestamps are provided as ISO date strings. Calculate durations based on these. Be mindful of missing timestamps, which mean that stage hasn't occurred or wasn't recorded for that turn.
'requestedAt': Patient requested the turn.
'calledAt': Turn called by reception/professional OR by a doctor. This timestamp is updated when a doctor calls a patient who was 'waiting_doctor'.
'completedAt': Turn processed by reception/professional. If the service leads to a doctor, this marks the end of the reception phase (status might become 'waiting_doctor').
'doctorCompletedAt': Consultation completed by the doctor.

Provide your analysis in a clear, structured format. Use bullet points for key findings.

Turn Data:
{{#if turns.length}}
{{#each turns}}
- Turn: {{turnNumber}}
  Service: {{service}}
  Priority: {{priority}}
  Status: {{status}}
  Requested At: {{#if requestedAt}}{{requestedAt}}{{else}}N/A{{/if}}
  Called At: {{#if calledAt}}{{calledAt}}{{else}}N/A{{/if}}
  Reception Completed At: {{#if completedAt}}{{completedAt}}{{else}}N/A{{/if}}
  Doctor Completed At: {{#if doctorCompletedAt}}{{doctorCompletedAt}}{{else}}N/A{{/if}}
  Module/Consultorio: {{#if module}}{{module}}{{else}}N/A{{/if}}
  Professional: {{#if professionalDisplayName}}{{professionalDisplayName}}{{else}}N/A{{/if}}
{{/each}}
{{else}}
No turn data provided for analysis.
{{/if}}

Your Analysis:
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
      return { analysisText: "No turn data was provided to analyze. Please ensure turns are loaded before requesting analysis." };
    }
    try {
      const {output} = await analysisPrompt(input);
      return output!;
    } catch (error) {
      console.error("Error in analyzeTurnsFlow:", error);
      return { analysisText: "An error occurred while generating the analysis. Please try again." };
    }
  }
);

// Make sure this file is imported in src/ai/dev.ts for Genkit to discover the flow
// e.g., import './flows/analyze-turns-flow';
