import { describe, it } from "mocha"
import { assert } from "chai"
import { DataViewByteReader, DataViewByteWriterChunkedDynamic } from "byte-rw"
import { serializableClass, serializableProperty, serializableSymbol, defaultDeserializationContext, defaultSerializationContext } from "./index.js"

describe("Serialization can be deserialized", () => {
    function serialize(value: any) {
        const writer = new DataViewByteWriterChunkedDynamic()
        const context = defaultSerializationContext(writer)
        context.serialize(value)
        return writer.combineChunks()
    }

    function deserialize(view: DataView): any {
        const reader = new DataViewByteReader(view)
        const context = defaultDeserializationContext(reader)
        return context.deserialize()
    }

    function deserializeSerialization(value: any) {
        const buffer = serialize(value)
        console.log(`${buffer.byteLength} bytes`)
        return deserialize(new DataView(buffer))
    }

    function testSerializeDeserialize(value: any) {
        const deserialized = deserializeSerialization(value)
        assert.deepEqual(deserialized, value)
    }

    const symA = Symbol("A")
    const symB = Symbol("B")
    const symC = Symbol()

    serializableSymbol(symA)
    serializableSymbol(symB, "ns::B")
    serializableSymbol(symC, "C")

    @serializableClass()
    class Document {
        @serializableProperty()
        public related: Document[] = []

        @serializableProperty()
        public title: string

        @serializableProperty()
        public contents: string

        constructor(
            title: string,
            contents: string,
        ) { 
            this.title = title
            this.contents = contents
        }
    }

    const cases: { [type: string]: any[] } = {
        "literal/undefined": [
            undefined,
        ],
        "literal/null": [
            null,
        ],
        "literal/boolean": [
            true,
            false
        ],
        "literal/number": [
            0,
            123,
            -500,
            Infinity,
            Number.EPSILON,
            Number.MIN_VALUE,
            Number.MAX_SAFE_INTEGER
        ],
        "literal/string": [
            "abc",
            "",
            "Serialized string"
        ],
        "literal/symbol": [
            symA,
            symB,
            symC
        ],
        "literal/arraybuffer": [
            new ArrayBuffer(0),
            new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]).buffer,
        ],
        "objects/Date": [
            new Date(),
            new Date(239402340),
            new Date("June 17, 2023"),
        ],
        "objects/RegExp": [
            /Once upon a time.*The End/m,
            /ab.*c/,
            /.*[.](ts|js)/,
        ],
        "objects/TypedArray/uint8": [
            new Uint8Array(),
            new Uint8Array([0, 5, 1, 8, 243, 255]),
        ],
        "objects/TypedArray/uint8clamped": [
            new Uint8ClampedArray(),
            new Uint8ClampedArray([0, 5, 1, 8, 243, 255]),
        ],
        "objects/TypedArray/int8": [
            new Int8Array(),
            new Int8Array([0, 5, 1, -8, -100, 127]),
        ],
        "objects/TypedArray/uint16": [
            new Uint16Array(),
            new Uint16Array([0, 5, 1, 8, 100, 60_000]),
        ],
        "objects/TypedArray/int16": [
            new Int16Array(),
            new Int16Array([0, 5, 1, -8, -100, -30_000]),
        ],
        "objects/TypedArray/uint32": [
            new Uint32Array(),
            new Uint32Array([0, 5, 1, 8, 100, 60_000]),
        ],
        "objects/TypedArray/int32": [
            new Int32Array(),
            new Int32Array([0, 5, 1, -8, -100, -30_000]),
        ],
        "objects/TypedArray/biguint64": [
            new BigUint64Array(),
            new BigUint64Array([0n, 234n, 239402348n]),
        ],
        "objects/TypedArray/bigint64": [
            new BigInt64Array(),
            new BigInt64Array([0n, 234n, -239402348n]),
        ],
        "objects/TypedArray/float32": [
            new Float32Array(),
            new Float32Array([0, 5, 1, 8, Infinity, -2, 10]),
        ],
        "objects/TypedArray/float64": [
            new Float64Array(),
            new Float64Array([0, 5, 1, 8, Infinity, -2, 10]),
            new Float64Array([Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]),
        ],
        "objects/TypedArray/dataview": [
            new DataView(new ArrayBuffer(0)),
            new DataView(new ArrayBuffer(10)),
            new DataView(new Uint8Array([10, 20, 30, 40, 50]).buffer),
        ],
        "custom/array": [
            [1, "str", true],
            ["header", ["sub1", "sub2"]]
        ],
        "custom/set": [
            new Set([]),
            new Set([4,7,10]),
            new Set([4, -10]),
        ],
        "custom/map": [
            new Map(),
            new Map([
                ["cow", "mammal"],
                ["horse", "mammal"],
                ["zebra", "mammal"],
                ["dove", "bird"],
                ["lizard", "reptile"],
            ]),
        ],
        "custom/classes": [
            new Document("TypeScript", "Lorem ipsum..."),

            Object.assign(new Document("TypeScript", "Lorem ipsum..."), {
                related: [
                    new Document("JavaScript", "JavaScript is a programming language..."),
                    new Document("Typed languages", "Static type checking..."),
                ]
            }),

            {
                "abc": 123,
                [456]: symB
            },
        ]
    }

    for (const [type, values] of Object.entries(cases))
        for (const [i, value] of Object.entries(values))
            it(`${type}/${i}`, () => testSerializeDeserialize(value))

    it("objects/meshed/0", () => {
        const original_A = new Document("Document A", "...")
        const original_B = new Document("Document B", "...")
        const original_C = new Document("Document C", "...")
        original_A.related.push(original_B, original_C)
        original_B.related.push(original_A)

        const new_A = deserializeSerialization(original_A) as Document
        assert.equal(new_A.related.length, 2)

        const new_B = new_A.related[0]
        const new_C = new_A.related[1]

        assert.deepEqual(new_A.related, [new_B, new_C])
        assert.deepEqual(new_B.related, [new_A])
        assert.deepEqual(new_C.related, [])

        const original_documents = [original_A, original_B, original_C]
        const new_documents = [new_A, new_B, new_C]
        for (let i = 0; i < new_documents.length; i++) {
            assert.equal(new_documents[i].title, original_documents[i].title)
            assert.equal(new_documents[i].contents, original_documents[i].contents)
        }
    })

    it("objects/meshed/1", () => {
        const original_A = new Document("Document A", "...")
        const original_B = new Document("Document B", "...")
        const original_C = new Document("Document C", "...")
        const original_D = new Document("Document D", "...")
        const original_E = new Document("Document E", "...")
        original_A.related.push(original_B, original_C)
        original_B.related.push(original_E, original_E, original_B, original_C)
        original_C.related.push(original_D)
        original_D.related.push(original_E)
        original_E.related.push(original_C, original_A, original_B)

        const new_A = deserializeSerialization(original_A) as Document
        assert.equal(new_A.related.length, 2)

        const new_B = new_A.related[0]
        const new_C = new_A.related[1]
        const new_D = new_C.related[0]
        const new_E = new_D.related[0]

        assert.deepEqual(new_A.related, [new_B, new_C])
        assert.deepEqual(new_B.related, [new_E, new_E, new_B, new_C])
        assert.deepEqual(new_C.related, [new_D])
        assert.deepEqual(new_D.related, [new_E])
        assert.deepEqual(new_E.related, [new_C, new_A, new_B])

        const original_documents = [original_A, original_B, original_C, original_D, original_E]
        const new_documents = [new_A, new_B, new_C, new_D, new_E]
        for (let i = 0; i < new_documents.length; i++) {
            assert.equal(new_documents[i].title, original_documents[i].title)
            assert.equal(new_documents[i].contents, original_documents[i].contents)
        }
    })
})