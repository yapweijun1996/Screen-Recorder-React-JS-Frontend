import {
    STT_ASSETS,
    STT_DOWNLOAD_SIZE_BYTES,
    STT_MODEL_ID,
    STT_MODEL_REVISION,
    isSttAssetUrl,
    type SttAsset,
} from './modelCacheAssets';
import { openModelCache, writeModelManifest } from './modelStorage';
import { detectLanguage } from './detectLanguage';
export { clearModelCache, getModelCacheStatus } from './modelStorage';

export interface TranscriberChunk {
    timestamp: [number, number];
    text: string;
}

export interface TranscriberResult {
    text: string;
    chunks?: TranscriberChunk[];
}

export type SttTranscriber = (
    audio: Float32Array,
    options?: {
        language?: string;
        task?: string;
        return_timestamps?: boolean | 'word';
        chunk_length_s?: number;
        stride_length_s?: number;
    },
) => Promise<TranscriberResult | TranscriberResult[]>;

export type ModelProgressHandler = (progress: number) => void;

interface CacheLike {
    match(request: RequestInfo): Promise<Response | undefined>;
    put(request: RequestInfo, response: Response): Promise<void>;
}

let preparePromise: Promise<SttTranscriber> | null = null;

function report(handler: ModelProgressHandler | undefined, value: number) {
    handler?.(Math.max(0, Math.min(1, value)));
}

function reportPreparation(handler: ModelProgressHandler | undefined, value: number) {
    // Reserve the final 5% for pipeline initialization and manifest commit.
    report(handler, Math.min(0.95, Math.max(0, value) * 0.95));
}

function normalizeRequest(request: RequestInfo) {
    return typeof request === 'string' ? request : request instanceof URL ? request.toString() : request.url;
}

function createModelCache(cache: Cache): CacheLike {
    return {
        async match(request) {
            const key = normalizeRequest(request);
            return isSttAssetUrl(key) ? cache.match(key) : undefined;
        },
        async put(request, response) {
            const key = normalizeRequest(request);
            if (isSttAssetUrl(key)) await cache.put(key, response);
        },
    };
}

async function digest(bytes: ArrayBuffer) {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required to verify STT assets.');
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

function verifyAsset(asset: SttAsset, bytes: ArrayBuffer) {
    if (bytes.byteLength !== asset.size) {
        throw new Error(`STT asset size mismatch for ${asset.key}.`);
    }
    return digest(bytes).then(hash => {
        if (hash !== asset.sha256) throw new Error(`STT asset integrity check failed for ${asset.key}.`);
    });
}

async function readAsset(cache: Cache, asset: SttAsset) {
    const response = await cache.match(asset.url);
    if (!response) return null;
    try {
        const bytes = await response.arrayBuffer();
        await verifyAsset(asset, bytes);
        return bytes;
    } catch {
        await cache.delete(asset.url).catch(() => {});
        return null;
    }
}

async function downloadAsset(cache: Cache, asset: SttAsset, completed: number, total: number, onProgress?: ModelProgressHandler) {
    const response = await fetch(asset.url, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Unable to download STT asset ${asset.key} (${response.status}).`);

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const reader = response.body?.getReader();
    if (reader) {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            if (!part.value) continue;
            if (loaded + part.value.byteLength > asset.size) {
                await reader.cancel().catch(() => {});
                throw new Error(`STT asset exceeds its pinned size for ${asset.key}.`);
            }
            chunks.push(part.value);
            loaded += part.value.byteLength;
            reportPreparation(onProgress, (completed + loaded) / total);
        }
    } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > asset.size) {
            throw new Error(`STT asset exceeds its pinned size for ${asset.key}.`);
        }
        chunks.push(bytes);
        loaded = bytes.byteLength;
        reportPreparation(onProgress, (completed + loaded) / total);
    }

    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    await verifyAsset(asset, bytes.buffer);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.set('content-length', String(bytes.byteLength));
    await cache.put(asset.url, new Response(bytes, { status: 200, headers }));
    return bytes.buffer;
}

async function prepareTranscriberInternal(onProgress?: ModelProgressHandler): Promise<SttTranscriber> {
    const cache = await openModelCache();
    const modelCache = createModelCache(cache);
    let runtimeBytes: ArrayBuffer | undefined;
    let completed = 0;

    for (const asset of STT_ASSETS) {
        const cached = await readAsset(cache, asset);
        const bytes = cached ?? await downloadAsset(cache, asset, completed, STT_DOWNLOAD_SIZE_BYTES, onProgress);
        if (asset.kind === 'runtime') runtimeBytes = bytes;
        completed += asset.size;
        reportPreparation(onProgress, completed / STT_DOWNLOAD_SIZE_BYTES);
    }

    const { env, pipeline, Tensor } = await import('@huggingface/transformers');
    env.useBrowserCache = false;
    env.useFSCache = false;
    env.useCustomCache = true;
    env.customCache = modelCache;
    // Transformers.js rejects `local_files_only` when local models are disabled.
    // The custom Cache API remains the only local source; remote fallback stays off.
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    const onnx = env.backends.onnx as { wasm?: { numThreads?: number; proxy?: boolean; wasmBinary?: ArrayBuffer } };
    onnx.wasm ??= {};
    onnx.wasm.numThreads = 1;
    onnx.wasm.proxy = false;
    onnx.wasm.wasmBinary = runtimeBytes;

    const transcriber = await pipeline('automatic-speech-recognition', STT_MODEL_ID, {
        revision: STT_MODEL_REVISION,
        dtype: 'q8',
        device: 'wasm',
        local_files_only: true,
        progress_callback: data => {
            if ('progress' in data && typeof data.progress === 'number') {
                reportPreparation(onProgress, data.progress / 100);
            }
        },
    });
    await writeModelManifest(cache);
    report(onProgress, 1);
    return async (audio, options) => {
        const language = options?.language ?? await detectLanguage(transcriber, audio, Tensor);
        return await transcriber(audio, { ...options, language }) as TranscriberResult | TranscriberResult[];
    };
}

export function prepareTranscriber(onProgress?: ModelProgressHandler): Promise<SttTranscriber> {
    preparePromise ??= prepareTranscriberInternal(onProgress).catch(error => {
        preparePromise = null;
        throw error;
    });
    return preparePromise;
}
