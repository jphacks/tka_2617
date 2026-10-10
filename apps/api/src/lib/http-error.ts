export class HttpError extends Error {
  constructor(
    public status: 400 | 404 | 413 | 429 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}
