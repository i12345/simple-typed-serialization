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

    deserialize(schemeID: number, context: SerializationContext, referenceID: number, instance?: any): Set<T> | undefined {
        const reader = context.reader!
        
        const size = reader.readUint32()
        
        if (instance)
            if (!(instance instanceof Set))
                throw new Error("instance should be a Set")

        const result = (instance as Set<T> | undefined) ?? new Set<T>()
        context.setReference(referenceID, result)

        for (let i = 0; i < size; i++)
            result.add(context.deserialize())
        
        if (instance)
            return undefined
        return result
    }
}