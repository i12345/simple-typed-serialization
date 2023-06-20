import { ByteReader, ByteWriter } from "byte-rw"

export enum SerializationMode {
    "serialize",
    "deserialize"
}

export class SerializationContext {
    private readonly SCHEME_REFERENCE = 0
    private readonly references: any[] = []

    private schemeID_next = 1
    private readonly schemeIDs_serializers = new Map<number, Serializer>()

    public readonly reader?: ByteReader
    public readonly writer?: ByteWriter

    constructor(
        public readonly serializers: Serializer[],
        public readonly mode: SerializationMode,
        public readonly stream: ByteReader | ByteWriter
    ) { 
        switch (mode) {
            case SerializationMode.serialize:
                this.writer = stream as ByteWriter
                for (const serializer of this.serializers)
                    serializer.preSerialize(this)
                break
            case SerializationMode.deserialize:
                this.reader = stream as ByteReader
                for (const serializer of this.serializers)
                    serializer.preDeserialize(this)
                break
            default:
                throw new Error("invalid mode")
        }
    }

    serialize(item: any) {
        const writer = this.writer!

        const referenceID = this.references.indexOf(item)
        if (referenceID !== -1) {
            writer.writeUint32(this.SCHEME_REFERENCE)
            writer.writeUint32(referenceID)
        }
        else {
            this.references.push(item)
            for (const serializer of this.serializers) {
                const schemeID = serializer.serializationSchemeID(item)
            
                if (schemeID != CANNOT_SERIALIZE) {
                    writer.writeUint32(schemeID)
                    serializer.serialize(item, schemeID, this)
                    break
                }
            }
        }
    }

    deserialize<T = any>(serializer?: Serializer<T>, schemeID?: number, instance?: any) {
        const reader = this.reader!

        schemeID ??= reader.readUint32()
        if (schemeID === this.SCHEME_REFERENCE) {
            const referenceID = reader.readUint32()
            return this.references[referenceID]
        }
        else {
            serializer ??= this.schemeIDs_serializers.get(schemeID)
        
            if (!serializer)
                return undefined
        
            const referenceID = this.newReferenceID()
            const deserialized = serializer.deserialize(schemeID, this, referenceID, instance)
            this.setReference(referenceID, deserialized ?? instance)
            return deserialized
        }
    }

    nextSchemeID() {
        if (this.mode !== SerializationMode.serialize)
            throw new Error()
        
        return this.schemeID_next++
    }

    registerSchemeID(schemeID: number, serializer: Serializer) { 
        this.schemeIDs_serializers.set(schemeID, serializer)
    }

    private newReferenceID() {
        return this.references.push(undefined) - 1
    }

    setReference(referenceID: number, object: any) {
        this.references[referenceID] = object
    }
}

export const CANNOT_SERIALIZE = -1

export interface Serializer<T = any> {
    /**
     * Runs before serialization of any items
     * 
     * This method should acquire serialization scheme IDs and write
     * information so the serialization schemes can be discerned when
     * deserializing.
     * 
     * @param context the serialization context
     */
    preSerialize(context: SerializationContext): void

    /**
     * Runs before deserialization of any items
     * 
     * This method should read serialization schemes and acquire corresponding
     * serialization scheme IDs so it will be put in charge over deserializing
     * corresponding items.
     * 
     * @param context the serialization context
     */
    preDeserialize(context: SerializationContext): void

    /**
     * Tests whether this serializer can serialize a given item and returns
     * the serialization scheme ID if so.
     * @param item the item to test whether this serializer can serialize it
     * @returns serialization scheme ID for the item; returns
     * {@link CANNOT_SERIALIZE} if this serializer cannot serialize the item.
     */
    serializationSchemeID(item: T): number

    /**
     * Serializes an item using a given serialization scheme
     * 
     * @param item the item to serialize
     * @param schemeID the serialization scheme to use
     * @param context the serialization context
     */
    serialize(item: T, schemeID: number, context: SerializationContext): void

    /**
     * Deserializes an item using a given serialization scheme.
     * @param schemeID the scheme to deserialize using
     * @param context the serialization context
     * @param referenceID the reference ID for the object that will be
     * deserialized, so that it can refer to itself if possible and needed
     * @param instance the instance to fill with the deserialized value
     * for when the instance was already made, by a constructor or somewhere
     * else
     * @returns the deserialized item or undefined if the item was
     * deserialized into the instance
     */
    deserialize(
        schemeID: number,
        context: SerializationContext,
        referenceID: number,
        instance?: any
    ): T | undefined
}

export function isSerializer(serializer?: Serializer | any) {
    return serializer && ['preSerialize', 'preDeserialize', 'serializationScheme', 'serialize', 'deserialize'].every(key => key in serializer)
}