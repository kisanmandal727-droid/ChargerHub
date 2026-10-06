const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
// Accept either the backend origin (recommended for Render) or a full URL ending in /api.
const API_BASE = !configuredApiBase
  ? '/api'
  : configuredApiBase.endsWith('/api')
    ? configuredApiBase
    : `${configuredApiBase}/api`;

export function getWebSocketUrl(path = '/ws') {
  const endpoint = new URL(API_BASE, window.location.origin);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  const apiPath = endpoint.pathname.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  endpoint.pathname = `${apiPath}${path.startsWith('/') ? path : `/${path}`}` || '/ws';
  endpoint.search = '';
  return endpoint.toString();
}

export async function request(endpoint, options = {}) {
  const token = localStorage.getItem('ev_token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (err) {
    const error = new Error('Unable to connect to ChargerHub. Check your connection and try again.');
    error.cause = err;
    throw error;
  }

  if (res.status === 401) {
    // A Firebase session is established without an existing app session.
    if (!endpoint.includes('/auth/firebase/session')) {
      localStorage.removeItem('ev_token');
      localStorage.removeItem('ev_user');
      window.dispatchEvent(new Event('auth_logout'));
    }
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const isLocalApi = !configuredApiBase || /localhost|127\.0\.0\.1/i.test(configuredApiBase);
    const fallbackMessage = res.status === 404
      ? `The API route ${API_BASE}${endpoint} was not found. ${isLocalApi ? 'Restart the local backend from the project’s server folder.' : 'The API deployment may need to be updated.'}`
      : !data && res.status >= 500
        ? `The API returned a non-JSON error for ${endpoint} (HTTP ${res.status}). Check the backend terminal for the error from this request.`
        : `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ''}).`;
    const error = new Error(data?.error || fallbackMessage);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body }),
  put: (url, body) => request(url, { method: 'PUT', body }),
  delete: (url) => request(url, { method: 'DELETE' }),
};
