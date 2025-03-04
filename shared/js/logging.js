const primordials = {};

const colorRegExp = /\u001b\[\d\d?m/g;

const {
    defineProperty: ReflectDefineProperty,
    getOwnPropertyDescriptor: ReflectGetOwnPropertyDescriptor,
    ownKeys: ReflectOwnKeys,
} = Reflect;

// `uncurryThis` is equivalent to `func => Function.prototype.call.bind(func)`.
// It is using `bind.bind(call)` to avoid using `Function.prototype.bind`
// and `Function.prototype.call` after it may have been mutated by users.
const { apply, bind, call } = Function.prototype;
const uncurryThis = bind.bind(call);
primordials.uncurryThis = uncurryThis;

// `applyBind` is equivalent to `func => Function.prototype.apply.bind(func)`.
// It is using `bind.bind(apply)` to avoid using `Function.prototype.bind`
// and `Function.prototype.apply` after it may have been mutated by users.
const applyBind = bind.bind(apply);
primordials.applyBind = applyBind;

// Methods that accept a variable number of arguments, and thus it's useful to
// also create `${prefix}${key}Apply`, which uses `Function.prototype.apply`,
// instead of `Function.prototype.call`, and thus doesn't require iterator
// destructuring.
const varargsMethods = [
    // 'ArrayPrototypeConcat' is omitted, because it performs the spread
    // on its own for arrays and array-likes with a truthy
    // @@isConcatSpreadable symbol property.
    "ArrayOf",
    "ArrayPrototypePush",
    "ArrayPrototypeUnshift",
    // 'FunctionPrototypeCall' is omitted, since there's 'ReflectApply'
    // and 'FunctionPrototypeApply'.
    "MathHypot",
    "MathMax",
    "MathMin",
    "StringPrototypeConcat",
    "TypedArrayOf",
];

function getNewKey(key) {
    return typeof key === "symbol"
        ? `Symbol${key.description[7].toUpperCase()}${key.description.slice(8)}`
        : `${key[0].toUpperCase()}${key.slice(1)}`;
}

function copyAccessor(dest, prefix, key, { enumerable, get, set }) {
    ReflectDefineProperty(dest, `${prefix}Get${key}`, {
        __proto__: null,
        value: uncurryThis(get),
        enumerable,
    });
    if (set !== undefined) {
        ReflectDefineProperty(dest, `${prefix}Set${key}`, {
            __proto__: null,
            value: uncurryThis(set),
            enumerable,
        });
    }
}

function copyPropsRenamed(src, dest, prefix) {
    for (const key of ReflectOwnKeys(src)) {
        const newKey = getNewKey(key);
        const desc = ReflectGetOwnPropertyDescriptor(src, key);
        if ("get" in desc) {
            copyAccessor(dest, prefix, newKey, desc);
        } else {
            const name = `${prefix}${newKey}`;
            ReflectDefineProperty(dest, name, { __proto__: null, ...desc });
            if (varargsMethods.includes(name)) {
                ReflectDefineProperty(dest, `${name}Apply`, {
                    __proto__: null,
                    // `src` is bound as the `this` so that the static `this` points
                    // to the object it was defined on,
                    // e.g.: `ArrayOfApply` gets a `this` of `Array`:
                    value: applyBind(desc.value, src),
                });
            }
        }
    }
}

function copyPropsRenamedBound(src, dest, prefix) {
    for (const key of ReflectOwnKeys(src)) {
        const newKey = getNewKey(key);
        const desc = ReflectGetOwnPropertyDescriptor(src, key);
        if ("get" in desc) {
            copyAccessor(dest, prefix, newKey, desc);
        } else {
            const { value } = desc;
            if (typeof value === "function") {
                desc.value = value.bind(src);
            }

            const name = `${prefix}${newKey}`;
            ReflectDefineProperty(dest, name, { __proto__: null, ...desc });
            if (varargsMethods.includes(name)) {
                ReflectDefineProperty(dest, `${name}Apply`, {
                    __proto__: null,
                    value: applyBind(value, src),
                });
            }
        }
    }
}

function copyPrototype(src, dest, prefix) {
    for (const key of ReflectOwnKeys(src)) {
        const newKey = getNewKey(key);
        const desc = ReflectGetOwnPropertyDescriptor(src, key);
        if ("get" in desc) {
            copyAccessor(dest, prefix, newKey, desc);
        } else {
            const { value } = desc;
            if (typeof value === "function") {
                desc.value = uncurryThis(value);
            }

            const name = `${prefix}${newKey}`;
            ReflectDefineProperty(dest, name, { __proto__: null, ...desc });
            if (varargsMethods.includes(name)) {
                ReflectDefineProperty(dest, `${name}Apply`, {
                    __proto__: null,
                    value: applyBind(value),
                });
            }
        }
    }
}

// Create copies of configurable value properties of the global object
["Proxy", "globalThis"].forEach((name) => {
    // eslint-disable-next-line no-restricted-globals
    primordials[name] = globalThis[name];
});

// Create copies of URI handling functions
[decodeURI, decodeURIComponent, encodeURI, encodeURIComponent].forEach((fn) => {
    primordials[fn.name] = fn;
});

// Create copies of legacy functions
[escape, eval, unescape].forEach((fn) => {
    primordials[fn.name] = fn;
});

// Create copies of the namespace objects
["JSON", "Math", "Proxy", "Reflect"].forEach((name) => {
    // eslint-disable-next-line no-restricted-globals
    copyPropsRenamed(globalThis[name], primordials, name);
});

// Create copies of intrinsic objects
[
    "AggregateError",
    "Array",
    "ArrayBuffer",
    "BigInt",
    "BigInt64Array",
    "BigUint64Array",
    "Boolean",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "FinalizationRegistry",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int16Array",
    "Int32Array",
    "Int8Array",
    "Map",
    "Number",
    "Object",
    "RangeError",
    "ReferenceError",
    "RegExp",
    "Set",
    "String",
    "Symbol",
    "SyntaxError",
    "TypeError",
    "URIError",
    "Uint16Array",
    "Uint32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "WeakMap",
    "WeakRef",
    "WeakSet",
].forEach((name) => {
    // eslint-disable-next-line no-restricted-globals
    const original = globalThis[name];
    primordials[name] = original;
    copyPropsRenamed(original, primordials, name);
    copyPrototype(original.prototype, primordials, `${name}Prototype`);
});

// Create copies of intrinsic objects that require a valid `this` to call
// static methods.
// Refs: https://www.ecma-international.org/ecma-262/#sec-promise.all
["Promise"].forEach((name) => {
    // eslint-disable-next-line no-restricted-globals
    const original = globalThis[name];
    primordials[name] = original;
    copyPropsRenamedBound(original, primordials, name);
    copyPrototype(original.prototype, primordials, `${name}Prototype`);
});

// Create copies of abstract intrinsic objects that are not directly exposed
// on the global object.
// Refs: https://tc39.es/ecma262/#sec-%typedarray%-intrinsic-object
[
    { name: "TypedArray", original: Reflect.getPrototypeOf(Uint8Array) },
    {
        name: "ArrayIterator",
        original: {
            prototype: Reflect.getPrototypeOf(Array.prototype[Symbol.iterator]()),
        },
    },
    {
        name: "StringIterator",
        original: {
            prototype: Reflect.getPrototypeOf(String.prototype[Symbol.iterator]()),
        },
    },
].forEach(({ name, original }) => {
    primordials[name] = original;
    // The static %TypedArray% methods require a valid `this`, but can't be bound,
    // as they need a subclass constructor as the receiver:
    copyPrototype(original, primordials, name);
    copyPrototype(original.prototype, primordials, `${name}Prototype`);
});

/* eslint-enable node-core/prefer-primordials */

const {
    ArrayPrototypeForEach = Array.prototype.forEach.call,
    FinalizationRegistry = FinalizationRegistry,
    FunctionPrototypeCall = Function.prototype.call,
    Map = Map,
    ObjectFreeze = Object.freeze.call,
    ObjectSetPrototypeOf = Object.setPrototypeOf,
    Promise = Promise,
    PromisePrototypeThen = Promise.prototype.then,
    Set = Set,
    SymbolIterator = Symbol.iterator,
    WeakMap = WeakMap,
    WeakRef = WeakRef,
    WeakSet = WeakSet,
} = primordials;

// Because these functions are used by `makeSafe`, which is exposed
// on the `primordials` object, it's important to use const references
// to the primordials that they use:
const createSafeIterator = (factory, next) => {
    class SafeIterator {
        constructor(iterable) {
            this._iterator = factory(iterable);
        }
        next() {
            return next(this._iterator);
        }
        [SymbolIterator]() {
            return this;
        }
    }
    ObjectSetPrototypeOf(SafeIterator.prototype, null);
    ObjectFreeze(SafeIterator.prototype);
    ObjectFreeze(SafeIterator);
    return SafeIterator;
};

primordials.SafeArrayIterator = createSafeIterator(
    primordials.ArrayPrototypeSymbolIterator,
    primordials.ArrayIteratorPrototypeNext
);
primordials.SafeStringIterator = createSafeIterator(
    primordials.StringPrototypeSymbolIterator,
    primordials.StringIteratorPrototypeNext
);

const copyProps = (src, dest) => {
    ArrayPrototypeForEach(ReflectOwnKeys(src), (key) => {
        if (!ReflectGetOwnPropertyDescriptor(dest, key)) {
            ReflectDefineProperty(dest, key, {
                __proto__: null,
                ...ReflectGetOwnPropertyDescriptor(src, key),
            });
        }
    });
};

/**
 * @type {typeof primordials.makeSafe}
 */
const makeSafe = (unsafe, safe) => {
    if (SymbolIterator in unsafe.prototype) {
        const dummy = new unsafe();
        let next; // We can reuse the same `next` method.

        ArrayPrototypeForEach(ReflectOwnKeys(unsafe.prototype), (key) => {
            if (!ReflectGetOwnPropertyDescriptor(safe.prototype, key)) {
                const desc = ReflectGetOwnPropertyDescriptor(unsafe.prototype, key);
                if (
                    typeof desc.value === "function" &&
                    desc.value.length === 0 &&
                    SymbolIterator in (FunctionPrototypeCall(desc.value, dummy) ?? {})
                ) {
                    const createIterator = uncurryThis(desc.value);
                    next ??= uncurryThis(createIterator(dummy).next);
                    const SafeIterator = createSafeIterator(createIterator, next);
                    desc.value = function () {
                        return new SafeIterator(this);
                    };
                }
                ReflectDefineProperty(safe.prototype, key, {
                    __proto__: null,
                    ...desc,
                });
            }
        });
    } else {
        copyProps(unsafe.prototype, safe.prototype);
    }
    copyProps(unsafe, safe);

    ObjectSetPrototypeOf(safe.prototype, null);
    ObjectFreeze(safe.prototype);
    ObjectFreeze(safe);
    return safe;
};
primordials.makeSafe = makeSafe;

// Subclass the constructors because we need to use their prototype
// methods later.
// Defining the `constructor` is necessary here to avoid the default
// constructor which uses the user-mutable `%ArrayIteratorPrototype%.next`.
primordials.SafeMap = makeSafe(
    Map,
    class SafeMap extends Map {
        constructor(i) {
            super(i);
        } // eslint-disable-line no-useless-constructor
    }
);
primordials.SafeWeakMap = makeSafe(
    WeakMap,
    class SafeWeakMap extends WeakMap {
        constructor(i) {
            super(i);
        } // eslint-disable-line no-useless-constructor
    }
);

primordials.SafeSet = makeSafe(
    Set,
    class SafeSet extends Set {
        constructor(i) {
            super(i);
        } // eslint-disable-line no-useless-constructor
    }
);
primordials.SafeWeakSet = makeSafe(
    WeakSet,
    class SafeWeakSet extends WeakSet {
        constructor(i) {
            super(i);
        } // eslint-disable-line no-useless-constructor
    }
);

primordials.SafeFinalizationRegistry = makeSafe(
    FinalizationRegistry,
    class SafeFinalizationRegistry extends FinalizationRegistry {
        // eslint-disable-next-line no-useless-constructor
        constructor(cleanupCallback) {
            super(cleanupCallback);
        }
    }
);
primordials.SafeWeakRef = makeSafe(
    WeakRef,
    class SafeWeakRef extends WeakRef {
        // eslint-disable-next-line no-useless-constructor
        constructor(target) {
            super(target);
        }
    }
);

const SafePromise = makeSafe(
    Promise,
    class SafePromise extends Promise {
        // eslint-disable-next-line no-useless-constructor
        constructor(executor) {
            super(executor);
        }
    }
);

primordials.PromisePrototypeCatch = (thisPromise, onRejected) =>
    PromisePrototypeThen(thisPromise, undefined, onRejected);

/**
 * Attaches a callback that is invoked when the Promise is settled (fulfilled or
 * rejected). The resolved value cannot be modified from the callback.
 * Prefer using async functions when possible.
 * @param {Promise<any>} thisPromise
 * @param {() => void) | undefined | null} onFinally The callback to execute
 *        when the Promise is settled (fulfilled or rejected).
 * @returns {Promise} A Promise for the completion of the callback.
 */
primordials.SafePromisePrototypeFinally = (thisPromise, onFinally) =>
    // Wrapping on a new Promise is necessary to not expose the SafePromise
    // prototype to user-land.
    new Promise((a, b) =>
        new SafePromise((a, b) => PromisePrototypeThen(thisPromise, a, b)).finally(onFinally).then(a, b)
    );

primordials.AsyncIteratorPrototype = primordials.ReflectGetPrototypeOf(
    primordials.ReflectGetPrototypeOf(async function* () {}).prototype
);

ObjectSetPrototypeOf(primordials, null);
ObjectFreeze(primordials);

let {
    getOwnNonIndexProperties,
    getProxyDetails = () => undefined,
    kPending = 0,
    kFulfilled = 1,
    kRejected = 2,
    previewEntries,

    getConstructorName: internalGetConstructorName,

    // v8::External shit
    // getExternalValue,

    propertyFilter: { ALL_PROPERTIES, ONLY_ENUMERABLE } = {
        ALL_PROPERTIES: 0,
        ONLY_ENUMERABLE: 2,
    },
} = /* internalBinding('util') */ {};

const custom_getOwnNonIndexProperties = (obj, filter) => {
    if (filter === ALL_PROPERTIES) return Object.getOwnPropertyNames(obj);
    else if (ONLY_ENUMERABLE) return Array.isArray(obj) ? [] : Object.keys(obj);
    else throw new Error("unknown filter");
};

getOwnNonIndexProperties = custom_getOwnNonIndexProperties;

const custom_internalGetConstructorName = (obj) => {
    // shit but sometimes works
    return obj?.constructor?.name ?? "<UNKNOWN CONSTRUCTOR NAME>";
};

internalGetConstructorName = custom_internalGetConstructorName;

const custom_previewEntries = (obj) => {
    const isKeyValue = obj instanceof Map ? true : false;
    let entries = [];

    if (!(obj instanceof Map || obj instanceof Set)) {
        return [entries, isKeyValue];
    }

    try {
        entries = obj.entries();
    } catch (e) {
        console.error("custom_previewEntries", e.stack);
    }

    return [entries, isKeyValue];
};

previewEntries = custom_previewEntries;

const TypedArrayPrototype = Uint8Array.prototype.__proto__;

const {
    ArrayIsArray = Array.isArray,
    ArrayPrototypeFilter = Array.prototype.filter.call,
    ArrayPrototypePop = Array.prototype.pop.call,
    ArrayPrototypePush = Array.prototype.push.call,
    ArrayPrototypePushApply = Array.prototype.push.apply,
    ArrayPrototypeSort = Array.prototype.sort.call,
    ArrayPrototypeUnshift = Array.prototype.unshift.call,
    BigIntPrototypeValueOf = BigInt.prototype.valueOf.call,
    BooleanPrototypeValueOf = Boolean.prototype.valueOf.call,
    DatePrototypeGetTime = Date.prototype.getTime.call,
    DatePrototypeToISOString = Date.prototype.toISOString.call,
    DatePrototypeToString = Date.prototype.toString.call,
    ErrorPrototypeToString = Error.prototype.toString.call,
    FunctionPrototypeToString = Function.prototype.toString.call,
    JSONStringify = JSON.stringify,
    MapPrototypeGetSize = Object.getOwnPropertyDescriptor(Map.prototype, "size").get.call,
    MapPrototypeEntries = Map.prototype.entries.call,
    MathFloor = Math.floor,
    MathMax = Math.max,
    MathMin = Math.min,
    MathRound = Math.round,
    MathSqrt = Math.sqrt,
    MathTrunc = Math.trunc,
    Number = Number,
    NumberIsFinite = Number.isFinite,
    NumberIsNaN = isNaN,
    NumberParseFloat = parseFloat,
    NumberParseInt = parseInt,
    NumberPrototypeValueOf = Number.prototype.valueOf.call,
    Object = Object,
    ObjectAssign = Object.assign,
    ObjectCreate = Object.create,
    ObjectDefineProperty = Object.defineProperty,
    ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
    ObjectGetOwnPropertyNames = Object.getOwnPropertyNames,
    ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols,
    ObjectGetPrototypeOf = Object.getPrototypeOf,
    ObjectIs = Object.is,
    ObjectKeys = Object.keys,
    ObjectPrototypeHasOwnProperty = Object.prototype.hasOwnProperty.call,
    ObjectPrototypePropertyIsEnumerable = Object.prototype.propertyIsEnumerable.call,
    ObjectSeal = Object.seal,
    RegExp = RegExp,
    RegExpPrototypeExec = RegExp.prototype.exec.call,
    RegExpPrototypeSymbolReplace = RegExp.prototype[Symbol.replace].call,
    RegExpPrototypeToString = RegExp.prototype.toString.call,

    SafeStringIterator,
    SafeMap,
    SafeSet,

    SetPrototypeGetSize = Object.getOwnPropertyDescriptor(Set.prototype, "size").get.call,
    SetPrototypeValues = Set.prototype.values.call,

    StringPrototypeCharCodeAt = String.prototype.charCodeAt.call,
    StringPrototypeCodePointAt = String.prototype.codePointAt.call,
    StringPrototypeIncludes = String.prototype.includes.call,
    StringPrototypeNormalize = String.prototype.normalize.call,
    StringPrototypePadEnd = String.prototype.padEnd.call,
    StringPrototypePadStart = String.prototype.padStart.call,
    StringPrototypeRepeat = String.prototype.repeat.call,
    StringPrototypeSlice = String.prototype.slice.call,
    StringPrototypeSplit = String.prototype.split.call,
    StringPrototypeToLowerCase = String.prototype.toLowerCase.call,
    StringPrototypeTrim = String.prototype.trim.call,
    StringPrototypeValueOf = String.prototype.valueOf.call,

    SymbolPrototypeToString = Symbol.prototype.toString.call,
    SymbolPrototypeValueOf = Symbol.prototype.valueOf.call,
    SymbolToStringTag = Symbol.toStringTag,

    TypedArrayPrototypeGetLength = Object.getOwnPropertyDescriptor(TypedArrayPrototype, "length").get.call,
    TypedArrayPrototypeGetSymbolToStringTag = Object.getOwnPropertyDescriptor(TypedArrayPrototype, Symbol.toStringTag)
        .get.call,
} = primordials;

let {
    customInspectSymbol = Symbol.for("nodejs.util.inspect.custom"),
    isError = (e) => e instanceof Error,
    join,
    removeColors,
} = /* require('internal/util') */ {};

function nodejs_join(output, separator) {
    let str = "";
    if (output.length !== 0) {
        const lastIndex = output.length - 1;
        for (let i = 0; i < lastIndex; i++) {
            // It is faster not to use a template string here
            str += output[i];
            str += separator;
        }
        str += output[lastIndex];
    }
    return str;
}

join = nodejs_join;

function nodejs_removeColors(str) {
    return String.prototype.replace.call(str, colorRegExp, "");
}

removeColors = nodejs_removeColors;

let { isStackOverflowError } = /* require('internal/errors') */ {};

function nodejs_isStackOverflowError(err) {
    if (nodejs_isStackOverflowError.maxStack_ErrorMessage === undefined) {
        try {
            function overflowStack() {
                overflowStack();
            }
            overflowStack();
        } catch (err) {
            nodejs_isStackOverflowError.maxStack_ErrorMessage = err.message;
            nodejs_isStackOverflowError.maxStack_ErrorName = err.name;
        }
    }

    return (
        err &&
        err.name === nodejs_isStackOverflowError.maxStack_ErrorName &&
        err.message === nodejs_isStackOverflowError.maxStack_ErrorMessage
    );
}
nodejs_isStackOverflowError.maxStack_ErrorMessage = undefined;
nodejs_isStackOverflowError.maxStack_ErrorName = undefined;

isStackOverflowError = nodejs_isStackOverflowError;

let {
    // will not work for promise functions tho
    isAsyncFunction = (func) => func?.constructor?.name === "AsyncFunction",
    isGeneratorFunction = (func) => func?.constructor?.name === "GeneratorFunction",
    isAnyArrayBuffer = (obj) =>
        obj instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && obj instanceof SharedArrayBuffer),
    isArrayBuffer,
    isArgumentsObject,
    isBoxedPrimitive,
    isDataView,

    // v8::External shit
    isExternal = () => false,
    isMap = (obj) => obj instanceof Map,
    isMapIterator = (obj) => obj?.toString() === "[object Map Iterator]",
    isModuleNamespaceObject,

    // idk how to add it, maybe `instanceof Error` would be ok?
    isNativeError = (e) => false,
    isPromise = (obj) => obj instanceof Promise,
    isSet = (obj) => obj instanceof Set,
    isSetIterator = (obj) => obj?.toString() === "[object Set Iterator]",
    isWeakMap = (obj) => obj instanceof WeakMap,
    isWeakSet = (obj) => obj instanceof WeakSet,
    isRegExp = (obj) => obj instanceof RegExp,
    isDate = (obj) => obj instanceof Date,
    isTypedArray = (obj) => obj instanceof TypedArrayPrototype.constructor,
    isStringObject = (obj) => typeof obj === "object" && obj != null && obj.constructor === String,
    isNumberObject = (obj) => typeof obj === "object" && obj != null && obj.constructor === Number,
    isBooleanObject = (obj) => typeof obj === "object" && obj != null && obj.constructor === Boolean,
    isBigIntObject = (obj) => typeof obj === "object" && obj != null && obj.constructor === BigInt,
} = /* require('internal/util/types') */ {};

