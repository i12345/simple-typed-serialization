import { describe, it } from "mocha"
import { assert } from "chai"
import { serializableProperty, serializableClass, serializationOptions, preSerializer, postDeserializer } from './classes.js'

describe("class decorators", () => {
    it("decorator can be used", () => {
        @serializableClass({ dynamicProperties: true })
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty({ include: false })
            b: number = 123
        }
    })

    it("class serialization options set", () => {
        @serializableClass({ dynamicProperties: true })
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty({ include: false })
            b: number = 123

            c: boolean = true
        }

        const options = serializationOptions(A)

        assert.isTrue(options.dynamicProperties)
        assert.equal(options.properties.length, 2)
        assert.equal(options.properties[0].include ?? true, true)
        assert.equal(options.properties[1].include ?? true, false)
    })

    function testSerializer(cls: Function & { new(): any }) {
        const options = serializationOptions(cls)

        const serialized_expected = {
            a: "abc: T",
            b: 123
        }
        const serialized_actual = options.preSerializer!(new cls(), undefined!)

        assert.deepEqual(serialized_actual, serialized_expected)
    }

    function testDeserializer(cls: Function & { new(): any }) {
        const options = serializationOptions(cls)

        const serialized_form = {
            a: "abc: T",
            b: 123
        }

        const serialized =
            options.instantiateClass ?
                Object.assign(new cls(), serialized_form) :
                serialized_form

        const deserialized_expected = {
            a: "abc",
            b: 123,
            c: true
        }
        const deserialized_actual = options.postDeserializer!(serialized, undefined!)

        assert.deepEqual(deserialized_actual, deserialized_expected)
        assert.isTrue(deserialized_actual instanceof cls)
    }

    it("instance serializer (decorated)", () => {
        @serializableClass()
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            @preSerializer
            toSimplifiedForm() {
                return {
                    a: `${this.a}: ${this.c ? "T" : "F"}`,
                    b: this.b
                }
            }
        }

        testSerializer(A)
    })

    it("instance serializer (named)", () => {
        @serializableClass({ preSerializer: "toSimplifiedForm" })
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            toSimplifiedForm() {
                return {
                    a: `${this.a}: ${this.c ? "T" : "F"}`,
                    b: this.b
                }
            }
        }

        testSerializer(A)
    })

    it("static serializer (decorated)", () => {
        @serializableClass()
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            @preSerializer
            static toSimplifiedForm(instance: A) {
                return {
                    a: `${instance.a}: ${instance.c ? "T" : "F"}`,
                    b: instance.b
                }
            }
        }

        testSerializer(A)
    })

    it("static serializer (named)", () => {
        @serializableClass({ preSerializer: "toSimplifiedForm" })
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            static toSimplifiedForm(instance: A) {
                return {
                    a: `${instance.a}: ${instance.c ? "T" : "F"}`,
                    b: instance.b
                }
            }
        }

        testSerializer(A)
    })

    it("instance deserializer (decorated)", () => {
        @serializableClass()
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            @postDeserializer
            fromSimplifiedForm(serialized: A) {
                assert.isUndefined(serialized)

                const [a, c] = this.a.split(":")
                this.a = a
                assert.isTrue(c === " T" || c === " F")
                this.c = (c === " T")

                this.b = this.b
            }
        }
        
        testDeserializer(A)
    })

    it("instance deserializer (named)", () => {
        @serializableClass({ postDeserializer: "fromSimplifiedForm" })
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            fromSimplifiedForm(serialized: A) {
                assert.isUndefined(serialized)

                const [a, c] = this.a.split(":")
                this.a = a
                assert.isTrue(c === " T" || c === " F")
                this.c = (c === " T")

                this.b = this.b
            }
        }
        
        testDeserializer(A)
    })

    it("static deserializer (decorated)", () => {
        @serializableClass()
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            @postDeserializer
            static fromSimplifiedForm(serialized: A) {
                const deserialized = new A()
                
                const [a, c] = serialized.a.split(":")
                deserialized.a = a
                assert.isTrue(c === " T" || c === " F")
                deserialized.c = (c === " T")

                deserialized.b = serialized.b
                return deserialized
            }
        }
        
        testDeserializer(A)
    })

    it("static deserializer (named)", () => {
        @serializableClass({ postDeserializer: "fromSimplifiedForm" })
        class A {
            @serializableProperty()
            a: string = "abc"

            @serializableProperty()
            b: number = 123

            c: boolean = true

            static fromSimplifiedForm(serialized: A) {
                const deserialized = new A()
                
                const [a, c] = serialized.a.split(":")
                deserialized.a = a
                assert.isTrue(c === " T" || c === " F")
                deserialized.c = (c === " T")

                deserialized.b = serialized.b
                return deserialized
            }
        }
        
        testDeserializer(A)
    })
})