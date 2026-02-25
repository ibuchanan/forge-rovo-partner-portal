import { describe, it, expect, vi, beforeEach } from "vitest";
import { readConfluencePage } from "../src/index";
import { getAuthForEvent, StandardError } from "forge-lib-codegen";
import type { ReadConfluencePagePayload } from "../src/actionpayload";
import { err } from "neverthrow";

/**
 * Mock the forge-lib-codegen module to avoid runtime dependencies
 */
vi.mock("forge-lib-codegen", () => ({
  getAuthForEvent: vi.fn(),
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

describe("readConfluencePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mock successful Confluence API response
   */
  const createMockSuccessResponse = (pageData: {
    id: string;
    title: string;
    body?: { storage?: { value: string } };
    version?: { number: number; createdAt: string };
    createdAt?: string;
    _links?: { webui?: string };
    spaceId?: string;
    status?: string;
  }) => {
    return {
      ok: true,
      json: vi.fn().mockResolvedValue(pageData),
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

  it("should successfully read a Confluence page with all fields populated", async () => {
    const pageData = {
      id: "page-123",
      title: "Test Page",
      body: {
        storage: {
          value: "<p>This is test content</p>",
        },
      },
      version: {
        number: 5,
        createdAt: "2024-01-15T10:00:00Z",
      },
      createdAt: "2024-01-10T08:30:00Z",
      _links: {
        webui: "https://example.atlassian.net/wiki/spaces/TEST/pages/123",
      },
      spaceId: "space-456",
      status: "current",
    };

    const mockResponse = createMockSuccessResponse(pageData);

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-123",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await readConfluencePage(payload);

    // Result should be successful
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(pageData);
    }
    expect(mockAuth.requestConfluence).toHaveBeenCalled();
  });

  it("should handle pages with missing optional fields", async () => {
    const pageData = {
      id: "page-789",
      title: "Minimal Page",
    };

    const mockResponse = createMockSuccessResponse(pageData);

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-789",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await readConfluencePage(payload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(pageData);
      expect(result.value.body).toBeUndefined();
      expect(result.value.version).toBeUndefined();
      expect(result.value.createdAt).toBeUndefined();
      expect(result.value._links).toBeUndefined();
      expect(result.value.spaceId).toBeUndefined();
      expect(result.value.status).toBeUndefined();
    }
  });

  it("should handle API error responses gracefully", async () => {
    const errorMessage = "Unauthorized access to page";
    const mockResponse = createMockErrorResponse(
      401,
      errorMessage,
      "Unauthorized",
    );
    mockResponse.json = vi.fn().mockResolvedValue({ message: errorMessage });

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-999",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await readConfluencePage(payload);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(401);
      expect(result.error.detail).toBeDefined();
    }
    expect(StandardError.add).toHaveBeenCalledWith(401, "Unauthorized");
  });

  it("should handle network errors", async () => {
    const mockAuth: MockAuth = {
      requestConfluence: vi
        .fn()
        .mockRejectedValue(new Error("Network timeout")),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-network-error",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await readConfluencePage(payload);

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

    const payload: ReadConfluencePagePayload = {
      pageId: "page-unknown-error",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await readConfluencePage(payload);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(500);
      expect(result.error.detail).toContain("Unknown error string");
    }
  });

  it("should use getAuthForEvent with the correct payload", async () => {
    const mockResponse = createMockSuccessResponse({
      id: "page-auth",
      title: "Auth Test",
    });

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-auth",
      context: { cloudId: "test-cloud", customField: "customValue" } as never,
    };

    await readConfluencePage(payload);

    /**
     * Verify that getAuthForEvent was called with the payload
     * This ensures authorization is properly handled
     */
    expect(getAuthForEvent).toHaveBeenCalledWith(payload);
  });

  it("should log page retrieval success", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const mockResponse = createMockSuccessResponse({
      id: "page-log",
      title: "Log Test Page",
    });

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-log",
      context: { cloudId: "test-cloud" } as never,
    };

    await readConfluencePage(payload);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Reading Confluence page with ID: page-log",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Successfully retrieved page: Log Test Page",
    );

    consoleSpy.mockRestore();
  });

  it("should log errors appropriately", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    const errorMessage = "API connection failed";
    const mockResponse = createMockErrorResponse(500, errorMessage);
    mockResponse.json = vi.fn().mockResolvedValue({ message: errorMessage });

    const mockAuth: MockAuth = {
      requestConfluence: vi.fn().mockResolvedValue(mockResponse),
    };
    vi.mocked(getAuthForEvent).mockReturnValue(mockAuth as never);

    const payload: ReadConfluencePagePayload = {
      pageId: "page-error-log",
      context: { cloudId: "test-cloud" } as never,
    };

    const result = await readConfluencePage(payload);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error reading Confluence page:"),
    );
    // Verify that the result is an error
    expect(result.isErr()).toBe(true);

    consoleErrorSpy.mockRestore();
  });
});
