# 12. MongoDB vs. PostgreSQL Data Store Selection Rationale

* **Status**: Accepted
* **Date**: 2026-07-24
* **Deciders**: WealthGenie Architecture Review Board

## Context and Problem Statement

WealthGenie processes multi-dimensional financial advisory data, stochastic Monte Carlo simulations, AI tool trace graphs, and dynamic asset allocations. We must justify why MongoDB was selected as the primary document data store over PostgreSQL, specifically referencing our actual database models (`FinancialProfile`, `Goal`, `Recommendation`, `ConversationHistory`, `Instrument`, `User`) rather than generic NoSQL marketing claims.

## Decision Drivers

* Alignment between document hierarchy and domain data structures (nested arrays of simulation percentiles, embedded action cards, dynamic ML confidence scores).
* Schema evolution velocity without blocking relational migrations (`ALTER TABLE`) when expanding financial profile attributes or tax calculation fields.
* Atomic single-document operations and Mongoose Optimistic Concurrency Control (`optimisticConcurrency: true`).

## Database Model Analysis: MongoDB Document Model Fit vs. PostgreSQL Relational Overhead

### 1. `Recommendation` Model (`server/models/Recommendation.js`)

* **Actual Schema Shape**:
  ```javascript
  const recommendationSchema = new mongoose.Schema({
    userId: { type: ObjectId, ref: 'User', required: true },
    profileId: { type: ObjectId, ref: 'FinancialProfile', required: true },
    instruments: [instrumentDetailSchema], // embedded array of sub-documents
    advisoryText: String,
    confidenceScores: mongoose.Schema.Types.Mixed, // dynamic 19-key key-value map
    mlFallback: Boolean,
    modelVersion: String,
    generatedAt: Date,
  });
  ```
* **Document Model Fit**: A single `Recommendation` document encapsulates the full advisory snapshot, including an array of recommended instruments (`[instrumentDetailSchema]`) with individual tax notes, Sharpe ratios, post-tax returns, allocation weights, and a polymorphic `confidenceScores` map across 19 core instruments (`FD`, `ELSS`, `Equity_MF`, `NPS`, `SGB`, etc.).
* **PostgreSQL Comparison & Overhead**: In PostgreSQL, storing this would require either normalizing into 3 separate tables (`recommendations`, `recommendation_instruments`, `recommendation_confidence_scores`) with foreign key JOINs on every read, or storing payloads in `jsonb` columns. Relational normalization introduces unnecessary JOIN latency for data that is always written and read atomically together. Using `jsonb` in PostgreSQL undermines relational benefits while offering inferior native Mongoose ODM developer ergonomics.

### 2. `Goal` Model (`server/models/Goal.js`)

* **Actual Schema Shape**:
  ```javascript
  const GoalSchema = new mongoose.Schema({
    userId: { type: ObjectId, ref: 'User', required: true },
    goal_name: String,
    target_amount: Number,
    monte_carlo_summary: { p10: Number, p25: Number, p50: Number, p75: Number, p90: Number, simulations_run: Number },
    chart_data: [{ year: Number, p10: Number, p25: Number, p50: Number, p75: Number, p90: Number }],
    probability_of_success: Number,
  });
  ```
* **Document Model Fit**: Stochastic Monte Carlo output is inherently hierarchical. `Goal` embeds both terminal percentile summaries (`monte_carlo_summary`) and an annual trajectory array (`chart_data`) directly within the goal document. Updating a goal's simulation data is an in-place atomic `$set` operation.
* **PostgreSQL Comparison & Overhead**: Representing multi-year percentile trajectories (`chart_data`) in PostgreSQL requires a child table `goal_chart_points` containing thousands of rows per user. A query fetching a user's goals requires a 1-to-N join across hundreds of time-series rows, incurring high query memory overhead and ORM hydration cost.

### 3. `FinancialProfile` Model (`server/models/FinancialProfile.js`)

* **Actual Schema Shape**:
  ```javascript
  const financialProfileSchema = new mongoose.Schema({
    userId: { type: ObjectId, ref: 'User', required: true },
    income: Number, age: Number, savings: Number, annualIncome: Number,
    taxSlab: Number, effectiveTaxRate: Number, taxRegime: String,
    liquid_savings: Number, existing_debt: Number, dependents: Number,
    emergency_fund_months: Number, risk_tolerance: String, goal_type: String,
  }, { optimisticConcurrency: true });
  ```
* **Document Model Fit**: Financial profiles evolve as regulatory frameworks change (e.g. adding new tax deductions or risk metrics). MongoDB's schemaless storage paired with Mongoose schema definitions allows adding new fields without requiring database locks or DDL migrations on millions of documents. Mongoose's `optimisticConcurrency: true` utilizes document `__v` version keys to guarantee concurrent updates fail fast (HTTP 409 Conflict) without requiring heavy SQL row-level locks.
* **PostgreSQL Comparison & Overhead**: Adding new columns to PostgreSQL tables in production requires running migrations (`ALTER TABLE`), which can lock tables during high-traffic windows.

### 4. `ConversationHistory` Model (`server/models/ConversationHistory.js`)

* **Actual Schema Shape**:
  ```javascript
  const ConversationHistorySchema = new mongoose.Schema({
    userId: ObjectId, session_id: String,
    messages: [MessageSchema], // embedded array of messages + audit metadata
    message_count: Number,
  });
  ```
* **Document Model Fit**: Chat sessions are naturally bounded document trees. The `pre('save')` hook automatically caps `messages` at 200 entries via slice operations (`this.messages = this.messages.slice(-200)`), making session retrieval a single index lookup (`{ userId: 1, session_id: 1 }`).
* **PostgreSQL Comparison & Overhead**: A relational `messages` table requires individual row inserts and costly `DELETE FROM messages WHERE id IN (...)` cleanup queries to manage session truncation.

## Summary Matrix

| Evaluation Criteria | MongoDB (Chosen) | PostgreSQL |
| :--- | :--- | :--- |
| **Document Hierarchy Fit** | **High**: Embedded arrays for `instruments`, `chart_data`, `messages` read atomically. | **Low**: Requires 1-to-N table JOINs or unindexed `jsonb` blobs. |
| **Schema Evolution** | **Seamless**: Non-blocking field additions for new tax regimes / parameters. | **Rigid**: Requires `ALTER TABLE` migrations and DDL locks. |
| **Concurrency Control** | **Optimistic**: Mongoose OCC (`__v` versioning) prevents overwrite races. | **Pessimistic**: Requires row locking (`SELECT FOR UPDATE`) or explicit `version` column. |
| **Read Latency** | **Sub-5ms**: Single document fetch retrieves full profile, goal, and MC trajectory. | **Higher**: Multi-table JOIN latency for nested simulation objects. |

## Conclusion

MongoDB is the optimal database for WealthGenie because our core domain models (`Recommendation`, `Goal`, `FinancialProfile`, `ConversationHistory`) are hierarchical document structures that are written and read atomically. Relational SQL normalization would introduce excessive JOIN complexity without providing architectural value for our non-relational, document-centric dataset.
