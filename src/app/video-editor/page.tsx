import VideoEditor from '@/components/video-editor/VideoEditor';
import { Video } from 'lucide-react';

export const metadata = {
  title: 'Video Editor — Fahi Video',
  description: 'Trim, resize and compress videos free in your browser. No uploads, 100% private.',
};

export default function VideoEditorPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl mb-4">
          <Video className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Video Editor</h1>
        <p className="text-muted-foreground">
          Trim, resize, and compress videos — all in your browser. No server uploads.
        </p>
      </div>
      <VideoEditor />
    </div>
  );
}
