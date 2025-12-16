import React, { useState, useEffect } from 'react';
import { AppStatus, VideoMetadata } from './types';
import { Recorder } from './components/Recorder';
import { Editor } from './components/Editor';
import { FFmpegStatus } from './components/FFmpegStatus';
import { Layers, Loader2 } from 'lucide-react';
import { ffmpegService } from './services/ffmpegService';
import { useI18n } from './i18n';
import { LanguageSelector } from './components/LanguageSelector';

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
    const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { t } = useI18n();

    const handleRecordingComplete = async (blob: Blob, recordedDuration: number) => {
        if (!blob || blob.size === 0) {
            setErrorMsg(t('app.error.empty'));
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
                    throw new Error(t('app.error.invalidDuration'));
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
                }
            };

            // Fallback if metadata fails entirely
            tempVideo.onerror = () => {
                try {
                    finalize(recordedDuration);
                } catch (err) {
                    console.error(err);
                    setErrorMsg(t('app.error.invalid'));
                    setStatus(AppStatus.IDLE);
                }
            };
        } catch (error) {
            console.error('Failed to finalize recording:', error);
            setErrorMsg(t('app.error.finalize'));
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

    // 编辑模式使用全屏布局
    const isEditorMode = status === AppStatus.REVIEWING && videoData;

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white flex flex-col">
            {/* Header - 编辑模式更紧凑 */}
            <header className={`border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 flex-shrink-0 ${isEditorMode ? 'h-12' : 'h-16'}`}>
                <div className={`${isEditorMode ? 'px-4' : 'max-w-7xl mx-auto px-4'} h-full flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <div className={`bg-gradient-to-br from-indigo-500 to-purple-600 ${isEditorMode ? 'p-1.5' : 'p-2'} rounded-lg shadow-lg shadow-indigo-500/20`}>
                            <Layers size={isEditorMode ? 18 : 24} className="text-white" />
                        </div>
                        <h1 className={`${isEditorMode ? 'text-base' : 'text-xl'} font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400`}>
                            {t('app.title')}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <FFmpegStatus />
                        {!isEditorMode && (
                            <div className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                                {t('app.tagline')}
                            </div>
                        )}
                        <LanguageSelector />
                    </div>
                </div>
            </header>

            {/* Error Message - 全局错误提示 */}
            {errorMsg && (
                <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/50 text-red-200 flex items-center justify-between animate-fade-in flex-shrink-0">
                    <span className="text-sm">{errorMsg}</span>
                    <button onClick={() => setErrorMsg(null)} className="hover:text-white text-xl">&times;</button>
                </div>
            )}

            {/* Main Content - 编辑模式全屏，其他模式容器 */}
            {isEditorMode ? (
                /* 编辑器全屏模式 - 无padding，无footer */
                <Editor
                    videoMetadata={videoData}
                    onReset={handleReset}
                />
            ) : (
                /* 录制/处理模式 - 使用容器布局 */
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
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300">
                                    <Loader2 size={36} className="animate-spin text-indigo-400" />
                                    <p className="text-lg font-semibold text-white mb-2">{t('app.processing.title')}</p>
                                    <p className="text-sm text-slate-400 text-center px-4">
                                        {t('app.processing.desc')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </main>

                    {/* Footer - 仅在非编辑模式显示 */}
                    <footer className="py-6 text-center text-slate-600 text-sm border-t border-slate-800 flex-shrink-0">
                        <p>{t('app.footer.line1')}</p>
                        <p className="mt-1 text-slate-700">{t('app.footer.line2')}</p>
                    </footer>
                </>
            )}
        </div>
    );
};

export default App;
