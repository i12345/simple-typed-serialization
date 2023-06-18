import 'reflect-metadata'
import { fullname } from "type-namespace"
import { CANNOT_SERIALIZE, SerializationContext, Serializer, isSerializer } from "../../serialization.js"
import { SimplePropertyRetriever } from "../../utils/simple-property-retriever.js"
import { camelCase, pascalCase, snakeCase } from "change-case"

export const serializerSpecializationKey = Symbol("serializer-specialization")

export interface PropertyAccessor {
    get(property: PropertyKey, target: any): any
    set(property: PropertyKey, target: any, value: any): void
}

export class GetSetMethodPropertyAccessor implements PropertyAccessor {
    constructor(
        public readonly prefix: {
            get: string
            set: string
        },
        public readonly propertyProjector?: (property: string) => string
    ) {
    }

    get(property: PropertyKey, target: any) {
        if (typeof property !== 'string')
            throw new Error("must use string property")
        
        const projectedProperty = this.propertyProjector ? this.propertyProjector(property) : property
        
        return target[this.prefix.get + projectedProperty]()
    }

    set(property: PropertyKey, target: any, value: any) {
        if (typeof property !== 'string')
            throw new Error("must use string property")
        
        const projectedProperty = this.propertyProjector ? this.propertyProjector(property) : property
        
        target[this.prefix.set + projectedProperty](value)
    }
}

export const PropertyAccessors = {
    default: <PropertyAccessor>{
        get(property, target) {
            return target[property]
        },
        set(property, target, value) {
            target[property] = value
        }
    },

    "get/set": new GetSetMethodPropertyAccessor(
        {
            get: "get",
            set: "set"
        }
    ),

    "(get/set)PascalCase": new GetSetMethodPropertyAccessor(
        {
            get: "get",
            set: "set"
        },
        pascalCase
    ),

    "(get/set)_PascalCase": new GetSetMethodPropertyAccessor(
        {
            get: "get_",
            set: "set_"
        },
        pascalCase
    ),

    "(get/set)_camelCase": new GetSetMethodPropertyAccessor(
        {
            get: "get_",
            set: "set_"
        },
        camelCase
    ),

    "(get/set)_snake_case": new GetSetMethodPropertyAccessor(
        {
            get: "get_",
            set: "set_"
        },
        snakeCase
    ),
}

export interface PropertySpecializationOptions {
    key: PropertyKey
    include?: boolean
    customSerializer?: Serializer
    accessor?: PropertyAccessor | keyof typeof PropertyAccessors
    canDeserializeIntoDefaultValue?: boolean
    mustDeserializeIntoDefaultValue?: boolean
}

export class ClassSerializationOptions<
        T = any,
        SerializedForm = T
    > {
    dynamicProperties: boolean = false

    instantiateClass: boolean = true
    preSerializer?: (item: T) => SerializedForm
    postDeserializer?: (serialized: SerializedForm) => T

    constructor(
        public readonly type: Function,

        /**
         * This does not include inherited properties
         */
        public readonly properties: PropertySpecializationOptions[]
    ) {
        registry.set(fullname(type), this)
    }
}

/**
 * Maps from type fullname to optinos
 */
const registry = new Map<string, ClassSerializationOptions>()

const ClassSerializationOptions_genericObject = new ClassSerializationOptions(Object, [])
ClassSerializationOptions_genericObject.dynamicProperties = true
registry.clear()

class ClassSerializationScheme {
    /**
     * This includes inherited properties
     */
    readonly properties: PropertySpecializationOptions[]
    /**
     * If any base class has dynamic properties, then so does a derived class
     */
    readonly dynamicProperties: boolean

    constructor(
        public readonly type: Function,
        public readonly id: number,
        public readonly directOptions: ClassSerializationOptions
    ) {
        this.properties = []
        this.dynamicProperties = false
        for (let proto = type; proto !== Object.getPrototypeOf(Object); proto = Object.getPrototypeOf(proto)) {
            const options = (proto === type) ? directOptions : Reflect.getOwnMetadata(serializerSpecializationKey, proto) as ClassSerializationOptions
            if (options) {
                for (const newProperty of options.properties) {
                    const index = this.properties.findIndex(oldProperty => oldProperty.key === newProperty.key)
                    if (index !== -1)
                        this.properties.splice(index, 1)
                    this.properties.push(newProperty)
                }
                this.dynamicProperties ||= options.dynamicProperties
            }
        }
    }
}

enum ClassSchemeFlags {
    default = 0,
    properties_dynamic = 0x1
}

