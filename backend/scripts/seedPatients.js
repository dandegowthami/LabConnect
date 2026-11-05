import { connectDatabase, disconnectDatabase } from '../config/db.js';
import Patient from '../models/Patient.js';

await connectDatabase();
try {
  const syntheticPatients = [
    { patientId: 'DEMO-PAT-001', fullName: 'Aarav Demo', mobile: '9000000001', consentStatus: 'granted' },
    { patientId: 'DEMO-PAT-002', fullName: 'Anaya Demo', mobile: '9000000002', consentStatus: 'granted' },
    { patientId: 'DEMO-PAT-003', fullName: 'Ishaan Demo', mobile: '9000000001', consentStatus: 'pending' }
  ];

  await Promise.all(syntheticPatients.map((patient) => Patient.findOneAndUpdate(
    { patientId: patient.patientId },
    { $set: patient },
    { upsert: true, new: true, runValidators: true }
  )));
  console.info(`Seeded ${syntheticPatients.length} synthetic patient accounts`);
} finally {
  await disconnectDatabase();
}
