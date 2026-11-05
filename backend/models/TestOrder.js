import mongoose from 'mongoose';

const testSchema = new mongoose.Schema({
  testName: { type: String, required: true, trim: true, maxlength: 120 },
  result: { type: Number, required: true },
  unit: { type: String, required: true, trim: true, maxlength: 40 },
  referenceMin: { type: Number, required: true },
  referenceMax: { type: Number, required: true },
  resultStatus: { type: String, default: 'Not evaluated', maxlength: 40 }
}, { _id: false });

const testOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, trim: true, unique: true, index: true, maxlength: 100 },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  laboratoryId: { type: String, required: true, trim: true, default: 'LIS', maxlength: 100 },
  tests: { type: [testSchema], required: true, validate: (tests) => tests.length > 0 },
  orderDate: { type: Date, required: true, default: Date.now },
  status: { type: String, required: true, enum: ['Processing', 'Ready', 'Cancelled'] }
}, { timestamps: true });

export default mongoose.model('TestOrder', testOrderSchema);
