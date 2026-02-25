import { route } from "@forge/api";
import { getAuthForEvent } from "forge-ahead";
import { type ProblemDetails, StandardError } from "forge-ahead/errors";
import { ok, type Result } from "neverthrow";
import type { SearchPartnerPortalPayload } from "./actionpayload";

/**
 * Confluence CQL Search API response structure for a single search result item.
 * Only includes fields we actually use in the code.
 * Based on: https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/#api-wiki-rest-api-search-get
 */
interface ConfluenceCqlSearchResultItem {
  id: string;
  type: string;
  status: string;
  title: string;
  space?: {
    key: string;
    name: string;
  };
  history?: {
    createdDate: string;
    lastUpdated?: {
      when: string;
    };
  };
  url: string;
  content?: string;
  excerpt?: string;
}

/**
 * Confluence CQL Search API response wrapper.
 */
interface ConfluenceCqlSearchResponse {
  results: ConfluenceCqlSearchResultItem[];
  start: number;
  limit: number;
  size: number;
  totalSize?: number;
}

/**
 * Result type for confluenceCqlSearch using neverthrow.
 * Returns a Promise that resolves to a Result containing either:
 * - Ok: ConfluenceCqlSearchResponse on success
 * - Err: ProblemDetails on failure
 */
type ConfluenceCqlSearchResult = Promise<
  Result<ConfluenceCqlSearchResponse, ProblemDetails>
>;

/**
 * Searches Confluence content using CQL (Confluence Query Language) via the REST API v1.
 * This function executes a CQL query and returns matching pages with metadata.
 *
 * Uses neverthrow Result type for functional error handling instead of exceptions.
 *
 * @param payload - The action payload containing the CQL query string
 * @returns A Result promise that resolves to either a success or error response
 */
export async function confluenceCqlSearch(
  payload: SearchPartnerPortalPayload,
): ConfluenceCqlSearchResult {
  // Extract the search text from the payload and use it as a CQL query
  const cqlQuery = payload.searchText;

  // Log the request for debugging purposes
  console.log(`Executing Confluence CQL search with query: ${cqlQuery}`);

  // Construct the Confluence v1 Search API URL
  // The endpoint searches for content using CQL and returns matching results
  // We use expand to get additional details like space, history, and excerpt
  const apiUrl = route`/wiki/rest/api/search?cql=${cqlQuery}&expand=space,history,content`;

  try {
    // Make the API request to Confluence using the Forge API client
    // Using getAuthForEvent ensures the request is made with the current user's permissions
    // This respects the user's access rights and only returns content they can see
    const response = await getAuthForEvent(payload).requestConfluence(apiUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    // Check if the response is successful
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `Confluence CQL Search API error (${response.status}): ${errorText}`;

      console.error(`Error executing CQL search: ${errorMessage}`);
      StandardError.add(response.status, response.statusText);

      // Return an error Result
      return StandardError.getOrDefault(response.status).error(
        errorText,
        undefined,
        apiUrl.value,
      );
    }

    // Parse the JSON response
    const searchData = (await response.json()) as ConfluenceCqlSearchResponse;

    // Log success for debugging
    console.log(
      `CQL search returned ${searchData.size} results (total: ${searchData.totalSize ?? searchData.size})`,
    );

    // Return a successful Result with the search results
    // This includes matching pages with titles, excerpts, and metadata
    return ok(searchData);
  } catch (error) {
    // Handle unexpected errors (e.g., network failures, parsing errors)
    // Extract error message from Error objects or convert other types to string
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`Unexpected error during CQL search: ${errorMessage}`);

    // Return an error Result using StandardError helper
    // This allows the Rovo agent to gracefully handle errors
    return StandardError.getOrDefault(500).error(errorMessage);
  }
}
