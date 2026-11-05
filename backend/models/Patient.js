import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  patientId: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true
  },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  mobile: { type: String, required: true, match: /^[6-9]\d{9}$/, index: true },
  consentStatus: { type: String, enum: ['pending', 'granted', 'withdrawn'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model('Patient', patientSchema);
