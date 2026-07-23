import Joi from 'joi';

// Allowed navigation routes whitelist
const ALLOWED_NAVIGATE_ROUTES = new Set([
  '/dashboard',
  '/profile',
  '/recommendations',
  '/tax-optimizer',
  '/tax',
  '/calculators',
  '/portfolio-rebalance',
  '/rebalancer',
  '/goals',
  '/stepup',
]);

const metricSchema = Joi.object({
  label: Joi.string().required().max(100),
  value: Joi.string().required().max(100),
  trend: Joi.string().valid('up', 'down', 'neutral').default('neutral'),
}).unknown(false);

const actionSchema = Joi.object({
  label: Joi.string().required().max(100),
  action: Joi.string().valid('navigate', 'modal', 'copy').required(),
  target: Joi.string().required().max(200).custom((value, helpers) => {
    if (!ALLOWED_NAVIGATE_ROUTES.has(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'Whitelisted Route Validation'),
}).unknown(false);

const actionCardSchema = Joi.object({
  type: Joi.string().valid(
    'RECOMMENDATION',
    'TAX_SAVING',
    'SIP_CALCULATOR',
    'REBALANCE_ALERT',
    'GOAL_PROGRESS',
    'NAV_INSIGHT',
    'rebalance',
    'tax_save',
    'sip_stepup'
  ).required(),
  title: Joi.string().required().max(150),
  subtitle: Joi.string().max(200).optional(),
  description: Joi.string().max(500).optional(),
  metrics: Joi.array().items(metricSchema).min(1).max(5).required(),
  actions: Joi.array().items(actionSchema).min(1).max(3).required(),
  severity: Joi.string().valid('info', 'success', 'warning', 'danger').default('info'),
  priority: Joi.number().integer().min(1).max(10).optional(),
  insight: Joi.string().max(500).optional(),
}).unknown(false);

/**
 * Checks for prototype pollution attack keys in JSON objects.
 */
function containsPrototypePollution(jsonStr) {
  if (!jsonStr) return false;
  return /"__proto__"|"constructor"|"prototype"/i.test(jsonStr);
}

/**
 * Parses and validates ACTION_CARD JSON blocks embedded in chat response text.
 * Strips invalid card blocks without throwing errors or breaking text responses.
 *
 * @param {string} responseText
 * @returns {{ cleanedText: string, validCards: Array<object>, validationSummary: object }}
 */
export function validateAndSanitizeActionCards(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return { cleanedText: responseText || '', validCards: [], validationSummary: { totalFound: 0, validCount: 0, strippedCount: 0 } };
  }

  const cardRegex = /<<<ACTION_CARD>>>\s*([\s\S]*?)\s*<<<END_ACTION_CARD>>>/g;
  let match;
  const validCards = [];
  let strippedCount = 0;
  let totalFound = 0;

  let cleanedText = responseText;

  while ((match = cardRegex.exec(responseText)) !== null) {
    totalFound++;
    const rawJsonStr = match[1];
    const fullMatchBlock = match[0];

    if (containsPrototypePollution(rawJsonStr)) {
      console.warn('[ActionCardValidator] Prototype pollution attempt detected in card block, stripping.');
      cleanedText = cleanedText.replace(fullMatchBlock, '');
      strippedCount++;
      continue;
    }

    try {
      const parsedJson = JSON.parse(rawJsonStr);

      // Validate strictly against Joi schema
      const { error, value } = actionCardSchema.validate(parsedJson);

      if (error) {
        console.warn('[ActionCardValidator] Card validation failed, stripping card block:', error.details[0]?.message);
        cleanedText = cleanedText.replace(fullMatchBlock, '');
        strippedCount++;
      } else {
        validCards.push(value);
      }
    } catch (parseErr) {
      console.warn('[ActionCardValidator] Malformed JSON in ACTION_CARD block, stripping card block:', parseErr.message);
      cleanedText = cleanedText.replace(fullMatchBlock, '');
      strippedCount++;
    }
  }

  // Clean up any remaining unclosed <<<ACTION_CARD>>> tags if model output was truncated
  if (cleanedText.includes('<<<ACTION_CARD>>>') && !cleanedText.includes('<<<END_ACTION_CARD>>>')) {
    console.warn('[ActionCardValidator] Truncated unclosed ACTION_CARD detected and stripped.');
    cleanedText = cleanedText.replace(/<<<ACTION_CARD>>>[\s\S]*/, '').trim();
    strippedCount++;
  }

  return {
    cleanedText: cleanedText.trim(),
    validCards,
    validationSummary: {
      totalFound,
      validCount: validCards.length,
      strippedCount,
    },
  };
}
