import { serializableClass, serializableProperty } from "../custom/classes.js";

interface RegExpSerialized {
    source: string
    flags: string
}

serializableProperty()({ constructor: RegExp }, "source")
serializableProperty()({ constructor: RegExp }, "flags")

serializableClass({
    preSerializer(item) {
        const regex = item as RegExp
        return {
            source: regex.source,
            flags: regex.flags,
        } as RegExpSerialized
    },
    postDeserializer(item) {
        const serialized = item as RegExpSerialized
        return new RegExp(serialized.source, serialized.flags)
    },
    instantiateClass: false
})(RegExp)