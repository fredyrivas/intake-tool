import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type VertexHealthConfig = {
  project: string;
  location: string;
  models: string[];
};

type LocalMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void | Promise<void>;

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Vertex AI connection failed.';

  return error.message
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted-token]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted-token]');
}

export function vertexHealthPlugin(config: VertexHealthConfig): Plugin {
  const client = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: config.location,
  });

  const middleware: LocalMiddleware = async (request, response, next) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    if (requestUrl.pathname !== '/api/vertex/health') {
      next();
      return;
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const tokenCounts = await Promise.all(
        config.models.map(async (model) => ({
          model,
          totalTokens: (
            await client.models.countTokens({
              model,
              contents: 'Vertex AI local connection check.',
            })
          ).totalTokens,
        })),
      );

      sendJson(response, 200, {
        connected: true,
        provider: 'Vertex AI',
        authentication: 'Application Default Credentials',
        project: config.project,
        location: config.location,
        models: tokenCounts,
      });
    } catch (error) {
      sendJson(response, 503, {
        connected: false,
        project: config.project,
        location: config.location,
        models: config.models,
        error: safeErrorMessage(error),
      });
    }
  };

  return {
    name: 'local-vertex-health',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
