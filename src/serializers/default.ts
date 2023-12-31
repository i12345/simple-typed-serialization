import { Serializer } from '../serialization.js'
import { serializers_literal } from './literals/index.js'
import { serializers_custom } from './custom/index.js'
import { serializers_common } from './common/index.js'
import './common/index.js'

export const serializers_default: () => Serializer[] = () => [
    ...serializers_literal(),
    ...serializers_common(),
    ...serializers_custom(),
]