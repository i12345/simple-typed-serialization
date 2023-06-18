import { UndefinedSerializer } from './undefined.js'
import { NullSerializer } from './null.js'
import { BooleanSerializer } from './boolean.js'
import { NumberSerializer } from './number.js'
import { StringSerializer } from './string.js'
import { SymbolSerializer } from './symbol.js'
import { ArrayBufferSerializer } from './array-buffer.js'

export * from './string.js'
export * from './number.js'
export * from './boolean.js'
export * from './symbol.js'
export * from './array-buffer.js'

export const serializers_literal = () => [
    new UndefinedSerializer(),
    new NullSerializer(),
    new BooleanSerializer(),
    new NumberSerializer(),
    new StringSerializer(),
    new SymbolSerializer(),
    new ArrayBufferSerializer(),
]