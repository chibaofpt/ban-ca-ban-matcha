/** Runtime error retaining the structured error fields returned by the API. */
export class ApiServiceError<TDetails = unknown> extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: TDetails,
  ) {
    super(message);
    this.name = "ApiServiceError";
  }
}
