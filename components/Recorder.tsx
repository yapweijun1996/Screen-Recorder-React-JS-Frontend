import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { Monitor, StopCircle, Disc } from 'lucide-react';

interface RecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onError: (msg: string) => void;
}

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  // Cleanup function for stream tracks
  const stopStreamTracks = (stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const startRecording = async () => {
    try {
      // 1. Get Screen Stream
      // audio: true attempts to capture system audio (depends on OS/Browser)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true 
      });

      setPreviewStream(stream);
      
      // Handle user clicking "Stop sharing" native browser button
      stream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      // 2. Setup MediaRecorder
      // Prefer standard mime types
      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
        ? 'video/webm; codecs=vp9' 
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const endTime = Date.now();
        const durationInSeconds = (endTime - startTimeRef.current) / 1000;
        
        const fullBlob = new Blob(chunksRef.current, { type: 'video/webm' });
        stopStreamTracks(stream);
        setPreviewStream(null);
        setIsRecording(false);
        onRecordingComplete(fullBlob, durationInSeconds);
      };

      // 3. Start
      mediaRecorder.start(1000); // Collect 1s chunks
      startTimeRef.current = Date.now();
      setIsRecording(true);

    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError') {
        onError('Permission denied. You must allow screen access to record.');
      } else {
        onError(`Could not start recording: ${err.message}`);
      }
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Keep a ref of the active preview stream for cleanup
  useEffect(() => {
    previewStreamRef.current = previewStream;
  }, [previewStream]);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && previewStream) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Cleanup on unmount to stop recording and release tracks
  useEffect(() => {
    return () => {
      stopRecording();
      stopStreamTracks(previewStreamRef.current);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stopRecording]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-6 animate-fade-in">
      
      {/* Live Preview Window */}
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
        {!isRecording ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <Monitor size={64} className="mb-4 opacity-50" />
            <p className="text-xl font-light">Ready to capture your screen</p>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-contain" 
            />
            {/* Overlay Indicator */}
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/70 px-3 py-1 rounded-full border border-red-500/30 backdrop-blur-sm">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-50 text-xs font-mono uppercase tracking-wider">Recording</span>
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="mt-8 flex gap-4">
        {!isRecording ? (
          <Button onClick={startRecording} className="w-48 h-14 text-lg">
            <Disc className="w-6 h-6 fill-current" />
            Start Recording
          </Button>
        ) : (
          <Button onClick={stopRecording} variant="danger" className="w-48 h-14 text-lg animate-pulse">
            <StopCircle className="w-6 h-6 fill-current" />
            Stop Recording
          </Button>
        )}
      </div>
      
      <p className="mt-4 text-slate-500 text-sm">
        {isRecording 
          ? "Click 'Stop' or use the browser's floating control to finish." 
          : "Select a window, tab, or entire screen to begin."}
      </p>
    </div>
  );
};
