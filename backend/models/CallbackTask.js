import mongoose from 'mongoose';

const callbackTaskSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  parameterName: { type: String, required: true, trim: true, maxlength: 120 },
  severity: { type: String, enum: ['Critical', 'Patient flagged summary'], required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending', index: true },
  resolutionNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  resolvedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: true } });

callbackTaskSchema.index({ reportId: 1, parameterName: 1, severity: 1 }, { unique: true });

export default mongoose.model('CallbackTask', callbackTaskSchema);
