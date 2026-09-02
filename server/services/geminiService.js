import axios from 'axios';
import { getCache, setCache } from '../config/redis.js';
import crypto from 'crypto';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-120b';
const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

function hashProfile(profile) {
  return crypto.createHash('md5').update(JSON.stringify(profile)).digest('hex');
}

export async function generateAdvisory(userContext) {
  const { age, annualIncome, monthlySavings, taxSlab, riskCategory, instruments, horizon, shapExplanation } = userContext;
  const cacheKey = `advisory:${hashProfile(userContext)}`;

  // Check Redis cache (1 hour TTL)
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  // Guard: ensure numeric fields are safe for toLocaleString/toFixed
  const safeIncome = Number.isFinite(annualIncome) ? annualIncome : 0;
  const safeSavings = Number.isFinite(monthlySavings) ? monthlySavings : 0;
  const safeSlab = Number.isFinite(taxSlab) ? taxSlab : 0;
  const safeHorizon = Number.isFinite(horizon) ? horizon : 15;
  const safeAge = Number.isFinite(age) ? age : 30;

  const instrumentList = (instruments || []).map(i => `${i.name || 'Unknown'} (${i.type || 'N/A'}) - post-tax return: ${i.postTaxReturn || 0}%`).join('\n  ');

  // Build SHAP context block if available
  let shapContext = '';
  if (shapExplanation && shapExplanation.feature_contributions) {
    const contributions = shapExplanation.feature_contributions
      .map(c => `${c.display_name}: ${c.direction} recommendation by ${c.magnitude}`)
      .join(', ');
    shapContext = `\n\nML Model Reasoning:\nThe AI model's top reason for this recommendation was: ${shapExplanation.top_reason}\nThe feature contributions in order of importance were: ${contributions}.\nIncorporate this reasoning naturally into your advisory paragraph. Do not use technical jargon like 'SHAP values'. Write as if you are a human financial advisor explaining your logic.`;
  }

  const prompt = `You are a certified Indian financial advisor. Based on the following investor profile, write a 3-paragraph advisory note (under 300 words total):

Investor Profile:
- Age: ${safeAge} years
- Annual Income: ₹${safeIncome.toLocaleString('en-IN')}
- Monthly Savings: ₹${safeSavings.toLocaleString('en-IN')}
- Tax Slab: ${(safeSlab * 100).toFixed(0)}% marginal rate
- Risk Category: ${riskCategory || 'Moderate'}
- Investment Horizon: ${safeHorizon} years

Top 3 Recommended Instruments:
  ${instrumentList}
${shapContext}
Instructions:
Paragraph 1: Explain WHY these specific instruments suit this investor's profile (age, income, risk tolerance).
Paragraph 2: Highlight 2-3 KEY RISKS the investor should be aware of.
Paragraph 3: Provide ONE specific, actionable next step the investor should take immediately.

Use simple English. Reference specific numbers from the profile. Do not use bullet points. Keep it warm and professional.`;

  let text = '';
  let fallbackUsed = false;
  let modelUsed = '';

  // ── Attempt 1: Gemini (Primary) ──
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await axios.post(GEMINI_CHAT_URL, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
      }, {
        timeout: 15000,
        headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
      });
      text = res.data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
      if (text) {
        modelUsed = 'Gemini 3.6 Flash';
      }
    } catch (geminiErr) {
      console.warn('[Advisory] Primary Gemini API failed, falling back to Groq:', geminiErr.message);
    }
  }

  // ── Attempt 2: Groq (Secondary Fallback) ──
  if (!text) {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const response = await axios.post(GROQ_API_URL, {
          model: MODEL_NAME,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
          temperature: 0.7
        }, {
          timeout: 15000,
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          }
        });
        text = response.data?.choices?.[0]?.message?.content;
        if (text) {
          modelUsed = 'Groq Llama 3.3';
        }
      } catch (groqErr) {
        console.error('[Advisory] Fallback Groq API also failed:', groqErr.message);
      }
    }
  }

  // ── Attempt 3: Rule-Based Fallback ──
  if (!text) {
    text = getFallbackAdvisory(userContext);
    fallbackUsed = true;
    modelUsed = 'Rule-based Static Fallback';
  }

  const result = {
    text,
    cached: false,
    generatedAt: new Date().toISOString(),
    fallback: fallbackUsed,
    modelUsed,
  };

  // Cache for 1 hour if it wasn't a total static fallback (to allow retries later if keys are configured)
  if (!fallbackUsed) {
    await setCache(cacheKey, result, 3600);
  }
  return result;
}

function getFallbackAdvisory({ age, riskCategory, instruments }) {
  const safeInstruments = Array.isArray(instruments) ? instruments : [];
  const topInst = safeInstruments[0]?.name || 'diversified instruments';
  return `Based on your profile as a ${age}-year-old ${riskCategory} investor, ${topInst} aligns well with your financial goals. The recommended instruments balance growth potential with your risk tolerance, optimizing for post-tax returns under the current Indian tax regime.\n\nKey risks include market volatility affecting equity-linked instruments, interest rate changes impacting fixed-income returns, and inflation eroding purchasing power over your investment horizon. Diversification across the recommended instruments helps mitigate these risks.\n\nAs an immediate next step, consider starting a monthly SIP in your top-recommended instrument to benefit from rupee cost averaging and begin building your wealth systematically.`;
}

export async function getGoalAdvisory(message, profileContext) {
  const systemPrompt = `You are WealthGenie, an AI financial advisor for Indian retail investors. The user's profile: Age ${profileContext.age}, Income INR ${profileContext.annualIncome}/yr, Risk: ${profileContext.riskCategory}. Answer concisely in 2-3 sentences. Only give financial advice relevant to Indian markets and tax laws.`;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await axios.post(GEMINI_CHAT_URL, {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.6 }
      }, {
        timeout: 15000,
        headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
      });
      const text = res.data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
      if (text) return text;
    } catch (geminiErr) {
      console.warn('[getGoalAdvisory] Primary Gemini API failed, falling back to Groq:', geminiErr.response?.data || geminiErr.message);
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await axios.post(GROQ_API_URL, {
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 300,
        temperature: 0.6
      }, {
        timeout: 10000,
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        }
      });
      const text = res.data?.choices?.[0]?.message?.content;
      if (text) return text;
    } catch (groqErr) {
      console.error('[getGoalAdvisory] Fallback Groq API also failed:', groqErr.response?.data || groqErr.message);
    }
  }

  return 'Live AI advice is temporarily unavailable. Keep the goal SIP on schedule, review the allocation in the goal planner, and try refreshing advice again shortly.';
}
