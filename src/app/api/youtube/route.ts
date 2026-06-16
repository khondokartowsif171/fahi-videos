/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

// Edge runtime runs on Cloudflare's network — different IPs from Vercel serverless (AWS Lambda).
// YouTube blocks Lambda IPs; Cloudflare edge IPs work.
export const runtime = 'edge';

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

const CLIENTS = [
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    version: '2.0',
    id: '85',
    ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    embedUrl: 'https://www.youtube.com/',
  },
  {
    name: 'TV_EMBEDDED',
    version: '2.0',
    id: '85',
    ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    embedUrl: 'https://www.youtube.com/',
  },
  {
    name: 'MWEB',
    version: '2.20260205.04.01',
    id: '2',
    ua: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    embedUrl: null,
  },
  {
    name: 'WEB',
    version: '2.20260206.01.00',
    id: '1',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    embedUrl: null,
  },
] as const;

async function tryClient(videoId: string, c: (typeof CLIENTS)[number]): Promise<any> {
  const body: any = {
    videoId,
    racyCheckOk: true,
    contentCheckOk: true,
    context: {
      client: {
        clientName: c.name,
        clientVersion: c.version,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0,
      },
      ...(c.embedUrl ? { thirdParty: { embedUrl: c.embedUrl } } : {}),
    },
  };

  try {
    const res = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': c.id,
          'X-YouTube-Client-Version': c.version,
          'Origin': 'https://www.youtube.com',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
          'User-Agent': c.ua,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(7000),
      }
    );

    if (!res.ok) {
      console.error(`[yt-edge] ${c.name} HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();

    if (data?.playabilityStatus?.status === 'OK' && data?.streamingData) {
      return data;
    }

    console.error(
      `[yt-edge] ${c.name} status=${data?.playabilityStatus?.status} reason=${data?.playabilityStatus?.reason ?? ''}`
    );
    return null;
  } catch (e) {
    console.error(`[yt-edge] ${c.name} threw:`, e instanceof Error ? e.message : e);
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
    let playerData: any = null;
    for (const c of CLIENTS) {
      playerData = await tryClient(videoId, c);
      if (playerData) break;
    }

    if (!playerData) {
      return NextResponse.json(
        { error: 'No streaming data available for this video' },
        { status: 404 }
      );
    }

    const streamingData = playerData.streamingData;

    // Only use formats with a direct `url` — skip signatureCipher entries (need JS decipher)
    const muxedFormats = (streamingData.formats ?? [])
      .filter((f: any) => f.url && f.mimeType)
      .map((f: any) => {
        const container = (f.mimeType as string).split(';')[0].split('/')[1] ?? 'mp4';
        return {
          itag: f.itag ?? 0,
          qualityLabel: f.qualityLabel ?? `${f.height ?? '?'}p`,
          container,
          hasVideo: true,
          hasAudio: true,
          contentLength: f.contentLength?.toString(),
          url: f.url as string,
          mimeType: f.mimeType as string,
          bitrate: f.bitrate,
        };
      });

    const allAdaptive: any[] = (streamingData.adaptiveFormats ?? []).filter((f: any) => f.url);

    // Audio-only: has audioQuality, no qualityLabel (video resolution label)
    const bestAudioFmt = allAdaptive
      .filter((f: any) => f.audioQuality && !f.qualityLabel)
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    const bestAudioUrl: string | null = bestAudioFmt?.url ?? null;

    // Video-only >= 720p: has qualityLabel (e.g. "1080p"), no audioQuality
    const seenHeights = new Set<number>();
    const videoOnlyFormats = allAdaptive
      .filter((f: any) => f.qualityLabel && !f.audioQuality && (f.height ?? 0) >= 720)
      .sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))
      .map((f: any) => {
        const h: number = f.height ?? 0;
        if (seenHeights.has(h) || !bestAudioUrl) return null;
        seenHeights.add(h);
        const container = (f.mimeType as string).split(';')[0].split('/')[1] ?? 'mp4';
        return {
          itag: f.itag ?? 0,
          qualityLabel: f.qualityLabel ?? `${h}p`,
          container,
          hasVideo: true,
          hasAudio: false,
          contentLength: f.contentLength?.toString(),
          url: f.url as string,
          mimeType: f.mimeType as string,
          bitrate: f.bitrate,
          audioUrl: bestAudioUrl,
          audioMimeType: bestAudioFmt?.mimeType ?? 'audio/mp4',
        };
      })
      .filter(Boolean);

    // Audio-only formats (up to 3)
    const audioFormats = allAdaptive
      .filter((f: any) => f.audioQuality && !f.qualityLabel)
      .slice(0, 3)
      .map((f: any) => {
        const kbps = f.bitrate ? Math.round(f.bitrate / 1000) : '?';
        const container = (f.mimeType as string).split(';')[0].split('/')[1] ?? 'm4a';
        return {
          itag: f.itag ?? 0,
          qualityLabel: `Audio (${kbps}kbps)`,
          container,
          hasVideo: false,
          hasAudio: true,
          contentLength: f.contentLength?.toString(),
          url: f.url as string,
          mimeType: f.mimeType as string,
          bitrate: f.bitrate,
          audioBitrate: typeof kbps === 'number' ? kbps : undefined,
        };
      });

    const formats = [...muxedFormats, ...videoOnlyFormats, ...audioFormats];

    if (formats.length === 0) {
      return NextResponse.json(
        { error: 'No downloadable formats found. Video may be restricted.' },
        { status: 404 }
      );
    }

    const vd = playerData.videoDetails ?? {};
    const thumbnails: any[] = vd.thumbnail?.thumbnails ?? [];
    const thumbnail =
      [...thumbnails].sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? '';

    return NextResponse.json({
      title: vd.title ?? 'Unknown Title',
      thumbnail,
      duration: parseInt(vd.lengthSeconds ?? '0', 10),
      channel: vd.author ?? 'Unknown',
      viewCount: vd.viewCount?.toString(),
      formats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[yt-edge] unhandled:', message);

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
