import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

function notificationMessage(channel, secureLink) {
  if (channel === 'SMS') {
    return `Your diagnostic report is ready. Access your secure report using this link: ${secureLink}. The link expires in 72 hours. OTP verification is required.`;
  }
  return `Your LabConnect diagnostic report is ready. Tap the secure link to access your report. OTP verification is required: ${secureLink}`;
}

class MockNotificationProvider {
  async send({ message }) {
    if (env.NODE_ENV === 'production') {
      throw Object.assign(new Error('Mock notification providers are disabled in production'), { status: 503 });
    }
    if (process.env.LABCONNECT_MOCK_NOTIFICATION_FAILURE === 'true') {
      return { status: 'Failed', providerMessageId: null, failureReason: 'Mock provider simulated a delivery failure' };
    }
    if (!message || !message.includes('/report-access/')) {
      return { status: 'Failed', providerMessageId: null, failureReason: 'Mock provider rejected the notification message' };
    }
    return { status: 'Sent', providerMessageId: `mock-${randomUUID()}` };
  }
}

export class MockSMSProvider extends MockNotificationProvider {}
export class MockWhatsAppProvider extends MockNotificationProvider {}

export class NotificationService {
  constructor({ smsProvider = new MockSMSProvider(), whatsAppProvider = new MockWhatsAppProvider() } = {}) {
    this.providers = { SMS: smsProvider, WhatsApp: whatsAppProvider };
  }

  async send({ channel, destination, secureLink }) {
    const provider = this.providers[channel];
    if (!provider) throw Object.assign(new Error('Channel must be SMS or WhatsApp'), { status: 400 });
    const message = notificationMessage(channel, secureLink);
    const result = await provider.send({ destination, message });
    return { ...result, channel, destinationMasked: maskMobile(destination), sentAt: new Date() };
  }
}

export function maskMobile(mobile) {
  return `${mobile.slice(0, 2)}******${mobile.slice(-2)}`;
}

export const notificationService = new NotificationService();
