export const STT_MODEL_ID = 'Xenova/whisper-tiny';
export const STT_MODEL_REVISION = '5332fcc35e32a33b86612b9a57a89be7906102b1';
export const STT_TRANSFORMERS_VERSION = '3.8.1';
export const STT_ORT_VERSION = '1.22.0-dev.20250409-89f8206ba4';

export const STT_CACHE_SCHEMA_VERSION = 1;
export const STT_CACHE_NAME = `screenclip-stt-model-v${STT_CACHE_SCHEMA_VERSION}`;
export const STT_CACHE_NAME_PREFIX = 'screenclip-stt-model-v';

const MODEL_BASE_URL = `https://huggingface.co/${STT_MODEL_ID}/resolve/${STT_MODEL_REVISION}/`;
const RUNTIME_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${STT_TRANSFORMERS_VERSION}/dist/ort-wasm-simd-threaded.jsep.wasm`;

export type SttAssetKind = 'model' | 'runtime';

export interface SttAsset {
    readonly key: string;
    readonly url: string;
    readonly kind: SttAssetKind;
    readonly size: number;
    readonly sha256: string;
}

function modelAsset(key: string, size: number, sha256: string): SttAsset {
    return {
        key,
        url: `${MODEL_BASE_URL}${key}`,
        kind: 'model',
        size,
        sha256,
    };
}

const MODEL_ASSETS: readonly SttAsset[] = [
    ['config.json', 2248, '2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94'],
    ['generation_config.json', 3716, '68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c'],
    ['preprocessor_config.json', 339, 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'],
    ['special_tokens_map.json', 2194, 'e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691'],
    ['tokenizer.json', 2480466, '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566'],
    ['tokenizer_config.json', 282683, '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce'],
    ['added_tokens.json', 2082, 'ce949fe720c14311cb6c446e69cfe340dc669d7b006077a6feed6ae571dd7e88'],
    ['merges.txt', 493869, '2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6'],
    ['normalizer.json', 52666, 'bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd'],
    ['vocab.json', 1036584, '50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a'],
    ['onnx/encoder_model_quantized.onnx', 10124910, 'fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e'],
    ['onnx/decoder_model_merged_quantized.onnx', 30727765, '6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0'],
].map(([key, size, sha256]) => modelAsset(String(key), Number(size), String(sha256)));

export const STT_RUNTIME_ASSET: SttAsset = {
    key: 'runtime/ort-wasm-simd-threaded.jsep.wasm',
    url: RUNTIME_URL,
    kind: 'runtime',
    size: 21596019,
    sha256: 'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39',
};

export const STT_ASSETS: readonly SttAsset[] = [...MODEL_ASSETS, STT_RUNTIME_ASSET];
export const STT_DOWNLOAD_SIZE_BYTES = STT_ASSETS.reduce((total, asset) => total + asset.size, 0);

export function isSttAssetUrl(value: string) {
    return STT_ASSETS.some(asset => asset.url === value);
}
