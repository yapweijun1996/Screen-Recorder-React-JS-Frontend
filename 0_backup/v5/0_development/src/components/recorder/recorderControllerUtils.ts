import { StreamCompositor } from '../../utils/StreamCompositor';
import { RECORDING_PRESETS, type PIPPosition, type RecordingQuality } from '../../types';

export type AudioMix = { context: AudioContext; destination: MediaStreamAudioDestinationNode };

const MIN_CUSTOM_BITRATE_BPS = 1_000_000; // 1Mbps：避免極低碼率造成馬賽克/音畫不同步
const DEFAULT_PIP_SIZE = 0.2; // 20%：UI 預設值（之後可做成可調）

/**
 * 把秒數轉成 UI 友善的 mm:ss
 */
export const formatRecordingTimeLabel = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 依照使用者選擇的錄影品質，組出錄影 preset（避免 hook 內塞太多邏輯）
 */
export const getChosenRecordingPreset = (
    recordingQuality: RecordingQuality,
    customFps: number,
    customBitrateMbps: number,
) => {
    if (recordingQuality !== 'custom') return RECORDING_PRESETS[recordingQuality];

    return {
        quality: 'custom' as const,
        frameRate: customFps,
        videoBitsPerSecond: Math.max(MIN_CUSTOM_BITRATE_BPS, Math.round(customBitrateMbps * 1_000_000)),
    };
};

/**
 * 安全停止所有 track，避免錄影停止後還佔用裝置/CPU
 */
export const stopTracks = (stream: MediaStream | null | undefined) => {
    stream?.getTracks().forEach((track) => track.stop());
};

/**
 * 關閉 AudioContext（避免 audio thread 泄漏）
 */
export const closeAudioMix = async (audioMix: AudioMix | null) => {
    if (!audioMix) return;
    if (audioMix.context.state !== 'closed') {
        await audioMix.context.close().catch(() => undefined);
    }
};

const getVideoSizeFromStream = (screenStream: MediaStream) => {
    const track = screenStream.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};

    // 優先使用實際 capture size；沒有就用目前螢幕尺寸推估（避免硬寫 1920x1080）
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const fallbackWidth = typeof window !== 'undefined' ? Math.round(window.screen.width * dpr) : 1920;
    const fallbackHeight = typeof window !== 'undefined' ? Math.round(window.screen.height * dpr) : 1080;

    const width = Math.max(1, Math.round(Number(settings.width ?? fallbackWidth)));
    const height = Math.max(1, Math.round(Number(settings.height ?? fallbackHeight)));

    return { width, height };
};

const createAudioTracks = (screenStream: MediaStream, micStream?: MediaStream) => {
    const screenAudioTracks = screenStream.getAudioTracks();
    const hasScreenAudio = screenAudioTracks.length > 0;
    const hasMicAudio = !!(micStream && micStream.getAudioTracks().length);
    const hasAnyAudio = hasScreenAudio || hasMicAudio;

    if (!hasAnyAudio) {
        return { audioTracks: [] as MediaStreamTrack[], audioMix: null as AudioMix | null };
    }

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    if (hasScreenAudio) {
        const screenSource = audioContext.createMediaStreamSource(screenStream);
        screenSource.connect(destination);
    }

    if (hasMicAudio && micStream) {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
    }

    return { audioTracks: destination.stream.getAudioTracks(), audioMix: { context: audioContext, destination } };
};

/**
 * 統一建立「最終錄影串流」：
 * - 有相機 PIP：用 `StreamCompositor` 合成畫面與混音
 * - 無相機：保留螢幕畫面 + 自行混音（如果有音軌）
 */
export const createFinalStream = async (args: {
    screenStream: MediaStream;
    camStream?: MediaStream;
    micStream?: MediaStream;
    enableCam: boolean;
    pipPosition: PIPPosition;
    frameRate: number;
}) => {
    const { screenStream, camStream, micStream, enableCam, pipPosition, frameRate } = args;

    if (enableCam && camStream) {
        const { width, height } = getVideoSizeFromStream(screenStream);
        const compositor = new StreamCompositor({
            width,
            height,
            frameRate,
            pipConfig: {
                position: pipPosition,
                size: DEFAULT_PIP_SIZE,
            }
        });

        const finalStream = await compositor.start(screenStream, camStream, micStream);
        return { finalStream, compositor, audioMix: null as AudioMix | null };
    }

    const { audioTracks, audioMix } = createAudioTracks(screenStream, micStream);
    const finalStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...audioTracks
    ]);

    return { finalStream, compositor: null as StreamCompositor | null, audioMix };
};

