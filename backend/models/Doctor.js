import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema({
  doctorId: { type: String, required: true, trim: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  registrationNumber: { type: String, trim: true, sparse: true, unique: true },
  mobile: { type: String, match: /^[6-9]\d{9}$/ },
  email: { type: String, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ }
}, { timestamps: true });

export default mongoose.model('Doctor', doctorSchema);
