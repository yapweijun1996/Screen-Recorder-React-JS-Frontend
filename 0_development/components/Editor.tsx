import React, { useState, useRef, useEffect } from 'react';
import { VideoMetadata, TrimRange } from '../types';
import { formatTime, generateFileName } from '../utils/format';
import { RangeSlider } from './RangeSlider';
import { Button } from './Button';
import { ffmpegService } from '../services/ffmpegService';
import { Play, Pause, Scissors, Download, RotateCcw, FileVideo } from 'lucide-react';

interface EditorProps {
  videoMetadata: VideoMetadata;
  onReset: () => void;
}

export const Editor: React.FC<EditorProps> = ({ videoMetadata, onReset }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [range, setRange] = useState<TrimRange>({ start: 0, end: videoMetadata.duration });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // Revoke generated blob URLs when component unmounts or new exports are created
  useEffect(() => {
    return () => {
      if (exportUrl) {
        URL.revokeObjectURL(exportUrl);
      }
    };
  }, [exportUrl]);

  // Initialize range when metadata loads
  useEffect(() => {
    // Ensure we start with a finite duration from metadata if available
    if (Number.isFinite(videoMetadata.duration) && videoMetadata.duration > 0) {
        setRange({ start: 0, end: videoMetadata.duration });
    }
  }, [videoMetadata]);

  // Sync Video Time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const curr = videoRef.current.currentTime;
      setCurrentTime(curr);

      // Auto-loop preview within selection range
      if (curr >= range.end) {
        videoRef.current.currentTime = range.start;
        // Don't pause, just loop for preview experience
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      // Only update if browser gives us a VALID, FINITE duration that differs significantly
      if (Number.isFinite(dur) && dur !== Infinity && !isNaN(dur)) {
         if (Math.abs(range.end - dur) > 1 || range.end === 0) {
            setRange({ start: 0, end: dur });
         }
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // If we are at the end of range, restart from range.start
      if (videoRef.current.currentTime >= range.end) {
        videoRef.current.currentTime = range.start;
      }
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleExport = async (mode: 'full' | 'trimmed') => {
    setIsProcessing(true);
    setExportUrl(null); // Reset previous export

    try {
      const options = mode === 'trimmed' ? {
        trimStart: range.start,
        trimEnd: range.end
      } : undefined;

      const mp4Blob = await ffmpegService.processVideo(videoMetadata.blob, options);
      const url = URL.createObjectURL(mp4Blob);
      setExportUrl(url);
    } catch (error) {
      console.error(error);
      alert('Failed to export video. Please check console.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine the effective max duration for the slider.
  // We prefer the video element's duration if valid, otherwise fallback to the metadata passed from Recorder
  const getSafeDuration = () => {
      const vidDur = videoRef.current?.duration;
      if (vidDur && Number.isFinite(vidDur)) return vidDur;
      return videoMetadata.duration;
  };

  const maxDuration = getSafeDuration();

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto p-4 md:p-6 gap-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileVideo className="text-indigo-400" />
          Edit & Export
        </h2>
        <Button variant="ghost" onClick={onReset}>
          <RotateCcw size={16} />
          Record New
        </Button>
      </div>

      {/* Main Video Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Video Player */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-slate-700 group">
            <video
              ref={videoRef}
              src={videoMetadata.url}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onClick={togglePlay}
            />
            {/* Center Play Button Overlay */}
            {!isPlaying && (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors"
                onClick={togglePlay}
              >
                <div className="p-4 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl hover:scale-105 transition-transform">
                  <Play size={40} className="fill-white text-white translate-x-1" />
                </div>
              </div>
            )}
          </div>
          
          {/* Controls Bar */}
          <div className="flex items-center justify-between text-slate-400 text-sm px-1">
             <div className="flex items-center gap-2 font-mono">
                <span className="text-indigo-400">{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(range.end)}</span> 
             </div>
             <div>
                Duration: {formatTime(maxDuration)}
             </div>
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex flex-col gap-6 bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
          
          {/* Trimming UI */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Scissors size={20} className="text-indigo-400" />
              <h3 className="font-semibold text-slate-200">Trim Video</h3>
            </div>
            
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
              <RangeSlider
                min={0}
                max={maxDuration || 100} // Fallback to 100 if duration is 0/null to prevent crash
                start={range.start}
                end={range.end}
                onChange={(s, e) => setRange({ start: s, end: e })}
                onPreviewRequest={handleSeek}
              />
              <div className="flex justify-between text-xs text-slate-500 mt-2 font-mono">
                <span>Start: {formatTime(range.start)}</span>
                <span>End: {formatTime(range.end)}</span>
              </div>
            </div>

            <Button 
              variant="secondary" 
              className="w-full"
              onClick={() => {
                 if (videoRef.current) {
                    videoRef.current.currentTime = range.start;
                    videoRef.current.play();
                 }
              }}
            >
              <Play size={16} /> Preview Selection
            </Button>
          </div>

          <div className="h-px bg-slate-700/50 my-2" />

          {/* Export Actions */}
          <div className="space-y-4 flex-1">
             <h3 className="font-semibold text-slate-200">Export</h3>
             
             {exportUrl ? (
                <div className="bg-emerald-900/30 border border-emerald-500/30 p-4 rounded-lg text-center space-y-3 animate-fade-in">
                  <p className="text-emerald-400 text-sm font-medium">Video processed successfully!</p>
                  <a 
                    href={exportUrl} 
                    download={generateFileName('screen-recording', 'mp4')}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Download size={20} />
                    Download MP4
                  </a>
                  <button 
                    onClick={() => setExportUrl(null)} 
                    className="text-slate-400 text-xs hover:text-white underline"
                  >
                    Export another version
                  </button>
                </div>
             ) : (
               <div className="space-y-3">
                 <Button 
                  variant="primary" 
                  className="w-full py-3"
                  onClick={() => handleExport('trimmed')}
                  isLoading={isProcessing}
                >
                  Download Trimmed MP4
                </Button>

                <Button 
                  variant="ghost" 
                  className="w-full text-xs text-slate-400"
                  onClick={() => handleExport('full')}
                  disabled={isProcessing}
                >
                  Download Full Untrimmed MP4
                </Button>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
