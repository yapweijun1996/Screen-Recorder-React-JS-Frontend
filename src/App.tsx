import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { AppStatus } from './types';
import { Recorder } from './components/Recorder';
import { Editor } from './components/Editor';
import { EngineStatus } from './components/EngineStatus';
import { ThemeToggle } from './components/ThemeToggle';
import { Layers, Loader2, RefreshCw, Video, FileVideo } from 'lucide-react';
import { useI18n } from './i18n';
import { LanguageSelector } from './components/LanguageSelector';
import { Converter, type ConverterStatus } from './components/Converter';
import {
    APP_BUILD_VERSION,
    applyUpdate,
    checkForUpdates,
    setupServiceWorker,
    type UpdateCheckResult,
} from './registerSW';
import { EditorDraftProvider } from './components/editor/EditorDraftContext';
import { TranscriptionProvider } from './components/editor/useTranscription';
import { useVideoSession } from './components/useVideoSession';
import { recordingActivity, taskActivity } from './services/taskActivity';
import { StorageNotice } from './components/StorageNotice';

type Page = 'recorder' | 'converter';
const checkFeedback = {
    available: '',
    installing: 'app.update.installing',
    'up-to-date': 'app.update.current',
    'no-worker': 'app.update.unavailable',
    failed: 'app.update.checkFailed',
};

interface AppFooterProps {
    t: (key: string, params?: Record<string, string | number>) => string;
    releaseVersion: string;
    checkingUpdates: boolean;
    onCheckForUpdates: () => void;
    checkStatus: UpdateCheckResult['status'] | null;
}

const AppFooter: React.FC<AppFooterProps> = ({ t, releaseVersion, checkingUpdates, onCheckForUpdates, checkStatus }) => (
    <footer className="mt-auto py-6 text-center text-th-muted text-sm border-t border-th-edge flex-shrink-0">
        <p>{t('app.footer.line1')}</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-th-secondary">
            <span title={releaseVersion}>{t('app.footer.build', { version: releaseVersion.slice(0, 8) })}</span>
            <span aria-hidden="true">•</span>
            <button
                type="button"
                onClick={onCheckForUpdates}
                disabled={checkingUpdates}
                className="font-medium text-indigo-600 dark:text-indigo-300 underline underline-offset-2 disabled:opacity-60 disabled:cursor-wait"
            >
                {t(checkingUpdates ? 'app.update.checking' : 'app.update.check')}
            </button>
        </div>
        {checkStatus && checkFeedback[checkStatus] && <p role="status" className="mt-1 text-xs text-th-secondary">{t(checkFeedback[checkStatus])}</p>}
    </footer>
);

