import { route } from "@forge/api";
import { getAuthForEvent } from "forge-ahead";
import { type ProblemDetails, StandardError } from "forge-ahead/errors";
import { ok, type Result } from "neverthrow";
import type { SearchPartnerPortalPayload } from "./actionpayload";

/**
 * Confluence API response structure for page data.
 * Only includes fields we actually use in the code.
 */
interface ConfluencePageResponse {
  id: string;
  title: string;
  body?: {
    storage?: {
      value: string;
    };
  };
  version?: {
    number: number;
    createdAt: string;
  };
  createdAt?: string;
  _links?: {
    webui?: string;
  };
  spaceId?: string;
  status?: string;
}

/**
 * Result type for readConfluencePage using neverthrow.
 * Returns a Promise that resolves to a Result containing either:
 * - Ok: ReadConfluencePageSuccessResponse on success
 * - Err: ReadConfluencePageErrorResponse on failure
 */
type ReadConfluencePageResult = Promise<
  Result<ConfluencePageResponse, ProblemDetails>
>;

/**
 * Reads the content of a Confluence page using the Confluence v2 REST API.
 * This function fetches the page content and returns it as a structured Result.
 *
 * Uses neverthrow Result type for functional error handling instead of exceptions.
 *
 * @param payload - The action payload containing the page ID
 * @returns A Result promise that resolves to either a success or error response
 */
export async function readConfluencePage(
  payload: SearchPartnerPortalPayload,
): ReadConfluencePageResult {
  // Extract the page ID from the payload
  const pageId = payload.pageId;

  // Log the request for debugging purposes
  console.log(`Reading Confluence page with ID: ${pageId}`);

  // Construct the Confluence v2 API URL
  // The endpoint retrieves page details with body content in storage format
  const apiUrl = route`/wiki/api/v2/pages/${pageId}?body-format=storage`;

  try {
    // Make the API request to Confluence using the Forge API client
    // Using getAuthForEvent ensures the request is made with the current user's permissions
    // This respects the user's access rights to the page and implements its own authorization check
    const response = await getAuthForEvent(payload).requestConfluence(apiUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    // Check if the response is successful
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `Confluence API error (${response.status}): ${errorText}`;

      console.error(`Error reading Confluence page: ${errorMessage}`);
      StandardError.add(response.status, response.statusText);
      // Return an error Result
      return StandardError.getOrDefault(response.status).error(
        await response.json(),
        undefined,
        apiUrl.value,
      );
    }

    // Parse the JSON response
    const pageData = (await response.json()) as ConfluencePageResponse;

    // Log success for debugging
    console.log(`Successfully retrieved page: ${pageData.title}`);

    // Return a successful Result with the most useful information
    // This includes the page content in storage format (HTML-like format used by Confluence)
    return ok(pageData);
  } catch (error) {
    // Handle unexpected errors (e.g., network failures, parsing errors)
    // Extract error message from Error objects or convert other types to string
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Return an error Result using StandardError helper
    // This allows the Rovo agent to gracefully handle errors
    return StandardError.getOrDefault(500).error(errorMessage);
  }
}
