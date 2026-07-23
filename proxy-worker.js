/**
 * MonitorFlare Installer CORS Proxy Worker
 *
 * Forwards Cloudflare API requests from browser to bypass CORS limitations.
 * The proxy ONLY forwards to api.cloudflare.com for security.
 *
 * Configuration (wrangler.toml [vars]):
 *   ALLOWED_ORIGIN  — e.g. "https://your-installer.pages.dev" or "*"
 *
 * Deploy:
 *   npx wrangler deploy
 */

const CF_API_BASE = 'https://api.cloudflare.com';

export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '*';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);

    // Get the Cloudflare API path to proxy (everything after /proxy/)
    const pathMatch = url.pathname.match(/^\/proxy(\/.*)?$/);
    if (!pathMatch) {
      return jsonError('Invalid proxy path. Use /proxy/client/v4/...', 400, ALLOWED_ORIGIN);
    }

    const cfPath = pathMatch[1] || '/';

    // Security: block non-Cloudflare API paths
    if (!cfPath.startsWith('/client/v4/')) {
      return jsonError('Only /client/v4/ paths are permitted', 403, ALLOWED_ORIGIN);
    }

    const cfUrl = `${CF_API_BASE}${cfPath}${url.search}`;

    // Extract authorization token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return jsonError('Missing Authorization header', 401, ALLOWED_ORIGIN);
    }

    // Forward request to Cloudflare API
    const forwardHeaders = new Headers();
    forwardHeaders.set('Authorization', authHeader);
    if (request.method !== 'GET') {
      forwardHeaders.set('Content-Type', 'application/json');
    }

    const body = request.method !== 'GET' ? await request.arrayBuffer() : undefined;

    const cfResponse = await fetch(cfUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
    });

    const responseBody = await cfResponse.arrayBuffer();

    return new Response(responseBody, {
      status: cfResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  },
};

function jsonError(message, status = 400, origin = '*') {
  return new Response(JSON.stringify({ success: false, errors: [{ message }] }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    },
  });
}
