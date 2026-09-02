import React, { useState } from 'react';
import {
  Home, Target, BarChart3, TrendingUp, Calculator, Search,
  User, Bell, HelpCircle, ChevronLeft, ChevronRight,
  FileText, Gauge, PieChart, Crosshair, Sparkles, Zap,
  LayoutDashboard, Activity, Goal, Layers, ArrowLeftRight,
  Shield, Lightbulb, BookOpen, LogOut
} from 'lucide-react';
import './Sidebar.css';
import logoImg from '../assets/logo.png';

const NAV_GROUPS = [
  {
    title: 'MY OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'health', label: 'Money Health', icon: Activity },
      { id: 'goals', label: 'My Goals', icon: Target },
    ]
  },
  {
    title: 'PLANNING TOOLS',
    items: [
      { id: 'rebalancer', label: 'Balance My Mix', icon: ArrowLeftRight },
      { id: 'sip-planner', label: 'Grow My SIP', icon: TrendingUp },
      { id: 'goal-planner', label: 'Plan a Goal', icon: Crosshair },
      { id: 'allocation', label: 'Where to Invest', icon: PieChart },
      { id: 'post-tax', label: 'Real Returns', icon: FileText },
      { id: 'tax-optimizer', label: 'Save on Taxes', icon: Shield },
      { id: 'compare', label: 'Compare Options', icon: Layers },
    ]
  },
  {
    title: 'MY ACCOUNT',
    items: [
      { id: 'profile', label: 'My Profile', icon: User },
    ]
  }
];

const Sidebar = ({ activePage, onNavigate, onLogout, insightCount = 0 }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (!onLogout || isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
        {/* ── Ambient Glow ──────────────────── */}
        <div className="sidebar-glow" />

        {/* ── Brand Header ─────────────────── */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-inner">
            <div className="sidebar-logo-wrapper">
              <img src={logoImg} alt="WealthGenie" className="sidebar-logo-img" />
              <div className="sidebar-logo-ring" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-text-group">
                <span className="sidebar-brand-text">WealthGenie</span>
                <span className="sidebar-brand-tagline">AI Advisor</span>
              </div>
            )}
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* ── Navigation ───────────────────── */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group, idx) => (
            <div key={idx} className="sidebar-group">
              {!collapsed && (
                <div className="sidebar-group-header">
                  <span className="sidebar-group-title">{group.title}</span>
                  <span className="sidebar-group-line" />
                </div>
              )}
              <div className="sidebar-group-items">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  const isHovered = hoveredItem === item.id;
                  return (
                    <button
                      key={item.id}
                      data-testid={`nav-${item.id}`}
                      className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''}`}
                      onClick={() => onNavigate(item.id)}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      title={collapsed ? item.label : ''}
                    >
                      {isActive && <div className="active-indicator" />}
                      <div className={`sidebar-icon-wrap ${isActive ? 'sidebar-icon-wrap--active' : ''}`}>
                        <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                        {isActive && <div className="icon-glow" />}
                      </div>
                      {!collapsed && (
                        <span className="sidebar-item-label">{item.label}</span>
                      )}
                      {isActive && !collapsed && (
                        <div className="active-dot" />
                      )}
                      {/* Collapsed tooltip */}
                      {collapsed && isHovered && (
                        <div className="sidebar-tooltip">
                          {item.label}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Footer ───────────────────────── */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-divider" />

          <button
            className={`sidebar-item ${activePage === 'insights' ? 'sidebar-item--active' : ''}`}
            onClick={() => onNavigate('insights')}
            onMouseEnter={() => setHoveredItem('insights')}
            onMouseLeave={() => setHoveredItem(null)}
            title={collapsed ? 'Insights' : ''}
          >
            {activePage === 'insights' && <div className="active-indicator" />}
            <div className={`sidebar-icon-wrap ${activePage === 'insights' ? 'sidebar-icon-wrap--active' : ''}`}>
              <Lightbulb size={17} strokeWidth={activePage === 'insights' ? 2.2 : 1.8} />
              {activePage === 'insights' && <div className="icon-glow" />}
              {insightCount > 0 && (
                <span className="sidebar-badge">{insightCount}</span>
              )}
            </div>
            {!collapsed && <span className="sidebar-item-label">Insights</span>}
            {activePage === 'insights' && !collapsed && (
              <div className="active-dot" />
            )}
            {collapsed && hoveredItem === 'insights' && (
              <div className="sidebar-tooltip">Insights</div>
            )}
          </button>

          <button
            className={`sidebar-item ${activePage === 'help' ? 'sidebar-item--active' : ''}`}
            onClick={() => onNavigate('help')}
            onMouseEnter={() => setHoveredItem('help')}
            onMouseLeave={() => setHoveredItem(null)}
            title={collapsed ? 'Help / Tour' : ''}
          >
            {activePage === 'help' && <div className="active-indicator" />}
            <div className={`sidebar-icon-wrap ${activePage === 'help' ? 'sidebar-icon-wrap--active' : ''}`}>
              <BookOpen size={17} strokeWidth={activePage === 'help' ? 2.2 : 1.8} />
              {activePage === 'help' && <div className="icon-glow" />}
            </div>
            {!collapsed && <span className="sidebar-item-label">Help / Tour</span>}
            {activePage === 'help' && !collapsed && (
              <div className="active-dot" />
            )}
            {collapsed && hoveredItem === 'help' && (
              <div className="sidebar-tooltip">Help / Tour</div>
            )}
          </button>

          {onLogout && (
            <button
              className="sidebar-item"
              data-testid="nav-sign-out"
              onClick={handleLogout}
              disabled={isLoggingOut}
              title={collapsed ? 'Sign out' : ''}
              aria-label="Sign out"
            >
              <div className="sidebar-icon-wrap">
                <LogOut size={17} strokeWidth={1.8} />
              </div>
              {!collapsed && <span className="sidebar-item-label">{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>}
            </button>
          )}

          {/* Powered by badge */}
          {!collapsed && (
            <div className="sidebar-powered">
              <Zap size={10} />
              <span>WealthGenie AI</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile Bottom Tab Bar ──────── */}
      <nav className="bottom-tab-bar">
        {NAV_GROUPS[0].items.concat(NAV_GROUPS[1].items.slice(0, 2)).map(item => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              className={`tab-item ${isActive ? 'tab-item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="tab-label">{item.label}</span>
              {isActive && <span className="tab-active-dot" />}
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
