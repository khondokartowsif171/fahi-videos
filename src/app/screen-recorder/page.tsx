import ScreenRecorder from '@/components/screen-recorder/ScreenRecorder';

export const metadata = { title: 'Screen Recorder – Fahi' };

export default function Page() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Screen Recorder</h1>
      <ScreenRecorder />
    </main>
  );
}
