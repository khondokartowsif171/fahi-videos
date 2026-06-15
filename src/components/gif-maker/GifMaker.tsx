'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Film,
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  ImagePlay,
} from 'lucide-react';
import { cn, formatFileSize, blobToDownload, sanitizeFilename } from '@/lib/utils';
import { makeGif } from '@/lib/ffmpeg-operations';

type AppState = 'idle' | 'processing' | 'done' | 'error';

const WIDTH_PRESETS = [240, 320, 480, 640] as const;

export default function GifMaker() {
  const [file, setFile] = useState<File | null>(null);
  const [fps, setFps] = useState(15);
  const [width, setWidth] = useState<number>(480);
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setResultBlob(null);
      setError('');
      setState('idle');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
  });

  const handleMakeGif = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    setError('');

    try {
      const opts: { fps: number; scale: number; startTime?: number; duration?: number } = {
        fps,
        scale: width,
      };
      if (startTime !== '') opts.startTime = parseFloat(startTime);
      if (duration !== '') opts.duration = Math.min(parseFloat(duration), 30);

      const blob = await makeGif(file, opts, (p) => setProgress(Math.round(p * 100)));
      setResultBlob(blob);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GIF creation failed.');
      setState('error');
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const name = sanitizeFilename(file.name.replace(/\.[^.]+$/, '')) + '.gif';
    blobToDownload(resultBlob, name);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          'glass rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all border-2',
          isDragActive
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-dashed border-white/10 hover:border-violet-500/50 hover:bg-white/5'
        )}
      >
        <input {...getInputProps()} />
        <div className="w-14 h-14 rounded-2xl bg-violet-600/20 flex items-center justify-center">
          <ImagePlay className="w-7 h-7 text-violet-400" />
        </div>
        {file ? (
          <div className="text-center">
            <p className="text-foreground font-medium">{file.name}</p>
            <p className="text-muted-foreground text-sm mt-1">{formatFileSize(file.size)}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-foreground font-medium">
              {isDragActive ? 'Drop your video here' : 'Drag & drop a video'}
            </p>
            <p className="text-muted-foreground text-sm mt-1">or click to browse · any video format</p>
          </div>
        )}
      </div>

      {/* Controls */}
      {file && state !== 'done' && (
        <div className="glass rounded-2xl p-6 space-y-6">
          {/* FPS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Frame Rate</label>
              <span className="text-sm text-violet-400 font-semibold">{fps} FPS</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 FPS (smaller)</span>
              <span>30 FPS (smoother)</span>
            </div>
          </div>

          {/* Width Presets */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Output Width</label>
            <div className="flex gap-2 flex-wrap">
              {WIDTH_PRESETS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                    width === w
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'border-white/10 text-muted-foreground hover:border-violet-500/50 hover:text-foreground'
                  )}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Start Time (s)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder="0"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Duration (s)</label>
              <input
                type="number"
                min={0.1}
                max={30}
                step={0.1}
                placeholder="max 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/60"
              />
            </div>
          </div>

          {/* Tip */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-white/5 rounded-xl p-3">
            <Film className="w-4 h-4 mt-0.5 shrink-0 text-violet-400" />
            <span>Shorter clips = smaller GIFs. Max 30s recommended. Long clips may result in very large files.</span>
          </div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Progress */}
      {state === 'processing' && (
        <div className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            <span className="text-sm text-muted-foreground">Creating GIF…</span>
            <span className="ml-auto text-sm font-semibold text-violet-400">{progress}%</span>
          </div>
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300 progress-glow"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Done */}
      {state === 'done' && resultBlob && (
        <div className="glass rounded-2xl p-6 border border-green-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-foreground font-medium">GIF ready!</p>
              <p className="text-sm text-muted-foreground">{formatFileSize(resultBlob.size)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Download GIF
            </button>
            <button
              onClick={() => { setFile(null); setResultBlob(null); setState('idle'); }}
              className="px-5 py-2.5 rounded-xl font-medium border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
            >
              Make Another
            </button>
          </div>
        </div>
      )}

      {/* Process Button */}
      {file && state !== 'processing' && state !== 'done' && (
        <button
          onClick={handleMakeGif}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white py-3 rounded-xl font-medium transition-all"
        >
          <ImagePlay className="w-5 h-5" />
          Create GIF
        </button>
      )}
    </div>
  );
}
