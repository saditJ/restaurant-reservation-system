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
export declare class ApiError extends Error {
    readonly status: number;
    readonly body?: unknown;
    readonly response: Response;
    constructor(message: string, response: Response, body?: unknown);
}
type AnyMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";
type OptionsFor<P extends keyof paths & string, M extends AnyMethod> = FetchOptions<FilterKeys<paths[P], M>>;
type WebhookEndpointEntity = NonNullable<paths["/v1/webhooks/endpoints"]["get"]["responses"][200]["content"]>["application/json"][number];
type WebhookEndpointListEntity = WebhookEndpointEntity[];
type WebhookDeliveryListEntity = NonNullable<paths["/v1/webhooks/deliveries"]["get"]["responses"][200]["content"]>["application/json"];
type WebhookDeliveryEntity = WebhookDeliveryListEntity["items"][number];
type WebhookSecretEntity = NonNullable<paths["/v1/webhooks/secret"]["get"]["responses"][200]["content"]>["application/json"];
type WebhookRedeliverResponse = NonNullable<paths["/v1/webhooks/deliveries/{id}/redeliver"]["post"]["responses"][200]["content"]>["application/json"];
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
export declare function createSdkClient(config?: ApiClientConfig): {
    raw: {
        GET<P extends PathsWithMethod<paths, "get">>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "get">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "get">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "get">>]): Promise<FetchResponse<"get" extends keyof paths[P] ? paths[P][keyof paths[P] & "get"] : unknown>>;
        PUT<P extends PathsWithMethod<paths, "put">>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "put">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "put">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "put">>]): Promise<FetchResponse<"put" extends keyof paths[P] ? paths[P][keyof paths[P] & "put"] : unknown>>;
        POST<P extends PathsWithMethod<paths, "post">>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "post">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "post">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "post">>]): Promise<FetchResponse<"post" extends keyof paths[P] ? paths[P][keyof paths[P] & "post"] : unknown>>;
        DELETE<P extends PathsWithMethod<paths, "delete">>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "delete">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "delete">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "delete">>]): Promise<FetchResponse<"delete" extends keyof paths[P] ? paths[P][keyof paths[P] & "delete"] : unknown>>;
        OPTIONS<P extends never>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "options">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "options">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "options">>]): Promise<FetchResponse<"options" extends keyof paths[P] ? paths[P][keyof paths[P] & "options"] : unknown>>;
        HEAD<P extends never>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "head">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "head">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "head">>]): Promise<FetchResponse<"head" extends keyof paths[P] ? paths[P][keyof paths[P] & "head"] : unknown>>;
        PATCH<P extends PathsWithMethod<paths, "patch">>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "patch">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "patch">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "patch">>]): Promise<FetchResponse<"patch" extends keyof paths[P] ? paths[P][keyof paths[P] & "patch"] : unknown>>;
        TRACE<P extends never>(url: P, ...init: import("openapi-typescript-helpers").HasRequiredKeys<FetchOptions<FilterKeys<paths[P], "trace">>> extends never ? [(FetchOptions<FilterKeys<paths[P], "trace">> | undefined)?] : [FetchOptions<FilterKeys<paths[P], "trace">>]): Promise<FetchResponse<"trace" extends keyof paths[P] ? paths[P][keyof paths[P] & "trace"] : unknown>>;
    };
    GET: <P extends PathsWithMethod<paths, "get">>(path: P, options?: OptionsFor<P, "get">) => Promise<FetchResponse<"get" extends keyof paths[P] ? paths[P][keyof paths[P] & "get"] : unknown>>;
    POST: <P extends PathsWithMethod<paths, "post">>(path: P, options?: OptionsFor<P, "post">) => Promise<FetchResponse<"post" extends keyof paths[P] ? paths[P][keyof paths[P] & "post"] : unknown>>;
    PATCH: <P extends PathsWithMethod<paths, "patch">>(path: P, options?: OptionsFor<P, "patch">) => Promise<FetchResponse<"patch" extends keyof paths[P] ? paths[P][keyof paths[P] & "patch"] : unknown>>;
    DELETE: <P extends PathsWithMethod<paths, "delete">>(path: P, options?: OptionsFor<P, "delete">) => Promise<FetchResponse<"delete" extends keyof paths[P] ? paths[P][keyof paths[P] & "delete"] : unknown>>;
    unwrap: typeof unwrap;
    webhooks: {
        listEndpoints(): Promise<WebhookEndpointListEntity>;
        createEndpoint(body: {
            url: string;
            description?: string;
        }): Promise<{
            id: string;
            url: string;
            description?: string | null;
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
        }>;
        listDeliveries(query?: {
            endpointId?: string;
            status?: WebhookDeliveryEntity["status"];
            limit?: number;
            offset?: number;
        }): Promise<WebhookDeliveryListEntity>;
        redeliver(id: string): Promise<WebhookRedeliverResponse>;
        getSecret(): Promise<WebhookSecretEntity>;
    };
    apiKeys: {
        list(): Promise<ApiKeyListEntity>;
        create(body: {
            name: string;
            rateLimitPerMin?: number;
            burstLimit?: number;
            scopes?: string[];
        }): Promise<ApiKeySecretEntity>;
        rotate(id: string): Promise<ApiKeySecretEntity>;
        disable(id: string): Promise<{
            key: ApiKeySummaryEntity;
        }>;
        update(id: string, body: {
            name?: string;
            rateLimitPerMin?: number;
            burstLimit?: number;
            scopes?: string[];
            isActive?: boolean;
        }): Promise<{
            key: ApiKeySummaryEntity;
        }>;
    };
};
export declare function unwrap<T = unknown>(responsePromise: Promise<FetchResponse<any>>): Promise<T>;
export type { WebhookEndpointEntity as WebhookEndpoint, WebhookEndpointListEntity as WebhookEndpointList, WebhookDeliveryEntity as WebhookDelivery, WebhookDeliveryListEntity as WebhookDeliveryList, WebhookSecretEntity as WebhookSecret, ApiKeySummaryEntity as ApiKeySummary, ApiKeyListEntity as ApiKeyList, ApiKeySecretEntity as ApiKeySecret, };
//# sourceMappingURL=index.d.ts.map