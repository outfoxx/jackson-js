import {
  JsonBackReferenceOptions,
  JsonFormatOptions, JsonIdentityInfoOptions,
  JsonIgnorePropertiesOptions,
  JsonIncludeOptions,
  JsonManagedReferenceOptions,
  JsonPropertyOptions,
  JsonPropertyOrderOptions,
  JsonStringifierOptions,
  JsonSubTypeOptions,
  JsonTypeInfoOptions,
  JsonUnwrappedOptions,
  JsonViewOptions
} from "../@types";
import {JsonPropertyAccess} from "../annotations/JsonProperty";
import {JsonIncludeType} from "../annotations/JsonInclude";
import {cloneClassInstance, isExtensionOf, isSameConstructor} from "../util";
import {JsonTypeInfoAs, JsonTypeInfoId} from "../annotations/JsonTypeInfo";
import {JsonFormatShape} from "../annotations/JsonFormat";
import {SerializationFeature} from "../databind/SerializationFeature";
import {ObjectIdGenerator} from "../annotations/JsonIdentityInfo";

import dayjs from "dayjs";
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { v4 as uuidv4, v1 as uuidv1, v5 as uuidv5, v3 as uuidv3 } from 'uuid';

dayjs.extend(customParseFormat);

export class JsonStringifier<T> {

  // WeakMap used to manage object circular references
  private _valueAlreadySeen = new WeakMap();
  private _intSequenceGenerator = 0;

  constructor() {
  }

  stringify(obj: T, options: JsonStringifierOptions = {}): string {

    return JSON.stringify(obj, (key, value = null) => {

      value = this.invokeCustomSerializers(key, value, options);

      if (value && typeof value === 'object' && !(value instanceof Array)) {

        if (this.stringifyJsonIgnoreType(value))
          return null;

        this.stringifyJsonIdentityInfo(this._valueAlreadySeen, value, key);

        let replacement;
        let jsonValue = this.stringifyJsonValue(value);
        if (jsonValue)
          replacement = jsonValue;

        if (!replacement) {
          replacement = {};
          let keys = Object.keys(value);
          if (options.features[SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS]) {
            keys = keys.sort();
          }
          const hasJsonPropertyOrder = Reflect.hasMetadata("jackson:JsonPropertyOrder", obj.constructor);
          if (hasJsonPropertyOrder) {
            keys = this.stringifyJsonPropertyOrder(value);
          }
          for (let k of keys) {
            if (!this.stringifyHasJsonIgnore(value, k) && !this.stringifyJsonInclude(value, k) && this.stringifyHasJsonView(value, k, options) && Object.hasOwnProperty.call(value, k)) {

              if (value === value[k] && options.features[SerializationFeature.FAIL_ON_SELF_REFERENCES]) {
                throw new Error(`Direct self-reference leading to cycle (through reference chain: ${value.constructor.name}["${k}"])`);
              }

              replacement[k] = value[k];
              this.stringifyJsonFormat(replacement, value, k);
              this.stringifyJsonSerialize(replacement, value, k);
              this.stringifyJsonRawValue(replacement, value, k);
              this.stringifyJsonProperty(replacement, value, k);
              this.stringifyJsonManagedReference(replacement, value, k);
              this.stringifyJsonAnyGetter(replacement, value, k);
              this.stringifyJsonUnwrapped(replacement, value, k, options);
            }
          }
        }

        replacement = this.stringifyJsonTypeInfo(replacement, value);
        replacement = this.stringifyJsonRootName(replacement, value);

        return replacement;
      }

      return value;
    }, options.format);

  }

  invokeCustomSerializers(key: string, value: any, options: JsonStringifierOptions): any {
    if (options.serializers) {
      for (const serializer of options.serializers) {
        if (serializer.type != null) {
          if ( value != null &&
            (
              (typeof serializer.type === "string" && serializer.type !== typeof value) ||
              (typeof serializer.type !== "string" && value.constructor != null && !isSameConstructor(serializer.type, value.constructor))
            )
          ) {
            continue;
          }
        }
        value = serializer.mapper(key, value);
      }
    }
    return value;
  }

