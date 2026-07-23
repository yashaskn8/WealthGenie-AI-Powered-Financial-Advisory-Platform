import Joi from 'joi';

const toolCallSchema = Joi.object({
  tool: Joi.string().required().max(100),
  arguments: Joi.object().default({}),
  id: Joi.string().max(100).optional(),
}).unknown(true);

const actionCardRefSchema = Joi.object({
  type: Joi.string().required(),
  title: Joi.string().required().max(150),
  subtitle: Joi.string().max(200).optional(),
  description: Joi.string().max(500).optional(),
  metrics: Joi.array().items(Joi.object().unknown(true)).optional(),
  actions: Joi.array().items(Joi.object().unknown(true)).optional(),
  severity: Joi.string().valid('info', 'success', 'warning', 'danger').default('info'),
  priority: Joi.number().optional(),
  insight: Joi.string().max(500).optional(),
}).unknown(true);

export const structuredResponseSchema = Joi.object({
  version: Joi.string().valid('2.0', '1.0').default('2.0'),
  answer: Joi.string().allow('').default(''),
  tool_calls: Joi.array().items(toolCallSchema).default([]),
  action_cards: Joi.array().items(actionCardRefSchema).default([]),
  citations: Joi.array().items(Joi.string()).default([]),
  metadata: Joi.object().default({}),
}).unknown(true);

/**
 * Validates, normalizes, and sanitizes LLM responses into the Version 2.0 Structured Protocol.
 *
 * @param {string|object} rawResponse
 * @returns {{ version: string, answer: string, tool_calls: Array<object>, action_cards: Array<object>, citations: Array<string>, metadata: object }}
 */
export function validateAndSanitizeStructuredResponse(rawResponse) {
  let parsedObject = null;

  if (typeof rawResponse === 'object' && rawResponse !== null) {
    parsedObject = rawResponse;
  } else if (typeof rawResponse === 'string') {
    const trimmed = rawResponse.trim();
    // Check if entire output is a JSON block
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || trimmed.includes('```json')) {
      try {
        let jsonStr = trimmed;
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
        }
        parsedObject = JSON.parse(jsonStr);
      } catch (_) {
        /* Not valid standalone JSON; treat as text answer */
      }
    }
  }

  // If no structured object was parsed, construct standard v2.0 response wrapper
  if (!parsedObject || typeof parsedObject !== 'object') {
    return {
      version: '2.0',
      answer: typeof rawResponse === 'string' ? rawResponse : '',
      tool_calls: [],
      action_cards: [],
      citations: [],
      metadata: { format: 'unstructured_text_fallback' },
    };
  }

  // Validate against Joi schema
  const { error, value } = structuredResponseSchema.validate(parsedObject, { stripUnknown: false });

  if (error) {
    console.warn('[StructuredResponseProtocol] Schema validation warning:', error.details[0]?.message);
    return {
      version: '2.0',
      answer: typeof parsedObject.answer === 'string' ? parsedObject.answer : String(rawResponse),
      tool_calls: Array.isArray(parsedObject.tool_calls) ? parsedObject.tool_calls.filter(t => t && t.tool) : [],
      action_cards: Array.isArray(parsedObject.action_cards) ? parsedObject.action_cards : [],
      citations: Array.isArray(parsedObject.citations) ? parsedObject.citations : [],
      metadata: { format: 'partial_sanitized_fallback' },
    };
  }

  return {
    version: '2.0',
    answer: value.answer || '',
    tool_calls: value.tool_calls || [],
    action_cards: value.action_cards || [],
    citations: value.citations || [],
    metadata: value.metadata || {},
  };
}
