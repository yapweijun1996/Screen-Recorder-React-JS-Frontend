/**
 * Video Storage Service using IndexedDB
 * 用于持久化存储录制的视频，支持页面刷新后恢复
 */

const DB_NAME = 'ScreenClipProDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';
const VIDEO_KEY = 'current_recording';

interface StoredVideo {
    id: string;
    blob: Blob;
    mimeType: string;
    duration: number;
    createdAt: number;
    name?: string;
}

class VideoStorageService {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<IDBDatabase> | null = null;

    /**
     * 初始化 IndexedDB
     */
    private async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // 创建存储对象
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    console.log('Created object store:', STORE_NAME);
                }
            };
        });

        return this.initPromise;
    }

    /**
     * 保存视频到 IndexedDB
     */
    async saveVideo(blob: Blob, duration: number, name?: string): Promise<void> {
        try {
            const db = await this.init();

            const storedVideo: StoredVideo = {
                id: VIDEO_KEY,
                blob,
                mimeType: blob.type,
                duration,
                createdAt: Date.now(),
                name: name || 'Screen Recording',
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const request = store.put(storedVideo);

                request.onsuccess = () => {
                    console.log('Video saved to IndexedDB, size:', blob.size);
                    resolve();
                };

                request.onerror = () => {
                    console.error('Failed to save video:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Error saving video:', error);
            throw error;
        }
    }

    /**
     * 从 IndexedDB 加载视频
     */
    async loadVideo(): Promise<StoredVideo | null> {
        try {
            const db = await this.init();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);

                const request = store.get(VIDEO_KEY);

                request.onsuccess = () => {
                    if (request.result) {
                        console.log('Video loaded from IndexedDB, size:', request.result.blob.size);
                        resolve(request.result);
                    } else {
                        console.log('No video found in IndexedDB');
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.error('Failed to load video:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Error loading video:', error);
            return null;
        }
    }

    /**
     * 删除存储的视频
     */
    async deleteVideo(): Promise<void> {
        try {
            const db = await this.init();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const request = store.delete(VIDEO_KEY);

                request.onsuccess = () => {
                    console.log('Video deleted from IndexedDB');
                    resolve();
                };

                request.onerror = () => {
                    console.error('Failed to delete video:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Error deleting video:', error);
            throw error;
        }
    }

    /**
     * 检查是否有存储的视频
     */
    async hasStoredVideo(): Promise<boolean> {
        const video = await this.loadVideo();
        return video !== null;
    }

    /**
     * 获取存储信息（用于调试）
     */
    async getStorageInfo(): Promise<{ hasVideo: boolean; size?: number; createdAt?: Date }> {
        const video = await this.loadVideo();
        if (!video) {
            return { hasVideo: false };
        }
        return {
            hasVideo: true,
            size: video.blob.size,
            createdAt: new Date(video.createdAt),
        };
    }
}

// 导出单例
export const videoStorageService = new VideoStorageService();
