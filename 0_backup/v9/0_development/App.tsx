import React, { useState } from 'react';
import { AppStatus, VideoMetadata } from './types';
import { Recorder } from './components/Recorder';
import { Editor } from './components/Editor';
import { Layers } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRecordingComplete = (blob: Blob, recordedDuration: number) => {
    const url = URL.createObjectURL(blob);
    
    // We create a temporary video element to check if browser can detect duration
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = url;
    
    const finalize = (duration: number) => {
      setVideoData({
        blob,
        url,
        duration
      });
      setStatus(AppStatus.REVIEWING);
    };

    tempVideo.onloadedmetadata = () => {
      // If browser detects duration correctly (isFinite), use it. 
      // Otherwise use our manually calculated duration from Recorder.
      const d = tempVideo.duration;
      const finalDuration = (Number.isFinite(d) && d > 0) ? d : recordedDuration;
      finalize(finalDuration);
    };

    // Fallback if metadata fails entirely
    tempVideo.onerror = () => {
       finalize(recordedDuration);
    };
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
    // Don't change status to ERROR effectively, just show toast/banner, 
    // keep user on IDLE to try again.
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
              <Layers size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              ScreenClip Pro
            </h1>
          </div>
          <div className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
             Client-side MP4 Export
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 flex-1 flex flex-col min-h-[calc(100vh-64px)]">
        
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 flex items-center justify-between animate-fade-in">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="hover:text-white">&times;</button>
          </div>
        )}

        <div className="flex-1 flex flex-col">
          {status === AppStatus.IDLE && (
            <Recorder 
              onRecordingComplete={handleRecordingComplete} 
              onError={handleError}
            />
          )}

          {status === AppStatus.REVIEWING && videoData && (
            <Editor 
              videoMetadata={videoData} 
              onReset={handleReset} 
            />
          )}
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="py-6 text-center text-slate-600 text-sm">
        <p>Built with React, Tailwind & FFmpeg.wasm • by yapweijun1996</p>
      </footer>
    </div>
  );
};

export default App;
