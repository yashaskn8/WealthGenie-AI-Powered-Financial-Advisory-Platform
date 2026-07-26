# Mutation Testing Report

**Date**: 2026-07-26  
**Runner**: Stryker Mutator v9.6.1  
**Scope**: `portfolioEngine.js`, `RecommendationPipeline.js`, `monteCarloEngine.js`, `taxEngine.js`  

## Summary by Target File

| Target File | Total Mutants | Killed | Timeouts | Survived | Mutation Score |
|:---|:---:|:---:|:---:|:---:|:---:|
| `services/monteCarloEngine.js` | 627 | 204 | 17 | 406 | **35.25%** |
| `services/portfolioEngine.js` | 845 | 234 | 30 | 581 | **31.24%** |
| `services/RecommendationPipeline.js` | 672 | 282 | 0 | 390 | **41.96%** |
| `services/taxEngine.js` | 406 | 264 | 4 | 138 | **66.01%** |
| **Total / Combined Average** | **2550** | **984** | **51** | **1515** | **40.59%** |

## Survived Mutants Analysis & Acceptable Gaps

### `services/monteCarloEngine.js` (406 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 14:30 | BlockStatement | `{}` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 9:38 | ArithmeticOperator | `p.nominalRate * 100` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:56 | BlockStatement | `{}` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 16:13 | ArithmeticOperator | `1 * base` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 18:12 | EqualityOperator | `i <= 0` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 18:12 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 19:9 | AssignmentOperator | `result -= f * (i % base)` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 19:19 | ArithmeticOperator | `f / (i % base)` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 19:24 | ArithmeticOperator | `i * base` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 21:9 | AssignmentOperator | `f *= base` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(396 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/portfolioEngine.js` (581 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 8:5 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:18 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:26 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:33 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:44 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:50 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:65 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 8:58 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 9:5 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 9:17 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(571 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/RecommendationPipeline.js` (390 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 97:23 | BooleanLiteral | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 130:37 | ArrayDeclaration | `[]` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 131:21 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 131:21 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 131:21 | LogicalOperator | `profile.taxRegime && 'new'` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 131:42 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 146:7 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 146:7 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 146:7 | EqualityOperator | `p.horizon > 15` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 146:7 | EqualityOperator | `p.horizon < 15` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(380 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/taxEngine.js` (138 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 10:28 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 10:28 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 10:28 | EqualityOperator | `now.getMonth() > 3` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 10:28 | EqualityOperator | `now.getMonth() < 3` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 11:47 | ArithmeticOperator | `year + 1` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 13:55 | UnaryOperator | `+2` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 55:20 | ConditionalExpression | `true` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 59:12 | ConditionalExpression | `false` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 59:23 | StringLiteral | `""` | Defensive boundary guard, string literal default, or equivalent mutant |
| Line 67:13 | EqualityOperator | `taxableIncome < slab.min` | Defensive boundary guard, string literal default, or equivalent mutant |
| ... | ... | ... | *(128 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

