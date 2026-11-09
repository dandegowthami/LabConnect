import mongoose from 'mongoose';

const patientContactSessionSchema = new mongoose.Schema({
  mobile: { type: String, required: true, match: /^[6-9]\d{9}$/ },
  identityPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  identityAttempts: { type: Number, default: 0, min: 0, max: 5 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model('PatientContactSession', patientContactSessionSchema);
