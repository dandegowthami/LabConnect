import mongoose from 'mongoose';

const stagedTestSchema = new mongoose.Schema({
  testName: { type: String, required: true },
  result: { type: Number, required: true },
  unit: { type: String, required: true },
  referenceMin: { type: Number, required: true },
  referenceMax: { type: Number, required: true }
}, { _id: false });

const stagedOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  patient: {
    patientId: { type: String, required: true },
    fullName: { type: String, required: true },
    mobile: { type: String, required: true }
  },
  doctorName: { type: String, required: true },
  tests: { type: [stagedTestSchema], required: true },
  status: { type: String, required: true, enum: ['Processing', 'Ready', 'Cancelled'] },
  rows: { type: [Number], required: true }
}, { _id: false });

const stagedErrorSchema = new mongoose.Schema({
  row: { type: Number, required: true },
  orderId: { type: String, default: '' },
  message: { type: String, required: true }
}, { _id: false });

const lisImportBatchSchema = new mongoose.Schema({
  fileName: { type: String, required: true, maxlength: 255 },
  importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, required: true, enum: ['previewed', 'committing', 'committed', 'failed'], default: 'previewed' },
  totalRows: { type: Number, required: true, min: 0 },
  orders: { type: [stagedOrderSchema], default: [] },
  errors: { type: [stagedErrorSchema], default: [] },
  skippedRows: { type: [Number], default: [] },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true, suppressReservedKeysWarning: true });

export default mongoose.model('LISImportBatch', lisImportBatchSchema);
