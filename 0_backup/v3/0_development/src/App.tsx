import React, { useState, useEffect } from 'react';
import { AppStatus, VideoMetadata } from './types';
import { Recorder } from './components/Recorder';
import { Editor } from './components/Editor';
import { FFmpegStatus } from './components/FFmpegStatus';
import { Layers, Loader2 } from 'lucide-react';
import { ffmpegService } from './services/ffmpegService';

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
    const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleRecordingComplete = async (blob: Blob, recordedDuration: number) => {
        if (!blob || blob.size === 0) {
            setErrorMsg('The recording is empty. Please try capturing again and let it run for a few seconds.');
            setStatus(AppStatus.IDLE);
            return;
        }

        setStatus(AppStatus.PROCESSING);
        setErrorMsg(null);

        let workingBlob = blob;

        // Try to sanitize duration metadata; fall back to raw blob if ffmpeg fails
        if (blob.size > 0) {
            try {
                workingBlob = await ffmpegService.fixWebmDuration(blob, recordedDuration);
            } catch (error) {
                console.warn('FFmpeg failed to fix WebM duration, falling back to raw blob.', error);
            }
        }

        try {
            const url = URL.createObjectURL(workingBlob);

            // Create a temporary video element to check if browser can detect duration
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.src = url;

            const finalize = (duration: number) => {
                if (!Number.isFinite(duration) || duration <= 0) {
                    throw new Error('Invalid recording duration detected.');
                }
                setVideoData({
                    blob: workingBlob,
                    url,
                    duration
                });
                setStatus(AppStatus.REVIEWING);
            };

            tempVideo.onloadedmetadata = () => {
                try {
                    const d = tempVideo.duration;
                    const finalDuration = (Number.isFinite(d) && d > 0) ? d : recordedDuration;
                    finalize(finalDuration);
                } catch (err) {
                    console.error(err);
                    setErrorMsg('Recording looks invalid. Please try capturing again.');
                    setStatus(AppStatus.IDLE);
                }
            };

            // Fallback if metadata fails entirely
            tempVideo.onerror = () => {
                try {
                    finalize(recordedDuration);
                } catch (err) {
                    console.error(err);
                    setErrorMsg('Recording looks invalid. Please try capturing again.');
                    setStatus(AppStatus.IDLE);
                }
            };
        } catch (error) {
            console.error('Failed to finalize recording:', error);
            setErrorMsg('Failed to finish processing the recording. Please try again.');
            setStatus(AppStatus.IDLE);
        }
    };

    const handleReset = () => {
        if (videoData) {
            URL.revokeObjectURL(videoData.url);
        }
        setVideoData(null);
        setStatus(AppStatus.IDLE);
        setErrorMsg(null);
    };

    const handleError = (msg: string) => {
        setErrorMsg(msg);
    };

    // Auto-dismiss error after 5 seconds
    useEffect(() => {
        if (errorMsg) {
            const timer = setTimeout(() => setErrorMsg(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMsg]);

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
            {/* Header */}
            <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
                            <Layers size={24} className="text-white" />
                        </div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            ScreenClip Pro
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <FFmpegStatus />
                        <div className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                            Client-side MP4 Export
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8 flex-1 flex flex-col min-h-[calc(100vh-64px)]">

                {errorMsg && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 flex items-center justify-between animate-fade-in">
                        <span>{errorMsg}</span>
                        <button onClick={() => setErrorMsg(null)} className="hover:text-white text-xl">&times;</button>
                    </div>
                )}

                <div className="flex-1 flex flex-col">
                    {status === AppStatus.IDLE && (
                        <Recorder
                            onRecordingComplete={handleRecordingComplete}
                            onError={handleError}
                        />
                    )}

                    {status === AppStatus.PROCESSING && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300">
                            <Loader2 size={36} className="animate-spin text-indigo-400" />
                            <p className="text-lg font-semibold text-white mb-2">Finishing your capture...</p>
                            <p className="text-sm text-slate-400 text-center px-4">
                                We are making sure the recording metadata is sane so playback and trimming behave reliably.
                            </p>
                        </div>
                    )}

                    {status === AppStatus.REVIEWING && videoData && (
                        <Editor
                            videoMetadata={videoData}
                            onReset={handleReset}
                        />
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 text-center text-slate-600 text-sm border-t border-slate-800">
                <p>Built with React, Tailwind & FFmpeg.wasm • by yapweijun1996</p>
                <p className="mt-1 text-slate-700">Version 2.0 - Now with Pause, Draggable Camera & Preloaded Export</p>
            </footer>
        </div>
    );
};

export default App;
