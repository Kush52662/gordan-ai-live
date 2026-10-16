import { useStartAudio } from '@livekit/components-react';

export function StartAudioButton({ label }: { label: string }) {
  const { mergedProps } = useStartAudio({ props: {} });
  return (
    <button
      {...mergedProps}
      className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black px-5 py-3 text-white"
    >
      {label}
    </button>
  );
}
