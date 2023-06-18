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

viewTypes.forEach(viewType => {
    serializableProperty()({ constructor: viewType }, "buffer")
    
    serializableClass({
        preSerializer(view: ArrayBufferView) {
            const buffer = view.buffer.byteLength === view.byteLength ?
                view.buffer :
                view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
            return { buffer }
        },
        postDeserializer({ buffer }: { buffer: ArrayBuffer }) {
            return new viewType(buffer)
        },
        instantiateClass: false
    })(viewType)
})