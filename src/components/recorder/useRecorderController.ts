import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingSession } from './RecordingSession';
import { PIPPosition, RecordingQuality } from '../../types';
import { useI18n } from '../../i18n';
import { formatRecordingTimeLabel, getChosenRecordingPreset, getRecorderErrorMessage } from './recorderControllerUtils';
import { prepareCapture } from './capturePreparation';
interface UseRecorderControllerArgs {
    onRecordingComplete: (blob: Blob, duration: number) => void;
    onError: (msg: string) => void;
}
export const useRecorderController = ({ onRecordingComplete, onError }: UseRecorderControllerArgs) => {
    const { t } = useI18n();
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    // Settings
    const [enableMic, setEnableMic] = useState(false);
    const [enableCam, setEnableCam] = useState(false);
    const [pipPosition, setPipPosition] = useState<PIPPosition>('bottom-right');
    const [recordingQuality, setRecordingQuality] = useState<RecordingQuality>('high');
    const [customFps, setCustomFps] = useState<number>(60);
    const [customBitrateMbps, setCustomBitrateMbps] = useState<number>(12);
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const sessionRef = useRef<RecordingSession | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const hasFinalizedRef = useRef(false);
    const finalizeRef = useRef<(() => void) | null>(null);
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

    const stopAction = useCallback(() => {
        const session = sessionRef.current;
        const mr = session?.recorder;
        if (!session || !mr || session.disposed || mr.state === 'inactive' || !session.requestStop()) return;

        setIsStopping(true);
        try {
            mr.requestData();
        } catch (err) {
            console.warn('stopAction: requestData() failed', err);
        }
        try {
            mr.stop();
        } catch (error) {
            session.recordError(error);
            finalizeRef.current?.();
        }
    }, []);

    const startRecording = async () => {
        if (sessionRef.current && !sessionRef.current.disposed) return;
        const session = new RecordingSession();
        sessionRef.current = session;
        setIsPreparing(true);
        setIsStopping(false);
        try {
            const chosenPreset = getChosenRecordingPreset(recordingQuality, customFps, customBitrateMbps);
            const handleScreenEnded = () => {
                // An inactive recorder may still have its final stop event queued.
                if (session.recorder) {
                    stopAction();
                    return;
                }
                if (session.disposed) return;
                session.release();
                if (sessionRef.current !== session) return;
                setIsPreparing(false);
                setIsRecording(false);
                setIsPaused(false);
                setIsStopping(false);
                setActiveStream(null);
                setMicStream(null);
                onError(t('recorder.errors.screenEnded'));
            };

            const { finalStream, screenTrack, micStream: micStreamLocal } = await prepareCapture({
                session,
                enableMic,
                enableCam,
                pipPosition,
                frameRate: chosenPreset.frameRate,
                onScreenEnded: handleScreenEnded,
            });
            if (session.disposed || sessionRef.current !== session) return;
            if (screenTrack.readyState === 'ended') return handleScreenEnded();
            if (micStreamLocal) setMicStream(micStreamLocal);
            setActiveStream(finalStream);

            const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? 'video/webm; codecs=vp9'
                : 'video/webm';

            const mediaRecorder = new MediaRecorder(finalStream, {
                mimeType,
                videoBitsPerSecond: chosenPreset.videoBitsPerSecond
            });

            session.recorder = mediaRecorder;
            chunksRef.current = [];
            hasFinalizedRef.current = false;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onerror = (event) => {
                session.recordError(event);
            };

            const finalizeRecording = () => {
                if (session.disposed || hasFinalizedRef.current) return;
                hasFinalizedRef.current = true;
                finalizeRef.current = null;

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
                const recorderError = session.recorderError;

                session.release();

                setIsRecording(false);
                setIsPaused(false);
                setIsStopping(false);
                setActiveStream(null);
                setMicStream(null);
                setRecordingTime(0);
                if (recorderError) {
                    onError(t('app.error.finalize'));
                    return;
                }
                if (!fullBlob.size) {
                    onError(t('recorder.errors.empty'));
                    return;
                }
                onRecordingComplete(fullBlob, durationInSeconds);
            };

            finalizeRef.current = finalizeRecording;
            mediaRecorder.onstop = finalizeRecording;

            startTimeRef.current = Date.now();
            pausedTimeRef.current = 0;
            pauseStartedRef.current = null;
            mediaRecorder.start(1000);
            if (session.disposed || sessionRef.current !== session) {
                if (mediaRecorder.state !== 'inactive') {
                    try { mediaRecorder.stop(); } catch { /* session cleanup owns the late recorder */ }
                }
                return;
            }
            setIsRecording(true);
        } catch (err: unknown) {
            const wasDisposed = session.disposed;
            const isCurrentSession = sessionRef.current === session;
            session.release();
            if (!isCurrentSession || wasDisposed) return;
            finalizeRef.current = null;
            console.error(err);
            setActiveStream(null);
            setMicStream(null);
            setIsRecording(false);
            setIsPaused(false);
            setIsStopping(false);
            onError(getRecorderErrorMessage(err, t));
        } finally {
            if (sessionRef.current === session) setIsPreparing(false);
        }
    };

    const pauseResume = useCallback(() => {
        const session = sessionRef.current;
        const recorder = session?.recorder;
        if (!session || session.disposed || session.stopRequested || !recorder) return;

        if (isPaused) {
            if (recorder.state !== 'paused') return;
            recorder.resume();
            if (session.compositor) {
                void session.compositor.resume();
            }
            if (pauseStartedRef.current) {
                pausedTimeRef.current += Date.now() - pauseStartedRef.current;
            }
            pauseStartedRef.current = null;
            setIsPaused(false);
        } else {
            if (recorder.state !== 'recording') return;
            recorder.pause();
            if (session.compositor) {
                void session.compositor.pause();
            }
            pauseStartedRef.current = Date.now();
            setIsPaused(true);
        }
    }, [isPaused]);

    const cyclePIPPosition = () => {
        const positions: PIPPosition[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
        const currentIndex = positions.indexOf(pipPosition);
        const nextIndex = (currentIndex + 1) % positions.length;
        const newPosition = positions[nextIndex];
        setPipPosition(newPosition);

        if (sessionRef.current?.compositor) {
            sessionRef.current?.compositor.setPIPPresetPosition(newPosition);
        }
    };

    // Update Preview element srcObject
    useEffect(() => {
        if (videoRef.current && activeStream) {
            videoRef.current.srcObject = activeStream;
        }
    }, [activeStream]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            sessionRef.current?.release();
            sessionRef.current = null;
            finalizeRef.current = null;
            if (timerRef.current) clearInterval(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        // UI state
        isRecording,
        isPaused,
        isPreparing,
        isStopping,
        recordingTime,
        recordingTimeLabel: formatRecordingTimeLabel(recordingTime),

        // Settings state + setters
        enableMic,
        setEnableMic,
        enableCam,
        setEnableCam,
        pipPosition,
        cyclePIPPosition,
        recordingQuality,
        setRecordingQuality,
        customFps,
        setCustomFps,
        customBitrateMbps,
        setCustomBitrateMbps,

        // Streams
        activeStream,
        micStream,

        // Refs
        videoRef,

        // Actions
        startRecording,
        stopAction,
        pauseResume,
    };
};
