import { serializableClass, serializableProperty } from "../custom/classes.js";

serializableProperty()({ constructor: Date }, "time")
serializableClass({
    preSerializer: item => ({ time: (item as Date).getTime() }),
    postDeserializer: item => new Date((item as { time: number }).time),
    instantiateClass: false
})(Date)