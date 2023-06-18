import { ByteReader, ByteWriter } from "byte-rw";
import { SerializationContext, SerializationMode } from "./serialization.js";
import { serializers_default } from "./serializers/index.js";

export const defaultSerializationContext = (writer: ByteWriter) => new SerializationContext(serializers_default(), SerializationMode.serialize, writer)
export const defaultDeserializationContext = (reader: ByteReader) => new SerializationContext(serializers_default(), SerializationMode.deserialize, reader)