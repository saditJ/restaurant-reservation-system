import createClient from "openapi-fetch";
export class ApiError extends Error {
    constructor(message, response, body) {
        super(message);
        this.name = "ApiError";
        this.status = response.status;
        this.response = response;
        this.body = body;
    }
}
export function createSdkClient(config = {}) {
    const { baseUrl = "/api", apiKey, defaultHeaders, fetch: customFetch, } = config;
    const headers = mergeHeaders(defaultHeaders, apiKey ? { "x-api-key": apiKey } : undefined);
    const client = createClient({
        baseUrl,
        fetch: customFetch,
        headers,
    });
    async function GET(path, options) {
        const final = applyHeaders(options);
        return client.GET(path, final);
    }
    async function POST(path, options) {
        const final = applyHeaders(options);
        return client.POST(path, final);
    }
    async function PATCH(path, options) {
        const final = applyHeaders(options);
        return client.PATCH(path, final);
    }
    async function DELETE(path, options) {
        const final = applyHeaders(options);
        return client.DELETE(path, final);
    }
    function applyHeaders(options) {
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
function createWebhookApi({ GET, POST, }) {
    return {
        listEndpoints() {
            return unwrap(GET("/v1/webhooks/endpoints"));
        },
        createEndpoint(body) {
            return unwrap(POST("/v1/webhooks/endpoints", {
                body,
            }));
        },
        listDeliveries(query) {
            return unwrap(GET("/v1/webhooks/deliveries", {
                params: { query },
            }));
        },
        redeliver(id) {
            return unwrap(POST("/v1/webhooks/deliveries/{id}/redeliver", {
                params: { path: { id } },
            }));
        },
        getSecret() {
            return unwrap(GET("/v1/webhooks/secret"));
        },
    };
}
function createApiKeysApi({ GET, POST, PATCH, }) {
    return {
        list() {
            return unwrap(GET("/v1/admin/api-keys"));
        },
        create(body) {
            return unwrap(POST("/v1/admin/api-keys", {
                body,
            }));
        },
        rotate(id) {
            return unwrap(POST("/v1/admin/api-keys/{id}/rotate", {
                params: { path: { id } },
            }));
        },
        disable(id) {
            return unwrap(POST("/v1/admin/api-keys/{id}/disable", {
                params: { path: { id } },
            }));
        },
        update(id, body) {
            return unwrap(PATCH("/v1/admin/api-keys/{id}", {
                params: { path: { id } },
                body,
            }));
        },
    };
}
export async function unwrap(responsePromise) {
    const response = (await responsePromise);
    if (response && "error" in response && response.error) {
        const body = await tryParseBody(response.response);
        const message = extractErrorMessage(body, response.response.statusText);
        throw new ApiError(message, response.response, body ?? response.error);
    }
    return response.data;
}
function mergeHeaders(base, extra) {
    const target = new Headers();
    appendHeaders(target, base);
    appendHeaders(target, extra);
    const result = {};
    target.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}
function appendHeaders(target, init) {
    if (!init)
        return;
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
async function tryParseBody(response) {
    const contentType = response.headers.get("content-type") ?? "";
    try {
        if (contentType.includes("application/json")) {
            return await response.clone().json();
        }
        if (contentType.includes("text/")) {
            return await response.clone().text();
        }
    }
    catch (error) {
        console.warn("Failed to parse error body", error);
    }
    return undefined;
}
function extractErrorMessage(body, fallback) {
    if (!body)
        return fallback || "Request failed";
    if (typeof body === "string")
        return body;
    if (typeof body === "object") {
        const candidate = body.error?.message;
        if (candidate && typeof candidate === "string")
            return candidate;
    }
    return fallback || "Request failed";
}
//# sourceMappingURL=index.js.map