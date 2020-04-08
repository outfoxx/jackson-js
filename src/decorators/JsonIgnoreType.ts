/**
 * @packageDocumentation
 * @module Decorators
 */

import {makeJacksonDecorator, isClass} from '../util';
import 'reflect-metadata';
import {JsonIgnoreTypeDecorator, JsonIgnoreTypeOptions} from '../@types';

/**
 * Decorator that indicates that all properties of annotated type
 * are to be ignored during serialization and deserialization.
 *
 * @example
 * ```typescript
 * class User {
 *   @JsonProperty()
 *   id: number;
 *   @JsonProperty()
 *   email: string;
 *   @JsonProperty()
 *   firstname: string;
 *   @JsonProperty()
 *   lastname: string;
 *
 *   @JsonProperty()
 *   @JsonClass({class: () => [Array, [Item]]})
 *   items: Item[] = [];
 * }
 *
 * @JsonIgnoreType()
 * class Item {
 *   @JsonProperty()
 *   id: number;
 *   @JsonProperty()
 *   name: string;
 *   @JsonProperty()
 *   category: string;
 *
 *   @JsonProperty()
 *   @JsonClass({class: () => [User]})
 *   owner: User;
 * }
 * ```
 */
export const JsonIgnoreType: JsonIgnoreTypeDecorator = makeJacksonDecorator(
  (o: JsonIgnoreTypeOptions): JsonIgnoreTypeOptions => ({enabled: true, ...o}),
  (options: JsonIgnoreTypeOptions, target, propertyKey, descriptorOrParamIndex) => {
    if (!descriptorOrParamIndex && isClass(target)) {
      Reflect.defineMetadata('jackson:JsonIgnoreType', options, target);
      return target;
    }
  });