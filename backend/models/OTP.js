import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  mobile: { type: String, required: true, match: /^[6-9]\d{9}$/, index: true },
  hashedOTP: { type: String, required: true, select: false },
  purpose: { type: String, enum: ['patient-login', 'report-access'], default: 'patient-login', required: true },
  accessTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessToken', default: null, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0, min: 0 },
  verifiedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

otpSchema.index({ mobile: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ accessTokenId: 1, purpose: 1, createdAt: -1 });

export default mongoose.model('OTP', otpSchema);
