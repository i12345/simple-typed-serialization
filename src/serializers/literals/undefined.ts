import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js"

export class UndefinedSerializer extends SingleSchemeSerializer<undefined> {
    protected canSerialize(item: undefined): boolean {
        return item === undefined
    }

    serialize(item: undefined, schemeID: number, context: SerializationContext): void {
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number): undefined {
        return undefined
    }
}