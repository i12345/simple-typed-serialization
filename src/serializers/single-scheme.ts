import { CANNOT_SERIALIZE, SerializationContext, Serializer } from "../serialization.js";

export abstract class SingleSchemeSerializer<T> implements Serializer<T> {
    private schemeID?: number
    
    preSerialize(context: SerializationContext): void {
        const writer = context.writer!

        const schemeID = context.nextSchemeID()
        this.schemeID = schemeID
        writer.writeUint32(schemeID)
    }
    
    preDeserialize(context: SerializationContext): void {
        const reader = context.reader!
        
        const schemeID = reader.readUint32()
        this.schemeID = schemeID
        context.registerSchemeID(schemeID, this)
    }
    
    serializationSchemeID(item: T): number {
        if (this.canSerialize(item))
            return this.schemeID!
        else return CANNOT_SERIALIZE
    }

    protected abstract canSerialize(item: T): boolean

    abstract serialize(item: T, schemeID: number, context: SerializationContext): void

    abstract deserialize(schemeID: number, context: SerializationContext, referenceID: number): T
}