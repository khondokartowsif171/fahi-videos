/* eslint-disable @typescript-eslint/no-explicit-any */
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

// TV_EMBEDDED first — works on cloud IPs without a PO token.
// ANDROID / IOS as fallbacks for muxed direct URLs.
const CLIENTS = ['TV_EMBEDDED', 'ANDROID', 'IOS', 'WEB'] as const;

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
    const yt = await Innertube.create({
      cache: undefined,
      generate_session_locally: true,
    });

    let info: any = null;
    for (const client of CLIENTS) {
      try {
        const candidate = await yt.getInfo(videoId, { client });
        if (candidate.streaming_data) {
          info = candidate;
          break;
        }
      } catch {
        // try next client
      }
    }

    if (!info?.streaming_data) {
      return NextResponse.json(
        { error: 'No streaming data available for this video' },
        { status: 404 }
      );
    }

    const basic = info.basic_info;
    const streamingData = info.streaming_data;
    const player = yt.session.player;

    // decipher() must be called first — it transforms the obfuscated n-parameter
    // so YouTube doesn't return 403. f.url is the raw (broken) URL.
    const resolveUrl = (f: any): string | null => {
      try {
        if (typeof f.decipher === 'function') {
          const u = f.decipher(player);
          if (typeof u === 'string' && u.startsWith('https://')) return u;
        }
      } catch { /* ignore */ }
      if (typeof f.url === 'string' && f.url.startsWith('https://')) return f.url;
      return null;
    };

    // Muxed formats (video + audio together)
    const muxedFormats = (streamingData.formats ?? [])
      .map((f: any) => {
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

    const allAdaptive: any[] = streamingData.adaptive_formats ?? [];

    // Best audio stream for client-side merging with video-only formats
    const bestAudioFmt = allAdaptive
      .filter((f: any) => f.has_audio && !f.has_video)
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    const bestAudioUrl = bestAudioFmt ? resolveUrl(bestAudioFmt) : null;
    const bestAudioMime: string = bestAudioFmt?.mime_type ?? 'audio/mp4';

    // Video-only adaptive formats >= 720p (need client-side FFmpeg merge)
    const seenHeights = new Set<number>();
    const videoOnlyFormats = allAdaptive
      .filter((f: any) => f.has_video && !f.has_audio && (f.height ?? 0) >= 720)
      .sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))
      .map((f: any) => {
        const h: number = f.height ?? 0;
        if (seenHeights.has(h)) return null;
        seenHeights.add(h);
        const resolvedUrl = resolveUrl(f);
        if (!resolvedUrl || !bestAudioUrl) return null;
        const container = (f.mime_type ?? 'video/mp4').split(';')[0].split('/')[1] ?? 'mp4';
        return {
          itag: f.itag ?? 0,
          qualityLabel: f.quality_label ?? `${h}p`,
          container,
          hasVideo: true,
          hasAudio: false,
          contentLength: f.content_length?.toString(),
          url: resolvedUrl,
          mimeType: f.mime_type ?? 'video/mp4',
          bitrate: f.bitrate,
          audioUrl: bestAudioUrl,
          audioMimeType: bestAudioMime,
        };
      })
      .filter(Boolean);

    // Audio-only formats
    const audioFormats = allAdaptive
      .filter((f: any) => !f.has_video && f.has_audio)
      .slice(0, 3)
      .map((f: any) => {
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

    // Order: muxed (360p) → HD video-only (1080p, 720p) → audio-only
    const formats = [...muxedFormats, ...videoOnlyFormats, ...audioFormats];

    if (formats.length === 0) {
      return NextResponse.json(
        { error: 'No downloadable formats found. Video may be restricted.' },
        { status: 404 }
      );
    }

    const thumbnails = basic.thumbnail ?? [];
    const thumbnail =
      [...thumbnails].sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? '';

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
