export class ApiError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
  }
}

export class FatalAuthError extends Error {
  status: number;
  url: string;

  constructor(status: number, url: string) {
    super(`Fatal auth error (${status}) from ${url}`);
    this.name = "FatalAuthError";
    this.status = status;
    this.url = url;
  }
}

export const isAuthStatus = (status: number) => status === 401;

export const asApiError = (error: unknown): ApiError | null => {
  return error instanceof ApiError ? error : null;
};

