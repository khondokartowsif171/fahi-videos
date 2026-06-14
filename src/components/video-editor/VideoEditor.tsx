'use client';

import { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Scissors,
  Maximize2,
  Gauge,
  Play,
  Pause,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { cn, formatDuration, formatFileSize, blobToDownload, sanitizeFilename } from '@/lib/utils';
import { processVideo } from '@/lib/ffmpeg-operations';
import type { TrimOptions, ResizeOptions, CompressOptions } from '@/lib/ffmpeg-operations';

type ProcessState = 'idle' | 'loading-ffmpeg' | 'processing' | 'done' | 'error';

const QUALITY_PRESETS = [
  { label: '4K (2160p)', width: 3840, height: 2160 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
  { label: '360p', width: 640, height: 360 },
  { label: 'Custom', width: 0, height: 0 },
];

export default function VideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [state, setState] = useState<ProcessState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  // Options
  const [enableTrim, setEnableTrim] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const [enableResize, setEnableResize] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(2); // 720p default
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(720);

  const [enableCompress, setEnableCompress] = useState(false);
  const [crf, setCrf] = useState(28);
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'webm'>('mp4');

  const videoRef = useRef<HTMLVideoElement>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    setResultBlob(null);
    setState('idle');
    setError('');
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB
  });

  const handleVideoLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setTrimEnd(v.duration);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProcess = async () => {
    if (!file) return;
    setError('');
    setResultBlob(null);

    const options: {
      trim?: TrimOptions;
      resize?: ResizeOptions;
      compress?: CompressOptions;
    } = {};

    if (enableTrim) {
      options.trim = { startTime: trimStart, endTime: trimEnd };
    }
    if (enableResize) {
      const preset = QUALITY_PRESETS[selectedPreset];
      const w = preset.width || customWidth;
      const h = preset.height || customHeight;
      options.resize = { width: w, height: h, maintainAspect: true };
    }
    if (enableCompress) {
      options.compress = { crf, outputFormat };
    }

    if (!enableTrim && !enableResize && !enableCompress) {
      setError('Please enable at least one operation (Trim, Resize, or Compress).');
      return;
    }

    try {
      setState('loading-ffmpeg');
      setProgress(0);
      const blob = await processVideo(file, options, (p) => {
        setProgress(p);
        if (p > 10) setState('processing');
      });
      setResultBlob(blob);
      setState('done');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Processing failed');
      setState('error');
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const ext = enableCompress ? outputFormat : (file.name.split('.').pop() || 'mp4');
    blobToDownload(resultBlob, `${sanitizeFilename(file.name.replace(/\.[^.]+$/, ''))}_edited.${ext}`);
  };

  const isProcessing = state === 'loading-ffmpeg' || state === 'processing';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Upload */}
      {!file && (
        <div
          {...getRootProps()}
          className={cn(
            'glass rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-border hover:border-violet-500/50 hover:bg-white/3'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium mb-1">
            {isDragActive ? 'Drop your video here' : 'Drag & drop a video file'}
          </p>
          <p className="text-sm text-muted-foreground">or click to browse · MP4, MOV, AVI, WebM · Max 500MB</p>
        </div>
      )}

      {/* Video preview + controls */}
      {file && (
        <>
          <div className="glass rounded-2xl overflow-hidden">
            <div className="relative bg-black aspect-video">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                onLoadedMetadata={handleVideoLoaded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
              >
                <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {isPlaying ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-0.5" />
                  )}
                </div>
              </button>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground truncate max-w-xs">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)} · {formatDuration(duration)}
                </p>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setVideoUrl('');
                  setState('idle');
                  setResultBlob(null);
                }}
                className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>

          {/* Operations */}
          <div className="space-y-3">
            {/* Trim */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableTrim(!enableTrim)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableTrim ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Scissors className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Trim Video</p>
                  <p className="text-xs text-muted-foreground">Set start and end time</p>
                </div>
                <div className={cn('w-10 h-5 rounded-full transition-colors relative', enableTrim ? 'bg-violet-600' : 'bg-muted')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', enableTrim ? 'left-5' : 'left-0.5')} />
                </div>
              </button>
              {enableTrim && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Start (seconds)</label>
                      <input
                        type="number"
                        min={0}
                        max={trimEnd - 0.1}
                        step={0.1}
                        value={trimStart}
                        onChange={(e) => setTrimStart(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">End (seconds)</label>
                      <input
                        type="number"
                        min={trimStart + 0.1}
                        max={duration}
                        step={0.1}
                        value={trimEnd}
                        onChange={(e) => setTrimEnd(parseFloat(e.target.value) || duration)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Duration: {formatDuration(trimEnd - trimStart)}
                  </p>
                </div>
              )}
            </div>

            {/* Resize */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableResize(!enableResize)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableResize ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Maximize2 className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Resize</p>
                  <p className="text-xs text-muted-foreground">Change video dimensions</p>
                </div>
                <div className={cn('w-10 h-5 rounded-full transition-colors relative', enableResize ? 'bg-violet-600' : 'bg-muted')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', enableResize ? 'left-5' : 'left-0.5')} />
                </div>
              </button>
              {enableResize && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITY_PRESETS.map((p, i) => (
                      <button
                        key={p.label}
                        onClick={() => setSelectedPreset(i)}
                        className={cn(
                          'py-2 px-3 rounded-lg text-xs font-medium border transition-all',
                          selectedPreset === i
                            ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                            : 'border-border text-muted-foreground hover:border-white/20'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {selectedPreset === QUALITY_PRESETS.length - 1 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Width (px)</label>
                        <input
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(parseInt(e.target.value) || 0)}
                          className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Height (px)</label>
                        <input
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(parseInt(e.target.value) || 0)}
                          className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Compress */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableCompress(!enableCompress)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableCompress ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Gauge className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Compress</p>
                  <p className="text-xs text-muted-foreground">Reduce file size</p>
                </div>
                <div className={cn('w-10 h-5 rounded-full transition-colors relative', enableCompress ? 'bg-violet-600' : 'bg-muted')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', enableCompress ? 'left-5' : 'left-0.5')} />
                </div>
              </button>
              {enableCompress && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>Quality: {crf <= 20 ? 'High' : crf <= 28 ? 'Good' : crf <= 35 ? 'Fair' : 'Small'}</span>
                      <span>CRF {crf}</span>
                    </div>
                    <input
                      type="range"
                      min={18}
                      max={51}
                      value={crf}
                      onChange={(e) => setCrf(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Best Quality</span>
                      <span>Smallest File</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Output Format</label>
                    <div className="flex gap-2">
                      {(['mp4', 'webm'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => setOutputFormat(fmt)}
                          className={cn(
                            'px-4 py-2 rounded-lg text-sm font-medium border transition-all',
                            outputFormat === fmt
                              ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                              : 'border-border text-muted-foreground hover:border-white/20'
                          )}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {state === 'error' && (
            <div className="flex items-start gap-3 glass rounded-xl p-4 border border-red-500/30 text-red-400">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="glass rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                <p className="text-sm font-medium">
                  {state === 'loading-ffmpeg' ? 'Loading FFmpeg engine...' : `Processing video... ${progress}%`}
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-300 rounded-full progress-glow"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Processing happens in your browser. Please keep this tab open.
              </p>
            </div>
          )}

          {/* Done */}
          {state === 'done' && resultBlob && (
            <div className="glass rounded-xl p-5 border border-green-500/30">
              <div className="flex items-center gap-2 text-green-400 mb-3">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Processing complete!</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Result size: {formatFileSize(resultBlob.size)}
              </p>
              <button
                onClick={handleDownload}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                Download Result
              </button>
            </div>
          )}

          {/* Process button */}
          {!isProcessing && state !== 'done' && (
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 transition-all"
            >
              <Play className="w-4 h-4" />
              Process Video
            </button>
          )}
        </>
      )}
    </div>
  );
}
