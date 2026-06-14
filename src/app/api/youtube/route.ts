import { NextResponse } from 'next/server';
import { Innertube } from 'youtubei.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

function extractVideoId(url: string): string | null {
  try {
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /\/embed\/([a-zA-Z0-9_-]{11})/,
      /\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  try {
    // Fresh instance per request — safer on Vercel serverless (no stale player state)
    const yt = await Innertube.create({
      cache: undefined,
      generate_session_locally: true,
    });

    // ANDROID client returns streaming_data reliably with direct (non-ciphered) URLs
    const info = await yt.getInfo(videoId, { client: 'ANDROID' });

    const basic = info.basic_info;
    const streamingData = info.streaming_data;

    if (!streamingData) {
      return NextResponse.json(
        { error: 'No streaming data available for this video' },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolveUrl = (f: any): string | null => {
      try {
        if (f.url) return f.url as string;
        // Fallback: decipher if URL is signed
        if (typeof f.decipher === 'function') {
          return f.decipher(yt.session.player) as string;
        }
        return null;
      } catch {
        return null;
      }
    };

    // Muxed formats (video + audio together) — directly downloadable
    const muxedFormats = (streamingData.formats ?? [])
      .map((f) => {
        const resolvedUrl = resolveUrl(f);
        if (!resolvedUrl) return null;
        const quality = f.quality_label ?? `${f.height ?? '?'}p`;
        const container = (f.mime_type ?? 'video/mp4').split(';')[0].split('/')[1] ?? 'mp4';
        return {
          itag: f.itag ?? 0,
          qualityLabel: quality,
          container,
          hasVideo: true,
          hasAudio: true,
          contentLength: f.content_length?.toString(),
          url: resolvedUrl,
          mimeType: f.mime_type ?? 'video/mp4',
          bitrate: f.bitrate,
        };
      })
      .filter(Boolean);

    // Audio-only formats
    const audioFormats = (streamingData.adaptive_formats ?? [])
      .filter((f) => !f.has_video && f.has_audio)
      .slice(0, 3)
      .map((f) => {
        const resolvedUrl = resolveUrl(f);
        if (!resolvedUrl) return null;
        const container = (f.mime_type ?? 'audio/mp4').split(';')[0].split('/')[1] ?? 'm4a';
        const kbps = f.bitrate ? Math.round(f.bitrate / 1000) : '?';
        return {
          itag: f.itag ?? 0,
          qualityLabel: `Audio (${kbps}kbps)`,
          container,
          hasVideo: false,
          hasAudio: true,
          contentLength: f.content_length?.toString(),
          url: resolvedUrl,
          mimeType: f.mime_type ?? 'audio/mp4',
          bitrate: f.bitrate,
          audioBitrate: typeof kbps === 'number' ? kbps : undefined,
        };
      })
      .filter(Boolean);

    const formats = [...muxedFormats, ...audioFormats];

    if (formats.length === 0) {
      return NextResponse.json(
        { error: 'No downloadable formats found. Video may be restricted.' },
        { status: 404 }
      );
    }

    // Best thumbnail
    const thumbnails = basic.thumbnail ?? [];
    const thumbnail =
      [...thumbnails].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? '';

    return NextResponse.json({
      title: basic.title ?? 'Unknown Title',
      thumbnail,
      duration: basic.duration ?? 0,
      channel: basic.channel?.name ?? basic.author ?? 'Unknown',
      viewCount: basic.view_count?.toString(),
      formats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('YouTube fetch error:', message);

    if (message.includes('private') || message.includes('LOGIN_REQUIRED')) {
      return NextResponse.json({ error: 'Video is private or requires login' }, { status: 403 });
    }
    if (message.includes('not found') || message.includes('unavailable')) {
      return NextResponse.json({ error: 'Video not found or unavailable' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch video info. Try again.' },
      { status: 500 }
    );
  }
}
