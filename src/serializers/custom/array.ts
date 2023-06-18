import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

export class ArraySerializer<T = any> extends SingleSchemeSerializer<T[]> {
    protected canSerialize(item: T[]): boolean {
        return Array.isArray(item)
    }

    serialize(item: T[], schemeID: number, context: SerializationContext): void {
        const writer = context.writer!

        writer.writeUint32(item.length)
        for (let i = 0; i < item.length; i++)
            context.serialize(item[i])
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number): T[] {
        const reader = context.reader!

        const result = new Array(reader.readUint32())
        context.addReference(referenceID, result)

        for (let i = 0; i < result.length; i++)
            result[i] = context.deserialize()
        
        return result
    }
}