export class ClassSerializer implements Serializer {
    private SCHEME_GENERIC_OBJECT!: ClassSerializationScheme
    private readonly type_schemeID = new Map<Function, number>()
    private readonly schemes = new Map<number, ClassSerializationScheme>()

    preSerialize(context: SerializationContext): void {
        const writer = context.writer!

        this.SCHEME_GENERIC_OBJECT = new ClassSerializationScheme(
            Object,
            context.nextSchemeID(),
            ClassSerializationOptions_genericObject
        )
        writer.writeUint32(this.SCHEME_GENERIC_OBJECT.id)
        this.schemes.set(this.SCHEME_GENERIC_OBJECT.id, this.SCHEME_GENERIC_OBJECT)
        this.type_schemeID.set(Object, this.SCHEME_GENERIC_OBJECT.id)

        writer.writeUint32(registry.size)

        for (const [fullname, serializer] of registry) {
            const schemeID = context.nextSchemeID()
            writer.writeUint32(schemeID)
            writer.writeString(fullname)

            const scheme = new ClassSerializationScheme(serializer.type, schemeID, serializer)
            this.type_schemeID.set(serializer.type, schemeID)
            this.schemes.set(schemeID, scheme)

            let flags: ClassSchemeFlags = 0

            if (scheme.dynamicProperties)
                flags |= ClassSchemeFlags.properties_dynamic
            
            writer.writeUint8(flags)
        }
    }

    preDeserialize(context: SerializationContext): void {
        const reader = context.reader!

        this.SCHEME_GENERIC_OBJECT = new ClassSerializationScheme(
            Object,
            reader.readUint32(),
            ClassSerializationOptions_genericObject
        )
        this.schemes.set(this.SCHEME_GENERIC_OBJECT.id, this.SCHEME_GENERIC_OBJECT)
        this.type_schemeID.set(Object, this.SCHEME_GENERIC_OBJECT.id)
        context.registerSchemeID(this.SCHEME_GENERIC_OBJECT.id, this)

        const serialized_registry_length = reader.readUint32()

        for (let i = 0; i < serialized_registry_length; i++) {
            const schemeID = reader.readUint32()
            const fullname = reader.readString()
            const flags: ClassSchemeFlags = reader.readUint8()

            const options = registry.get(fullname)
            if (!options)
                throw new Error(`Scheme ${schemeID} references type ${fullname} but it was not found in registry`)
            
            const scheme = new ClassSerializationScheme(options.type, schemeID, options)
            this.schemes.set(schemeID, scheme)
            // this.type_schemeID.set(scheme.type, schemeID)
            context.registerSchemeID(schemeID, this)

            const flags_dynamicProperties = (flags & ClassSchemeFlags.properties_dynamic) !== 0
            if (flags_dynamicProperties !== scheme.dynamicProperties)
                throw new Error(`scheme mismatch: scheme ID ${schemeID} dynamicProperties`)
        }
    }

    serializationSchemeID(item: any): number {
        if (typeof item !== 'object')
            return CANNOT_SERIALIZE
        
        const $class = item.constructor
        if ($class === undefined || !($class instanceof Function))
            return CANNOT_SERIALIZE
        
        return this.type_schemeID.get($class) ?? this.SCHEME_GENERIC_OBJECT.id
    }

    serialize(item: any, schemeID: number, context: SerializationContext): void {
        const writer = context.writer!
        const scheme = this.schemes.get(schemeID)!

        if (scheme.directOptions.preSerializer)
            item = scheme.directOptions.preSerializer(item)

        const propertiesReviewed = new Set<PropertyKey>()
        
        for (const property of scheme.properties) {
            propertiesReviewed.add(property.key)
            
            if (property.include === false)
                continue
            
            const accessor = (
                (property.accessor as keyof typeof PropertyAccessors in PropertyAccessors) ?
                    PropertyAccessors[property.accessor as keyof typeof PropertyAccessors] :
                    (property.accessor as PropertyAccessor ?? PropertyAccessors.default)
            )

            const value = accessor.get(property.key, item)

            if (property.customSerializer) {
                const customSchemeID = property.customSerializer.serializationSchemeID(value)
                if (customSchemeID !== CANNOT_SERIALIZE) {
                    writer.writeUint32(customSchemeID)
                    property.customSerializer.serialize(value, customSchemeID, context)
                }
            }
            else context.serialize(item[property.key])
        }

        if (scheme.dynamicProperties) {
            const dynamicProperties = Reflect.ownKeys(item).filter(key => !propertiesReviewed.has(key))
            
            writer.writeUint16(dynamicProperties.length)
            for (const dynamicProperty of dynamicProperties) {
                context.serialize(dynamicProperty)
                context.serialize(item[dynamicProperty])
            }
        }
    }

