import mongoose from 'mongoose';

const aiExplanationSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  language: { type: String, enum: ['en', 'te', 'hi'], required: true },
  summary: { type: String, required: true, maxlength: 3000 },
  model: { type: String, required: true, maxlength: 120 },
  generatedAt: { type: Date, required: true },
  status: { type: String, enum: ['Generated', 'Flagged'], default: 'Generated', index: true },
  promptVersion: { type: String, required: true, maxlength: 40 },
  sourceFingerprint: { type: String, required: true, maxlength: 64 },
  flaggedByPatient: { type: Boolean, default: false },
  flagReason: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });

aiExplanationSchema.index({ reportId: 1, language: 1 }, { unique: true });
aiExplanationSchema.index({ flaggedByPatient: 1, updatedAt: -1 });

export default mongoose.model('AIExplanation', aiExplanationSchema);
