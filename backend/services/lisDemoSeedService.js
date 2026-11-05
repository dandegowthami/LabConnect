import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import TestOrder from '../models/TestOrder.js';

const demoData = [
  {
    patient: { patientId: 'DEMO-LIS-PAT-001', fullName: 'Lakshmi Prasanna K', mobile: '9000000011', consentStatus: 'granted' },
    doctor: { doctorId: 'DEMO-LIS-DOC-001', name: 'Dr. S. Ramanaiah', registrationNumber: 'DEMO-REG-001' },
    order: { orderId: 'ORD-71204', status: 'Ready', testName: 'Haemoglobin', result: 10.2, unit: 'g/dL', referenceMin: 12, referenceMax: 15.5 }
  },
  {
    patient: { patientId: 'DEMO-LIS-PAT-002', fullName: 'Venkata Rao M', mobile: '9000000012', consentStatus: 'granted' },
    doctor: { doctorId: 'DEMO-LIS-DOC-002', name: 'Dr. P. Anitha', registrationNumber: 'DEMO-REG-002' },
    order: { orderId: 'ORD-71219', status: 'Processing', testName: 'LDL Cholesterol', result: 142, unit: 'mg/dL', referenceMin: 0, referenceMax: 100 }
  },
  {
    patient: { patientId: 'DEMO-LIS-PAT-003', fullName: 'Farzana Begum', mobile: '9000000013', consentStatus: 'granted' },
    doctor: { doctorId: 'DEMO-LIS-DOC-003', name: 'Dr. K. Sure', registrationNumber: 'DEMO-REG-003' },
    order: { orderId: 'ORD-71233', status: 'Ready', testName: 'Potassium', result: 6.8, unit: 'mmol/L', referenceMin: 3.5, referenceMax: 5.1 }
  }
];

async function insertSyntheticRecord(Model, key, values, label) {
  const existing = await Model.findOne({ [key]: values[key] });
  if (existing) return existing;
  try {
    return await Model.create(values);
  } catch (error) {
    if (error.code !== 11000) throw error;
    const racedRecord = await Model.findOne({ [key]: values[key] });
    if (!racedRecord) throw error;
    console.info(`Reusing existing ${label} ${values[key]}`);
    return racedRecord;
  }
}

export async function seedLisDemo() {
  for (const { patient: patientData, doctor: doctorData, order: orderData } of demoData) {
    const patient = await insertSyntheticRecord(Patient, 'patientId', patientData, 'patient');
    if (patient.fullName !== patientData.fullName || patient.mobile !== patientData.mobile) {
      throw new Error(`Existing patient ${patientData.patientId} has conflicting identity details`);
    }

    const doctor = await insertSyntheticRecord(Doctor, 'doctorId', doctorData, 'doctor');
    if (doctor.name !== doctorData.name) throw new Error(`Existing doctor ${doctorData.doctorId} has conflicting details`);

    let order = await TestOrder.findOne({ orderId: orderData.orderId });
    if (!order) {
      order = await insertSyntheticRecord(TestOrder, 'orderId', {
        ...orderData,
        patientId: patient._id,
        referringDoctorId: doctor._id,
        laboratoryId: 'DEMO-LIS',
        tests: [{
          testName: orderData.testName,
          result: orderData.result,
          unit: orderData.unit,
          referenceMin: orderData.referenceMin,
          referenceMax: orderData.referenceMax,
          resultStatus: 'Not evaluated'
        }],
        orderDate: new Date('2026-01-15T00:00:00.000Z')
      }, 'order');
    }
    if (String(order.patientId) !== String(patient._id) || String(order.referringDoctorId) !== String(doctor._id)) {
      throw new Error(`Existing order ${orderData.orderId} has conflicting patient or doctor references`);
    }

    const reportId = `RPT-${orderData.orderId}`;
    await insertSyntheticRecord(Report, 'reportId', {
      reportId,
      orderId: order._id,
      patientId: patient._id,
      parameters: [{
        parameterName: orderData.testName,
        result: orderData.result,
        unit: orderData.unit,
        referenceMin: orderData.referenceMin,
        referenceMax: orderData.referenceMax
      }],
      reportStatus: orderData.status,
      signedAt: null
    }, 'report');
  }
  return demoData.length;
}
