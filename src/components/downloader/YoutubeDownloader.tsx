'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Search, Download, AlertCircle, Clock, Eye, Music, Video } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { cn, formatDuration, formatFileSize, triggerDownload, sanitizeFilename } from '@/lib/utils';
import type { VideoInfo, VideoFormat, FetchState } from '@/types/youtube';

export default function YoutubeDownloader() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<FetchState>('idle');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [error, setError] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setState('loading');
    setError('');
    setVideoInfo(null);
    setSelectedFormat(null);

    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch video');
      setVideoInfo(data);
      setSelectedFormat(data.formats[0] || null);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  };

  const handleDownload = async () => {
    if (!selectedFormat || !videoInfo) return;

    if (selectedFormat.hasVideo && !selectedFormat.hasAudio && selectedFormat.audioUrl) {
      setMerging(true);
      setMergeProgress(0);
      try {
        let ff = ffmpegRef.current;
        if (!ff) {
          ff = new FFmpeg();
          await ff.load();
          ffmpegRef.current = ff;
        }
        setMergeProgress(10);
        // Route through proxy so COEP (require-corp) doesn't block the cross-origin fetch
        const videoProxyUrl = `/api/youtube/proxy?url=${encodeURIComponent(selectedFormat.url)}&filename=v.mp4`;
        const audioProxyUrl = `/api/youtube/proxy?url=${encodeURIComponent(selectedFormat.audioUrl)}&filename=a.m4a`;
        await ff.writeFile('v.mp4', await fetchFile(videoProxyUrl));
        setMergeProgress(45);
        await ff.writeFile('a.m4a', await fetchFile(audioProxyUrl));
        setMergeProgress(75);
        await ff.exec(['-i', 'v.mp4', '-i', 'a.m4a', '-c', 'copy', 'out.mp4']);
        setMergeProgress(95);
        const rawData = await ff.readFile('out.mp4');
        const blob = new Blob([(rawData as Uint8Array).slice()], { type: 'video/mp4' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${sanitizeFilename(videoInfo.title)}.mp4`;
        a.click();
        setMergeProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Merge failed');
        setState('error');
      } finally {
        setMerging(false);
      }
    } else {
      // Route download through our proxy so the browser treats it as same-origin,
      // making the `download` attribute work (cross-origin hrefs are ignored by browsers).
      const safeFilename = `${sanitizeFilename(videoInfo.title)}.${selectedFormat.container}`;
      const proxyUrl = `/api/youtube/proxy?url=${encodeURIComponent(selectedFormat.url)}&filename=${encodeURIComponent(safeFilename)}`;
      triggerDownload(proxyUrl, safeFilename);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* URL Input */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Paste YouTube URL</h2>
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 bg-white/5 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
          />
          <button
            onClick={handleFetch}
            disabled={state === 'loading' || !url.trim()}
            className={cn(
              'px-5 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition-all',
              state === 'loading' || !url.trim()
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20'
            )}
          >
            {state === 'loading' ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Fetch
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Supports youtube.com and youtu.be links
        </p>
      </div>

      {/* Error */}
      {state === 'error' && (
        <div className="flex items-start gap-3 glass rounded-xl p-4 border border-red-500/30 text-red-400">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to fetch video</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Video Info */}
      {state === 'ready' && videoInfo && (
        <div className="glass rounded-2xl overflow-hidden animate-slide-up">
          {/* Thumbnail */}
          {videoInfo.thumbnail && (
            <div className="relative aspect-video bg-black">
              <Image
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-3 flex items-center gap-3 text-white text-xs">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(videoInfo.duration)}
                </span>
                {videoInfo.viewCount && (
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {parseInt(videoInfo.viewCount).toLocaleString()} views
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground line-clamp-2">{videoInfo.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{videoInfo.channel}</p>
            </div>

            {/* Format selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Select Quality
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {videoInfo.formats.map((fmt) => (
                  <button
                    key={fmt.itag}
                    onClick={() => setSelectedFormat(fmt)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-sm border transition-all text-left',
                      selectedFormat?.itag === fmt.itag
                        ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                        : 'border-border bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {fmt.hasVideo ? (
                        <Video className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <Music className="w-3 h-3 flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{fmt.qualityLabel}</span>
                      {fmt.hasVideo && !fmt.hasAudio && (
                        <span className="ml-auto text-[10px] font-bold bg-violet-500/20 text-violet-400 px-1 py-0.5 rounded flex-shrink-0">HD</span>
                      )}
                    </div>
                    <div className="text-xs opacity-60 truncate">
                      {fmt.container.toUpperCase()} · {formatFileSize(fmt.contentLength)}
                      {fmt.hasVideo && !fmt.hasAudio && ' · +audio'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Download / Merge button */}
            {merging ? (
              <div className="space-y-2">
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300 rounded-full"
                    style={{ width: `${mergeProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {mergeProgress < 10 ? 'Loading FFmpeg...' :
                   mergeProgress < 45 ? 'Downloading video...' :
                   mergeProgress < 75 ? 'Downloading audio...' :
                   mergeProgress < 95 ? 'Merging streams...' :
                   'Finalizing...'}
                  {' '}{mergeProgress}%
                </p>
              </div>
            ) : (
              <button
                onClick={handleDownload}
                disabled={!selectedFormat}
                className="w-full py-3 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {selectedFormat?.hasVideo && !selectedFormat?.hasAudio
                  ? `Download & Merge ${selectedFormat?.qualityLabel}`
                  : `Download ${selectedFormat?.qualityLabel}`}
              </button>
            )}

            <p className="text-xs text-muted-foreground text-center">
              {selectedFormat?.hasVideo && !selectedFormat?.hasAudio
                ? 'HD formats are merged client-side in your browser.'
                : 'Download starts in a new tab. For personal use only.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
