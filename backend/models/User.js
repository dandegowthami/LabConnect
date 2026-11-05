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
  role: { type: String, required: true, enum: ['staff', 'admin'], default: 'staff' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
