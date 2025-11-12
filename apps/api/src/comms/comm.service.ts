import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CommTemplateKind } from '@prisma/client';
import nodemailer, { Transporter } from 'nodemailer';
import { Temporal } from '@js-temporal/polyfill';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  buildIcsBuffer,
  escapeIcsText,
  formatUtcInstant,
  formatZonedDateTime,
  toZonedDateTime,
} from './ics.util';

type TemplateData = Record<string, unknown>;
type SendEmailOptions = {
  text?: string;
  ics?: {
    filename?: string;
    content: Buffer;
  };
};

const pad = (value: number) => value.toString().padStart(2, '0');
const padTime = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

export type IcsPayloadInput = {
  id: string;
  venue: {
    name: string;
    timezone: string;
  };
  slotStartUtc: Date | string;
  partySize: number;
  guestName?: string | null;
  durationMinutes?: number | null;
  expiresAt?: Date | string | null;
  manageUrl?: string | null;
  code?: string | null;
};

export type ReservationCommDetails = {
  id: string;
  code: string;
  guestName: string;
  partySize: number;
  slotStartUtc: Date | string;
  durationMinutes?: number | null;
  venue: {
    id: string;
    name: string;
    timezone: string;
  };
  manageUrl?: string | null;
  offerUrl?: string | null;
  expiresAt?: Date | string | null;
  modifyUrl?: string | null;
  cancelUrl?: string | null;
};

@Injectable()
export class CommService {
  private readonly logger = new Logger(CommService.name);
  private readonly mailFrom: string;
  private readonly smtpUrl?: string;
  private transporter?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.mailFrom =
      process.env.MAIL_FROM || 'Reservations <no-reply@example.test>';
    this.smtpUrl = process.env.SMTP_URL ?? undefined;

