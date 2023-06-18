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

    deserialize(schemeID: number, context: SerializationContext, referenceID: number, instance?: any): ArrayBufferLike {
        const reader = context.reader!
        const length = reader.readUint32()
        if (instance && !(instance instanceof ArrayBuffer || instance instanceof SharedArrayBuffer))
            throw new Error("instance should be an ArrayBufferLike")
        if (instance && (instance as ArrayBufferLike).byteLength !== length)
            throw new Error(`instance length ${instance.byteLength} does not match expected length ${length}`)
        const bytes = new Uint8Array(instance ?? length)
        reader.readBytes(bytes)
        return bytes.buffer
    }
}