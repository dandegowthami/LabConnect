import mongoose from 'mongoose';

const patientPortalActivationSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, unique: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: true },
  attempts: { type: Number, default: 0, min: 0, max: 5 },
  consumedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default mongoose.model('PatientPortalActivation', patientPortalActivationSchema);
