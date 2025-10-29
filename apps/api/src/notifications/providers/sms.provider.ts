import { Logger } from '@nestjs/common';

export type SmsPayload = {
  to: string;
  text: string;
};

export class SmsNotificationProvider {
  private readonly logger = new Logger(SmsNotificationProvider.name);
  private readonly hasCredentials: boolean;
  private readonly fromNumber: string | null;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    this.hasCredentials = Boolean(accountSid && authToken && from);
    this.fromNumber = from ?? null;
  }

  async send(payload: SmsPayload): Promise<void> {
    if (!this.hasCredentials) {
      this.logger.warn(
        `[stub] Twilio credentials missing; skipping SMS delivery to ${payload.to}. Message body:\n${payload.text}`,
      );
      return;
    }

    this.logger.log(
      `[stub] Sending SMS via Twilio to ${payload.to} from ${this.fromNumber ?? 'unknown'}:\n${payload.text}`,
    );
  }
}
