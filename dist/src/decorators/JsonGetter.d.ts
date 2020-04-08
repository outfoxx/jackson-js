/**
 * @packageDocumentation
 * @module Decorators
 */
import 'reflect-metadata';
import { JsonGetterDecorator } from '../@types';
/**
 * Decorator that can be used to define a non-static,
 * no-argument value-returning (non-void) method to be used as a "getter" for a logical property.
 *
 * Getter means that when serializing Object instance of class that has this method
 * (possibly inherited from a super class), a call is made through the method,
 * and return value will be serialized as value of the property.
 *
 * @example
 * ```typescript
 * class User {
 *   @JsonProperty()
 *   id: number;
 *   @JsonProperty()
 *   firstname: string;
 *   @JsonProperty()
 *   lastname: string;
 *   @JsonProperty()
 *   fullname: string[];
 *
 *   @JsonGetter({value: 'fullname'})
 *   getFullname(): string {
 *     return this.firstname + ' ' + this.lastname;
 *   }
 *
 *   @JsonSetter({value: 'fullname'})
 *   setFullname(fullname: string) {
 *     this.fullname = fullname.split(' ');
 *   }
 * }
 * ```
 */
export declare const JsonGetter: JsonGetterDecorator;