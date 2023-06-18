import { Serializer } from '../../serialization.js'
import './date.js'
import './regexp.js'
import { TypedArraySerializer } from './typed-array.js'
export * from './typed-array.js'

export const serializers_common: () => Serializer[] = () => [
    new TypedArraySerializer(),
]