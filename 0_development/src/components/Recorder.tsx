import React from 'react';
import { RecorderSidebar } from './recorder/RecorderSidebar';
import { RecorderPreview } from './recorder/RecorderPreview';
import { useRecorderController } from './recorder/useRecorderController';

interface RecorderProps {
    onRecordingComplete: (blob: Blob, duration: number) => void;
    onError: (msg: string) => void;
}

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onError }) => {
    const rc = useRecorderController({ onRecordingComplete, onError });

    return (
        <div className="w-full h-full px-4 sm:px-6 py-4 sm:py-6 animate-in fade-in zoom-in duration-300 text-sm">
            <div className="mx-auto w-full max-w-7xl">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <RecorderSidebar
                        enableMic={rc.enableMic}
                        onToggleMic={() => rc.setEnableMic(!rc.enableMic)}
                        enableCam={rc.enableCam}
                        onToggleCam={() => rc.setEnableCam(!rc.enableCam)}
                        pipPosition={rc.pipPosition}
                        onCyclePipPosition={rc.cyclePIPPosition}
                        recordingQuality={rc.recordingQuality}
                        onSelectQuality={rc.setRecordingQuality}
                        customFps={rc.customFps}
                        onChangeCustomFps={(fps) => rc.setCustomFps(Math.min(120, Math.max(15, fps)))}
                        customBitrateMbps={rc.customBitrateMbps}
                        onChangeCustomBitrateMbps={(mbps) => rc.setCustomBitrateMbps(Math.min(50, Math.max(1, mbps)))}
                        onStartRecording={rc.startRecording}
                        isPreparing={rc.isPreparing}
                        isRecording={rc.isRecording}
                    />

                    <RecorderPreview
                        videoRef={rc.videoRef}
                        isRecording={rc.isRecording}
                        isPaused={rc.isPaused}
                        recordingTimeLabel={rc.recordingTimeLabel}
                        activeStream={rc.activeStream}
                        micStream={rc.micStream}
                        enableCam={rc.enableCam}
                        onPauseResume={rc.pauseResume}
                        onStop={rc.stopAction}
                        onCyclePipPosition={rc.cyclePIPPosition}
                    />
                </div>
            </div>
        </div>
    );
};
