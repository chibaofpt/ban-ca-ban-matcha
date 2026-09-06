/** Every successful API response is wrapped in data */
export type ApiResponse<T> = { data: T };

/** Every API error response. */
export type ApiError<TDetails = unknown> = {
  error: string;
  code: string;
  details?: TDetails;
};