const nodejs_isArrayBuffer = (b) =>
    b instanceof ArrayBuffer ||
    (typeof b === "object" && b.constructor && b.constructor.name === "ArrayBuffer" && b.byteLength >= 0);

isArrayBuffer = nodejs_isArrayBuffer;

const custom_isArgumentsObject = (obj) => obj + "" === "[object Arguments]" && obj[SymbolIterator] != null;

isArgumentsObject = custom_isArgumentsObject;

const custom_isBoxedPrimitive = (obj) =>
    typeof obj === "object" &&
    obj != null &&
    (obj.constructor === Number ||
        obj.constructor === String ||
        obj.constructor === Boolean ||
        obj.constructor === BigInt ||
        obj.constructor === Symbol);

isBoxedPrimitive = custom_isBoxedPrimitive;

const custom_isDataView = (obj) => obj instanceof DataView;

isDataView = custom_isDataView;

const custom_isModuleNamespaceObject = (obj) => {
    try {
        const descr = obj && Object.getOwnPropertyDescriptor(obj, Symbol.toStringTag);
        return descr.value === "Module" && !(descr.writable || descr.enumerable || descr.configurable);
    } catch {
        return false;
    }
};

isModuleNamespaceObject = custom_isModuleNamespaceObject;

class ERR_INTERNAL_ASSERTION extends Error {}

function assert(value, message) {
    if (!value) {
        throw new ERR_INTERNAL_ASSERTION(message);
    }
}

// TODO: do something with this shit
// const { NativeModule } = require('internal/bootstrap/loaders');
const NativeModule = {
    exists: () => false,
};

function hideStackFrames(fn) {
    // We rename the functions that will be hidden to cut off the stacktrace
    // at the outermost one
    const hidden = "__internal_shit__" + fn.name;
    ObjectDefineProperty(fn, "name", { __proto__: null, value: hidden });
    return fn;
}

const validateObject = hideStackFrames((value, name, options) => {
    const useDefaultOptions = options == null;
    const allowArray = useDefaultOptions ? false : options.allowArray;
    const allowFunction = useDefaultOptions ? false : options.allowFunction;
    const nullable = useDefaultOptions ? false : options.nullable;
    if (
        (!nullable && value === null) ||
        (!allowArray && ArrayIsArray(value)) ||
        (typeof value !== "object" && (!allowFunction || typeof value !== "function"))
    ) {
        throw new Error(`[validateObject] invalid ${name} type of arg, expected: Object`);
    }
});

function validateString(value, name) {
    if (typeof value !== "string") throw new Error(`value ${name} must be string`);
}

let hexSlice;

const builtInObjects = new SafeSet(
    ArrayPrototypeFilter(
        ObjectGetOwnPropertyNames(globalThis),
        (e) => RegExpPrototypeExec(/^[A-Z][a-zA-Z0-9]+$/, e) !== null
    )
);

