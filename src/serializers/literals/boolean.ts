import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

enum BoolUint8 {
    TRUE = 0xFF,
    FALSE = 0x00
}

export class BooleanSerializer extends SingleSchemeSerializer<boolean> {
    protected canSerialize(item: boolean): boolean {
        return typeof item === 'boolean'
    }

    serialize(item: boolean, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!
        writer.writeUint8(item ? BoolUint8.TRUE : BoolUint8.FALSE)
    }

    deserialize(schemeID: number, context: SerializationContext): boolean {
        const reader = context.reader!
        switch (reader.readUint8()) {
            case BoolUint8.TRUE:
                return true
            case BoolUint8.FALSE:
                return false
            default:
                throw new Error("invalid value")
        }
    }
}