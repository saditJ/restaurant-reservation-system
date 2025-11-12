import { test, expect, APIRequestContext } from '@playwright/test';

const API_BASE =
  process.env.E2E_API_BASE ??
  process.env.API_BASE_INTERNAL ??
  process.env.API_BASE ??
  'http://127.0.0.1:3003';
const API_KEY =
  process.env.E2E_API_KEY ?? process.env.API_KEY ?? process.env.API_KEYS ?? '';
const VENUE_ID = process.env.E2E_VENUE_ID ?? 'venue-main';
const PARTY_SIZE = Number(process.env.E2E_PARTY_SIZE ?? '2') || 2;

const candidateTimes = [
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
];

type AvailabilityResponse = {
  tables?: Array<{ id: string }>;
  stats?: { available: number };
};

type SlotSelection = {
  date: string;
  time: string;
  partySize: number;
};

test.skip(
  !API_KEY.trim(),
  'Set E2E_API_KEY or API_KEY to run the market booking flow.',
);

test.describe('market booking flow', () => {
  test('user can complete a reservation via market overlay', async ({
    page,
    request,
  }) => {
    const slot = await findAvailableSlot(request);

    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: /Discover venues worth crossing town for/i,
      }),
    ).toBeVisible();

    const firstVenueCard = page.locator('article').first();
    await expect(firstVenueCard).toBeVisible();
    const detailsLink = firstVenueCard.getByRole('link', { name: /View details/i });
    const href = await detailsLink.getAttribute('href');
    expect(href).toBeTruthy();
    const slug = href!.split('/').filter(Boolean).pop();
    expect(slug).toBeTruthy();

    await detailsLink.click();
    await expect(page).toHaveURL(new RegExp(`/r/${slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto(`/venue/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/venue/${slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const reserveButton = page.getByRole('button', { name: /Reserve a Table/i });
    await expect(reserveButton).toBeVisible();
    await reserveButton.click();

    const overlay = page.getByRole('dialog', { name: /Make a Reservation/i });
    await expect(overlay).toBeVisible();

    const frame = overlay.frameLocator('iframe[title="Booking widget"]');
    await expect(frame.getByRole('heading', { name: /Reserve a table/i })).toBeVisible();

    const partyField = frame.getByLabel('Party size');
    await partyField.fill(String(slot.partySize));

    const dateField = frame.getByLabel('Date');
    await dateField.fill(slot.date);

    const timeField = frame.getByLabel('Time');
    await timeField.click();
    await frame.getByRole('button', { name: slot.time }).first().click();
    await expect(timeField).toHaveValue(slot.time);

    const planSubmit = frame.getByRole('button', { name: /Check availability/i });
    await planSubmit.click();

    await expect(frame.getByLabel('Your name')).toBeVisible();

    await frame.getByLabel('Your name').fill('Playwright Tester');
    await frame.getByLabel('Phone number').fill('+1 555 123 4567');
    await frame.getByLabel('Email address').fill('playwright@example.com');
    await frame.getByLabel('Notes').fill('Automated verification booking');
    await frame
      .getByLabel('I agree to the Terms of Use and Privacy Policy.')
      .check();

    await frame.getByRole('button', { name: /Continue to review/i }).click();

    await expect(
      frame.getByRole('heading', { name: /Review your reservation/i }),
    ).toBeVisible();
    await frame.getByRole('button', { name: /Confirm reservation/i }).click();

    const successHeading = frame.getByRole('heading', {
      name: /Reservation confirmed/i,
    });
    await expect(successHeading).toBeVisible();

    const confirmationCode = await frame.locator('span.font-mono').first().innerText();
    expect(confirmationCode.trim()).not.toHaveLength(0);
    expect(confirmationCode.trim()).toMatch(/^[A-Z0-9-]+$/);
  });
});

async function findAvailableSlot(
  request: APIRequestContext,
): Promise<SlotSelection> {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = formatDate(addDays(new Date(), offset));
    for (const time of candidateTimes) {
      const response = await request.get(`${API_BASE.replace(/\/+$/, '')}/v1/availability`, {
        params: {
          venueId: VENUE_ID,
          date,
          time,
          partySize: String(PARTY_SIZE),
        },
        headers: {
          accept: 'application/json',
          'x-api-key': API_KEY,
        },
      });

      if (!response.ok()) {
        continue;
      }

      const payload = (await response.json()) as AvailabilityResponse;
      if (
        Array.isArray(payload.tables) &&
        payload.tables.length > 0 &&
        (payload.stats?.available ?? 0) > 0
      ) {
        return { date, time, partySize: PARTY_SIZE };
      }
    }
  }

  throw new Error(
    `No availability found for venue ${VENUE_ID} within 7 days using API ${API_BASE}.`,
  );
}

function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
