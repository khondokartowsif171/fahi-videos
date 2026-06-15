'use client';

import { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Scissors,
  Maximize2,
  Gauge,
  Crop,
  Play,
  Pause,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
  Zap,
  RotateCw,
  VolumeX,
  Rewind,
  Type,
  Music,
  Image as ImageIcon,
} from 'lucide-react';
import { cn, formatDuration, formatFileSize, blobToDownload, sanitizeFilename } from '@/lib/utils';
import { processVideo, extractAudio, makeGif } from '@/lib/ffmpeg-operations';
import type {
  TrimOptions,
  ResizeOptions,
  CompressOptions,
  CropOptions,
  FilterAdjustOptions,
  SpeedOptions,
  RotateOptions,
  WatermarkOptions,
  GifOptions,
} from '@/lib/ffmpeg-operations';

type ProcessState = 'idle' | 'loading-ffmpeg' | 'processing' | 'done' | 'error';
type OperationMode = 'video' | 'extract-audio' | 'gif';

const QUALITY_PRESETS = [
  { label: '4K (2160p)', width: 3840, height: 2160 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
  { label: '360p', width: 640, height: 360 },
  { label: 'Custom', width: 0, height: 0 },
];

const SPEED_RATES = [0.25, 0.5, 1, 1.5, 2] as const;

const WATERMARK_POSITIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'center', label: 'Center' },
] as const;

