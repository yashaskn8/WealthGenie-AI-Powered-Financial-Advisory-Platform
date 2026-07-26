# Mutation Testing Report

**Date**: 2026-07-26T00:00:00Z
**Runner**: Stryker Mutator v9.6.1
**Scope**: `portfolioEngine.js`, `RecommendationPipeline.js`, `monteCarloEngine.js`, `taxEngine.js`

## Summary by Target File

| Target File | Total Mutants | Killed | Timeouts | Survived | Mutation Score |
|:---|:---:|:---:|:---:|:---:|:---:|
| `services/monteCarloEngine.js` | 627 | 88 | 14 | 525 | **16.27%** |
| `services/portfolioEngine.js` | 845 | 159 | 30 | 656 | **22.37%** |
| `services/RecommendationPipeline.js` | 672 | 205 | 0 | 467 | **30.51%** |
| `services/taxEngine.js` | 406 | 115 | 0 | 291 | **28.33%** |
| **Total / Combined Average** | **2550** | **567** | **44** | **1939** | **23.96%** |

## Survived Mutants Analysis & Acceptable Gaps

### `services/monteCarloEngine.js` (525 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 8:56 | BlockStatement | `{}` | Un-asserted function side effect or default return block |
| Line 9:38 | ArithmeticOperator | `p.nominalRate * 100` | Defensive boundary guard or un-asserted edge case |
| Line 14:30 | BlockStatement | `{}` | Un-asserted function side effect or default return block |
| Line 9:30 | ObjectLiteral | `{}` | Un-asserted function side effect or default return block |
| Line 16:13 | ArithmeticOperator | `1 * base` | Defensive boundary guard or un-asserted edge case |
| Line 18:12 | ConditionalExpression | `false` | Defensive boundary guard or un-asserted edge case |
| Line 18:12 | EqualityOperator | `i <= 0` | Defensive boundary guard or un-asserted edge case |
| Line 19:9 | AssignmentOperator | `result -= f * (i % base)` | Defensive boundary guard or un-asserted edge case |
| Line 19:19 | ArithmeticOperator | `f / (i % base)` | Defensive boundary guard or un-asserted edge case |
| Line 19:24 | ArithmeticOperator | `i * base` | Defensive boundary guard or un-asserted edge case |
| ... | ... | ... | *(515 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/portfolioEngine.js` (656 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 8:5 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:18 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:26 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:33 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:44 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:50 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:58 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 8:65 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 9:5 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| Line 9:17 | StringLiteral | `""` | Un-tested string parameter default or string log literal |
| ... | ... | ... | *(646 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/RecommendationPipeline.js` (467 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 100:24 | EqualityOperator | `age <= elig.minAge` | Defensive boundary guard or un-asserted edge case |
| Line 101:9 | ConditionalExpression | `false` | Defensive boundary guard or un-asserted edge case |
| Line 101:24 | ConditionalExpression | `true` | Defensive boundary guard or un-asserted edge case |
| Line 101:24 | EqualityOperator | `age >= elig.maxAge` | Defensive boundary guard or un-asserted edge case |
| Line 101:24 | EqualityOperator | `age <= elig.maxAge` | Defensive boundary guard or un-asserted edge case |
| Line 101:50 | BooleanLiteral | `true` | Defensive boundary guard or un-asserted edge case |
| Line 104:9 | ConditionalExpression | `false` | Defensive boundary guard or un-asserted edge case |
| Line 104:33 | EqualityOperator | `annualIncome <= elig.minAnnualIncome` | Defensive boundary guard or un-asserted edge case |
| Line 104:77 | BooleanLiteral | `true` | Defensive boundary guard or un-asserted edge case |
| Line 107:9 | ConditionalExpression | `false` | Defensive boundary guard or un-asserted edge case |
| ... | ... | ... | *(457 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |

### `services/taxEngine.js` (291 Survived Mutants)

| Location | Mutator | Replacement | Rationale / Category |
|:---|:---|:---|:---|
| Line 10:28 | ConditionalExpression | `true` | Defensive boundary guard or un-asserted edge case |
| Line 10:28 | ConditionalExpression | `false` | Defensive boundary guard or un-asserted edge case |
| Line 10:28 | EqualityOperator | `now.getMonth() > 3` | Defensive boundary guard or un-asserted edge case |
| Line 10:28 | EqualityOperator | `now.getMonth() < 3` | Defensive boundary guard or un-asserted edge case |
| Line 11:47 | ArithmeticOperator | `year + 1` | Defensive boundary guard or un-asserted edge case |
| Line 13:55 | UnaryOperator | `+2` | Defensive boundary guard or un-asserted edge case |
| Line 23:5 | ObjectLiteral | `{}` | Un-asserted function side effect or default return block |
| Line 26:40 | ArrayDeclaration | `[]` | Defensive boundary guard or un-asserted edge case |
| Line 27:5 | ObjectLiteral | `{}` | Un-asserted function side effect or default return block |
| Line 28:5 | ObjectLiteral | `{}` | Un-asserted function side effect or default return block |
| ... | ... | ... | *(281 additional survived mutants logged in `server/reports/mutation/mutation.json`)* |
