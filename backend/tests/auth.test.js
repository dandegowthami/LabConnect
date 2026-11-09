import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../app.js';
import { env } from '../config/env.js';
import OTP from '../models/OTP.js';
import Patient from '../models/Patient.js';
import PatientAuditEvent from '../models/PatientAuditEvent.js';
import PatientContactSession from '../models/PatientContactSession.js';
import PatientPortalActivation from '../models/PatientPortalActivation.js';
import User from '../models/User.js';
import { identifyPatientLimiter, requestOtpLimiter, staffLoginLimiter, verifyOtpLimiter } from '../routes/authRoutes.js';
import { hashOtp } from '../services/otpService.js';

const registeredMobile = '9876543210';

async function seedPatient(mobile = registeredMobile) {
  return Patient.create({
    patientId: `PAT-${new mongoose.Types.ObjectId().toString()}`,
    fullName: 'Synthetic Patient',
    mobile,
    consentStatus: 'granted'
  });
}

async function seedStaff({ role = 'staff', isActive = true, email = 'staff@labconnect.demo' } = {}) {
  return User.create({
    name: 'Demo Staff',
    email,
    passwordHash: await bcrypt.hash('DemoPassword123', 4),
    role,
    isActive
  });
}

async function requestOtp(mobile = registeredMobile) {
  return request(app).post('/api/auth/patient/request-otp').send({ mobile });
}

function resetLimiters() {
  for (const limiter of [requestOtpLimiter, verifyOtpLimiter, identifyPatientLimiter, staffLoginLimiter]) {
    limiter.resetKey('::ffff:127.0.0.1');
    limiter.resetKey('127.0.0.1');
  }
}

beforeEach(async () => {
  await Promise.all([
    OTP.deleteMany({}),
    PatientContactSession.deleteMany({}),
    PatientPortalActivation.deleteMany({}),
    PatientAuditEvent.deleteMany({}),
    Patient.deleteMany({}),
    User.deleteMany({})
  ]);
  resetLimiters();
});

afterEach(() => resetLimiters());

