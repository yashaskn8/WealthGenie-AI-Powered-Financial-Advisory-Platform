/**
 * Intent Gate — Classifies user messages to route factual/regulatory questions to RAG.
 * 
 * Open-ended conversational turns (greeting, general financial advice, goal setup)
 * continue to route to the general LLM (Gemini/Groq).
 */

const FACTUAL_PATTERNS = [
  // Tax Law & Sections
  /\bsection\s*(?:80c|87a|115bac|80d|80ccd|24b|10\(10d\)|80tta|80ttb)\b/i,
  /\btax\s*(?:regime|slab|slabs|rebate|deduction|deductions|exemption|exemptions|saving|savings|return|returns|rate|rates|rule|rules|law|laws)\b/i,
  /\b(?:standard\s+deduction|marginal\s+relief|new\s+regime|old\s+regime|ltcg|stcg|capital\s+gains|tds)\b/i,

  // Investment Instruments & Schemes
  /\b(?:elss|ppf|epf|nps|sgb|sovereign\s+gold\s+bond|rbi\s+bond|rbi\s+bonds|fixed\s+deposit|bank\s+fd|scss|senior\s+citizen\s+savings|ssy|sukanya\s+samriddhi)\b/i,
  /\b(?:mutual\s+fund|mutual\s+funds|flexi\s+cap|large\s+cap|mid\s+cap|small\s+cap|debt\s+fund|equity\s+fund|index\s+fund|etf|etfs|liquid\s+fund|arbitrage\s+fund)\b/i,

  // Regulatory & Financial Mechanics
  /\b(?:sebi|amfi|cagr|lock-in|lock\s+in|lockin|expense\s+ratio|exit\s+load|nav|dicgc|riskometer)\b/i,
  /\b(?:how\s+much\s+can\s+i\s+deduct|maximum\s+deduction|tax\s+benefit|tax\s+benefits|rebate\s+limit|allowable\s+deduction)\b/i,
];

/**
 * Determines whether a message is a factual or regulatory query suitable for grounded RAG retrieval.
 * 
 * @param {string} message - User chat message
 * @returns {boolean} true if query requires grounded RAG retrieval, false otherwise
 */
export function isFactualQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.trim();
  if (text.length < 3) return false;

  return FACTUAL_PATTERNS.some(pattern => pattern.test(text));
}
