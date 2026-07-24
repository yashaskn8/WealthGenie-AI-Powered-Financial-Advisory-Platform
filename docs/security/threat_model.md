# WealthGenie Threat Model

> Generated: 2026-07-24 | Version: 1.0

## Overview
This threat model covers the WealthGenie financial advisory platform, mapping each identified threat to actual implementation files and mitigations.

---

## 1. JWT Theft / Session Hijacking

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Attacker steals a JWT token via XSS, network sniffing, or local storage access and replays it to impersonate a legitimate user. |
| **Likelihood** | Medium |
| **Impact** | Critical — Full account takeover, access to financial data and recommendations. |
| **Mitigation** | JWT tokens include a unique `jti` claim ([auth.js:43](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/auth.js#L43)). Logout blacklists the `jti` via Redis TTL ([auth.js:111-120](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/auth.js#L111-L120)). Blacklist checked on every request in `verifyJWT` middleware ([authMiddleware.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/middleware/authMiddleware.js)). Helmet security headers prevent XSS vectors ([server.js:36-47](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/server.js#L36-L47)). |
| **Residual Risk** | Token valid until expiry if user doesn't explicitly logout. Mitigated by 7-day default expiry. |
| **Detection** | Monitor for concurrent sessions from geographically distant IPs. Log all auth failures ([logger.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/utils/logger.js)). |
| **Recovery** | User logs out (blacklists jti). Admin can rotate JWT_SECRET to invalidate all tokens. |

---

## 2. Cross-User Authorization Bypass (IDOR)

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Authenticated User B crafts requests with User A's profileId/goalId to read, modify, or delete their data. |
| **Likelihood** | Low (after hardening) |
| **Impact** | Critical — Financial data exposure, unauthorized modifications to investment goals. |
| **Mitigation** | All Mongoose queries now scope by `userId` at the database layer: `findOne({ _id: id, userId: req.user.userId })`. Applied to [profile.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/profile.js), [goals.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/goals.js), [recommend.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/recommend.js), [projection.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/projection.js), [portfolio.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/portfolio.js), [montecarlo.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/montecarlo.js). Verified by 7 automated tests in [authorization.test.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/test/authorization.test.js). |
| **Residual Risk** | None for current routes. New routes must follow the same pattern. |
| **Detection** | Log warns on 404 for ownership-scoped queries (visible in server logs). |
| **Recovery** | No data leakage possible — queries return 404 for non-owned resources. |

---

## 3. NoSQL Injection

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Attacker sends `{ "$gt": "" }` or `{ "$ne": null }` as query parameter values to bypass authentication or extract data. |
| **Likelihood** | Low |
| **Impact** | High — Authentication bypass, data exfiltration. |
| **Mitigation** | `express-mongo-sanitize` middleware strips `$` and `.` from all request bodies, query strings, and params ([server.js:6](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/server.js#L6)). Joi schema validation rejects unexpected object shapes ([schemas.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/validation/schemas.js)). |
| **Residual Risk** | Minimal — sanitization runs before any route handler. |
| **Detection** | Monitor for requests containing `$` operators in body/query logs. |
| **Recovery** | Blocked at middleware layer; no data exposure occurs. |

---

## 4. Prompt Injection (LLM Abuse)

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | User crafts chat messages that override the system prompt, causing the AI to reveal system internals, ignore safety guidelines, or generate harmful financial advice. |
| **Likelihood** | Medium |
| **Impact** | Medium — Potential for misleading financial advice; reputational damage. |
| **Mitigation** | System prompt is server-side constructed with financial context grounding ([geminiChatService.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/geminiChatService.js)). User input is trimmed and length-limited via Joi validation ([schemas.js chatMessageSchema](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/validation/schemas.js)). AI responses carry a regulatory disclaimer ([instrumentConstants.js DISCLAIMER](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/instrumentConstants.js)). |
| **Residual Risk** | LLM jailbreaks remain an evolving threat. No input sanitization can guarantee prompt safety. |
| **Detection** | Log all chat interactions with session IDs for audit trail. |
| **Recovery** | Flag and review suspicious conversation patterns. |

---

## 5. Dependency Compromise (Supply Chain)

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | A compromised npm package introduces malicious code (backdoor, credential stealer) into the build. |
| **Likelihood** | Low-Medium |
| **Impact** | Critical — Full server compromise, data exfiltration. |
| **Mitigation** | `npm audit` run regularly; all High/Critical vulnerabilities fixed via `npm audit fix`. `package-lock.json` pins exact versions. Secret scanner ([scripts/secret-scanner.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/scripts/secret-scanner.js)) prevents credential leakage even if a dependency attempts exfiltration. |
| **Residual Risk** | Zero-day supply chain attacks remain possible before advisory publication. |
| **Detection** | CI/CD pipeline should run `npm audit` on every PR. |
| **Recovery** | Revert to last known-good `package-lock.json`. Rotate all credentials. |

---

## 6. Secrets Leakage

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Developer accidentally commits API keys, JWT secrets, or database credentials to the Git repository. |
| **Likelihood** | Medium |
| **Impact** | Critical — Full system compromise. |
| **Mitigation** | Pre-commit secret scanner ([scripts/secret-scanner.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/scripts/secret-scanner.js)) detects AWS keys, OpenAI keys, Google keys, JWT secrets, private keys, bearer tokens, Mongo URLs, Redis URLs, and GitHub PATs. `.env` files are `.gitignore`d. Environment variables used for all secrets. |
| **Residual Risk** | Scanner may miss novel secret formats. |
| **Detection** | Git history scanning tools (truffleHog, gitleaks) for retrospective audit. |
| **Recovery** | Immediately rotate compromised credentials. Force-push to remove from history. |

---

## 7. Rate-Limit Bypass / DoS Against Expensive Endpoints

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Attacker floods compute-intensive endpoints (Monte Carlo, portfolio optimization, Gemini/Groq API calls) to exhaust server resources or API quotas. |
| **Likelihood** | Medium |
| **Impact** | High — Service degradation, API cost explosion. |
| **Mitigation** | Global rate limiter middleware ([rateLimiter.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/middleware/rateLimiter.js)). Profile creation throttle (10/hour per user via Redis, [profile.js:17-31](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/routes/profile.js#L17-L31)). Express `express.json({ limit: '100kb' })` payload size cap ([server.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/server.js)). |
| **Residual Risk** | Distributed attacks from many IPs can bypass per-IP limits. |
| **Detection** | Monitor 429 response rates. Alert on sudden traffic spikes. |
| **Recovery** | Temporary IP bans. Scale horizontally behind load balancer. |

---

## 8. Model Abuse / ML Inference Manipulation

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Attacker crafts extreme input profiles (age=18, income=10Cr, horizon=1) to force specific ML recommendations and exploit downstream logic. |
| **Likelihood** | Low |
| **Impact** | Medium — Misleading recommendations for edge-case profiles. |
| **Mitigation** | Joi input validation enforces bounds on all financial inputs ([schemas.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/validation/schemas.js)). ML service uses a rule-based fallback when confidence is low ([mlClient.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/mlClient.js)). Label sensitivity analysis proves model stability under ±10% threshold perturbations ([benchmarks/label_sensitivity_benchmark.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/benchmarks/label_sensitivity_benchmark.json)). |
| **Residual Risk** | Adversarial inputs targeting decision boundaries remain theoretically possible. |
| **Detection** | Log ML confidence scores; alert on consistently low-confidence predictions. |
| **Recovery** | Fall back to rule-based engine for flagged profiles. |

---

## 9. Privilege Escalation

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Regular user attempts to access admin functions or modify other users' authentication state. |
| **Likelihood** | Low |
| **Impact** | Critical — Full platform compromise. |
| **Mitigation** | No admin routes exist in the current codebase. JWT payload contains only `userId` and `email` — no role field to tamper. All database mutations are scoped to `req.user.userId`. Mass assignment prevention strips unexpected fields from request bodies ([schemas.js stripUnknown](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/validation/schemas.js)). |
| **Residual Risk** | If admin routes are added, proper RBAC middleware must be implemented. |
| **Detection** | Monitor for unusual API call patterns (e.g., iterating over ObjectIds). |
| **Recovery** | Revoke affected tokens. Audit database for unauthorized changes. |

---

## 10. Express Error Leakage

| Dimension | Detail |
|:---|:---|
| **Attack Scenario** | Unhandled errors expose stack traces, internal paths, or database schema details to the client. |
| **Likelihood** | Low |
| **Impact** | Medium — Information disclosure aids further attacks. |
| **Mitigation** | Centralized error handler ([errorHandler.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/middleware/errorHandler.js)) returns generic `clientMessage` to users while logging full error internally. `NODE_ENV=production` suppresses stack traces. Helmet `X-Powered-By` header disabled. |
| **Residual Risk** | Custom error messages must be carefully reviewed to avoid information leakage. |
| **Detection** | Review error response bodies in integration tests. |
| **Recovery** | Fix error handler to suppress any leaked details. |
