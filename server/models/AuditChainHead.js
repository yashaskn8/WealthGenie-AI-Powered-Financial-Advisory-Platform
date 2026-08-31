import mongoose from 'mongoose';

const auditChainHeadSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sequence: { type: Number, required: true, min: 0, default: 0 },
  lastRecordHash: { type: String, required: true, default: 'GENESIS' },
  lastAuditRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuditRecord', default: null },
}, { timestamps: true });

export default mongoose.model('AuditChainHead', auditChainHeadSchema);

