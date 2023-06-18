import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

export class StringSerializer extends SingleSchemeSerializer<string> {
    protected canSerialize(item: string): boolean {
        return typeof item === 'string'
    }

    serialize(item: string, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!
        writer.writeString(item)
    }

    deserialize(schemeID: number, context: SerializationContext): string {
        const reader = context.reader!
        return reader.readString()
    }
}