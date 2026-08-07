import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = join(__dirname, '..', 'src', 'whereToInvest.js');
let content = readFileSync(filePath, 'utf-8');

// AMC map for discount brokers
const BROKER_AMC = {
  'Zerodha': 'SBI',
  'Groww': 'HDFC',
  'Angel One': 'ICICI Prudential',
  'ICICI Direct': 'Axis',
  'Upstox': 'Kotak',
};

// Instrument key category classification
function getCategory(key) {
  if (!key) return 'mf';
  const k = key.toLowerCase();
  
  if (k.includes('gold_etf') || k === 'digital_gold') return 'gold_etf';
  if (k.includes('gold_mf')) return 'gold_mf';
  if (k.includes('sgb')) return 'sgb';
  if (k.includes('reit') || k.includes('invit')) return 'reit';
  if (k.includes('stock') || k === 'direct_equity') return 'stock';
  if (k.includes('bond') || k === 'g_sec' || k === 'municipal_bonds') return 'bond';
  if (k.includes('elss')) return 'elss';
  if (k.includes('index')) return 'index';
  if (k.includes('etf')) return 'etf';
  if (k.includes('liquid')) return 'liquid';
  if (k.includes('overnight')) return 'overnight';
  if (k.includes('debt') || k.includes('short') || k.includes('ultra_short') || k.includes('low_duration') || k.includes('money_market') || k.includes('medium') || k.includes('corporate_bond') || k.includes('banking_psu') || k.includes('dynamic_bond') || k.includes('gilt') || k.includes('floater') || k.includes('credit_risk') || k.includes('floating_rate')) return 'debt';
  if (k.includes('hybrid') || k.includes('balanced') || k.includes('equity_savings') || k.includes('conservative_hybrid') || k.includes('multi_asset')) return 'hybrid';
  if (k.includes('sector') || k.includes('pharma') || k.includes('banking_sector') || k.includes('it_sector') || k.includes('infra') || k.includes('consumption') || k.includes('defence') || k.includes('psu_sector') || k.includes('auto_sector') || k.includes('fmcg') || k.includes('mfg_sector')) return 'sector';
  if (k.includes('_mf') || k.includes('cap') || k.includes('flexi') || k.includes('multi_cap') || k.includes('focused') || k.includes('value') || k.includes('contra') || k.includes('dividend_yield') || k.includes('esg') || k.includes('children') || k.includes('retirement_solution')) return 'mf';
  if (k.includes('ulip') || k.includes('endowment') || k.includes('term_mf_combo')) return 'insurance';
  
  return 'mf';
}

function cleanBaseName(name) {
  return name
    .replace(/\b(Mutual Fund|MF)\b/gi, 'Fund')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRealName(key, oldName, viaTarget) {
  const target = viaTarget.trim();
  
  // Case 1: Broker via target (Zerodha, Groww, Angel One, ICICI Direct, Upstox)
  if (BROKER_AMC[target]) {
    const amc = BROKER_AMC[target];
    const cat = getCategory(key);
    const baseName = oldName.replace(/\s+via\s+.*$/i, '').trim();

    switch (cat) {
      case 'gold_etf':
        return `${amc} Gold ETF`;
      case 'gold_mf':
        return `${amc} Gold Fund (Direct Growth)`;
      case 'sgb':
        if (key === 'sgb_secondary') return `Sovereign Gold Bond Secondary Tranche (${target})`;
        return `Sovereign Gold Bond (RBI Issue)`;
      case 'reit':
      case 'bond':
        return `${baseName} (Direct Plan)`;
      case 'elss':
        return `${amc} ELSS Tax Saver Fund (Direct Growth)`;
      case 'index':
        return `${amc} Nifty 50 Index Fund (Direct Growth)`;
      case 'liquid':
        return `${amc} Liquid Fund (Direct Growth)`;
      case 'overnight':
        return `${amc} Overnight Fund (Direct Growth)`;
      case 'debt':
        return `${amc} ${cleanBaseName(baseName)} (Direct Growth)`;
      case 'hybrid':
        return `${amc} ${cleanBaseName(baseName)} (Direct Growth)`;
      case 'sector':
        return `${amc} ${cleanBaseName(baseName)} (Direct Growth)`;
      case 'insurance':
        const lifeAmc = amc === 'SBI' ? 'SBI Life' : amc === 'HDFC' ? 'HDFC Life' : amc === 'ICICI Prudential' ? 'ICICI Prudential Life' : amc === 'Axis' ? 'Max Life' : 'Kotak Life';
        return `${lifeAmc} ${cleanBaseName(baseName)}`;
      default:
        return `${amc} ${cleanBaseName(baseName)} (Direct Growth)`;
    }
  }

  // Case 2: Bank / Channel via target (SBI, HDFC Bank, ICICI Bank, India Post, Axis Bank / Punjab National Bank, etc.)
  const baseScheme = oldName.replace(/\s+via\s+.*$/i, '').trim();
  let providerPrefix = target;
  if (target.includes('Axis Bank')) providerPrefix = 'Axis / PNB Bank';
  
  return `${providerPrefix} ${baseScheme}`;
}

// Find instrument key for each index
const keyPattern = /^\s*"([a-z_0-9]+)":\s*\{/gm;
const keys = [];
let match;
while ((match = keyPattern.exec(content)) !== null) {
  keys.push({ key: match[1], startIndex: match.index });
}

function findKeyForIndex(idx) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const nextK = keys[i + 1];
    if (idx >= k.startIndex && (!nextK || idx < nextK.startIndex)) {
      return k.key;
    }
  }
  return null;
}

// Match any "name": "... via ..."
let replacements = 0;
const viaPattern = /("name":\s*")([^"]+)\s+via\s+([^"]+)(")/g;

let newContent = content.replace(viaPattern, (fullMatch, prefix, baseName, viaTarget, suffix) => {
  if (/LRS/i.test(viaTarget)) {
    return fullMatch;
  }
  const matchIndex = content.indexOf(fullMatch);
  const key = findKeyForIndex(matchIndex);
  
  const newName = buildRealName(key, `${baseName} via ${viaTarget}`, viaTarget);
  replacements++;
  return `${prefix}${newName}${suffix}`;
});

writeFileSync(filePath, newContent, 'utf-8');
console.log(`✅ Transformed ${replacements} product names in whereToInvest.js`);
