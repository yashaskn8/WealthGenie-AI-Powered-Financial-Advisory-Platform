import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { getMarketRates, refreshMarketRates } from '../services/api';

/**
 * DataFreshnessBar — displays live/static data source indicators
 * for each instrument type used in projections.
 *
 * Green dot = live (derived from Yahoo Finance index data)
 * Amber dot = static (hardcoded, manually reviewed)
 */
const DataFreshnessBar = ({ instruments = [] }) => {
  const [dataSources, setDataSources] = useState(null);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const data = await getMarketRates();
      setDataSources(data);
    } catch {
      // Graceful degradation — hide bar if market API is unavailable
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleRefresh = async () => {
    if (refreshCooldown) return;
    setRefreshing(true);
    try {
      await refreshMarketRates();
      // Start cooldown (60s)
      setRefreshCooldown(true);
      setTimeout(() => setRefreshCooldown(false), 60000);
      // Refetch after a brief delay
      setTimeout(() => fetchSources(), 3500);
    } catch {
      // Ignore — refresh is best-effort
    } finally {
      setRefreshing(false);
    }
  };

  if (!dataSources?.instrument_data_sources) return null;

  const sources = dataSources.instrument_data_sources;
  const relevantInstruments = instruments.length > 0
    ? instruments.filter(i => sources[i])
    : Object.keys(sources);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 14px', borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      fontSize: 12, color: '#94a3b8',
      marginBottom: 12,
    }}>
      <Clock size={13} style={{ opacity: 0.6 }} />
      <span style={{ marginRight: 4, fontWeight: 500, color: '#cbd5e1' }}>Data Sources:</span>

      {relevantInstruments.map(key => {
        const src = sources[key];
        if (!src) return null;
        const isLive = src.source === 'live';
        const color = isLive ? '#10b981' : '#f59e0b';
        const tooltip = isLive
          ? `${key}: Live — derived from ${src.based_on || 'index data'}`
          : `${key}: Static — last reviewed ${src.last_reviewed || 'unknown'}. May not reflect current rates.`;

        return (
          <span
            key={key}
            title={tooltip}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 6,
              background: isLive ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${isLive ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
              cursor: 'help',
            }}
          >
            {isLive
              ? <CheckCircle size={10} color={color} />
              : <AlertTriangle size={10} color={color} />
            }
            <span style={{ color }}>{key}</span>
          </span>
        );
      })}

      <button
        onClick={handleRefresh}
        disabled={refreshCooldown || refreshing}
        title={refreshCooldown ? 'Cooldown: wait 60s between refreshes' : 'Refresh live data from Yahoo Finance'}
        style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 6,
          background: refreshCooldown ? 'rgba(255,255,255,0.03)' : 'rgba(6,182,212,0.1)',
          border: `1px solid ${refreshCooldown ? 'rgba(255,255,255,0.06)' : 'rgba(6,182,212,0.2)'}`,
          color: refreshCooldown ? '#475569' : '#06b6d4',
          cursor: refreshCooldown ? 'not-allowed' : 'pointer',
          fontSize: 11, fontWeight: 500,
          transition: 'all 0.2s ease',
        }}
      >
        <RefreshCw size={11} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        {refreshCooldown ? 'Cooling down…' : 'Refresh Live'}
      </button>
    </div>
  );
};

export default DataFreshnessBar;
