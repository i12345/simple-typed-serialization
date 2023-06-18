import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

export class SetSerializer<T> extends SingleSchemeSerializer<Set<T>> {
    protected canSerialize(item: Set<T>): boolean {
        return item instanceof Set
    }

    serialize(item: Set<T>, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!

        writer.writeUint32(item.size)
        for(const value of item.values())
            context.serialize(value)
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number): Set<T> {
        const reader = context.reader!
        
        const size = reader.readUint32()
        
        const result = new Set<T>()
        context.addReference(referenceID, result)

        for (let i = 0; i < size; i++)
            result.add(context.deserialize())
        
        return result
    }
}