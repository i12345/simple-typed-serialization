import 'reflect-metadata'
import { fullname } from "type-namespace"
import { CANNOT_SERIALIZE, SerializationContext, Serializer } from "../../serialization.js"

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

    static readonly getset = new GetSetMethodPropertyAccessor({
        get: "get",
        set: "set"
    })
    static readonly getset_ = new GetSetMethodPropertyAccessor({
        get: "get_",
        set: "set_"
    })
}

const defaultPropertyAccessor: PropertyAccessor = {
    get(property, target) {
        return target[property]
    },
    set(property, target, value) {
        target[property] = value
    }
}

export interface PropertySpecializationOptions {
    key: PropertyKey
    include?: boolean
    customSerializer?: Serializer
    accessor?: PropertyAccessor
    canDeserializeIntoDefaultValue?: boolean
    mustDeserializeIntoDefaultValue?: boolean

    /**
     * @default false
     */
    preDeserialize?: boolean
}

export type PreSerializer<T, Serialized> = (item: T, context: SerializationContext) => Serialized
export type PreDeserializer<Serialized> = (preDeserialized: Partial<Serialized>, context: SerializationContext) => Partial<Serialized>
export type PostDeserializer<T, Serialized> = (deserialized: Serialized, context: SerializationContext) => T

export class ClassSerializationOptions<
        T = any,
        Serialized = T
    > {
    dynamicProperties: boolean = false

    instantiateClass: boolean = true
    requiresExistingInstance: boolean = false
    useInstanceOverPreDeserializer?: boolean = true
    preSerializer?: PreSerializer<T, Serialized>
    preDeserializer?: PreDeserializer<Serialized>
    postDeserializer?: PostDeserializer<T, Serialized>

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

    readonly preDeserializeProperties?: PropertySpecializationOptions[]
    readonly regularProperties: PropertySpecializationOptions[]

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

        if (directOptions.preDeserializer) {
            this.preDeserializeProperties = directOptions.properties.filter(({ preDeserialize }) => preDeserialize ?? false)
            this.regularProperties = this.properties.filter(property => !this.preDeserializeProperties!.includes(property))
        }
        else this.regularProperties = this.properties
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
            item = scheme.directOptions.preSerializer(item, context)
        
        const propertiesReviewed = new Set<PropertyKey>()
        
        function serializeProperty(property: PropertySpecializationOptions) {
            propertiesReviewed.add(property.key)
            
            if (property.include === false)
                return
            
            const accessor = property.accessor ?? defaultPropertyAccessor
            const value = accessor.get(property.key, item)

            if (property.customSerializer) {
                const customSchemeID = property.customSerializer.serializationSchemeID(value)
                if (customSchemeID !== CANNOT_SERIALIZE) {
                    writer.writeUint32(customSchemeID)
                    property.customSerializer.serialize(value, customSchemeID, context)
                }
            }
            else context.serialize(value)
        }

        if (scheme.preDeserializeProperties)
            for (const property of scheme.preDeserializeProperties)
                serializeProperty(property)
        for (const property of scheme.regularProperties)
            serializeProperty(property)

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

        const useInstanceOverPreDeserializer = scheme.directOptions.useInstanceOverPreDeserializer ?? true

        if (scheme.directOptions.requiresExistingInstance ?? false)
            if (instance === undefined)
                throw new Error(`Scheme for ${fullname(scheme.type)} requires an instance to deserialize into`)

        let object = (useInstanceOverPreDeserializer ?
            (
                instance ?? (
                    scheme.directOptions.preDeserializer ? {} : (
                        scheme.directOptions.instantiateClass ?
                            new (scheme.type as { new(): any })() :
                            {}
                    )
                )
            ) :
            (
                scheme.directOptions.preDeserializer ? {} : (
                    instance ?? (
                        scheme.directOptions.instantiateClass ?
                            new (scheme.type as { new(): any })() :
                            {}
                    )
                )
            )
        )
        
        function deserializeProperty(property: PropertySpecializationOptions, useAccesors = true) {
            if (property.include === false)
                return
            
            const accessor = (useAccesors ? property.accessor : undefined) ?? defaultPropertyAccessor
            
            const canDeserializeIntoDefaultValue = property.canDeserializeIntoDefaultValue ?? true
            const mustDeserializeIntoDefaultValue = property.mustDeserializeIntoDefaultValue ?? false
            
            if (mustDeserializeIntoDefaultValue && !canDeserializeIntoDefaultValue)
                throw new Error(`class deserialization: ${fullname(scheme.type)}[${property.key.toString()}]` +
                    `must be deserialized into default value yet cannot be deserialized into default value`)

            const defaultValue = canDeserializeIntoDefaultValue ? accessor.get(property.key, object) : undefined
            const value = context.deserialize(property.customSerializer, undefined, defaultValue)
            const didDeserializeIntoDefaultValue = (value === undefined)
            
            if (!mustDeserializeIntoDefaultValue && !didDeserializeIntoDefaultValue)
                accessor.set(property.key, object, value)
        }
        
        if (object === instance) {
            for (const property of scheme.properties)
                deserializeProperty(property)
            
            context.setReference(referenceID, object)
        }
        else {
            if (scheme.preDeserializeProperties) {
                for (const property of scheme.preDeserializeProperties)
                    deserializeProperty(property, false)
            
                object = scheme.directOptions.preDeserializer!(object, context)
                context.setReference(referenceID, object)
            }
            else if (scheme.directOptions.instantiateClass)
                context.setReference(referenceID, object)
            else {
                // There will be no reference available for this (potentially
                // half-deserialized) object while it is still deserializing.
            }

            for (const property of scheme.regularProperties)
                deserializeProperty(property)
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
            object = scheme.directOptions.postDeserializer(object, context)
        
        if (instance !== undefined && object === instance)
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
    preSerializer?: PreSerializer<any, any> | PropertyKey
    preDeserializer?: PreDeserializer<any> | PropertyKey
    postDeserializer?: PostDeserializer<any, any> | PropertyKey
    instantiateClass?: boolean
    requiresExistingInstance?: boolean
    useInstanceOverPreDeSerializer?: boolean
}

// function isSerializableClassOptions(options?: SerializableClassDecoratorOptions | any) {
//     return options && ['dynamicProperties', 'preSerializer', 'postDeserializer'].some(key => key in options)
// }

export const preSerializer: MethodDecorator = (target, key) => {
    const isStatic = 'prototype' in target
    const method = (target as any)[key] as Function
    const type = isStatic ? target as Function : target.constructor
    const options = serializationOptions(type)
    options.preSerializer = (isStatic ?
        method :
        (item, context) => method.call(item, context)
    ) as PreDeserializer<any>
}

export const preDeserializer: MethodDecorator = (target, key) => {
    const isStatic = 'prototype' in target
    if (!isStatic)
        throw new Error("preDeserializer must be a static method")
    const method = (target as any)[key] as Function
    const type = target as Function
    const options = serializationOptions(type)
    options.preDeserializer = method as PreDeserializer<any>
    options.instantiateClass = false
}

export const postDeserializer: MethodDecorator = (target, key) => {
    const isStatic = 'prototype' in target
    const method = (target as any)[key] as Function
    const type = isStatic ? target as Function : target.constructor
    const options = serializationOptions(type)
    options.postDeserializer = (isStatic ?
        method :
        (deserialized, context) => method.call(deserialized, context) ?? deserialized
    ) as PostDeserializer<any, any>
    options.instantiateClass ??= !isStatic
}

export function serializableClass(options?: SerializableClassDecoratorOptions): ClassDecorator {
    const classOptions = options ? options : {}

    return target => {
        const options = serializationOptions(target)
        options.useInstanceOverPreDeserializer = classOptions.useInstanceOverPreDeSerializer
        options.requiresExistingInstance = classOptions.requiresExistingInstance ?? false
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
                                (item, context) => ((item as any)[classOptions.preSerializer as PropertyKey] as (context: SerializationContext) => any)(context) :
                                undefined
                    )
            ) : undefined
        )

        options.preDeserializer ??= (
            classOptions.preDeserializer ? (
                classOptions.preDeserializer instanceof Function ?
                    classOptions.preDeserializer :
                    (target as any)[classOptions.preDeserializer]
            ) : undefined
        )

        options.postDeserializer ??= (
            classOptions.postDeserializer ? (
                classOptions.postDeserializer instanceof Function ?
                    classOptions.postDeserializer : (
                        classOptions.postDeserializer in target ?
                            (target as any)[classOptions.postDeserializer] :
                            classOptions.postDeserializer in target.prototype ?
                                (item, context) => {
                                    ((item as any)[classOptions.postDeserializer as PropertyKey] as (context: SerializationContext) => any)(context)
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
            let usingDefaultGetSetAccessor = false
            if (key.startsWith("get_") || key.startsWith("set_")) {
                propertyOptions.accessor ??= GetSetMethodPropertyAccessor.getset_
                key = key.substring("get_".length)
                usingDefaultGetSetAccessor = true
            }
            else if (key.startsWith("get") || key.startsWith("set")) {
                propertyOptions.accessor ??= GetSetMethodPropertyAccessor.getset
                key = key.substring("get".length)
                usingDefaultGetSetAccessor = true
            }

            if (usingDefaultGetSetAccessor) {
                const accessor = (propertyOptions.accessor! as GetSetMethodPropertyAccessor)
                const getter = accessor.prefix.get + key
                const setter = accessor.prefix.set + key
                if (!(setter in target))
                    propertyOptions.mustDeserializeIntoDefaultValue ??= true
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