    deserialize(schemeID: number, context: SerializationContext, referenceID: number, instance?: any) {
        const reader = context.reader!
        const scheme = this.schemes.get(schemeID)!

        let object = instance ?? (
            scheme.directOptions.instantiateClass ?
                new (scheme.type as { new(): any })() :
                {}
        )

        if (scheme.directOptions.instantiateClass)
            context.addReference(referenceID, object)
        
        for (const property of scheme.properties) {
            if (property.include === false)
                continue
            
            const accessor = (
                (property.accessor as keyof typeof PropertyAccessors in PropertyAccessors) ?
                    PropertyAccessors[property.accessor as keyof typeof PropertyAccessors] :
                    (property.accessor as PropertyAccessor ?? PropertyAccessors.default)
            )
            
            const canDeserializeIntoDefaultValue = property.canDeserializeIntoDefaultValue ?? true
            const mustDeserializeIntoDefaultValue = property.mustDeserializeIntoDefaultValue ?? false

            const defaultValue = canDeserializeIntoDefaultValue ? accessor.get(property.key, object) : undefined
            const value = context.deserialize(property.customSerializer, undefined, defaultValue)
            const didDeserializeIntoDefaultValue = (value === undefined)
            
            if (!mustDeserializeIntoDefaultValue && !didDeserializeIntoDefaultValue)
                accessor.set(property.key, object, value)
        }

        if (scheme.dynamicProperties) {
            const dynamicPropertyCount = reader.readUint16()
            for (let i = 0; i < dynamicPropertyCount; i++) {
                const key = context.deserialize()
                const value = context.deserialize()
                object[key] = value
            }
        }

        if (scheme.directOptions.postDeserializer)
            object = scheme.directOptions.postDeserializer(object)
        
        if (instance !== undefined)
            return undefined
        else
            return object
    }
}

export function serializationOptions(target: Function) {
    if (!Reflect.hasOwnMetadata(serializerSpecializationKey, target)) {
        const specialization = new ClassSerializationOptions(
            target,
            []
        )
        Reflect.defineMetadata(serializerSpecializationKey, specialization, target)
        return specialization
    }
    else {
        return Reflect.getOwnMetadata(serializerSpecializationKey, target) as ClassSerializationOptions
    }
}

export interface SerializableClassDecoratorOptions {
    dynamicProperties?: boolean
    preSerializer?: ((item: any) => any) | PropertyKey
    postDeserializer?: ((item: any) => any) | PropertyKey
    instantiateClass?: boolean
}

// function isSerializableClassOptions(options?: SerializableClassDecoratorOptions | any) {
//     return options && ['dynamicProperties', 'preSerializer', 'postDeserializer'].some(key => key in options)
// }

export const preSerializer: MethodDecorator = (target, key) => {
    const isStatic = 'prototype' in target
    const method = (target as any)[key] as Function
    const type = isStatic ? target as Function : target.constructor
    const options = serializationOptions(type)
    options.preSerializer = (isStatic ? method : item => method.call(item)) as (item: any) => any
}

export const postDeserializer: MethodDecorator = (target, key) => {
    const isStatic = 'prototype' in target
    const method = (target as any)[key] as Function
    const type = isStatic ? target as Function : target.constructor
    const options = serializationOptions(type)
    options.postDeserializer = (isStatic ?
        method :
        item => (method.call(item), item)
    ) as (item: any) => any
    options.instantiateClass = !isStatic
}

export function serializableClass(options?: SerializableClassDecoratorOptions): ClassDecorator {
    const classOptions = options ? options : {}

    return target => {
        const options = serializationOptions(target)
        options.dynamicProperties = classOptions.dynamicProperties ?? false
        if (classOptions.instantiateClass !== undefined)
            options.instantiateClass = classOptions.instantiateClass

        options.preSerializer ??= (
            classOptions.preSerializer ? (
                classOptions.preSerializer instanceof Function ?
                    classOptions.preSerializer : (
                        classOptions.preSerializer in target ?
                            (target as any)[classOptions.preSerializer] :
                            classOptions.preSerializer in target.prototype ?
                                (item) => ((item as any)[classOptions.preSerializer as PropertyKey] as () => any)() :
                                undefined
                    )
            ) : undefined
        )

        options.postDeserializer ??= (
            classOptions.postDeserializer ? (
                classOptions.postDeserializer instanceof Function ?
                    classOptions.postDeserializer : (
                        classOptions.postDeserializer in target ?
                            (target as any)[classOptions.postDeserializer] :
                            classOptions.postDeserializer in target.prototype ?
                                (item) => {
                                    ((item as any)[classOptions.postDeserializer as PropertyKey] as () => any)()
                                    return item
                                } :
                                undefined
                    )
            ) : undefined
        )
    }
}

