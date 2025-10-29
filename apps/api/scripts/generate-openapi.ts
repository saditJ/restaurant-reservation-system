import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import '../src/bootstrap-env';
import { AppModule } from '../src/app.module';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Reserve Platform API')
    .setDescription(
      'REST API for reservation management, webhooks, and integrations.',
    )
    .setVersion(process.env.npm_package_version ?? '1.0.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key issued via the console settings',
      },
      'ApiKeyAuth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).filter(([path]) =>
      path.startsWith('/v1/'),
    ),
  );

  const outputPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));
  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${outputPath}`);

  await app.close();
}

generate().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI document', error);
  process.exitCode = 1;
});
