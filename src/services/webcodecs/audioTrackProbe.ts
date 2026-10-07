/** Inspect track metadata only; unknown or malformed containers stay unknown.
 * WebM TrackType: https://www.matroska.org/technical/elements.html
 * MP4 handlers: https://mp4ra.org/registered-types/handlers
 */
export async function probeAudioTrack(blob: Blob): Promise<boolean | null> {
    // Bound metadata work and skip media payloads rather than loading the file.
    let remainingHeaders = 4096;
    const read = async (offset: number, size: number) => {
        if (--remainingHeaders < 0) throw new Error('Metadata inspection limit reached');
        return new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer());
    };
    const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
    const uint = (bytes: Uint8Array) => bytes.reduce((value, byte) => value * 256 + byte, 0);

    async function mp4(start: number, end: number, depth = 0): Promise<boolean | null> {
        if (depth > 3) return null;
        let foundHandler = false;
        for (let offset = start; offset < end;) {
            const header = await read(offset, 16);
            if (header.length < 8) return null;
            const type = text(header.subarray(4, 8));
            let size = uint(header.subarray(0, 4));
            const headerSize = size === 1 ? 16 : 8;
            if (size === 1) {
                if (header.length < 16) return null;
                size = uint(header.subarray(8, 16));
            } else if (size === 0) size = end - offset;
            if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) return null;
            const payload = offset + headerSize;
            if (type === 'hdlr' && depth === 3) {
                if (size < headerSize + 12) return null;
                const handler = await read(payload + 8, 4);
                if (text(handler) === 'soun') return true;
                foundHandler = true;
            } else if ((depth === 0 && type === 'moov') ||
                       (depth === 1 && type === 'trak') || (depth === 2 && type === 'mdia')) {
                const result = await mp4(payload, offset + size, depth + 1);
                if (result === true) return true;
                if (result === null) return null;
                foundHandler = true;
            }
            offset += size;
        }
        return foundHandler ? false : null;
    }

    function vint(bytes: Uint8Array, offset: number, isId: boolean) {
        const first = bytes[offset];
        if (!first) throw new Error('Invalid EBML header');
        let length = 1;
        let marker = 128;
        while (!(first & marker)) { marker >>= 1; length++; }
        if (length > (isId ? 4 : 8) || offset + length > bytes.length) throw new Error('Invalid EBML integer');
        let value = isId ? first : first & (marker - 1);
        let unknown = !isId && value === marker - 1;
        for (let i = 1; i < length; i++) {
            value = value * 256 + bytes[offset + i];
            unknown = unknown && bytes[offset + i] === 255;
        }
        return { value, length, unknown };
    }

    async function webm(start: number, end: number, depth = 0): Promise<boolean | null> {
        let foundType = false;
        for (let offset = start; offset < end;) {
            const header = await read(offset, 12);
            const id = vint(header, 0, true);
            const size = vint(header, id.length, false);
            const payload = offset + id.length + size.length;
            // Only Segment may span the rest of a streaming recording.
            if (size.unknown && id.value !== 0x18538067) return null;
            const next = size.unknown ? end : payload + size.value;
            if (!Number.isSafeInteger(next) || next > end || next < payload) return null;
            if (depth === 3 && id.value === 0x83) {
                if (size.value < 1 || size.value > 8) return null;
                const type = uint(await read(payload, size.value));
                if (type === 2) return true;
                foundType = true;
            } else if ((depth === 0 && id.value === 0x18538067) ||
                       (depth === 1 && id.value === 0x1654ae6b) ||
                       (depth === 2 && id.value === 0xae)) {
                const result = await webm(payload, next, depth + 1);
                if (result === true) return true;
                if (result === null) return null;
                if (depth <= 1) return false; // A complete Tracks table has no audio.
                foundType = true;
            }
            offset = next;
        }
        return foundType ? false : null;
    }

    try {
        const header = await read(0, 12);
        if (uint(header.subarray(0, 4)) === 0x1a45dfa3) return await webm(0, blob.size);
        if (text(header.subarray(4, 8)) === 'ftyp') return await mp4(0, blob.size);
        return null;
    } catch {
        return null;
    }
}
