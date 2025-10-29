import { Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export class EmailNotificationProvider {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly logger = new Logger(EmailNotificationProvider.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    this.from =
      process.env.NOTIFICATIONS_EMAIL_FROM ??
      'reservations@example.test';
  }

  async send(payload: EmailPayload): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });

    const messageId = info.messageId ?? 'dev-transport';
    this.logger.log(
      `Email notification sent to ${payload.to} (messageId=${messageId})`,
    );

    const preview =
      typeof info.message === 'string'
        ? info.message
        : info.message?.toString('utf-8');
    if (preview) {
      this.logger.debug(`Email preview:\n${preview}`);
    }
  }
}