describe('health and patient OTP', () => {
  it('returns a successful health response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('allows the Vite development origin on a non-default port', async () => {
    const response = await request(app)
      .options('/api/auth/patient/request-otp')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });

  it('rejects non-local development origins', async () => {
    const response = await request(app)
      .options('/api/auth/patient/request-otp')
      .set('Origin', 'http://example.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(403);
  });

  it('requests an OTP for a registered Indian mobile and stores only a hash', async () => {
    await seedPatient();
    const response = await requestOtp();
    expect(response.status).toBe(200);
    expect(response.body.data.developmentOtp).toMatch(/^\d{6}$/);
    const otp = await OTP.findOne({ mobile: registeredMobile }).select('+hashedOTP');
    expect(otp.hashedOTP).not.toBe(response.body.data.developmentOtp);
    expect(otp.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects invalid mobile numbers', async () => {
    const response = await requestOtp('123');
    expect(response.status).toBe(400);
  });

  it('does not disclose whether an unknown patient is registered', async () => {
    const response = await requestOtp();
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if this number is registered/i);
    expect(await OTP.countDocuments()).toBe(0);
  });

  it('verifies a correct OTP and issues a contact-only patient token', async () => {
    await seedPatient();
    const sent = await requestOtp();
    const response = await request(app).post('/api/auth/patient/verify-otp').send({
      mobile: registeredMobile,
      otp: sent.body.data.developmentOtp
    });
    expect(response.status).toBe(200);
    expect(response.body.data.patient).toEqual({ role: 'patient', contactVerified: true, mobile: '98******10' });
    const claims = jwt.verify(response.body.data.token, env.JWT_SECRET);
    expect(claims.role).toBe('patient');
    expect(claims.sub).toMatch(/^patient-contact:/);
    expect(claims.sub).not.toContain(registeredMobile);
    expect(claims.contactSessionId).toBeTruthy();
    expect(claims.patientId).toBeUndefined();
    expect(await PatientContactSession.countDocuments({ mobile: registeredMobile })).toBe(1);
  });

  it('lets staff issue a one-time code after identity verification and binds only the selected family member', async () => {
    const firstPatient = await seedPatient();
    const secondPatient = await Patient.create({
      patientId: `PAT-${new mongoose.Types.ObjectId().toString()}`,
      fullName: 'Another Synthetic Patient',
      mobile: registeredMobile
    });
    const staff = await seedStaff();
    const staffLogin = await request(app).post('/api/auth/staff/login')
      .send({ email: staff.email, password: 'DemoPassword123' });

    const missingIdentityConfirmation = await request(app)
      .post(`/api/staff/patients/${firstPatient.patientId}/portal-activation`)
      .set('Authorization', `Bearer ${staffLogin.body.data.token}`)
      .send({});
    expect(missingIdentityConfirmation.status).toBe(400);

    const issued = await request(app)
      .post(`/api/staff/patients/${firstPatient.patientId}/portal-activation`)
      .set('Authorization', `Bearer ${staffLogin.body.data.token}`)
      .send({ identityVerified: true });
    expect(issued.status).toBe(201);
    expect(issued.body.data.activationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const activation = await PatientPortalActivation.findOne({ patientId: firstPatient._id }).select('+codeHash');
    expect(activation.codeHash).not.toBe(issued.body.data.activationCode);
    expect(await PatientAuditEvent.countDocuments({ patientId: firstPatient._id, action: 'portal-activation-issued' })).toBe(1);

    const sent = await requestOtp();
    const contactLogin = await request(app).post('/api/auth/patient/verify-otp').send({
      mobile: registeredMobile,
      otp: sent.body.data.developmentOtp
    });
    const wrongFamilyProfile = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${contactLogin.body.data.token}`)
      .send({
        patientId: secondPatient.patientId,
        activationCode: issued.body.data.activationCode,
        password: 'MyPrivatePortalPassphrase',
        portalConsentAccepted: true
      });
    expect(wrongFamilyProfile.status).toBe(403);
    const activated = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${contactLogin.body.data.token}`)
      .send({
        patientId: firstPatient.patientId,
        activationCode: issued.body.data.activationCode,
        password: 'MyPrivatePortalPassphrase',
        portalConsentAccepted: true
      });

    expect(activated.status).toBe(200);
    expect(activated.body.data.patient).toMatchObject({
      patientId: firstPatient.patientId,
      identityVerified: true
    });
    const claims = jwt.verify(activated.body.data.token, env.JWT_SECRET);
    expect(claims.patientId).toBe(String(firstPatient._id));
    expect(claims.patientId).not.toBe(String(secondPatient._id));
    expect((await Patient.findById(firstPatient._id)).portalConsentVersion).toBe('portal-privacy-v1');
    expect(await PatientAuditEvent.countDocuments({ patientId: firstPatient._id, action: 'portal-account-activated' })).toBe(1);
    expect((await request(app).get('/api/patients/me')
      .set('Authorization', `Bearer ${activated.body.data.token}`)).status).toBe(200);

    const replay = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${contactLogin.body.data.token}`)
      .send({
        patientId: firstPatient.patientId,
        activationCode: issued.body.data.activationCode,
        password: 'AnotherPrivatePassphrase',
        portalConsentAccepted: true
      });
    expect(replay.status).toBe(403);
  });

  it('locks an activation code after five incorrect attempts', async () => {
    const patient = await seedPatient();
    const staff = await seedStaff();
    const staffLogin = await request(app).post('/api/auth/staff/login')
      .send({ email: staff.email, password: 'DemoPassword123' });
    const issued = await request(app)
      .post(`/api/staff/patients/${patient.patientId}/portal-activation`)
      .set('Authorization', `Bearer ${staffLogin.body.data.token}`)
      .send({ identityVerified: true });
    const sent = await requestOtp();
    const contactLogin = await request(app).post('/api/auth/patient/verify-otp').send({
      mobile: registeredMobile,
      otp: sent.body.data.developmentOtp
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/patient/identify')
        .set('Authorization', `Bearer ${contactLogin.body.data.token}`)
        .send({
          patientId: patient.patientId,
          activationCode: 'a'.repeat(43),
          password: 'MyPrivatePortalPassphrase',
          portalConsentAccepted: true
        });
    }

    const denied = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${contactLogin.body.data.token}`)
      .send({
        patientId: patient.patientId,
        activationCode: issued.body.data.activationCode,
        password: 'MyPrivatePortalPassphrase',
        portalConsentAccepted: true
      });
    expect(denied.status).toBe(401);
    expect((await PatientPortalActivation.findOne({ patientId: patient._id })).attempts).toBe(5);
  });

  it('requires the clinic activation code and separate portal consent for first-time setup', async () => {
    const patient = await seedPatient();
    const staff = await seedStaff();
    const staffLogin = await request(app).post('/api/auth/staff/login')
      .send({ email: staff.email, password: 'DemoPassword123' });
    const issued = await request(app)
      .post(`/api/staff/patients/${patient.patientId}/portal-activation`)
      .set('Authorization', `Bearer ${staffLogin.body.data.token}`)
      .send({ identityVerified: true });
    const sent = await requestOtp();
    const contactLogin = await request(app).post('/api/auth/patient/verify-otp').send({
      mobile: registeredMobile,
      otp: sent.body.data.developmentOtp
    });

    const response = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${contactLogin.body.data.token}`)
      .send({
        patientId: patient.patientId,
        activationCode: issued.body.data.activationCode,
        password: 'MyPrivatePortalPassphrase'
      });
    expect(response.status).toBe(400);
    expect(await Patient.findById(patient._id).select('+portalPasswordHash')).toMatchObject({ portalPasswordHash: null });
  });

  it('requires the patient password after activation, even with a valid shared phone OTP', async () => {
    const patient = await seedPatient();
    const staff = await seedStaff();
    const staffLogin = await request(app).post('/api/auth/staff/login')
      .send({ email: staff.email, password: 'DemoPassword123' });
    const issued = await request(app)
      .post(`/api/staff/patients/${patient.patientId}/portal-activation`)
      .set('Authorization', `Bearer ${staffLogin.body.data.token}`)
      .send({ identityVerified: true });
    const firstOtp = await requestOtp();
    const firstContact = await request(app).post('/api/auth/patient/verify-otp').send({
      mobile: registeredMobile,
      otp: firstOtp.body.data.developmentOtp
    });
    const initialLogin = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${firstContact.body.data.token}`)
      .send({
        patientId: patient.patientId,
        activationCode: issued.body.data.activationCode,
        password: 'MyPrivatePortalPassphrase',
        portalConsentAccepted: true
      });
    expect(initialLogin.status).toBe(200);

    const nextOtp = await requestOtp();
    const nextContact = await request(app).post('/api/auth/patient/verify-otp').send({
      mobile: registeredMobile,
      otp: nextOtp.body.data.developmentOtp
    });
    const denied = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${nextContact.body.data.token}`)
      .send({ patientId: patient.patientId, password: 'WrongPassphrase123' });
    expect(denied.status).toBe(403);

    const allowed = await request(app).post('/api/auth/patient/identify')
      .set('Authorization', `Bearer ${nextContact.body.data.token}`)
      .send({ patientId: patient.patientId, password: 'MyPrivatePortalPassphrase' });
    expect(allowed.status).toBe(200);
    expect(jwt.verify(allowed.body.data.token, env.JWT_SECRET).patientId).toBe(String(patient._id));
  });

  it('rejects incorrect OTPs', async () => {
    await seedPatient();
    await requestOtp();
    const response = await request(app).post('/api/auth/patient/verify-otp').send({ mobile: registeredMobile, otp: '111111' });
    expect(response.status).toBe(400);
  });

  it('rejects expired OTPs', async () => {
    await seedPatient();
    await OTP.create({
      mobile: registeredMobile,
      hashedOTP: await hashOtp('123456'),
      expiresAt: new Date(Date.now() - 1000)
    });
    const response = await request(app).post('/api/auth/patient/verify-otp').send({ mobile: registeredMobile, otp: '123456' });
    expect(response.status).toBe(400);
  });

  it('rejects an OTP after it has already been used', async () => {
    await seedPatient();
    const sent = await requestOtp();
    const body = { mobile: registeredMobile, otp: sent.body.data.developmentOtp };
    expect((await request(app).post('/api/auth/patient/verify-otp').send(body)).status).toBe(200);
    expect((await request(app).post('/api/auth/patient/verify-otp').send(body)).status).toBe(400);
  });

  it('blocks verification after five incorrect attempts', async () => {
    await seedPatient();
    await requestOtp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/patient/verify-otp').send({ mobile: registeredMobile, otp: '111111' });
    }
    const response = await request(app).post('/api/auth/patient/verify-otp').send({ mobile: registeredMobile, otp: '123456' });
    expect(response.status).toBe(400);
    expect((await OTP.findOne({ mobile: registeredMobile })).attempts).toBe(5);
  });

  it('rate limits repeated OTP requests', async () => {
    await seedPatient();
    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) results.push(await requestOtp());
    expect(results.slice(0, 5).every((response) => response.status === 200)).toBe(true);
    expect(results[5].status).toBe(429);
  });
});

describe('staff login', () => {
  it('logs in an active staff account without returning its password hash', async () => {
    await seedStaff();
    const response = await request(app).post('/api/auth/staff/login').send({
      email: 'STAFF@LABCONNECT.DEMO',
      password: 'DemoPassword123'
    });
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe('staff');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it.each([
    ['incorrect password', 'staff@labconnect.demo', 'wrong'],
    ['unknown email', 'unknown@labconnect.demo', 'DemoPassword123']
  ])('rejects %s', async (_label, email, password) => {
    await seedStaff();
    const response = await request(app).post('/api/auth/staff/login').send({ email, password });
    expect(response.status).toBe(401);
  });

  it('rejects inactive staff', async () => {
    await seedStaff({ isActive: false });
    const response = await request(app).post('/api/auth/staff/login').send({
      email: 'staff@labconnect.demo',
      password: 'DemoPassword123'
    });
    expect(response.status).toBe(401);
  });

  it('validates missing fields', async () => {
    const response = await request(app).post('/api/auth/staff/login').send({});
    expect(response.status).toBe(400);
  });
});

describe('JWT authentication and roles', () => {
  it('accepts a valid JWT and returns a safe profile', async () => {
    const staff = await seedStaff();
    const token = jwt.sign({ sub: staff.id, role: 'staff' }, env.JWT_SECRET, { expiresIn: '1h' });
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ email: staff.email, role: 'staff' });
  });

  it('rejects missing and invalid JWTs', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });

  it('rejects expired JWTs', async () => {
    const token = jwt.sign({ sub: 'some-id', role: 'patient' }, env.JWT_SECRET, { expiresIn: -1 });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('prevents a patient token from accessing staff-only routes', async () => {
    const token = jwt.sign({ sub: 'patient-contact:test', role: 'patient' }, env.JWT_SECRET);
    const { allowRoles } = await import('../middleware/roleMiddleware.js');
    const { authenticate } = await import('../middleware/authMiddleware.js');
    const express = (await import('express')).default;
    const roleApp = express();
    roleApp.get('/staff-only', authenticate, allowRoles('staff', 'admin'), (_req, res) => res.sendStatus(204));
    const response = await request(roleApp).get('/staff-only').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('prevents staff from accessing patient-only and admin routes', async () => {
    const staff = await seedStaff();
    const token = jwt.sign({ sub: staff.id, role: 'staff' }, env.JWT_SECRET);
    const { allowRoles } = await import('../middleware/roleMiddleware.js');
    const roleApp = (await import('express')).default();
    roleApp.get('/patient-only', (await import('../middleware/authMiddleware.js')).authenticate, allowRoles('patient'), (_req, res) => res.sendStatus(204));
    roleApp.get('/admin-only', (await import('../middleware/authMiddleware.js')).authenticate, allowRoles('admin'), (_req, res) => res.sendStatus(204));
    expect((await request(roleApp).get('/patient-only').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(roleApp).get('/admin-only').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('allows an admin role and denies a staff role on admin-only routes', async () => {
    const admin = await seedStaff({ role: 'admin', email: 'admin@labconnect.demo' });
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, env.JWT_SECRET);
    const { allowRoles } = await import('../middleware/roleMiddleware.js');
    const { authenticate } = await import('../middleware/authMiddleware.js');
    const express = (await import('express')).default;
    const roleApp = express();
    roleApp.get('/admin-only', authenticate, allowRoles('admin'), (_req, res) => res.sendStatus(204));
    expect((await request(roleApp).get('/admin-only').set('Authorization', `Bearer ${token}`)).status).toBe(204);
  });

  it('documents client-side logout and keeps token revocation out of scope', async () => {
    const patientToken = jwt.sign({ sub: 'patient-contact:test', role: 'patient' }, env.JWT_SECRET);
    const response = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${patientToken}`);
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/remains valid until it expires/);
  });
});
