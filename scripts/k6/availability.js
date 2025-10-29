import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL ?? __ENV.K6_BASE_URL ?? "http://localhost:3003/v1";
const VENUE_ID = __ENV.VENUE_ID ?? __ENV.K6_VENUE_ID ?? "venue-main";
const API_KEY = __ENV.API_KEY ?? "";
const PARTY = __ENV.PARTY ?? "2";
const DATE = __ENV.DATE ?? "2025-01-01";
const TIME = __ENV.TIME ?? "18:00";

export const options = {
  vus: Number(__ENV.VUS ?? __ENV.K6_VUS ?? 5),
  duration: __ENV.DURATION ?? __ENV.K6_DURATION ?? "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2500"],
    availability_duration: ["p(95)<2500"],
  },
};

const availabilityDuration = new Trend("availability_duration", true);

export default function () {
  const headers = API_KEY ? { "x-api-key": API_KEY } : undefined;
  const url = `${BASE_URL}/availability?venueId=${VENUE_ID}&date=${DATE}&time=${TIME}&partySize=${PARTY}`;
  const response = http.get(url, { headers });

  let payload;
  try {
    payload = response.json();
  } catch (error) {
    payload = null;
  }

  check(response, {
    "status is 200": (r) => r.status === 200,
    "slots array present": () => Array.isArray(payload?.slots),
  });

  availabilityDuration.add(response.timings.duration);
  sleep(1);
}
