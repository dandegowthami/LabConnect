import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import { getPatientOrders, getPatientReports, isPdfAvailable } from '../services/reportService.js';

export async function getPatientProfile(req, res, next) {
  try {
    const patient = await Patient.findById(req.patientId).select('fullName mobile').lean();
    if (!patient) {
      res.status(404).json({ success: false, message: 'Patient profile not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        patient: {
          name: patient.fullName,
          mobile: `${patient.mobile.slice(0, 2)}******${patient.mobile.slice(-2)}`
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientOrdersList(req, res, next) {
  try {
    const data = await getPatientOrders(req.patientId, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getPatientReportsList(req, res, next) {
  try {
    const data = await getPatientReports(req.patientId, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
