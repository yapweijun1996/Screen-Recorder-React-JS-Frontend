import React, { useState, useEffect } from 'react';
import { AppStatus, VideoMetadata } from './types';
import { Recorder } from './components/Recorder';
import { Editor } from './components/Editor';
import { FFmpegStatus } from './components/FFmpegStatus';
import { ThemeToggle } from './components/ThemeToggle';
import { Layers, Loader2 } from 'lucide-react';
import { ffmpegService } from './services/ffmpegService';
import { videoStorageService } from './services/videoStorageService';
import { useI18n } from './i18n';
import { LanguageSelector } from './components/LanguageSelector';

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
    const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isLoadingStored, setIsLoadingStored] = useState(true);
    const { t } = useI18n();

    useEffect(() => {
        const loadStoredVideo = async () => {
            try {
                const stored = await videoStorageService.loadVideo();
                if (stored && stored.blob && stored.blob.size > 0) {
                    const url = URL.createObjectURL(stored.blob);
                    setVideoData({
                        blob: stored.blob,
                        url,
                        duration: stored.duration,
                    });
                    setStatus(AppStatus.REVIEWING);
                    console.log('Restored video from IndexedDB:', stored.blob.size, 'bytes');
                }
            } catch (error) {
                console.error('Failed to load stored video:', error);
            } finally {
                setIsLoadingStored(false);
            }
        };

        loadStoredVideo();
    }, []);

    const handleRecordingComplete = async (blob: Blob, recordedDuration: number) => {
        if (!blob || blob.size === 0) {
            setErrorMsg(t('app.error.empty'));
            setStatus(AppStatus.IDLE);
            return;
        }

        setStatus(AppStatus.PROCESSING);
        setErrorMsg(null);

        let workingBlob = blob;

        if (blob.size > 0) {
            try {
                workingBlob = await ffmpegService.fixWebmDuration(blob, recordedDuration);
            } catch (error) {
                console.warn('FFmpeg failed to fix WebM duration, falling back to raw blob.', error);
            }
        }

        try {
            const url = URL.createObjectURL(workingBlob);

            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.src = url;

            const cleanupTempVideo = () => {
                tempVideo.onloadedmetadata = null;
                tempVideo.onerror = null;
                tempVideo.src = '';
            };

            const finalize = async (duration: number) => {
                if (!Number.isFinite(duration) || duration <= 0) {
                    throw new Error(t('app.error.invalidDuration'));
                }

                try {
                    await videoStorageService.saveVideo(workingBlob, duration);
                    console.log('Video saved to IndexedDB');
                } catch (saveError) {
                    console.warn('Failed to save video to IndexedDB:', saveError);
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
                    setErrorMsg(t('app.error.invalid'));
                    setStatus(AppStatus.IDLE);
                    URL.revokeObjectURL(url);
                } finally {
                    cleanupTempVideo();
                }
            };

            tempVideo.onerror = () => {
                try {
                    finalize(recordedDuration);
                } catch (err) {
                    console.error(err);
                    setErrorMsg(t('app.error.invalid'));
                    setStatus(AppStatus.IDLE);
                    URL.revokeObjectURL(url);
                } finally {
                    cleanupTempVideo();
                }
            };
        } catch (error) {
            console.error('Failed to finalize recording:', error);
            setErrorMsg(t('app.error.finalize'));
            setStatus(AppStatus.IDLE);
        }
    };

    const handleReset = async () => {
        if (videoData) {
            URL.revokeObjectURL(videoData.url);
        }

        try {
            await videoStorageService.deleteVideo();
            console.log('Video deleted from IndexedDB');
        } catch (error) {
            console.warn('Failed to delete video from IndexedDB:', error);
        }

        setVideoData(null);
        setStatus(AppStatus.IDLE);
        setErrorMsg(null);
    };

    const handleError = (msg: string) => {
        setErrorMsg(msg);
    };

    useEffect(() => {
        if (errorMsg) {
            const timer = setTimeout(() => setErrorMsg(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMsg]);

    const isEditorMode = status === AppStatus.REVIEWING && videoData;

    if (isLoadingStored) {
        return (
            <div className="min-h-screen bg-th-base text-th-primary flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-indigo-400" />
                    <p className="text-sm text-th-secondary">{t('app.loading') || 'Loading...'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-th-base text-th-primary font-sans selection:bg-indigo-500 selection:text-white flex flex-col ${isEditorMode ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            {/* Header */}
            <header className={`border-b border-th-edge bg-th-surface/80 backdrop-blur-md sticky top-0 z-50 flex-shrink-0 ${isEditorMode ? 'h-12' : 'h-16'}`}>
                <div className={`${isEditorMode ? 'px-4' : 'max-w-7xl mx-auto px-4'} h-full flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <div className={`bg-gradient-to-br from-indigo-500 to-purple-600 ${isEditorMode ? 'p-1.5' : 'p-2'} rounded-lg shadow-lg shadow-indigo-500/20`}>
                            <Layers size={isEditorMode ? 18 : 24} className="text-white" />
                        </div>
                        <h1 className={`${isEditorMode ? 'text-base' : 'text-xl'} font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-white dark:to-slate-400`}>
                            {t('app.title')}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <FFmpegStatus />
                        {!isEditorMode && (
                            <div className="text-xs font-mono text-th-tertiary bg-th-card h-8 px-2 rounded border border-th-divider flex items-center">
                                {t('app.tagline')}
                            </div>
                        )}
                        <ThemeToggle />
                        <LanguageSelector />
                    </div>
                </div>
            </header>

            {/* Error Message */}
            {errorMsg && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-200 flex items-center justify-between animate-fade-in flex-shrink-0">
                    <span className="text-sm">{errorMsg}</span>
                    <button onClick={() => setErrorMsg(null)} className="hover:text-red-500 dark:hover:text-white text-xl">&times;</button>
                </div>
            )}

            {/* Main Content */}
            {isEditorMode ? (
                <Editor
                    videoMetadata={videoData}
                    onReset={handleReset}
                />
            ) : (
                <>
                    <main className="container mx-auto px-4 py-8 flex-1 flex flex-col">
                        <div className="flex-1 flex flex-col">
                            {status === AppStatus.IDLE && (
                                <Recorder
                                    onRecordingComplete={handleRecordingComplete}
                                    onError={handleError}
                                />
                            )}

                            {status === AppStatus.PROCESSING && (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-th-secondary">
                                    <Loader2 size={36} className="animate-spin text-indigo-400" />
                                    <p className="text-lg font-semibold text-th-primary mb-2">{t('app.processing.title')}</p>
                                    <p className="text-sm text-th-secondary text-center px-4">
                                        {t('app.processing.desc')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </main>

                    {/* Footer */}
                    <footer className="py-6 text-center text-th-muted text-sm border-t border-th-edge flex-shrink-0">
                        <p>{t('app.footer.line1')}</p>
                        <p className="mt-1 text-th-faint">{t('app.footer.line2')}</p>
                    </footer>
                </>
            )}
        </div>
    );
};

export default App;
