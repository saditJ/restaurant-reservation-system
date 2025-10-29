import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { ReservationNotificationEvent } from './notification.types';

type TemplateVariables = Record<string, string | number | null | undefined>;

export class TemplateRenderer {
  private readonly basePath: string;
  private readonly cache = new Map<string, string>();
  private readonly logger = new Logger(TemplateRenderer.name);

  constructor(basePath?: string) {
    this.basePath = basePath ?? join(__dirname, 'templates');
  }

  async render(
    language: string | null | undefined,
    event: ReservationNotificationEvent,
    variables: TemplateVariables,
  ): Promise<string> {
    const normalizedLanguage = (language ?? 'en').toLowerCase();
    const template = await this.loadTemplate(normalizedLanguage, event);
    return this.interpolate(template, variables);
  }

  private async loadTemplate(
    language: string,
    event: ReservationNotificationEvent,
  ): Promise<string> {
    const cacheKey = `${language}:${event}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const fileName = `reservation-${event}.txt`;
    const filePath = join(this.basePath, language, fileName);

    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      this.cache.set(cacheKey, raw);
      return raw;
    } catch (error) {
      if (language !== 'en') {
        this.logger.warn(
          `Template ${fileName} not found for language ${language}; falling back to English.`,
        );
        return this.loadTemplate('en', event);
      }
      throw error;
    }
  }

  private interpolate(template: string, variables: TemplateVariables) {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, token: string) => {
      const value = variables[token];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  }
}