export default function VideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [state, setState] = useState<ProcessState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  // Operation mode
  const [operationMode, setOperationMode] = useState<OperationMode>('video');

  // Trim
  const [enableTrim, setEnableTrim] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Resize
  const [enableResize, setEnableResize] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(2); // 720p default
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(720);

  // Crop
  const [enableCrop, setEnableCrop] = useState(false);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(1280);
  const [cropHeight, setCropHeight] = useState(720);

  // Compress
  const [enableCompress, setEnableCompress] = useState(false);
  const [crf, setCrf] = useState(28);
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'webm'>('mp4');

  // Filters
  const [enableFilters, setEnableFilters] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [hue, setHue] = useState(0);

  // Speed
  const [enableSpeed, setEnableSpeed] = useState(false);
  const [speedRate, setSpeedRate] = useState(1);

  // Rotate & Flip
  const [enableRotate, setEnableRotate] = useState(false);
  const [rotateAngle, setRotateAngle] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Mute Audio
  const [enableMute, setEnableMute] = useState(false);

  // Reverse Video
  const [enableReverse, setEnableReverse] = useState(false);

  // Watermark
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkFontSize, setWatermarkFontSize] = useState(32);
  const [watermarkColor, setWatermarkColor] = useState('#ffffff');
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkOptions['position']>('bottom-right');

  // Extract Audio
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'aac'>('mp3');

  // Video to GIF
  const [gifFps, setGifFps] = useState(15);
  const [gifWidth, setGifWidth] = useState(480);
  const [gifStart, setGifStart] = useState('');
  const [gifDuration, setGifDuration] = useState('');

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
    if (v.videoWidth > 0) {
      setCropWidth(v.videoWidth);
      setCropHeight(v.videoHeight);
    }
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

    try {
      setState('loading-ffmpeg');
      setProgress(0);

      if (operationMode === 'extract-audio') {
        const blob = await extractAudio(file, audioFormat, (p) => {
          setProgress(p);
          if (p > 10) setState('processing');
        });
        setResultBlob(blob);
        setState('done');
        return;
      }

      if (operationMode === 'gif') {
        const gifOptions: GifOptions = {
          fps: gifFps,
          scale: gifWidth,
          startTime: gifStart ? parseFloat(gifStart) : undefined,
          duration: gifDuration ? parseFloat(gifDuration) : undefined,
        };
        const blob = await makeGif(file, gifOptions, (p) => {
          setProgress(p);
          if (p > 10) setState('processing');
        });
        setResultBlob(blob);
        setState('done');
        return;
      }

      // Default: processVideo mode
      const options: {
        trim?: TrimOptions;
        crop?: CropOptions;
        resize?: ResizeOptions;
        compress?: CompressOptions;
        filters?: FilterAdjustOptions;
        speed?: SpeedOptions;
        rotate?: RotateOptions;
        watermark?: WatermarkOptions;
        mute?: boolean;
        reverse?: boolean;
      } = {};

      if (enableTrim) {
        options.trim = { startTime: trimStart, endTime: trimEnd };
      }
      if (enableCrop && cropWidth > 0 && cropHeight > 0) {
        options.crop = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
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
      if (enableFilters) {
        options.filters = { brightness, contrast, saturation, hue };
      }
      if (enableSpeed && speedRate !== 1) {
        options.speed = { rate: speedRate };
      }
      if (enableRotate && (rotateAngle !== 0 || flipH || flipV)) {
        options.rotate = { angle: rotateAngle, flipH, flipV };
      }
      if (enableWatermark && watermarkText.trim()) {
        options.watermark = {
          text: watermarkText,
          fontSize: watermarkFontSize,
          color: watermarkColor,
          position: watermarkPosition,
        };
      }
      if (enableMute) {
        options.mute = true;
      }
      if (enableReverse) {
        options.reverse = true;
      }

      const anyEnabled =
        enableTrim ||
        enableCrop ||
        enableResize ||
        enableCompress ||
        enableFilters ||
        (enableSpeed && speedRate !== 1) ||
        (enableRotate && (rotateAngle !== 0 || flipH || flipV)) ||
        (enableWatermark && watermarkText.trim() !== '') ||
        enableMute ||
        enableReverse;

      if (!anyEnabled) {
        setError(
          'Please enable at least one operation (Trim, Crop, Resize, Compress, Filters, Speed, Rotate/Flip, Watermark, Mute, or Reverse).'
        );
        setState('idle');
        return;
      }

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
    const baseName = sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
    if (operationMode === 'extract-audio') {
      blobToDownload(resultBlob, `${baseName}.${audioFormat}`);
    } else if (operationMode === 'gif') {
      blobToDownload(resultBlob, `${baseName}.gif`);
    } else {
      const ext = enableCompress ? outputFormat : (file.name.split('.').pop() || 'mp4');
      blobToDownload(resultBlob, `${baseName}_edited.${ext}`);
    }
  };

  const processButtonLabel = () => {
    if (operationMode === 'extract-audio') return 'Extract Audio';
    if (operationMode === 'gif') return 'Make GIF';
    return 'Process Video';
  };

  const isProcessing = state === 'loading-ffmpeg' || state === 'processing';

  // Shared toggle switch renderer
  const ToggleSwitch = ({ enabled }: { enabled: boolean }) => (
    <div className={cn('w-10 h-5 rounded-full transition-colors relative', enabled ? 'bg-violet-600' : 'bg-muted')}>
      <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', enabled ? 'left-5' : 'left-0.5')} />
    </div>
  );

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

            {/* ── Trim ─────────────────────────────────────────────── */}
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
                <ToggleSwitch enabled={enableTrim} />
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

            {/* ── Crop ─────────────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableCrop(!enableCrop)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableCrop ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Crop className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Crop</p>
                  <p className="text-xs text-muted-foreground">Cut a custom region of the video</p>
                </div>
                <ToggleSwitch enabled={enableCrop} />
              </button>
              {enableCrop && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Width (px)</label>
                      <input
                        type="number"
                        min={1}
                        value={cropWidth}
                        onChange={(e) => setCropWidth(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Height (px)</label>
                      <input
                        type="number"
                        min={1}
                        value={cropHeight}
                        onChange={(e) => setCropHeight(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">X offset (px)</label>
                      <input
                        type="number"
                        min={0}
                        value={cropX}
                        onChange={(e) => setCropX(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Y offset (px)</label>
                      <input
                        type="number"
                        min={0}
                        value={cropY}
                        onChange={(e) => setCropY(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Crops a {cropWidth}&times;{cropHeight}px region starting at ({cropX}, {cropY})
                  </p>
                </div>
              )}
            </div>

            {/* ── Resize ───────────────────────────────────────────── */}
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
                <ToggleSwitch enabled={enableResize} />
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

            {/* ── Compress ─────────────────────────────────────────── */}
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
                <ToggleSwitch enabled={enableCompress} />
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

            {/* ── Filters ──────────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableFilters(!enableFilters)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableFilters ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Filters</p>
                  <p className="text-xs text-muted-foreground">Adjust brightness, contrast, saturation & hue</p>
                </div>
                <ToggleSwitch enabled={enableFilters} />
              </button>
              {enableFilters && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4 space-y-4">
                  {/* Brightness */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Brightness</span>
                      <span>{brightness.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>-1</span>
                      <span>0</span>
                      <span>+1</span>
                    </div>
                  </div>
                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Contrast</span>
                      <span>{contrast.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.01}
                      value={contrast}
                      onChange={(e) => setContrast(parseFloat(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0</span>
                      <span>1</span>
                      <span>3</span>
                    </div>
                  </div>
                  {/* Saturation */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Saturation</span>
                      <span>{saturation.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.01}
                      value={saturation}
                      onChange={(e) => setSaturation(parseFloat(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0</span>
                      <span>1</span>
                      <span>3</span>
                    </div>
                  </div>
                  {/* Hue */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Hue</span>
                      <span>{hue}&deg;</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={hue}
                      onChange={(e) => setHue(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>-180&deg;</span>
                      <span>0&deg;</span>
                      <span>+180&deg;</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Speed ────────────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableSpeed(!enableSpeed)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableSpeed ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Speed</p>
                  <p className="text-xs text-muted-foreground">Change playback speed</p>
                </div>
                <ToggleSwitch enabled={enableSpeed} />
              </button>
              {enableSpeed && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4">
                  <label className="text-xs text-muted-foreground mb-2 block">Playback Rate</label>
                  <div className="flex gap-2 flex-wrap">
                    {SPEED_RATES.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setSpeedRate(rate)}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium border transition-all',
                          speedRate === rate
                            ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                            : 'border-border text-muted-foreground hover:border-white/20'
                        )}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Rotate & Flip ─────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableRotate(!enableRotate)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableRotate ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <RotateCw className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Rotate &amp; Flip</p>
                  <p className="text-xs text-muted-foreground">Rotate or mirror the video</p>
                </div>
                <ToggleSwitch enabled={enableRotate} />
              </button>
              {enableRotate && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4 space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Rotation</label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setRotateAngle((prev) => { const next = ((prev - 90 + 360) % 360) as 0 | 90 | 180 | 270; return next; })}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:border-white/20 transition-all"
                        title="90° Counter-Clockwise"
                      >
                        &#8634;90&deg; CCW
                      </button>
                      <button
                        onClick={() => setRotateAngle((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270)}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:border-white/20 transition-all"
                        title="90° Clockwise"
                      >
                        &#8635;90&deg; CW
                      </button>
                      <button
                        onClick={() => setFlipH((v) => !v)}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                          flipH
                            ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                            : 'border-border text-muted-foreground hover:border-white/20'
                        )}
                        title="Flip Horizontal"
                      >
                        &#8596; Flip H
                      </button>
                      <button
                        onClick={() => setFlipV((v) => !v)}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                          flipV
                            ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                            : 'border-border text-muted-foreground hover:border-white/20'
                        )}
                        title="Flip Vertical"
                      >
                        &#8597; Flip V
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current angle: {rotateAngle}&deg;{flipH ? ' · Flipped H' : ''}{flipV ? ' · Flipped V' : ''}
                  </p>
                </div>
              )}
            </div>

            {/* ── Mute Audio ───────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableMute(!enableMute)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableMute ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <VolumeX className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Mute Audio</p>
                  <p className="text-xs text-muted-foreground">Remove audio track from output</p>
                </div>
                <ToggleSwitch enabled={enableMute} />
              </button>
              {enableMute && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4">
                  <p className="text-xs text-muted-foreground">
                    Audio will be stripped from the output file. The video track is preserved.
                  </p>
                </div>
              )}
            </div>

            {/* ── Reverse Video ─────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableReverse(!enableReverse)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableReverse ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Rewind className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Reverse Video</p>
                  <p className="text-xs text-muted-foreground">Play video in reverse</p>
                </div>
                <ToggleSwitch enabled={enableReverse} />
              </button>
              {enableReverse && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4">
                  <p className="text-xs text-muted-foreground">
                    Video and audio will be reversed. Note: reversal requires full re-encode and may be slow for large files.
                  </p>
                </div>
              )}
            </div>

            {/* ── Watermark ────────────────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setEnableWatermark(!enableWatermark)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', enableWatermark ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Type className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Watermark</p>
                  <p className="text-xs text-muted-foreground">Overlay text on the video</p>
                </div>
                <ToggleSwitch enabled={enableWatermark} />
              </button>
              {enableWatermark && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4 space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Watermark Text</label>
                    <input
                      type="text"
                      placeholder="Enter watermark text..."
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Font Size</span>
                      <span>{watermarkFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={80}
                      step={1}
                      value={watermarkFontSize}
                      onChange={(e) => setWatermarkFontSize(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>12px</span>
                      <span>80px</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Text Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={watermarkColor}
                          onChange={(e) => setWatermarkColor(e.target.value)}
                          className="w-10 h-9 rounded-lg border border-border bg-white/5 cursor-pointer p-0.5"
                        />
                        <span className="text-sm text-muted-foreground font-mono">{watermarkColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Position</label>
                      <select
                        value={watermarkPosition}
                        onChange={(e) => setWatermarkPosition(e.target.value as WatermarkOptions['position'])}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      >
                        {WATERMARK_POSITIONS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Extract Audio (mode) ──────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setOperationMode(operationMode === 'extract-audio' ? 'video' : 'extract-audio')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', operationMode === 'extract-audio' ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <Music className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Extract Audio</p>
                  <p className="text-xs text-muted-foreground">Save audio track as MP3 or AAC</p>
                </div>
                <ToggleSwitch enabled={operationMode === 'extract-audio'} />
              </button>
              {operationMode === 'extract-audio' && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4 space-y-3">
                  <p className="text-xs text-amber-400/80">
                    Extract Audio mode is active. Other video operations will be ignored. The Process button will extract audio only.
                  </p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Audio Format</label>
                    <div className="flex gap-3">
                      {(['mp3', 'aac'] as const).map((fmt) => (
                        <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="audioFormat"
                            value={fmt}
                            checked={audioFormat === fmt}
                            onChange={() => setAudioFormat(fmt)}
                            className="accent-violet-500"
                          />
                          <span className="text-sm text-foreground uppercase">{fmt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Video to GIF (mode) ───────────────────────────────── */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setOperationMode(operationMode === 'gif' ? 'video' : 'gif')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', operationMode === 'gif' ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-muted-foreground')}>
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">Video to GIF</p>
                  <p className="text-xs text-muted-foreground">Convert video clip to animated GIF</p>
                </div>
                <ToggleSwitch enabled={operationMode === 'gif'} />
              </button>
              {operationMode === 'gif' && (
                <div className="border-t border-border/50 pt-4 pb-4 px-4 space-y-4">
                  <p className="text-xs text-amber-400/80">
                    GIF mode is active. Other video operations will be ignored. The Process button will generate a GIF.
                  </p>
                  {/* FPS */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Frame Rate</span>
                      <span>{gifFps} fps</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={gifFps}
                      onChange={(e) => setGifFps(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>5 fps</span>
                      <span>30 fps</span>
                    </div>
                  </div>
                  {/* Width */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Width</span>
                      <span>{gifWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min={240}
                      max={640}
                      step={10}
                      value={gifWidth}
                      onChange={(e) => setGifWidth(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>240px</span>
                      <span>640px</span>
                    </div>
                  </div>
                  {/* Optional start/duration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Start Time (s, optional)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="e.g. 2.5"
                        value={gifStart}
                        onChange={(e) => setGifStart(e.target.value)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Duration (s, optional)</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        placeholder="e.g. 5"
                        value={gifDuration}
                        onChange={(e) => setGifDuration(e.target.value)}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Error */}
          {(state === 'error' || (state === 'idle' && error)) && error && (
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
                  {state === 'loading-ffmpeg' ? 'Loading FFmpeg engine...' : `Processing... ${progress}%`}
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
              {processButtonLabel()}
            </button>
          )}
        </>
      )}
    </div>
  );
}
