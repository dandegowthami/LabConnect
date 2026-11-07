import mongoose from 'mongoose';

const reportAuditEventSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['pdf-uploaded', 'signed-confirmed', 'pdf-viewed', 'pdf-downloaded']
  },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  actorId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '730d' }
}, { versionKey: false });

export default mongoose.model('ReportAuditEvent', reportAuditEventSchema);
