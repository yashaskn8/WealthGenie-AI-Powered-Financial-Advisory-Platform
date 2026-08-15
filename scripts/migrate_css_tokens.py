import os
import re

HEX_REPLACEMENTS = {
    # Whites & pure tints
    r'#ffffff\b': 'var(--color-white)',
    r'#ffffff\s*!important': 'var(--color-white) !important',
    r'#fff\b': 'var(--color-white)',
    r'#fff\s*!important': 'var(--color-white) !important',
    
    # Purples & Violets
    r'#a855f7\b': 'var(--color-accent-purple)',
    r'#c084fc\b': 'var(--color-accent-purple-light)',
    r'#c4b5fd\b': 'var(--color-violet-light)',
    r'#e9d5ff\b': 'var(--color-violet-light)',
    r'#8b5cf6\b': 'var(--color-violet-500)',
    r'#7c3aed\b': 'var(--color-violet-600)',
    r'#6d28d9\b': 'var(--color-violet-600)',
    r'#d946ef\b': 'var(--color-violet-500)',
    r'#a78bfa\b': 'var(--color-violet-light)',
    r'#a5b4fc\b': 'var(--color-secondary-400)',
    r'#c7d2fe\b': 'var(--color-secondary-200)',
    r'#4f46e5\b': 'var(--color-secondary-500)',
    r'#4338ca\b': 'var(--color-secondary-600)',

    # Greens / Success / Emerald
    r'#22c55e\b': 'var(--color-success)',
    r'#16a34a\b': 'var(--color-success-600)',
    r'#15803d\b': 'var(--color-success-600)',
    r'#059669\b': 'var(--color-success-600)',
    r'#4caf50\b': 'var(--color-success)',
    r'#4ade80\b': 'var(--color-success-light)',
    r'#6ee7b7\b': 'var(--color-success-light)',
    r'#86efac\b': 'var(--color-success-light)',
    r'#bbf7d0\b': 'var(--color-success-light)',
    r'#d1fae5\b': 'var(--color-success-light)',
    r'#00E5A0\b': 'var(--color-accent-teal)',
    r'#2dd4bf\b': 'var(--color-accent-teal-light)',
    r'#22d3ee\b': 'var(--color-primary-light)',
    r'#a5f3fc\b': 'var(--color-primary-light)',

    # Oranges / Yellows / Warning
    r'#f59e0b\b': 'var(--color-warning)',
    r'#f97316\b': 'var(--color-warning)',
    r'#FF9F43\b': 'var(--color-warning)',
    r'#d97706\b': 'var(--color-warning-500)',
    r'#fbbf24\b': 'var(--color-warning-light)',
    r'#fcd34d\b': 'var(--color-warning-light)',
    r'#fb923c\b': 'var(--color-warning-light)',
    r'#fdba74\b': 'var(--color-warning-light)',
    r'#fde68a\b': 'var(--color-warning-light)',
    r'#e2b953\b': 'var(--color-accent-gold)',
    r'#dfbd69\b': 'var(--color-accent-gold)',

    # Reds / Danger
    r'#ef4444\b': 'var(--color-error)',
    r'#dc2626\b': 'var(--color-error-600)',
    r'#b91c1c\b': 'var(--color-error-600)',
    r'#ff4d4d\b': 'var(--color-error)',
    r'#e11d48\b': 'var(--color-error)',
    r'#f43f5e\b': 'var(--color-error)',
    r'#f87171\b': 'var(--color-error-light)',
    r'#fca5a5\b': 'var(--color-error-light)',
    r'#fecdd3\b': 'var(--color-error-light)',
    r'#fda4af\b': 'var(--color-error-light)',

    # Blues / Cyans / Primaries
    r'#38bdf8\b': 'var(--color-primary)',
    r'#3b82f6\b': 'var(--color-primary)',
    r'#2563eb\b': 'var(--color-primary-dark)',
    r'#1d4ed8\b': 'var(--color-primary-dark)',
    r'#0284c7\b': 'var(--color-primary-dark)',
    r'#0369a1\b': 'var(--color-primary-700)',
    r'#0c4a6e\b': 'var(--color-primary-700)',
    r'#06b6d4\b': 'var(--color-primary)',

    # Dark Backgrounds / Surfaces
    r'#040810\b': 'var(--surface-0)',
    r'#080e1c\b': 'var(--surface-1)',
    r'#080d1c\b': 'var(--surface-1)',
    r'#0a0f1e\b': 'var(--surface-2)',
    r'#030712\b': 'var(--surface-0)',
    r'#0c1225\b': 'var(--surface-2)',
    r'#0f0f14\b': 'var(--surface-0)',
    r'#050a14\b': 'var(--surface-0)',
    r'#0b132b\b': 'var(--surface-2)',
    r'#0a0f1d\b': 'var(--surface-0)',

    # Neutrals / Grays
    r'#f8fafc\b': 'var(--text-primary)',
    r'#cbd5e1\b': 'var(--text-secondary)',
    r'#94a3b8\b': 'var(--text-muted)',
    r'#8b9cb7\b': 'var(--text-muted)',
    r'#7a8ba0\b': 'var(--text-muted)',
    r'#64748b\b': 'var(--text-dim)',
    r'#666\b': 'var(--text-dim)',
    r'#475569\b': 'var(--text-faint)',
    r'#4b5e78\b': 'var(--text-faint)',
    r'#4b5e7a\b': 'var(--text-faint)',
    r'#3b4a5e\b': 'var(--text-faint)',
    r'#3e4a5c\b': 'var(--text-faint)',
    r'#b0bec5\b': 'var(--text-secondary)',
    r'#e2e8f0\b': 'var(--color-gray-200)',
    r'#f1f5f9\b': 'var(--color-gray-100)',
}

def migrate_single_file(rel_path):
    path1 = os.path.join(r'c:\Users\prana\OneDrive\Desktop\final wealthgenie\reactapp\src', rel_path)
    path2 = os.path.join(r'C:\Projects\final wealthgenie\reactapp\src', rel_path)
    
    with open(path1, 'r', encoding='utf-8') as f:
        content = f.read()
    
    hex_pat = re.compile(r'#[0-9a-fA-F]{3,8}\b', re.IGNORECASE)
    before_count = len(hex_pat.findall(content))
    
    for pattern, replacement in HEX_REPLACEMENTS.items():
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
        
    after_matches = hex_pat.findall(content)
    after_count = len(after_matches)
    
    with open(path1, 'w', encoding='utf-8') as f:
        f.write(content)
    if os.path.exists(os.path.dirname(path2)):
        with open(path2, 'w', encoding='utf-8') as f:
            f.write(content)
            
    print(f'{rel_path}: {before_count} -> {after_count}')
    if after_matches:
        print(f'   [WARNING] Remaining in {rel_path}: {set(after_matches)}')
    return before_count, after_count

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        migrate_single_file(sys.argv[1])
