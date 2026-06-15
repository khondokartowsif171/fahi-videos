'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor, Square, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type AppState = 'idle' | 'recording' | 'done' | 'error';

export default function ScreenRecorder() {
  const [state, setState] = useState<AppState>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Your browser does not support screen recording (getDisplayMedia is not available).');
      setState('error');
      return;
    }

    setError('');
    setResultBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;

      // Detect best supported mimeType
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
        (t) => MediaRecorder.isTypeSupported(t)
      ) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setResultBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState('done');
        if (timerRef.current) clearInterval(timerRef.current);
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      });

      recorder.start(1000);
      setState('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start screen recording.';
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        setError('Screen recording permission was denied. Please allow access and try again.');
      } else if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')) {
        // User cancelled the picker — silently return to idle
        setState('idle');
        return;
      } else {
        setError(msg);
      }
      setState('error');
    }
  }, [isSupported, previewUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [resultBlob]);

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setResultBlob(null);
    setElapsed(0);
    setError('');
    setState('idle');
  }, [previewUrl]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Browser support warning */}
      {!isSupported && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">
            Your browser does not support screen recording. Please use a modern desktop browser such
            as Chrome, Edge, or Firefox.
          </p>
        </div>
      )}

      {/* Idle state */}
      {state === 'idle' && isSupported && (
        <div className="glass rounded-2xl p-10 flex flex-col items-center justify-center gap-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-violet-600/20 flex items-center justify-center">
            <Monitor className="w-10 h-10 text-violet-400" />
          </div>
          <div>
            <p className="text-foreground font-semibold text-lg">Ready to Record</p>
            <p className="text-muted-foreground text-sm mt-1">
              Records screen + system audio (if supported by browser)
            </p>
          </div>
          <button
            onClick={startRecording}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-8 py-3 rounded-xl font-medium transition-all text-base"
          >
            <Monitor className="w-5 h-5" />
            Start Recording
          </button>
          <p className="text-xs text-muted-foreground max-w-sm">
            A browser permission dialog will appear asking which screen, window, or tab to share.
          </p>
        </div>
      )}

      {/* Recording state */}
      {state === 'recording' && (
        <div className="glass rounded-2xl p-10 flex flex-col items-center justify-center gap-6 text-center">
          <div className="relative w-20 h-20 rounded-2xl bg-red-600/20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-red-500/20 animate-ping" />
            <div className="w-5 h-5 rounded-full bg-red-500" />
          </div>
          <div>
            <p className="text-foreground font-semibold text-lg">Recording...</p>
            <p className="text-violet-400 font-mono text-2xl font-bold mt-1">
              {formatDuration(elapsed)}
            </p>
          </div>
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-xl font-medium transition-all"
          >
            <Square className="w-5 h-5 fill-current" />
            Stop Recording
          </button>
          <p className="text-xs text-muted-foreground">
            Click &ldquo;Stop sharing&rdquo; in the browser bar or the button above to finish.
          </p>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4 border border-red-500/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
          <button
            onClick={handleReset}
            className="w-full py-3 rounded-xl font-medium border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Done state */}
      {state === 'done' && resultBlob && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4 border border-green-500/30 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-foreground font-medium">Recording complete!</p>
              <p className="text-sm text-muted-foreground">
                {formatDuration(elapsed)} &middot; {(resultBlob.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className="glass rounded-2xl overflow-hidden">
              <video
                ref={videoRef}
                src={previewUrl}
                controls
                className="w-full rounded-2xl"
                style={{ maxHeight: '360px', background: '#000' }}
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Download .webm
            </button>
            <button
              onClick={handleReset}
              className="px-5 py-2.5 rounded-xl font-medium border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
            >
              Record Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
