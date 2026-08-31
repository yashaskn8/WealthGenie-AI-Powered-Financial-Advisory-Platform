import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

const nginx = readFileSync(resolve(cwd(), 'nginx.conf'), 'utf8');

describe('production Nginx security policy', () => {
  it('ships a viable CSP without script evaluation bypasses', () => {
    expect(nginx).toMatch(/add_header Content-Security-Policy/);
    expect(nginx).toMatch(/default-src 'self'/);
    expect(nginx).toMatch(/script-src 'self'/);
    expect(nginx).toMatch(/connect-src 'self'/);
    expect(nginx).toMatch(/frame-ancestors 'none'/);
    expect(nginx).not.toContain('unsafe-eval');
    expect(nginx).not.toMatch(/script-src[^;"]*unsafe-inline/);
  });

  it('blocks framing and sniffing and limits browser capabilities', () => {
    expect(nginx).toMatch(/X-Frame-Options "DENY" always/);
    expect(nginx).toMatch(/X-Content-Type-Options "nosniff" always/);
    expect(nginx).toMatch(/Referrer-Policy "strict-origin-when-cross-origin" always/);
    expect(nginx).toMatch(/Strict-Transport-Security "max-age=31536000; includeSubDomains" always/);
    expect(nginx).toMatch(/Permissions-Policy "[^"]*camera=\(\)[^"]*geolocation=\(\)[^"]*payment=\(\)[^"]*" always/);
  });
});
