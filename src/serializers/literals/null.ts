import { SerializationContext } from "../../serialization.js";
import { SingleSchemeSerializer } from "../single-scheme.js"

export class NullSerializer extends SingleSchemeSerializer<null> {
    protected canSerialize(item: null): boolean {
        return item === null
    }

    serialize(item: null, schemeID: number, context: SerializationContext): void {
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number): null {
        return null
    }
}