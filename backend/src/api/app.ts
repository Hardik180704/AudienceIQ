import Fastify, { FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { previewAudience } from '../audiences/service.js';
import type { Db } from '../db/database.js';
import { errorBody, validationErrorBody } from './errors.js';
import { previewRequestSchema } from './schemas.js';

export interface AppOptions {
  db: Db;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/v1/audiences/preview', async (request, reply) => {
    const parsed = previewRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(validationErrorBody(parsed.error));
    }

    const previewRequest = parsed.data;
    request.log.info(
      { conditionCount: previewRequest.conditions.length },
      'audience preview requested',
    );

    const response = previewAudience(options.db, previewRequest);

    request.log.info({ audienceTotal: response.total }, 'audience preview completed');
    return reply.send(response);
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const fastifyError = error as FastifyError;
    const statusCode = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
    const isServerError = statusCode >= 500;

    request.log.error(
      { statusCode, errorCode: fastifyError.code, message: error.message },
      'request failed',
    );

    if (fastifyError.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply
        .code(400)
        .send(errorBody('VALIDATION_ERROR', 'Request body must be valid JSON'));
    }

    if (isServerError) {
      return reply.code(statusCode).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
    }

    return reply.code(statusCode).send(errorBody('BAD_REQUEST', error.message));
  });

  return app;
}
