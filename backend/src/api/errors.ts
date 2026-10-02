import type { ZodError } from 'zod';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export function errorBody(code: string, message: string, details?: ErrorBody['error']['details']): ErrorBody {
  if (!details || details.length === 0) {
    return { error: { code, message } };
  }
  return { error: { code, message, details } };
}

function formatPath(path: (string | number)[]): string {
  return (
    path.reduce((acc: string, part) => {
      if (typeof part === 'number') return `${acc}[${part}]`;
      return acc ? `${acc}.${part}` : String(part);
    }, '') || '(root)'
  );
}

export function validationErrorBody(error: ZodError): ErrorBody {
  return errorBody(
    'VALIDATION_ERROR',
    'Invalid audience request',
    error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    })),
  );
}
