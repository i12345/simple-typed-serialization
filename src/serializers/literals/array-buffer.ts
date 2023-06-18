import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

export class ArrayBufferSerializer extends SingleSchemeSerializer<ArrayBufferLike> {
    protected canSerialize(item: ArrayBufferLike): boolean {
        return item instanceof ArrayBuffer || item instanceof SharedArrayBuffer
    }

    serialize(item: ArrayBufferLike, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!
        const bytes = new Uint8Array(item)
        writer.writeUint32(bytes.byteLength)
        writer.writeBytes(bytes)
    }

    deserialize(schemeID: number, context: SerializationContext): ArrayBufferLike {
        const reader = context.reader!
        const length = reader.readUint32()
        const bytes = new Uint8Array(length)
        reader.readBytes(bytes)
        return bytes.buffer
    }
}