  stringifyJsonAnyGetter(replacement: any, obj: any, key: string) {
    const jsonAnyGetter: string = Reflect.getMetadata("jackson:JsonAnyGetter", obj);
    let jsonProperty: JsonPropertyOptions = Reflect.getMetadata("jackson:JsonProperty", obj, key);
    if (!jsonProperty && jsonAnyGetter && obj[jsonAnyGetter]) {
      let value = (typeof obj[jsonAnyGetter] === "function") ? obj[jsonAnyGetter]() : obj[jsonAnyGetter];
      for (let k in value)
        if (Object.hasOwnProperty.call(value, k))
          replacement[k] = value[k];
      delete replacement[key];
    }
  }

  stringifyJsonPropertyOrder(obj: any) {
    let keys = Object.keys(obj);
    const jsonPropertyOrder: JsonPropertyOrderOptions = Reflect.getMetadata("jackson:JsonPropertyOrder", obj.constructor);
    if (jsonPropertyOrder) {
      if (jsonPropertyOrder.alphabetic)
        keys = keys.sort();
      else if (jsonPropertyOrder.value)
        keys = jsonPropertyOrder.value.concat(keys.filter(item => !jsonPropertyOrder.value.includes(item)))
    }
    return keys;
  }

  stringifyJsonProperty(replacement: any, obj: any, key: string) {
    const jsonProperty: JsonPropertyOptions = Reflect.getMetadata("jackson:JsonProperty", obj, key);
    const hasJsonIgnore = Reflect.hasMetadata("jackson:JsonIgnore", obj.constructor, key);
    if (jsonProperty) {
      const isIgnored = jsonProperty.access === JsonPropertyAccess.WRITE_ONLY ||
        (jsonProperty.access === JsonPropertyAccess.AUTO && hasJsonIgnore);
      if (!isIgnored && jsonProperty.value !== key) {
        replacement[jsonProperty.value] = replacement[key];
        delete replacement[key];
        return true;
      } else if (isIgnored) {
        delete replacement[key];
      }
    }
    return false;
  }

  stringifyJsonRawValue(replacement: any, obj: any, key: string) {
    const jsonRawValue = Reflect.hasMetadata("jackson:JsonRawValue", obj.constructor, key);
    if (jsonRawValue) {
      replacement[key] = JSON.parse(replacement[key]);
      return true;
    }
    return false;
  }

  stringifyJsonValue(obj: any) {
    const jsonValue: string = Reflect.getMetadata("jackson:JsonValue", obj);
    if (jsonValue)
      return (typeof obj[jsonValue] === "function") ? obj[jsonValue]() : obj[jsonValue];
  }

  stringifyJsonRootName(replacement: any, obj: any) {
    const jsonRootName: string = Reflect.getMetadata("jackson:JsonRootName", obj.constructor);
    if (jsonRootName) {
      let newReplacement = {};
      newReplacement[jsonRootName] = replacement;
      return newReplacement;
    }
    return replacement;
  }

  stringifyJsonSerialize(replacement: any, obj: any, key: string) {
    const jsonSerialize: (...args) => any = Reflect.getMetadata("jackson:JsonSerialize", obj, key);
    if (jsonSerialize) {
      replacement[key] = jsonSerialize(replacement[key]);
      return true;
    }
    return false;
  }

  stringifyHasJsonIgnore(obj: any, key: string) {
    const hasJsonIgnore = Reflect.hasMetadata("jackson:JsonIgnore", obj.constructor, key);
    const hasJsonProperty = Reflect.hasMetadata("jackson:JsonProperty", obj, key);

    if (!hasJsonIgnore) {
      const jsonIgnoreProperties: JsonIgnorePropertiesOptions = Reflect.getMetadata("jackson:JsonIgnoreProperties", obj.constructor);
      if (jsonIgnoreProperties && !jsonIgnoreProperties.allowGetters) {
        if (jsonIgnoreProperties.value.indexOf(key) >= 0)
          return true;
        const jsonProperty: JsonPropertyOptions = Reflect.getMetadata("jackson:JsonProperty", obj, key);
        if (jsonProperty && jsonIgnoreProperties.value.indexOf(jsonProperty.value) >= 0)
          return true;
      }
    }

    return hasJsonIgnore && !hasJsonProperty;
  }

