import React from 'react';
import { Button } from '../Button';
import { AudioLevelMeter } from '../AudioLevelMeter';
import { Monitor, StopCircle, Mic, Pause, Play, GripVertical } from 'lucide-react';

interface RecorderPreviewProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;

    isRecording: boolean;
    isPaused: boolean;
    recordingTimeLabel: string;

    activeStream: MediaStream | null;
    micStream: MediaStream | null;

    enableCam: boolean;

    onPauseResume: () => void;
    onStop: () => void;
    onCyclePipPosition: () => void;
}

export const RecorderPreview: React.FC<RecorderPreviewProps> = ({
    videoRef,
    isRecording,
    isPaused,
    recordingTimeLabel,
    activeStream,
    micStream,
    enableCam,
    onPauseResume,
    onStop,
    onCyclePipPosition,
}) => {
    return (
        <section className="lg:col-span-8 xl:col-span-9">
            <div className="relative w-full aspect-video bg-slate-950/60 rounded-2xl overflow-hidden shadow-2xl border border-slate-800/70 backdrop-blur-sm">
                {/* Setup Placeholder */}
                {!isRecording && !activeStream && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                        <div className="mb-6 p-6 bg-gradient-to-br from-indigo-500/10 via-slate-900/60 to-purple-500/10 rounded-full ring-1 ring-white/10 shadow-2xl">
                            <Monitor size={64} className="text-indigo-300 drop-shadow-[0_0_20px_rgba(99,102,241,0.55)]" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Ready to Capture</h2>
                        <p className="text-slate-400 max-w-xl text-sm sm:text-base">
                            Pick your sources and quality on the left, then start recording.
                        </p>

                        <div className="mt-6 inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-full px-3 py-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            Controls will appear here during recording
                        </div>
                    </div>
                )}

                {/* Recording Preview */}
                {(isRecording || activeStream) && (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className={`w-full h-full object-contain bg-black ${isPaused ? 'opacity-50' : ''}`}
                        />

                        {/* Top Status */}
                        <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className={`flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded-full border ${isPaused ? 'border-amber-500/30' : 'border-red-500/30'} backdrop-blur-md shadow-lg`}>
                                    <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]'}`} />
                                    <span className={`text-xs font-mono font-bold tracking-wider ${isPaused ? 'text-amber-50' : 'text-red-50'}`}>
                                        {isPaused ? 'PAUSED' : 'REC'}
                                    </span>
                                </div>

                                <div className="bg-black/70 px-3 py-1.5 rounded-full backdrop-blur-md border border-slate-700">
                                    <span className="text-white font-mono text-base">{recordingTimeLabel}</span>
                                </div>
                            </div>

                            {micStream && (
                                <div className="flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded-full backdrop-blur-md border border-slate-700">
                                    <Mic size={14} className="text-indigo-300" />
                                    <AudioLevelMeter stream={micStream} />
                                </div>
                            )}
                        </div>

                        {/* Bottom Controls (always visible) */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                            <div className="mx-auto w-full max-w-3xl bg-slate-900/85 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex items-center justify-between gap-2 shadow-2xl">
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={isPaused ? 'success' : 'warning'}
                                        onClick={onPauseResume}
                                        className="px-4"
                                    >
                                        {isPaused ? <Play size={18} /> : <Pause size={18} />}
                                        {isPaused ? 'Resume' : 'Pause'}
                                    </Button>

                                    {enableCam && (
                                        <Button
                                            variant="secondary"
                                            onClick={onCyclePipPosition}
                                            className="px-3"
                                            title="Change camera position"
                                        >
                                            <GripVertical size={18} />
                                        </Button>
                                    )}
                                </div>

                                <Button variant="danger" onClick={onStop} className="px-6">
                                    <StopCircle className="w-5 h-5 mr-2" />
                                    Stop
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <p className="mt-4 text-slate-500 text-xs sm:text-sm font-medium">
                {isRecording
                    ? isPaused
                        ? "Recording paused. Click Resume to continue."
                        : "Recording in progress."
                    : "Pro Tip: Select 'Entire Screen' to capture system audio."}
            </p>
        </section>
    );
};