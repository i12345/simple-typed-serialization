import { CANNOT_SERIALIZE, SerializationContext, Serializer } from "../../serialization.js";

const registry = new Map<string, symbol>()

export function serializableSymbol(sym: symbol, description = sym.description) {
    if (description === undefined)
        throw new Error("symbol must have description or it must be given separately")
    
    registry.set(description, sym)
}

export class SymbolSerializer implements Serializer<symbol> {
    private readonly symbol_schemeID = new Map<symbol, number>()
    private readonly schemeID_symbol = new Map<number, symbol>()

    preSerialize(context: SerializationContext): void {
        const writer = context.writer!

        writer.writeUint32(registry.size)

        for (const [description, sym] of registry) {
            const schemeID = context.nextSchemeID()

            writer.writeUint32(schemeID)
            writer.writeString(description)

            this.symbol_schemeID.set(sym, schemeID)
            this.schemeID_symbol.set(schemeID, sym)
        }
    }

    preDeserialize(context: SerializationContext): void {
        const reader = context.reader!

        const n_symbols = reader.readUint32()
        for (let i = 0; i < n_symbols; i++) {
            const schemeID = reader.readUint32()
            const description = reader.readString()
            const symbol = registry.get(description)

            if (symbol === undefined)
                throw new Error(`Symbol "${description}" not found in registry`)

            context.registerSchemeID(schemeID, this)
            
            this.symbol_schemeID.set(symbol, schemeID)
            this.schemeID_symbol.set(schemeID, symbol)
        }
    }

    serializationSchemeID(item: symbol): number {
        return this.symbol_schemeID.get(item) ?? CANNOT_SERIALIZE
    }

    serialize(): void {
    }

    deserialize(schemeID: number): symbol {
        return this.schemeID_symbol.get(schemeID)!
    }
}