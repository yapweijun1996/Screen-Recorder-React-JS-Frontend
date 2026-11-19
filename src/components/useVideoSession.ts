import { useEffect, useRef, useState } from 'react';
import { AppStatus, type VideoMetadata } from '../types';
import { exportService } from '../services/exportService';
import { videoStorageService } from '../services/videoStorageService';
import { readRecordingDuration } from '../services/readRecordingDuration';
import { taskActivity } from '../services/taskActivity';
import { clearEditorDraft } from './editor/editorDraftPersistence';

export type StorageIssue = 'saveFailed' | 'loadFailed' | 'deleteFailed' | 'recordingChanged';

export function useVideoSession(t: (key: string) => string) {
    const [status, setStatus] = useState(AppStatus.IDLE);
    const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [storageIssue, setStorageIssue] = useState<StorageIssue | null>(null);
    const [isLoadingStored, setIsLoadingStored] = useState(true);
    const mounted = useRef(true);
    const revision = useRef(0);
    const urlRef = useRef<string | null>(null);
    const savedRecordingId = useRef<string | null | undefined>(null);
    const finalization = useRef<AbortController | null>(null);
    const resetting = useRef(false);
    const replaceVideo = (data: VideoMetadata | null, recordingId: string | null | undefined) => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = data?.url ?? null;
        savedRecordingId.current = recordingId;
        setVideoData(data);
    };

    useEffect(() => {
        mounted.current = true;
        const version = ++revision.current;
        const endActivity = taskActivity.begin();
        const current = () => mounted.current && revision.current === version;
        void videoStorageService.loadVideo().then(stored => {
            if (!current() || !stored?.blob.size) return;
            replaceVideo({ blob: stored.blob, url: URL.createObjectURL(stored.blob), duration: stored.duration, recordingId: stored.recordingId }, stored.recordingId);
            setStatus(AppStatus.REVIEWING);
        }).catch(error => {
            if (!current()) return;
            console.warn('Failed to restore recording:', error);
            setStorageIssue('loadFailed');
        }).finally(() => { endActivity(); if (current()) setIsLoadingStored(false); });
        return () => {
            mounted.current = false;
            endActivity();
            revision.current++;
            finalization.current?.abort();
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        };
    }, []);

    const handleRecordingComplete = async (blob: Blob, recordedDuration: number) => {
        if (!blob.size) { setErrorMsg(t('app.error.empty')); setStatus(AppStatus.IDLE); return; }
        const version = ++revision.current;
        finalization.current?.abort();
        const controller = new AbortController();
        finalization.current = controller;
        const current = () => mounted.current && revision.current === version && !controller.signal.aborted;
        setStatus(AppStatus.PROCESSING);
        setErrorMsg(null);
        setStorageIssue(null);
        const endActivity = taskActivity.begin();
        try {
            const workingBlob = await exportService.fixWebmDuration(blob, recordedDuration);
            const duration = await readRecordingDuration(workingBlob, recordedDuration, controller.signal);
            let recordingId: string | null = null;
            try { recordingId = await videoStorageService.saveVideo(workingBlob, duration); }
            catch (error) {
                if (!current()) return;
                console.warn('Recording remains in memory; persistence failed:', error);
                setStorageIssue('saveFailed');
            }
            if (!current()) return;
            const previousRecordingId = savedRecordingId.current;
            if (recordingId && previousRecordingId && recordingId !== previousRecordingId) {
                clearEditorDraft(previousRecordingId);
            }
            replaceVideo({ blob: workingBlob, url: URL.createObjectURL(workingBlob), duration, recordingId: recordingId ?? undefined }, recordingId);
            setStatus(AppStatus.REVIEWING);
        } catch (error) {
            if (!current()) return;
            console.error('Failed to finalize recording:', error);
            setErrorMsg(t('app.error.finalize'));
            setStatus(AppStatus.IDLE);
        } finally {
            endActivity();
            if (finalization.current === controller) finalization.current = null;
        }
    };

    const handleReset = async () => {
        if (resetting.current) return;
        resetting.current = true;
        const endActivity = taskActivity.begin();
        try {
            const recordingId = savedRecordingId.current;
            if (recordingId === undefined) {
                setStorageIssue('deleteFailed');
                return;
            }
            const canReset = recordingId === null || await videoStorageService.deleteVideo(recordingId);
            if (!mounted.current) return;
            if (!canReset) {
                setStorageIssue('recordingChanged');
                return;
            }
            clearEditorDraft(recordingId ?? undefined);
            revision.current++;
            replaceVideo(null, null);
            setStatus(AppStatus.IDLE);
            setErrorMsg(null);
            setStorageIssue(null);
        } catch (error) {
            // Retain the draft and download until deleting the stored copy is
            // confirmed, avoiding a discarded recording reappearing on reload.
            if (mounted.current) setStorageIssue('deleteFailed');
            console.warn('Failed to clear stored recording:', error);
        } finally { endActivity(); resetting.current = false; }
    };

    useEffect(() => {
        if (!errorMsg) return;
        const timer = setTimeout(() => setErrorMsg(null), 5000);
        return () => clearTimeout(timer);
    }, [errorMsg]);

    return { status, videoData, errorMsg, setErrorMsg, storageIssue, isLoadingStored, handleRecordingComplete, handleReset };
}
