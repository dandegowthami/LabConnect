import mongoose from 'mongoose';

const deliveryLogSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  channel: { type: String, required: true, enum: ['SMS', 'WhatsApp'] },
  destinationMasked: { type: String, required: true, maxlength: 20 },
  status: { type: String, required: true, enum: ['Pending', 'Sent', 'Failed'], index: true },
  providerMessageId: { type: String, default: null, maxlength: 100 },
  sentAt: { type: Date, default: null },
  failureReason: { type: String, default: null, maxlength: 240 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

deliveryLogSchema.index({ createdAt: -1 });
deliveryLogSchema.index({ reportId: 1, createdAt: -1 });

export default mongoose.model('DeliveryLog', deliveryLogSchema);
