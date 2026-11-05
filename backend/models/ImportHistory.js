import mongoose from 'mongoose';

const importErrorSchema = new mongoose.Schema({
  row: { type: Number, required: true, min: 1 },
  orderId: { type: String, default: '' },
  message: { type: String, required: true, maxlength: 500 }
}, { _id: false });

const importHistorySchema = new mongoose.Schema({
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  totalRows: { type: Number, required: true, min: 0 },
  importedRows: { type: Number, required: true, min: 0 },
  skippedRows: { type: Number, required: true, min: 0 },
  failedRows: { type: Number, required: true, min: 0 },
  importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, required: true, enum: ['completed', 'partial', 'failed'] },
  errors: { type: [importErrorSchema], default: [] },
  importedAt: { type: Date, required: true, default: Date.now, index: true }
}, { timestamps: true, suppressReservedKeysWarning: true });

export default mongoose.model('ImportHistory', importHistorySchema);
