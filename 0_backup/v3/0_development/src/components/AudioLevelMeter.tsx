import React, { useEffect, useRef, useState } from 'react';

interface AudioLevelMeterProps {
    stream: MediaStream | null;
    className?: string;
}

/**
 * Real-time audio level meter component
 * Shows visual feedback for microphone input
 */
export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({ stream, className = '' }) => {
    const [level, setLevel] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationIdRef = useRef<number | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    useEffect(() => {
        if (!stream || stream.getAudioTracks().length === 0) {
            setLevel(0);
            return;
        }

        try {
            audioContextRef.current = new AudioContext();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            analyserRef.current.smoothingTimeConstant = 0.8;

            const source = audioContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);

            const bufferLength = analyserRef.current.frequencyBinCount;
            dataArrayRef.current = new Uint8Array(bufferLength);

            const analyze = () => {
                if (!analyserRef.current || !dataArrayRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArrayRef.current);

                let sum = 0;
                for (let i = 0; i < dataArrayRef.current.length; i++) {
                    sum += dataArrayRef.current[i];
                }
                const average = sum / dataArrayRef.current.length;
                const normalizedLevel = Math.min(1, average / 100);

                setLevel(normalizedLevel);
                animationIdRef.current = requestAnimationFrame(analyze);
            };

            analyze();
        } catch (error) {
            console.error('AudioLevelMeter: Failed to analyze audio', error);
        }

        return () => {
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [stream]);

    // Generate bars for visualization
    const bars = 5;
    const activeCount = Math.round(level * bars);

    return (
        <div className={`flex items-end gap-0.5 h-6 ${className}`}>
            {Array.from({ length: bars }).map((_, i) => {
                const isActive = i < activeCount;
                const barHeight = ((i + 1) / bars) * 100;

                return (
                    <div
                        key={i}
                        className={`w-1.5 rounded-full transition-all duration-75 ${isActive
                                ? i < 2
                                    ? 'bg-green-400'
                                    : i < 4
                                        ? 'bg-yellow-400'
                                        : 'bg-red-400'
                                : 'bg-slate-600'
                            }`}
                        style={{ height: `${barHeight}%` }}
                    />
                );
            })}
        </div>
    );
};
