"""
Design Token Migration Utility for WealthGenie Frontend CSS Files
Systematically replaces hardcoded hex colors, magic pixel spacing/radii/fonts with unified CSS variables.
"""

import sys
from pathlib import Path

REPLACEMENTS = [
    # 1. Colors - Hex values
    ('#f8fafc', 'var(--text-primary)'),
    ('#f1f5f9', 'var(--color-gray-100)'),
    ('#e2e8f0', 'var(--color-gray-200)'),
    ('#cbd5e1', 'var(--text-secondary)'),
    ('#94a3b8', 'var(--text-muted)'),
    ('#64748b', 'var(--text-dim)'),
    ('#475569', 'var(--text-faint)'),
    ('#546178', 'var(--text-dim)'),
    ('#334155', 'var(--color-gray-700)'),
    ('#1e293b', 'var(--color-gray-800)'),
    ('#0f172a', 'var(--color-gray-900)'),
    ('#020617', 'var(--color-gray-950)'),
    ('#040810', 'var(--surface-0)'),
    ('#080e1c', 'var(--surface-1)'),
    ('#0c1424', 'var(--surface-2)'),
    ('#111a30', 'var(--surface-3)'),
    ('#18223c', 'var(--surface-4)'),
    ('#38bdf8', 'var(--color-primary)'),
    ('#0ea5e9', 'var(--color-primary-500)'),
    ('#0284c7', 'var(--color-primary-dark)'),
    ('#7dd3fc', 'var(--color-primary-light)'),
    ('#818cf8', 'var(--color-secondary)'),
    ('#6366f1', 'var(--color-secondary-500)'),
    ('#a78bfa', 'var(--color-violet-light)'),
    ('#8b5cf6', 'var(--color-violet)'),
    ('#7c3aed', 'var(--color-violet-600)'),
    ('#34d399', 'var(--color-success-light)'),
    ('#10b981', 'var(--color-success)'),
    ('#059669', 'var(--color-success-600)'),
    ('#fbbf24', 'var(--color-warning-light)'),
    ('#f59e0b', 'var(--color-warning)'),
    ('#e2b953', 'var(--color-accent-gold)'),
    ('#dfbd69', 'var(--color-accent-gold)'),
    ('#fb7185', 'var(--color-error-light)'),
    ('#ef4444', 'var(--color-error)'),
    ('#f43f5e', 'var(--color-error-light)'),
    ('#dc2626', 'var(--color-error-600)'),
    
    # 2. Colors - RGBA Alphas
    ('rgba(56, 189, 248, 0.08)', 'var(--color-primary-bg)'),
    ('rgba(56, 189, 248, 0.1)', 'var(--color-primary-bg)'),
    ('rgba(56, 189, 248, 0.15)', 'var(--color-primary-hover)'),
    ('rgba(56, 189, 248, 0.2)', 'var(--color-primary-border)'),
    ('rgba(56, 189, 248, 0.25)', 'var(--color-primary-border)'),
    ('rgba(16, 185, 129, 0.08)', 'var(--color-success-bg)'),
    ('rgba(16, 185, 129, 0.1)', 'var(--color-success-bg)'),
    ('rgba(16, 185, 129, 0.15)', 'var(--color-success-hover)'),
    ('rgba(16, 185, 129, 0.2)', 'var(--color-success-border)'),
    ('rgba(16, 185, 129, 0.25)', 'var(--color-success-border)'),
    ('rgba(239, 68, 68, 0.08)', 'var(--color-error-bg)'),
    ('rgba(239, 68, 68, 0.1)', 'var(--color-error-bg)'),
    ('rgba(239, 68, 68, 0.15)', 'var(--color-error-hover)'),
    ('rgba(239, 68, 68, 0.2)', 'var(--color-error-border)'),
    ('rgba(239, 68, 68, 0.25)', 'var(--color-error-border)'),
    ('rgba(139, 92, 246, 0.05)', 'rgba(var(--color-violet-rgb), 0.05)'),
    ('rgba(139, 92, 246, 0.08)', 'var(--color-violet-bg)'),
    ('rgba(139, 92, 246, 0.1)', 'var(--color-violet-bg)'),
    ('rgba(139, 92, 246, 0.15)', 'var(--color-violet-hover)'),
    ('rgba(139, 92, 246, 0.2)', 'var(--color-violet-border)'),
    ('rgba(139, 92, 246, 0.25)', 'var(--color-violet-border)'),
    ('rgba(255, 255, 255, 0.04)', 'var(--border-subtle)'),
    ('rgba(255, 255, 255, 0.06)', 'var(--border-subtle)'),
    ('rgba(255, 255, 255, 0.08)', 'var(--border-default)'),
    ('rgba(255, 255, 255, 0.1)', 'var(--border-default)'),
    ('rgba(255, 255, 255, 0.12)', 'var(--border-default)'),
    ('rgba(255, 255, 255, 0.15)', 'var(--border-hover)'),
    ('rgba(255, 255, 255, 0.18)', 'var(--border-hover)'),
    ('rgba(255, 255, 255, 0.2)', 'var(--border-strong)'),
    ('rgba(255, 255, 255, 0.25)', 'var(--border-strong)'),
    ('rgba(15, 23, 42, 0.45)', 'var(--surface-panel)'),
    ('rgba(15, 23, 42, 0.55)', 'var(--surface-panel)'),
    ('rgba(15, 23, 42, 0.65)', 'var(--surface-card)'),
    ('rgba(12, 20, 36, 0.7)', 'var(--surface-card)'),
    ('rgba(12, 20, 36, 0.65)', 'var(--glass-bg)'),
    ('rgba(8, 14, 28, 0.75)', 'var(--surface-input)'),
    ('rgba(2, 6, 23, 0.75)', 'var(--surface-backdrop)'),
    ('rgba(4, 8, 16, 0.82)', 'var(--surface-overlay)'),

    # 3. Typography
    ("'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif", 'var(--font-sans)'),
    ("'Outfit', 'Inter', -apple-system, sans-serif", 'var(--font-sans)'),
    ("'Outfit', 'Inter', sans-serif", 'var(--font-sans)'),
    ("'Inter', system-ui, sans-serif", 'var(--font-sans)'),
    ("'Inter', sans-serif", 'var(--font-sans)'),
    ('font-family: Inter, sans-serif', 'font-family: var(--font-sans)'),
    ('font-family: Outfit, sans-serif', 'font-family: var(--font-sans)'),

    # 4. Radii
    ('border-radius: 999px', 'border-radius: var(--radius-full)'),
    ('border-radius: 9999px', 'border-radius: var(--radius-full)'),
    ('border-radius: 32px', 'border-radius: var(--radius-2xl)'),
    ('border-radius: 28px', 'border-radius: var(--radius-xl)'),
    ('border-radius: 24px', 'border-radius: var(--radius-xl)'),
    ('border-radius: 20px', 'border-radius: var(--radius-lg)'),
    ('border-radius: 16px', 'border-radius: var(--radius-lg)'),
    ('border-radius: 14px', 'border-radius: var(--radius-md)'),
    ('border-radius: 12px', 'border-radius: var(--radius-md)'),
    ('border-radius: 10px', 'border-radius: var(--radius-sm)'),
    ('border-radius: 8px', 'border-radius: var(--radius-sm)'),
    ('border-radius: 6px', 'border-radius: var(--radius-xs)'),
    ('border-radius: 4px', 'border-radius: var(--radius-xs)'),

    # 5. Transitions
    ('cubic-bezier(0.16, 1, 0.3, 1)', 'var(--ease-out-expo)'),
    ('cubic-bezier(0.34, 1.56, 0.64, 1)', 'var(--ease-spring)'),
    ('cubic-bezier(0.2, 0.8, 0.2, 1)', 'var(--ease-smooth)'),
]

def migrate_file(rel_path: str):
    root1 = Path(r'C:\Projects\final wealthgenie\reactapp')
    root2 = Path(r'c:\Users\prana\OneDrive\Desktop\final wealthgenie\reactapp')
    
    p1 = root1 / rel_path
    p2 = root2 / rel_path
    
    if not p1.exists():
        print(f"ERROR: {p1} not found")
        sys.exit(1)
        
    content = p1.read_text(encoding='utf-8')
    new_content = content
    
    count = 0
    for src, tgt in REPLACEMENTS:
        if src in new_content:
            occurrences = new_content.count(src)
            count += occurrences
            new_content = new_content.replace(src, tgt)
            
    p1.write_text(new_content, encoding='utf-8')
    if p2.parent.exists():
        p2.write_text(new_content, encoding='utf-8')
        
    print(f"Migrated {rel_path}: {count} token replacements made.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        migrate_file(sys.argv[1])
    else:
        print("Usage: python migrate_css.py <rel_path>")
