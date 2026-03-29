import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type AudioPlayerHandle = {
  togglePlay: () => void;
  restart: () => void;
};

type AudioPlayerProps = {
  audioPath: string;
  durationHint: number | null;
  playable: boolean;
};

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  { audioPath, durationHint, playable },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationHint ?? 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(durationHint ?? 0);
    setIsPlaying(false);
    setError(null);

    let cancelled = false;
    void window.desktop
      .toFileUrl(audioPath)
      .then((url) => {
        if (!cancelled) {
          setAudioUrl(url);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to read local audio file.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioPath, durationHint]);

  useImperativeHandle(ref, () => ({
    togglePlay: () => {
      if (!playable) {
        return;
      }

      if (audioRef.current?.paused) {
        void audioRef.current.play();
      } else {
        audioRef.current?.pause();
      }
    },
    restart: () => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      }
    }
  }));

  function handleSeek(value: number) {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  }

  function handleTogglePlay() {
    if (!playable) {
      return;
    }

    if (audioRef.current?.paused) {
      void audioRef.current.play();
      return;
    }

    audioRef.current?.pause();
  }

  return (
    <div className="audio-panel">
      <audio
        ref={audioRef}
        src={audioUrl}
        loop={isLooping}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? durationHint ?? 0)}
        onError={() => setError('This file could not be played by the embedded audio engine.')}
      />

      <div className="audio-actions">
        <button type="button" className="primary-button" onClick={handleTogglePlay} disabled={!playable}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="secondary-button" onClick={() => handleSeek(0)} disabled={!playable}>
          Restart
        </button>
        <button
          type="button"
          className={`ghost-button ${isLooping ? 'active' : ''}`}
          onClick={() => setIsLooping((current) => !current)}
          disabled={!playable}
        >
          Loop
        </button>
      </div>

      <div className="audio-timeline">
        <span>{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => handleSeek(Number(event.target.value))}
          disabled={!playable}
        />
        <span>{formatTime(duration)}</span>
      </div>

      {!playable ? (
        <div className="callout warning">
          This file extension is not in the recommended supported list. You can still inspect metadata, but playback may
          fail.
        </div>
      ) : null}

      {error ? <div className="callout warning">{error}</div> : null}
    </div>
  );
});

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const safe = Math.floor(seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}
