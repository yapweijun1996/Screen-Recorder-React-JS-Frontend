export enum AppStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  REVIEWING = 'REVIEWING',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR'
}

export interface VideoMetadata {
  blob: Blob;
  url: string;
  duration: number; // in seconds
}

export interface TrimRange {
  start: number;
  end: number;
}
