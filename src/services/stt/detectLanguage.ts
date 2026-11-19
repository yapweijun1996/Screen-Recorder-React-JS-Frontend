import type { AutomaticSpeechRecognitionPipeline, Tensor } from '@huggingface/transformers';

type WhisperGenerationConfig = {
    decoder_start_token_id: number;
    lang_to_id: Record<string, number>;
};

type WhisperAudioProcessor = (audio: Float32Array) => Promise<{ input_features: Tensor }>;

export async function detectLanguage(
    transcriber: AutomaticSpeechRecognitionPipeline,
    audio: Float32Array,
    TensorClass: typeof Tensor,
): Promise<string> {
    const config = (transcriber.model as unknown as { generation_config: WhisperGenerationConfig }).generation_config;
    const processor = transcriber.processor as unknown as WhisperAudioProcessor;
    const { input_features } = await processor(audio);
    const decoder_input_ids = new TensorClass('int64', BigInt64Array.of(BigInt(config.decoder_start_token_id)), [1, 1]);

    // Whisper's first prediction after the start token identifies the audio language.
    // Transformers.js 3.8.1 defaults to English if the generation language is omitted.
    const { logits } = await transcriber.model.forward({ input_features, decoder_input_ids }) as { logits: Tensor };
    let selected: string | undefined;
    let best = Number.NEGATIVE_INFINITY;
    for (const [token, index] of Object.entries(config.lang_to_id)) {
        const score = Number(logits.data[index]);
        if (score > best && Number.isFinite(score)) {
            best = score;
            selected = token.slice(2, -2);
        }
    }
    if (!selected) throw new Error('Whisper did not return a language prediction.');
    return selected;
}
