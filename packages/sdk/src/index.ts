import createClient from "openapi-fetch";
import type { FetchOptions, FetchResponse } from "openapi-fetch";
import type { FilterKeys, PathsWithMethod } from "openapi-typescript-helpers";
import type { paths } from "./generated";
export type { paths, components } from "./generated";

export type SdkFetch = typeof fetch;

export type ApiClientConfig = {
  baseUrl?: string;
  apiKey?: string;
  defaultHeaders?: HeadersInit;
  fetch?: SdkFetch;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  readonly response: Response;

  constructor(message: string, response: Response, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = response.status;
    this.response = response;
    this.body = body;
  }
}

type AnyMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";

type OptionsFor<
  P extends keyof paths & string,
  M extends AnyMethod,
> = FetchOptions<FilterKeys<paths[P], M>>;

type HttpGet = <P extends PathsWithMethod<paths, "get">>(
  path: P,
  options?: OptionsFor<P, "get">,
) => Promise<FetchResponse<FilterKeys<paths[P], "get">>>;

type HttpPost = <P extends PathsWithMethod<paths, "post">>(
  path: P,
  options?: OptionsFor<P, "post">,
) => Promise<FetchResponse<FilterKeys<paths[P], "post">>>;

type HttpPatch = <P extends PathsWithMethod<paths, "patch">>(
  path: P,
  options?: OptionsFor<P, "patch">,
) => Promise<FetchResponse<FilterKeys<paths[P], "patch">>>;

type HttpDelete = <P extends PathsWithMethod<paths, "delete">>(
  path: P,
  options?: OptionsFor<P, "delete">,
) => Promise<FetchResponse<FilterKeys<paths[P], "delete">>>;

type WebhookEndpointEntity = NonNullable<
  paths["/v1/webhooks/endpoints"]["get"]["responses"][200]["content"]
>["application/json"][number];

type WebhookEndpointListEntity = WebhookEndpointEntity[];

type WebhookDeliveryListEntity = NonNullable<
  paths["/v1/webhooks/deliveries"]["get"]["responses"][200]["content"]
>["application/json"];

type WebhookDeliveryEntity = WebhookDeliveryListEntity["items"][number];

type WebhookSecretEntity = NonNullable<
  paths["/v1/webhooks/secret"]["get"]["responses"][200]["content"]
>["application/json"];

type WebhookCreateEndpointResponse = NonNullable<
  paths["/v1/webhooks/endpoints"]["post"]["responses"][201]["content"]
>["application/json"];

type WebhookRedeliverResponse = NonNullable<
  paths["/v1/webhooks/deliveries/{id}/redeliver"]["post"]["responses"][200]["content"]
>["application/json"];

type ApiKeySummaryEntity = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  rateLimitPerMin: number;
  burstLimit: number;
  scopes: string[];
  usage: {
    allows24h: number;
    drops24h: number;
  };
};

type ApiKeySecretEntity = {
  key: ApiKeySummaryEntity;
  plaintextKey: string;
};

type ApiKeyListEntity = {
  items: ApiKeySummaryEntity[];
};

export type SdkClient = ReturnType<typeof createSdkClient>;

export function createSdkClient(config: ApiClientConfig = {}) {
  const {
    baseUrl = "/api",
    apiKey,
    defaultHeaders,
    fetch: customFetch,
  } = config;

  const headers = mergeHeaders(defaultHeaders, apiKey ? { "x-api-key": apiKey } : undefined);

  const client = createClient<paths>({
    baseUrl,
    fetch: customFetch,
    headers,
  });

  async function GET<P extends PathsWithMethod<paths, "get">>(
    path: P,
    options?: OptionsFor<P, "get">
  ) {
    const final = applyHeaders(options);
    return client.GET(path, final as any);
  }

  async function POST<P extends PathsWithMethod<paths, "post">>(
    path: P,
    options?: OptionsFor<P, "post">
  ) {
    const final = applyHeaders(options);
    return client.POST(path, final as any);
  }

  async function PATCH<P extends PathsWithMethod<paths, "patch">>(
    path: P,
    options?: OptionsFor<P, "patch">
  ) {
    const final = applyHeaders(options);
    return client.PATCH(path, final as any);
  }

  async function DELETE<P extends PathsWithMethod<paths, "delete">>(
    path: P,
    options?: OptionsFor<P, "delete">
  ) {
    const final = applyHeaders(options);
    return client.DELETE(path, final as any);
  }

  function applyHeaders<T extends { headers?: HeadersInit } | undefined>(
    options: T
  ) {
    if (!options || !options.headers) {
      return options;
    }
    const merged = mergeHeaders(headers, options.headers);
    return { ...options, headers: merged };
  }

  return {
    raw: client,
    GET,
    POST,
    PATCH,
    DELETE,
    unwrap,
    webhooks: createWebhookApi({ GET, POST }),
    apiKeys: createApiKeysApi({ GET, POST, PATCH }),
  };
}

