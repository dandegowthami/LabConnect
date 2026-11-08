import mongoose from 'mongoose';

const reportAccessGrantSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  accessTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessToken', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
  lastAccessedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

reportAccessGrantSchema.index({ reportId: 1, patientId: 1, expiresAt: 1 });

export default mongoose.model('ReportAccessGrant', reportAccessGrantSchema);