// https://tc39.es/ecma262/#sec-IsHTMLDDA-internal-slot
const isUndetectableObject = (v) => typeof v === "undefined" && v !== undefined;

// These options must stay in sync with `getUserOptions`. So if any option will
// be added or removed, `getUserOptions` must also be updated accordingly.
const inspectDefaultOptions = ObjectSeal({
    showHidden: false,
    depth: 2,
    colors: false,
    customInspect: true,
    showProxy: false,
    maxArrayLength: 100,
    maxStringLength: 10000,
    breakLength: 80,
    compact: 3,
    sorted: false,
    getters: false,
    numericSeparator: false,
});

const kObjectType = 0;
const kArrayType = 1;
const kArrayExtrasType = 2;

/* eslint-disable no-control-regex */
const strEscapeSequencesRegExp =
    /[\x00-\x1f\x27\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const strEscapeSequencesReplacer =
    /[\x00-\x1f\x27\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const strEscapeSequencesRegExpSingle =
    /[\x00-\x1f\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const strEscapeSequencesReplacerSingle =
    /[\x00-\x1f\x5c\x7f-\x9f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/* eslint-enable no-control-regex */

const keyStrRegExp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const numberRegExp = /^(0|[1-9][0-9]*)$/;

const coreModuleRegExp = /^ {4}at (?:[^/\\(]+ \(|)node:(.+):\d+:\d+\)?$/;
const nodeModulesRegExp = /[/\\]node_modules[/\\](.+?)(?=[/\\])/g;

const classRegExp = /^(\s+[^(]*?)\s*{/;
// eslint-disable-next-line node-core/no-unescaped-regexp-dot
const stripCommentsRegExp = /(\/\/.*?\n)|(\/\*(.|\n)*?\*\/)/g;

const kMinLineLength = 16;

// Constants to map the iterator state.
const kWeak = 0;
const kIterator = 1;
const kMapEntries = 2;

// Escaped control characters (plus the single quote and the backslash). Use
// empty strings to fill up unused entries.
const meta = [
    "\\x00",
    "\\x01",
    "\\x02",
    "\\x03",
    "\\x04",
    "\\x05",
    "\\x06",
    "\\x07", // x07
    "\\b",
    "\\t",
    "\\n",
    "\\x0B",
    "\\f",
    "\\r",
    "\\x0E",
    "\\x0F", // x0F
    "\\x10",
    "\\x11",
    "\\x12",
    "\\x13",
    "\\x14",
    "\\x15",
    "\\x16",
    "\\x17", // x17
    "\\x18",
    "\\x19",
    "\\x1A",
    "\\x1B",
    "\\x1C",
    "\\x1D",
    "\\x1E",
    "\\x1F", // x1F
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "\\'",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // x2F
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // x3F
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // x4F
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "\\\\",
    "",
    "",
    "", // x5F
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // x6F
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "\\x7F", // x7F
    "\\x80",
    "\\x81",
    "\\x82",
    "\\x83",
    "\\x84",
    "\\x85",
    "\\x86",
    "\\x87", // x87
    "\\x88",
    "\\x89",
    "\\x8A",
    "\\x8B",
    "\\x8C",
    "\\x8D",
    "\\x8E",
    "\\x8F", // x8F
    "\\x90",
    "\\x91",
    "\\x92",
    "\\x93",
    "\\x94",
    "\\x95",
    "\\x96",
    "\\x97", // x97
    "\\x98",
    "\\x99",
    "\\x9A",
    "\\x9B",
    "\\x9C",
    "\\x9D",
    "\\x9E",
    "\\x9F", // x9F
];

// Regex used for ansi escape code splitting
// Adopted from https://github.com/chalk/ansi-regex/blob/HEAD/index.js
// License: MIT, authors: @sindresorhus, Qix-, arjunmehta and LitoMore
// Matches all ansi escape code sequences in a string
const ansiPattern =
    "[\\u001B\\u009B][[\\]()#;?]*" +
    "(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*" +
    "|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)" +
    "|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))";
const ansi = new RegExp(ansiPattern, "g");

let getStringWidth;

function getUserOptions(ctx, isCrossContext) {
    const ret = {
        stylize: ctx.stylize,
        showHidden: ctx.showHidden,
        depth: ctx.depth,
        colors: ctx.colors,
        customInspect: ctx.customInspect,
        showProxy: ctx.showProxy,
        maxArrayLength: ctx.maxArrayLength,
        maxStringLength: ctx.maxStringLength,
        breakLength: ctx.breakLength,
        compact: ctx.compact,
        sorted: ctx.sorted,
        getters: ctx.getters,
        numericSeparator: ctx.numericSeparator,
        ...ctx.userOptions,
    };

    // Typically, the target value will be an instance of `Object`. If that is
    // *not* the case, the object may come from another vm.Context, and we want
    // to avoid passing it objects from this Context in that case, so we remove
    // the prototype from the returned object itself + the `stylize()` function,
    // and remove all other non-primitives, including non-primitive user options.
    if (isCrossContext) {
        ObjectSetPrototypeOf(ret, null);
        for (const key of ObjectKeys(ret)) {
            if ((typeof ret[key] === "object" || typeof ret[key] === "function") && ret[key] !== null) {
                delete ret[key];
            }
        }
        ret.stylize = ObjectSetPrototypeOf((value, flavour) => {
            let stylized;
            try {
                stylized = `${ctx.stylize(value, flavour)}`;
            } catch {
                // Continue regardless of error.
            }

            if (typeof stylized !== "string") return value;
            // `stylized` is a string as it should be, which is safe to pass along.
            return stylized;
        }, null);
    }

    return ret;
}

/**
 * Echos the value of any input. Tries to print the value out
 * in the best way possible given the different types.
 *
 * @param {any} value The value to print out.
 * @param {object} opts Optional options object that alters the output.
 */
/* Legacy: value, showHidden, depth, colors */
export function inspect(value, opts) {
    // Default options
    const ctx = {
        budget: {},
        indentationLvl: 0,
        seen: [],
        currentDepth: 0,
        stylize: stylizeNoColor,
        showHidden: inspectDefaultOptions.showHidden,
        depth: inspectDefaultOptions.depth,
        colors: inspectDefaultOptions.colors,
        customInspect: inspectDefaultOptions.customInspect,
        showProxy: inspectDefaultOptions.showProxy,
        maxArrayLength: inspectDefaultOptions.maxArrayLength,
        maxStringLength: inspectDefaultOptions.maxStringLength,
        breakLength: inspectDefaultOptions.breakLength,
        compact: inspectDefaultOptions.compact,
        sorted: inspectDefaultOptions.sorted,
        getters: inspectDefaultOptions.getters,
        numericSeparator: inspectDefaultOptions.numericSeparator,
    };
    if (arguments.length > 1) {
        // Legacy...
        if (arguments.length > 2) {
            if (arguments[2] !== undefined) {
                ctx.depth = arguments[2];
            }
            if (arguments.length > 3 && arguments[3] !== undefined) {
                ctx.colors = arguments[3];
            }
        }
        // Set user-specified options
        if (typeof opts === "boolean") {
            ctx.showHidden = opts;
        } else if (opts) {
            const optKeys = ObjectKeys(opts);
            for (let i = 0; i < optKeys.length; ++i) {
                const key = optKeys[i];
                // TODO(BridgeAR): Find a solution what to do about stylize. Either make
                // this function public or add a new API with a similar or better
                // functionality.
                if (ObjectPrototypeHasOwnProperty(inspectDefaultOptions, key) || key === "stylize") {
                    ctx[key] = opts[key];
                } else if (ctx.userOptions === undefined) {
                    // This is required to pass through the actual user input.
                    ctx.userOptions = opts;
                }
            }
        }
    }
    if (ctx.colors) ctx.stylize = stylizeWithColor;
    if (ctx.maxArrayLength === null) ctx.maxArrayLength = Infinity;
    if (ctx.maxStringLength === null) ctx.maxStringLength = Infinity;
    return formatValue(ctx, value, 0);
}
inspect.custom = customInspectSymbol;

ObjectDefineProperty(inspect, "defaultOptions", {
    __proto__: null,
    get() {
        return inspectDefaultOptions;
    },
    set(options) {
        validateObject(options, "options");
        return ObjectAssign(inspectDefaultOptions, options);
    },
});

// Set Graphics Rendition https://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Each color consists of an array with the color code as first entry and the
// reset code as second entry.
const defaultFG = 39;
const defaultBG = 49;
inspect.colors = ObjectAssign(ObjectCreate(null), {
    reset: ["w", 0],
    bold: ["wl"],
    dim: ["w"], // Alias: faint
    italic: ["w"],
    underline: ["w"],
    blink: ["w"],
    // Swap foreground and background colors
    inverse: ["w"], // Alias: swapcolors, swapColors
    hidden: ["w"], // Alias: conceal
    strikethrough: ["w"], // Alias: strikeThrough, crossedout, crossedOut
    doubleunderline: ["w"], // Alias: doubleUnderline
    black: ["k"],
    red: ["rl"],
    green: ["gl"],
    yellow: ["yl"],
    blue: ["bl"],
    magenta: ["ml"],
    cyan: ["cl"],
    white: ["wl"],
    bgBlack: ["w"],
    bgRed: ["w"],
    bgGreen: ["w"],
    bgYellow: ["w"],
    bgBlue: ["w"],
    bgMagenta: ["w"],
    bgCyan: ["w"],
    bgWhite: ["w"],
    framed: ["w"],
    overlined: ["w"],
    gray: ["kl"], // Alias: grey, blackBright
    redBright: ["rl"],
    greenBright: ["gl"],
    yellowBright: ["yl"],
    blueBright: ["bl"],
    magentaBright: ["ml"],
    cyanBright: ["cl"],
    whiteBright: ["wl"],
    bgGray: ["kl"], // Alias: bgGrey, bgBlackBright
    bgRedBright: ["rl"],
    bgGreenBright: ["gl"],
    bgYellowBright: ["yl"],
    bgBlueBright: ["bl"],
    bgMagentaBright: ["ml"],
    bgCyanBright: ["cl"],
    bgWhiteBright: ["wl"],
});

function defineColorAlias(target, alias) {
    ObjectDefineProperty(inspect.colors, alias, {
        __proto__: null,
        get() {
            return this[target];
        },
        set(value) {
            this[target] = value;
        },
        configurable: true,
        enumerable: false,
    });
}

defineColorAlias("gray", "grey");
defineColorAlias("gray", "blackBright");
defineColorAlias("bgGray", "bgGrey");
defineColorAlias("bgGray", "bgBlackBright");
defineColorAlias("dim", "faint");
defineColorAlias("strikethrough", "crossedout");
defineColorAlias("strikethrough", "strikeThrough");
defineColorAlias("strikethrough", "crossedOut");
defineColorAlias("hidden", "conceal");
defineColorAlias("inverse", "swapColors");
defineColorAlias("inverse", "swapcolors");
defineColorAlias("doubleunderline", "doubleUnderline");

// TODO(BridgeAR): Add function style support for more complex styles.
// Don't use 'blue' not visible on cmd.exe
inspect.styles = ObjectAssign(ObjectCreate(null), {
    special: "cyan",
    number: "yellow",
    bigint: "yellow",
    boolean: "yellow",
    undefined: "grey",
    null: "bold",
    string: "green",
    symbol: "green",
    date: "magenta",
    // "name": intentionally not styling
    // TODO(BridgeAR): Highlight regular expressions properly.
    regexp: "red",
    module: "underline",
});

function addQuotes(str, quotes) {
    if (quotes === -1) {
        return `"${str}"`;
    }
    if (quotes === -2) {
        return `\`${str}\``;
    }
    return `'${str}'`;
}

function escapeFn(str) {
    const charCode = StringPrototypeCharCodeAt(str);
    return meta.length > charCode ? meta[charCode] : `\\u${charCode.toString(16)}`;
}

// Escape control characters, single quotes and the backslash.
// This is similar to JSON stringify escaping.
function strEscape(str) {
    let escapeTest = strEscapeSequencesRegExp;
    let escapeReplace = strEscapeSequencesReplacer;
    let singleQuote = 39;

    // Check for double quotes. If not present, do not escape single quotes and
    // instead wrap the text in double quotes. If double quotes exist, check for
    // backticks. If they do not exist, use those as fallback instead of the
    // double quotes.
    if (StringPrototypeIncludes(str, "'")) {
        // This invalidates the charCode and therefore can not be matched for
        // anymore.
        if (!StringPrototypeIncludes(str, '"')) {
            singleQuote = -1;
        } else if (!StringPrototypeIncludes(str, "`") && !StringPrototypeIncludes(str, "${")) {
            singleQuote = -2;
        }
        if (singleQuote !== 39) {
            escapeTest = strEscapeSequencesRegExpSingle;
            escapeReplace = strEscapeSequencesReplacerSingle;
        }
    }

    // Some magic numbers that worked out fine while benchmarking with v8 6.0
    if (str.length < 5000 && RegExpPrototypeExec(escapeTest, str) === null) return addQuotes(str, singleQuote);
    if (str.length > 100) {
        str = RegExpPrototypeSymbolReplace(escapeReplace, str, escapeFn);
        return addQuotes(str, singleQuote);
    }

    let result = "";
    let last = 0;
    for (let i = 0; i < str.length; i++) {
        const point = StringPrototypeCharCodeAt(str, i);
        if (point === singleQuote || point === 92 || point < 32 || (point > 126 && point < 160)) {
            if (last === i) {
                result += meta[point];
            } else {
                result += `${StringPrototypeSlice(str, last, i)}${meta[point]}`;
            }
            last = i + 1;
        } else if (point >= 0xd800 && point <= 0xdfff) {
            if (point <= 0xdbff && i + 1 < str.length) {
                const point = StringPrototypeCharCodeAt(str, i + 1);
                if (point >= 0xdc00 && point <= 0xdfff) {
                    i++;
                    continue;
                }
            }
            result += `${StringPrototypeSlice(str, last, i)}${`\\u${point.toString(16)}`}`;
            last = i + 1;
        }
    }

    if (last !== str.length) {
        result += StringPrototypeSlice(str, last);
    }
    return addQuotes(result, singleQuote);
}

function stylizeWithColor(str, styleType) {
    const style = inspect.styles[styleType];
    if (style !== undefined) {
        const color = inspect.colors[style];
        if (color !== undefined) return `~${color[0]}~${str}~w~`;
    }
    return str;
}

function stylizeNoColor(str) {
    return str;
}

// Return a new empty array to push in the results of the default formatter.
function getEmptyFormatArray() {
    return [];
}

function isInstanceof(object, proto) {
    try {
        return object instanceof proto;
    } catch {
        return false;
    }
}

function getConstructorName(obj, ctx, recurseTimes, protoProps) {
    let firstProto;
    const tmp = obj;
    while (obj || isUndetectableObject(obj)) {
        const descriptor = ObjectGetOwnPropertyDescriptor(obj, "constructor");
        if (
            descriptor !== undefined &&
            typeof descriptor.value === "function" &&
            descriptor.value.name !== "" &&
            isInstanceof(tmp, descriptor.value)
        ) {
            if (protoProps !== undefined && (firstProto !== obj || !builtInObjects.has(descriptor.value.name))) {
                addPrototypeProperties(ctx, tmp, firstProto || tmp, recurseTimes, protoProps);
            }
            return String(descriptor.value.name);
        }

        obj = ObjectGetPrototypeOf(obj);
        if (firstProto === undefined) {
            firstProto = obj;
        }
    }

    if (firstProto === null) {
        return null;
    }

    const res = internalGetConstructorName(tmp);

    if (recurseTimes > ctx.depth && ctx.depth !== null) {
        return `${res} <Complex prototype>`;
    }

    const protoConstr = getConstructorName(firstProto, ctx, recurseTimes + 1, protoProps);

    if (protoConstr === null) {
        return `${res} <${inspect(firstProto, {
            ...ctx,
            customInspect: false,
            depth: -1,
        })}>`;
    }

    return `${res} <${protoConstr}>`;
}

// This function has the side effect of adding prototype properties to the
// `output` argument (which is an array). This is intended to highlight user
// defined prototype properties.
function addPrototypeProperties(ctx, main, obj, recurseTimes, output) {
    let depth = 0;
    let keys;
    let keySet;
    do {
        if (depth !== 0 || main === obj) {
            obj = ObjectGetPrototypeOf(obj);
            // Stop as soon as a null prototype is encountered.
            if (obj === null) {
                return;
            }
            // Stop as soon as a built-in object type is detected.
            const descriptor = ObjectGetOwnPropertyDescriptor(obj, "constructor");
            if (
                descriptor !== undefined &&
                typeof descriptor.value === "function" &&
                builtInObjects.has(descriptor.value.name)
            ) {
                return;
            }
        }

        if (depth === 0) {
            keySet = new SafeSet();
        } else {
            ArrayPrototypeForEach(keys, (key) => keySet.add(key));
        }
        // Get all own property names and symbols.
        keys = ReflectOwnKeys(obj);
        ArrayPrototypePush(ctx.seen, main);
        for (const key of keys) {
            // Ignore the `constructor` property and keys that exist on layers above.
            if (key === "constructor" || ObjectPrototypeHasOwnProperty(main, key) || (depth !== 0 && keySet.has(key))) {
                continue;
            }
            const desc = ObjectGetOwnPropertyDescriptor(obj, key);
            if (typeof desc.value === "function") {
                continue;
            }
            const value = formatProperty(ctx, obj, recurseTimes, key, kObjectType, desc, main);
            if (ctx.colors) {
                // Faint!
                ArrayPrototypePush(output, `\u001b[2m${value}\u001b[22m`);
            } else {
                ArrayPrototypePush(output, value);
            }
        }
        ArrayPrototypePop(ctx.seen);
        // Limit the inspection to up to three prototype layers. Using `recurseTimes`
        // is not a good choice here, because it's as if the properties are declared
        // on the current object from the users perspective.
    } while (++depth !== 3);
}

function getPrefix(constructor, tag, fallback, size = "") {
    if (constructor === null) {
        if (tag !== "" && fallback !== tag) {
            return `[${fallback}${size}: null prototype] [${tag}] `;
        }
        return `[${fallback}${size}: null prototype] `;
    }

    if (tag !== "" && constructor !== tag) {
        return `${constructor}${size} [${tag}] `;
    }
    return `${constructor}${size} `;
}

// Look up the keys of the object.
function getKeys(value, showHidden) {
    let keys;
    const symbols = ObjectGetOwnPropertySymbols(value);
    if (showHidden) {
        keys = ObjectGetOwnPropertyNames(value);
        if (symbols.length !== 0) ArrayPrototypePushApply(keys, symbols);
    } else {
        // This might throw if `value` is a Module Namespace Object from an
        // unevaluated module, but we don't want to perform the actual type
        // check because it's expensive.
        // TODO(devsnek): track https://github.com/tc39/ecma262/issues/1209
        // and modify this logic as needed.
        try {
            keys = ObjectKeys(value);
        } catch (err) {
            assert(isNativeError(err) && err.name === "ReferenceError" && isModuleNamespaceObject(value));
            keys = ObjectGetOwnPropertyNames(value);
        }
        if (symbols.length !== 0) {
            const filter = (key) => ObjectPrototypePropertyIsEnumerable(value, key);
            ArrayPrototypePushApply(keys, ArrayPrototypeFilter(symbols, filter));
        }
    }
    return keys;
}

function getCtxStyle(value, constructor, tag) {
    let fallback = "";
    if (constructor === null) {
        fallback = internalGetConstructorName(value);
        if (fallback === tag) {
            fallback = "Object";
        }
    }
    return getPrefix(constructor, tag, fallback);
}

function formatProxy(ctx, proxy, recurseTimes) {
    if (recurseTimes > ctx.depth && ctx.depth !== null) {
        return ctx.stylize("Proxy [Array]", "special");
    }
    recurseTimes += 1;
    ctx.indentationLvl += 2;
    const res = [formatValue(ctx, proxy[0], recurseTimes), formatValue(ctx, proxy[1], recurseTimes)];
    ctx.indentationLvl -= 2;
    return reduceToSingleString(ctx, res, "", ["Proxy [", "]"], kArrayExtrasType, recurseTimes);
}

// Note: using `formatValue` directly requires the indentation level to be
// corrected by setting `ctx.indentationLvL += diff` and then to decrease the
// value afterwards again.
function formatValue(ctx, value, recurseTimes, typedArray) {
    // Primitive types cannot have properties.
    if (typeof value !== "object" && typeof value !== "function" && !isUndetectableObject(value)) {
        return formatPrimitive(ctx.stylize, value, ctx);
    }
    if (value === null) {
        return ctx.stylize("null", "null");
    }

    // Memorize the context for custom inspection on proxies.
    const context = value;
    // Always check for proxies to prevent side effects and to prevent triggering
    // any proxy handlers.
    const proxy = getProxyDetails(value, !!ctx.showProxy);
    if (proxy !== undefined) {
        if (proxy === null || proxy[0] === null) {
            return ctx.stylize("<Revoked Proxy>", "special");
        }
        if (ctx.showProxy) {
            return formatProxy(ctx, proxy, recurseTimes);
        }
        value = proxy;
    }

    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it.
    if (ctx.customInspect) {
        const maybeCustom = value[customInspectSymbol];
        if (
            typeof maybeCustom === "function" &&
            // Filter out the util module, its inspect function is special.
            maybeCustom !== inspect &&
            // Also filter out any prototype objects using the circular check.
            !(value.constructor && value.constructor.prototype === value)
        ) {
            // This makes sure the recurseTimes are reported as before while using
            // a counter internally.
            const depth = ctx.depth === null ? null : ctx.depth - recurseTimes;
            const isCrossContext = proxy !== undefined || !(context instanceof Object);
            const ret = FunctionPrototypeCall(
                maybeCustom,
                context,
                depth,
                getUserOptions(ctx, isCrossContext),
                inspect
            );
            // If the custom inspection method returned `this`, don't go into
            // infinite recursion.
            if (ret !== context) {
                if (typeof ret !== "string") {
                    return formatValue(ctx, ret, recurseTimes);
                }
                return ret.replace(/\n/g, `\n${" ".repeat(ctx.indentationLvl)}`);
            }
        }
    }

    // Using an array here is actually better for the average case than using
    // a Set. `seen` will only check for the depth and will never grow too large.
    if (ctx.seen.includes(value)) {
        let index = 1;
        if (ctx.circular === undefined) {
            ctx.circular = new SafeMap();
            ctx.circular.set(value, index);
        } else {
            index = ctx.circular.get(value);
            if (index === undefined) {
                index = ctx.circular.size + 1;
                ctx.circular.set(value, index);
            }
        }
        return ctx.stylize(`[Circular *${index}]`, "special");
    }

    return formatRaw(ctx, value, recurseTimes, typedArray);
}

function formatRaw(ctx, value, recurseTimes, typedArray) {
    let keys;
    let protoProps;
    if (ctx.showHidden && (recurseTimes <= ctx.depth || ctx.depth === null)) {
        protoProps = [];
    }

    const constructor = getConstructorName(value, ctx, recurseTimes, protoProps);
    // Reset the variable to check for this later on.
    if (protoProps !== undefined && protoProps.length === 0) {
        protoProps = undefined;
    }

    let tag = value[SymbolToStringTag];
    // Only list the tag in case it's non-enumerable / not an own property.
    // Otherwise we'd print this twice.
    if (
        typeof tag !== "string" ||
        (tag !== "" &&
            (ctx.showHidden ? ObjectPrototypeHasOwnProperty : ObjectPrototypePropertyIsEnumerable)(
                value,
                SymbolToStringTag
            ))
    ) {
        tag = "";
    }
    let base = "";
    let formatter = getEmptyFormatArray;
    let braces;
    let noIterator = true;
    let i = 0;
    const filter = ctx.showHidden ? ALL_PROPERTIES : ONLY_ENUMERABLE;

    let extrasType = kObjectType;

    // Iterators and the rest are split to reduce checks.
    // We have to check all values in case the constructor is set to null.
    // Otherwise it would not possible to identify all types properly.
    if (value[SymbolIterator] || constructor === null) {
        noIterator = false;
        if (ArrayIsArray(value)) {
            // Only set the constructor for non ordinary ("Array [...]") arrays.
            const prefix =
                constructor !== "Array" || tag !== "" ? getPrefix(constructor, tag, "Array", `(${value.length})`) : "";
            keys = getOwnNonIndexProperties(value, filter);
            braces = [`${prefix}[`, "]"];
            if (value.length === 0 && keys.length === 0 && protoProps === undefined) return `${braces[0]}]`;
            extrasType = kArrayExtrasType;
            formatter = formatArray;
        } else if (isSet(value)) {
            const size = SetPrototypeGetSize(value);
            const prefix = getPrefix(constructor, tag, "Set", `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            formatter =
                constructor !== null ? formatSet.bind(null, value) : formatSet.bind(null, SetPrototypeValues(value));
            if (size === 0 && keys.length === 0 && protoProps === undefined) return `${prefix}{}`;
            braces = [`${prefix}{`, "}"];
        } else if (isMap(value)) {
            const size = MapPrototypeGetSize(value);
            const prefix = getPrefix(constructor, tag, "Map", `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            formatter =
                constructor !== null ? formatMap.bind(null, value) : formatMap.bind(null, MapPrototypeEntries(value));
            if (size === 0 && keys.length === 0 && protoProps === undefined) return `${prefix}{}`;
            braces = [`${prefix}{`, "}"];
        } else if (isTypedArray(value)) {
            keys = getOwnNonIndexProperties(value, filter);
            let bound = value;
            let fallback = "";
            if (constructor === null) {
                fallback = TypedArrayPrototypeGetSymbolToStringTag(value);
                // Reconstruct the array information.
                bound = new primordials[fallback](value);
            }
            const size = TypedArrayPrototypeGetLength(value);
            const prefix = getPrefix(constructor, tag, fallback, `(${size})`);
            braces = [`${prefix}[`, "]"];
            if (value.length === 0 && keys.length === 0 && !ctx.showHidden) return `${braces[0]}]`;
            // Special handle the value. The original value is required below. The
            // bound function is required to reconstruct missing information.
            formatter = formatTypedArray.bind(null, bound, size);
            extrasType = kArrayExtrasType;
        } else if (isMapIterator(value)) {
            keys = getKeys(value, ctx.showHidden);
            braces = getIteratorBraces("Map", tag);
            // Add braces to the formatter parameters.
            formatter = formatIterator.bind(null, braces);
        } else if (isSetIterator(value)) {
            keys = getKeys(value, ctx.showHidden);
            braces = getIteratorBraces("Set", tag);
            // Add braces to the formatter parameters.
            formatter = formatIterator.bind(null, braces);
        } else {
            noIterator = true;
        }
    }
    if (noIterator) {
        keys = getKeys(value, ctx.showHidden);
        braces = ["{", "}"];
        if (constructor === "Object") {
            if (isArgumentsObject(value)) {
                braces[0] = "[Arguments] {";
            } else if (tag !== "") {
                braces[0] = `${getPrefix(constructor, tag, "Object")}{`;
            }
            if (keys.length === 0 && protoProps === undefined) {
                return `${braces[0]}}`;
            }
        } else if (typeof value === "function") {
            base = getFunctionBase(value, constructor, tag);
            if (keys.length === 0 && protoProps === undefined) return ctx.stylize(base, "special");
        } else if (isRegExp(value)) {
            // Make RegExps say that they are RegExps
            base = RegExpPrototypeToString(constructor !== null ? value : new RegExp(value));
            const prefix = getPrefix(constructor, tag, "RegExp");
            if (prefix !== "RegExp ") base = `${prefix}${base}`;
            if ((keys.length === 0 && protoProps === undefined) || (recurseTimes > ctx.depth && ctx.depth !== null)) {
                return ctx.stylize(base, "regexp");
            }
        } else if (isDate(value)) {
            // Make dates with properties first say the date
            base = NumberIsNaN(DatePrototypeGetTime(value))
                ? DatePrototypeToString(value)
                : DatePrototypeToISOString(value);
            const prefix = getPrefix(constructor, tag, "Date");
            if (prefix !== "Date ") base = `${prefix}${base}`;
            if (keys.length === 0 && protoProps === undefined) {
                return ctx.stylize(base, "date");
            }
        } else if (isError(value)) {
            base = formatError(value, constructor, tag, ctx, keys);
            if (keys.length === 0 && protoProps === undefined) return base;
        } else if (isAnyArrayBuffer(value)) {
            // Fast path for ArrayBuffer and SharedArrayBuffer.
            // Can't do the same for DataView because it has a non-primitive
            // .buffer property that we need to recurse for.
            const arrayType = isArrayBuffer(value) ? "ArrayBuffer" : "SharedArrayBuffer";
            const prefix = getPrefix(constructor, tag, arrayType);
            if (typedArray === undefined) {
                formatter = formatArrayBuffer;
            } else if (keys.length === 0 && protoProps === undefined) {
                return prefix + `{ byteLength: ${formatNumber(ctx.stylize, value.byteLength, false)} }`;
            }
            braces[0] = `${prefix}{`;
            ArrayPrototypeUnshift(keys, "byteLength");
        } else if (isDataView(value)) {
            braces[0] = `${getPrefix(constructor, tag, "DataView")}{`;
            // .buffer goes last, it's not a primitive like the others.
            ArrayPrototypeUnshift(keys, "byteLength", "byteOffset", "buffer");
        } else if (isPromise(value)) {
            braces[0] = `${getPrefix(constructor, tag, "Promise")}{`;
            formatter = formatPromise;
        } else if (isWeakSet(value)) {
            braces[0] = `${getPrefix(constructor, tag, "WeakSet")}{`;
            formatter = ctx.showHidden ? formatWeakSet : formatWeakCollection;
        } else if (isWeakMap(value)) {
            braces[0] = `${getPrefix(constructor, tag, "WeakMap")}{`;
            formatter = ctx.showHidden ? formatWeakMap : formatWeakCollection;
        } else if (isModuleNamespaceObject(value)) {
            braces[0] = `${getPrefix(constructor, tag, "Module")}{`;
            // Special handle keys for namespace objects.
            formatter = formatNamespaceObject.bind(null, keys);
        } else if (isBoxedPrimitive(value)) {
            base = getBoxedBase(value, ctx, keys, constructor, tag);
            if (keys.length === 0 && protoProps === undefined) {
                return base;
            }
        } else {
            if (keys.length === 0 && protoProps === undefined) {
                if (isExternal(value)) {
                    const address = "UNSUPPORTED VALUE";
                    // const address = getExternalValue(value).toString(16);
                    return ctx.stylize(`[External: ${address}]`, "special");
                }
                return `${getCtxStyle(value, constructor, tag)}{}`;
            }
            braces[0] = `${getCtxStyle(value, constructor, tag)}{`;
        }
    }

    if (recurseTimes > ctx.depth && ctx.depth !== null) {
        let constructorName = getCtxStyle(value, constructor, tag).slice(0, -1);
        if (constructor !== null) constructorName = `[${constructorName}]`;
        return ctx.stylize(constructorName, "special");
    }
    recurseTimes += 1;

    ctx.seen.push(value);
    ctx.currentDepth = recurseTimes;
    let output;
    const indentationLvl = ctx.indentationLvl;
    try {
        output = formatter(ctx, value, recurseTimes);
        for (i = 0; i < keys.length; i++) {
            output.push(formatProperty(ctx, value, recurseTimes, keys[i], extrasType));
        }
        if (protoProps !== undefined) {
            output.push(...protoProps);
        }
    } catch (err) {
        const constructorName = getCtxStyle(value, constructor, tag).slice(0, -1);
        return handleMaxCallStackSize(ctx, err, constructorName, indentationLvl);
    }
    if (ctx.circular !== undefined) {
        const index = ctx.circular.get(value);
        if (index !== undefined) {
            const reference = ctx.stylize(`<ref *${index}>`, "special");
            // Add reference always to the very beginning of the output.
            if (ctx.compact !== true) {
                base = base === "" ? reference : `${reference} ${base}`;
            } else {
                braces[0] = `${reference} ${braces[0]}`;
            }
        }
    }
    ctx.seen.pop();

    if (ctx.sorted) {
        const comparator = ctx.sorted === true ? undefined : ctx.sorted;
        if (extrasType === kObjectType) {
            output = output.sort(comparator);
        } else if (keys.length > 1) {
            const sorted = output.slice(output.length - keys.length).sort(comparator);
            output.splice(output.length - keys.length, keys.length, ...sorted);
        }
    }

    const res = reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value);
    const budget = ctx.budget[ctx.indentationLvl] || 0;
    const newLength = budget + res.length;
    ctx.budget[ctx.indentationLvl] = newLength;
    // If any indentationLvl exceeds this limit, limit further inspecting to the
    // minimum. Otherwise the recursive algorithm might continue inspecting the
    // object even though the maximum string size (~2 ** 28 on 32 bit systems and
    // ~2 ** 30 on 64 bit systems) exceeded. The actual output is not limited at
    // exactly 2 ** 27 but a bit higher. This depends on the object shape.
    // This limit also makes sure that huge objects don't block the event loop
    // significantly.
    if (newLength > 2 ** 27) {
        ctx.depth = -1;
    }
    return res;
}

function getIteratorBraces(type, tag) {
    if (tag !== `${type} Iterator`) {
        if (tag !== "") tag += "] [";
        tag += `${type} Iterator`;
    }
    return [`[${tag}] {`, "}"];
}

function getBoxedBase(value, ctx, keys, constructor, tag) {
    let fn;
    let type;
    if (isNumberObject(value)) {
        fn = NumberPrototypeValueOf;
        type = "Number";
    } else if (isStringObject(value)) {
        fn = StringPrototypeValueOf;
        type = "String";
        // For boxed Strings, we have to remove the 0-n indexed entries,
        // since they just noisy up the output and are redundant
        // Make boxed primitive Strings look like such
        keys.splice(0, value.length);
    } else if (isBooleanObject(value)) {
        fn = BooleanPrototypeValueOf;
        type = "Boolean";
    } else if (isBigIntObject(value)) {
        fn = BigIntPrototypeValueOf;
        type = "BigInt";
    } else {
        fn = SymbolPrototypeValueOf;
        type = "Symbol";
    }
    let base = `[${type}`;
    if (type !== constructor) {
        if (constructor === null) {
            base += " (null prototype)";
        } else {
            base += ` (${constructor})`;
        }
    }
    base += `: ${formatPrimitive(stylizeNoColor, fn(value), ctx)}]`;
    if (tag !== "" && tag !== constructor) {
        base += ` [${tag}]`;
    }
    if (keys.length !== 0 || ctx.stylize === stylizeNoColor) return base;
    return ctx.stylize(base, StringPrototypeToLowerCase(type));
}

function getClassBase(value, constructor, tag) {
    const hasName = ObjectPrototypeHasOwnProperty(value, "name");
    const name = (hasName && value.name) || "(anonymous)";
    let base = `class ${name}`;
    if (constructor !== "Function" && constructor !== null) {
        base += ` [${constructor}]`;
    }
    if (tag !== "" && constructor !== tag) {
        base += ` [${tag}]`;
    }
    if (constructor !== null) {
        const superName = ObjectGetPrototypeOf(value).name;
        if (superName) {
            base += ` extends ${superName}`;
        }
    } else {
        base += " extends [null prototype]";
    }
    return `[${base}]`;
}

function getFunctionBase(value, constructor, tag) {
    const stringified = FunctionPrototypeToString(value);
    if (stringified.startsWith("class") && stringified.endsWith("}")) {
        const slice = stringified.slice(5, -1);
        const bracketIndex = slice.indexOf("{");
        if (
            bracketIndex !== -1 &&
            (!slice.slice(0, bracketIndex).includes("(") ||
                // Slow path to guarantee that it's indeed a class.
                classRegExp.test(slice.replace(stripCommentsRegExp)))
        ) {
            return getClassBase(value, constructor, tag);
        }
    }
    let type = "Function";
    if (isGeneratorFunction(value)) {
        type = `Generator${type}`;
    }
    if (isAsyncFunction(value)) {
        type = `Async${type}`;
    }
    let base = `[${type}`;
    if (constructor === null) {
        base += " (null prototype)";
    }
    if (value.name === "") {
        base += " (anonymous)";
    } else {
        base += `: ${value.name}`;
    }
    base += "]";
    if (constructor !== type && constructor !== null) {
        base += ` ${constructor}`;
    }
    if (tag !== "" && constructor !== tag) {
        base += ` [${tag}]`;
    }
    return base;
}

function identicalSequenceRange(a, b) {
    for (let i = 0; i < a.length - 3; i++) {
        // Find the first entry of b that matches the current entry of a.
        const pos = b.indexOf(a[i]);
        if (pos !== -1) {
            const rest = b.length - pos;
            if (rest > 3) {
                let len = 1;
                const maxLen = MathMin(a.length - i, rest);
                // Count the number of consecutive entries.
                while (maxLen > len && a[i + len] === b[pos + len]) {
                    len++;
                }
                if (len > 3) {
                    return { len, offset: i };
                }
            }
        }
    }

    return { len: 0, offset: 0 };
}

function getStackString(error) {
    return error.stack ? String(error.stack) : ErrorPrototypeToString(error);
}

function getStackFrames(ctx, err, stack) {
    const frames = stack.split("\n");

    // Remove stack frames identical to frames in cause.
    if (err.cause && isError(err.cause)) {
        const causeStack = getStackString(err.cause);
        const causeStackStart = causeStack.indexOf("\n    at");
        if (causeStackStart !== -1) {
            const causeFrames = causeStack.slice(causeStackStart + 1).split("\n");
            const { len, offset } = identicalSequenceRange(frames, causeFrames);
            if (len > 0) {
                const skipped = len - 2;
                const msg = `    ... ${skipped} lines matching cause stack trace ...`;
                frames.splice(offset + 1, skipped, ctx.stylize(msg, "undefined"));
            }
        }
    }
    return frames;
}

function improveStack(stack, constructor, name, tag) {
    // A stack trace may contain arbitrary data. Only manipulate the output
    // for "regular errors" (errors that "look normal") for now.
    let len = name.length;

    if (
        constructor === null ||
        (name.endsWith("Error") &&
            stack.startsWith(name) &&
            (stack.length === len || stack[len] === ":" || stack[len] === "\n"))
    ) {
        let fallback = "Error";
        if (constructor === null) {
            const start =
                stack.match(/^([A-Z][a-z_ A-Z0-9[\]()-]+)(?::|\n {4}at)/) || stack.match(/^([a-z_A-Z0-9-]*Error)$/);
            fallback = (start && start[1]) || "";
            len = fallback.length;
            fallback = fallback || "Error";
        }
        const prefix = getPrefix(constructor, tag, fallback).slice(0, -1);
        if (name !== prefix) {
            if (prefix.includes(name)) {
                if (len === 0) {
                    stack = `${prefix}: ${stack}`;
                } else {
                    stack = `${prefix}${stack.slice(len)}`;
                }
            } else {
                stack = `${prefix} [${name}]${stack.slice(len)}`;
            }
        }
    }
    return stack;
}

function removeDuplicateErrorKeys(ctx, keys, err, stack) {
    if (!ctx.showHidden && keys.length !== 0) {
        for (const name of ["name", "message", "stack"]) {
            const index = keys.indexOf(name);
            // Only hide the property in case it's part of the original stack
            if (index !== -1 && stack.includes(err[name])) {
                keys.splice(index, 1);
            }
        }
    }
}

function formatError(err, constructor, tag, ctx, keys) {
    const name = err.name != null ? String(err.name) : "Error";
    let stack = getStackString(err);

    removeDuplicateErrorKeys(ctx, keys, err, stack);

    if ("cause" in err && (keys.length === 0 || !keys.includes("cause"))) {
        keys.push("cause");
    }

    stack = improveStack(stack, constructor, name, tag);

    // Ignore the error message if it's contained in the stack.
    let pos = (err.message && stack.indexOf(err.message)) || -1;
    if (pos !== -1) pos += err.message.length;
    // Wrap the error in brackets in case it has no stack trace.
    const stackStart = stack.indexOf("\n    at", pos);
    if (stackStart === -1) {
        stack = `[${stack}]`;
    } else {
        let newStack = stack.slice(0, stackStart);
        const lines = getStackFrames(ctx, err, stack.slice(stackStart + 1));
        if (ctx.colors) {
            // Highlight userland code and node modules.
            for (const line of lines) {
                const core = line.match(coreModuleRegExp);
                if (core !== null && NativeModule.exists(core[1])) {
                    newStack += `\n${ctx.stylize(line, "undefined")}`;
                } else {
                    // This adds underscores to all node_modules to quickly identify them.
                    let nodeModule;
                    newStack += "\n";
                    let pos = 0;
                    while ((nodeModule = nodeModulesRegExp.exec(line)) !== null) {
                        // '/node_modules/'.length === 14
                        newStack += line.slice(pos, nodeModule.index + 14);
                        newStack += ctx.stylize(nodeModule[1], "module");
                        pos = nodeModule.index + nodeModule[0].length;
                    }
                    newStack += pos === 0 ? line : line.slice(pos);
                }
            }
        } else {
            newStack += `\n${lines.join("\n")}`;
        }
        stack = newStack;
    }
    // The message and the stack have to be indented as well!
    if (ctx.indentationLvl !== 0) {
        const indentation = " ".repeat(ctx.indentationLvl);
        stack = stack.replace(/\n/g, `\n${indentation}`);
    }
    return stack;
}

function groupArrayElements(ctx, output, value) {
    let totalLength = 0;
    let maxLength = 0;
    let i = 0;
    let outputLength = output.length;
    if (ctx.maxArrayLength < output.length) {
        // This makes sure the "... n more items" part is not taken into account.
        outputLength--;
    }
    const separatorSpace = 2; // Add 1 for the space and 1 for the separator.
    const dataLen = new Array(outputLength);
    // Calculate the total length of all output entries and the individual max
    // entries length of all output entries. We have to remove colors first,
    // otherwise the length would not be calculated properly.
    for (; i < outputLength; i++) {
        const len = getStringWidth(output[i], ctx.colors);
        dataLen[i] = len;
        totalLength += len + separatorSpace;
        if (maxLength < len) maxLength = len;
    }
    // Add two to `maxLength` as we add a single whitespace character plus a comma
    // in-between two entries.
    const actualMax = maxLength + separatorSpace;
    // Check if at least three entries fit next to each other and prevent grouping
    // of arrays that contains entries of very different length (i.e., if a single
    // entry is longer than 1/5 of all other entries combined). Otherwise the
    // space in-between small entries would be enormous.
    if (actualMax * 3 + ctx.indentationLvl < ctx.breakLength && (totalLength / actualMax > 5 || maxLength <= 6)) {
        const approxCharHeights = 2.5;
        const averageBias = MathSqrt(actualMax - totalLength / output.length);
        const biasedMax = MathMax(actualMax - 3 - averageBias, 1);
        // Dynamically check how many columns seem possible.
        const columns = MathMin(
            // Ideally a square should be drawn. We expect a character to be about 2.5
            // times as high as wide. This is the area formula to calculate a square
            // which contains n rectangles of size `actualMax * approxCharHeights`.
            // Divide that by `actualMax` to receive the correct number of columns.
            // The added bias increases the columns for short entries.
            MathRound(MathSqrt(approxCharHeights * biasedMax * outputLength) / biasedMax),
            // Do not exceed the breakLength.
            MathFloor((ctx.breakLength - ctx.indentationLvl) / actualMax),
            // Limit array grouping for small `compact` modes as the user requested
            // minimal grouping.
            ctx.compact * 4,
            // Limit the columns to a maximum of fifteen.
            15
        );
        // Return with the original output if no grouping should happen.
        if (columns <= 1) {
            return output;
        }
        const tmp = [];
        const maxLineLength = [];
        for (let i = 0; i < columns; i++) {
            let lineMaxLength = 0;
            for (let j = i; j < output.length; j += columns) {
                if (dataLen[j] > lineMaxLength) lineMaxLength = dataLen[j];
            }
            lineMaxLength += separatorSpace;
            maxLineLength[i] = lineMaxLength;
        }
        let order = StringPrototypePadStart;
        if (value !== undefined) {
            for (let i = 0; i < output.length; i++) {
                if (typeof value[i] !== "number" && typeof value[i] !== "bigint") {
                    order = StringPrototypePadEnd;
                    break;
                }
            }
        }
        // Each iteration creates a single line of grouped entries.
        for (let i = 0; i < outputLength; i += columns) {
            // The last lines may contain less entries than columns.
            const max = MathMin(i + columns, outputLength);
            let str = "";
            let j = i;
            for (; j < max - 1; j++) {
                // Calculate extra color padding in case it's active. This has to be
                // done line by line as some lines might contain more colors than
                // others.
                const padding = maxLineLength[j - i] + output[j].length - dataLen[j];
                str += order(`${output[j]}, `, padding, " ");
            }
            if (order === StringPrototypePadStart) {
                const padding = maxLineLength[j - i] + output[j].length - dataLen[j] - separatorSpace;
                str += StringPrototypePadStart(output[j], padding, " ");
            } else {
                str += output[j];
            }
            ArrayPrototypePush(tmp, str);
        }
        if (ctx.maxArrayLength < output.length) {
            ArrayPrototypePush(tmp, output[outputLength]);
        }
        output = tmp;
    }
    return output;
}

function handleMaxCallStackSize(ctx, err, constructorName, indentationLvl) {
    if (isStackOverflowError(err)) {
        ctx.seen.pop();
        ctx.indentationLvl = indentationLvl;
        return ctx.stylize(
            `[${constructorName}: Inspection interrupted ` + "prematurely. Maximum call stack size exceeded.]",
            "special"
        );
    }
    /* c8 ignore next */
    throw new Error(err.stack);
}

function addNumericSeparator(integerString) {
    let result = "";
    let i = integerString.length;
    const start = integerString.startsWith("-") ? 1 : 0;
    for (; i >= start + 4; i -= 3) {
        result = `_${integerString.slice(i - 3, i)}${result}`;
    }
    return i === integerString.length ? integerString : `${integerString.slice(0, i)}${result}`;
}

function addNumericSeparatorEnd(integerString) {
    let result = "";
    let i = 0;
    for (; i < integerString.length - 3; i += 3) {
        result += `${integerString.slice(i, i + 3)}_`;
    }
    return i === 0 ? integerString : `${result}${integerString.slice(i)}`;
}

function formatNumber(fn, number, numericSeparator) {
    if (!numericSeparator) {
        // Format -0 as '-0'. Checking `number === -0` won't distinguish 0 from -0.
        if (ObjectIs(number, -0)) {
            return fn("-0", "number");
        }
        return fn(`${number}`, "number");
    }
    const integer = MathTrunc(number);
    const string = String(integer);
    if (integer === number) {
        if (!NumberIsFinite(number) || string.includes("e")) {
            return fn(string, "number");
        }
        return fn(`${addNumericSeparator(string)}`, "number");
    }
    if (NumberIsNaN(number)) {
        return fn(string, "number");
    }
    return fn(
        `${addNumericSeparator(string)}.${addNumericSeparatorEnd(String(number).slice(string.length + 1))}`,
        "number"
    );
}

function formatBigInt(fn, bigint, numericSeparator) {
    const string = String(bigint);
    if (!numericSeparator) {
        return fn(`${string}n`, "bigint");
    }
    return fn(`${addNumericSeparator(string)}n`, "bigint");
}

function formatPrimitive(fn, value, ctx) {
    if (typeof value === "string") {
        let trailer = "";
        if (value.length > ctx.maxStringLength) {
            const remaining = value.length - ctx.maxStringLength;
            value = value.slice(0, ctx.maxStringLength);
            trailer = `... ${remaining} more character${remaining > 1 ? "s" : ""}`;
        }
        if (
            ctx.compact !== true &&
            // TODO(BridgeAR): Add unicode support. Use the readline getStringWidth
            // function.
            value.length > kMinLineLength &&
            value.length > ctx.breakLength - ctx.indentationLvl - 4
        ) {
            return (
                value
                    .split(/(?<=\n)/)
                    .map((line) => fn(strEscape(line), "string"))
                    .join(` +\n${" ".repeat(ctx.indentationLvl + 2)}`) + trailer
            );
        }
        return fn(strEscape(value), "string") + trailer;
    }
    if (typeof value === "number") return formatNumber(fn, value, ctx.numericSeparator);
    if (typeof value === "bigint") return formatBigInt(fn, value, ctx.numericSeparator);
    if (typeof value === "boolean") return fn(`${value}`, "boolean");
    if (typeof value === "undefined") return fn("undefined", "undefined");
    // es6 symbol primitive
    return fn(SymbolPrototypeToString(value), "symbol");
}

function formatNamespaceObject(keys, ctx, value, recurseTimes) {
    const output = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
        try {
            output[i] = formatProperty(ctx, value, recurseTimes, keys[i], kObjectType);
        } catch (err) {
            assert(isNativeError(err) && err.name === "ReferenceError");
            // Use the existing functionality. This makes sure the indentation and
            // line breaks are always correct. Otherwise it is very difficult to keep
            // this aligned, even though this is a hacky way of dealing with this.
            const tmp = { [keys[i]]: "" };
            output[i] = formatProperty(ctx, tmp, recurseTimes, keys[i], kObjectType);
            const pos = output[i].lastIndexOf(" ");
            // We have to find the last whitespace and have to replace that value as
            // it will be visualized as a regular string.
            output[i] = output[i].slice(0, pos + 1) + ctx.stylize("<uninitialized>", "special");
        }
    }
    // Reset the keys to an empty array. This prevents duplicated inspection.
    keys.length = 0;
    return output;
}

// The array is sparse and/or has extra keys
function formatSpecialArray(ctx, value, recurseTimes, maxLength, output, i) {
    const keys = ObjectKeys(value);
    let index = i;
    for (; i < keys.length && output.length < maxLength; i++) {
        const key = keys[i];
        const tmp = +key;
        // Arrays can only have up to 2^32 - 1 entries
        if (tmp > 2 ** 32 - 2) {
            break;
        }
        if (`${index}` !== key) {
            if (!numberRegExp.test(key)) {
                break;
            }
            const emptyItems = tmp - index;
            const ending = emptyItems > 1 ? "s" : "";
            const message = `<${emptyItems} empty item${ending}>`;
            output.push(ctx.stylize(message, "undefined"));
            index = tmp;
            if (output.length === maxLength) {
                break;
            }
        }
        output.push(formatProperty(ctx, value, recurseTimes, key, kArrayType));
        index++;
    }
    const remaining = value.length - index;
    if (output.length !== maxLength) {
        if (remaining > 0) {
            const ending = remaining > 1 ? "s" : "";
            const message = `<${remaining} empty item${ending}>`;
            output.push(ctx.stylize(message, "undefined"));
        }
    } else if (remaining > 0) {
        output.push(`... ${remaining} more item${remaining > 1 ? "s" : ""}`);
    }
    return output;
}

function formatArrayBuffer(ctx, value) {
    let buffer;
    try {
        buffer = new Uint8Array(value);
    } catch {
        return [ctx.stylize("(detached)", "special")];
    }
    if (hexSlice === undefined)
        hexSlice = function buf2hex(buffer) {
            // buffer is an ArrayBuffer
            return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
        };

    let str = StringPrototypeTrim(
        RegExpPrototypeSymbolReplace(/(.{2})/g, hexSlice(buffer, 0, MathMin(ctx.maxArrayLength, buffer.length)), "$1 ")
    );
    const remaining = buffer.length - ctx.maxArrayLength;
    if (remaining > 0) str += ` ... ${remaining} more byte${remaining > 1 ? "s" : ""}`;
    return [`${ctx.stylize("[Uint8Contents]", "special")}: <${str}>`];
}

function formatArray(ctx, value, recurseTimes) {
    const valLen = value.length;
    const len = MathMin(MathMax(0, ctx.maxArrayLength), valLen);

    const remaining = valLen - len;
    const output = [];
    for (let i = 0; i < len; i++) {
        // Special handle sparse arrays.
        if (!ObjectPrototypeHasOwnProperty(value, i)) {
            return formatSpecialArray(ctx, value, recurseTimes, len, output, i);
        }
        output.push(formatProperty(ctx, value, recurseTimes, i, kArrayType));
    }
    if (remaining > 0) output.push(`... ${remaining} more item${remaining > 1 ? "s" : ""}`);
    return output;
}

function formatTypedArray(value, length, ctx, ignored, recurseTimes) {
    const maxLength = MathMin(MathMax(0, ctx.maxArrayLength), length);
    const remaining = value.length - maxLength;
    const output = new Array(maxLength);
    const elementFormatter = value.length > 0 && typeof value[0] === "number" ? formatNumber : formatBigInt;
    for (let i = 0; i < maxLength; ++i) {
        output[i] = elementFormatter(ctx.stylize, value[i], ctx.numericSeparator);
    }
    if (remaining > 0) {
        output[maxLength] = `... ${remaining} more item${remaining > 1 ? "s" : ""}`;
    }
    if (ctx.showHidden) {
        // .buffer goes last, it's not a primitive like the others.
        // All besides `BYTES_PER_ELEMENT` are actually getters.
        ctx.indentationLvl += 2;
        for (const key of ["BYTES_PER_ELEMENT", "length", "byteLength", "byteOffset", "buffer"]) {
            const str = formatValue(ctx, value[key], recurseTimes, true);
            ArrayPrototypePush(output, `[${key}]: ${str}`);
        }
        ctx.indentationLvl -= 2;
    }
    return output;
}

function formatSet(value, ctx, ignored, recurseTimes) {
    const output = [];
    ctx.indentationLvl += 2;
    for (const v of value) {
        ArrayPrototypePush(output, formatValue(ctx, v, recurseTimes));
    }
    ctx.indentationLvl -= 2;
    return output;
}

function formatMap(value, ctx, ignored, recurseTimes) {
    const output = [];
    ctx.indentationLvl += 2;
    for (const { 0: k, 1: v } of value) {
        output.push(`${formatValue(ctx, k, recurseTimes)} => ${formatValue(ctx, v, recurseTimes)}`);
    }
    ctx.indentationLvl -= 2;
    return output;
}

function formatSetIterInner(ctx, recurseTimes, entries, state) {
    const maxArrayLength = MathMax(ctx.maxArrayLength, 0);
    const maxLength = MathMin(maxArrayLength, entries.length);
    const output = new Array(maxLength);
    ctx.indentationLvl += 2;
    for (let i = 0; i < maxLength; i++) {
        output[i] = formatValue(ctx, entries[i], recurseTimes);
    }
    ctx.indentationLvl -= 2;
    if (state === kWeak && !ctx.sorted) {
        // Sort all entries to have a halfway reliable output (if more entries than
        // retrieved ones exist, we can not reliably return the same output) if the
        // output is not sorted anyway.
        ArrayPrototypeSort(output);
    }
    const remaining = entries.length - maxLength;
    if (remaining > 0) {
        ArrayPrototypePush(output, `... ${remaining} more item${remaining > 1 ? "s" : ""}`);
    }
    return output;
}

function formatMapIterInner(ctx, recurseTimes, entries, state) {
    const maxArrayLength = MathMax(ctx.maxArrayLength, 0);
    // Entries exist as [key1, val1, key2, val2, ...]
    const len = entries.length / 2;
    const remaining = len - maxArrayLength;
    const maxLength = MathMin(maxArrayLength, len);
    let output = new Array(maxLength);
    let i = 0;
    ctx.indentationLvl += 2;
    if (state === kWeak) {
        for (; i < maxLength; i++) {
            const pos = i * 2;
            output[i] = `${formatValue(ctx, entries[pos], recurseTimes)} => ${formatValue(
                ctx,
                entries[pos + 1],
                recurseTimes
            )}`;
        }
        // Sort all entries to have a halfway reliable output (if more entries than
        // retrieved ones exist, we can not reliably return the same output) if the
        // output is not sorted anyway.
        if (!ctx.sorted) output = output.sort();
    } else {
        for (; i < maxLength; i++) {
            const pos = i * 2;
            const res = [
                formatValue(ctx, entries[pos], recurseTimes),
                formatValue(ctx, entries[pos + 1], recurseTimes),
            ];
            output[i] = reduceToSingleString(ctx, res, "", ["[", "]"], kArrayExtrasType, recurseTimes);
        }
    }
    ctx.indentationLvl -= 2;
    if (remaining > 0) {
        output.push(`... ${remaining} more item${remaining > 1 ? "s" : ""}`);
    }
    return output;
}

function formatWeakCollection(ctx) {
    return [ctx.stylize("<items unknown>", "special")];
}

function formatWeakSet(ctx, value, recurseTimes) {
    const entries = previewEntries(value);
    return formatSetIterInner(ctx, recurseTimes, entries, kWeak);
}

function formatWeakMap(ctx, value, recurseTimes) {
    const entries = previewEntries(value);
    return formatMapIterInner(ctx, recurseTimes, entries, kWeak);
}

function formatIterator(braces, ctx, value, recurseTimes) {
    const { 0: entries, 1: isKeyValue } = previewEntries(value, true);
    if (isKeyValue) {
        // Mark entry iterators as such.
        braces[0] = braces[0].replace(/ Iterator] {$/, " Entries] {");
        return formatMapIterInner(ctx, recurseTimes, entries, kMapEntries);
    }

    return formatSetIterInner(ctx, recurseTimes, entries, kIterator);
}

function formatPromise(ctx, value, recurseTimes) {
    return [""];
}

function formatProperty(ctx, value, recurseTimes, key, type, desc, original = value) {
    let name, str;
    let extra = " ";
    desc = desc ||
        ObjectGetOwnPropertyDescriptor(value, key) || {
            value: value[key],
            enumerable: true,
        };
    if (desc.value !== undefined) {
        const diff = ctx.compact !== true || type !== kObjectType ? 2 : 3;
        ctx.indentationLvl += diff;
        str = formatValue(ctx, desc.value, recurseTimes);
        if (diff === 3 && ctx.breakLength < getStringWidth(str, ctx.colors)) {
            extra = `\n${" ".repeat(ctx.indentationLvl)}`;
        }
        ctx.indentationLvl -= diff;
    } else if (desc.get !== undefined) {
        const label = desc.set !== undefined ? "Getter/Setter" : "Getter";
        const s = ctx.stylize;
        const sp = "special";
        if (
            ctx.getters &&
            (ctx.getters === true ||
                (ctx.getters === "get" && desc.set === undefined) ||
                (ctx.getters === "set" && desc.set !== undefined))
        ) {
            try {
                const tmp = FunctionPrototypeCall(desc.get, original);
                ctx.indentationLvl += 2;
                if (tmp === null) {
                    str = `${s(`[${label}:`, sp)} ${s("null", "null")}${s("]", sp)}`;
                } else if (typeof tmp === "object") {
                    str = `${s(`[${label}]`, sp)} ${formatValue(ctx, tmp, recurseTimes)}`;
                } else {
                    const primitive = formatPrimitive(s, tmp, ctx);
                    str = `${s(`[${label}:`, sp)} ${primitive}${s("]", sp)}`;
                }
                ctx.indentationLvl -= 2;
            } catch (err) {
                const message = `<Inspection threw (${err.message})>`;
                str = `${s(`[${label}:`, sp)} ${message}${s("]", sp)}`;
            }
        } else {
            str = ctx.stylize(`[${label}]`, sp);
        }
    } else if (desc.set !== undefined) {
        str = ctx.stylize("[Setter]", "special");
    } else {
        str = ctx.stylize("undefined", "undefined");
    }
    if (type === kArrayType) {
        return str;
    }
    if (typeof key === "symbol") {
        const tmp = RegExpPrototypeSymbolReplace(strEscapeSequencesReplacer, SymbolPrototypeToString(key), escapeFn);
        name = `[${ctx.stylize(tmp, "symbol")}]`;
    } else if (key === "__proto__") {
        name = "['__proto__']";
    } else if (desc.enumerable === false) {
        const tmp = RegExpPrototypeSymbolReplace(strEscapeSequencesReplacer, key, escapeFn);
        name = `[${tmp}]`;
    } else if (RegExpPrototypeExec(keyStrRegExp, key) !== null) {
        name = ctx.stylize(key, "name");
    } else {
        name = ctx.stylize(strEscape(key), "string");
    }
    return `${name}:${extra}${str}`;
}

function isBelowBreakLength(ctx, output, start, base) {
    // Each entry is separated by at least a comma. Thus, we start with a total
    // length of at least `output.length`. In addition, some cases have a
    // whitespace in-between each other that is added to the total as well.
    // TODO(BridgeAR): Add unicode support. Use the readline getStringWidth
    // function. Check the performance overhead and make it an opt-in in case it's
    // significant.
    let totalLength = output.length + start;
    if (totalLength + output.length > ctx.breakLength) return false;
    for (let i = 0; i < output.length; i++) {
        if (ctx.colors) {
            totalLength += removeColors(output[i]).length;
        } else {
            totalLength += output[i].length;
        }
        if (totalLength > ctx.breakLength) {
            return false;
        }
    }
    // Do not line up properties on the same line if `base` contains line breaks.
    return base === "" || !StringPrototypeIncludes(base, "\n");
}

function reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value) {
    if (ctx.compact !== true) {
        if (typeof ctx.compact === "number" && ctx.compact >= 1) {
            // Memorize the original output length. In case the output is grouped,
            // prevent lining up the entries on a single line.
            const entries = output.length;
            // Group array elements together if the array contains at least six
            // separate entries.
            if (extrasType === kArrayExtrasType && entries > 6) {
                output = groupArrayElements(ctx, output, value);
            }
            // `ctx.currentDepth` is set to the most inner depth of the currently
            // inspected object part while `recurseTimes` is the actual current depth
            // that is inspected.
            //
            // Example:
            //
            // const a = { first: [ 1, 2, 3 ], second: { inner: [ 1, 2, 3 ] } }
            //
            // The deepest depth of `a` is 2 (a.second.inner) and `a.first` has a max
            // depth of 1.
            //
            // Consolidate all entries of the local most inner depth up to
            // `ctx.compact`, as long as the properties are smaller than
            // `ctx.breakLength`.
            if (ctx.currentDepth - recurseTimes < ctx.compact && entries === output.length) {
                // Line up all entries on a single line in case the entries do not
                // exceed `breakLength`. Add 10 as constant to start next to all other
                // factors that may reduce `breakLength`.
                const start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
                if (isBelowBreakLength(ctx, output, start, base)) {
                    const joinedOutput = join(output, ", ");
                    if (!joinedOutput.includes("\n")) {
                        return `${base ? `${base} ` : ""}${braces[0]} ${joinedOutput}` + ` ${braces[1]}`;
                    }
                }
            }
        }
        // Line up each entry on an individual line.
        const indentation = `\n${StringPrototypeRepeat(" ", ctx.indentationLvl)}`;
        return (
            `${base ? `${base} ` : ""}${braces[0]}${indentation}  ` +
            `${join(output, `,${indentation}  `)}${indentation}${braces[1]}`
        );
    }
    // Line up all entries on a single line in case the entries do not exceed
    // `breakLength`.
    if (isBelowBreakLength(ctx, output, 0, base)) {
        return `${braces[0]}${base ? ` ${base}` : ""} ${join(output, ", ")} ` + braces[1];
    }
    const indentation = StringPrototypeRepeat(" ", ctx.indentationLvl);
    // If the opening "brace" is too large, like in the case of "Set {",
    // we need to force the first item to be on the next line or the
    // items will not line up correctly.
    const ln = base === "" && braces[0].length === 1 ? " " : `${base ? ` ${base}` : ""}\n${indentation}  `;
    // Line up each entry on an individual line.
    return `${braces[0]}${ln}${join(output, `,\n${indentation}  `)} ${braces[1]}`;
}

function hasBuiltInToString(value) {
    // Prevent triggering proxy traps.
    const getFullProxy = false;
    const proxyTarget = getProxyDetails(value, getFullProxy);
    if (proxyTarget !== undefined) {
        if (proxyTarget === null) {
            return true;
        }
        value = proxyTarget;
    }

    // Count objects that have no `toString` function as built-in.
    if (typeof value.toString !== "function") {
        return true;
    }

    // The object has a own `toString` property. Thus it's not not a built-in one.
    if (ObjectPrototypeHasOwnProperty(value, "toString")) {
        return false;
    }

    // Find the object that has the `toString` property as own property in the
    // prototype chain.
    let pointer = value;
    do {
        pointer = ObjectGetPrototypeOf(pointer);
    } while (!ObjectPrototypeHasOwnProperty(pointer, "toString"));

    // Check closer if the object is a built-in.
    const descriptor = ObjectGetOwnPropertyDescriptor(pointer, "constructor");
    return (
        descriptor !== undefined && typeof descriptor.value === "function" && builtInObjects.has(descriptor.value.name)
    );
}

const firstErrorLine = (error) => StringPrototypeSplit(error.message, "\n", 1)[0];
let CIRCULAR_ERROR_MESSAGE;
function tryStringify(arg) {
    try {
        return JSONStringify(arg);
    } catch (err) {
        // Populate the circular error message lazily
        if (!CIRCULAR_ERROR_MESSAGE) {
            try {
                const a = {};
                a.a = a;
                JSONStringify(a);
            } catch (circularError) {
                CIRCULAR_ERROR_MESSAGE = firstErrorLine(circularError);
            }
        }
        if (err.name === "TypeError" && firstErrorLine(err) === CIRCULAR_ERROR_MESSAGE) {
            return "[Circular]";
        }
        throw err;
    }
}

function format(...args) {
    return formatWithOptionsInternal(undefined, args);
}

function formatWithOptions(inspectOptions, ...args) {
    if (typeof inspectOptions !== "object" || inspectOptions === null) {
        throw new Error("invalid arg type inspectOptions", "object", inspectOptions);
    }
    return formatWithOptionsInternal(inspectOptions, args);
}

function formatNumberNoColor(number, options) {
    return formatNumber(stylizeNoColor, number, options?.numericSeparator ?? inspectDefaultOptions.numericSeparator);
}

function formatBigIntNoColor(bigint, options) {
    return formatBigInt(stylizeNoColor, bigint, options?.numericSeparator ?? inspectDefaultOptions.numericSeparator);
}

function formatWithOptionsInternal(inspectOptions, args) {
    const first = args[0];
    let a = 0;
    let str = "";
    let join = "";

    if (typeof first === "string") {
        if (args.length === 1) {
            return first;
        }
        let tempStr;
        let lastPos = 0;

        for (let i = 0; i < first.length - 1; i++) {
            if (StringPrototypeCharCodeAt(first, i) === 37) {
                // '%'
                const nextChar = StringPrototypeCharCodeAt(first, ++i);
                if (a + 1 !== args.length) {
                    switch (nextChar) {
                        case 115: {
                            // 's'
                            const tempArg = args[++a];
                            if (typeof tempArg === "number") {
                                tempStr = formatNumberNoColor(tempArg, inspectOptions);
                            } else if (typeof tempArg === "bigint") {
                                tempStr = formatBigIntNoColor(tempArg, inspectOptions);
                            } else if (
                                typeof tempArg !== "object" ||
                                tempArg === null ||
                                !hasBuiltInToString(tempArg)
                            ) {
                                tempStr = String(tempArg);
                            } else {
                                tempStr = inspect(tempArg, {
                                    ...inspectOptions,
                                    compact: 3,
                                    colors: false,
                                    depth: 0,
                                });
                            }
                            break;
                        }
                        case 106: // 'j'
                            tempStr = tryStringify(args[++a]);
                            break;
                        case 100: {
                            // 'd'
                            const tempNum = args[++a];
                            if (typeof tempNum === "bigint") {
                                tempStr = formatBigIntNoColor(tempNum, inspectOptions);
                            } else if (typeof tempNum === "symbol") {
                                tempStr = "NaN";
                            } else {
                                tempStr = formatNumberNoColor(Number(tempNum), inspectOptions);
                            }
                            break;
                        }
                        case 79: // 'O'
                            tempStr = inspect(args[++a], inspectOptions);
                            break;
                        case 111: // 'o'
                            tempStr = inspect(args[++a], {
                                ...inspectOptions,
                                showHidden: true,
                                showProxy: true,
                                depth: 4,
                            });
                            break;
                        case 105: {
                            // 'i'
                            const tempInteger = args[++a];
                            if (typeof tempInteger === "bigint") {
                                tempStr = formatBigIntNoColor(tempInteger, inspectOptions);
                            } else if (typeof tempInteger === "symbol") {
                                tempStr = "NaN";
                            } else {
                                tempStr = formatNumberNoColor(NumberParseInt(tempInteger), inspectOptions);
                            }
                            break;
                        }
                        case 102: {
                            // 'f'
                            const tempFloat = args[++a];
                            if (typeof tempFloat === "symbol") {
                                tempStr = "NaN";
                            } else {
                                tempStr = formatNumberNoColor(NumberParseFloat(tempFloat), inspectOptions);
                            }
                            break;
                        }
                        case 99: // 'c'
                            a += 1;
                            tempStr = "";
                            break;
                        case 37: // '%'
                            str += StringPrototypeSlice(first, lastPos, i);
                            lastPos = i + 1;
                            continue;
                        default: // Any other character is not a correct placeholder
                            continue;
                    }
                    if (lastPos !== i - 1) {
                        str += StringPrototypeSlice(first, lastPos, i - 1);
                    }
                    str += tempStr;
                    lastPos = i + 1;
                } else if (nextChar === 37) {
                    str += StringPrototypeSlice(first, lastPos, i);
                    lastPos = i + 1;
                }
            }
        }
        if (lastPos !== 0) {
            a++;
            join = " ";
            if (lastPos < first.length) {
                str += StringPrototypeSlice(first, lastPos);
            }
        }
    }

    while (a < args.length) {
        const value = args[a];
        str += join;
        str += typeof value !== "string" ? inspect(value, inspectOptions) : value;
        join = " ";
        a++;
    }
    return str;
}

/**
 * Returns the number of columns required to display the given string.
 */
getStringWidth = function getStringWidth(str, removeControlChars = true) {
    let width = 0;

    if (removeControlChars) str = stripVTControlCharacters(str);
    str = StringPrototypeNormalize(str, "NFC");
    for (const char of new SafeStringIterator(str)) {
        const code = StringPrototypeCodePointAt(char, 0);
        if (isFullWidthCodePoint(code)) {
            width += 2;
        } else if (!isZeroWidthCodePoint(code)) {
            width++;
        }
    }

    return width;
};

/**
 * Returns true if the character represented by a given
 * Unicode code point is full-width. Otherwise returns false.
 */
const isFullWidthCodePoint = (code) => {
    // Code points are partially derived from:
    // https://www.unicode.org/Public/UNIDATA/EastAsianWidth.txt
    return (
        code >= 0x1100 &&
        (code <= 0x115f || // Hangul Jamo
            code === 0x2329 || // LEFT-POINTING ANGLE BRACKET
            code === 0x232a || // RIGHT-POINTING ANGLE BRACKET
            // CJK Radicals Supplement .. Enclosed CJK Letters and Months
            (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) ||
            // Enclosed CJK Letters and Months .. CJK Unified Ideographs Extension A
            (code >= 0x3250 && code <= 0x4dbf) ||
            // CJK Unified Ideographs .. Yi Radicals
            (code >= 0x4e00 && code <= 0xa4c6) ||
            // Hangul Jamo Extended-A
            (code >= 0xa960 && code <= 0xa97c) ||
            // Hangul Syllables
            (code >= 0xac00 && code <= 0xd7a3) ||
            // CJK Compatibility Ideographs
            (code >= 0xf900 && code <= 0xfaff) ||
            // Vertical Forms
            (code >= 0xfe10 && code <= 0xfe19) ||
            // CJK Compatibility Forms .. Small Form Variants
            (code >= 0xfe30 && code <= 0xfe6b) ||
            // Halfwidth and Fullwidth Forms
            (code >= 0xff01 && code <= 0xff60) ||
            (code >= 0xffe0 && code <= 0xffe6) ||
            // Kana Supplement
            (code >= 0x1b000 && code <= 0x1b001) ||
            // Enclosed Ideographic Supplement
            (code >= 0x1f200 && code <= 0x1f251) ||
            // Miscellaneous Symbols and Pictographs 0x1f300 - 0x1f5ff
            // Emoticons 0x1f600 - 0x1f64f
            (code >= 0x1f300 && code <= 0x1f64f) ||
            // CJK Unified Ideographs Extension B .. Tertiary Ideographic Plane
            (code >= 0x20000 && code <= 0x3fffd))
    );
};

const isZeroWidthCodePoint = (code) => {
    return (
        code <= 0x1f || // C0 control codes
        (code >= 0x7f && code <= 0x9f) || // C1 control codes
        (code >= 0x300 && code <= 0x36f) || // Combining Diacritical Marks
        (code >= 0x200b && code <= 0x200f) || // Modifying Invisible Characters
        // Combining Diacritical Marks for Symbols
        (code >= 0x20d0 && code <= 0x20ff) ||
        (code >= 0xfe00 && code <= 0xfe0f) || // Variation Selectors
        (code >= 0xfe20 && code <= 0xfe2f) || // Combining Half Marks
        (code >= 0xe0100 && code <= 0xe01ef)
    ); // Variation Selectors
};

/**
 * Remove all VT control characters. Use to estimate displayed string width.
 */
function stripVTControlCharacters(str) {
    validateString(str, "str");

    return str.replace(ansi, "");
}

/// *** ^^^ Above is just the NodeJS inspect stuff ^^^

// Call the function once so the compiler optimizes the function calls,
// to make subsequent calls faster
inspect({});

const inspectMultiple = (options, ...args) => {
    let str = "";
    let argsLength = args.length;
    for (let i = 0; i < argsLength; i++) {
        if (typeof args[i] === "string") str += args[i];
        else str += inspect(args[i], options);
        if (i < argsLength - 1) {
            str += " ";
        }
    }
    return str;
};
cppBindings.registerExport("logging:inspectMultiple", inspectMultiple);

/** @type {Map<string, number>} */
const timeLabelMap = new Map();
function time(label) {
    if (timeLabelMap.has(label ?? "Timer")) throw new Error(`Label '${label ?? "Timer"}' already running`);
    timeLabelMap.set(label ?? "Timer", Date.now());
}
function timeLog(label) {
    const start = timeLabelMap.get(label ?? "Timer");
    if (start === undefined) throw new Error(`No such label '${label ?? "Timer"}' running`);
    const duration = Date.now() - start;
    alt.log(`[JS] ${label ?? "Timer"}: ${duration}ms`);
}
function timeEnd(label) {
    const start = timeLabelMap.get(label ?? "Timer");
    if (start === undefined) throw new Error(`No such label '${label ?? "Timer"}' running`);
    const duration = Date.now() - start;
    alt.log(`[JS] ${label ?? "Timer"}: ${duration}ms`);
    timeLabelMap.delete(label ?? "Timer");
}

if (!globalThis.console) globalThis.console = {};
globalThis.console.log = alt.log;
globalThis.console.warn = alt.logWarning;
globalThis.console.error = alt.logError;
globalThis.console.time = time;
globalThis.console.timeLog = timeLog;
globalThis.console.timeEnd = timeEnd;