  stringifyJsonInclude(obj: any, key: string) {
    const keyJsonInclude: JsonIncludeOptions = Reflect.getMetadata("jackson:JsonInclude", obj, key);
    const constructorJsonInclude: JsonIncludeOptions = Reflect.getMetadata("jackson:JsonInclude", obj.constructor);
    const jsonInclude = (keyJsonInclude) ? keyJsonInclude : constructorJsonInclude;

    if (jsonInclude && jsonInclude.value >= JsonIncludeType.ALWAYS) {
      const value = obj[key];
      switch(jsonInclude.value) {
        case JsonIncludeType.NON_EMPTY:
          return value == null || ((typeof value === "object" || typeof value === "string") && Object.keys(value).length === 0);
        case JsonIncludeType.NON_NULL:
          return value == null;
      }
    }

    return false;
  }

  stringifyJsonIgnoreType(obj: any) {
    return Reflect.hasMetadata("jackson:JsonIgnoreType", obj.constructor);
  }

  stringifyJsonManagedReference(replacement: any, obj: any, key: string) {
    const jsonManagedReference: JsonManagedReferenceOptions = Reflect.getMetadata("jackson:JsonManagedReference", obj.constructor, key);
    if (jsonManagedReference) {

      let referenceConstructor;
      if (replacement[key]) {
        if (replacement[key] instanceof Array && replacement[key].length > 0)
          referenceConstructor = replacement[key][0].constructor;
        else if (replacement[key] instanceof Array && replacement[key].length === 0)
          referenceConstructor = {};
        else
          referenceConstructor = replacement[key].constructor;
      }
      else
        referenceConstructor = {};

      if (isSameConstructor(jsonManagedReference.class(), referenceConstructor)) {
        const metadataKeys = Reflect.getMetadataKeys(referenceConstructor);
        for(let k of metadataKeys) {
          if (k.startsWith("jackson:JsonBackReference:")) {
            let propertyKey = k.replace("jackson:JsonBackReference:", '');
            let metadata: JsonBackReferenceOptions = Reflect.getMetadata(k, referenceConstructor);
            if (isSameConstructor(metadata.class(), obj.constructor)) {
              if (replacement[key] instanceof Array) {
                for(let index in replacement[key]) {
                  replacement[key][index] = cloneClassInstance(obj[key][index]);
                  delete replacement[key][index][propertyKey];
                }
              }
              else {
                replacement[key] = cloneClassInstance(obj[key]);
                delete replacement[key][propertyKey];
              }
            } else {
              if (replacement[key] instanceof Array) {
                for(let index in replacement[key]) {
                  delete replacement[key][index][propertyKey];
                }
              }
              else {
                delete replacement[key][propertyKey];
              }
            }
          }
        }
      }

    }
  }

  stringifyJsonTypeInfo(replacement: any, obj: any) {
    const jsonTypeInfo: JsonTypeInfoOptions = Reflect.getMetadata("jackson:JsonTypeInfo", obj.constructor);
    if (jsonTypeInfo) {
      let jsonTypeName: string;

      const jsonSubTypes: JsonSubTypeOptions[] = Reflect.getMetadata("jackson:JsonSubTypes", obj.constructor);
      if (jsonSubTypes) {
        for(const subType of jsonSubTypes) {
          if(subType.name && isSameConstructor(subType.class(), obj.constructor)) {
            jsonTypeName = subType.name;
            break;
          }
        }
      }

      if (!jsonTypeName)
        jsonTypeName = Reflect.getMetadata("jackson:JsonTypeName", obj.constructor);

      switch(jsonTypeInfo.use) {
        case JsonTypeInfoId.NAME:
          jsonTypeName = obj.constructor.name;
          break;
      }

      let newReplacement: any;
      switch(jsonTypeInfo.include) {
        case JsonTypeInfoAs.PROPERTY:
          replacement[jsonTypeInfo.property] = jsonTypeName;
          break;
        case JsonTypeInfoAs.WRAPPER_OBJECT:
          newReplacement = {};
          newReplacement[jsonTypeName] = replacement;
          replacement = newReplacement;
          break;
        case JsonTypeInfoAs.WRAPPER_ARRAY:
          newReplacement = [jsonTypeName, replacement];
          replacement = newReplacement;
          break;
      }

    }
    return replacement;
  }

