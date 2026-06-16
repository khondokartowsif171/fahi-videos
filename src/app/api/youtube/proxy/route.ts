export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_HOSTS = ['googlevideo.com', 'youtube.com', 'ytimg.com'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  const filename = searchParams.get('filename') || 'video.mp4';

  if (!videoUrl) {
    return new Response('Missing url', { status: 400 });
  }

  // Validate URL — only allow YouTube CDN hosts
  try {
    const parsed = new URL(videoUrl);
    const allowed = ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h));
    if (parsed.protocol !== 'https:' || !allowed) {
      return new Response('Forbidden', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const rangeHeader = request.headers.get('range');

  const upstream = await fetch(videoUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
      ...(rangeHeader ? { range: rangeHeader } : {}),
    },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Upstream error', { status: upstream.status });
  }

  const resHeaders = new Headers();
  resHeaders.set('Content-Type', upstream.headers.get('content-type') ?? 'video/mp4');
  resHeaders.set(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/["/\\]/g, '_')}"`
  );
  resHeaders.set('Cache-Control', 'no-store');

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) resHeaders.set('Content-Length', contentLength);

  const contentRange = upstream.headers.get('content-range');
  if (contentRange) resHeaders.set('Content-Range', contentRange);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}
