import { CANNOT_SERIALIZE, SerializationContext, Serializer } from "../../serialization.js";
import { serializableClass, serializableProperty } from "../custom/classes.js";

const viewTypes = [
    Uint8Array,
    Uint8ClampedArray,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    BigUint64Array,
    BigInt64Array,
    Float32Array,
    Float64Array,
    DataView
]

export type TypedArrayType = typeof viewTypes extends (infer T)[] ? T : never

export type TypedArray =
    Uint8Array |
    Uint8ClampedArray |
    Int8Array |
    Uint16Array |
    Int16Array |
    Uint32Array |
    Int32Array |
    BigUint64Array |
    BigInt64Array |
    Float32Array |
    Float64Array |
    DataView

export class TypedArraySerializer implements Serializer<TypedArray> {
    private readonly schemeIDs_types = new Map<number, TypedArrayType>()
    private readonly types_schemeIDs = new Map<TypedArrayType, number>()

    preSerialize(context: SerializationContext): void {
        const writer = context.writer!
        for (const type of viewTypes) {
            const schemeID = context.nextSchemeID()
            writer.writeUint32(schemeID)

            this.schemeIDs_types.set(schemeID, type)
            this.types_schemeIDs.set(type, schemeID)
        }
    }

    preDeserialize(context: SerializationContext): void {
        const reader = context.reader!
        for (const type of viewTypes) {
            const schemeID = reader.readUint32()
            context.registerSchemeID(schemeID, this)

            this.schemeIDs_types.set(schemeID, type)
            this.types_schemeIDs.set(type, schemeID)
        }
    }

    serializationSchemeID(item: TypedArray): number {
        return this.types_schemeIDs.get((item as { constructor: Function }).constructor as TypedArrayType) ?? CANNOT_SERIALIZE
    }

    serialize(item: TypedArray, schemeID: number, context: SerializationContext): void {
        context.serialize(item.buffer.slice(item.byteOffset, item.byteOffset + item.byteLength))
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number, instance?: TypedArray): TypedArray | undefined {
        const type = this.schemeIDs_types.get(schemeID)!
        
        const canUseInstance = instance && instance.buffer.byteLength === instance.byteLength
        const buffer = context.deserialize(undefined, undefined, canUseInstance ? instance.buffer : undefined) as ArrayBuffer
        
        if (canUseInstance && (buffer === undefined))
            return undefined
        return new type(buffer)
    }
}