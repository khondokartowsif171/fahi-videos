import Link from 'next/link';
import {
  Download,
  Video,
  ImageIcon,
  CheckCircle2,
  Zap,
  Shield,
  Infinity,
  Film,
  Monitor,
  FileImage,
  Music,
} from 'lucide-react';

const features = [
  {
    href: '/downloader',
    icon: Download,
    title: 'YouTube Downloader',
    description:
      'Paste any YouTube URL and download in your preferred quality — 1080p, 720p, 360p, or audio only. No login needed.',
    color: 'from-red-500 to-orange-500',
    badge: 'Free',
  },
  {
    href: '/video-editor',
    icon: Video,
    title: 'Video Editor',
    description:
      'Trim, resize, compress, add filters, speed control, rotate, watermark, reverse and more — all in the browser.',
    color: 'from-violet-500 to-purple-600',
    badge: 'In Browser',
  },
  {
    href: '/image-editor',
    icon: ImageIcon,
    title: 'Image Editor',
    description:
      'Crop, resize, rotate, apply filters, add text, remove background, and export as PNG, JPG, or WebP.',
    color: 'from-cyan-500 to-blue-600',
    badge: 'Instant',
  },
  {
    href: '/gif-maker',
    icon: Film,
    title: 'GIF Maker',
    description:
      'Convert any video clip to an animated GIF. Control FPS, quality, and size — no server uploads.',
    color: 'from-pink-500 to-rose-600',
    badge: 'New',
  },
  {
    href: '/screen-recorder',
    icon: Monitor,
    title: 'Screen Recorder',
    description:
      'Record your screen, window, or tab directly in the browser. Save as WebM video instantly.',
    color: 'from-green-500 to-emerald-600',
    badge: 'New',
  },
  {
    href: '/image-compressor',
    icon: FileImage,
    title: 'Image Compressor',
    description:
      'Batch compress images with a quality slider. Download individually or as a ZIP — no size limits.',
    color: 'from-amber-500 to-yellow-600',
    badge: 'New',
  },
  {
    href: '/video-to-mp3',
    icon: Music,
    title: 'Video to MP3',
    description:
      'Extract audio from any video file. Download as MP3 or AAC — powered by FFmpeg in your browser.',
    color: 'from-sky-500 to-indigo-600',
    badge: 'New',
  },
];

const perks = [
  { icon: Zap, text: 'Fast & lightweight' },
  { icon: Shield, text: '100% private — files stay on your device' },
  { icon: Infinity, text: 'No limits, no watermarks' },
  { icon: CheckCircle2, text: 'Works on any browser' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-hero-gradient">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 text-sm font-medium mb-6">
          <Zap className="w-3.5 h-3.5" />
          Free · No account required · 7 tools
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6">
          <span className="text-violet-400">Fahi</span> Video
          <br />
          <span className="text-2xl sm:text-4xl text-muted-foreground font-medium">
            Downloader & Editing Suite
          </span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
          Download YouTube videos, edit videos &amp; images — all for free, right in your browser.
          No signup. No watermarks. Nothing to install.
        </p>

        {/* Perks */}
        <div className="flex flex-wrap justify-center gap-4 mb-16">
          {perks.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="w-4 h-4 text-violet-400" />
              {text}
            </div>
          ))}
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {features.map(({ href, icon: Icon, title, description, color, badge }) => (
            <Link
              key={href}
              href={href}
              className="group relative glass rounded-2xl p-6 text-left hover:border-violet-500/30 transition-all hover:-translate-y-1 hover:glow"
            >
              <div className="absolute top-4 right-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                  {badge}
                </span>
              </div>
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              <div className="mt-4 text-violet-400 text-sm font-medium group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Get started →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
