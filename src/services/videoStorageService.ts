const DB_NAME = 'ScreenClipProDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';
const VIDEO_KEY = 'current_recording';

interface StoredVideo {
    id: string;
    recordingId?: string;
    blob: Blob;
    mimeType: string;
    duration: number;
    createdAt: number;
    name?: string;
}

export class VideoStorageService {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<IDBDatabase> | null = null;

    private async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (!this.initPromise) {
            this.initPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    this.db = db;
                    db.onversionchange = () => {
                        db.close();
                        this.db = null;
                        this.initPromise = null;
                    };
                    resolve(db);
                };
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                };
            });
        }
        try { return await this.initPromise; }
        catch (error) {
            // A temporary storage failure must not poison all future attempts.
            this.initPromise = null;
            throw error;
        }
    }

    private transact<T>(db: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, mode);
            let request: IDBRequest<T>;
            const fail = () => reject(transaction.error ?? request?.error ?? new Error('Storage transaction aborted'));
            // Request success is provisional: disk/quota failure can still abort
            // the transaction. Only oncomplete confirms committed storage.
            transaction.oncomplete = () => resolve(request.result);
            transaction.onabort = fail;
            transaction.onerror = fail;
            request = operation(transaction.objectStore(STORE_NAME));
            request.onerror = fail;
        });
    }

    async saveVideo(blob: Blob, duration: number, name = 'Screen Recording'): Promise<string> {
        const db = await this.init();
        const recordingId = crypto.randomUUID();
        const video: StoredVideo = { id: VIDEO_KEY, recordingId, blob, mimeType: blob.type, duration, createdAt: Date.now(), name };
        await this.transact(db, 'readwrite', store => store.put(video));
        return recordingId;
    }

    async loadVideo(): Promise<StoredVideo | null> {
        const db = await this.init();
        const stored = await this.transact<StoredVideo | undefined>(db, 'readonly', store => store.get(VIDEO_KEY));
        if (!stored || stored.recordingId) return stored ?? null;

        // Re-read under a write transaction so migration cannot overwrite a newer recording.
        try {
            const recordingId = crypto.randomUUID();
            let identified: StoredVideo | null = null;
            await this.transact<StoredVideo | undefined>(db, 'readwrite', store => {
                const request = store.get(VIDEO_KEY);
                request.onsuccess = () => {
                    const current = request.result;
                    if (!current) return;
                    identified = current.recordingId ? current : { ...current, recordingId };
                    if (!current.recordingId) store.put(identified);
                };
                return request;
            });
            return identified;
        } catch (error) {
            console.warn('Could not identify the recovered recording:', error);
            return stored;
        }
    }

    async deleteVideo(recordingId: string): Promise<boolean> {
        const db = await this.init();
        let canReset = false;
        await this.transact<StoredVideo | undefined>(db, 'readwrite', store => {
            const request = store.get(VIDEO_KEY);
            request.onsuccess = () => {
                const current = request.result;
                canReset = !current || (!!recordingId && current.recordingId === recordingId);
                if (canReset && current) store.delete(VIDEO_KEY);
            };
            return request;
        });
        return canReset;
    }

    async hasStoredVideo(): Promise<boolean> { return (await this.loadVideo()) !== null; }

    async getStorageInfo(): Promise<{ hasVideo: boolean; size?: number; createdAt?: Date }> {
        const video = await this.loadVideo();
        return video ? { hasVideo: true, size: video.blob.size, createdAt: new Date(video.createdAt) } : { hasVideo: false };
    }
}

export const videoStorageService = new VideoStorageService();
