import {
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
} from "forge-ahead/errors";
import { err } from "neverthrow";
import type { SearchPartnerPortalPayload } from "./actionpayload";

/**
 * Constructs the Confluence CQL Search API URL with proper encoding.
 * Requires the CONFLUENCE_BASE_URL environment variable to be set.
 *
 * @param cqlQuery - The CQL query string to search for
 * @returns A Result containing the fully constructed API URL, or an error if the base URL is not configured
 */
function buildConfluenceCqlSearchUrl(
  cqlQuery: string,
): Result<string, ProblemDetails> {
  // Get the base URL from environment variable
  // This must be configured per environment (dev, staging, prod)
  const baseUrl = process.env.CONFLUENCE_BASE_URL;

  // If the base URL is not configured, return an error Result
  if (!baseUrl) {
    return StandardError.getOrDefault(500).error(
      "CONFLUENCE_BASE_URL environment variable is not configured",
      undefined,
      undefined,
    );
  }

  // URL encode the CQL query to ensure special characters are properly handled
  const encodedCql = encodeURIComponent(cqlQuery);

  // Construct the full API endpoint URL
  // We use expand to get additional details like space, history, and content
  const apiUrl = `${baseUrl}/wiki/rest/api/search?cql=${encodedCql}&expand=space,history,content`;

  // Return a successful Result with the constructed URL
  return ok(apiUrl);
}

/**
 * Constructs a Basic Authentication header from service account credentials.
 * Requires CONFLUENCE_SERVICE_ACCOUNT and CONFLUENCE_API_TOKEN environment variables to be set.
 *
 * @returns A Result containing the Authorization header value for Basic auth, or an error if credentials are not configured
 */
function getBasicAuthHeader(): Result<string, ProblemDetails> {
  // Read the service account email and API token from environment variables
  const serviceAccount = process.env.CONFLUENCE_SERVICE_ACCOUNT;
  const apiToken = process.env.CONFLUENCE_API_TOKEN;

  // If the service account is missing, return an error Result
  if (!serviceAccount) {
    return StandardError.getOrDefault(500).error(
      "CONFLUENCE_SERVICE_ACCOUNT environment variable is not configured",
      undefined,
      undefined,
    );
  }

  // If the API token is missing, return an error Result
  if (!apiToken) {
    return StandardError.getOrDefault(500).error(
      "CONFLUENCE_API_TOKEN environment variable is not configured",
      undefined,
      undefined,
    );
  }

  // Combine the service account and API token with a colon separator
  const credentials = `${serviceAccount}:${apiToken}`;

  // Encode the credentials in Base64 format as required by the Basic Auth scheme
  const encodedCredentials = Buffer.from(credentials).toString("base64");

  // Return a successful Result with the properly formatted Authorization header value
  return ok(`Basic ${encodedCredentials}`);
}

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
  // The buildConfluenceCqlSearchUrl function handles URL encoding and environment-based configuration
  // It returns a Result that may contain an error if the environment variable is not configured
  const urlResult = buildConfluenceCqlSearchUrl(cqlQuery);

  // If URL construction failed, bubble up the error
  if (urlResult.isErr()) {
    console.error(
      `Error building Confluence API URL: ${urlResult.error.detail}`,
    );
    // Return a new error Result with the same error
    return err(urlResult.error);
  }

  // Extract the URL from the successful Result
  const apiUrl = urlResult.value;

  // Get the Basic Auth header - this is required and will error if credentials are not configured
  const authResult = getBasicAuthHeader();

  // If auth header construction failed, bubble up the error
  if (authResult.isErr()) {
    console.error(
      `Error building authentication header: ${authResult.error.detail}`,
    );
    // Return a new error Result with the same error
    return err(authResult.error);
  }

  // Extract the auth header from the successful Result
  const authHeader = authResult.value;

  try {
    // Build the request headers
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      // Add the Authorization header from the credentials
      Authorization: authHeader,
    };

    // Make the API request to Confluence using standard fetch
    // This makes a direct HTTP request to the Confluence REST API with Basic Auth
    const response = await fetch(apiUrl, {
      method: "GET",
      headers,
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
        apiUrl,
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
