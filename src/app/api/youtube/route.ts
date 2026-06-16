/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

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

// Public Invidious instances — they run on their own VPS IPs (not blocked by YouTube),
// handle n-param deciphering, and return ready-to-use streaming URLs.
const INVIDIOUS_INSTANCES = [
  'https://invidious.io',
  'https://inv.nadeko.net',
  'https://invidious.private.coffee',
  'https://yt.artemislena.eu',
  'https://invidious.nerdvpn.de',
];

async function fetchFromInvidious(videoId: string): Promise<any> {
  const fields = 'title,author,lengthSeconds,viewCount,videoThumbnails,formatStreams,adaptiveFormats';
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=${fields}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!res.ok) {
        console.error(`[yt-inv] ${instance} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data?.formatStreams?.length || data?.adaptiveFormats?.length) {
        console.log(`[yt-inv] success via ${instance}`);
        return data;
      }
      console.error(`[yt-inv] ${instance} no formats`);
    } catch (e) {
      console.error(`[yt-inv] ${instance} threw:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

// Fallback: direct InnerTube API (edge runtime uses Cloudflare IPs, different from Lambda)
const INNERTUBE_CLIENTS = [
  { name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', version: '2.0', id: '85', embedUrl: 'https://www.youtube.com/' },
  { name: 'MWEB', version: '2.20260205.04.01', id: '2', embedUrl: null },
  { name: 'WEB', version: '2.20260206.01.00', id: '1', embedUrl: null },
] as const;

async function fetchFromInnerTube(videoId: string): Promise<any> {
  for (const c of INNERTUBE_CLIENTS) {
    try {
      const body: any = {
        videoId,
        racyCheckOk: true,
        contentCheckOk: true,
        context: {
          client: { clientName: c.name, clientVersion: c.version, hl: 'en', gl: 'US' },
          ...(c.embedUrl ? { thirdParty: { embedUrl: c.embedUrl } } : {}),
        },
      };
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': c.id,
          'X-YouTube-Client-Version': c.version,
          'Origin': 'https://www.youtube.com',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.playabilityStatus?.status === 'OK' && data?.streamingData) {
        return { _source: 'innertube', data };
      }
      console.error(`[yt-it] ${c.name} status=${data?.playabilityStatus?.status}`);
    } catch (e) {
      console.error(`[yt-it] ${c.name}:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

function parseInvidiousFormats(inv: any) {
  // muxed (video+audio)
  const muxed = (inv.formatStreams ?? []).map((f: any) => {
    const container = (f.type as string).split(';')[0].split('/')[1] ?? 'mp4';
    return {
      itag: parseInt(f.itag ?? '0', 10),
      qualityLabel: f.qualityLabel ?? f.quality ?? '?',
      container,
      hasVideo: true,
      hasAudio: true,
      contentLength: f.clen?.toString(),
      url: f.url as string,
      mimeType: f.type as string,
      bitrate: parseInt(f.bitrate ?? '0', 10),
    };
  });

  const adaptive: any[] = inv.adaptiveFormats ?? [];

  // best audio for merging
  const bestAudio = adaptive
    .filter((f: any) => f.type?.startsWith('audio/') && f.url)
    .sort((a: any, b: any) => parseInt(b.bitrate ?? '0') - parseInt(a.bitrate ?? '0'))[0];
  const bestAudioUrl: string | null = bestAudio?.url ?? null;

  // video-only >= 720p
  const seenHeights = new Set<number>();
  const videoOnly = adaptive
    .filter((f: any) => f.type?.startsWith('video/') && f.url && parseInt(f.resolution ?? '0') >= 720)
    .sort((a: any, b: any) => parseInt(b.resolution ?? '0') - parseInt(a.resolution ?? '0'))
    .map((f: any) => {
      const h = parseInt(f.resolution ?? '0', 10);
      if (seenHeights.has(h) || !bestAudioUrl) return null;
      seenHeights.add(h);
      const container = (f.type as string).split(';')[0].split('/')[1] ?? 'mp4';
      return {
        itag: parseInt(f.itag ?? '0', 10),
        qualityLabel: f.qualityLabel ?? f.resolution ?? `${h}p`,
        container,
        hasVideo: true,
        hasAudio: false,
        contentLength: f.clen?.toString(),
        url: f.url as string,
        mimeType: f.type as string,
        bitrate: parseInt(f.bitrate ?? '0', 10),
        audioUrl: bestAudioUrl,
        audioMimeType: bestAudio?.type ?? 'audio/mp4',
      };
    })
    .filter(Boolean);

  // audio-only
  const audioOnly = adaptive
    .filter((f: any) => f.type?.startsWith('audio/') && f.url)
    .slice(0, 3)
    .map((f: any) => {
      const kbps = Math.round(parseInt(f.bitrate ?? '0', 10) / 1000);
      const container = (f.type as string).split(';')[0].split('/')[1] ?? 'm4a';
      return {
        itag: parseInt(f.itag ?? '0', 10),
        qualityLabel: `Audio (${kbps || '?'}kbps)`,
        container,
        hasVideo: false,
        hasAudio: true,
        contentLength: f.clen?.toString(),
        url: f.url as string,
        mimeType: f.type as string,
        bitrate: parseInt(f.bitrate ?? '0', 10),
        audioBitrate: kbps || undefined,
      };
    });

  return [...muxed, ...videoOnly, ...audioOnly];
}

function parseInnerTubeFormats(streamingData: any) {
  const muxed = (streamingData.formats ?? [])
    .filter((f: any) => f.url)
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

  const adaptive = (streamingData.adaptiveFormats ?? []).filter((f: any) => f.url);
  const bestAudio = adaptive
    .filter((f: any) => f.audioQuality && !f.qualityLabel)
    .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
  const bestAudioUrl: string | null = bestAudio?.url ?? null;

  const seenHeights = new Set<number>();
  const videoOnly = adaptive
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
        audioMimeType: bestAudio?.mimeType ?? 'audio/mp4',
      };
    })
    .filter(Boolean);

  const audioOnly = adaptive
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

  return [...muxed, ...videoOnly, ...audioOnly];
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
    // Strategy 1: Invidious (most reliable — their VPS IPs not blocked by YouTube)
    const inv = await fetchFromInvidious(videoId);
    if (inv) {
      const formats = parseInvidiousFormats(inv);
      if (formats.length > 0) {
        const thumb = [...(inv.videoThumbnails ?? [])]
          .sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? '';
        return NextResponse.json({
          title: inv.title ?? 'Unknown Title',
          thumbnail: thumb,
          duration: parseInt(inv.lengthSeconds ?? '0', 10),
          channel: inv.author ?? 'Unknown',
          viewCount: inv.viewCount?.toString(),
          formats,
        });
      }
    }

    // Strategy 2: Direct InnerTube API (edge runtime = Cloudflare IPs)
    const itResult = await fetchFromInnerTube(videoId);
    if (itResult) {
      const { data } = itResult;
      const formats = parseInnerTubeFormats(data.streamingData);
      if (formats.length > 0) {
        const vd = data.videoDetails ?? {};
        const thumbnails: any[] = vd.thumbnail?.thumbnails ?? [];
        const thumb = [...thumbnails].sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? '';
        return NextResponse.json({
          title: vd.title ?? 'Unknown Title',
          thumbnail: thumb,
          duration: parseInt(vd.lengthSeconds ?? '0', 10),
          channel: vd.author ?? 'Unknown',
          viewCount: vd.viewCount?.toString(),
          formats,
        });
      }
    }

    return NextResponse.json(
      { error: 'No streaming data available for this video' },
      { status: 404 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[yt] unhandled:', message);

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
