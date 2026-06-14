import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export const runtime = 'nodejs';
export const maxDuration = 30;

function isValidYouTubeUrl(url: string): boolean {
  try {
    return ytdl.validateURL(url);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  if (!isValidYouTubeUrl(url)) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  try {
    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    });

    const { videoDetails } = info;

    // Get all formats with URLs
    const allFormats = info.formats.filter((f) => f.url);

    // Prioritize muxed (audio+video) formats as they download directly
    const muxedFormats = ytdl.filterFormats(allFormats, 'videoandaudio').map((f) => ({
      itag: f.itag,
      qualityLabel: f.qualityLabel || 'Unknown',
      container: f.container || 'mp4',
      hasVideo: !!f.hasVideo,
      hasAudio: !!f.hasAudio,
      contentLength: f.contentLength,
      url: f.url,
      mimeType: f.mimeType || 'video/mp4',
      bitrate: f.bitrate,
      audioBitrate: f.audioBitrate,
    }));

    // Audio only formats
    const audioFormats = ytdl.filterFormats(allFormats, 'audioonly').slice(0, 3).map((f) => ({
      itag: f.itag,
      qualityLabel: `Audio (${f.audioBitrate || '?'}kbps)`,
      container: f.container || 'm4a',
      hasVideo: false,
      hasAudio: true,
      contentLength: f.contentLength,
      url: f.url,
      mimeType: f.mimeType || 'audio/mp4',
      bitrate: f.bitrate,
      audioBitrate: f.audioBitrate,
    }));

    const formats = [...muxedFormats, ...audioFormats];

    if (formats.length === 0) {
      return NextResponse.json(
        { error: 'No downloadable formats found for this video' },
        { status: 404 }
      );
    }

    // Get best thumbnail
    const thumbnails = videoDetails.thumbnails || [];
    const thumbnail =
      thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || '';

    return NextResponse.json({
      title: videoDetails.title,
      thumbnail,
      duration: parseInt(videoDetails.lengthSeconds || '0', 10),
      channel: videoDetails.author?.name || 'Unknown',
      viewCount: videoDetails.viewCount,
      formats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch video info';
    console.error('YouTube fetch error:', message);

    if (message.includes('private') || message.includes('age-restricted')) {
      return NextResponse.json({ error: 'Video is private or age-restricted' }, { status: 403 });
    }
    if (message.includes('not found') || message.includes('unavailable')) {
      return NextResponse.json({ error: 'Video not found or unavailable' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to fetch video info. Try again.' }, { status: 500 });
  }
}
