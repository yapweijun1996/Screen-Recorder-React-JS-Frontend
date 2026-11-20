# Meeting Workflow Proposal

This document proposes a meeting workflow for ScreenClip Pro. It builds on local browser transcription and whole-recording MP3 export.

## Product flow

1. The user opens a completed screen recording in the editor or selects an MP3 in the transcription tool. A converter result can feed the same transcript workflow.
2. The user chooses **Generate transcript**. The default uses the existing local worker and model cache. The user can edit the text and inspect source cues when timing is available.
3. Choose **Export MP3 (Whole Recording)** to save the original recording's audio with the displayed bitrate. A future **Kept segments** action can use the same ordered ranges and output timing as trimmed video. [MP3 export pipeline](EXPORT_PIPELINE.md#mp3-conversion-and-result-lifetime)
4. A Meeting Memo tab presents editable sections for decisions, actions, open questions, and source cues.
5. The user reviews the memo, then exports the transcript or memo.

The editor's **Audio** format still serves trimmed or full M4A or WebM/Opus exports. The converter hands its MP3 Blob to transcription in memory. Use that same handoff when offering transcription after an editor audio export. [Editor export controller](../src/components/editor/useEditorExportController.ts#L23) · [Converter result](../src/components/ConverterResult.tsx#L56)

## Transcript outputs

The existing local workflow already exports plain text (`.txt`) and SRT (`.srt`). Add UTF-8 Markdown (`.md`) with a title and edited transcript paragraphs. Offer optional timecodes in Markdown and plain text when source timing is available. Text-only providers can still produce both formats. Offer SRT only when the output contains validated start and end timestamps, and explain when it is unavailable. The memo is a separate download.

The UI should show the selected format, cue count, and source recording range before download. Editing a cue marks the transcript as pending review and protects it from accidental reset or update reload.

## Meeting Memo tab

The memo is generated from the reviewed transcript and stays editable. It has
four explicit sections:

- Decisions
- Actions
- Open questions
- Source cues

Use evidence from the transcript for decisions, actions and open questions. Leave an action's owner or deadline blank when the transcript omits it. Link each item to one or more source cue IDs, quote excerpts for text-only transcripts, and show timecodes when the reviewer can jump back to the recording.

The memo supports regeneration with a replace confirmation, manual edits, source-cue inspection, and final review before export. Memo export should use Markdown or plain text. SRT remains a transcript-only format.

## Optional BYOK providers

Add a **Settings → Transcription and summary** section with **On this device** selected by default, optional OpenAI and OpenRouter providers, and per-provider credential status and remove controls. Put the active provider next to **Generate transcript**. Use OpenAI structured outputs to turn the edited transcript into a draft memo. Each remote job requires explicit consent and states the provider and payload. Transcription sends only the necessary audio. Summary generation sends only the reviewed transcript text and relevant source references. Report network and quota failures in the workflow.

Cloud processing needs an optional authenticated gateway with server-side secret storage. Keep long-lived keys out of the shipped frontend, persistent browser storage, URLs, logs and exported artifacts. Show connection status without displaying the saved key. Local recording and model storage remain available to the offline workflow.

Provider failures must leave the local transcript and memo intact. A retry is explicit, bounded to the failed job, and safe to repeat without duplicating cues or memo sections. The UI identifies local, OpenAI, and OpenRouter output so users can review the origin before accepting it.

## KB-MCP integration

Saving a memo to KB-MCP is optional and separate from local export. Send the reviewed memo by default. Show a preview with the memo title, account or workspace, destination knowledge base, and content to be saved. The user confirms the exact destination and payload before the write.

The connection must be scoped to the selected destination and minimum required fields. Retry handling must use an idempotency key or equivalent deduplication check. A failed write reports the target and retry action without losing the local memo. Later retrieval is optional and must be requested by the user.

## Review and acceptance criteria

- Local transcription and editing work without provider credentials. After the
  first model download, verify an offline restart.
- Verify whole-recording MP3 bytes, MIME type and extension, and test cancellation and input without audio. Verify that the later kept-segment option matches the video export's range order and timing.
- Edited Unicode text survives Markdown and plain text downloads, including results without timestamps.
- SRT timestamps use the validated cue start and end values.
- Memo fields contain only stated facts and link back to cue IDs and timecodes.
- Provider jobs require per-job consent and expose retry and cancellation state.
- Keep provider keys and remote request data out of client logs. Avoid persisting extra payload copies for remote staging.
- KB-MCP writes show a preview, require target confirmation, and deduplicate
  retries.

## References

- [OpenAI speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [OpenRouter transcription](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/)
