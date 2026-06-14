import YoutubeDownloader from '@/components/downloader/YoutubeDownloader';
import { Download } from 'lucide-react';

export const metadata = {
  title: 'YouTube Downloader — Fahi Video',
  description: 'Download YouTube videos free in any quality. No signup required.',
};

export default function DownloaderPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 shadow-xl mb-4">
          <Download className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">YouTube Downloader</h1>
        <p className="text-muted-foreground">
          Download videos in HD quality. Free, fast, no account required.
        </p>
      </div>
      <YoutubeDownloader />
    </div>
  );
}
