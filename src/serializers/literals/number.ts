import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

export class NumberSerializer extends SingleSchemeSerializer<number> {
    protected canSerialize(item: number): boolean {
        return typeof item === 'number'
    }

    serialize(item: number, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!
        writer.writeFloat64(item)
    }

    deserialize(schemeID: number, context: SerializationContext): number {
        const reader = context.reader!
        return reader.readFloat64()
    }
}