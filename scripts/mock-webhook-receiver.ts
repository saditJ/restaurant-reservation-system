import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.WEBHOOK_SECRET;
const PORT = Number(process.env.WEBHOOK_RECEIVER_PORT ?? 4005);

if (!SECRET) {
  console.error('WEBHOOK_SECRET env var is required to validate signatures');
  process.exit(1);
}

createServer((req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return;
  }

  const chunks: Uint8Array[] = [];
  req.on('data', (chunk) => {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  });

  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const rawBody = buffer.toString('utf8');

    const signatureHeader = req.headers['x-reserve-signature'];
    const timestampHeader = req.headers['x-reserve-timestamp'];

    if (!signatureHeader || !timestampHeader) {
      console.error('Missing signature headers');
      res.statusCode = 400;
      res.end('Missing signature headers');
      return;
    }

    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    const expected = createHmac('sha256', SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const provided = signature
      .split(',')
      .find((part) => part.trim().startsWith('v1='))
      ?.split('=')[1]
      ?.trim();

    const isValid = provided
      ? timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
      : false;

    console.log('--- Incoming webhook ---');
    console.log('Event:', req.headers['x-reserve-event']);
    console.log('Delivery ID:', req.headers['x-reserve-delivery']);
    console.log('Timestamp:', timestamp);
    console.log('Signature valid:', isValid);
    console.log('Body:', rawBody);

    res.statusCode = isValid ? 200 : 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: isValid }));
  });

  req.on('error', (error) => {
    console.error('Request error', error);
    res.statusCode = 500;
    res.end();
  });
}).listen(PORT, () => {
  console.log(`Mock webhook receiver listening on http://localhost:${PORT}`);
});