function createWebhookApi({
  GET,
  POST,
}: {
  GET: HttpGet;
  POST: HttpPost;
}) {
  return {
    listEndpoints(): Promise<WebhookEndpointListEntity> {
      return unwrap<WebhookEndpointListEntity>(GET("/v1/webhooks/endpoints"));
    },
    createEndpoint(body: { url: string; description?: string }) {
      return unwrap<WebhookCreateEndpointResponse>(
        POST("/v1/webhooks/endpoints", {
          body,
        } as any),
      );
    },
    listDeliveries(query?: {
      endpointId?: string;
      status?: WebhookDeliveryEntity["status"];
      limit?: number;
      offset?: number;
    }): Promise<WebhookDeliveryListEntity> {
      return unwrap<WebhookDeliveryListEntity>(
        GET("/v1/webhooks/deliveries", {
          params: { query } as any,
        }),
      );
    },
    redeliver(id: string): Promise<WebhookRedeliverResponse> {
      return unwrap<WebhookRedeliverResponse>(
        POST("/v1/webhooks/deliveries/{id}/redeliver", {
          params: { path: { id } } as any,
        } as any),
      );
    },
    getSecret(): Promise<WebhookSecretEntity> {
      return unwrap<WebhookSecretEntity>(GET("/v1/webhooks/secret"));
    },
  };
}

function createApiKeysApi({
  GET,
  POST,
  PATCH,
}: {
  GET: HttpGet;
  POST: HttpPost;
  PATCH: HttpPatch;
}) {
  return {
    list(): Promise<ApiKeyListEntity> {
      return unwrap<ApiKeyListEntity>(GET("/v1/admin/api-keys" as any) as any);
    },
    create(body: {
      name: string;
      rateLimitPerMin?: number;
      burstLimit?: number;
      scopes?: string[];
    }): Promise<ApiKeySecretEntity> {
      return unwrap<ApiKeySecretEntity>(
        POST("/v1/admin/api-keys" as any, {
          body,
        } as any),
      );
    },
    rotate(id: string): Promise<ApiKeySecretEntity> {
      return unwrap<ApiKeySecretEntity>(
        POST("/v1/admin/api-keys/{id}/rotate" as any, {
          params: { path: { id } } as any,
        } as any),
      );
    },
    disable(id: string): Promise<{ key: ApiKeySummaryEntity }> {
      return unwrap<{ key: ApiKeySummaryEntity }>(
        POST("/v1/admin/api-keys/{id}/disable" as any, {
          params: { path: { id } } as any,
        } as any),
      );
    },
    update(
      id: string,
      body: {
        name?: string;
        rateLimitPerMin?: number;
        burstLimit?: number;
        scopes?: string[];
        isActive?: boolean;
      },
    ): Promise<{ key: ApiKeySummaryEntity }> {
      return unwrap<{ key: ApiKeySummaryEntity }>(
        PATCH("/v1/admin/api-keys/{id}" as any, {
          params: { path: { id } } as any,
          body,
        } as any),
      );
    },
  };
}

export async function unwrap<T = unknown>(
  responsePromise: Promise<FetchResponse<any>>,
): Promise<T> {
  const response = (await responsePromise) as any;
  if (response && "error" in response && response.error) {
    const body = await tryParseBody(response.response as Response);
    const message = extractErrorMessage(body, response.response.statusText);
    throw new ApiError(message, response.response, body ?? response.error);
  }
  return (response as { data?: unknown }).data as T;
}
function mergeHeaders(
  base?: HeadersInit,
  extra?: HeadersInit,
): Record<string, string> {
  const target = new Headers();
  appendHeaders(target, base);
  appendHeaders(target, extra);
  const result: Record<string, string> = {};
  target.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function appendHeaders(target: Headers, init?: HeadersInit) {
  if (!init) return;
  if (init instanceof Headers) {
    init.forEach((value, key) => target.set(key, value));
    return;
  }
  if (Array.isArray(init)) {
    init.forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        target.set(key, String(value));
      }
    });
    return;
  }
  Object.entries(init).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      target.set(key, String(value));
    }
  });
}

async function tryParseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await response.clone().json();
    }
    if (contentType.includes("text/")) {
      return await response.clone().text();
    }
  } catch (error) {
    console.warn("Failed to parse error body", error);
  }
  return undefined;
}

function extractErrorMessage(body: unknown, fallback: string) {
  if (!body) return fallback || "Request failed";
  if (typeof body === "string") return body;
  if (typeof body === "object") {
    const candidate = (body as { error?: { message?: string } }).error?.message;
    if (candidate && typeof candidate === "string") return candidate;
  }
  return fallback || "Request failed";
}
export type {
  WebhookEndpointEntity as WebhookEndpoint,
  WebhookEndpointListEntity as WebhookEndpointList,
  WebhookDeliveryEntity as WebhookDelivery,
  WebhookDeliveryListEntity as WebhookDeliveryList,
  WebhookSecretEntity as WebhookSecret,
  ApiKeySummaryEntity as ApiKeySummary,
  ApiKeyListEntity as ApiKeyList,
  ApiKeySecretEntity as ApiKeySecret,
};

