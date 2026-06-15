'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  PackageOpen,
  Trash2,
} from 'lucide-react';
import JSZip from 'jszip';
import { cn, formatFileSize } from '@/lib/utils';

type OutputFormat = 'jpeg' | 'png' | 'webp';

interface ImageEntry {
  id: string;
  file: File;
  originalSize: number;
  compressedBlob: Blob | null;
  compressedSize: number | null;
  savings: number | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error: string;
}

function compressImage(file: File, format: OutputFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context not available'));
      ctx.drawImage(img, 0, 0);
      const mimeType =
        format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed — canvas returned null blob'));
        },
        mimeType,
        format === 'png' ? undefined : quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function outputFilename(original: string, format: OutputFormat): string {
  const base = original.replace(/\.[^.]+$/, '');
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${base}.${ext}`;
}

export default function ImageCompressor() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [quality, setQuality] = useState(0.8);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [globalStatus, setGlobalStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [zipStatus, setZipStatus] = useState<'idle' | 'building' | 'done'>('idle');

  const onDrop = useCallback((accepted: File[]) => {
    const newEntries: ImageEntry[] = accepted.slice(0, 20).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random()}`,
      file,
      originalSize: file.size,
      compressedBlob: null,
      compressedSize: null,
      savings: null,
      status: 'pending',
      error: '',
    }));
    setImages((prev) => {
      const combined = [...prev, ...newEntries];
      return combined.slice(0, 20);
    });
    setGlobalStatus('idle');
    setZipStatus('idle');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    maxFiles: 20,
  });

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setImages([]);
    setGlobalStatus('idle');
    setZipStatus('idle');
  }, []);

  const compressAll = useCallback(async () => {
    if (images.length === 0) return;
    setGlobalStatus('processing');
    setZipStatus('idle');

    // Reset all to pending
    setImages((prev) => prev.map((img) => ({ ...img, status: 'processing', compressedBlob: null, compressedSize: null, savings: null, error: '' })));

    const updated: ImageEntry[] = [...images].map((img) => ({ ...img, status: 'processing' as const }));

    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i];
      try {
        const blob = await compressImage(entry.file, format, quality);
        const savings = Math.max(0, ((entry.originalSize - blob.size) / entry.originalSize) * 100);
        updated[i] = { ...entry, compressedBlob: blob, compressedSize: blob.size, savings, status: 'done' };
      } catch (err) {
        updated[i] = { ...entry, status: 'error', error: err instanceof Error ? err.message : 'Compression failed' };
      }
      setImages([...updated]);
    }

    setGlobalStatus('done');
  }, [images, format, quality]);

  const downloadSingle = useCallback((entry: ImageEntry) => {
    if (!entry.compressedBlob) return;
    const url = URL.createObjectURL(entry.compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputFilename(entry.file.name, format);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [format]);

  const downloadZip = useCallback(async () => {
    const done = images.filter((img) => img.status === 'done' && img.compressedBlob);
    if (done.length === 0) return;
    setZipStatus('building');
    const zip = new JSZip();
    for (const entry of done) {
      if (entry.compressedBlob) {
        zip.file(outputFilename(entry.file.name, format), entry.compressedBlob);
      }
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed-images-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setZipStatus('done');
  }, [images, format]);

  const doneCount = images.filter((img) => img.status === 'done').length;
  const FORMAT_OPTIONS: { label: string; value: OutputFormat }[] = [
    { label: 'JPEG', value: 'jpeg' },
    { label: 'PNG', value: 'png' },
    { label: 'WebP', value: 'webp' },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
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
          <ImageIcon className="w-7 h-7 text-violet-400" />
        </div>
        <div className="text-center">
          <p className="text-foreground font-medium">
            {isDragActive ? 'Drop images here' : 'Drag & drop images'}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            or click to browse &middot; up to 20 images &middot; any image format
          </p>
        </div>
      </div>

      {/* Controls */}
      {images.length > 0 && (
        <div className="glass rounded-2xl p-6 space-y-5">
          {/* Quality slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Quality</label>
              <span className="text-sm text-violet-400 font-semibold">
                {Math.round(quality * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10% (smallest)</span>
              <span>100% (lossless)</span>
            </div>
          </div>

          {/* Format selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Output Format</label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                    format === opt.value
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'border-white/10 text-muted-foreground hover:border-violet-500/50 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Image list */}
      {images.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {images.length} image{images.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          </div>

          <div className="divide-y divide-white/5">
            {images.map((entry) => (
              <div key={entry.id} className="px-6 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{entry.file.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatFileSize(entry.originalSize)}
                    {entry.status === 'done' && entry.compressedSize !== null && (
                      <>
                        {' '}
                        &rarr;{' '}
                        <span className="text-green-400">{formatFileSize(entry.compressedSize)}</span>
                        {entry.savings !== null && (
                          <span className="ml-1 text-green-400 font-medium">
                            ({entry.savings.toFixed(0)}% saved)
                          </span>
                        )}
                      </>
                    )}
                    {entry.status === 'error' && (
                      <span className="text-red-400 ml-1">{entry.error}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {entry.status === 'pending' && (
                    <span className="text-xs text-muted-foreground">Pending</span>
                  )}
                  {entry.status === 'processing' && (
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  )}
                  {entry.status === 'done' && (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <button
                        onClick={() => downloadSingle(entry)}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        title="Download this image"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {entry.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                  <button
                    onClick={() => removeImage(entry.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {images.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={compressAll}
            disabled={globalStatus === 'processing'}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all',
              globalStatus === 'processing'
                ? 'bg-violet-600/50 text-white/50 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            )}
          >
            {globalStatus === 'processing' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Compressing... ({doneCount}/{images.length})
              </>
            ) : (
              <>
                <ImageIcon className="w-5 h-5" />
                Compress All
              </>
            )}
          </button>

          {doneCount > 0 && (
            <button
              onClick={downloadZip}
              disabled={zipStatus === 'building'}
              className={cn(
                'flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium border transition-all',
                zipStatus === 'building'
                  ? 'border-white/10 text-muted-foreground cursor-not-allowed'
                  : 'border-violet-500/60 text-violet-400 hover:bg-violet-600/10 hover:border-violet-400'
              )}
            >
              {zipStatus === 'building' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building ZIP...
                </>
              ) : (
                <>
                  <PackageOpen className="w-4 h-4" />
                  Download All as ZIP
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
