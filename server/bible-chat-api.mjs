const MAX_REQUEST_BYTES = 16 * 1024;

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}

function validateChatInput(body) {
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  const threadId = typeof body?.threadId === 'string' ? body.threadId.trim() : '';
  const translationId = body?.translationId ?? 'RNKSV';
  if (!threadId || threadId.length > 160) throw Object.assign(new Error('Invalid threadId.'), { status: 400 });
  if (!query || query.length > 4_000) throw Object.assign(new Error('Question must be 1-4000 characters.'), { status: 400 });
  if (!['GAE', 'RNKSV'].includes(translationId)) {
    throw Object.assign(new Error('Unsupported translation.'), { status: 400 });
  }
  return { threadId, query, translationId };
}

function publicError(error) {
  if (error?.name === 'AuthenticationError') {
    return { status: 503, code: 'model_not_configured', message: 'AI 연결을 준비하고 있어요.' };
  }
  if (error?.name === 'RateLimitError' || error?.status === 429) {
    return { status: 429, code: 'rate_limited', message: '질문이 많아 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.' };
  }
  if (error?.name === 'BadRequestError' || error?.name === 'APIError') {
    return { status: 502, code: 'model_error', message: '답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' };
  }
  if (error?.status === 413) return { status: 413, code: 'request_too_large', message: '질문이 너무 길어요.' };
  if (error?.status === 415) return { status: 415, code: 'unsupported_media_type', message: '지원하지 않는 요청 형식이에요.' };
  if (error?.status === 400) return { status: 400, code: 'invalid_request', message: '질문을 확인해 주세요.' };
  if (error?.status === 401 || error?.status === 403) {
    return { status: error.status, code: 'unauthorized', message: '로그인이 필요해요.' };
  }
  if (/OPENAI_API_KEY is required/u.test(error?.message ?? '')) {
    return { status: 503, code: 'model_not_configured', message: 'AI 연결을 준비하고 있어요.' };
  }
  return { status: 502, code: 'model_error', message: '답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' };
}

export function createBibleChatApiHandler({
  getRuntime,
  authenticateRequest,
  consumeQuota,
  logger = console,
} = {}) {
  if (typeof getRuntime !== 'function') throw new Error('getRuntime is required.');
  if (typeof authenticateRequest !== 'function') throw new Error('authenticateRequest is required.');
  if (typeof consumeQuota !== 'function') throw new Error('consumeQuota is required.');

  return async function handleBibleChatApi(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      });
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/api/ai/chat') {
      sendJson(response, 404, { error: { code: 'not_found', message: '요청 경로를 찾을 수 없어요.' } });
      return;
    }

    try {
      if (!request.headers['content-type']?.startsWith('application/json')) {
        throw Object.assign(new Error('JSON content type is required.'), { status: 415 });
      }
      const identity = await authenticateRequest(request);
      if (!identity?.userId) throw Object.assign(new Error('Unauthenticated.'), { status: 401 });
      await consumeQuota({ identity, request });
      const input = validateChatInput(await readJson(request));
      const runtime = await getRuntime();
      const result = await runtime.ask({ ...input, ownerUserId: identity.userId });
      sendJson(response, 200, {
        message: {
          id: `answer-${result.turnId}`,
          role: 'assistant',
          text: result.responseText,
          citations: result.displayCitations,
        },
        retrieval: {
          action: result.retrievalAction,
          passageIds: result.retrievedPassageIds,
        },
        model: result.model,
      });
    } catch (error) {
      const outgoing = publicError(error);
      logger.error?.('Bible chat request failed', {
        code: outgoing.code,
        status: error?.status,
        name: error?.name,
      });
      sendJson(response, outgoing.status, { error: outgoing });
    }
  };
}
