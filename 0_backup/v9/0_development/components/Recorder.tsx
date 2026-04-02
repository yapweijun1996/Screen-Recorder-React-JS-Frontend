import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { Monitor, StopCircle, Disc, Mic, MicOff, Camera, CameraOff } from 'lucide-react';
import { StreamCompositor } from '../utils/StreamCompositor';

interface RecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onError: (msg: string) => void;
}

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  // Settings State
  const [enableMic, setEnableMic] = useState(false);
  const [enableCam, setEnableCam] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const compositorRef = useRef<StreamCompositor | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  // Streams
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  const startRecording = async () => {
    setIsPreparing(true);
    try {
      // 1. Get Screen Stream (Base)
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        },
        audio: true // System Audio
      });

      // 2. Get Optional Streams (Mic / Cam)
      let micStream: MediaStream | undefined;
      let camStream: MediaStream | undefined;

      if (enableMic) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (enableCam) {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 } });
      }

      // 3. Initialize Compositor
      const { width, height } = screenStream.getVideoTracks()[0].getSettings();
      const compositor = new StreamCompositor({
        width: width || 1920,
        height: height || 1080,
        frameRate: 30
      });

      const finalStream = await compositor.start(screenStream, camStream, micStream);
      compositorRef.current = compositor;
      setActiveStream(finalStream);

      // Handle "Stop Sharing" from browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        stopAction();
      };

      // 4. Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
        ? 'video/webm; codecs=vp9'
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(finalStream, { mimeType, videoBitsPerSecond: 5000000 }); // 5Mbps
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('[Recorder] Data available:', {
            chunkSize: event.data.size,
            totalChunks: chunksRef.current.length,
            totalSize: chunksRef.current.reduce((acc, c) => acc + c.size, 0)
          });
        }
      };

      mediaRecorder.onstop = () => {
        const endTime = Date.now();
        const durationInSeconds = (endTime - startTimeRef.current) / 1000;

        console.log('[Recorder] Recording stopped:', {
          chunks: chunksRef.current.length,
          totalSize: chunksRef.current.reduce((acc, c) => acc + c.size, 0),
          duration: durationInSeconds
        });

        const fullBlob = new Blob(chunksRef.current, { type: 'video/webm' });

        console.log('[Recorder] Blob created:', {
          size: fullBlob.size,
          type: fullBlob.type
        });

        // Cleanup
        compositor.stop();
        if (activeStream) {
          activeStream.getTracks().forEach(t => t.stop());
        }
        // Also ensure specific source streams are stopped if not part of activeStream primary tracking
        screenStream.getTracks().forEach(t => t.stop());
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        if (camStream) camStream.getTracks().forEach(t => t.stop());

        setIsRecording(false);
        setActiveStream(null);
        onRecordingComplete(fullBlob, durationInSeconds);
      };

      // 5. Start
      mediaRecorder.start(1000);
      startTimeRef.current = Date.now();
      setIsRecording(true);

    } catch (err: any) {
      console.error(err);
      onError(err.message || 'Failed to start recording');
    } finally {
      setIsPreparing(false);
    }
  };

  const stopAction = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // CRITICAL: Request any pending data before stopping
      // This ensures we don't lose the last chunk
      try {
        mediaRecorderRef.current.requestData();
      } catch (e) {
        console.warn('[Recorder] requestData failed:', e);
      }

      // Small delay to allow data to be processed
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          console.log('[Recorder] Stopping recorder, chunks collected:', chunksRef.current.length);
          mediaRecorderRef.current.stop();
        }
      }, 100);
    }
  }, []);

  // Update Preview
  useEffect(() => {
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream;
    }
  }, [activeStream]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (compositorRef.current) compositorRef.current.stop();
      if (activeStream) activeStream.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-6 animate-in fade-in zoom-in duration-300">

      {/* Main Preview / Control Area */}
      <div className="relative w-full max-w-5xl aspect-video bg-slate-950/50 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 backdrop-blur-sm group">

        {/* State: Not Recording (Setup) */}
        {!isRecording && !activeStream && (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="relative w-full rounded-[32px] border border-slate-800 bg-slate-950/80 px-8 pb-24 pt-12 shadow-[0_25px_75px_rgba(2,6,23,0.75)] backdrop-blur-lg">
              <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-950 opacity-90" />
              <div className="relative flex flex-col items-center gap-6">
                <div className="absolute -top-12 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_15px_30px_rgba(99,102,241,0.4)]">
                  <Monitor size={32} className="text-white drop-shadow-[0_0_15px_rgba(99,102,241,0.7)]" />
                </div>
                <p className="text-center text-lg font-semibold text-slate-100 mt-5">
                  Configure your sources below and start recording
                </p>
                <div className="mt-8 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setEnableMic(!enableMic)}
                    className={`flex flex-col items-start gap-2 rounded-2xl border px-6 py-5 transition ${enableMic
                      ? 'border-transparent bg-gradient-to-br from-indigo-600/40 to-violet-500/30 text-white shadow-[0_12px_35px_rgba(99,102,241,0.25)]'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                  >
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      {enableMic ? <Mic size={20} /> : <MicOff size={20} />}
                      <span>Microphone</span>
                    </div>
                    <span className="text-xs text-slate-400">{enableMic ? 'Recording mic' : 'Muted'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnableCam(!enableCam)}
                    className={`flex flex-col items-start gap-2 rounded-2xl border px-6 py-5 transition ${enableCam
                      ? 'border-transparent bg-gradient-to-br from-violet-600/40 to-indigo-500/30 text-white shadow-[0_12px_35px_rgba(147,51,234,0.25)]'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                  >
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      {enableCam ? <Camera size={20} /> : <CameraOff size={20} />}
                      <span>Camera</span>
                    </div>
                    <span className="text-xs text-slate-400">{enableCam ? 'Picture-in-picture' : 'Disabled'}</span>
                  </button>
                </div>
                <Button
                  onClick={startRecording}
                  disabled={isPreparing}
                  className="mt-2 w-full max-w-3xl rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 py-4 text-lg font-semibold text-white shadow-[0_25px_60px_rgba(99,102,241,0.45)] transition hover:shadow-[0_30px_80px_rgba(99,102,241,0.55)]"
                >
                  {isPreparing ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Initializing...
                    </span>
                  ) : (
                    <>
                      <Disc className="w-5 h-5" />
                      Start Recording
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Pro Tip: Select 'Entire Screen' to capture system audio.
            </p>
          </div>
        )}

        {/* State: Recording (Preview) */}
        {(isRecording || activeStream) && (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted // Mute preview to avoid feedback loop
              playsInline
              className="w-full h-full object-contain bg-black"
            />

            {/* Overlay Status */}
            <div className="absolute top-6 right-6 flex items-center gap-3">
              <div className="flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border border-red-500/30 backdrop-blur-md shadow-lg">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_#ef4444]" />
                <span className="text-red-50 text-sm font-mono font-bold tracking-wider">REC</span>
              </div>
            </div>

            {/* Floating Controls Overlay */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex items-center gap-2 shadow-2xl transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <Button variant="danger" onClick={stopAction} className="px-6">
                <StopCircle className="w-5 h-5 mr-2" />
                Stop Recording
              </Button>
              {/* Future: Add Pause/Mute buttons here */}
            </div>
          </>
        )}
      </div>

      <p className="mt-8 text-slate-500 text-sm font-medium">
        {isRecording
          ? "Recording in progress. Click Stop to finish."
          : "Pro Tip: Select 'Entire Screen' to capture system audio."}
      </p>
    </div>
  );
};
