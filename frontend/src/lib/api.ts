const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`请求失败 (${res.status})`);
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

  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    clearTimeout(timeout);
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

export function generateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('session_id');
  if (!sid) {
    sid = Math.random().toString(36).substring(2, 10);
    localStorage.setItem('session_id', sid);
  }
  return sid;
}
