import mongoose from 'mongoose';

const criticalThresholdRuleSchema = new mongoose.Schema({
  parameterName: { type: String, required: true, trim: true, maxlength: 120 },
  unit: { type: String, required: true, trim: true, maxlength: 40 },
  criticalLow: { type: Number, default: null },
  criticalHigh: { type: Number, default: null },
  status: { type: String, enum: ['Pending approval', 'Approved', 'Rejected'], default: 'Pending approval', index: true },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvalNote: { type: String, trim: true, maxlength: 1000, default: null },
  approvedAt: { type: Date, default: null }
}, { timestamps: true });

criticalThresholdRuleSchema.index({ parameterName: 1, unit: 1, status: 1 });
criticalThresholdRuleSchema.index(
  { parameterName: 1, unit: 1 },
  { unique: true, partialFilterExpression: { status: 'Approved' } }
);

export default mongoose.model('CriticalThresholdRule', criticalThresholdRuleSchema);
