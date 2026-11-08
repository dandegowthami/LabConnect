import mongoose from 'mongoose';

const accessTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  verificationAttempts: { type: Number, default: 0, min: 0 },
  otpRequestsInWindow: { type: Number, default: 0, min: 0 },
  otpRequestsWindowStartedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastAccessedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

accessTokenSchema.index({ reportId: 1, revokedAt: 1, expiresAt: 1 });
accessTokenSchema.index({ patientId: 1, reportId: 1 });

export default mongoose.model('AccessToken', accessTokenSchema);