const App: React.FC = () => {
    const { t } = useI18n();
    const { status, videoData, errorMsg, setErrorMsg, storageIssue, isLoadingStored, handleRecordingComplete, handleReset } = useVideoSession(t);
    const updateBusy = useSyncExternalStore(taskActivity.subscribe, taskActivity.isBusy, () => false);
    const recordingBusy = useSyncExternalStore(recordingActivity.subscribe, recordingActivity.isBusy, () => false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [converterStatus, setConverterStatus] = useState<ConverterStatus>('idle');
    const currentReleaseVersion = APP_BUILD_VERSION;
    const [targetReleaseVersion, setTargetReleaseVersion] = useState<string | undefined>();
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [checkStatus, setCheckStatus] = useState<UpdateCheckResult['status'] | null>(null);
    const [page, setPage] = useState<Page>(() => {
        const p = new URLSearchParams(window.location.search).get('page');
        return p === 'converter' ? 'converter' : 'recorder';
    });

    useEffect(() => {
        const notifyUpdate = (targetVersion?: string | null) => {
            setTargetReleaseVersion(targetVersion ?? undefined);
            setUpdateAvailable(true);
            setCheckStatus(null);
        };
        return setupServiceWorker(notifyUpdate);
    }, []);

    const handleCheckForUpdates = async () => {
        if (checkingUpdates) return;
        setCheckingUpdates(true);
        setCheckStatus(null);
        try {
            const result = await checkForUpdates();
            if (result.status === 'available') {
                setTargetReleaseVersion(result.waitingVersion ?? undefined);
                setUpdateAvailable(true);
            } else setCheckStatus(result.status);
        } finally {
            setCheckingUpdates(false);
        }
    };

    const navigateToConverter = () => {
        // Check the live lease too: capture can begin before React rerenders.
        if (!recordingActivity.isBusy()) setPage('converter');
    };

    const isEditorMode = status === AppStatus.REVIEWING && videoData;
    // Converter tab overrides editor — user can still access it mid-session.
    const showEditor = !!isEditorMode && page !== 'converter';
    const converterHasUndownloadedResult = converterStatus === 'undownloaded';
    const updateBlocked = updateBusy || converterStatus === 'converting' || converterHasUndownloadedResult;

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
        <div className={`bg-th-base text-th-primary font-sans selection:bg-indigo-500 selection:text-white flex flex-col ${showEditor ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            {/* Header */}
            <header className={`border-b border-th-edge bg-th-surface/80 backdrop-blur-md sticky top-0 z-50 flex-shrink-0 ${showEditor ? 'h-12' : 'h-16'}`}>
                <div className={`${showEditor ? 'px-4' : 'max-w-7xl mx-auto px-4'} h-full flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <div className={`bg-gradient-to-br from-indigo-500 to-purple-600 ${showEditor ? 'p-1.5' : 'p-2'} rounded-lg shadow-lg shadow-indigo-500/20`}>
                            <Layers size={showEditor ? 18 : 24} className="text-white" />
                        </div>
                        <h1 className={`${showEditor ? 'text-base' : 'text-xl'} font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-white dark:to-slate-400`}>
                            {t('app.title')}
                        </h1>
                    </div>

                    {/* Page nav tabs — always visible */}
                    <nav className="flex items-center gap-1 bg-th-card border border-th-edge rounded-xl p-1">
                        <button
                            type="button"
                            onClick={() => setPage('recorder')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                page === 'recorder'
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'text-th-secondary hover:text-th-primary'
                            }`}
                        >
                            <Video size={13} />
                            {t('app.title')}
                        </button>
                        <button
                            type="button"
                            disabled={recordingBusy}
                            title={recordingBusy ? t('app.navigation.recordingBusy') : undefined}
                            onClick={navigateToConverter}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                page === 'converter'
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'text-th-secondary hover:text-th-primary'
                            }`}
                        >
                            <FileVideo size={13} />
                            {t('converter.nav')}
                        </button>
                    </nav>

                    <div className="flex items-center gap-3">
                        <EngineStatus />
                        <ThemeToggle />
                        <LanguageSelector />
                    </div>
                </div>
            </header>

            {/* Update Available Banner */}
            {updateAvailable && (
                <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-300 dark:border-indigo-500/50 text-indigo-800 dark:text-indigo-200 flex items-center justify-between gap-3 animate-fade-in flex-shrink-0">
                    <span className="text-sm">
                        {t(converterHasUndownloadedResult ? 'app.update.converterUnsaved' : updateBusy ? 'app.update.busy' : 'app.update.available')}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            disabled={updateBlocked}
                            onClick={() => { if (!updateBlocked) applyUpdate(); }}
                            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={12} />
                            {targetReleaseVersion
                                ? t('app.update.reloadVersion', { version: targetReleaseVersion.slice(0, 8) })
                                : t('app.update.reload')}
                        </button>
                        <button
                            onClick={() => setUpdateAvailable(false)}
                            className="text-indigo-400 hover:text-indigo-200 text-xl leading-none"
                            aria-label={t('app.update.dismiss')}
                        >
                            &times;
                        </button>
                    </div>
                </div>
            )}

            {page !== 'converter' && converterStatus !== 'idle' && (
                <div role="status" className="px-4 py-1.5 bg-th-card border-b border-th-edge text-th-secondary flex items-center justify-center gap-2 text-xs flex-shrink-0">
                    <FileVideo size={13} className="text-indigo-500" aria-hidden="true" />
                    <span>{t(converterStatus === 'converting' ? 'converter.progress.label' : 'converter.done.title')}</span>
                </div>
            )}

            {/* Error Message */}
            {errorMsg && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-200 flex items-center justify-between animate-fade-in flex-shrink-0">
                    <span className="text-sm">{errorMsg}</span>
                    <button onClick={() => setErrorMsg(null)} className="hover:text-red-500 dark:hover:text-white text-xl">&times;</button>
                </div>
            )}

            {storageIssue && <StorageNotice issue={storageIssue} video={videoData} />}

            {/* Keep the converter mounted while pages and recording drafts change. */}
            <section className={`${page === 'converter' ? 'flex' : 'hidden'} flex-1 flex-col`}>
                <Converter onStatusChange={setConverterStatus} />
                <AppFooter
                    t={t}
                    releaseVersion={currentReleaseVersion}
                    checkingUpdates={checkingUpdates}
                    onCheckForUpdates={handleCheckForUpdates}
                    checkStatus={checkStatus}
                />
            </section>

            <section className={`${page === 'converter' ? 'hidden' : 'flex'} flex-1 flex-col min-h-0`}>
                {/* Keep the draft owner mounted while recorder/editor pages change. */}
                <EditorDraftProvider
                    key={videoData?.recordingId ?? videoData?.url ?? 'empty'}
                    duration={videoData?.duration ?? 0}
                    recordingId={videoData?.recordingId}
                >
                    <TranscriptionProvider blob={videoData?.blob ?? null}>
                        {page !== 'converter' && (showEditor ? (
                            <Editor
                                videoMetadata={videoData!}
                                onReset={handleReset}
                            />
                        ) : (
                            <>
                                <main className="container mx-auto px-4 py-8 flex-1 flex flex-col">
                                    <div className="flex-1 flex flex-col">
                                        {status === AppStatus.IDLE && (
                                            <Recorder
                                                onRecordingComplete={handleRecordingComplete}
                                                onError={setErrorMsg}
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

                                <AppFooter
                                    t={t}
                                    releaseVersion={currentReleaseVersion}
                                    checkingUpdates={checkingUpdates}
                                    onCheckForUpdates={handleCheckForUpdates}
                                    checkStatus={checkStatus}
                                />
                            </>
                        ))}
                    </TranscriptionProvider>
                </EditorDraftProvider>
            </section>
        </div>
    );
};

export default App;
