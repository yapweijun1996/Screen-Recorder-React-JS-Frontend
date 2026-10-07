import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingSession } from './RecordingSession';
import { PIPPosition, RecordingQuality } from '../../types';
import { useI18n } from '../../i18n';
import { createFinalStream, formatRecordingTimeLabel, getChosenRecordingPreset } from './recorderControllerUtils';

interface UseRecorderControllerArgs {
    onRecordingComplete: (blob: Blob, duration: number) => void;
    onError: (msg: string) => void;
}

export const useRecorderController = ({ onRecordingComplete, onError }: UseRecorderControllerArgs) => {
    const { t } = useI18n();
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
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
        const mr = sessionRef.current?.recorder;
        if (mr && mr.state !== 'inactive') {
            try {
                mr.requestData();
            } catch (err) {
                console.warn('stopAction: requestData() failed', err);
            }
            mr.stop();
        }
    }, []);

    const startRecording = async () => {
        if (sessionRef.current && !sessionRef.current.disposed) return;
        const session = new RecordingSession();
        sessionRef.current = session;
        setIsPreparing(true);
        let screenStream: MediaStream | undefined;
        let micStreamLocal: MediaStream | undefined;
        let camStream: MediaStream | undefined;
        try {
            const chosenPreset = getChosenRecordingPreset(recordingQuality, customFps, customBitrateMbps);

            screenStream = session.ownStream(await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 2560, max: 3840 },
                    height: { ideal: 1440, max: 2160 },
                    frameRate: { ideal: chosenPreset.frameRate, max: chosenPreset.frameRate }
                },
                audio: true
            }));

            if (enableMic) {
                micStreamLocal = session.ownStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
                setMicStream(micStreamLocal);
            }

            if (enableCam) {
                camStream = session.ownStream(await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 } }));
            }

            const finalStream = session.ownComposition(await createFinalStream({
                screenStream,
                camStream,
                micStream: micStreamLocal,
                enableCam,
                pipPosition,
                frameRate: chosenPreset.frameRate,
            }));

            setActiveStream(finalStream);

            const screenVideoTrack = screenStream.getVideoTracks()[0];
            screenVideoTrack.onended = () => {
                stopAction();
            };

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

            const finalizeRecording = () => {
                if (session.disposed || hasFinalizedRef.current) return;
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

                session.release();

                setIsRecording(false);
                setIsPaused(false);
                setActiveStream(null);
                setMicStream(null);
                setRecordingTime(0);
                if (!fullBlob.size) {
                    onError(t('recorder.errors.empty'));
                    return;
                }
                onRecordingComplete(fullBlob, durationInSeconds);
            };

            mediaRecorder.onstop = () => {
                setTimeout(finalizeRecording, 50);
            };

            mediaRecorder.start(1000);
            startTimeRef.current = Date.now();
            pausedTimeRef.current = 0;
            pauseStartedRef.current = null;
            setIsRecording(true);

        } catch (err: unknown) {
            const wasDisposed = session.disposed;
            session.release();
            if (wasDisposed) return;
            console.error(err);
            setActiveStream(null);
            setMicStream(null);
            setIsRecording(false);
            setIsPaused(false);
            const name = err instanceof Error ? err.name : undefined;
            if (name === 'NotAllowedError') {
                onError(t('recorder.errors.permission'));
            } else if (name === 'NotFoundError') {
                onError(t('recorder.errors.notFound'));
            } else if (name === 'NotReadableError') {
                onError(t('recorder.errors.notReadable'));
            } else if (name === 'OverconstrainedError') {
                onError(t('recorder.errors.overconstrained'));
            } else {
                onError(err instanceof Error ? err.message : t('recorder.errors.startFailed'));
            }
        } finally {
            if (sessionRef.current === session) setIsPreparing(false);
        }
    };

    const pauseResume = useCallback(() => {
        if (!sessionRef.current?.recorder) return;

        if (isPaused) {
            sessionRef.current?.recorder?.resume();
            if (sessionRef.current?.compositor) {
                sessionRef.current?.compositor.resume();
            }
            if (pauseStartedRef.current) {
                pausedTimeRef.current += Date.now() - pauseStartedRef.current;
            }
            pauseStartedRef.current = null;
            setIsPaused(false);
        } else {
            sessionRef.current?.recorder?.pause();
            if (sessionRef.current?.compositor) {
                sessionRef.current?.compositor.pause();
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
            if (timerRef.current) clearInterval(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        // UI state
        isRecording,
        isPaused,
        isPreparing,
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
