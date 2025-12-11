import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { AudioLevelMeter } from './AudioLevelMeter';
import { Monitor, StopCircle, Disc, Mic, MicOff, Camera, CameraOff, Pause, Play, GripVertical, Gauge } from 'lucide-react';
import { StreamCompositor } from '../utils/StreamCompositor';
import { PIPPosition, RecordingQuality, RECORDING_PRESETS } from '../types';

interface RecorderProps {
    onRecordingComplete: (blob: Blob, duration: number) => void;
    onError: (msg: string) => void;
}

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onError }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Settings State
    const [enableMic, setEnableMic] = useState(false);
    const [enableCam, setEnableCam] = useState(false);
    const [pipPosition, setPipPosition] = useState<PIPPosition>('bottom-right');
    const [recordingQuality, setRecordingQuality] = useState<RecordingQuality>('high');

    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const compositorRef = useRef<StreamCompositor | null>(null);
    const audioMixRef = useRef<{ context: AudioContext; destination: MediaStreamAudioDestinationNode } | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const hasFinalizedRef = useRef(false);
    const startTimeRef = useRef<number>(0);
    const pausedTimeRef = useRef<number>(0);
    const pauseStartedRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Streams
    const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
    const [micStream, setMicStream] = useState<MediaStream | null>(null);

    // Recording timer
    useEffect(() => {
        if (isRecording && !isPaused) {
            timerRef.current = setInterval(() => {
                const paused = pauseStartedRef.current ? (Date.now() - pauseStartedRef.current) : 0;
                const elapsed = (Date.now() - startTimeRef.current - pausedTimeRef.current - paused) / 1000;
                setRecordingTime(Math.max(elapsed, 0));
            }, 200);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isRecording, isPaused]);

    const formatRecordingTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const cleanupAudioMix = () => {
        if (audioMixRef.current) {
            const { context } = audioMixRef.current;
            if (context.state !== 'closed') {
                context.close().catch(() => undefined);
            }
            audioMixRef.current = null;
        }
    };

    const startRecording = async () => {
        setIsPreparing(true);
        try {
            // 1. Get Screen Stream (Base)
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 2560, max: 3840 },
                    height: { ideal: 1440, max: 2160 },
                    frameRate: { ideal: 60, max: 60 }
                },
                audio: true // System Audio
            });

            // 2. Get Optional Streams (Mic / Cam)
            let micStreamLocal: MediaStream | undefined;
            let camStream: MediaStream | undefined;

            if (enableMic) {
                micStreamLocal = await navigator.mediaDevices.getUserMedia({ audio: true });
                setMicStream(micStreamLocal);
            }

            if (enableCam) {
                camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 } });
            }

            // 3. Build final stream
            let finalStream: MediaStream;

            if (enableCam) {
                // Full compositor path when camera is enabled (PIP + audio mix)
                const { width, height } = screenStream.getVideoTracks()[0].getSettings();
                const compositor = new StreamCompositor({
                    width: width || 1920,
                    height: height || 1080,
                    frameRate: 30,
                    pipConfig: {
                        position: pipPosition,
                        size: 0.2
                    }
                });

                finalStream = await compositor.start(screenStream, camStream, micStreamLocal);
                compositorRef.current = compositor;
            } else {
                // No camera: use raw screen video and only mix audio when there is an actual audio source.
                const screenAudioTracks = screenStream.getAudioTracks();
                const hasScreenAudio = screenAudioTracks.length > 0;
                const hasMicAudio = !!(micStreamLocal && micStreamLocal.getAudioTracks().length);
                const hasAnyAudio = hasScreenAudio || hasMicAudio;

                let audioTracks: MediaStreamTrack[] = [];

                if (hasAnyAudio) {
                    const audioContext = new AudioContext();
                    const destination = audioContext.createMediaStreamDestination();

                    if (hasScreenAudio) {
                        const screenSource = audioContext.createMediaStreamSource(screenStream);
                        screenSource.connect(destination);
                    }

                    if (hasMicAudio && micStreamLocal) {
                        const micSource = audioContext.createMediaStreamSource(micStreamLocal);
                        micSource.connect(destination);
                    }

                    audioMixRef.current = { context: audioContext, destination };
                    audioTracks = destination.stream.getAudioTracks();
                }

                finalStream = new MediaStream([
                    ...screenStream.getVideoTracks(),
                    ...audioTracks
                ]);
            }

            setActiveStream(finalStream);

            // Handle "Stop Sharing" from browser UI
            screenStream.getVideoTracks()[0].onended = () => {
                stopAction();
            };

            // 4. Setup MediaRecorder with quality settings
            const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? 'video/webm; codecs=vp9'
                : 'video/webm';

            const qualityConfig = RECORDING_PRESETS[recordingQuality];
            const mediaRecorder = new MediaRecorder(finalStream, {
                mimeType,
                videoBitsPerSecond: qualityConfig.videoBitsPerSecond
            });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            hasFinalizedRef.current = false;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            const finalizeRecording = () => {
                if (hasFinalizedRef.current) return;
                hasFinalizedRef.current = true;

                const endTime = Date.now();
                if (pauseStartedRef.current) {
                    pausedTimeRef.current += endTime - pauseStartedRef.current;
                }
                const durationInSeconds = Math.max(
                    (endTime - startTimeRef.current - pausedTimeRef.current) / 1000,
                    recordingTime,
                    0
                );

                const fullBlob = new Blob(chunksRef.current, { type: 'video/webm' });

                if (!fullBlob.size) {
                    setIsRecording(false);
                    setIsPaused(false);
                    setActiveStream(null);
                    setMicStream(null);
                    setRecordingTime(0);
                    onError('Recording appears to be empty. Please keep the capture running for a moment before stopping.');
                    return;
                }

                // Cleanup
                if (compositorRef.current) {
                    compositorRef.current.stop();
                } else {
                    cleanupAudioMix();
                }
                if (activeStream) {
                    activeStream.getTracks().forEach(t => t.stop());
                }
                screenStream.getTracks().forEach(t => t.stop());
                if (micStreamLocal) micStreamLocal.getTracks().forEach(t => t.stop());
                if (camStream) camStream.getTracks().forEach(t => t.stop());

                setIsRecording(false);
                setIsPaused(false);
                setActiveStream(null);
                setMicStream(null);
                setRecordingTime(0);
                onRecordingComplete(fullBlob, durationInSeconds);
            };

            mediaRecorder.onstop = () => {
                // Give the final dataavailable a tick to arrive before finalizing
                setTimeout(finalizeRecording, 50);
            };

            // 5. Start
            mediaRecorder.start(1000);
            startTimeRef.current = Date.now();
            pausedTimeRef.current = 0;
            pauseStartedRef.current = null;
            setIsRecording(true);

        } catch (err: any) {
            console.error(err);
            if (err.name === 'NotAllowedError') {
                onError('Permission denied. Please allow screen sharing to record.');
            } else {
                onError(err.message || 'Failed to start recording');
            }
        } finally {
            setIsPreparing(false);
        }
    };

    const stopAction = useCallback(() => {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state !== 'inactive') {
            try {
                mr.requestData();
            } catch {
                // Some browsers may throw if called in an invalid state; ignore.
            }
            mr.stop();
        }
    }, []);

    const pauseResume = useCallback(() => {
        if (!mediaRecorderRef.current) return;

        if (isPaused) {
            // Resume
            mediaRecorderRef.current.resume();
            if (compositorRef.current) {
                compositorRef.current.resume();
            }
            if (pauseStartedRef.current) {
                pausedTimeRef.current += Date.now() - pauseStartedRef.current;
            }
            pauseStartedRef.current = null;
            setIsPaused(false);
        } else {
            // Pause
            mediaRecorderRef.current.pause();
            if (compositorRef.current) {
                compositorRef.current.pause();
            }
            pauseStartedRef.current = Date.now();
            setIsPaused(true);
        }
    }, [isPaused]);

    // Cycle through PIP positions
    const cyclePIPPosition = () => {
        const positions: PIPPosition[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
        const currentIndex = positions.indexOf(pipPosition);
        const nextIndex = (currentIndex + 1) % positions.length;
        const newPosition = positions[nextIndex];
        setPipPosition(newPosition);

        if (compositorRef.current) {
            compositorRef.current.setPIPPresetPosition(newPosition);
        }
    };

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
            cleanupAudioMix();
            if (activeStream) activeStream.getTracks().forEach(t => t.stop());
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center w-full h-full p-6 animate-in fade-in zoom-in duration-300">

            {/* Main Preview / Control Area */}
            <div className="relative w-full max-w-5xl aspect-video bg-slate-950/50 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 backdrop-blur-sm group">

                {/* State: Not Recording (Setup) */}
                {!isRecording && !activeStream && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">

                        {/* Hero Icon */}
                        <div className="mb-8 p-6 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full ring-1 ring-white/10">
                            <Monitor size={64} className="text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                        </div>

                        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-2">
                            Ready to Capture
                        </h2>
                        <p className="text-slate-500 mb-12">Configure your sources below and start recording</p>

                        {/* Quick Settings Toggles */}
                        <div className="flex gap-6 mb-12">
                            {/* Mic Toggle */}
                            <button
                                onClick={() => setEnableMic(!enableMic)}
                                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all duration-300 w-32 ${enableMic
                                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-[0_0_20px_rgba(79,70,229,0.2)]'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-800 hover:border-slate-600'
                                    }`}
                            >
                                {enableMic ? <Mic size={24} /> : <MicOff size={24} />}
                                <span className="text-sm font-medium">Microphone</span>
                            </button>

                            {/* Cam Toggle */}
                            <button
                                onClick={() => setEnableCam(!enableCam)}
                                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all duration-300 w-32 ${enableCam
                                    ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-[0_0_20px_rgba(147,51,234,0.2)]'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-800 hover:border-slate-600'
                                    }`}
                            >
                                {enableCam ? <Camera size={24} /> : <CameraOff size={24} />}
                                <span className="text-sm font-medium">Camera</span>
                            </button>
                        </div>

                        {/* Recording Quality Selector */}
                        <div className="mb-6 flex items-center gap-3">
                            <Gauge size={16} className="text-emerald-400" />
                            <span className="text-slate-400 text-sm">Quality:</span>
                            <div className="flex gap-1">
                                {(['standard', 'high', 'ultra'] as RecordingQuality[]).map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => setRecordingQuality(q)}
                                        className={`px-3 py-1.5 rounded-lg border text-sm capitalize transition-all ${recordingQuality === q
                                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* PIP Position Selector (only show when cam enabled) */}
                        {enableCam && (
                            <div className="mb-8 flex items-center gap-3">
                                <span className="text-slate-400 text-sm">Camera Position:</span>
                                <button
                                    onClick={cyclePIPPosition}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
                                >
                                    <GripVertical size={14} />
                                    <span className="text-sm capitalize">{pipPosition.replace('-', ' ')}</span>
                                </button>
                            </div>
                        )}

                        {/* Start Button */}
                        <Button
                            onClick={startRecording}
                            disabled={isPreparing}
                            size="lg"
                            className="w-64 h-16 text-xl shadow-[0_0_30px_rgba(79,70,229,0.4)] hover:shadow-[0_0_50px_rgba(79,70,229,0.6)] transition-all transform hover:scale-105"
                        >
                            {isPreparing ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Initializing...
                                </span>
                            ) : (
                                <>
                                    <Disc className="w-6 h-6 fill-current mr-2" />
                                    Start Recording
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* State: Recording (Preview) */}
                {(isRecording || activeStream) && (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className={`w-full h-full object-contain bg-black ${isPaused ? 'opacity-50' : ''}`}
                        />

                        {/* Overlay Status */}
                        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                            {/* Recording Indicator */}
                            <div className="flex items-center gap-3">
                                <div className={`flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border ${isPaused ? 'border-amber-500/30' : 'border-red-500/30'} backdrop-blur-md shadow-lg`}>
                                    <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]'}`} />
                                    <span className={`text-sm font-mono font-bold tracking-wider ${isPaused ? 'text-amber-50' : 'text-red-50'}`}>
                                        {isPaused ? 'PAUSED' : 'REC'}
                                    </span>
                                </div>

                                {/* Timer */}
                                <div className="bg-black/80 px-4 py-2 rounded-full backdrop-blur-md border border-slate-700">
                                    <span className="text-white font-mono text-lg">{formatRecordingTime(recordingTime)}</span>
                                </div>
                            </div>

                            {/* Audio Level (if mic enabled) */}
                            {micStream && (
                                <div className="flex items-center gap-2 bg-black/80 px-3 py-2 rounded-full backdrop-blur-md border border-slate-700">
                                    <Mic size={14} className="text-indigo-400" />
                                    <AudioLevelMeter stream={micStream} />
                                </div>
                            )}
                        </div>

                        {/* Floating Controls Overlay */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex items-center gap-2 shadow-2xl transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">

                            {/* Pause/Resume Button */}
                            <Button
                                variant={isPaused ? 'success' : 'warning'}
                                onClick={pauseResume}
                                className="px-4"
                            >
                                {isPaused ? <Play size={18} /> : <Pause size={18} />}
                                {isPaused ? 'Resume' : 'Pause'}
                            </Button>

                            {/* PIP Position (if camera enabled) */}
                            {enableCam && (
                                <Button
                                    variant="secondary"
                                    onClick={cyclePIPPosition}
                                    className="px-3"
                                    title="Change camera position"
                                >
                                    <GripVertical size={18} />
                                </Button>
                            )}

                            {/* Stop Button */}
                            <Button variant="danger" onClick={stopAction} className="px-6">
                                <StopCircle className="w-5 h-5 mr-2" />
                                Stop Recording
                            </Button>
                        </div>
                    </>
                )}
            </div>

            <p className="mt-8 text-slate-500 text-sm font-medium">
                {isRecording
                    ? isPaused
                        ? "Recording paused. Click Resume to continue."
                        : "Recording in progress. Hover to see controls."
                    : "Pro Tip: Select 'Entire Screen' to capture system audio."}
            </p>
        </div>
    );
};