  stringifyJsonFormat(replacement: any, obj: any, key: string) {
    const jsonFormat: JsonFormatOptions = Reflect.getMetadata("jackson:JsonFormat", obj, key);

    if (jsonFormat) {
      switch(jsonFormat.shape) {
        case JsonFormatShape.ARRAY:
          if (typeof replacement[key] === "object")
            replacement[key] = Object.values(replacement[key]);
          else
            replacement[key] = [replacement[key]];
          break;
        case JsonFormatShape.BOOLEAN:
          replacement[key] = !!replacement[key];
          break;
        case JsonFormatShape.NUMBER_FLOAT:
          if (replacement[key] instanceof Date)
            replacement[key] = parseFloat(replacement[key].getTime());
          else
            replacement[key] = parseFloat(replacement[key]);
          break;
        case JsonFormatShape.NUMBER_INT:
          if (replacement[key] instanceof Date)
            replacement[key] = replacement[key].getTime();
          else
            replacement[key] = parseInt(replacement[key]);
          break;
        case JsonFormatShape.OBJECT:
          replacement[key] = Object.assign(Object.create(replacement[key]), replacement[key]);
          break;
        case JsonFormatShape.SCALAR:
          if (typeof replacement[key] === "object")
            replacement[key] = null;
          break;
        case JsonFormatShape.STRING:
          if (replacement[key] instanceof Date) {
            const locale = jsonFormat.locale;
            require('dayjs/locale/'+locale);
            const timezone = (jsonFormat.timezone) ? { timeZone: jsonFormat.timezone } : {};
            replacement[key] = dayjs(replacement[key].toLocaleString('en-US', timezone)).locale(locale).format(jsonFormat.pattern);
          }
          else
            replacement[key] = replacement[key].toString();
          break;
      }
    }
  }

  stringifyHasJsonView(obj: any, key: string, options: JsonStringifierOptions) {
    if (options.withView) {
      const jsonView: JsonViewOptions = Reflect.getMetadata("jackson:JsonView", obj.constructor, key);
      if (jsonView) {
        for (const view of jsonView.value) {
          if (isSameConstructor(view(), options.withView) || isExtensionOf(view(), options.withView)) {
            return true;
          }
        }
        return false;
      }
    }
    return true;
  }

  stringifyJsonUnwrapped(replacement: any, obj: any, key: string, options: JsonStringifierOptions) {
    const jsonUnwrapped: JsonUnwrappedOptions = Reflect.getMetadata("jackson:JsonUnwrapped", obj, key);
    const hasJsonTypeInfo = (typeof obj[key] === "object") ?
      Reflect.hasMetadata("jackson:JsonTypeInfo", obj[key].constructor) : false;

    if (jsonUnwrapped) {
      if (hasJsonTypeInfo && options.features[SerializationFeature.FAIL_ON_UNWRAPPED_TYPE_IDENTIFIERS]) {
        throw new Error(`Unwrapped property requires use of type information: cannot serialize without disabling "SerializationFeature.FAIL_ON_UNWRAPPED_TYPE_IDENTIFIERS" (through reference chain: ${obj.constructor.name}["${key}"])`);
      }

      const prefix = (jsonUnwrapped.prefix != null) ? jsonUnwrapped.prefix : '';
      const suffix = (jsonUnwrapped.suffix != null) ? jsonUnwrapped.suffix : '';

      const keys = Object.keys(obj[key]);
      for (let oldKey of keys) {
        const newKey = prefix + oldKey + suffix;
        replacement[newKey] = obj[key][oldKey];
      }

      delete replacement[key];
    }
  }

