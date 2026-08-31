import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  mobile: { type: String, trim: true, match: /^[6-9]\d{9}$/ },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

// Prevent passwordHash from leaking in toJSON/toObject
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

// email index is created automatically by `unique: true`
userSchema.index({ createdAt: -1 });

export default mongoose.model('User', userSchema);