//TODO: use the design:type metadata for enhanced static optimization
// so custom serializers can be made per property
// https://www.typescriptlang.org/docs/handbook/decorators.html#metadata

export type SerializablePropertyDecoratorOptions = Omit<PropertySpecializationOptions, "key">

// function isSerializablePropertyOptions(options?: PropertySpecializationOptions | any) {
//     return options && ['customSerializer', 'include'].some(key => key in options)
// }

export interface SerializablePropertyMethodDecoratorOptions extends SerializablePropertyDecoratorOptions {
    /**
     * Used for `get_` and `set_` property methods
     */
    casing?: "camelCase" | "PascalCase" | "snake_case"
}

export function serializablePropertyMethod(customSerializerOrOptions?: Serializer | SerializablePropertyDecoratorOptions): MethodDecorator {
    return (target, key) => {
        const propertyOptions: SerializablePropertyMethodDecoratorOptions = (
            customSerializerOrOptions ? (
                'serialize' in customSerializerOrOptions ? {
                    customSerializer: customSerializerOrOptions,
                } : customSerializerOrOptions
            ) : {}
        )

        if (typeof key === 'string') {
            if (key.startsWith("get_") || key.startsWith("set_")) {
                propertyOptions.accessor ??= `(get/set)_${propertyOptions.casing ?? "snake_case"}`
                key = key.substring("get_".length)
            }
            else if (key.startsWith("get") || key.startsWith("set")) {
                propertyOptions.accessor ??= "get/set"
                key = key.substring("get".length)
            }
        }
        
        const type = target.constructor
        const options = serializationOptions(type)
        options.properties.push({
            key: key,
            ...propertyOptions
        })
    }
}

export function serializableProperty(customSerializerOrOptions?: Serializer | SerializablePropertyDecoratorOptions): PropertyDecorator {
    const propertyOptions: SerializablePropertyDecoratorOptions = (
        customSerializerOrOptions ? (
            'serialize' in customSerializerOrOptions ? {
                customSerializer: customSerializerOrOptions
            } : customSerializerOrOptions
        ) : {}
    )

    return (target, key) => {
        const type = target.constructor
        const options = serializationOptions(type)
        options.properties.push({
            key: key,
            ...propertyOptions
        })
    }
}

// export function serialize(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions?: Function | SerializableClassDecoratorOptions | Function | Serializer | SerializablePropertyDecoratorOptions, propertyKey?: string | symbol) {
//     if (classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions instanceof Function) {
//         if (propertyKey !== undefined)
//             return serializableProperty()(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions as any, propertyKey)
//         else
//             return serializableClass()(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions)
//     }
//     else if (isSerializableClassOptions(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions))
//         return serializableClass(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions as ClassSerializationOptions)
//     else if (isSerializer(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions) ||
//         isSerializablePropertyOptions(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions))
//         return serializableProperty(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions as Serializer | PropertySpecializationOptions)
//     else {
//         // either:
//         // no options for class decorator
//         // no options for property decorator
        
//         return ((target, propertyKey) => {
//             if (propertyKey !== undefined)
//                 serializableProperty(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions as Serializer | PropertySpecializationOptions)(target, propertyKey)
//             else
//                 serializableClass(classTargetOrOptionsOrPropertyTargetOrCustomSerializerOrOptions as ClassSerializationOptions)(target as Function)
//         }) as ClassDecorator | PropertyDecorator
//     }
// }

// TypeScript doesn't like the mismatch in arguments
// export const serialize: ClassDecorator | PropertyDecorator = (target: Object, propertyKey?: string | symbol) => {
//     if (propertyKey)
//         serializableProperty()(target, propertyKey)
//     else
//         serializableClass()(target as Function)
// }

export function serializableClassDeclarationCustom<T>(
        target: Function,
        classOptions: SerializableClassDecoratorOptions | undefined,
        ...properties: ((keyof T) | PropertySpecializationOptions)[]
    ) {
    for (const property of properties) {
        if (typeof property === "string" || typeof property === "symbol")
            serializableProperty()(target, property)
        else {
            const options = property as PropertySpecializationOptions
            serializableProperty(options)(target, options.key as (string | symbol))
        }
    }

    serializableClass(classOptions)(target)
}

export function serializableClassDeclaration<T>(
        target: Function & { new(): T },
        ...properties: ((keyof T) | PropertySpecializationOptions)[]
    ) {
    serializableClassDeclarationCustom(target, undefined, ...properties)
}