# Mutation Testing Report

**Date**: 2026-07-26  
**Runner**: Stryker Mutator v9.6.1  
**Scope**: `portfolioEngine.js`, `RecommendationPipeline.js`, `monteCarloEngine.js`, `taxEngine.js`  

## Summary by Target File

| Target File | Total Mutants | Killed | Timeouts | Survived | Mutation Score |
|:---|:---:|:---:|:---:|:---:|:---:|
| `services/monteCarloEngine.js` | 627 | 289 | 14 | 324 | **48.33%** |
| `services/portfolioEngine.js` | 845 | 353 | 30 | 462 | **45.33%** |
| `services/RecommendationPipeline.js` | 672 | 371 | 2 | 299 | **55.51%** |
| `services/taxEngine.js` | 406 | 278 | 2 | 126 | **68.97%** |
| **Total / Combined Average** | **2550** | **1291** | **48** | **1211** | **52.51%** |

## Survived Mutants Analysis & Acceptable Gaps

### `services/monteCarloEngine.js` (324 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 8:56 | BlockStatement | `{}` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 14:30 | BlockStatement | `{}` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 9:38 | ArithmeticOperator | `p.nominalRate * 100` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 16:13 | ArithmeticOperator | `1 * base` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 18:12 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 18:12 | EqualityOperator | `i <= 0` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 19:9 | AssignmentOperator | `result -= f * (i % base)` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 19:19 | ArithmeticOperator | `f / (i % base)` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 19:24 | ArithmeticOperator | `i * base` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 21:9 | AssignmentOperator | `f *= base` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(314 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/portfolioEngine.js` (462 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 8:18 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:5 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:26 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:33 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:44 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:50 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:58 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:65 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 9:5 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 9:17 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(452 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/RecommendationPipeline.js` (299 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 97:23 | BooleanLiteral | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 153:7 | EqualityOperator | `p.age > 50` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 154:12 | EqualityOperator | `p.age > 40` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 159:15 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 159:15 | EqualityOperator | `p.mr >= 0` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 163:26 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 163:26 | EqualityOperator | `p.annualIncome >= 0` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 164:7 | EqualityOperator | `emergencyCover <= 0.2` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 188:10 | ArithmeticOperator | `postTaxRate / PIPELINE_CONFIG.RETURN_MUL` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 192:19 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(289 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/taxEngine.js` (126 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 10:28 | EqualityOperator | `now.getMonth() < 3` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 10:28 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 10:28 | EqualityOperator | `now.getMonth() > 3` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 11:47 | ArithmeticOperator | `year + 1` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 13:55 | UnaryOperator | `+2` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 55:20 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 67:13 | EqualityOperator | `taxableIncome < slab.min` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 78:9 | EqualityOperator | `taxableIncome < 5000000` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 81:9 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 81:9 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(116 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

