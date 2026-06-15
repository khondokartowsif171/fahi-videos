'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Music,
  Film,
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Info,
} from 'lucide-react';
import { cn, formatFileSize, blobToDownload, sanitizeFilename } from '@/lib/utils';
import { extractAudio } from '@/lib/ffmpeg-operations';

type AppState = 'idle' | 'processing' | 'done' | 'error';
type AudioFormat = 'mp3' | 'aac';

const FORMAT_INFO: Record<AudioFormat, string> = {
  mp3: 'Universal compatibility — works on all devices and players',
  aac: 'Better quality at the same file size — ideal for Apple devices',
};

export default function VideoToMp3() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<AudioFormat>('mp3');
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

  const handleExtract = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    setError('');
    setResultBlob(null);

    try {
      const blob = await extractAudio(file, format, (p) => setProgress(p));
      setResultBlob(blob);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio extraction failed.');
      setState('error');
    }
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const base = sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
    blobToDownload(resultBlob, `${base}.${format}`);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Drop zone */}
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
          <Film className="w-7 h-7 text-violet-400" />
        </div>
        {file ? (
          <div className="text-center">
            <p className="text-foreground font-medium">{file.name}</p>
            <p className="text-muted-foreground text-sm mt-1">{formatFileSize(file.size)}</p>
            <p className="text-xs text-violet-400 mt-1">Click or drag to replace</p>
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

      {/* Format + options */}
      {file && state !== 'done' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          {/* Format selector */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Output Format</label>
            <div className="flex gap-2">
              {(['mp3', 'aac'] as AudioFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    'px-5 py-2 rounded-xl text-sm font-semibold uppercase tracking-wide transition-all border',
                    format === f
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'border-white/10 text-muted-foreground hover:border-violet-500/50 hover:text-foreground'
                  )}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Dynamic format info */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-white/5 rounded-xl p-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-violet-400" />
              <span>
                <span className="font-semibold text-violet-400">{format.toUpperCase()}: </span>
                {FORMAT_INFO[format]}
              </span>
            </div>
          </div>

          {/* Privacy note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-white/5 rounded-xl p-3">
            <Music className="w-4 h-4 mt-0.5 shrink-0 text-green-400" />
            <span>Audio extraction runs entirely in your browser — no upload needed, files stay on your device.</span>
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
            <span className="text-sm text-muted-foreground">Extracting audio…</span>
            <span className="ml-auto text-sm font-semibold text-violet-400">{progress}%</span>
          </div>
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Loading FFmpeg and processing video — this may take a moment on first run.
          </p>
        </div>
      )}

      {/* Done */}
      {state === 'done' && resultBlob && (
        <div className="glass rounded-2xl p-6 border border-green-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-foreground font-medium">Audio extracted!</p>
              <p className="text-sm text-muted-foreground">
                {file?.name.replace(/\.[^.]+$/, '')}.{format} &middot; {formatFileSize(resultBlob.size)}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Download .{format.toUpperCase()}
            </button>
            <button
              onClick={() => { setFile(null); setResultBlob(null); setState('idle'); }}
              className="px-5 py-2.5 rounded-xl font-medium border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
            >
              Extract Another
            </button>
          </div>
        </div>
      )}

      {/* Extract button */}
      {file && state !== 'processing' && state !== 'done' && (
        <button
          onClick={handleExtract}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white py-3 rounded-xl font-medium transition-all"
        >
          <Music className="w-5 h-5" />
          Extract Audio
        </button>
      )}
    </div>
  );
}
