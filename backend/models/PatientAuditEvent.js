import mongoose from 'mongoose';

const patientAuditEventSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  action: {
    type: String,
    required: true,
    enum: ['portal-activation-issued', 'portal-account-activated', 'portal-identity-authenticated']
  },
  actorId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '730d' }
}, { versionKey: false });

export default mongoose.model('PatientAuditEvent', patientAuditEventSchema);
