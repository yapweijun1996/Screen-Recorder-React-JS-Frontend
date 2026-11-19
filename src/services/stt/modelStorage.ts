import {
    STT_ASSETS,
    STT_CACHE_NAME,
    STT_CACHE_NAME_PREFIX,
    STT_CACHE_SCHEMA_VERSION,
    STT_DOWNLOAD_SIZE_BYTES,
    STT_MODEL_ID,
    STT_MODEL_REVISION,
    STT_ORT_VERSION,
    STT_TRANSFORMERS_VERSION,
} from './modelCacheAssets';

const MANIFEST_KEY = '__screenclip_stt_model_manifest__.json';

export interface ModelCacheStatus {
    available: boolean;
    modelId: string;
    modelRevision: string;
    transformersVersion: string;
    runtimeVersion: string;
    sizeBytes: number;
    expectedSizeBytes: number;
}

export interface ModelManifest {
    schemaVersion: number;
    modelId: string;
    modelRevision: string;
    transformersVersion: string;
    runtimeVersion: string;
    downloadedBytes: number;
    assets: Record<string, { size: number; sha256: string }>;
}

function cacheStorage(): CacheStorage {
    if (typeof caches === 'undefined') throw new Error('STT model storage is unavailable in this browser.');
    return caches;
}

export function modelManifestUrl() {
    // Use a fixed same-origin key so the page and its module Worker share one
    // manifest even when the Worker script is served from an assets directory.
    const origin = typeof location !== 'undefined' && location.origin !== 'null'
        ? location.origin
        : 'https://screenclip.invalid';
    return `${origin}/${MANIFEST_KEY}`;
}

export function openModelCache() {
    return cacheStorage().open(STT_CACHE_NAME);
}

function manifestMatches(value: unknown): value is ModelManifest {
    if (!value || typeof value !== 'object') return false;
    const manifest = value as Partial<ModelManifest>;
    const hasExpectedAssets = STT_ASSETS.every(asset => {
        const entry = manifest.assets?.[asset.key];
        return entry?.size === asset.size && entry.sha256 === asset.sha256;
    });
    return manifest.schemaVersion === STT_CACHE_SCHEMA_VERSION
        && manifest.modelId === STT_MODEL_ID
        && manifest.modelRevision === STT_MODEL_REVISION
        && manifest.transformersVersion === STT_TRANSFORMERS_VERSION
        && manifest.runtimeVersion === STT_ORT_VERSION
        && manifest.downloadedBytes === STT_DOWNLOAD_SIZE_BYTES
        && hasExpectedAssets;
}

export async function writeModelManifest(cache: Cache) {
    const assets = Object.fromEntries(STT_ASSETS.map(asset => [asset.key, { size: asset.size, sha256: asset.sha256 }]));
    const manifest: ModelManifest = {
        schemaVersion: STT_CACHE_SCHEMA_VERSION,
        modelId: STT_MODEL_ID,
        modelRevision: STT_MODEL_REVISION,
        transformersVersion: STT_TRANSFORMERS_VERSION,
        runtimeVersion: STT_ORT_VERSION,
        downloadedBytes: STT_DOWNLOAD_SIZE_BYTES,
        assets,
    };
    await cache.put(modelManifestUrl(), new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    }));
}

async function readManifest() {
    const cache = await openModelCache();
    const response = await cache.match(modelManifestUrl());
    if (!response) return null;
    try {
        const value: unknown = await response.json();
        return manifestMatches(value) ? value : null;
    } catch {
        return null;
    }
}

export async function getModelCacheStatus(): Promise<ModelCacheStatus> {
    const manifest = await readManifest().catch(() => null);
    return {
        available: !!manifest,
        modelId: STT_MODEL_ID,
        modelRevision: STT_MODEL_REVISION,
        transformersVersion: STT_TRANSFORMERS_VERSION,
        runtimeVersion: STT_ORT_VERSION,
        sizeBytes: manifest?.downloadedBytes ?? 0,
        expectedSizeBytes: STT_DOWNLOAD_SIZE_BYTES,
    };
}

export async function clearModelCache() {
    const storage = cacheStorage();
    const names = await storage.keys();
    await Promise.all(names
        .filter(name => name.startsWith(STT_CACHE_NAME_PREFIX))
        .map(name => storage.delete(name)));
}
