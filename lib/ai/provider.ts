import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { aiCapability, anthropicApiKey, anthropicModel } from '@/lib/config'

/**
 * The AI seam.
 *
 * Everything here is optional by construction. Every call site must check
 * `isAvailable()` first and have a defined non-AI behaviour, because Lumen's
 * matching, checklists, deadlines and reminders are deterministic and must
 * never silently depend on a model being reachable.
 *
 * The model is also never trusted on its own: extraction results are checked
 * against the source text before they are accepted (see extract/ai.ts).
 */

let client: Anthropic | null = null

export function isAvailable(): boolean {
  return aiCapability().available
}

function getClient(): Anthropic {
  const key = anthropicApiKey()
  if (!key) throw new AiUnavailableError('ANTHROPIC_API_KEY is not set.')
  client ??= new Anthropic({ apiKey: key })
  return client
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

export interface StructuredCallOptions<T> {
  system: string
  userContent: string
  toolName: string
  toolDescription: string
  schema: Record<string, unknown>
  validate: (raw: unknown) => T | null
  maxTokens?: number
  /** Extraction is a bounded task; the advisor gets more room to reason. */
  effort?: 'low' | 'medium' | 'high'
}

/**
 * Asks the model for one structured object via a strict tool, and returns null
 * rather than throwing when anything at all is off. A caller that gets null
 * falls back to whatever it had — never to a guess.
 */
export async function callStructured<T>(opts: StructuredCallOptions<T>): Promise<T | null> {
  if (!isAvailable()) return null

  try {
    const response = await getClient().messages.create({
      model: anthropicModel(),
      max_tokens: opts.maxTokens ?? 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort ?? 'low' },
      system: opts.system,
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: opts.schema as Anthropic.Tool['input_schema'],
          strict: true,
        },
      ],
      tool_choice: { type: 'tool', name: opts.toolName },
      messages: [{ role: 'user', content: opts.userContent }],
    })

    if (response.stop_reason === 'refusal') return null

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === opts.toolName) {
        return opts.validate(block.input)
      }
    }
    return null
  } catch (error) {
    // A model outage must never take discovery down with it.
    if (error instanceof Anthropic.APIError) return null
    if (error instanceof AiUnavailableError) return null
    throw error
  }
}

export interface AdvisorTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AdvisorResult {
  text: string
  /** Always true — the UI must badge every answer as AI, not as fact. */
  isAiGenerated: true
}

/**
 * The opportunity advisor. Grounded strictly in the caller-supplied context,
 * which is assembled from stored opportunity and profile data — the model is
 * never asked to recall an opportunity from its own training.
 */
export async function askAdvisor(
  groundingContext: string,
  history: AdvisorTurn[],
): Promise<AdvisorResult | null> {
  if (!isAvailable()) return null

  const system = [
    'You are Lumen\'s opportunity advisor, helping a student aged 13-22 decide what to do next.',
    '',
    'Ground every factual claim in the CONTEXT below. It contains the only opportunity data you may treat as real.',
    'If the context does not contain something the student asks about, say so plainly and suggest what would answer it.',
    'Never invent a deadline, eligibility rule, fee, organiser, award or acceptance rate. Never state one you cannot point to in the context.',
    '',
    'Do not claim that any activity will improve admission chances at any institution, guarantee any outcome, or describe anything as essential.',
    'Be concrete and brief. Prefer naming the single next action over listing every option.',
    'Where you are giving an opinion rather than reporting the context, say so in the sentence.',
    '',
    'CONTEXT',
    groundingContext,
  ].join('\n')

  try {
    const response = await getClient().messages.create({
      model: anthropicModel(),
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system,
      messages: history.map((t) => ({ role: t.role, content: t.content })),
    })

    if (response.stop_reason === 'refusal') return null

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return text.length > 0 ? { text, isAiGenerated: true } : null
  } catch (error) {
    if (error instanceof Anthropic.APIError) return null
    throw error
  }
}
