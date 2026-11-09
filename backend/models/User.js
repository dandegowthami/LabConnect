import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
    match: /^\S+@\S+\.\S+$/
  },
  mobile: { type: String, match: /^[6-9]\d{9}$/ },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ['staff', 'admin', 'pathologist', 'doctor'], default: 'staff' },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.index({ doctorId: 1 }, { unique: true, partialFilterExpression: { doctorId: { $type: 'objectId' } } });

export default mongoose.model('User', userSchema);
