import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchPartnerPortalPayload } from "../src/actionpayload";
import { err, ok } from "neverthrow";

/**
 * Mock forge-ahead/errors module to avoid runtime dependencies
 */
vi.mock("forge-ahead/errors", () => ({
  ok: (value: unknown) => ok(value),
  StandardError: {
    add: vi.fn(),
    getOrDefault: vi.fn((status: number) => ({
      error: vi.fn((errorData: unknown, _: unknown, _url: unknown) => {
        return err({
          type: "about:blank",
          title: "Internal Server Error",
          status: status,
          detail: String(errorData),
        });
      }),
    })),
  },
}));

/**
 * Mock global fetch function to avoid actual HTTP requests
 */
global.fetch = vi.fn();

// Import after mocking
const { confluenceCqlSearch } = await import("../src/index");
const { StandardError } = await import("forge-ahead/errors");

describe("confluenceCqlSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set the required environment variables for URL construction and authentication
    process.env.CONFLUENCE_CLOUD_ID = "test-cloud-id";
    process.env.CONFLUENCE_SERVICE_ACCOUNT = "test@example.com";
    process.env.CONFLUENCE_API_TOKEN = "test-token-123";
  });

  /**
   * Mock successful Confluence CQL Search API response
   */
  const createMockSuccessResponse = (searchData: {
    results: Array<{
      id: string;
      type: string;
      status: string;
      title: string;
      space?: { key: string; name: string };
      history?: { createdDate: string; lastUpdated?: { when: string } };
      url: string;
      content?: string;
      excerpt?: string;
    }>;
    start: number;
    limit: number;
    size: number;
    totalSize?: number;
  }) => {
    return {
      ok: true,
      json: vi.fn().mockResolvedValue(searchData),
      text: vi.fn(),
      status: 200,
    };
  };

  /**
   * Mock failed Confluence API response
   */
  const createMockErrorResponse = (
    status: number,
    errorText: string,
    statusText = "Error",
  ) => {
    return {
      ok: false,
      status,
      statusText,
      text: vi.fn().mockResolvedValue(errorText),
      json: vi.fn(),
    };
  };

  it("should successfully search Confluence with CQL query and return results", async () => {
    const searchData = {
      results: [
        {
          id: "page-123",
          type: "page",
          status: "current",
          title: "Test Page",
          space: {
            key: "TEST",
            name: "Test Space",
          },
          history: {
            createdDate: "2024-01-10T08:30:00Z",
            lastUpdated: {
              when: "2024-01-15T10:00:00Z",
            },
          },
          url: "https://example.atlassian.net/wiki/spaces/TEST/pages/123",
          excerpt: "This is test content",
        },
      ],
      start: 0,
      limit: 25,
      size: 1,
      totalSize: 1,
    };

    const mockResponse = createMockSuccessResponse(searchData);
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    // Result should be successful
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(searchData);
      expect(result.value.size).toBe(1);
      expect(result.value.results).toHaveLength(1);
      expect(result.value.results[0].title).toBe("Test Page");
    }
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://api.atlassian.com/ex/confluence/test-cloud-id/wiki/rest/api/search",
      ),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("should handle search results with no matches", async () => {
    const searchData = {
      results: [],
      start: 0,
      limit: 25,
      size: 0,
      totalSize: 0,
    };

    const mockResponse = createMockSuccessResponse(searchData);
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "nonexistent",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(searchData);
      expect(result.value.results).toHaveLength(0);
      expect(result.value.size).toBe(0);
    }
  });

  it("should handle API error responses gracefully", async () => {
    const errorMessage = "Invalid CQL query";
    const mockResponse = createMockErrorResponse(
      400,
      errorMessage,
      "Bad Request",
    );
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "invalid cql syntax",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(400);
      expect(result.error.detail).toBeDefined();
    }
    expect(StandardError.add).toHaveBeenCalledWith(400, "Bad Request");
  });

  it("should handle network errors", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network timeout"));

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(500);
      expect(result.error.detail).toContain("Network timeout");
    }
  });

  it("should handle non-Error objects thrown as errors", async () => {
    vi.mocked(global.fetch).mockRejectedValue("Unknown error string");

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(500);
      expect(result.error.detail).toContain("Unknown error string");
    }
  });

  it("should make fetch request with correct URL and headers", async () => {
    const mockResponse = createMockSuccessResponse({
      results: [
        {
          id: "page-auth",
          type: "page",
          status: "current",
          title: "Auth Test",
          url: "https://example.atlassian.net/wiki/pages/auth",
        },
      ],
      start: 0,
      limit: 25,
      size: 1,
      totalSize: 1,
    });

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "auth",
      context: { cloudId: "test-cloud", customField: "customValue" } as never,
    };

    await confluenceCqlSearch(payload);

    /**
     * Verify that fetch was called with the correct URL and headers
     */
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://api.atlassian.com/ex/confluence/test-cloud-id/wiki/rest/api/search",
      ),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("should return error when CONFLUENCE_CLOUD_ID is not set", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    // Remove the environment variable to test the error case
    delete process.env.CONFLUENCE_CLOUD_ID;

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    // Verify that the result is an error
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(500);
      expect(result.error.detail).toContain(
        "CONFLUENCE_CLOUD_ID environment variable is not configured",
      );
    }

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error building Confluence API URL:"),
    );

    consoleErrorSpy.mockRestore();
  });

  it("should return error when CONFLUENCE_SERVICE_ACCOUNT is not set", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    // Remove the service account environment variable
    delete process.env.CONFLUENCE_SERVICE_ACCOUNT;

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    // Verify that the result is an error
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(500);
      expect(result.error.detail).toContain(
        "CONFLUENCE_SERVICE_ACCOUNT environment variable is not configured",
      );
    }

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error building authentication header:"),
    );

    consoleErrorSpy.mockRestore();
  });

  it("should return error when CONFLUENCE_API_TOKEN is not set", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    // Remove the API token environment variable
    delete process.env.CONFLUENCE_API_TOKEN;

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    // Verify that the result is an error
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(500);
      expect(result.error.detail).toContain(
        "CONFLUENCE_API_TOKEN environment variable is not configured",
      );
    }

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error building authentication header:"),
    );

    consoleErrorSpy.mockRestore();
  });
});
