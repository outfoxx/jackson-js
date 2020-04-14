/**
 * @packageDocumentation
 * @module Databind
 */

import {
  JsonStringifier
} from '../core/JsonStringifier';
import {
  JsonParserContext,
  JsonStringifierContext,
  ObjectMapperDeserializer,
  ObjectMapperFeatures, ObjectMapperCustomMapper, ObjectMapperSerializer
} from '../@types';
import {JsonParser} from '../core/JsonParser';
import {SerializationFeature} from './SerializationFeature';
import {DeserializationFeature} from './DeserializationFeature';
import {MapperFeature} from './MapperFeature';

/**
 *
 */
export class ObjectMapper {
  features: ObjectMapperFeatures = {
    mapper: {
      [MapperFeature.SET_DEFAULT_VALUE_FOR_PRIMITIVES_ON_NULL]: false,
      [MapperFeature.SET_DEFAULT_VALUE_FOR_NUMBER_ON_NULL]: false,
      [MapperFeature.SET_DEFAULT_VALUE_FOR_STRING_ON_NULL]: false,
      [MapperFeature.SET_DEFAULT_VALUE_FOR_BOOLEAN_ON_NULL]: false,
      [MapperFeature.SET_DEFAULT_VALUE_FOR_BIGINT_ON_NULL]: false
    },
    serialization: {
      [SerializationFeature.FAIL_ON_SELF_REFERENCES]: true,
      [SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS]: false,
      [SerializationFeature.WRITE_NAN_AS_ZERO]: false,
      [SerializationFeature.WRITE_POSITIVE_INFINITY_AS_NUMBER_MAX_SAFE_INTEGER]: false,
      [SerializationFeature.WRITE_POSITIVE_INFINITY_AS_NUMBER_MAX_VALUE]: false,
      [SerializationFeature.WRITE_NEGATIVE_INFINITY_AS_NUMBER_MIN_SAFE_INTEGER]: false,
      [SerializationFeature.WRITE_NEGATIVE_INFINITY_AS_NUMBER_MIN_VALUE]: false,
      [SerializationFeature.WRITE_DATES_AS_TIMESTAMPS]: true
    },
    deserialization: {
      [DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES]: true,
      [DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES]: false,
      [DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES]: false,
      [DeserializationFeature.FAIL_ON_NULL_CREATOR_PROPERTIES]: false,
      [DeserializationFeature.FAIL_ON_UNRESOLVED_OBJECT_IDS]: true,
      [DeserializationFeature.ACCEPT_EMPTY_ARRAY_AS_NULL_OBJECT]: false,
      [DeserializationFeature.ACCEPT_EMPTY_STRING_AS_NULL_OBJECT]: false,
      [DeserializationFeature.ACCEPT_FLOAT_AS_INT]: false
    }
  };
  serializers: ObjectMapperSerializer[] = [];
  deserializers: ObjectMapperDeserializer[] = [];

  /**
   *
   */
  constructor() {

  }

  /**
   *
   * @param obj
   * @param context
   */
  stringify<T>(obj: T, context?: JsonStringifierContext): string {
    this.serializers = this.sortMappersByOrder(this.serializers);

    const jsonStringifier = new JsonStringifier<T>();
    return jsonStringifier.stringify(obj, {
      serializers: this.serializers,
      features: {
        mapper: this.features.mapper,
        serialization: this.features.serialization
      },
      filters: {},
      attributes: {},
      decoratorsEnabled: {},
      _internalDecorators: new Map(),
      ...context
    });
  }

  /**
   *
   * @param text
   * @param context
   */
  parse<T>(text: string, context?: JsonParserContext): T {
    this.deserializers = this.sortMappersByOrder(this.deserializers);

    const jsonParser = new JsonParser<T>();
    return jsonParser.parse(text, {
      deserializers: this.deserializers,
      features: {
        mapper: this.features.mapper,
        deserialization: this.features.deserialization
      },
      injectableValues: {},
      decoratorsEnabled: {},
      _internalDecorators: new Map(),
      ...context
    });
  }

  /**
   *
   * @param mappers
   */
  private sortMappersByOrder<T>(mappers: ObjectMapperCustomMapper<T>[]): ObjectMapperCustomMapper<T>[] {
    return mappers.sort((a, b) => a.order - b.order > 0 ? 1 : -1);
  }
}
