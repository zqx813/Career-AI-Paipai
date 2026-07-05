const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ══════════════════════════════════════════════
// Token 管理
// ══════════════════════════════════════════════

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

export function setToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function clearToken() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('session_id');
}

export function getStoredSessionId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('session_id') || '';
}

export function setStoredSessionId(sid: string) {
  localStorage.setItem('session_id', sid);
}

// ══════════════════════════════════════════════
// API 请求
// ══════════════════════════════════════════════

export async function fetchAPI(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.reload();
    throw new Error('登录已过期，请重新登录');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return res.json();
}

export function streamChat(
  path: string, body: any,
  onChunk: (text: string) => void,
  onDone: (extra?: any) => void,
  onError: (err: string) => void
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    onError('请求超时，请重试');
  }, 60000);

  const token = getToken();

  fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    clearTimeout(timeout);
    if (res.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') window.location.reload();
      onError('登录已过期，请重新登录');
      return;
    }
    if (!res.ok) { onError(`请求失败 (${res.status})`); return; }
    const reader = res.body?.getReader();
    if (!reader) { onError('No response body'); return; }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) onChunk(data.chunk);
            if (data.done) onDone(data);
            if (data.error) onError(data.error);
          } catch {}
        }
      }
    }
  }).catch((e) => {
    clearTimeout(timeout);
    onError(e.name === 'AbortError' ? '请求超时，请重试' : e.message);
  });
}

// ══════════════════════════════════════════════
// 认证 API
// ══════════════════════════════════════════════

export async function loginAPI(username: string, password: string) {
  return fetchAPI('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function registerAPI(username: string, password: string, inviteCode: string) {
  return fetchAPI('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: username, password: password, invite_code: inviteCode }),
  });
}

export async function meAPI() {
  return fetchAPI('/api/auth/me');
}
