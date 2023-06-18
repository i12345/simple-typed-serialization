import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js";

export class MapSerializer<K = any, V = any> extends SingleSchemeSerializer<Map<K, V>> {
    protected canSerialize(item: Map<K, V>): boolean {
        return item instanceof Map
    }

    serialize(item: Map<K, V>, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!

        writer.writeUint32(item.size)

        for (const [key, value] of item.entries()) {
            context.serialize(key)
            context.serialize(value)
        }
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number, instance?: any): Map<K, V> | undefined {
        const reader = context.reader!

        const size = reader.readUint32()

        if (instance)
            if (!(instance instanceof Map))
                throw new Error("instance should be a Map")

        const map = (instance as Map<K, V> | undefined) ?? new Map<K, V>()
        context.setReference(referenceID, map)

        for (let i = 0; i < size; i++) {
            const key = context.deserialize()
            const value = context.deserialize()
            map.set(key, value)
        }

        if (instance)
            return undefined
        return map
    }
}