  stringifyJsonIdentityInfo(valueAlreadySeen: WeakMap<any, any>, obj: any, key: string) {
    const jsonIdentityInfo: JsonIdentityInfoOptions = Reflect.getMetadata("jackson:JsonIdentityInfo", obj.constructor);
    if (jsonIdentityInfo) {

      if (typeof jsonIdentityInfo.generator === "function") {
        obj[jsonIdentityInfo.property] = jsonIdentityInfo.generator(obj);
      } else {
        switch (jsonIdentityInfo.generator) {
          case ObjectIdGenerator.IntSequenceGenerator:
            this._intSequenceGenerator++;
            obj[jsonIdentityInfo.property] = this._intSequenceGenerator;
            break;
          case ObjectIdGenerator.None:
            obj[jsonIdentityInfo.property] = null;
            break;
          case ObjectIdGenerator.PropertyGenerator:
            // Abstract place-holder class which is used to denote case where Object Identifier
            // to use comes from a Class property using "JsonIdentityInfoOptions.property"
            break;
          case ObjectIdGenerator.UUIDv5Generator:
            const uuidv5Options = jsonIdentityInfo.uuidv5;
            const uuidv5Args: any[] = [uuidv5Options.name, uuidv5Options.namespace];
            if (uuidv5Options.buffer != null) {
              uuidv5Args.push(uuidv5Options.buffer);
              if (uuidv5Options.offset != null) {
                uuidv5Args.push(uuidv5Options.offset);
              }
            }
            obj[jsonIdentityInfo.property] = uuidv5(...uuidv5Args);
            break;
          case ObjectIdGenerator.UUIDv4Generator:
            const uuidv4Options = jsonIdentityInfo.uuidv4;
            const uuidv4Args: any[] = [uuidv4Options.options];
            if (uuidv4Options.buffer != null) {
              uuidv4Args.push(uuidv4Options.buffer);
              if (uuidv4Options.offset != null) {
                uuidv4Args.push(uuidv4Options.offset);
              }
            }
            obj[jsonIdentityInfo.property] = uuidv4(...uuidv4Args);
            break;
          case ObjectIdGenerator.UUIDv3Generator:
            const uuidv3Options = jsonIdentityInfo.uuidv3;
            const uuidv3Args: any[] = [uuidv3Options.name, uuidv3Options.namespace];
            if (uuidv3Options.buffer != null) {
              uuidv3Args.push(uuidv3Options.buffer);
              if (uuidv3Options.offset != null) {
                uuidv3Args.push(uuidv3Options.offset);
              }
            }
            obj[jsonIdentityInfo.property] = uuidv3(...uuidv3Args);
            break;
          case ObjectIdGenerator.UUIDv1Generator:
            const uuidv1Options = jsonIdentityInfo.uuidv1;
            const uuidv1Args: any[] = [uuidv1Options.options];
            if (uuidv1Options.buffer != null) {
              uuidv1Args.push(uuidv1Options.buffer);
              if (uuidv1Options.offset != null) {
                uuidv1Args.push(uuidv1Options.offset);
              }
            }
            obj[jsonIdentityInfo.property] = uuidv1(...uuidv1Args);
            break;
        }
      }

      for (let k in obj) {
        if (Object.hasOwnProperty.call(obj, k) && typeof obj[k] === "object" && !(obj[k] instanceof Array)) {
          const id = valueAlreadySeen.get(obj[k]);
          if (id) {
            obj[k] = id;
          }
        }
      }
    }

    if (valueAlreadySeen.has(obj)) {
      throw new Error(`Infinite recursion on key "${key}" of type "${obj.constructor.name}"`);
    }
    valueAlreadySeen.set(obj, (jsonIdentityInfo) ? obj[jsonIdentityInfo.property] : null);
  }

}