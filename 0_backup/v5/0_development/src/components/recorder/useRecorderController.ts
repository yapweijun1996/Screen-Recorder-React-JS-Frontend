import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamCompositor } from '../../utils/StreamCompositor';
import { PIPPosition, RecordingQuality } from '../../types';
import { useI18n } from '../../i18n';
import { closeAudioMix, createFinalStream, formatRecordingTimeLabel, getChosenRecordingPreset, stopTracks, type AudioMix } from './recorderControllerUtils';

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
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const compositorRef = useRef<StreamCompositor | null>(null);
    const audioMixRef = useRef<AudioMix | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const hasFinalizedRef = useRef(false);
    const startTimeRef = useRef<number>(0);
    const pausedTimeRef = useRef<number>(0);
    const pauseStartedRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // 用 ref 記住「真正正在跑的 stream」，避免 closure 讀到舊 state 導致 stop 不完整
    const activeStreamRef = useRef<MediaStream | null>(null);

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

    const cleanupAudioMix = async () => {
        await closeAudioMix(audioMixRef.current);
        audioMixRef.current = null;
    };

    const stopAction = useCallback(() => {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state !== 'inactive') {
            try {
                mr.requestData();
            } catch {
                // ignore
            }
            mr.stop();
        }
    }, []);

    const startRecording = async () => {
        setIsPreparing(true);
        try {
            const chosenPreset = getChosenRecordingPreset(recordingQuality, customFps, customBitrateMbps);

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 2560, max: 3840 },
                    height: { ideal: 1440, max: 2160 },
                    frameRate: { ideal: chosenPreset.frameRate, max: chosenPreset.frameRate }
                },
                audio: true
            });

            let micStreamLocal: MediaStream | undefined;
            let camStream: MediaStream | undefined;

            if (enableMic) {
                micStreamLocal = await navigator.mediaDevices.getUserMedia({ audio: true });
                setMicStream(micStreamLocal);
            }

            if (enableCam) {
                camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 } });
            }

            const { finalStream, compositor, audioMix } = await createFinalStream({
                screenStream,
                camStream,
                micStream: micStreamLocal,
                enableCam,
                pipPosition,
                frameRate: chosenPreset.frameRate,
            });

            setActiveStream(finalStream);
            activeStreamRef.current = finalStream;
            compositorRef.current = compositor;
            audioMixRef.current = audioMix;

            screenStream.getVideoTracks()[0].onended = () => {
                stopAction();
            };

            const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? 'video/webm; codecs=vp9'
                : 'video/webm';

            const mediaRecorder = new MediaRecorder(finalStream, {
                mimeType,
                videoBitsPerSecond: chosenPreset.videoBitsPerSecond
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
                    onError(t('recorder.errors.empty'));
                    return;
                }

                if (compositorRef.current) {
                    compositorRef.current.stop();
                } else {
                    cleanupAudioMix().catch(() => undefined);
                }

                stopTracks(activeStreamRef.current);
                stopTracks(screenStream);
                stopTracks(micStreamLocal);
                stopTracks(camStream);

                setIsRecording(false);
                setIsPaused(false);
                setActiveStream(null);
                setMicStream(null);
                setRecordingTime(0);
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

        } catch (err: any) {
            console.error(err);
            if (err?.name === 'NotAllowedError') {
                onError(t('recorder.errors.permission'));
            } else {
                onError(err?.message || t('recorder.errors.startFailed'));
            }
        } finally {
            setIsPreparing(false);
        }
    };

    const pauseResume = useCallback(() => {
        if (!mediaRecorderRef.current) return;

        if (isPaused) {
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
            mediaRecorderRef.current.pause();
            if (compositorRef.current) {
                compositorRef.current.pause();
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

        if (compositorRef.current) {
            compositorRef.current.setPIPPresetPosition(newPosition);
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
            if (compositorRef.current) compositorRef.current.stop();
            cleanupAudioMix().catch(() => undefined);
            stopTracks(activeStreamRef.current);
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
