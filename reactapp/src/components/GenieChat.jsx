import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Trash2, Sparkles, RefreshCw, Scale, Coins, Percent, Target, ArrowLeft, ExternalLink, Mic, MicOff } from 'lucide-react';
import JargonTooltip from './JargonTooltip';
import './GenieChat.css';
import * as api from '../services/api';
import {
  formatFullINR,
  calculateStepUpSIP,
  calculateTaxes,
  getSuggestedQuestions,
  generateContextualPills
} from '../utils/genieChatHelpers.js';
import {
  MessageBubble,
  ProactiveNudge,
  PortfolioSnapshot,
  GenieFAB
} from './GenieChatSubcomponents.jsx';

// ── Main Component ────────────────────────────────────────────────
const GenieChat = ({ profile, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimit, setRateLimit] = useState({ remaining: 30, total: 30 });
  const [isListening, setIsListening] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    const stored = sessionStorage.getItem('genie_session_id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('genie_session_id', newId);
    return newId;
  });
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // ── 2026 Agentic Workspace State ────────────────────────────────
  const [activeWorkspace, setActiveWorkspace] = useState(null); // null | 'rebalancer' | 'sip-planner' | 'tax-optimizer'

  // Rebalancer Workspace parameters
  const [targetEquity, setTargetEquity] = useState(60);
  const [rebalanceMonthlySIP, setRebalanceMonthlySIP] = useState(12000);

  // SIP Step-Up parameters
  const [sipMonthlyAmount, setSipMonthlyAmount] = useState(12000);
  const [sipStepUpPercent, setSipStepUpPercent] = useState(10);
  const [sipHorizon, setSipHorizon] = useState(15);

  // Tax Optimizer parameters
  const [taxGrossIncome, setTaxGrossIncome] = useState(780000);
  const [tax80C, setTax80C] = useState(150000);
  const [taxNPS, setTaxNPS] = useState(50000);

  useEffect(() => {
    if (profile) {
      setTargetEquity(profile.recommendedEquityAllocation || (profile.risk_appetite === 'High' ? 80 : profile.risk_appetite === 'Low' ? 30 : 60));
      setRebalanceMonthlySIP(profile.monthly_savings || profile.savings || 12000);
      setSipMonthlyAmount(profile.monthly_savings || profile.savings || 12000);
      setSipHorizon(profile.investment_horizon || profile.investmentHorizon || 15);
      setTaxGrossIncome(profile.annualIncome || (profile.monthly_income || profile.income || 65000) * 12);
    }
  }, [profile]);

  const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const lastAssistantMsg = messages.filter(m => m.role === 'assistant').slice(-1)[0];

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getChatHistory(sessionId);
      if (data.conversations?.[0]?.messages) {
        setMessages(data.conversations[0].messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content, timestamp: m.timestamp || new Date().toISOString(), latency_ms: m.metadata?.latency_ms, _streamed: true })));
      }
    } catch {
      // Graceful error handle — fallback silently to empty chat history
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen && sessionId && messages.length === 0) {
      loadHistory();
    }
  }, [isOpen, sessionId, messages.length, loadHistory]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  // Voice recognition setup
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-IN';
      recognitionRef.current.onresult = (e) => { const t = e.results[0][0].transcript; setInput(prev => prev + t); setIsListening(false); };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else { recognitionRef.current.start(); setIsListening(true); }
  };

  const handleAction = useCallback((action) => {
    if (action.action === 'navigate' && action.target && onNavigate) {
      const TARGET_MAPPING = {
        '/rebalancer': 'rebalancer',
        '/stepup': 'sip-planner',
        '/tax': 'tax-optimizer',
        '/goals': 'goals',
        '/comparison': 'compare'
      };
      const page = TARGET_MAPPING[action.target];
      if (page) {
        if (['rebalancer', 'sip-planner', 'tax-optimizer'].includes(page)) {
          setActiveWorkspace(page);
        } else {
          onNavigate(page);
          setIsOpen(false); // Close chatbot panel on successful navigation
        }
      }
    }
  }, [onNavigate]);

  const sendMessage = useCallback(async (text) => {
    const messageText = (text || input).trim();
    if (!messageText || isLoading) return;
    setInput(''); setError(null);
    setMessages(prev => [...prev, { role: 'user', content: messageText, timestamp: new Date().toISOString() }]);
    setIsLoading(true);
    try {
      const data = await api.sendChatMessage(messageText, sessionId);
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: new Date().toISOString(), latency_ms: data.latency_ms, citations: data.citations || [], _streamed: false }]);
      setRateLimit({ remaining: data.rate_limit_remaining, total: 30 });
    } catch (err) { setError(err.message || 'Genie is temporarily unavailable.'); }
    finally { setIsLoading(false); inputRef.current?.focus(); }
  }, [input, isLoading, sessionId]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const clearChat = async () => {
    try {
      await api.clearChatSession(sessionId);
    } catch {
      // Best effort deletion, fallback to local reset
    }
    setMessages([]); setError(null); setRateLimit({ remaining: 30, total: 30 });
    const newId = crypto.randomUUID(); sessionStorage.setItem('genie_session_id', newId); setSessionId(newId);
  };

  const suggestedQuestions = getSuggestedQuestions(profile);
  const pills = generateContextualPills(lastUserMessage);

  return (
    <>
      {!isOpen && <GenieFAB onClick={() => setIsOpen(true)} hasNudge={!!profile} />}
      {isOpen && (
        <div className={`genie-panel ${activeWorkspace ? 'genie-panel--with-workspace' : ''}`}>
          <div className="genie-panel-chat-pane">
            {/* Header */}
            <div className="genie-panel-header">
              <div className="genie-header-left">
                <div className="genie-avatar-wrap"><span className="ba-letter">G</span></div>
                <div>
                  <div className="genie-header-title">Genie <span className="genie-agentic-badge">AGENTIC AI</span></div>
                  <div className="genie-header-sub"><span className="online-dot"></span> Financial Co-Pilot · Powered by Gemini</div>
                </div>
              </div>
              <div className="genie-header-actions">
                <span className={`rate-limit-badge ${rateLimit.remaining <= 5 ? 'rate-limit-warning' : ''}`}>{rateLimit.remaining <= 0 ? 'Limit reached' : `${rateLimit.remaining}/${rateLimit.total}`}</span>
                <button onClick={clearChat} title="Clear chat"><Trash2 size={16} /></button>
                <button onClick={() => setIsOpen(false)} title="Close"><X size={18} /></button>
              </div>
            </div>

            {/* Messages */}
            <div className="genie-messages">
              {messages.length === 0 && !isLoading && (
                <div className="genie-welcome">
                  <div className="genie-welcome-glow" />
                  <div className="genie-welcome-avatar"><div className="welcome-avatar-ring"><span className="ba-letter ba-large">G</span></div></div>
                  <p className="welcome-headline">Hi{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}! I'm <strong>Genie</strong></p>
                  <p className="welcome-sub">Your agentic financial co-pilot. I generate <strong style={{ color: '#38bdf8' }}>interactive action plans</strong> with one-click execution.</p>
                  <PortfolioSnapshot profile={profile} />
                  <div className="welcome-capability-cards">
                    <div className="capability-card"><Scale size={15} style={{color:'#38bdf8'}}/><span>Rebalancing</span></div>
                    <div className="capability-card"><Percent size={15} style={{color:'#22c55e'}}/><span>Tax Saving</span></div>
                    <div className="capability-card"><Coins size={15} style={{color:'#a855f7'}}/><span>SIP Step-Up</span></div>
                    <div className="capability-card"><Target size={15} style={{color:'#f59e0b'}}/><span>Goal Tracking</span></div>
                  </div>
                  {suggestedQuestions.length > 0 && (
                    <div className="welcome-suggestions">
                      {suggestedQuestions.map((q, i) => <button key={i} className="suggestion-pill" onClick={() => sendMessage(q)}><Sparkles size={12} /> {q}</button>)}
                    </div>
                  )}
                </div>
              )}

              <ProactiveNudge profile={profile} onAsk={sendMessage} />

              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} onAction={handleAction} isLatest={i === messages.length - 1} />)}

              {isLoading && (
                <div className="chat-bubble chat-bubble--genie">
                  <div className="bubble-avatar"><span className="ba-letter">G</span></div>
                  <div className="typing-indicator">
                    <div className="typing-label">Genie is analyzing your finances</div>
                    <div className="typing-dots"><span></span><span></span><span></span></div>
                  </div>
                </div>
              )}
              {error && <div className="chat-error-banner">{error}</div>}
              <div ref={chatEndRef} />
            </div>

            {/* Follow-up pills */}
            {messages.length > 0 && !isLoading && lastAssistantMsg?.content?.length > 50 && (
              <div className="quick-replies">
                {pills.map((p, i) => <button key={i} className="quick-chip follow-up" onClick={() => sendMessage(p)}><Sparkles size={12} /> {p}</button>)}
              </div>
            )}

            {/* Input Bar */}
            <div className="genie-input-bar">
              {recognitionRef.current && (
                <button className={`voice-btn ${isListening ? 'voice-active' : ''}`} onClick={toggleVoice} title="Voice input">
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={isListening ? 'Listening...' : 'Ask Genie for a financial action plan...'} className="genie-input" maxLength={1000} disabled={isLoading || rateLimit.remaining === 0} />
              <button className="genie-send-btn" onClick={() => sendMessage()} disabled={isLoading || !input.trim() || rateLimit.remaining === 0}>
                {isLoading ? <RefreshCw size={18} className="spin-icon" /> : <Send size={18} />}
              </button>
            </div>
            <div className="genie-disclaimer">Agentic AI Co-Pilot · Not SEBI-registered advice · Powered by Gemini + Groq</div>
          </div>

          {activeWorkspace && (
            <div className="genie-panel-workspace-pane">
              <div className="workspace-header">
                <div className="workspace-title-section">
                  <button className="workspace-back-btn" onClick={() => setActiveWorkspace(null)} title="Back to Chat">
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <div className="workspace-title">
                      {activeWorkspace === 'rebalancer' && <span>Rebalancer Sandbox</span>}
                      {activeWorkspace === 'sip-planner' && <span>Step-Up <JargonTooltip term="SIP">SIP</JargonTooltip> Sandbox</span>}
                      {activeWorkspace === 'tax-optimizer' && 'Tax Regime Comparison'}
                    </div>
                    <div className="workspace-subtitle">Interactive AI Agent Workspace</div>
                  </div>
                </div>
                <div className="workspace-header-actions">
                  <button className="workspace-fullscreen-btn" onClick={() => { onNavigate(activeWorkspace); setIsOpen(false); }} title="Open Fullscreen Tool">
                    <ExternalLink size={14} /> Open Fullscreen
                  </button>
                  <button className="workspace-close-btn" onClick={() => setActiveWorkspace(null)}>✕</button>
                </div>
              </div>

              <div className="workspace-content">
                {activeWorkspace === 'rebalancer' && (
                  <div className="workspace-sandbox">
                    <div className="sandbox-intro">
                      <Sparkles size={14} className="text-sky" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>Adjust target asset allocations to simulate a low-cost, natural rebalancing plan.</span>
                    </div>

                    <div className="sandbox-group">
                      <div className="sandbox-label-row">
                        <span className="sandbox-label"><Scale size={14} /> Target <JargonTooltip term="Asset Allocation">Equity Allocation</JargonTooltip></span>
                        <span className="sandbox-val text-sky">{targetEquity}%</span>
                      </div>
                      <input type="range" min="10" max="90" step="5" value={targetEquity} onChange={e => setTargetEquity(Number(e.target.value))} className="sandbox-slider" />
                      <div className="slider-limits"><span>10% Equity (Conservative)</span><span>90% Equity (Aggressive)</span></div>
                    </div>

                    <div className="sandbox-group">
                      <div className="sandbox-label-row">
                        <span className="sandbox-label"><Coins size={14} /> Monthly <JargonTooltip term="SIP">SIP</JargonTooltip> Amount</span>
                        <span className="sandbox-val text-sky">₹{rebalanceMonthlySIP.toLocaleString('en-IN')}</span>
                      </div>
                      <input type="range" min="1000" max="100000" step="1000" value={rebalanceMonthlySIP} onChange={e => setRebalanceMonthlySIP(Number(e.target.value))} className="sandbox-slider" />
                      <div className="slider-limits"><span>₹1K</span><span>₹100K</span></div>
                    </div>

                    {/* Target Allocation Visual Bar */}
                    <div className="allocation-visualizer">
                      <div className="vis-bars-header">Asset Targets</div>
                      <div className="vis-bar-row">
                        <span className="vis-bar-label">Equity ({targetEquity}%)</span>
                        <div className="vis-bar-track"><div className="vis-bar-fill fill-equity" style={{ width: `${targetEquity}%` }} /></div>
                      </div>
                      <div className="vis-bar-row">
                        <span className="vis-bar-label">Debt ({100 - targetEquity}%)</span>
                        <div className="vis-bar-track"><div className="vis-bar-fill fill-debt" style={{ width: `${100 - targetEquity}%` }} /></div>
                      </div>
                    </div>

                    {/* Directed Monthly Plan */}
                    <div className="directed-inflows-card">
                      <div className="inflow-title">Directed Monthly Allocation Plan:</div>
                      <div className="inflow-rows">
                        <div className="inflow-row">
                           <span className="inflow-label"><JargonTooltip term="Equity">Equity Allocation</JargonTooltip>:</span>
                          <span className="inflow-val text-sky">₹{Math.round(rebalanceMonthlySIP * targetEquity / 100).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="inflow-row">
                          <span className="inflow-label"><JargonTooltip term="Debt Fund">Debt Allocation</JargonTooltip>:</span>
                          <span className="inflow-val text-purple">₹{Math.round(rebalanceMonthlySIP * (100 - targetEquity) / 100).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="inflow-insight">
                        <ChevronRight size={14} className="insight-icon" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>Genie advises allocating ₹{Math.round(rebalanceMonthlySIP * (100 - targetEquity) / 100).toLocaleString('en-IN')} to debt investments. This naturally keeps your investment mix on track as your stocks grow, without triggers for extra taxes or fees.</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeWorkspace === 'sip-planner' && (() => {
                  const stdVal = calculateStepUpSIP(sipMonthlyAmount, 0, sipHorizon);
                  const stepUpVal = calculateStepUpSIP(sipMonthlyAmount, sipStepUpPercent, sipHorizon);
                  const diff = stepUpVal.terminalValue - stdVal.terminalValue;
                  const pct = Math.max(10, Math.round((diff / stdVal.terminalValue) * 100));

                  return (
                    <div className="workspace-sandbox">
                      <div className="sandbox-intro">
                        <Sparkles size={14} className="text-purple" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>Simulate compounding growth with a yearly booster SIP to multiply your terminal wealth.</span>
                      </div>

                      <div className="sandbox-group">
                        <div className="sandbox-label-row">
                          <span className="sandbox-label"><Coins size={14} /> Base Monthly <JargonTooltip term="SIP">SIP</JargonTooltip></span>
                          <span className="sandbox-val text-purple">₹{sipMonthlyAmount.toLocaleString('en-IN')}</span>
                        </div>
                        <input type="range" min="1000" max="100000" step="1000" value={sipMonthlyAmount} onChange={e => setSipMonthlyAmount(Number(e.target.value))} className="sandbox-slider" />
                        <div className="slider-limits"><span>₹1K</span><span>₹100K</span></div>
                      </div>

                      <div className="sandbox-group">
                        <div className="sandbox-label-row">
                          <span className="sandbox-label"><Percent size={14} /> Yearly <JargonTooltip term="SIP">SIP</JargonTooltip> Increase %</span>
                          <span className="sandbox-val text-purple">{sipStepUpPercent}%</span>
                        </div>
                        <input type="range" min="0" max="25" step="1" value={sipStepUpPercent} onChange={e => setSipStepUpPercent(Number(e.target.value))} className="sandbox-slider" />
                        <div className="slider-limits"><span>0% (Flat)</span><span>25% (Booster)</span></div>
                      </div>

                      <div className="sandbox-group">
                        <div className="sandbox-label-row">
                          <span className="sandbox-label"><Target size={14} /> Years to Invest</span>
                          <span className="sandbox-val text-purple">{sipHorizon} Years</span>
                        </div>
                        <input type="range" min="5" max="35" step="1" value={sipHorizon} onChange={e => setSipHorizon(Number(e.target.value))} className="sandbox-slider" />
                        <div className="slider-limits"><span>5 Yrs</span><span>35 Yrs</span></div>
                      </div>

                      {/* Visual Bar Comparison */}
                      <div className="comparison-viz">
                        <div className="comp-bars-header">Accumulated Wealth Projections (12% <JargonTooltip term="CAGR">yearly growth</JargonTooltip>)</div>
                        <div className="comp-bar-container">
                          <div className="comp-bar-label-col">Flat <JargonTooltip term="SIP">SIP</JargonTooltip></div>
                          <div className="comp-bar-val-col">
                            <div className="comp-bar-fill-track">
                              <div className="comp-bar-fill bg-grey" style={{ width: '50%' }} />
                            </div>
                            <span className="comp-val">₹{(stdVal.terminalValue / 100000).toFixed(1)}L</span>
                          </div>
                        </div>

                        <div className="comp-bar-container">
                          <div className="comp-bar-label-col">Step-Up</div>
                          <div className="comp-bar-val-col">
                            <div className="comp-bar-fill-track">
                              <div className="comp-bar-fill bg-gradient-purple" style={{ width: `${Math.min(100, 50 * (1 + pct / 100))}%` }} />
                            </div>
                            <span className="comp-val text-purple font-bold">₹{(stepUpVal.terminalValue / 100000).toFixed(1)}L</span>
                          </div>
                        </div>
                      </div>

                      {/* Wealth boost highlight card */}
                      <div className="wealth-boost-card">
                        <div className="boost-header">
                          <TrendingUp size={20} className="text-green" />
                          <div>
                            <div className="boost-title">Hyper-Compounding Bonus: +{pct}%</div>
                            <div className="boost-val">Extra ₹{(diff / 100000).toFixed(1)}L Saved</div>
                          </div>
                        </div>
                        <div className="boost-details">
                          Total Invested: ₹{(stepUpVal.totalInvested / 100000).toFixed(1)}L (vs ₹{(stdVal.totalInvested / 100000).toFixed(1)}L for Flat). The yearly {sipStepUpPercent}% increase adds over ₹{diff.toLocaleString('en-IN')} in extra growth by compounding your savings over time.
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {activeWorkspace === 'tax-optimizer' && (() => {
                  const taxes = calculateTaxes(taxGrossIncome, tax80C, taxNPS);

                  return (
                    <div className="workspace-sandbox">
                      <div className="sandbox-intro">
                        <Sparkles size={14} className="text-orange" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>Optimize regime selection dynamically based on custom annual gross income and deductions.</span>
                      </div>

                      <div className="sandbox-group">
                        <div className="sandbox-label-row">
                          <span className="sandbox-label"><Coins size={14} /> Annual Gross Income</span>
                          <span className="sandbox-val text-orange">{formatFullINR(taxGrossIncome)}</span>
                        </div>
                        <input type="range" min="300000" max="3000000" step="50000" value={taxGrossIncome} onChange={e => setTaxGrossIncome(Number(e.target.value))} className="sandbox-slider" />
                        <div className="slider-limits"><span>₹3L</span><span>₹30L</span></div>
                      </div>

                      <div className="sandbox-group">
                        <div className="sandbox-label-row">
                          <span className="sandbox-label"><Percent size={14} /> <JargonTooltip term="Section 80C">Section 80C</JargonTooltip> Deductions (Old Regime)</span>
                          <span className="sandbox-val text-orange">{formatFullINR(tax80C)}</span>
                        </div>
                        <input type="range" min="0" max="150000" step="5000" value={tax80C} onChange={e => setTax80C(Number(e.target.value))} className="sandbox-slider" />
                        <div className="slider-limits"><span>₹0</span><span>₹1.5L Max</span></div>
                      </div>

                      <div className="sandbox-group">
                        <div className="sandbox-label-row">
                          <span className="sandbox-label"><Coins size={14} /> Section 80CCD(1B) (<JargonTooltip term="NPS">NPS</JargonTooltip>) Deductions</span>
                          <span className="sandbox-val text-orange">{formatFullINR(taxNPS)}</span>
                        </div>
                        <input type="range" min="0" max="50000" step="5000" value={taxNPS} onChange={e => setTaxNPS(Number(e.target.value))} className="sandbox-slider" />
                        <div className="slider-limits"><span>₹0</span><span>₹50K Max</span></div>
                      </div>

                      {/* Side-by-side Comparative Table */}
                      <div className="tax-comparison-table">
                        <div className="tax-table-header">
                          <div className="tax-th">Parameter</div>
                          <div className="tax-th text-center">New Regime</div>
                          <div className="tax-th text-center">Old Regime</div>
                        </div>
                        <div className="tax-table-row">
                          <div className="tax-td">Gross Income</div>
                          <div className="tax-td text-center">{formatFullINR(taxGrossIncome)}</div>
                          <div className="tax-td text-center">{formatFullINR(taxGrossIncome)}</div>
                        </div>
                        <div className="tax-table-row">
                          <div className="tax-td">Std Deduction</div>
                          <div className="tax-td text-center text-green">-{formatFullINR(75000)}</div>
                          <div className="tax-td text-center text-green">-{formatFullINR(50000)}</div>
                        </div>
                        <div className="tax-table-row">
                          <div className="tax-td">80C/NPS Deductions</div>
                          <div className="tax-td text-center text-grey">Nil</div>
                          <div className="tax-td text-center text-green">-{formatFullINR(Math.min(150000, tax80C) + Math.min(50000, taxNPS))}</div>
                        </div>
                        <div className="tax-table-row font-bold border-t border-b">
                          <div className="tax-td">Computed Tax</div>
                          <div className="tax-td text-center text-sky">{formatFullINR(taxes.taxNew)}</div>
                          <div className="tax-td text-center text-purple">{formatFullINR(taxes.taxOld)}</div>
                        </div>
                      </div>

                      {/* Verdict Banner */}
                      <div className={`tax-verdict-card ${taxes.betterRegime === 'new' ? 'verdict-new' : 'verdict-old'}`}>
                        <div className="verdict-title">
                          Regime Verdict: {taxes.betterRegime === 'new' ? 'NEW REGIME WINS' : 'OLD REGIME WINS'}
                        </div>
                        <div className="verdict-desc">
                          {taxes.difference === 0 ? (
                            <span>Both regimes result in the exact same tax output. New Regime is recommended for its absolute simplicity and zero capital lock-in.</span>
                          ) : (
                            <span>The <strong className="font-bold">{taxes.betterRegime.toUpperCase()} Regime</strong> is mathematically superior, saving you <strong className="font-bold">{formatFullINR(taxes.difference)}</strong> in taxes this year!</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default GenieChat;
