import { ArraySerializer } from './array.js'
import { ClassSerializer } from './classes.js'
import { MapSerializer } from './map.js'
import { SetSerializer } from './set.js'

export * from './array.js'
export * from './map.js'
export * from './set.js'
export * from './classes.js'

export const serializers_custom = () => [
    new ArraySerializer(),
    new SetSerializer(),
    new MapSerializer(),
    new ClassSerializer(),
]