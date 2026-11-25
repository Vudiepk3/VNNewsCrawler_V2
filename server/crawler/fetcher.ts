import { isAllowedCrawlUrl, isSafeImageUrl } from './sources.ts';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const domainCookies = new Map<string, Map<string, string>>();

function getCookieHeader(hostname: string): string {
  const bag = domainCookies.get(hostname);
  if (!bag || bag.size === 0) return '';
  return Array.from(bag.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function storeCookies(hostname: string, headers: Headers): void {
  const rawList = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (rawList.length === 0) return;
  let bag = domainCookies.get(hostname);
  if (!bag) {
    bag = new Map<string, string>();
    domainCookies.set(hostname, bag);
  }
  for (const cookieStr of rawList) {
    const firstPart = cookieStr.split(';')[0];
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim();
      const val = firstPart.slice(eqIdx + 1).trim();
      bag.set(name, val);
    }
  }
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchHtml(
  targetUrl: string,
  signal?: AbortSignal,
  maxAttempts = 3,
): Promise<{ html: string; finalUrl: string }> {
  if (!isAllowedCrawlUrl(targetUrl)) {
    throw new Error('URL không thuộc danh sách trang báo được hỗ trợ');
  }

  let lastError: Error = new Error('Không thể tải trang');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Aborted');

    const parsed = new URL(targetUrl);
    const cookieHeader = getCookieHeader(parsed.hostname);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);
      const onParentAbort = () => controller.abort();
      signal?.addEventListener('abort', onParentAbort, { once: true });

      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      };
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers,
          redirect: 'follow',
          signal: controller.signal,
        });

        storeCookies(parsed.hostname, response.headers);

        if (!isAllowedCrawlUrl(response.url || targetUrl)) {
          throw new Error('Chuyển hướng tới tên miền không hợp lệ');
        }

        if (response.status === 403 || response.status === 429 || response.status >= 500) {
          lastError = new Error(`HTTP ${response.status}`);
          if (attempt < maxAttempts) {
            await delay(600 * attempt, signal);
            continue;
          }
          throw lastError;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return { html, finalUrl: response.url || targetUrl };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onParentAbort);
      }
    } catch (err) {
      if (signal?.aborted) throw new Error('Aborted');
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await delay(600 * attempt, signal);
      }
    }
  }

  throw lastError;
}

export async function fetchImageBuffer(
  imageUrl: string,
  refererUrl: string,
  signal?: AbortSignal,
  maxAttempts = 2,
): Promise<{ buffer: Buffer; extension: string }> {
  if (!isSafeImageUrl(imageUrl)) {
    throw new Error('URL ảnh không hợp lệ');
  }

  let lastError: Error = new Error('Không thể tải ảnh');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Aborted');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const onParentAbort = () => controller.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const response = await fetch(imageUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9',
          Referer: refererUrl,
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!isSafeImageUrl(response.url || imageUrl)) {
        throw new Error('URL ảnh chuyển hướng không hợp lệ');
      }

      if (!response.ok) {
        lastError = new Error(`Image HTTP ${response.status}`);
        if ((response.status === 403 || response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
          await delay(400 * attempt, signal);
          continue;
        }
        throw lastError;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const arrBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrBuf);
      if (buffer.length < 256) {
        throw new Error('Tệp ảnh quá nhỏ hoặc rỗng');
      }

      const ext = inferImageExtension(contentType, imageUrl);
      return { buffer, extension: ext };
    } catch (err) {
      if (signal?.aborted) throw new Error('Aborted');
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await delay(400 * attempt, signal);
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onParentAbort);
    }
  }

  throw lastError;
}

function inferImageExtension(contentType: string, imageUrl: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';

  const cleanPath = imageUrl.split('?')[0].toLowerCase();
  if (cleanPath.endsWith('.png')) return 'png';
  if (cleanPath.endsWith('.webp')) return 'webp';
  if (cleanPath.endsWith('.gif')) return 'gif';
  return 'jpg';
}
