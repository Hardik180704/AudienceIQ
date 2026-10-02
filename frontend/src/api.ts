import type { AudienceRequest, PreviewResponse } from './types';

/** Base URL comes from the environment; no hardcoded backend location. */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function previewAudience(request: AudienceRequest): Promise<PreviewResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1/audiences/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      `Could not reach the backend at ${API_BASE_URL}. Make sure the backend is running, then retry.`,
    );
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error?: { code?: string; message?: string } }).error?.message === 'string'
    ) {
      const { code, message, details } = (
        body as { error: { code?: string; message: string; details?: { message: string }[] } }
      ).error;
      throw new ApiError(code ?? 'API_ERROR', message, details?.map((d) => d.message));
    }
    throw new ApiError('API_ERROR', `Unexpected API response (HTTP ${response.status}).`);
  }

  return body as PreviewResponse;
}
