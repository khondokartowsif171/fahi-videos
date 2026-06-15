import VideoToMp3 from '@/components/video-to-mp3/VideoToMp3';

export const metadata = { title: 'Video to MP3 – Fahi' };

export default function Page() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Video to MP3</h1>
      <VideoToMp3 />
    </main>
  );
}
