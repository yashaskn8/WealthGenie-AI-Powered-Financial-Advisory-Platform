import mongoose from 'mongoose';

/**
 * IdempotencyKey — MongoDB-backed fallback for idempotency when Redis is unavailable.
 *
 * ARCHITECTURE: This collection ensures idempotency state is ALWAYS in shared
 * infrastructure (Redis primary, MongoDB fallback), never in per-process memory.
 * A TTL index automatically expires documents after 5 minutes.
 */
const idempotencyKeySchema = new mongoose.Schema({
  _id: { type: String }, // compound key: "userId:idempotencyKey"
  status: { type: String, enum: ['LOCK', 'DONE'], default: 'LOCK' },
  response: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // TTL: 5 minutes
});

export default mongoose.model('IdempotencyKey', idempotencyKeySchema);
