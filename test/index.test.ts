import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchPartnerPortalPayload } from "../src/actionpayload";
import { err } from "neverthrow";

/**
 * Mock forge-ahead module to avoid runtime dependencies
 */
vi.mock("forge-ahead", () => ({
  getAuthForEvent: vi.fn(),
}));

/**
 * Mock forge-ahead/errors module to avoid runtime dependencies
 */
vi.mock("forge-ahead/errors", () => ({
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

// Import after mocking
const { confluenceCqlSearch } = await import("../src/index");
const { getAuthForEvent } = await import("forge-ahead");
const { StandardError } = await import("forge-ahead/errors");

/**
 * Mock the @forge/api module to avoid runtime dependencies
 */
vi.mock("@forge/api", () => ({
  route: (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Simple template tag implementation for testing
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
      result += values[i] + strings[i + 1];
    }
    return result;
  },
}));

/**
 * Type for mock auth object with requestConfluence method
 */
interface MockAuth {
  requestConfluence: ReturnType<typeof vi.fn>;
}

describe("confluenceCqlSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

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
    expect(mockAuth.requestConfluence).toHaveBeenCalled();
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

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

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

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

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
    const mockAuth: MockAuth = {
      requestConfluence: vi
        .fn()
        .mockRejectedValue(new Error("Network timeout")),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

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
    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockRejectedValue("Unknown error string"),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

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

  it("should use getAuthForEvent with the correct payload", async () => {
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

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "auth",
      context: { cloudId: "test-cloud", customField: "customValue" } as never,
    };

    await confluenceCqlSearch(payload);

    /**
     * Verify that getAuthForEvent was called with the payload
     * This ensures authorization is properly handled
     */
    expect(getAuthForEvent).toHaveBeenCalledWith(payload);
  });

  it("should log CQL search execution and success", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const mockResponse = createMockSuccessResponse({
      results: [
        {
          id: "page-log",
          type: "page",
          status: "current",
          title: "Log Test Page",
          url: "https://example.atlassian.net/wiki/pages/log",
        },
      ],
      start: 0,
      limit: 25,
      size: 1,
      totalSize: 1,
    });

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "log",
      context: { cloudId: "test-cloud" } as never,
    };

    await confluenceCqlSearch(payload);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Executing Confluence CQL search with query: log",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("CQL search returned 1 results"),
    );

    consoleSpy.mockRestore();
  });

  it("should log errors appropriately", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    const errorMessage = "API connection failed";
    const mockResponse = createMockErrorResponse(500, errorMessage);

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: SearchPartnerPortalPayload = {
      searchText: "test",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await confluenceCqlSearch(payload);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error executing CQL search:"),
    );
    // Verify that the result is an error
    expect(result.isErr()).toBe(true);

    consoleErrorSpy.mockRestore();
  });
});