    if (this.smtpUrl) {
      this.transporter = nodemailer.createTransport(this.smtpUrl);
    } else {
      this.logger.warn(
        'SMTP_URL is not set; CommService will skip sendEmail until configured.',
      );
    }
  }

  async render(
    kind: CommTemplateKind,
    venueId: string,
    data: TemplateData,
  ): Promise<{ subject: string; html: string; text?: string }> {
    const template = await this.prisma.commTemplate.findUnique({
      where: {
        venueId_kind: {
          venueId,
          kind,
        },
      },
    });

    if (!template) {
      const fallback = this.buildDefaultTemplate(kind, data);
      if (fallback) {
        return fallback;
      }
      throw new NotFoundException(
        `Communication template ${kind} for venue ${venueId} is missing.`,
      );
    }

    return {
      subject: this.interpolate(template.subject, data),
      html: this.interpolate(template.html, data),
    };
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    options: SendEmailOptions = {},
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `SMTP transport not configured; skipping email to ${to} with subject "${subject}".`,
      );
      return false;
    }

    const message: nodemailer.SendMailOptions = {
      from: this.mailFrom,
      to,
      subject,
      html,
    };

    if (options.text) {
      message.text = options.text;
    }

    const attachments: nodemailer.Attachment[] = [];
    if (options.ics) {
      attachments.push({
        filename: options.ics.filename ?? 'reservation.ics',
        content: options.ics.content,
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      });
    }
    if (attachments.length > 0) {
      message.attachments = attachments;
    }

    try {
      await this.transporter.sendMail(message);
      this.logger.debug(`Dispatched email to ${to} with subject "${subject}"`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to} with subject "${subject}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async sendReservationEmail(params: {
    kind: CommTemplateKind;
    to: string;
    reservation: ReservationCommDetails;
    includeCalendar?: boolean;
  }): Promise<void> {
    const { kind, to, reservation, includeCalendar = false } = params;
    const templateData = this.buildReservationTemplateData(reservation);

    try {
      const { subject, html, text } = await this.render(
        kind,
        reservation.venue.id,
        templateData,
      );

      let icsBuffer: Buffer | undefined;
      if (includeCalendar) {
        icsBuffer = this.makeICS({
          id: reservation.id,
          venue: {
            name: reservation.venue.name,
            timezone: reservation.venue.timezone,
          },
          slotStartUtc: reservation.slotStartUtc,
          partySize: reservation.partySize,
          guestName: reservation.guestName,
          durationMinutes: reservation.durationMinutes,
          manageUrl: reservation.manageUrl,
          code: reservation.code,
          expiresAt: reservation.expiresAt ?? null,
        });
      }

      const delivered = await this.sendEmail(to, subject, html, {
        text,
        ics: icsBuffer
          ? {
              filename: this.resolveIcsFilename(kind, reservation),
              content: icsBuffer,
            }
          : undefined,
      });

      if (delivered) {
        this.metrics?.incrementCommsSent(kind);
      }
    } catch (error) {
      this.metrics?.incrementCommsFailed(kind);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send ${kind} communication to ${to}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private buildDefaultTemplate(
    kind: CommTemplateKind,
    data: TemplateData,
  ): { subject: string; html: string; text: string } | null {
    const guestName = (data.guestName as string) || 'there';
    const venueName = (data.venueName as string) || 'our venue';
    const time = (data.time as string) || 'your scheduled time';
    const partySize = (data.partySize as string) || '';
    const manageUrl = (data.manageUrl as string) || '';
    const modifyUrl = (data.modifyUrl as string) || manageUrl;
    const cancelUrl = (data.cancelUrl as string) || '';
    const offerUrl = (data.offerUrl as string) || manageUrl;

    if (kind === CommTemplateKind.CONFIRM) {
      const subject = `Your reservation at ${venueName}`;
      const partyLine = partySize ? ` for ${partySize} guests` : '';
      const textLines = [
        `Hi ${guestName},`,
        '',
        `Your reservation${partyLine} on ${time} is confirmed.`,
      ];
      if (modifyUrl) {
        textLines.push('', `Modify your reservation: ${modifyUrl}`);
      } else if (manageUrl) {
        textLines.push('', `Manage your reservation: ${manageUrl}`);
      }
      if (cancelUrl) {
        textLines.push('', `Cancel your reservation: ${cancelUrl}`);
      }
      textLines.push('', `See you soon,`, venueName);
      const text = textLines.join('\n');
      const actionAnchors: string[] = [];
      if (modifyUrl) {
        actionAnchors.push(
          `<p><a href="${modifyUrl}">Modify your reservation</a></p>`,
        );
      } else if (manageUrl) {
        actionAnchors.push(
          `<p><a href="${manageUrl}">Manage your reservation</a></p>`,
        );
      }
      if (cancelUrl) {
        actionAnchors.push(
          `<p><a href="${cancelUrl}">Cancel your reservation</a></p>`,
        );
      }
      const html = `<p>Hi ${guestName},</p><p>Your reservation${
        partyLine ? ` <strong>${partyLine.trim()}</strong>` : ''
      } on <strong>${time}</strong> is confirmed.</p>${actionAnchors.join(
        '',
      )}<p>See you soon,<br/>${venueName}</p>`;
      return { subject, html, text };
    }

    if (kind === CommTemplateKind.OFFER) {
      const subject = `A table is available at ${venueName}`;
      const partyLine = partySize ? ` for ${partySize} guests` : '';
      const linkLine = offerUrl ? `Claim your table: ${offerUrl}` : '';
      const textLines = [
        `Hi ${guestName},`,
        '',
        `A table${partyLine} on ${time} is now available.`,
      ];
      if (linkLine) {
        textLines.push(linkLine);
      }
      textLines.push('', `Thanks,`, venueName);
      const text = textLines.join('\n');
      const actionAnchor = offerUrl
        ? `<p><a href="${offerUrl}">Confirm your table</a></p>`
        : '';
      const html = `<p>Hi ${guestName},</p><p>A table${partyLine ? ` <strong>${partyLine.trim()}</strong>` : ''} on <strong>${time}</strong> is now available.</p>${actionAnchor}<p>Thanks,<br/>${venueName}</p>`;
      return { subject, html, text };
    }

    return null;
  }

  makeICS(input: IcsPayloadInput): Buffer {
    const timezone = input.venue.timezone;
    const start = toZonedDateTime(input.slotStartUtc, timezone);

    let end: Temporal.ZonedDateTime;
    if (input.expiresAt) {
      end = toZonedDateTime(input.expiresAt, timezone);
      if (Temporal.ZonedDateTime.compare(end, start) <= 0) {
        const fallbackMinutes =
          input.durationMinutes && input.durationMinutes > 0
            ? input.durationMinutes
            : 30;
        end = start.add({ minutes: fallbackMinutes });
      }
    } else {
      const minutes =
        input.durationMinutes && input.durationMinutes > 0
          ? input.durationMinutes
          : 90;
      end = start.add({ minutes });
    }

    const summaryParts = [`Reservation at ${input.venue.name}`];
    if (input.guestName) {
      summaryParts.push(`for ${input.guestName}`);
    }
    summaryParts.push(`party of ${input.partySize}`);
    const summary = summaryParts.join(' ');

    const descriptionLines = [
      `Guest: ${input.guestName ?? 'Reserved'}`,
      `Party Size: ${input.partySize}`,
      `Venue: ${input.venue.name}`,
      `Starts: ${start.toPlainDate().toString()} ${padTime(start.hour, start.minute)} ${timezone}`,
      `Ends: ${end.toPlainDate().toString()} ${padTime(end.hour, end.minute)} ${timezone}`,
    ];

    if (input.code) {
      descriptionLines.push(`Reference: ${input.code}`);
    }
    if (input.manageUrl) {
      descriptionLines.push(`Manage: ${input.manageUrl}`);
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Reserve Platform//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(`${input.id}@reserve-platform.local`)}`,
      `DTSTAMP:${formatUtcInstant(Temporal.Now.instant())}`,
      `DTSTART;TZID=${timezone}:${formatZonedDateTime(start)}`,
      `DTEND;TZID=${timezone}:${formatZonedDateTime(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
      `LOCATION:${escapeIcsText(input.venue.name)}`,
    ];

    if (input.manageUrl) {
      lines.push(`URL:${escapeIcsText(input.manageUrl)}`);
    }

    lines.push('END:VEVENT', 'END:VCALENDAR');

    return buildIcsBuffer(lines);
  }

  private interpolate(template: string, data: TemplateData): string {
    return template.replace(/{{\s*([\w]+)\s*}}/g, (match, key) => {
      const value = data[key];
      if (value === undefined || value === null) {
        this.logger.debug(
          `No value provided for template token "${key}" using empty string.`,
        );
        return '';
      }
      return String(value);
    });
  }

  private buildReservationTemplateData(
    reservation: ReservationCommDetails,
  ): TemplateData {
    const manageUrl = reservation.manageUrl ?? reservation.modifyUrl ?? '';
    const modifyUrl = reservation.modifyUrl ?? manageUrl;
    return {
      guestName: reservation.guestName,
      time: this.formatDisplayTime(
        reservation.slotStartUtc,
        reservation.venue.timezone,
      ),
      partySize: String(reservation.partySize),
      venueName: reservation.venue.name,
      manageUrl,
      modifyUrl: modifyUrl ?? '',
      cancelUrl: reservation.cancelUrl ?? '',
      offerUrl: reservation.offerUrl ?? '',
    };
  }

  private formatDisplayTime(input: Date | string, timeZone: string): string {
    const date = typeof input === 'string' ? new Date(input) : input;
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  }

  private resolveIcsFilename(
    kind: CommTemplateKind,
    reservation: ReservationCommDetails,
  ): string {
    const code =
      reservation.code.replace(/[^A-Za-z0-9_-]/g, '') || reservation.id;
    const venueSlug =
      reservation.venue.name
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9_-]/g, '')
        .toLowerCase() || 'reservation';
    return `${venueSlug}-${code}-${kind.toLowerCase()}.ics`;
  }
}
