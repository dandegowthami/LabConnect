import mongoose from 'mongoose';

const parameterSchema = new mongoose.Schema({
  parameterName: { type: String, required: true, trim: true, maxlength: 120 },
  result: { type: Number, required: true },
  unit: { type: String, required: true, trim: true, maxlength: 40 },
  referenceMin: { type: Number, required: true },
  referenceMax: { type: Number, required: true },
  classification: {
    type: String,
    enum: ['Not evaluated', 'Normal', 'Below reference range', 'Above reference range', 'Critical', 'Reference range unavailable'],
    default: 'Not evaluated'
  },
  classificationEvaluatedAt: { type: Date, default: null },
  criticalThresholdRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CriticalThresholdRule', default: null }
}, { _id: false });

const pdfMetadataSchema = new mongoose.Schema({
  originalFilename: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, enum: ['application/pdf'] },
  fileSize: { type: Number, required: true, min: 1 },
  uploadedAt: { type: Date, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, trim: true, unique: true, index: true, maxlength: 110 },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestOrder', required: true, unique: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  parameters: { type: [parameterSchema], required: true, validate: (parameters) => parameters.length > 0 },
  reportStatus: { type: String, required: true, enum: ['Processing', 'Ready', 'Cancelled'] },
  criticalReviewStatus: { type: String, enum: ['Not required', 'Urgent review'], default: 'Not required', index: true },
  signedAt: { type: Date, default: null },
  pdfStorageKey: { type: String, default: null, select: false },
  pdfMetadata: { type: pdfMetadataSchema, default: null }
}, { timestamps: true });

export default mongoose.model('Report', reportSchema);
