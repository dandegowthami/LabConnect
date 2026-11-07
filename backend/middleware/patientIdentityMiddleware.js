import mongoose from 'mongoose';
import Patient from '../models/Patient.js';

export async function requirePatientIdentity(req, res, next) {
  if (req.auth?.role !== 'patient') {
    next();
    return;
  }

  if (!mongoose.isValidObjectId(req.auth.patientId)) {
    res.status(403).json({
      success: false,
      message: 'Patient identity verification is required before accessing medical records'
    });
    return;
  }

  try {
    const patient = await Patient.findById(req.auth.patientId).select('_id').lean();
    if (!patient) {
      res.status(403).json({
        success: false,
        message: 'Patient identity verification is required before accessing medical records'
      });
      return;
    }

    req.patientId = patient._id;
    next();
  } catch (error) {
    next(error);
  }
}
