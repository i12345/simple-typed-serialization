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

    deserialize(schemeID: number, context: SerializationContext, referenceID: number, instance?: T[]): T[] | undefined {
        const reader = context.reader!
    
        const length = reader.readUint32()

        if (instance) {
            if (!Array.isArray(instance))
                throw new Error("Must deserialize into an array")
            // else if (instance.length !== length)
            //     throw new Error(`Instance.length ${instance.length} !== deserialized length ${length}`)
        }

        const result = instance ?? new Array(length)
        context.addReference(referenceID, result)

        for (let i = 0; i < length; i++)
            result[i] = context.deserialize()
     
        if (instance !== undefined)
            return undefined
        return result
    }
}