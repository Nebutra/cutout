import { createRequire } from "node:module";
import process$1 from "node:process";
import { constants, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a$1;
function $constructor(name, initializer, params) {
	function init(inst, def) {
		if (!inst._zod) Object.defineProperty(inst, "_zod", {
			value: {
				def,
				constr: _,
				traits: /* @__PURE__ */ new Set()
			},
			enumerable: false
		});
		if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		const proto = _.prototype;
		const keys = Object.keys(proto);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		var _a;
		const inst = params?.Parent ? new Definition() : this;
		init(inst, def);
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		for (const fn of inst._zod.deferred) fn();
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var $ZodEncodeError = class extends Error {
	constructor(name) {
		super(`Encountered unidirectional transform during encode: ${name}`);
		this.name = "ZodEncodeError";
	}
};
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
function cached(getter) {
	return { get value() {
		{
			const value = getter();
			Object.defineProperty(this, "value", { value });
			return value;
		}
		throw new Error("cached value already set");
	} };
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
	const ratio = val / step;
	const roundedRatio = Math.round(ratio);
	const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
	if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
	return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__*/ Symbol("evaluating");
function defineLazy(object, key, getter) {
	let value = void 0;
	Object.defineProperty(object, key, {
		get() {
			if (value === EVALUATING) return;
			if (value === void 0) {
				value = EVALUATING;
				value = getter();
			}
			return value;
		},
		set(v) {
			Object.defineProperty(object, key, { value: v });
		},
		configurable: true
	});
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
function mergeDefs(...defs) {
	const mergedDescriptors = {};
	for (const def of defs) {
		const descriptors = Object.getOwnPropertyDescriptors(def);
		Object.assign(mergedDescriptors, descriptors);
	}
	return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
	return JSON.stringify(str);
}
function slugify(input) {
	return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__*/ cached(() => {
	if (globalConfig.jitless) return false;
	if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
	try {
		new Function("");
		return true;
	} catch (_) {
		return false;
	}
});
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	if (typeof ctor !== "function") return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
function shallowClone(o) {
	if (isPlainObject(o)) return { ...o };
	if (Array.isArray(o)) return [...o];
	if (o instanceof Map) return new Map(o);
	if (o instanceof Set) return new Set(o);
	return o;
}
var propertyKeyTypes = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone$1(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
	});
}
var NUMBER_FORMAT_RANGES = {
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
	return clone$1(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const newShape = {};
			for (const key in mask) {
				if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				newShape[key] = currDef.shape[key];
			}
			assignProp(this, "shape", newShape);
			return newShape;
		},
		checks: []
	}));
}
function omit(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
	return clone$1(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const newShape = { ...schema._zod.def.shape };
			for (const key in mask) {
				if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				delete newShape[key];
			}
			assignProp(this, "shape", newShape);
			return newShape;
		},
		checks: []
	}));
}
function extend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) {
		const existingShape = schema._zod.def.shape;
		for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return clone$1(schema, mergeDefs(schema._zod.def, { get shape() {
		const _shape = {
			...schema._zod.def.shape,
			...shape
		};
		assignProp(this, "shape", _shape);
		return _shape;
	} }));
}
function safeExtend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
	return clone$1(schema, mergeDefs(schema._zod.def, { get shape() {
		const _shape = {
			...schema._zod.def.shape,
			...shape
		};
		assignProp(this, "shape", _shape);
		return _shape;
	} }));
}
function merge(a, b) {
	if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	return clone$1(a, mergeDefs(a._zod.def, {
		get shape() {
			const _shape = {
				...a._zod.def.shape,
				...b._zod.def.shape
			};
			assignProp(this, "shape", _shape);
			return _shape;
		},
		get catchall() {
			return b._zod.def.catchall;
		},
		checks: b._zod.def.checks ?? []
	}));
}
function partial(Class, schema, mask) {
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
	return clone$1(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const oldShape = schema._zod.def.shape;
			const shape = { ...oldShape };
			if (mask) for (const key in mask) {
				if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				shape[key] = Class ? new Class({
					type: "optional",
					innerType: oldShape[key]
				}) : oldShape[key];
			}
			else for (const key in oldShape) shape[key] = Class ? new Class({
				type: "optional",
				innerType: oldShape[key]
			}) : oldShape[key];
			assignProp(this, "shape", shape);
			return shape;
		},
		checks: []
	}));
}
function required(Class, schema, mask) {
	return clone$1(schema, mergeDefs(schema._zod.def, { get shape() {
		const oldShape = schema._zod.def.shape;
		const shape = { ...oldShape };
		if (mask) for (const key in mask) {
			if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
			if (!mask[key]) continue;
			shape[key] = new Class({
				type: "nonoptional",
				innerType: oldShape[key]
			});
		}
		else for (const key in oldShape) shape[key] = new Class({
			type: "nonoptional",
			innerType: oldShape[key]
		});
		assignProp(this, "shape", shape);
		return shape;
	} }));
}
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
	rest.path ?? (rest.path = []);
	rest.message = message;
	if (ctx?.reportInput) rest.input = _input;
	return rest;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
var initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	Object.defineProperty(inst, "_zod", {
		value: inst._zod,
		enumerable: false
	});
	Object.defineProperty(inst, "issues", {
		value: def,
		enumerable: false
	});
	inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
	Object.defineProperty(inst, "toString", {
		value: () => inst.message,
		enumerable: false
	});
};
var $ZodError = $constructor("$ZodError", initializer$1);
var $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) {
		fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
		fieldErrors[sub.path[0]].push(mapper(sub));
	} else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, mapper = (issue) => issue.message) {
	const fieldErrors = { _errors: [] };
	const processError = (error, path = []) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else {
			const fullpath = [...path, ...issue.path];
			if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < fullpath.length) {
					const el = fullpath[i];
					if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
					else {
						curr[el] = curr[el] || { _errors: [] };
						curr[el]._errors.push(mapper(issue));
					}
					curr = curr[el];
					i++;
				}
			}
		}
	};
	processError(error);
	return fieldErrors;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	if (result.issues.length) {
		const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, _params?.callee);
		throw e;
	}
	return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	if (result.issues.length) {
		const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, params?.callee);
		throw e;
	}
	return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? {
		success: false,
		error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
var safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? {
		success: false,
		error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
var safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _parse(_Err)(schema, value, ctx);
};
var _decode = (_Err) => (schema, value, _ctx) => {
	return _parse(_Err)(schema, value, _ctx);
};
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _parseAsync(_Err)(schema, value, ctx);
};
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _parseAsync(_Err)(schema, value, _ctx);
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
	return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _safeParseAsync(_Err)(schema, value, _ctx);
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
var duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
var uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time$1(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime$1(args) {
	const time = timeSource({ precision: args.precision });
	const opts = ["Z"];
	if (args.local) opts.push("");
	if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
	const timeRegex = `${time}(?:${opts.join("|")})`;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string$1 = (params) => {
	const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
	return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number$1 = /^-?\d+(?:\.\d+)?$/;
var boolean$1 = /^(?:true|false)$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
var $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
		if (def.value < curr) if (def.inclusive) bag.maximum = def.value;
		else bag.exclusiveMaximum = def.value;
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
		if (def.value > curr) if (def.inclusive) bag.minimum = def.value;
		else bag.exclusiveMinimum = def.value;
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		var _a;
		(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
	});
	inst._zod.check = (payload) => {
		if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
		if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
		payload.issues.push({
			origin: typeof payload.value,
			code: "not_multiple_of",
			divisor: def.value,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		bag.minimum = minimum;
		bag.maximum = maximum;
		if (isInt) bag.pattern = integer;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					continue: false,
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
		if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
		if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.minimum = def.length;
		bag.maximum = def.length;
		bag.length = def.length;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const length = input.length;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		if (def.pattern) {
			bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
			bag.patterns.add(def.pattern);
		}
	});
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
	def.pattern = pattern;
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
var Doc = class {
	constructor(args = []) {
		this.content = [];
		this.indent = 0;
		if (this) this.args = args;
	}
	indented(fn) {
		this.indent += 1;
		fn(this);
		this.indent -= 1;
	}
	write(arg) {
		if (typeof arg === "function") {
			arg(this, { execution: "sync" });
			arg(this, { execution: "async" });
			return;
		}
		const lines = arg.split("\n").filter((x) => x);
		const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
		const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
		for (const line of dedented) this.content.push(line);
	}
	compile() {
		const F = Function;
		const args = this?.args;
		const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
		return new F(...args, lines.join("\n"));
	}
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
var version = {
	major: 4,
	minor: 4,
	patch: 3
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const checks = [...inst._zod.def.checks ?? []];
	if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
	defineLazy(inst, "~standard", () => ({
		validate: (value) => {
			try {
				const r = safeParse$1(inst, value);
				return r.success ? { value: r.data } : { issues: r.error?.issues };
			} catch (_) {
				return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
});
var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
var $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
var $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
var $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
var $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const trimmed = payload.value.trim();
			if (!def.normalize && def.protocol?.source === httpProtocol.source) {
				if (!/^https?:\/\//i.test(trimmed)) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid URL format",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
			}
			const url = new URL(trimmed);
			if (def.hostname) {
				def.hostname.lastIndex = 0;
				if (!def.hostname.test(url.hostname)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid hostname",
					pattern: def.hostname.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.protocol) {
				def.protocol.lastIndex = 0;
				if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid protocol",
					pattern: def.protocol.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.normalize) payload.value = url.href;
			else payload.value = trimmed;
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	def.pattern ?? (def.pattern = nanoid);
	$ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
var $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
var $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime$1(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date$1);
	$ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time$1(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration$1);
	$ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv6`;
	inst._zod.check = (payload) => {
		try {
			new URL(`http://[${payload.value}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		const parts = payload.value.split("/");
		try {
			if (parts.length !== 2) throw new Error();
			const [address, prefix] = parts;
			if (!prefix) throw new Error();
			const prefixNum = Number(prefix);
			if (`${prefixNum}` !== prefix) throw new Error();
			if (prefixNum < 0 || prefixNum > 128) throw new Error();
			new URL(`http://[${address}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (/\s/.test(data)) return false;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
var $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64";
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64URL(data) {
	if (!base64url.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
var $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64url);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64url";
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
var $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = Array(input.length);
		const proms = [];
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else handleArrayResult(result, payload, i);
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
	const isPresent = key in input;
	if (result.issues.length) {
		if (isOptionalIn && isOptionalOut && !isPresent) return;
		final.issues.push(...prefixIssues(key, result.issues));
	}
	if (!isPresent && !isOptionalIn) {
		if (!result.issues.length) final.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [key]
		});
		return;
	}
	if (result.value === void 0) {
		if (isPresent) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
function normalizeDef(def) {
	const keys = Object.keys(def.shape);
	for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
	const okeys = optionalKeys(def.shape);
	return {
		...def,
		keys,
		keySet: new Set(keys),
		numKeys: keys.length,
		optionalKeys: new Set(okeys)
	};
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
	const unrecognized = [];
	const keySet = def.keySet;
	const _catchall = def.catchall._zod;
	const t = _catchall.def.type;
	const isOptionalIn = _catchall.optin === "optional";
	const isOptionalOut = _catchall.optout === "optional";
	for (const key in input) {
		if (key === "__proto__") continue;
		if (keySet.has(key)) continue;
		if (t === "never") {
			unrecognized.push(key);
			continue;
		}
		const r = _catchall.run({
			value: input[key],
			issues: []
		}, ctx);
		if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
		else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
	}
	if (unrecognized.length) payload.issues.push({
		code: "unrecognized_keys",
		keys: unrecognized,
		input,
		inst
	});
	if (!proms.length) return payload;
	return Promise.all(proms).then(() => {
		return payload;
	});
}
var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
		const sh = def.shape;
		Object.defineProperty(def, "shape", { get: () => {
			const newSh = { ...sh };
			Object.defineProperty(def, "shape", { value: newSh });
			return newSh;
		} });
	}
	const _normalized = cached(() => normalizeDef(def));
	defineLazy(inst._zod, "propValues", () => {
		const shape = def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
			}
		}
		return propValues;
	});
	const isObject$2 = isObject;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$2(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = {};
		const proms = [];
		const shape = value.shape;
		for (const key of value.keys) {
			const el = shape[key];
			const isOptionalIn = el._zod.optin === "optional";
			const isOptionalOut = el._zod.optout === "optional";
			const r = el._zod.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
			else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
	};
});
var $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
	$ZodObject.init(inst, def);
	const superParse = inst._zod.parse;
	const _normalized = cached(() => normalizeDef(def));
	const generateFastpass = (shape) => {
		const doc = new Doc([
			"shape",
			"payload",
			"ctx"
		]);
		const normalized = _normalized.value;
		const parseStr = (key) => {
			const k = esc(key);
			return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
		};
		doc.write(`const input = payload.value;`);
		const ids = Object.create(null);
		let counter = 0;
		for (const key of normalized.keys) ids[key] = `key_${counter++}`;
		doc.write(`const newResult = {};`);
		for (const key of normalized.keys) {
			const id = ids[key];
			const k = esc(key);
			const schema = shape[key];
			const isOptionalIn = schema?._zod?.optin === "optional";
			const isOptionalOut = schema?._zod?.optout === "optional";
			doc.write(`const ${id} = ${parseStr(key)};`);
			if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }

        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
			else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
			else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }

        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
		}
		doc.write(`payload.value = newResult;`);
		doc.write(`return payload;`);
		const fn = doc.compile();
		return (payload, ctx) => fn(shape, payload, ctx);
	};
	let fastpass;
	const isObject$1 = isObject;
	const jit = !globalConfig.jitless;
	const fastEnabled = jit && allowsEval.value;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
			if (!fastpass) fastpass = generateFastpass(def.shape);
			payload = fastpass(payload, ctx);
			if (!catchall) return payload;
			return handleCatchall([], input, payload, ctx, value, inst);
		}
		return superParse(payload, ctx);
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	const nonaborted = results.filter((r) => !aborted(r));
	if (nonaborted.length === 1) {
		final.value = nonaborted[0].value;
		return nonaborted[0];
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
var $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "values", () => {
		if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazy(inst._zod, "pattern", () => {
		if (def.options.every((o) => o._zod.pattern)) {
			const patterns = def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	const first = def.options.length === 1 ? def.options[0]._zod.run : null;
	inst._zod.parse = (payload, ctx) => {
		if (first) return first(payload, ctx);
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
var $ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
	def.inclusive = false;
	$ZodUnion.init(inst, def);
	const _super = inst._zod.parse;
	defineLazy(inst._zod, "propValues", () => {
		const propValues = {};
		for (const option of def.options) {
			const pv = option._zod.propValues;
			if (!pv || Object.keys(pv).length === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
			for (const [k, v] of Object.entries(pv)) {
				if (!propValues[k]) propValues[k] = /* @__PURE__ */ new Set();
				for (const val of v) propValues[k].add(val);
			}
		}
		return propValues;
	});
	const disc = cached(() => {
		const opts = def.options;
		const map = /* @__PURE__ */ new Map();
		for (const o of opts) {
			const values = o._zod.propValues?.[def.discriminator];
			if (!values || values.size === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
			for (const v of values) {
				if (map.has(v)) throw new Error(`Duplicate discriminator value "${String(v)}"`);
				map.set(v, o);
			}
		}
		return map;
	});
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isObject(input)) {
			payload.issues.push({
				code: "invalid_type",
				expected: "object",
				input,
				inst
			});
			return payload;
		}
		const opt = disc.value.get(input?.[def.discriminator]);
		if (opt) return opt._zod.run(payload, ctx);
		if (def.unionFallback || ctx.direction === "backward") return _super(payload, ctx);
		payload.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: def.discriminator,
			options: Array.from(disc.value.keys()),
			input,
			path: [def.discriminator],
			inst
		});
		return payload;
	};
});
var $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	const unrecKeys = /* @__PURE__ */ new Map();
	let unrecIssue;
	for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
		unrecIssue ?? (unrecIssue = iss);
		for (const k of iss.keys) {
			if (!unrecKeys.has(k)) unrecKeys.set(k, {});
			unrecKeys.get(k).l = true;
		}
	} else result.issues.push(iss);
	for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
		if (!unrecKeys.has(k)) unrecKeys.set(k, {});
		unrecKeys.get(k).r = true;
	}
	else result.issues.push(iss);
	const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
	if (bothKeys.length && unrecIssue) result.issues.push({
		...unrecIssue,
		keys: bothKeys
	});
	if (aborted(result)) return result;
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	result.value = merged.data;
	return result;
}
var $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isPlainObject(input)) {
			payload.issues.push({
				expected: "record",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		const values = def.keyType._zod.values;
		if (values) {
			payload.value = {};
			const recordKeys = /* @__PURE__ */ new Set();
			for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
				recordKeys.add(typeof key === "number" ? key.toString() : key);
				const keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (keyResult.issues.length) {
					payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			let unrecognized;
			for (const key in input) if (!recordKeys.has(key)) {
				unrecognized = unrecognized ?? [];
				unrecognized.push(key);
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized
			});
		} else {
			payload.value = {};
			for (const key of Reflect.ownKeys(input)) {
				if (key === "__proto__") continue;
				if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
				let keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
					const retryResult = def.keyType._zod.run({
						value: Number(key),
						issues: []
					}, ctx);
					if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (retryResult.issues.length === 0) keyResult = retryResult;
				}
				if (keyResult.issues.length) {
					if (def.mode === "loose") payload.value[key] = input[key];
					else payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[keyResult.value] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[keyResult.value] = result.value;
				}
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
var $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	const valuesSet = new Set(values);
	inst._zod.values = valuesSet;
	inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (valuesSet.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
	$ZodType.init(inst, def);
	if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
	const values = new Set(def.values);
	inst._zod.values = values;
	inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values: def.values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		const _out = def.transform(payload.value, payload);
		if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			payload.fallback = true;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		payload.fallback = true;
		return payload;
	};
});
function handleOptionalResult(result, input) {
	if (input === void 0 && (result.issues.length || result.fallback)) return {
		issues: [],
		value: void 0
	};
	return result;
}
var $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.optout = "optional";
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
	});
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (def.innerType._zod.optin === "optional") {
			const input = payload.value;
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
			return handleOptionalResult(result, input);
		}
		if (payload.value === void 0) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
	inst._zod.parse = (payload, ctx) => {
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault returns the default value immediately in forward direction.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
var $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => {
		const v = def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
var $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => {
			payload.value = result.value;
			if (result.issues.length) {
				payload.value = def.catchValue({
					...payload,
					error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
					input: payload.value
				});
				payload.issues = [];
				payload.fallback = true;
			}
			return payload;
		});
		payload.value = result.value;
		if (result.issues.length) {
			payload.value = def.catchValue({
				...payload,
				error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
				input: payload.value
			});
			payload.issues = [];
			payload.fallback = true;
		}
		return payload;
	};
});
var $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => def.in._zod.values);
	defineLazy(inst._zod, "optin", () => def.in._zod.optin);
	defineLazy(inst._zod, "optout", () => def.out._zod.optout);
	defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") {
			const right = def.out._zod.run(payload, ctx);
			if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
			return handlePipeResult(right, def.in, ctx);
		}
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
		return handlePipeResult(left, def.out, ctx);
	};
});
function handlePipeResult(left, next, ctx) {
	if (left.issues.length) {
		left.aborted = true;
		return left;
	}
	return next._zod.run({
		value: left.value,
		issues: left.issues,
		fallback: left.fallback
	}, ctx);
}
var $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
	defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	payload.value = Object.freeze(payload.value);
	return payload;
}
var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var _a;
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			const f = {
				...pm,
				...this._map.get(schema)
			};
			return Object.keys(f).length ? f : void 0;
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry$1() {
	return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry$1());
var globalRegistry = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class({
		type: "string",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link _cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
	return new Class({
		type: "number",
		checks: [],
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
	return new Class({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
	return new $ZodCheckMultipleOf({
		check: "multiple_of",
		...normalizeParams(params),
		value
	});
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
	return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
	return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
	return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
	const ch = /* @__PURE__ */ _check((payload) => {
		payload.addIssue = (issue$2) => {
			if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
			else {
				const _issue = issue$2;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue(_issue));
			}
		};
		return fn(payload.value, payload);
	}, params);
	return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
	const ch = new $ZodCheck({
		check: "custom",
		...normalizeParams(params)
	});
	ch._zod.check = fn;
	return ch;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
	let target = params?.target ?? "draft-2020-12";
	if (target === "draft-4") target = "draft-04";
	if (target === "draft-7") target = "draft-07";
	return {
		processors: params.processors ?? {},
		metadataRegistry: params?.metadata ?? globalRegistry,
		target,
		unrepresentable: params?.unrepresentable ?? "throw",
		override: params?.override ?? (() => {}),
		io: params?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		cycles: params?.cycles ?? "ref",
		reused: params?.reused ?? "inline",
		external: params?.external ?? void 0
	};
}
function process$2(schema, ctx, _params = {
	path: [],
	schemaPath: []
}) {
	var _a;
	const def = schema._zod.def;
	const seen = ctx.seen.get(schema);
	if (seen) {
		seen.count++;
		if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
		return seen.schema;
	}
	const result = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: _params.path
	};
	ctx.seen.set(schema, result);
	const overrideSchema = schema._zod.toJSONSchema?.();
	if (overrideSchema) result.schema = overrideSchema;
	else {
		const params = {
			..._params,
			schemaPath: [..._params.schemaPath, schema],
			path: _params.path
		};
		if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
		else {
			const _json = result.schema;
			const processor = ctx.processors[def.type];
			if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
			processor(schema, ctx, _json, params);
		}
		const parent = schema._zod.parent;
		if (parent) {
			if (!result.ref) result.ref = parent;
			process$2(parent, ctx, params);
			ctx.seen.get(parent).isParent = true;
		}
	}
	const meta = ctx.metadataRegistry.get(schema);
	if (meta) Object.assign(result.schema, meta);
	if (ctx.io === "input" && isTransforming(schema)) {
		delete result.schema.examples;
		delete result.schema.default;
	}
	if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
	delete result.schema._prefault;
	return ctx.seen.get(schema).schema;
}
function extractDefs(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const idToSchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.entries()) {
		const id = ctx.metadataRegistry.get(entry[0])?.id;
		if (id) {
			const existing = idToSchema.get(id);
			if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			idToSchema.set(id, entry[0]);
		}
	}
	const makeURI = (entry) => {
		const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
		if (ctx.external) {
			const externalId = ctx.external.registry.get(entry[0])?.id;
			const uriGenerator = ctx.external.uri ?? ((id) => id);
			if (externalId) return { ref: uriGenerator(externalId) };
			const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
			entry[1].defId = id;
			return {
				defId: id,
				ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
			};
		}
		if (entry[1] === root) return { ref: "#" };
		const defUriPrefix = `#/${defsSegment}/`;
		const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
		return {
			defId,
			ref: defUriPrefix + defId
		};
	};
	const extractToDef = (entry) => {
		if (entry[1].schema.$ref) return;
		const seen = entry[1];
		const { ref, defId } = makeURI(entry);
		seen.def = { ...seen.schema };
		if (defId) seen.defId = defId;
		const schema = seen.schema;
		for (const key in schema) delete schema[key];
		schema.$ref = ref;
	};
	if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (schema === entry[0]) {
			extractToDef(entry);
			continue;
		}
		if (ctx.external) {
			const ext = ctx.external.registry.get(entry[0])?.id;
			if (schema !== entry[0] && ext) {
				extractToDef(entry);
				continue;
			}
		}
		if (ctx.metadataRegistry.get(entry[0])?.id) {
			extractToDef(entry);
			continue;
		}
		if (seen.cycle) {
			extractToDef(entry);
			continue;
		}
		if (seen.count > 1) {
			if (ctx.reused === "ref") {
				extractToDef(entry);
				continue;
			}
		}
	}
}
function finalize(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const flattenRef = (zodSchema) => {
		const seen = ctx.seen.get(zodSchema);
		if (seen.ref === null) return;
		const schema = seen.def ?? seen.schema;
		const _cached = { ...schema };
		const ref = seen.ref;
		seen.ref = null;
		if (ref) {
			flattenRef(ref);
			const refSeen = ctx.seen.get(ref);
			const refSchema = refSeen.schema;
			if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
				schema.allOf = schema.allOf ?? [];
				schema.allOf.push(refSchema);
			} else Object.assign(schema, refSchema);
			Object.assign(schema, _cached);
			if (zodSchema._zod.parent === ref) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (!(key in _cached)) delete schema[key];
			}
			if (refSchema.$ref && refSeen.def) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
			}
		}
		const parent = zodSchema._zod.parent;
		if (parent && parent !== ref) {
			flattenRef(parent);
			const parentSeen = ctx.seen.get(parent);
			if (parentSeen?.schema.$ref) {
				schema.$ref = parentSeen.schema.$ref;
				if (parentSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
				}
			}
		}
		ctx.override({
			zodSchema,
			jsonSchema: schema,
			path: seen.path ?? []
		});
	};
	for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
	const result = {};
	if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
	else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
	else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
	else if (ctx.target === "openapi-3.0") {}
	if (ctx.external?.uri) {
		const id = ctx.external.registry.get(schema)?.id;
		if (!id) throw new Error("Schema is missing an `id` property");
		result.$id = ctx.external.uri(id);
	}
	Object.assign(result, root.def ?? root.schema);
	const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
	if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
	const defs = ctx.external?.defs ?? {};
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.def && seen.defId) {
			if (seen.def.id === seen.defId) delete seen.def.id;
			defs[seen.defId] = seen.def;
		}
	}
	if (ctx.external) {} else if (Object.keys(defs).length > 0) if (ctx.target === "draft-2020-12") result.$defs = defs;
	else result.definitions = defs;
	try {
		const finalized = JSON.parse(JSON.stringify(result));
		Object.defineProperty(finalized, "~standard", {
			value: {
				...schema["~standard"],
				jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				}
			},
			enumerable: false,
			writable: false
		});
		return finalized;
	} catch (_err) {
		throw new Error("Error converting schema to JSON.");
	}
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	if (def.type === "transform") return true;
	if (def.type === "array") return isTransforming(def.element, ctx);
	if (def.type === "set") return isTransforming(def.valueType, ctx);
	if (def.type === "lazy") return isTransforming(def.getter(), ctx);
	if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
	if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
	if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
	if (def.type === "pipe") {
		if (_schema._zod.traits.has("$ZodCodec")) return true;
		return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
	}
	if (def.type === "object") {
		for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
		return false;
	}
	if (def.type === "union") {
		for (const option of def.options) if (isTransforming(option, ctx)) return true;
		return false;
	}
	if (def.type === "tuple") {
		for (const item of def.items) if (isTransforming(item, ctx)) return true;
		if (def.rest && isTransforming(def.rest, ctx)) return true;
		return false;
	}
	return false;
}
/**
* Creates a toJSONSchema method for a schema instance.
* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
*/
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
	const ctx = initializeContext({
		...params,
		processors
	});
	process$2(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
	const { libraryOptions, target } = params ?? {};
	const ctx = initializeContext({
		...libraryOptions ?? {},
		target,
		io,
		processors
	});
	process$2(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	json.type = "string";
	const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
	if (typeof minimum === "number") json.minLength = minimum;
	if (typeof maximum === "number") json.maxLength = maximum;
	if (format) {
		json.format = formatMap[format] ?? format;
		if (json.format === "") delete json.format;
		if (format === "time") delete json.format;
	}
	if (contentEncoding) json.contentEncoding = contentEncoding;
	if (patterns && patterns.size > 0) {
		const regexes = [...patterns];
		if (regexes.length === 1) json.pattern = regexes[0].source;
		else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
			...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: regex.source
		}))];
	}
};
var numberProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
	if (typeof format === "string" && format.includes("int")) json.type = "integer";
	else json.type = "number";
	const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
	const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
	const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
	if (exMin) if (legacy) {
		json.minimum = exclusiveMinimum;
		json.exclusiveMinimum = true;
	} else json.exclusiveMinimum = exclusiveMinimum;
	else if (typeof minimum === "number") json.minimum = minimum;
	if (exMax) if (legacy) {
		json.maximum = exclusiveMaximum;
		json.exclusiveMaximum = true;
	} else json.exclusiveMaximum = exclusiveMaximum;
	else if (typeof maximum === "number") json.maximum = maximum;
	if (typeof multipleOf === "number") json.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
	json.type = "boolean";
};
var neverProcessor = (_schema, _ctx, json, _params) => {
	json.not = {};
};
var enumProcessor = (schema, _ctx, json, _params) => {
	const def = schema._zod.def;
	const values = getEnumValues(def.entries);
	if (values.every((v) => typeof v === "number")) json.type = "number";
	if (values.every((v) => typeof v === "string")) json.type = "string";
	json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
	const def = schema._zod.def;
	const vals = [];
	for (const val of def.values) if (val === void 0) {
		if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
	} else if (typeof val === "bigint") if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
	else vals.push(Number(val));
	else vals.push(val);
	if (vals.length === 0) {} else if (vals.length === 1) {
		const val = vals[0];
		json.type = val === null ? "null" : typeof val;
		if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
		else json.const = val;
	} else {
		if (vals.every((v) => typeof v === "number")) json.type = "number";
		if (vals.every((v) => typeof v === "string")) json.type = "string";
		if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
		if (vals.every((v) => v === null)) json.type = "null";
		json.enum = vals;
	}
};
var customProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
};
var transformProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const { minimum, maximum } = schema._zod.bag;
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
	json.type = "array";
	json.items = process$2(def.element, ctx, {
		...params,
		path: [...params.path, "items"]
	});
};
var objectProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	json.properties = {};
	const shape = def.shape;
	for (const key in shape) json.properties[key] = process$2(shape[key], ctx, {
		...params,
		path: [
			...params.path,
			"properties",
			key
		]
	});
	const allKeys = new Set(Object.keys(shape));
	const requiredKeys = new Set([...allKeys].filter((key) => {
		const v = def.shape[key]._zod;
		if (ctx.io === "input") return v.optin === void 0;
		else return v.optout === void 0;
	}));
	if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
	if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
	else if (!def.catchall) {
		if (ctx.io === "output") json.additionalProperties = false;
	} else if (def.catchall) json.additionalProperties = process$2(def.catchall, ctx, {
		...params,
		path: [...params.path, "additionalProperties"]
	});
};
var unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => process$2(x, ctx, {
		...params,
		path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		]
	}));
	if (isExclusive) json.oneOf = options;
	else json.anyOf = options;
};
var intersectionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const a = process$2(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = process$2(def.right, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			1
		]
	});
	const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
	json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
};
var recordProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	const keyType = def.keyType;
	const patterns = keyType._zod.bag?.patterns;
	if (def.mode === "loose" && patterns && patterns.size > 0) {
		const valueSchema = process$2(def.valueType, ctx, {
			...params,
			path: [
				...params.path,
				"patternProperties",
				"*"
			]
		});
		json.patternProperties = {};
		for (const pattern of patterns) json.patternProperties[pattern.source] = valueSchema;
	} else {
		if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") json.propertyNames = process$2(def.keyType, ctx, {
			...params,
			path: [...params.path, "propertyNames"]
		});
		json.additionalProperties = process$2(def.valueType, ctx, {
			...params,
			path: [...params.path, "additionalProperties"]
		});
	}
	const keyValues = keyType._zod.values;
	if (keyValues) {
		const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
		if (validKeyValues.length > 0) json.required = validKeyValues;
	}
};
var nullableProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const inner = process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	let catchValue;
	try {
		catchValue = def.catchValue(void 0);
	} catch {
		throw new Error("Dynamic catch values are not supported in JSON Schema");
	}
	json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	const inIsTransform = def.in._zod.traits.has("$ZodTransform");
	const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
	process$2(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process$2(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
var ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function datetime(params) {
	return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function date(params) {
	return /* @__PURE__ */ _isoDate(ZodISODate, params);
}
var ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function time(params) {
	return /* @__PURE__ */ _isoTime(ZodISOTime, params);
}
var ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function duration(params) {
	return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
var initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	Object.defineProperties(inst, {
		format: { value: (mapper) => formatError(inst, mapper) },
		flatten: { value: (mapper) => flattenError(inst, mapper) },
		addIssue: { value: (issue) => {
			inst.issues.push(issue);
			inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
		} },
		addIssues: { value: (issues) => {
			inst.issues.push(...issues);
			inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
		} },
		isEmpty: { get() {
			return inst.issues.length === 0;
		} }
	});
};
var ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
	const proto = Object.getPrototypeOf(inst);
	let installed = _installedGroups.get(proto);
	if (!installed) {
		installed = /* @__PURE__ */ new Set();
		_installedGroups.set(proto, installed);
	}
	if (installed.has(group)) return;
	installed.add(group);
	for (const key in methods) {
		const fn = methods[key];
		Object.defineProperty(proto, key, {
			configurable: true,
			enumerable: false,
			get() {
				const bound = fn.bind(this);
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable: true,
					value: bound
				});
				return bound;
			},
			set(v) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable: true,
					value: v
				});
			}
		});
	}
}
var ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	$ZodType.init(inst, def);
	Object.assign(inst["~standard"], { jsonSchema: {
		input: createStandardJSONSchemaMethod(inst, "input"),
		output: createStandardJSONSchemaMethod(inst, "output")
	} });
	inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
	inst.def = def;
	inst.type = def.type;
	Object.defineProperty(inst, "_def", { value: def });
	inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
	inst.safeParse = (data, params) => safeParse(inst, data, params);
	inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
	inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
	inst.spa = inst.safeParseAsync;
	inst.encode = (data, params) => encode(inst, data, params);
	inst.decode = (data, params) => decode(inst, data, params);
	inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
	inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
	inst.safeEncode = (data, params) => safeEncode(inst, data, params);
	inst.safeDecode = (data, params) => safeDecode(inst, data, params);
	inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
	inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
	_installLazyMethods(inst, "ZodType", {
		check(...chks) {
			const def = this.def;
			return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)] }), { parent: true });
		},
		with(...chks) {
			return this.check(...chks);
		},
		clone(def, params) {
			return clone$1(this, def, params);
		},
		brand() {
			return this;
		},
		register(reg, meta) {
			reg.add(this, meta);
			return this;
		},
		refine(check, params) {
			return this.check(refine(check, params));
		},
		superRefine(refinement, params) {
			return this.check(superRefine(refinement, params));
		},
		overwrite(fn) {
			return this.check(/* @__PURE__ */ _overwrite(fn));
		},
		optional() {
			return optional(this);
		},
		exactOptional() {
			return exactOptional(this);
		},
		nullable() {
			return nullable(this);
		},
		nullish() {
			return optional(nullable(this));
		},
		nonoptional(params) {
			return nonoptional(this, params);
		},
		array() {
			return array(this);
		},
		or(arg) {
			return union([this, arg]);
		},
		and(arg) {
			return intersection(this, arg);
		},
		transform(tx) {
			return pipe(this, transform(tx));
		},
		default(d) {
			return _default(this, d);
		},
		prefault(d) {
			return prefault(this, d);
		},
		catch(params) {
			return _catch(this, params);
		},
		pipe(target) {
			return pipe(this, target);
		},
		readonly() {
			return readonly(this);
		},
		describe(description) {
			const cl = this.clone();
			globalRegistry.add(cl, { description });
			return cl;
		},
		meta(...args) {
			if (args.length === 0) return globalRegistry.get(this);
			const cl = this.clone();
			globalRegistry.add(cl, args[0]);
			return cl;
		},
		isOptional() {
			return this.safeParse(void 0).success;
		},
		isNullable() {
			return this.safeParse(null).success;
		},
		apply(fn) {
			return fn(this);
		}
	});
	Object.defineProperty(inst, "description", {
		get() {
			return globalRegistry.get(inst)?.description;
		},
		configurable: true
	});
	return inst;
});
/** @internal */
var _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
	const bag = inst._zod.bag;
	inst.format = bag.format ?? null;
	inst.minLength = bag.minimum ?? null;
	inst.maxLength = bag.maximum ?? null;
	_installLazyMethods(inst, "_ZodString", {
		regex(...args) {
			return this.check(/* @__PURE__ */ _regex(...args));
		},
		includes(...args) {
			return this.check(/* @__PURE__ */ _includes(...args));
		},
		startsWith(...args) {
			return this.check(/* @__PURE__ */ _startsWith(...args));
		},
		endsWith(...args) {
			return this.check(/* @__PURE__ */ _endsWith(...args));
		},
		min(...args) {
			return this.check(/* @__PURE__ */ _minLength(...args));
		},
		max(...args) {
			return this.check(/* @__PURE__ */ _maxLength(...args));
		},
		length(...args) {
			return this.check(/* @__PURE__ */ _length(...args));
		},
		nonempty(...args) {
			return this.check(/* @__PURE__ */ _minLength(1, ...args));
		},
		lowercase(params) {
			return this.check(/* @__PURE__ */ _lowercase(params));
		},
		uppercase(params) {
			return this.check(/* @__PURE__ */ _uppercase(params));
		},
		trim() {
			return this.check(/* @__PURE__ */ _trim());
		},
		normalize(...args) {
			return this.check(/* @__PURE__ */ _normalize(...args));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ _toLowerCase());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ _toUpperCase());
		},
		slugify() {
			return this.check(/* @__PURE__ */ _slugify());
		}
	});
});
var ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
	inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
	inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
	inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
	inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
	inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
	inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
	inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
	inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
	inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
	inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
	inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
	inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
	inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
	inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
	inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
	inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
	inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
	inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
	inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
	inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
	inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
	inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
	inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
	inst.datetime = (params) => inst.check(datetime(params));
	inst.date = (params) => inst.check(date(params));
	inst.time = (params) => inst.check(time(params));
	inst.duration = (params) => inst.check(duration(params));
});
function string(params) {
	return /* @__PURE__ */ _string(ZodString, params);
}
var ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
var ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
	_installLazyMethods(inst, "ZodNumber", {
		gt(value, params) {
			return this.check(/* @__PURE__ */ _gt(value, params));
		},
		gte(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		min(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		lt(value, params) {
			return this.check(/* @__PURE__ */ _lt(value, params));
		},
		lte(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		max(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		int(params) {
			return this.check(int(params));
		},
		safe(params) {
			return this.check(int(params));
		},
		positive(params) {
			return this.check(/* @__PURE__ */ _gt(0, params));
		},
		nonnegative(params) {
			return this.check(/* @__PURE__ */ _gte(0, params));
		},
		negative(params) {
			return this.check(/* @__PURE__ */ _lt(0, params));
		},
		nonpositive(params) {
			return this.check(/* @__PURE__ */ _lte(0, params));
		},
		multipleOf(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		step(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		finite() {
			return this;
		}
	});
	const bag = inst._zod.bag;
	inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
	inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
	inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
	inst.isFinite = true;
	inst.format = bag.format ?? null;
});
function number(params) {
	return /* @__PURE__ */ _number(ZodNumber, params);
}
var ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodNumber.init(inst, def);
});
function int(params) {
	return /* @__PURE__ */ _int(ZodNumberFormat, params);
}
var ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean(params) {
	return /* @__PURE__ */ _boolean(ZodBoolean, params);
}
var ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
	$ZodUnknown.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => void 0;
});
function unknown() {
	return /* @__PURE__ */ _unknown(ZodUnknown);
}
var ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
	return /* @__PURE__ */ _never(ZodNever, params);
}
var ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
	inst.element = def.element;
	_installLazyMethods(inst, "ZodArray", {
		min(n, params) {
			return this.check(/* @__PURE__ */ _minLength(n, params));
		},
		nonempty(params) {
			return this.check(/* @__PURE__ */ _minLength(1, params));
		},
		max(n, params) {
			return this.check(/* @__PURE__ */ _maxLength(n, params));
		},
		length(n, params) {
			return this.check(/* @__PURE__ */ _length(n, params));
		},
		unwrap() {
			return this.element;
		}
	});
});
function array(element, params) {
	return /* @__PURE__ */ _array(ZodArray, element, params);
}
var ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
	$ZodObjectJIT.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
	defineLazy(inst, "shape", () => {
		return def.shape;
	});
	_installLazyMethods(inst, "ZodObject", {
		keyof() {
			return _enum(Object.keys(this._zod.def.shape));
		},
		catchall(catchall) {
			return this.clone({
				...this._zod.def,
				catchall
			});
		},
		passthrough() {
			return this.clone({
				...this._zod.def,
				catchall: unknown()
			});
		},
		loose() {
			return this.clone({
				...this._zod.def,
				catchall: unknown()
			});
		},
		strict() {
			return this.clone({
				...this._zod.def,
				catchall: never()
			});
		},
		strip() {
			return this.clone({
				...this._zod.def,
				catchall: void 0
			});
		},
		extend(incoming) {
			return extend(this, incoming);
		},
		safeExtend(incoming) {
			return safeExtend(this, incoming);
		},
		merge(other) {
			return merge(this, other);
		},
		pick(mask) {
			return pick(this, mask);
		},
		omit(mask) {
			return omit(this, mask);
		},
		partial(...args) {
			return partial(ZodOptional, this, args[0]);
		},
		required(...args) {
			return required(ZodNonOptional, this, args[0]);
		}
	});
});
function object(shape, params) {
	return new ZodObject({
		type: "object",
		shape: shape ?? {},
		...normalizeParams(params)
	});
}
var ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
var ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
	ZodUnion.init(inst, def);
	$ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
	return new ZodDiscriminatedUnion({
		type: "union",
		options,
		discriminator,
		...normalizeParams(params)
	});
}
var ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
var ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
	$ZodRecord.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
	inst.keyType = def.keyType;
	inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
	if (!valueType || !valueType._zod) return new ZodRecord({
		type: "record",
		keyType: string(),
		valueType: keyType,
		...normalizeParams(valueType)
	});
	return new ZodRecord({
		type: "record",
		keyType,
		valueType,
		...normalizeParams(params)
	});
}
var ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
	inst.enum = def.entries;
	inst.options = Object.values(def.entries);
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	return new ZodEnum({
		type: "enum",
		entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values,
		...normalizeParams(params)
	});
}
var ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
	$ZodLiteral.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
	inst.values = new Set(def.values);
	Object.defineProperty(inst, "value", { get() {
		if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return def.values[0];
	} });
});
function literal(value, params) {
	return new ZodLiteral({
		type: "literal",
		values: Array.isArray(value) ? value : [value],
		...normalizeParams(params)
	});
}
var ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
	inst._zod.parse = (payload, _ctx) => {
		if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		payload.addIssue = (issue$1) => {
			if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
			else {
				const _issue = issue$1;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = inst);
				payload.issues.push(issue(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			payload.fallback = true;
			return payload;
		});
		payload.value = output;
		payload.fallback = true;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
var ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
var ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
	$ZodExactOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
	return new ZodExactOptional({
		type: "optional",
		innerType
	});
}
var ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
var ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
var ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
	});
}
var ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
var ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
var ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
	return /* @__PURE__ */ _superRefine(fn, params);
}
//#endregion
//#region src/services/types.ts
var ok$1 = (data) => ({
	ok: true,
	data
});
var err = (error) => ({
	ok: false,
	error
});
//#endregion
//#region src/prototype/prototype-plan.ts
var prototypeActionSchema = discriminatedUnion("type", [
	object({
		type: literal("navigate"),
		targetPageId: string().min(1)
	}),
	object({
		type: literal("open-overlay"),
		targetOverlayId: string().min(1)
	}),
	object({
		type: literal("change-state"),
		targetStateId: string().min(1)
	}),
	object({
		type: literal("external"),
		destination: string().min(1)
	}),
	object({
		type: literal("none"),
		reason: string().min(1)
	})
]);
var prototypeInteractionSchema = object({
	id: string().min(1),
	label: string().min(1),
	trigger: _enum([
		"click",
		"tap",
		"hover",
		"scroll",
		"submit",
		"change"
	]),
	sourceSectionId: string().min(1).optional(),
	sourceElement: string().min(1),
	intent: string().min(1),
	action: prototypeActionSchema
});
var prototypeRegionSchema = object({
	id: string().min(1),
	name: string().min(1),
	role: string().min(1),
	summary: string().min(1),
	complexity: _enum([
		"low",
		"medium",
		"high"
	]),
	decompositionStrategy: _enum([
		"direct",
		"region-crop",
		"recursive-region"
	]).default("direct"),
	assetRoute: _enum([
		"direct-generate",
		"board-cutout",
		"ignore-code-ui"
	]).default("board-cutout"),
	assetOpportunities: array(string().min(1)).default([])
});
var prototypePageSchema = object({
	id: string().min(1),
	name: string().min(1),
	route: string().min(1),
	purpose: string().min(1),
	viewport: object({
		platform: string().min(1),
		width: number().int().positive().max(8192),
		height: number().int().positive().max(8192),
		scroll: _enum(["single-screen", "long-scroll"]).default("single-screen")
	}),
	regions: array(prototypeRegionSchema).min(1),
	overlays: array(object({
		id: string().min(1),
		name: string().min(1),
		purpose: string().min(1)
	})).default([]),
	states: array(object({
		id: string().min(1),
		name: string().min(1),
		purpose: string().min(1)
	})).default([]),
	interactions: array(prototypeInteractionSchema).default([])
});
var prototypeFlowStepSchema = object({
	fromPageId: string().min(1),
	interactionId: string().min(1),
	toPageId: string().min(1).optional()
});
var prototypeFlowSchema = object({
	id: string().min(1),
	name: string().min(1),
	goal: string().min(1),
	startPageId: string().min(1),
	steps: array(prototypeFlowStepSchema).default([])
});
var prototypeHumanLoopChoiceSchema = object({
	id: string().min(1),
	label: string().min(1),
	description: string().min(1),
	impact: string().min(1)
});
var prototypeHumanLoopSchema = discriminatedUnion("mode", [object({
	mode: literal("continue"),
	rationale: string().min(1)
}), object({
	mode: literal("ask"),
	rationale: string().min(1),
	question: string().min(1),
	choices: array(prototypeHumanLoopChoiceSchema).min(2).max(4),
	defaultChoiceId: string().min(1)
})]);
var prototypeReviewDocumentSchema = object({
	format: literal("markdown"),
	primaryFlow: string().min(1).max(4e4),
	fullPlan: string().min(1).max(4e4)
});
var prototypePlanSchema = object({
	version: literal("prototype-plan.v0"),
	product: object({
		name: string().min(1),
		projectName: string().min(1).max(32).optional(),
		summary: string().min(1),
		audience: string().min(1),
		primaryGoal: string().min(1),
		platform: string().min(1)
	}),
	designSystem: object({
		styleSummary: string().min(1),
		palette: array(string().min(1)).min(1),
		typography: string().min(1),
		spacing: string().min(1),
		componentPrinciples: array(string().min(1)).min(1),
		assetDirection: string().min(1)
	}),
	pages: array(prototypePageSchema).min(1).max(12),
	flows: array(prototypeFlowSchema).min(1),
	reviewDocument: prototypeReviewDocumentSchema.optional(),
	humanLoop: prototypeHumanLoopSchema.default({
		mode: "continue",
		rationale: "The requirement is clear enough to proceed."
	})
});
prototypePlanSchema.extend({ reviewDocument: prototypeReviewDocumentSchema });
function validatePrototypePlan(plan) {
	const pageIds = /* @__PURE__ */ new Set();
	const pageRoutes = /* @__PURE__ */ new Set();
	for (const page of plan.pages) {
		if (pageIds.has(page.id)) return err(`Duplicate page id: "${page.id}".`);
		pageIds.add(page.id);
		if (pageRoutes.has(page.route)) return err(`Duplicate page route: "${page.route}".`);
		pageRoutes.add(page.route);
		const regionIds = /* @__PURE__ */ new Set();
		for (const region of page.regions) {
			if (regionIds.has(region.id)) return err(`Page "${page.id}" has duplicate region id: "${region.id}".`);
			regionIds.add(region.id);
		}
		const overlayIds = new Set(page.overlays.map((overlay) => overlay.id));
		if (overlayIds.size !== page.overlays.length) return err(`Page "${page.id}" has duplicate overlay ids.`);
		const stateIds = new Set(page.states.map((state) => state.id));
		if (stateIds.size !== page.states.length) return err(`Page "${page.id}" has duplicate state ids.`);
		const interactionIds = /* @__PURE__ */ new Set();
		for (const interaction of page.interactions) {
			if (interactionIds.has(interaction.id)) return err(`Page "${page.id}" has duplicate interaction id: "${interaction.id}".`);
			interactionIds.add(interaction.id);
			if (interaction.sourceSectionId && !regionIds.has(interaction.sourceSectionId)) return err(`Interaction "${interaction.id}" references unknown section "${interaction.sourceSectionId}" on page "${page.id}".`);
			const action = interaction.action;
			if (action.type === "navigate" && !pageIds.has(action.targetPageId)) continue;
			if (action.type === "open-overlay" && !overlayIds.has(action.targetOverlayId)) return err(`Interaction "${interaction.id}" opens unknown overlay "${action.targetOverlayId}" on page "${page.id}".`);
			if (action.type === "change-state" && !stateIds.has(action.targetStateId)) return err(`Interaction "${interaction.id}" changes to unknown state "${action.targetStateId}" on page "${page.id}".`);
		}
	}
	for (const page of plan.pages) for (const interaction of page.interactions) {
		const action = interaction.action;
		if (action.type === "navigate" && !pageIds.has(action.targetPageId)) return err(`Interaction "${interaction.id}" navigates to unknown page "${action.targetPageId}".`);
	}
	for (const flow of plan.flows) {
		if (!pageIds.has(flow.startPageId)) return err(`Flow "${flow.id}" starts at unknown page "${flow.startPageId}".`);
		for (const step of flow.steps) {
			const page = plan.pages.find((item) => item.id === step.fromPageId);
			if (!page) return err(`Flow "${flow.id}" references unknown page "${step.fromPageId}".`);
			const interaction = page.interactions.find((item) => item.id === step.interactionId);
			if (!interaction) return err(`Flow "${flow.id}" step references unknown interaction "${step.interactionId}" on page "${step.fromPageId}".`);
			if (step.toPageId && !pageIds.has(step.toPageId)) return err(`Flow "${flow.id}" step points to unknown page "${step.toPageId}".`);
			if (interaction.action.type === "navigate" && step.toPageId && interaction.action.targetPageId !== step.toPageId) return err(`Flow "${flow.id}" step "${step.interactionId}" target does not match the interaction target.`);
		}
	}
	const humanLoop = plan.humanLoop;
	if (humanLoop.mode === "ask") {
		const ids = new Set(humanLoop.choices.map((choice) => choice.id));
		if (ids.size !== humanLoop.choices.length) return err("Human-in-the-loop choices have duplicate ids.");
		if (!ids.has(humanLoop.defaultChoiceId)) return err(`Human-in-the-loop default choice "${humanLoop.defaultChoiceId}" is missing.`);
	}
	const reachablePageIds = reachablePages(plan);
	if (reachablePageIds.size !== pageIds.size) return err(`Prototype has unreachable pages: ${[...pageIds].filter((id) => !reachablePageIds.has(id)).join(", ")}.`);
	return ok$1({ reachablePageIds: [...reachablePageIds] });
}
function reachablePages(plan) {
	const byId = new Map(plan.pages.map((page) => [page.id, page]));
	const seen = /* @__PURE__ */ new Set();
	const queue = plan.flows.map((flow) => flow.startPageId);
	while (queue.length > 0) {
		const id = queue.shift();
		if (seen.has(id)) continue;
		seen.add(id);
		const page = byId.get(id);
		if (!page) continue;
		for (const interaction of page.interactions) {
			const action = interaction.action;
			if (action.type === "navigate" && !seen.has(action.targetPageId)) queue.push(action.targetPageId);
		}
	}
	return seen;
}
//#endregion
//#region src/design-ir/schema.ts
/**
* Canonical, framework-neutral Design IR v1 contract.
*
* This module intentionally owns only portable product/design data. Adapters for
* Figma, source repositories, UI frameworks, and the workspace persistence layer
* are consumers of this contract, never alternative sources of truth.
*/
var idSchema$2 = string().min(1).max(160);
var isoDateTimeSchema = datetime({ offset: true });
var sha256Schema$6 = string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest.");
var designIrVersionSchema = literal("design-ir.v1");
var designDocumentMetaSchema = object({
	id: idSchema$2,
	title: string().min(1).max(200),
	createdAt: isoDateTimeSchema,
	updatedAt: isoDateTimeSchema
}).strict();
var designDocumentRevisionSchema = object({
	id: idSchema$2,
	number: number().int().positive(),
	createdAt: isoDateTimeSchema,
	author: object({
		kind: _enum([
			"human",
			"agent",
			"import"
		]),
		id: idSchema$2
	}).strict(),
	parentFingerprint: string().min(1).optional()
}).strict();
var needSchema = object({
	id: idSchema$2,
	title: string().min(1),
	statement: string().min(1),
	priority: _enum([
		"critical",
		"high",
		"medium",
		"low"
	]),
	status: _enum([
		"draft",
		"accepted",
		"satisfied",
		"rejected"
	]).default("draft"),
	acceptanceCriteria: array(string().min(1)).default([])
}).strict();
var sourceKindSchema = _enum([
	"repository",
	"need",
	"story",
	"idea",
	"code",
	"url",
	"screenshot",
	"photo",
	"video",
	"figma",
	"document"
]);
var sourceRoleSchema$1 = _enum([
	"requirement",
	"reference",
	"constraint",
	"implementation",
	"brand-asset",
	"evidence"
]);
var sourceLicenseSchema$1 = discriminatedUnion("kind", [
	object({
		kind: literal("spdx"),
		identifier: string().min(1)
	}).strict(),
	object({
		kind: literal("proprietary"),
		holder: string().min(1)
	}).strict(),
	object({ kind: literal("public-domain") }).strict(),
	object({
		kind: literal("unknown"),
		rationale: string().min(1)
	}).strict()
]);
var contentReferenceSchema = object({
	id: idSchema$2,
	/** A URL, repo-relative path, or content-addressed URI. */
	uri: string().min(1),
	mediaType: string().min(1).optional(),
	sha256: sha256Schema$6.optional(),
	/** Intrinsic raster size; avoids re-decoding or manufacturing 0x0 on restore. */
	pixelSize: object({
		width: number().int().positive(),
		height: number().int().positive()
	}).strict().optional()
}).strict();
/**
* Facts captured by a local, non-network ingestion adapter. This records where
* the source descriptor came from without pretending that a URL, Figma file,
* or repository has been fetched or semantically understood.
*/
var sourceIngestionSchema = object({
	origin: _enum([
		"local-file",
		"inline-text",
		"url-descriptor",
		"repository-snapshot"
	]),
	capturedAt: isoDateTimeSchema,
	prompt: string().min(1).max(2e4).optional(),
	/** A sanitized, relative display path. Absolute host paths are never stored. */
	relativePath: string().min(1).max(4e3).optional(),
	url: string().url().max(4e3).optional(),
	mediaType: string().min(1).max(255).optional(),
	bytes: number().int().nonnegative().optional(),
	descriptor: discriminatedUnion("kind", [object({
		kind: literal("url"),
		url: string().url().max(4e3),
		title: string().min(1).max(200).optional(),
		capturedMediaType: string().min(1).max(255).optional()
	}).strict(), object({
		kind: literal("repository"),
		label: string().min(1).max(200),
		includedPaths: array(string().min(1).max(4e3)).max(1e4),
		excludedCount: number().int().nonnegative(),
		/** Safe file metadata captured by a trusted local inventory adapter. */
		entries: array(object({
			path: string().min(1).max(4e3),
			bytes: number().int().nonnegative(),
			mediaType: string().min(1).max(255).optional(),
			sha256: sha256Schema$6.optional()
		}).strict()).max(1e4).optional()
	}).strict()]).optional()
}).strict();
var sourceSchema = object({
	id: idSchema$2,
	kind: sourceKindSchema,
	role: sourceRoleSchema$1,
	title: string().min(1),
	license: sourceLicenseSchema$1,
	content: array(contentReferenceSchema).min(1),
	ingestion: sourceIngestionSchema.optional()
}).strict();
/** Persisted selection only; executable catalog metadata remains compiler-owned and versioned. */
var brandViSelectionSchema = object({
	catalogVersion: literal("brand-vi-catalog.v1"),
	profile: _enum([
		"minimum",
		"core",
		"full",
		"custom"
	]),
	selectedItemIds: array(idSchema$2).default([]),
	approvedItemIds: array(idSchema$2).default([])
}).strict().superRefine((selection, context) => {
	if (selection.profile === "custom" && selection.selectedItemIds.length === 0) context.addIssue({
		code: "custom",
		message: "A custom Brand VI selection requires at least one item."
	});
	const selected = new Set(selection.selectedItemIds);
	for (const approved of selection.approvedItemIds) if (!selected.has(approved)) context.addIssue({
		code: "custom",
		message: `Approved Brand VI item "${approved}" is not selected.`
	});
});
/** Typed brand declaration with an optional, reviewable VI generation selection. */
var brandSchema = object({
	id: idSchema$2,
	name: string().min(1),
	status: _enum([
		"placeholder",
		"active",
		"deprecated"
	]).default("placeholder"),
	summary: string().min(1).optional(),
	provenanceId: idSchema$2.optional(),
	viSelection: brandViSelectionSchema.optional()
}).strict();
var designTokenSchema = object({
	id: idSchema$2,
	name: string().min(1),
	kind: _enum([
		"color",
		"spacing",
		"typography",
		"radius",
		"shadow",
		"motion",
		"other"
	]),
	value: string().min(1),
	mode: string().min(1).optional(),
	provenanceId: idSchema$2.optional(),
	/** Absent means "flat", the historical default — a specimen view groups only when present. */
	tier: _enum([
		"primitive",
		"semantic",
		"alias"
	]).optional(),
	/** Must reference another token id in the same document; validated, not enforced by the schema itself. */
	aliasOf: idSchema$2.optional()
}).strict();
var componentSchema = object({
	id: idSchema$2,
	name: string().min(1),
	status: _enum([
		"placeholder",
		"draft",
		"ready",
		"deprecated"
	]).default("placeholder"),
	description: string().min(1).optional(),
	tokenIds: array(idSchema$2).default([]),
	provenanceId: idSchema$2.optional()
}).strict();
var materialKindSchema$1 = _enum([
	"design-system",
	"prototype-page",
	"cutout-slice",
	"design-markdown",
	"image",
	"video",
	"motion",
	"code",
	"other",
	"design-specimen",
	"design-demo"
]);
var materialProductionEvidenceSchema = object({
	planId: idSchema$2,
	runId: idSchema$2,
	taskId: idSchema$2,
	manifestItemId: idSchema$2,
	pageId: idSchema$2,
	regionId: idSchema$2,
	artifactId: idSchema$2,
	artifactSha256: sha256Schema$6,
	readiness: _enum([
		"queued",
		"generating",
		"candidate-ready",
		"reviewing",
		"accepted",
		"cutting",
		"verifying",
		"ready",
		"needs-review",
		"waived",
		"failed",
		"cancelled",
		"legacy-ready"
	]),
	included: boolean(),
	bounds: object({
		x: number().nonnegative(),
		y: number().nonnegative(),
		width: number().positive(),
		height: number().positive()
	}).strict(),
	sourceRevision: object({
		projectRevisionId: idSchema$2,
		designSystemArtifactId: idSchema$2.optional(),
		pageArtifactId: idSchema$2.optional(),
		pageArtifactSha256: sha256Schema$6.optional()
	}).strict(),
	cutoutParams: object({
		threshold: number(),
		minArea: number(),
		mergeGap: number(),
		padding: number()
	}).strict().optional(),
	boardDiagnostics: object({
		borderWhiteRatio: number().min(0).max(1),
		whiteRatio: number().min(0).max(1),
		compliant: boolean()
	}).strict().optional(),
	qaVerdict: object({
		pass: boolean(),
		failures: array(string().min(1).max(2e3)),
		unavailable: boolean().optional()
	}).strict().optional(),
	providerRoute: string().min(1).max(240).optional(),
	lineage: object({
		previousRunId: idSchema$2,
		previousTaskId: idSchema$2,
		previousArtifactSha256: sha256Schema$6
	}).strict().optional(),
	issues: array(object({
		code: string().min(1).max(120),
		kind: _enum([
			"integrity",
			"quality",
			"warning"
		]),
		message: string().min(1).max(2e3),
		waivable: boolean(),
		source: _enum([
			"runtime",
			"deterministic-check",
			"model-review",
			"user"
		]),
		recordedAt: number().int().nonnegative()
	}).strict()),
	decision: object({
		receiptId: idSchema$2,
		decision: _enum(["approve", "waive"]),
		issueCodes: array(string().min(1)),
		actor: object({
			kind: _enum(["human", "agent"]),
			id: idSchema$2
		}).strict(),
		decidedAt: number().int().nonnegative()
	}).strict().optional()
}).strict();
/**
* Material revisions are append-only values. There is no mutable content field
* on a material; a changed artifact is always a newly identified revision.
*/
var materialRevisionSchema = object({
	id: idSchema$2,
	ordinal: number().int().positive(),
	createdAt: isoDateTimeSchema,
	content: contentReferenceSchema,
	provenanceId: idSchema$2.optional(),
	production: materialProductionEvidenceSchema.optional()
}).strict();
var materialSchema = object({
	id: idSchema$2,
	kind: materialKindSchema$1,
	name: string().min(1),
	revisions: array(materialRevisionSchema).min(1),
	currentRevisionId: idSchema$2
}).strict();
var provenanceSchema = object({
	id: idSchema$2,
	operation: _enum([
		"import",
		"derive",
		"generate",
		"edit",
		"validate",
		"manual"
	]),
	sourceIds: array(idSchema$2).min(1),
	actor: object({
		kind: _enum([
			"human",
			"agent",
			"system"
		]),
		id: idSchema$2
	}).strict(),
	recordedAt: isoDateTimeSchema,
	tool: string().min(1).optional()
}).strict();
object({
	kind: _enum([
		"need",
		"source",
		"brand",
		"token",
		"component",
		"material",
		"prototype"
	]),
	id: idSchema$2
}).strict();
var nonSourceEntityReferenceSchema = union([
	object({
		kind: literal("need"),
		id: idSchema$2
	}).strict(),
	object({
		kind: literal("brand"),
		id: idSchema$2
	}).strict(),
	object({
		kind: literal("token"),
		id: idSchema$2
	}).strict(),
	object({
		kind: literal("component"),
		id: idSchema$2
	}).strict(),
	object({
		kind: literal("material"),
		id: idSchema$2
	}).strict(),
	object({
		kind: literal("prototype"),
		id: idSchema$2
	}).strict()
]);
var relationBaseSchema = object({
	id: idSchema$2,
	provenanceId: idSchema$2.optional()
}).strict();
/**
* Relations deliberately encode endpoint kinds, so an adapter cannot claim a
* component uses a source, for example. Endpoint existence remains validator
* work because it crosses entity collections.
*/
var relationSchema = discriminatedUnion("kind", [
	relationBaseSchema.extend({
		kind: literal("source-evidence"),
		from: object({
			kind: literal("source"),
			id: idSchema$2
		}).strict(),
		to: nonSourceEntityReferenceSchema
	}),
	relationBaseSchema.extend({
		kind: literal("material-derived-from"),
		from: object({
			kind: literal("material"),
			id: idSchema$2
		}).strict(),
		to: union([
			object({
				kind: literal("source"),
				id: idSchema$2
			}).strict(),
			object({
				kind: literal("material"),
				id: idSchema$2
			}).strict(),
			object({
				kind: literal("prototype"),
				id: idSchema$2
			}).strict()
		])
	}),
	relationBaseSchema.extend({
		kind: literal("component-implements-need"),
		from: object({
			kind: literal("component"),
			id: idSchema$2
		}).strict(),
		to: object({
			kind: literal("need"),
			id: idSchema$2
		}).strict()
	}),
	relationBaseSchema.extend({
		kind: literal("component-uses-token"),
		from: object({
			kind: literal("component"),
			id: idSchema$2
		}).strict(),
		to: object({
			kind: literal("token"),
			id: idSchema$2
		}).strict()
	}),
	relationBaseSchema.extend({
		kind: literal("prototype-implements-need"),
		from: object({
			kind: literal("prototype"),
			id: idSchema$2
		}).strict(),
		to: object({
			kind: literal("need"),
			id: idSchema$2
		}).strict()
	}),
	relationBaseSchema.extend({
		kind: literal("prototype-uses-component"),
		from: object({
			kind: literal("prototype"),
			id: idSchema$2
		}).strict(),
		to: object({
			kind: literal("component"),
			id: idSchema$2
		}).strict()
	}),
	relationBaseSchema.extend({
		kind: literal("brand-defines-token"),
		from: object({
			kind: literal("brand"),
			id: idSchema$2
		}).strict(),
		to: object({
			kind: literal("token"),
			id: idSchema$2
		}).strict()
	})
]);
/** Uses the existing PrototypePlan contract directly; no forked plan schema. */
var prototypeSubtreeSchema = object({
	id: idSchema$2,
	plan: prototypePlanSchema,
	provenanceId: idSchema$2.optional()
}).strict();
var designDocumentSchema = object({
	version: designIrVersionSchema,
	meta: designDocumentMetaSchema,
	revision: designDocumentRevisionSchema,
	needs: array(needSchema).default([]),
	sources: array(sourceSchema).default([]),
	brands: array(brandSchema).default([]),
	tokens: array(designTokenSchema).default([]),
	components: array(componentSchema).default([]),
	prototype: prototypeSubtreeSchema.optional(),
	materials: array(materialSchema).default([]),
	provenance: array(provenanceSchema).default([]),
	relations: array(relationSchema).default([])
}).strict();
//#endregion
//#region src/design-ir/fingerprint.ts
/** JSON canonicalization used for durable Design IR revisions and agent diffs. */
function canonicalJson(value) {
	return canonicalize(value, /* @__PURE__ */ new Set());
}
/** SHA-256 of canonical JSON, portable across modern browser, Tauri, and Node. */
async function fingerprint(value) {
	const bytes = new TextEncoder().encode(canonicalJson(value));
	const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function canonicalize(value, ancestors) {
	if (value === null) return "null";
	switch (typeof value) {
		case "string": return JSON.stringify(value);
		case "boolean": return value ? "true" : "false";
		case "number":
			if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot contain non-finite numbers.");
			return JSON.stringify(value);
		case "undefined":
		case "function":
		case "symbol":
		case "bigint": throw new TypeError(`Canonical JSON cannot contain ${typeof value}.`);
		case "object":
			if (ancestors.has(value)) throw new TypeError("Canonical JSON cannot contain cycles.");
			ancestors.add(value);
			try {
				if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, ancestors)).join(",")}]`;
				const prototype = Object.getPrototypeOf(value);
				if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Canonical JSON only accepts plain objects and arrays.");
				const object = value;
				return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key], ancestors)}`).join(",")}}`;
			} finally {
				ancestors.delete(value);
			}
		default: throw new TypeError("Canonical JSON received an unsupported value.");
	}
}
//#endregion
//#region src/design-ir/validate.ts
/** Parse the transport shape, then prove cross-collection Design IR invariants. */
function validateDesignDocument(input) {
	const parsed = designDocumentSchema.safeParse(input);
	if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid Design IR document.");
	const document = materializeTokenUsageGraph(parsed.data);
	const collections = [
		document.needs,
		document.sources,
		document.brands,
		document.tokens,
		document.components,
		document.materials,
		document.provenance,
		document.relations
	];
	for (const collection of collections) {
		const ids = /* @__PURE__ */ new Set();
		for (const entry of collection) {
			if (ids.has(entry.id)) return err(`Duplicate id: "${entry.id}".`);
			ids.add(entry.id);
		}
	}
	const sourceIds = new Set(document.sources.map((source) => source.id));
	const provenanceIds = new Set(document.provenance.map((record) => record.id));
	for (const record of document.provenance) for (const sourceId of record.sourceIds) if (!sourceIds.has(sourceId)) return err(`Provenance "${record.id}" references unknown source "${sourceId}".`);
	for (const brand of document.brands) if (brand.provenanceId && !provenanceIds.has(brand.provenanceId)) return err(`Brand "${brand.id}" references unknown provenance "${brand.provenanceId}".`);
	for (const token of document.tokens) {
		if (token.provenanceId && !provenanceIds.has(token.provenanceId)) return err(`Token "${token.id}" references unknown provenance "${token.provenanceId}".`);
		if (token.aliasOf && !document.tokens.some((candidate) => candidate.id === token.aliasOf)) return err(`Token "${token.id}" references unknown alias target "${token.aliasOf}".`);
	}
	for (const component of document.components) {
		if (component.provenanceId && !provenanceIds.has(component.provenanceId)) return err(`Component "${component.id}" references unknown provenance "${component.provenanceId}".`);
		for (const tokenId of component.tokenIds) if (!document.tokens.some((token) => token.id === tokenId)) return err(`Component "${component.id}" references unknown token "${tokenId}".`);
	}
	if (document.prototype?.provenanceId && !provenanceIds.has(document.prototype.provenanceId)) return err(`Prototype "${document.prototype.id}" references unknown provenance "${document.prototype.provenanceId}".`);
	if (document.prototype) {
		const prototypeValidation = validatePrototypePlan(document.prototype.plan);
		if (!prototypeValidation.ok) return err(`Prototype "${document.prototype.id}" is invalid: ${prototypeValidation.error}`);
	}
	for (const material of document.materials) {
		const materialResult = validateMaterial(material, provenanceIds);
		if (!materialResult.ok) return materialResult;
	}
	const entityIds = {
		need: new Set(document.needs.map((entry) => entry.id)),
		source: sourceIds,
		brand: new Set(document.brands.map((entry) => entry.id)),
		token: new Set(document.tokens.map((entry) => entry.id)),
		component: new Set(document.components.map((entry) => entry.id)),
		material: new Set(document.materials.map((entry) => entry.id)),
		prototype: new Set(document.prototype ? [document.prototype.id] : [])
	};
	for (const relation of document.relations) {
		if (relation.provenanceId && !provenanceIds.has(relation.provenanceId)) return err(`Relation "${relation.id}" references unknown provenance "${relation.provenanceId}".`);
		if (!hasEntity(entityIds, relation, "from")) return err(`Relation "${relation.id}" references unknown ${relation.from.kind} "${relation.from.id}".`);
		if (!hasEntity(entityIds, relation, "to")) return err(`Relation "${relation.id}" references unknown ${relation.to.kind} "${relation.to.id}".`);
	}
	return ok$1({ document });
}
function hasEntity(entityIds, relation, endpoint) {
	const reference = relation[endpoint];
	return entityIds[reference.kind]?.has(reference.id) ?? false;
}
/** Deterministic migration boundary for old IR and generators that only declared component.tokenIds. */
function materializeTokenUsageGraph(input) {
	const relations = [...input.relations];
	const relationKeys = new Set(relations.map((relation) => `${relation.kind}:${relation.from.id}:${relation.to.id}`));
	for (const component of input.components) for (const tokenId of component.tokenIds) {
		const key = `component-uses-token:${component.id}:${tokenId}`;
		if (!relationKeys.has(key)) {
			relations.push({
				id: `relation.token-usage.${stableId(component.id)}.${stableId(tokenId)}`,
				kind: "component-uses-token",
				from: {
					kind: "component",
					id: component.id
				},
				to: {
					kind: "token",
					id: tokenId
				}
			});
			relationKeys.add(key);
		}
	}
	relations.sort((a, b) => a.id.localeCompare(b.id));
	return {
		...input,
		relations
	};
}
function stableId(value) {
	let hash = 2166136261;
	for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
	return (hash >>> 0).toString(16).padStart(8, "0");
}
function validateMaterial(material, provenanceIds) {
	const revisionIds = /* @__PURE__ */ new Set();
	const ordinals = /* @__PURE__ */ new Set();
	for (const revision of material.revisions) {
		if (revisionIds.has(revision.id)) return err(`Material "${material.id}" has duplicate revision id "${revision.id}".`);
		revisionIds.add(revision.id);
		if (ordinals.has(revision.ordinal)) return err(`Material "${material.id}" has duplicate revision ordinal ${revision.ordinal}.`);
		ordinals.add(revision.ordinal);
		if (revision.provenanceId && !provenanceIds.has(revision.provenanceId)) return err(`Material revision "${revision.id}" references unknown provenance "${revision.provenanceId}".`);
		if (revision.production && revision.content.sha256 !== revision.production.artifactSha256) return err(`Material revision "${revision.id}" production hash does not match its content.`);
	}
	if (!revisionIds.has(material.currentRevisionId)) return err(`Material "${material.id}" points to unknown current revision "${material.currentRevisionId}".`);
	return ok$1(void 0);
}
//#endregion
//#region src/control-protocol/paid-tool-contract.ts
var CREDENTIAL_VALUE = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i;
var safeText$2 = string().refine((value) => !CREDENTIAL_VALUE.test(value), "Credential-shaped values are not accepted.");
var paidToolIntentMaxLength = 2e4;
var paidToolPromptMaxLength = 2e5;
var paidToolCapabilitySchema = _enum([
	"generate-image",
	"edit-image",
	"cutout"
]);
var moneyEstimateSchema = object({
	currency: string().regex(/^[A-Z]{3}$/),
	amount: number().nonnegative().finite(),
	credits: number().nonnegative().finite().optional()
}).strict();
var paidToolRequestSchema = object({
	capability: paidToolCapabilitySchema,
	providerId: safeText$2.min(1).max(160).optional(),
	model: safeText$2.min(1).max(300).optional(),
	intent: safeText$2.min(1).max(paidToolIntentMaxLength),
	prompt: safeText$2.min(1).max(paidToolPromptMaxLength).optional(),
	inputArtifactIds: array(safeText$2.min(1).max(300)).max(32).default([]),
	budgetCeiling: moneyEstimateSchema,
	approvalPolicy: _enum(["explicit", "auto-within-budget"]).default("auto-within-budget")
}).strict();
object({
	capability: paidToolCapabilitySchema,
	providerId: safeText$2.min(1).max(160),
	model: safeText$2.min(1).max(300),
	available: boolean(),
	estimatedCost: moneyEstimateSchema
}).strict();
function planPaidTool(request, capability, policy, hasExplicitApproval) {
	const base = {
		capability: request.capability,
		providerId: capability?.providerId ?? request.providerId,
		model: capability?.model ?? request.model,
		estimatedCost: capability?.estimatedCost,
		budgetCeiling: request.budgetCeiling,
		approvalPolicy: request.approvalPolicy
	};
	if (!capability?.available) return {
		...base,
		status: "capability-required",
		executable: false,
		reason: "No host executor is available for this capability."
	};
	if (!policy.allowPaid) return {
		...base,
		status: "authorization-required",
		executable: false,
		reason: "Paid actions are disabled by host policy."
	};
	if (!sameCurrency(request.budgetCeiling, capability.estimatedCost) || capability.estimatedCost.amount > request.budgetCeiling.amount || exceedsCredits(capability.estimatedCost, request.budgetCeiling) || policy.maxCost && exceeds(capability.estimatedCost, policy.maxCost)) return {
		...base,
		status: "budget-exceeded",
		executable: false,
		reason: "The host estimate exceeds the approved budget ceiling."
	};
	if (request.approvalPolicy === "explicit" && !hasExplicitApproval) return {
		...base,
		status: "authorization-required",
		executable: false,
		reason: "This request requires explicit approval."
	};
	return {
		...base,
		status: "ready",
		executable: true
	};
}
function sameCurrency(left, right) {
	return left.currency === right.currency;
}
function exceedsCredits(cost, ceiling) {
	return cost.credits !== void 0 && ceiling.credits !== void 0 && cost.credits > ceiling.credits;
}
function exceeds(cost, ceiling) {
	return !sameCurrency(cost, ceiling) || cost.amount > ceiling.amount || exceedsCredits(cost, ceiling);
}
var paidToolReceiptSchema = object({
	receiptId: safeText$2.min(1).max(160),
	requestId: safeText$2.min(1).max(160),
	capability: paidToolCapabilitySchema,
	providerId: safeText$2.min(1).max(160),
	model: safeText$2.min(1).max(300),
	status: _enum([
		"succeeded",
		"failed",
		"cancelled"
	]),
	charged: moneyEstimateSchema,
	outputArtifactIds: array(safeText$2.min(1).max(300)).max(128),
	startedAt: number().int().nonnegative(),
	completedAt: number().int().nonnegative()
}).strict();
//#endregion
//#region src/agent-runtime/run-events.ts
var runEventBaseSchema = object({
	eventId: string().min(1).max(160),
	runId: string().min(1).max(160),
	at: number().int().nonnegative()
});
var eventText = string().min(1).max(2e4);
var materialEvidenceSchema = object({
	id: string(),
	kind: _enum([
		"design-system",
		"prototype-page",
		"cutout-slice",
		"design-markdown"
	]),
	label: string(),
	source: _enum([
		"agent",
		"algorithm",
		"user"
	]),
	evidenceKey: string().optional(),
	revision: string().optional()
}).strict();
var missingRequirementSchema = object({
	kind: _enum([
		"design-system",
		"prototype-page",
		"cutout-slice",
		"design-markdown"
	]),
	count: number().int().nonnegative(),
	label: string()
}).strict();
var agentRunEventSchema = discriminatedUnion("type", [
	runEventBaseSchema.extend({
		type: literal("run-started"),
		mode: _enum(["create", "repair"])
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("intent-recorded"),
		intent: eventText,
		parentEventId: eventText.optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("steer-recorded"),
		instruction: eventText,
		parentEventId: eventText.optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("message-revised"),
		targetEventId: eventText,
		message: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("branch-selected"),
		sourceEventId: eventText,
		responseEventId: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("plan-recorded"),
		planId: eventText,
		summary: eventText,
		stepIds: array(eventText)
	}).strict(),
	runEventBaseSchema.extend({
		type: _enum(["step-started", "step-succeeded"]),
		stepId: eventText,
		label: eventText,
		detail: eventText.optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: _enum(["step-failed", "step-cancelled"]),
		stepId: eventText,
		label: eventText,
		detail: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("tool-started"),
		toolCallId: eventText,
		tool: eventText,
		label: eventText,
		stepId: eventText.optional(),
		model: object({
			providerId: eventText,
			model: eventText
		}).strict().optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("tool-approval-requested"),
		toolCallId: eventText,
		requestId: eventText,
		tool: eventText,
		label: eventText,
		stepId: eventText.optional(),
		model: object({
			providerId: eventText,
			model: eventText
		}).strict().optional(),
		estimatedCost: moneyEstimateSchema,
		budgetCeiling: moneyEstimateSchema,
		approvalPolicy: _enum(["explicit", "auto-within-budget"]),
		reason: eventText,
		/** True only when a human must approve before the tool can run. Optional so previously persisted events still parse. */
		pendingApproval: boolean().optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: _enum(["tool-approved", "tool-denied"]),
		toolCallId: eventText,
		requestId: eventText,
		reason: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("tool-retry-linked"),
		toolCallId: eventText,
		previousRequestId: eventText,
		requestId: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("tool-receipt-recorded"),
		toolCallId: eventText,
		receipt: paidToolReceiptSchema
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("tool-succeeded"),
		toolCallId: eventText,
		tool: eventText,
		label: eventText,
		stepId: eventText.optional(),
		outputRefs: array(eventText),
		receipt: paidToolReceiptSchema.optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: _enum(["tool-failed", "tool-cancelled"]),
		toolCallId: eventText,
		tool: eventText,
		label: eventText,
		stepId: eventText.optional(),
		detail: eventText,
		receipt: paidToolReceiptSchema.optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("material-recorded"),
		material: materialEvidenceSchema
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("capability-fallback"),
		capability: eventText,
		detail: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("outcome-evaluated"),
		status: _enum(["satisfied", "needs-repair"]),
		missing: array(missingRequirementSchema)
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("run-cancelled"),
		reason: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("agent-message"),
		message: eventText,
		responseToEventId: eventText.optional(),
		action: object({
			type: literal("proceed-anyway"),
			label: eventText,
			brief: eventText
		}).strict().optional()
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("human-loop-asked"),
		askId: eventText,
		question: eventText,
		choices: array(prototypeHumanLoopChoiceSchema).min(2).max(4),
		defaultChoiceId: eventText
	}).strict(),
	runEventBaseSchema.extend({
		type: literal("human-loop-answered"),
		askId: eventText
	}).strict()
]);
var agentRunEventStoreSchema = object({
	version: literal("agent-run-events.v1"),
	activeRunId: string().nullable(),
	events: array(agentRunEventSchema),
	activeRun: unknown().nullable()
}).strict().transform((store) => replayRunEvents(store.events));
function createRunEventStore() {
	return {
		version: "agent-run-events.v1",
		activeRunId: null,
		events: [],
		activeRun: null
	};
}
function replayRunEvents(events) {
	return events.reduce(appendRunEvent, createRunEventStore());
}
/** Resolve explicit response links first, then infer the nearest preceding
* user turn for legacy linear transcripts. */
function resolveAgentResponseSource(events, response) {
	const responseIndex = events.findIndex((event) => event.eventId === response.eventId);
	if (responseIndex < 0) return null;
	if (response.responseToEventId) {
		const explicit = events.find((event, index) => index < responseIndex && event.eventId === response.responseToEventId && (event.type === "intent-recorded" || event.type === "steer-recorded"));
		if (explicit) return explicit;
	}
	for (let index = responseIndex - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === "intent-recorded" || event?.type === "steer-recorded") return event;
	}
	return null;
}
/** Group immutable sibling responses and replay the latest valid explicit
* selection. With no selection event, the latest response is the legacy
* linear fallback. */
function projectAgentResponseBranches(events) {
	const users = events.filter((event) => event.type === "intent-recorded" || event.type === "steer-recorded");
	const responsesBySource = /* @__PURE__ */ new Map();
	for (const event of events) {
		if (event.type !== "agent-message") continue;
		const source = resolveAgentResponseSource(events, event);
		if (!source) continue;
		const siblings = responsesBySource.get(source.eventId) ?? [];
		siblings.push(event);
		responsesBySource.set(source.eventId, siblings);
	}
	const selectionBySource = /* @__PURE__ */ new Map();
	for (const event of events) {
		if (event.type !== "branch-selected") continue;
		if (responsesBySource.get(event.sourceEventId)?.some((response) => response.eventId === event.responseEventId)) selectionBySource.set(event.sourceEventId, event.responseEventId);
	}
	return users.flatMap((source) => {
		const responses = responsesBySource.get(source.eventId) ?? [];
		if (responses.length === 0) return [];
		const selectedId = selectionBySource.get(source.eventId);
		const selectedIndex = Math.max(0, selectedId ? responses.findIndex((response) => response.eventId === selectedId) : responses.length - 1);
		return [{
			source,
			responses,
			selectedResponse: responses[selectedIndex],
			selectedIndex
		}];
	});
}
/**
* Pure append/replay reducer. It never invokes tools or reads external state.
* Event payloads intentionally expose observable facts only, never hidden
* reasoning or chain-of-thought.
*/
function appendRunEvent(store, event) {
	if (store.events.some((item) => item.eventId === event.eventId)) return store;
	if (event.type === "run-started") {
		if (event.runId === store.activeRunId) return store;
		const activeRun = createRunProjection(event);
		return {
			...store,
			activeRunId: event.runId,
			events: [...store.events, event],
			activeRun
		};
	}
	if (event.type === "branch-selected") {
		if (!projectAgentResponseBranches(store.events).find((item) => item.source.eventId === event.sourceEventId && item.responses.some((response) => response.eventId === event.responseEventId))) return store;
		return {
			...store,
			events: [...store.events, event]
		};
	}
	if (event.runId !== store.activeRunId || !store.activeRun) return store;
	if (store.activeRun.status === "cancelled") return store;
	if (!hasValidLifecyclePredecessor(store.activeRun, event)) return store;
	return {
		...store,
		events: [...store.events, event],
		activeRun: reduceActiveRun(store.activeRun, event)
	};
}
function hasValidLifecyclePredecessor(run, event) {
	if (event.type === "tool-succeeded" || event.type === "tool-failed" || event.type === "tool-cancelled") return run.tools[event.toolCallId]?.status === "running";
	if (event.type === "tool-approved" || event.type === "tool-denied" || event.type === "tool-retry-linked" || event.type === "tool-receipt-recorded") return Boolean(run.tools[event.toolCallId]);
	if (event.type === "step-succeeded" || event.type === "step-failed" || event.type === "step-cancelled") return run.steps[event.stepId]?.status === "running";
	if (event.type === "human-loop-asked") return run.humanLoopAsk === null;
	if (event.type === "human-loop-answered") return run.humanLoopAsk?.askId === event.askId;
	return true;
}
function createRunEvent(runId, event, options = {}) {
	return {
		...event,
		eventId: options.eventId ?? crypto.randomUUID(),
		runId,
		at: options.at ?? Date.now()
	};
}
function createRunProjection(event) {
	return {
		runId: event.runId,
		mode: event.mode,
		startedAt: event.at,
		status: "running",
		intent: null,
		plan: null,
		steps: {},
		tools: {},
		materials: [],
		outcome: null,
		cancelledReason: null,
		humanLoopAsk: null
	};
}
function reduceActiveRun(run, event) {
	switch (event.type) {
		case "intent-recorded": return {
			...run,
			intent: event.intent
		};
		case "steer-recorded":
		case "message-revised":
		case "branch-selected": return run;
		case "plan-recorded": return {
			...run,
			plan: {
				id: event.planId,
				summary: event.summary,
				stepIds: event.stepIds
			}
		};
		case "step-started":
		case "step-succeeded":
		case "step-failed":
		case "step-cancelled": return {
			...run,
			steps: {
				...run.steps,
				[event.stepId]: {
					id: event.stepId,
					label: event.label,
					detail: event.detail,
					status: lifecycleStatus(event.type)
				}
			}
		};
		case "tool-started": return {
			...run,
			tools: {
				...run.tools,
				[event.toolCallId]: {
					id: event.toolCallId,
					tool: event.tool,
					label: event.label,
					stepId: event.stepId,
					model: event.model,
					status: "running",
					outputRefs: []
				}
			}
		};
		case "tool-approval-requested": return {
			...run,
			tools: {
				...run.tools,
				[event.toolCallId]: {
					id: event.toolCallId,
					tool: event.tool,
					label: event.label,
					stepId: event.stepId,
					model: event.model,
					status: "running",
					outputRefs: [],
					requestId: event.requestId,
					estimatedCost: event.estimatedCost,
					budgetCeiling: event.budgetCeiling,
					approvalPolicy: event.approvalPolicy,
					approvalReason: event.reason,
					approvalStatus: "required"
				}
			}
		};
		case "tool-approved":
		case "tool-denied": {
			const existing = run.tools[event.toolCallId];
			return {
				...run,
				tools: {
					...run.tools,
					[event.toolCallId]: {
						...existing,
						approvalStatus: event.type === "tool-approved" ? "approved" : "denied",
						approvalReason: event.reason,
						detail: event.type === "tool-denied" ? event.reason : existing.detail
					}
				}
			};
		}
		case "tool-retry-linked": {
			const existing = run.tools[event.toolCallId];
			return {
				...run,
				tools: {
					...run.tools,
					[event.toolCallId]: {
						...existing,
						requestId: event.requestId,
						previousRequestId: event.previousRequestId,
						approvalStatus: existing.approvalPolicy === "explicit" ? "required" : existing.approvalStatus
					}
				}
			};
		}
		case "tool-receipt-recorded": {
			const existing = run.tools[event.toolCallId];
			return {
				...run,
				tools: {
					...run.tools,
					[event.toolCallId]: {
						...existing,
						receipt: event.receipt
					}
				}
			};
		}
		case "tool-succeeded":
		case "tool-failed":
		case "tool-cancelled": {
			const existing = run.tools[event.toolCallId];
			return {
				...run,
				tools: {
					...run.tools,
					[event.toolCallId]: {
						id: event.toolCallId,
						tool: event.tool,
						label: event.label,
						stepId: event.stepId ?? existing?.stepId,
						model: existing?.model,
						status: lifecycleStatus(event.type),
						detail: event.type === "tool-succeeded" ? void 0 : event.detail,
						outputRefs: event.type === "tool-succeeded" ? event.outputRefs : [],
						requestId: existing?.requestId,
						previousRequestId: existing?.previousRequestId,
						estimatedCost: existing?.estimatedCost,
						budgetCeiling: existing?.budgetCeiling,
						approvalPolicy: existing?.approvalPolicy,
						approvalReason: existing?.approvalReason,
						approvalStatus: existing?.approvalStatus,
						receipt: event.receipt ?? existing?.receipt
					}
				}
			};
		}
		case "material-recorded": return {
			...run,
			materials: run.materials.some((item) => item.id === event.material.id) ? run.materials.map((item) => item.id === event.material.id ? event.material : item) : [...run.materials, event.material]
		};
		case "capability-fallback":
		case "agent-message": return run;
		case "outcome-evaluated": return {
			...run,
			status: event.status === "satisfied" ? "ready" : "needs-repair",
			outcome: {
				status: event.status,
				missing: event.missing
			}
		};
		case "run-cancelled": return {
			...run,
			status: "cancelled",
			cancelledReason: event.reason,
			humanLoopAsk: null
		};
		case "human-loop-asked": return run.humanLoopAsk === null ? {
			...run,
			humanLoopAsk: {
				askId: event.askId,
				question: event.question,
				choices: event.choices,
				defaultChoiceId: event.defaultChoiceId
			}
		} : run;
		case "human-loop-answered": return run.humanLoopAsk?.askId === event.askId ? {
			...run,
			humanLoopAsk: null
		} : run;
	}
}
function lifecycleStatus(type) {
	if (type.endsWith("-started")) return "running";
	if (type.endsWith("-succeeded")) return "succeeded";
	if (type.endsWith("-failed")) return "failed";
	return "cancelled";
}
//#endregion
//#region src/brand-kit/compiler.ts
/**
* Deterministic, in-memory Brand/VI Kit v1 compiler.
*
* This is deliberately a compiler for explicit, reviewable claims. It does
* not inspect pixels, infer a logo, discover a font license, or invent a
* photography direction. Every published statement must point at immutable
* Design IR content and at a provenance event that cites that content's source.
*/
var idSchema$1 = string().min(1).max(160);
var sha256Schema$5 = string().regex(/^[a-f0-9]{64}$/i);
var cssNameSchema$1 = string().regex(/^[a-z][a-z0-9-]*$/, "CSS names must be lowercase kebab-case.");
var hexColorSchema = string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Colors must be explicit hexadecimal values.");
/** A content-addressed, licensed fact from the canonical DesignDocument. */
var brandEvidenceReferenceSchema = object({
	sourceId: idSchema$1,
	contentId: idSchema$1,
	provenanceId: idSchema$1
}).strict();
var brandLogoSchema = object({ variants: array(object({
	id: idSchema$1,
	label: string().min(1).max(200),
	kind: _enum([
		"primary",
		"mark",
		"wordmark",
		"monochrome"
	]),
	evidence: brandEvidenceReferenceSchema
}).strict()).min(1) }).strict();
var brandClearspaceSchema = object({
	rule: string().min(1).max(2e3),
	evidence: brandEvidenceReferenceSchema
}).strict();
var brandMinimumSizeSchema = object({
	logoId: idSchema$1,
	width: number().positive(),
	height: number().positive().optional(),
	unit: _enum([
		"px",
		"pt",
		"mm"
	]),
	evidence: brandEvidenceReferenceSchema
}).strict();
var brandColorSchema = object({
	id: idSchema$1,
	name: string().min(1).max(200),
	cssName: cssNameSchema$1,
	value: hexColorSchema,
	evidence: brandEvidenceReferenceSchema
}).strict();
var brandTypefaceSchema = object({
	id: idSchema$1,
	role: _enum([
		"display",
		"body",
		"mono",
		"accent"
	]),
	family: string().min(1).max(300),
	evidence: brandEvidenceReferenceSchema
}).strict();
var brandGuidanceSchema = object({
	guidance: string().min(1).max(1e4),
	evidence: brandEvidenceReferenceSchema
}).strict();
var brandAssetRecipeSchema = object({
	id: idSchema$1,
	name: string().min(1).max(200),
	kind: _enum([
		"social-image",
		"presentation",
		"web-banner",
		"app-icon",
		"favicon",
		"other"
	]),
	instructions: string().min(1).max(1e4),
	evidence: brandEvidenceReferenceSchema
}).strict();
var brandKitInputSchema = object({
	document: designDocumentSchema,
	brand: object({
		brandId: idSchema$1,
		logo: brandLogoSchema,
		clearspace: brandClearspaceSchema,
		minSize: array(brandMinimumSizeSchema).min(1),
		colors: array(brandColorSchema).min(1),
		type: array(brandTypefaceSchema).min(1),
		icon: brandGuidanceSchema,
		photo: brandGuidanceSchema,
		voice: brandGuidanceSchema,
		assetRecipes: array(brandAssetRecipeSchema).min(1)
	}).strict()
}).strict();
var brandKitProvenanceSchema = object({
	compiler: literal("cutout.brand-kit.v1"),
	documentId: idSchema$1,
	revisionId: idSchema$1,
	brandId: idSchema$1,
	sourceIds: array(idSchema$1),
	contentIds: array(idSchema$1),
	contentSha256: array(sha256Schema$5),
	provenanceIds: array(idSchema$1)
}).strict();
var brandKitFileSchema = object({
	path: _enum([
		"BRAND.md",
		"brand.tokens.json",
		"brand.css",
		"brand.manifest.json"
	]),
	content: string(),
	sha256: sha256Schema$5,
	sourceFingerprint: sha256Schema$5,
	provenance: brandKitProvenanceSchema
}).strict();
var brandKitSchema = object({
	version: literal("brand-kit.v1"),
	source: object({
		documentId: idSchema$1,
		revisionId: idSchema$1,
		brandId: idSchema$1,
		documentFingerprint: sha256Schema$5,
		definitionFingerprint: sha256Schema$5
	}).strict(),
	files: array(brandKitFileSchema)
}).strict();
/** Compile an auditable Brand/VI Kit without network access, model calls, or filesystem writes. */
async function compileBrandKit(input) {
	const parsed = brandKitInputSchema.parse(input);
	const documentValidation = validateDesignDocument(parsed.document);
	if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`);
	const brand = resolveBrandDefinition(parsed.document, parsed.brand);
	const documentFingerprint = await fingerprint(parsed.document);
	const definitionFingerprint = await fingerprint(normalizeDefinition(parsed.brand));
	const source = {
		documentId: parsed.document.meta.id,
		revisionId: parsed.document.revision.id,
		brandId: brand.brandId,
		documentFingerprint,
		definitionFingerprint
	};
	const provenance = buildProvenance(parsed.document, brand);
	const sourceFiles = [
		["BRAND.md", renderBrandMarkdown(brand, source)],
		["brand.tokens.json", renderBrandTokens(brand)],
		["brand.css", renderBrandCss(brand)]
	];
	const filesWithoutManifest = await Promise.all(sourceFiles.map(async ([path, content]) => ({
		path,
		content,
		sha256: await sha256Text$3(content),
		sourceFingerprint: documentFingerprint,
		provenance
	})));
	const manifestContent = renderManifest$1(source, filesWithoutManifest);
	const manifest = {
		path: "brand.manifest.json",
		content: manifestContent,
		sha256: await sha256Text$3(manifestContent),
		sourceFingerprint: documentFingerprint,
		provenance
	};
	return brandKitSchema.parse({
		version: "brand-kit.v1",
		source,
		files: [...filesWithoutManifest, manifest].sort((left, right) => compareText$3(left.path, right.path))
	});
}
function resolveBrandDefinition(document, definition) {
	const declaredBrand = document.brands.find((brand) => brand.id === definition.brandId);
	if (!declaredBrand) throw new Error(`Brand Kit references unknown brand "${definition.brandId}".`);
	if (declaredBrand.status !== "active") throw new Error(`Brand Kit requires active brand "${definition.brandId}".`);
	const logoIds = /* @__PURE__ */ new Set();
	const logos = definition.logo.variants.map((logo) => {
		assertUnique$1(logoIds, logo.id, "logo id");
		return {
			...logo,
			evidence: resolveEvidence(document, logo.evidence, `Logo "${logo.id}"`, true)
		};
	}).sort(compareById);
	const colorNames = /* @__PURE__ */ new Set();
	const colorIds = /* @__PURE__ */ new Set();
	const colors = definition.colors.map((color) => {
		assertUnique$1(colorIds, color.id, "color id");
		assertUnique$1(colorNames, color.cssName, "color CSS name");
		return {
			...color,
			evidence: resolveEvidence(document, color.evidence, `Color "${color.id}"`)
		};
	}).sort(compareColors);
	const typeIds = /* @__PURE__ */ new Set();
	const typeRoles = /* @__PURE__ */ new Set();
	const type = definition.type.map((face) => {
		assertUnique$1(typeIds, face.id, "typeface id");
		assertUnique$1(typeRoles, face.role, "typeface role");
		return {
			...face,
			evidence: resolveEvidence(document, face.evidence, `Typeface "${face.id}"`, true)
		};
	}).sort(compareTypefaces);
	const minSize = definition.minSize.map((entry) => {
		if (!logoIds.has(entry.logoId)) throw new Error(`Minimum size references unknown logo "${entry.logoId}".`);
		return {
			...entry,
			evidence: resolveEvidence(document, entry.evidence, `Minimum size for "${entry.logoId}"`)
		};
	}).sort(compareMinSizes);
	const sizeKeys = /* @__PURE__ */ new Set();
	for (const entry of minSize) assertUnique$1(sizeKeys, `${entry.logoId}:${entry.unit}`, "minimum size rule");
	const recipeIds = /* @__PURE__ */ new Set();
	const assetRecipes = definition.assetRecipes.map((recipe) => {
		assertUnique$1(recipeIds, recipe.id, "asset recipe id");
		return {
			...recipe,
			evidence: resolveEvidence(document, recipe.evidence, `Asset recipe "${recipe.id}"`)
		};
	}).sort(compareById);
	return {
		brandName: declaredBrand.name,
		brandId: declaredBrand.id,
		logo: logos,
		clearspace: {
			rule: definition.clearspace.rule,
			evidence: resolveEvidence(document, definition.clearspace.evidence, "Clearspace rule")
		},
		minSize,
		colors,
		type,
		icon: {
			guidance: definition.icon.guidance,
			evidence: resolveEvidence(document, definition.icon.evidence, "Icon guidance")
		},
		photo: {
			guidance: definition.photo.guidance,
			evidence: resolveEvidence(document, definition.photo.evidence, "Photography guidance")
		},
		voice: {
			guidance: definition.voice.guidance,
			evidence: resolveEvidence(document, definition.voice.evidence, "Voice guidance")
		},
		assetRecipes
	};
}
function resolveEvidence(document, reference, label, requireBrandAsset = false) {
	const source = document.sources.find((entry) => entry.id === reference.sourceId);
	if (!source) throw new Error(`${label} references unknown source "${reference.sourceId}".`);
	if (requireBrandAsset && source.role !== "brand-asset") throw new Error(`${label} must cite a source with role "brand-asset".`);
	if (source.license.kind === "unknown") throw new Error(`${label} references source "${source.id}" with unknown license.`);
	const content = source.content.find((entry) => entry.id === reference.contentId);
	if (!content) throw new Error(`${label} references content "${reference.contentId}" missing from source "${source.id}".`);
	if (!content.sha256) throw new Error(`${label} references content "${content.id}" without a SHA-256 digest.`);
	const provenance = document.provenance.find((entry) => entry.id === reference.provenanceId);
	if (!provenance) throw new Error(`${label} references unknown provenance "${reference.provenanceId}".`);
	if (!provenance.sourceIds.includes(source.id)) throw new Error(`${label} provenance "${provenance.id}" does not cite source "${source.id}".`);
	return {
		reference,
		sourceTitle: source.title,
		license: source.license,
		content
	};
}
function buildProvenance(document, brand) {
	const evidence = allEvidence(brand);
	return {
		compiler: "cutout.brand-kit.v1",
		documentId: document.meta.id,
		revisionId: document.revision.id,
		brandId: brand.brandId,
		sourceIds: uniqueSorted$2(evidence.map((entry) => entry.reference.sourceId)),
		contentIds: uniqueSorted$2(evidence.map((entry) => entry.reference.contentId)),
		contentSha256: uniqueSorted$2(evidence.map((entry) => {
			if (!entry.content.sha256) throw new Error(`Evidence content "${entry.content.id}" has no SHA-256 digest.`);
			return entry.content.sha256;
		})),
		provenanceIds: uniqueSorted$2(evidence.map((entry) => entry.reference.provenanceId))
	};
}
function allEvidence(brand) {
	return [
		...brand.logo.map((entry) => entry.evidence),
		brand.clearspace.evidence,
		...brand.minSize.map((entry) => entry.evidence),
		...brand.colors.map((entry) => entry.evidence),
		...brand.type.map((entry) => entry.evidence),
		brand.icon.evidence,
		brand.photo.evidence,
		brand.voice.evidence,
		...brand.assetRecipes.map((entry) => entry.evidence)
	];
}
function normalizeDefinition(definition) {
	return {
		...definition,
		logo: { variants: [...definition.logo.variants].sort(compareById) },
		minSize: [...definition.minSize].sort(compareMinSizes),
		colors: [...definition.colors].sort(compareColors),
		type: [...definition.type].sort(compareTypefaces),
		assetRecipes: [...definition.assetRecipes].sort(compareById)
	};
}
function renderBrandMarkdown(brand, source) {
	const logoRows = brand.logo.map((entry) => `| \`${escapeMarkdown$2(entry.id)}\` | ${escapeMarkdown$2(entry.kind)} | ${escapeMarkdown$2(entry.label)} | ${renderEvidence(entry.evidence)} |`);
	const sizeRows = brand.minSize.map((entry) => `| \`${escapeMarkdown$2(entry.logoId)}\` | ${formatSize(entry)} | ${renderEvidence(entry.evidence)} |`);
	const colorRows = brand.colors.map((entry) => `| \`${escapeMarkdown$2(entry.cssName)}\` | ${escapeMarkdown$2(entry.name)} | \`${entry.value}\` | ${renderEvidence(entry.evidence)} |`);
	const typeRows = brand.type.map((entry) => `| ${escapeMarkdown$2(entry.role)} | ${escapeMarkdown$2(entry.family)} | ${renderEvidence(entry.evidence)} |`);
	const recipeRows = brand.assetRecipes.map((entry) => `| \`${escapeMarkdown$2(entry.id)}\` | ${escapeMarkdown$2(entry.kind)} | ${escapeMarkdown$2(entry.name)} | ${escapeMarkdown$2(entry.instructions)} | ${renderEvidence(entry.evidence)} |`);
	return [
		`# ${escapeMarkdown$2(brand.brandName)} Brand Kit`,
		"",
		`Source: \`${source.documentId}\` revision \`${source.revisionId}\`.`,
		`Document fingerprint: \`${source.documentFingerprint}\`.`,
		`Definition fingerprint: \`${source.definitionFingerprint}\`.`,
		"",
		"## Logo",
		"",
		"| ID | Kind | Label | Evidence |",
		"| --- | --- | --- | --- |",
		...logoRows,
		"",
		"## Clearspace",
		"",
		brand.clearspace.rule,
		"",
		`Evidence: ${renderEvidence(brand.clearspace.evidence)}.`,
		"",
		"## Minimum Size",
		"",
		"| Logo | Minimum | Evidence |",
		"| --- | --- | --- |",
		...sizeRows,
		"",
		"## Color",
		"",
		"| Token | Name | Value | Evidence |",
		"| --- | --- | --- | --- |",
		...colorRows,
		"",
		"## Typography",
		"",
		"| Role | Family | Evidence |",
		"| --- | --- | --- |",
		...typeRows,
		"",
		"## Iconography",
		"",
		brand.icon.guidance,
		"",
		`Evidence: ${renderEvidence(brand.icon.evidence)}.`,
		"",
		"## Photography",
		"",
		brand.photo.guidance,
		"",
		`Evidence: ${renderEvidence(brand.photo.evidence)}.`,
		"",
		"## Voice",
		"",
		brand.voice.guidance,
		"",
		`Evidence: ${renderEvidence(brand.voice.evidence)}.`,
		"",
		"## Asset Recipes",
		"",
		"| ID | Kind | Name | Instructions | Evidence |",
		"| --- | --- | --- | --- | --- |",
		...recipeRows,
		""
	].join("\n");
}
function renderBrandTokens(brand) {
	const colors = {};
	for (const color of brand.colors) colors[color.cssName] = {
		"$type": "color",
		"$value": color.value,
		"$extensions": {
			"cutout.colorId": color.id,
			"cutout.evidence": color.evidence.reference
		}
	};
	return `${JSON.stringify({ color: colors }, null, 2)}\n`;
}
function renderBrandCss(brand) {
	return `:root {\n${brand.colors.map((color) => `  --cutout-brand-color-${color.cssName}: ${color.value};`).join("\n")}\n}\n`;
}
function renderManifest$1(source, files) {
	return `${JSON.stringify({
		version: "brand-kit.v1",
		source,
		files: [...files].sort((left, right) => compareText$3(left.path, right.path)).map((file) => ({
			path: file.path,
			sha256: file.sha256,
			sourceFingerprint: file.sourceFingerprint,
			provenance: file.provenance
		}))
	}, null, 2)}\n`;
}
function renderEvidence(evidence) {
	return `source \`${escapeMarkdown$2(evidence.reference.sourceId)}\`, content \`${escapeMarkdown$2(evidence.reference.contentId)}\`, provenance \`${escapeMarkdown$2(evidence.reference.provenanceId)}\``;
}
function formatSize(entry) {
	return entry.height === void 0 ? `${entry.width}${entry.unit}` : `${entry.width}${entry.unit} × ${entry.height}${entry.unit}`;
}
function assertUnique$1(values, value, label) {
	if (values.has(value)) throw new Error(`Duplicate ${label} "${value}".`);
	values.add(value);
}
function compareById(left, right) {
	return compareText$3(left.id, right.id);
}
function compareColors(left, right) {
	return compareText$3(`${left.cssName}\u0000${left.id}`, `${right.cssName}\u0000${right.id}`);
}
function compareTypefaces(left, right) {
	return compareText$3(`${left.role}\u0000${left.id}`, `${right.role}\u0000${right.id}`);
}
function compareMinSizes(left, right) {
	return compareText$3(`${left.logoId}\u0000${left.unit}\u0000${left.width}\u0000${left.height ?? ""}`, `${right.logoId}\u0000${right.unit}\u0000${right.width}\u0000${right.height ?? ""}`);
}
function uniqueSorted$2(values) {
	return [...new Set(values)].sort(compareText$3);
}
function compareText$3(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
function escapeMarkdown$2(value) {
	return value.replaceAll("`", "\\`").replaceAll("|", "\\|").replaceAll("\n", " ");
}
async function sha256Text$3(value) {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region src/brand-kit/vi-catalog.ts
var id$1 = string().regex(/^[a-z][a-z0-9.-]+$/);
var generationMode = _enum([
	"image-generate",
	"image-edit",
	"deterministic-compose",
	"vector",
	"manual-review"
]);
var costClass = _enum([
	"none",
	"low",
	"medium",
	"high"
]);
var brandViCatalogItemSchema = object({
	id: id$1,
	section: string().regex(/^[AB]\d+$/),
	category: string().min(1),
	title: string().min(1),
	stage: _enum([
		"foundation",
		"approved-master",
		"application"
	]),
	deliverableKind: _enum([
		"guideline",
		"master-artwork",
		"layout-template",
		"mockup",
		"production-spec",
		"motion"
	]),
	requiredInputs: array(string().min(1)).min(1),
	dependencies: array(id$1),
	generationModes: array(generationMode).min(1),
	formats: array(string().min(1)).min(1),
	dimensions: array(object({
		name: string().min(1),
		value: string().min(1)
	}).strict()).min(1),
	variants: array(string().min(1)).min(1),
	qualityGates: array(string().min(1)).min(1),
	approval: object({
		required: boolean(),
		role: _enum([
			"brand-owner",
			"design-lead",
			"production-owner"
		])
	}).strict(),
	costClass,
	referenceLocks: array(string().min(1)).min(1),
	promptPolicy: object({
		objective: string().min(1),
		required: array(string().min(1)).min(1),
		forbidden: array(string().min(1)).min(1)
	}).strict()
}).strict();
var brandViCatalogSchema = object({
	version: literal("brand-vi-catalog.v1"),
	items: array(brandViCatalogItemSchema).min(1)
}).strict();
var foundationSections = {
	A1: [
		["a1.logo.standard", "标志标准图形"],
		["a1.logo.ink", "企业标志墨稿"],
		["a1.logo.grid", "标志方格制图"],
		["a1.logo.restrictions", "限定"],
		["a1.logo.clearspace-minimum", "标志预留空间与最小化比例"]
	],
	A2: [
		["a2.type.short-cn-grid", "简称中文字体方格制图"],
		["a2.type.short-en-grid", "简称英文字体方格制图"],
		["a2.type.short-bilingual-grid", "简称中英文字体组合方格制图"],
		["a2.type.full-cn-grid", "全称中文字体方格制图"],
		["a2.type.full-en-grid", "全称英文字体方格制图"],
		["a2.type.full-bilingual-grid", "全称中英文字体组合方格制图"]
	],
	A3: [
		["a3.color.standard", "企业标准色"],
		["a3.color.auxiliary-scale", "辅助色色阶"],
		["a3.color.standard-scale", "标准色色阶"],
		["a3.color.auxiliary", "企业辅助色"],
		["a3.color.misuse", "标准色彩禁用示例"]
	],
	A4: [
		["a4.lockup.vertical-bilingual", "标志与企业中英文字体上下组合"],
		["a4.lockup.misuse", "标志及组合禁用说明"],
		["a4.lockup.horizontal-bilingual", "标志与企业中英文字体左右组合"]
	],
	A5: [["a5.pattern.master", "辅助图形"], ["a5.pattern.usage", "辅助图形使用规范"]]
};
var applicationSections = {
	B1: seeds("b1", [
		"名片",
		"薪资袋",
		"奖杯",
		"信封",
		"备忘录",
		"考勤卡",
		"信纸",
		"工作证",
		"请假单",
		"便签",
		"票据夹",
		"意见箱",
		"文档表头",
		"送货单",
		"纸杯",
		"文件夹",
		"收据",
		"通讯录",
		"合同夹",
		"桌牌",
		"财产编号牌",
		"合同书封面",
		"员工座位标识牌(职位牌)",
		"PPT模板",
		"公文袋",
		"名片盒（夹/台）",
		"车辆出入证",
		"档案盒",
		"及时贴标签",
		"胸卡",
		"档案袋",
		"办公用笔"
	]),
	B2: [
		["b2.social-avatar", "网络社交头像规范"],
		["b2.web-header", "网页眉头规范"],
		["b2.email", "邮件样式规范"],
		["b2.qr-code", "二维码规范"],
		["b2.app-icon", "APP应用ICO图标"],
		["b2.mouse-pad", "鼠标垫"],
		["b2.web-ad", "网页广告规范"]
	],
	B3: seeds("b3", [
		"包装箱样式",
		"包装盒样式",
		"包装纸",
		"胶带",
		"合格证样式",
		"礼盒（年终礼盒）",
		"保修卡封面",
		"产品吊牌样式",
		"说明书规范封面"
	]),
	B4: seeds("b4", [
		"公司旗帜",
		"挂旗",
		"促销彩旗",
		"桌旗"
	]),
	B5: seeds("b5", [
		"贺卡",
		"红包",
		"邀请函",
		"挂历封面版式规范",
		"标识伞"
	]),
	B6: seeds("b6", [
		"管理人员着装（男/女二季）",
		"生产职员制服（男/女二季）",
		"店面职员制服（男/女二季）",
		"警卫职员制服（男/女二季）",
		"保洁职员制服（男/女二季）",
		"运动服（男/女二季）",
		"文化衫 (T恤)",
		"安全帽",
		"公司活动专用帽"
	]),
	B7: seeds("b7", [
		"公务车",
		"面包车",
		"班车",
		"运输货车",
		"三轮车车棚"
	]),
	B8: seeds("b8", [
		"杂志广告封面样式",
		"海报版式规范",
		"公交车体广告规范",
		"擎天柱广告规范",
		"灯箱广告规范",
		"DM版式规范",
		"条幅广告规范",
		"促销帐篷",
		"促销大伞"
	]),
	B9: seeds("b9", [
		"公司文化展板",
		"公司公告栏样式",
		"公司制度展示牌",
		"接待台及背景墙"
	]),
	B10: seeds("b10", [
		"销售店面外观",
		"室内环境",
		"门头设计",
		"店面招聘",
		"导购流程图版式规范",
		"橱窗形象规范",
		"收银台形象规范",
		"店内形象墙",
		"店内展台",
		"货架",
		"货柜",
		"中岛柜",
		"立墙灯箱",
		"垃圾桶"
	]),
	B11: seeds("b11", [
		"企业厂房大门形象",
		"企业厂房外墙形象",
		"生产车间部门标示牌",
		"生产车间平面指示图",
		"车间标语牌",
		"车间工位标识牌",
		"车间生产流程标示牌",
		"物料管理标签",
		"生产车间5S/7S标识牌"
	]),
	B12: seeds("b12", [
		"公司名称标识牌",
		"部门标示牌",
		"玻璃门横贴（防撞条）",
		"楼层标识牌",
		"立地式标识牌",
		"停车场区域指示",
		"欢迎标语牌",
		"禁止停车牌"
	]),
	B13: [
		["b13.mascot.color-master", "吉祥物彩色稿及造型说明"],
		["b13.mascot.turnaround", "吉祥物三视图"],
		["b13.mascot.motion-poses", "吉祥物基本动态造型"],
		["b13.mascot.monochrome", "企业吉祥物造型单色印刷规范"],
		["b13.mascot.usage", "吉祥物应用规范设定"],
		["b13.mascot.3d-render", "吉祥物3D立体效果图"],
		["b13.mascot.animated-motion", "吉祥物动画动态图"]
	]
};
function seeds(prefix, titles) {
	return titles.map((title, index) => [`${prefix}.${String(index + 1).padStart(2, "0")}`, title]);
}
var approvedLogo = "approved:a1.logo.standard";
var approvedColor = "approved:a3.color.standard";
var approvedType = "approved:a2.type.full-bilingual-grid";
var approvedPattern = "approved:a5.pattern.master";
function foundationItem(section, [itemId, title]) {
	const isMaster = [
		"a1.logo.standard",
		"a3.color.standard",
		"a5.pattern.master"
	].includes(itemId);
	const dependencies = foundationDependencies(itemId);
	return {
		id: itemId,
		section,
		category: categoryName(section),
		title,
		stage: isMaster ? "approved-master" : "foundation",
		deliverableKind: isMaster ? "master-artwork" : "guideline",
		requiredInputs: dependencies.length === 0 ? ["brand brief", "licensed reference sources"] : dependencies.map((value) => `approved ${value}`),
		dependencies,
		generationModes: itemId.startsWith("a1.logo") || itemId.startsWith("a4.") || itemId === "a5.pattern.master" ? ["vector", "manual-review"] : ["deterministic-compose", "manual-review"],
		formats: isMaster ? [
			"SVG",
			"PDF",
			"PNG"
		] : ["PDF", "SVG"],
		dimensions: [{
			name: "master",
			value: isMaster ? "vector, viewBox normalized" : "A4 landscape guideline page"
		}],
		variants: itemId === "a1.logo.standard" ? [
			"primary",
			"compact",
			"responsive"
		] : ["print", "screen"],
		qualityGates: [
			"source evidence resolved",
			"geometry/token checks pass",
			"human visual review approved"
		],
		approval: {
			required: true,
			role: "brand-owner"
		},
		costClass: "none",
		referenceLocks: dependencies.length ? dependencies.map((value) => `approved:${value}`) : ["brand-brief", "licensed-reference-only"],
		promptPolicy: {
			objective: `Produce ${title} as a reusable, reviewable brand foundation artifact.`,
			required: ["preserve supplied brand intent", "output editable production geometry or explicit specification"],
			forbidden: [
				"invent unlicensed references",
				"silently alter approved masters",
				"rasterize the only master"
			]
		}
	};
}
function foundationDependencies(itemId) {
	if (itemId === "a1.logo.standard" || itemId === "a3.color.standard") return [];
	if (itemId.startsWith("a1.")) return ["a1.logo.standard"];
	if (itemId.startsWith("a2.")) return ["a1.logo.standard"];
	if (itemId.startsWith("a3.")) return ["a3.color.standard"];
	if (itemId.startsWith("a4.")) return [
		"a1.logo.standard",
		"a2.type.full-bilingual-grid",
		"a3.color.standard"
	];
	if (itemId === "a5.pattern.master") return ["a1.logo.standard", "a3.color.standard"];
	return ["a5.pattern.master"];
}
function applicationItem(section, [itemId, title]) {
	const mascot = section === "B13";
	const motion = itemId === "b13.mascot.animated-motion";
	const dependencies = mascot ? mascotDependencies(itemId) : [
		"a1.logo.standard",
		"a2.type.full-bilingual-grid",
		"a3.color.standard",
		"a5.pattern.master"
	];
	const generationModes = motion ? [
		"image-generate",
		"image-edit",
		"manual-review"
	] : mascot ? [
		"image-generate",
		"image-edit",
		"deterministic-compose",
		"manual-review"
	] : [
		"deterministic-compose",
		"image-edit",
		"manual-review"
	];
	return {
		id: itemId,
		section,
		category: categoryName(section),
		title,
		stage: "application",
		deliverableKind: motion ? "motion" : mascot ? "master-artwork" : title.includes("规范") || title.includes("模板") ? "layout-template" : "mockup",
		requiredInputs: [
			"approved logo master",
			"approved typography lockup",
			"approved color tokens",
			"approved auxiliary pattern",
			"production context or measured template"
		],
		dependencies,
		generationModes,
		formats: motion ? [
			"MP4",
			"WebM",
			"Lottie JSON",
			"GIF"
		] : [
			"editable source",
			"PDF",
			"PNG",
			"production specification"
		],
		dimensions: [{
			name: "production",
			value: "parameterized by approved vendor/template measurements; no guessed dimensions"
		}],
		variants: mascot ? [
			"approved master",
			"monochrome proof",
			"application preview"
		] : [
			"primary",
			"alternate format",
			"production proof"
		],
		qualityGates: [
			"all reference locks resolve to approved revisions",
			"logo clearspace and minimum size pass",
			"color contrast/gamut pass for target medium",
			"copy and dimensions reviewed",
			"visual regression against approved masters"
		],
		approval: {
			required: true,
			role: mascot ? "brand-owner" : "production-owner"
		},
		costClass: motion || itemId === "b13.mascot.3d-render" ? "high" : mascot ? "medium" : "low",
		referenceLocks: [
			approvedLogo,
			approvedType,
			approvedColor,
			approvedPattern,
			...mascot && itemId !== "b13.mascot.color-master" ? ["approved:b13.mascot.color-master"] : []
		],
		promptPolicy: {
			objective: `Apply approved brand masters to ${title}; explore composition and context without redesigning the identity.`,
			required: [
				"condition generation on immutable approved reference assets",
				"preserve exact logo, type, color, pattern and mascot identity",
				"separate presentation mockup from production artwork"
			],
			forbidden: [
				"redraw or mutate approved logo",
				"invent new brand colors or typefaces",
				"replace approved mascot identity",
				"claim guessed dimensions are production-ready"
			]
		}
	};
}
function mascotDependencies(itemId) {
	const base = [
		"a1.logo.standard",
		"a2.type.full-bilingual-grid",
		"a3.color.standard",
		"a5.pattern.master"
	];
	if (itemId === "b13.mascot.color-master") return base;
	if (itemId === "b13.mascot.turnaround") return [...base, "b13.mascot.color-master"];
	if (itemId === "b13.mascot.motion-poses") return [
		...base,
		"b13.mascot.color-master",
		"b13.mascot.turnaround"
	];
	if (itemId === "b13.mascot.monochrome" || itemId === "b13.mascot.usage") return [...base, "b13.mascot.color-master"];
	if (itemId === "b13.mascot.3d-render") return [
		...base,
		"b13.mascot.color-master",
		"b13.mascot.turnaround"
	];
	return [
		...base,
		"b13.mascot.color-master",
		"b13.mascot.turnaround",
		"b13.mascot.motion-poses"
	];
}
function categoryName(section) {
	return {
		A1: "企业标志规范",
		A2: "企业标准字体规范",
		A3: "企业标准色规范",
		A4: "标识组合规范",
		A5: "辅助图形规范",
		B1: "办公形象应用规范",
		B2: "网络媒体应用规范",
		B3: "产品包装应用规范",
		B4: "旗帜规划应用规范",
		B5: "公共关系赠品应用规范",
		B6: "服装服饰应用规范",
		B7: "交通运输工具应用规范",
		B8: "媒体广告应用规范",
		B9: "展览展示应用规范",
		B10: "销售店面应用规范",
		B11: "厂房（生产）车间应用规范",
		B12: "室内外指示应用规范",
		B13: "吉祥物IP形象"
	}[section] ?? section;
}
var allSeeds = [...Object.entries(foundationSections), ...Object.entries(applicationSections)];
allSeeds.flatMap(([, values]) => values.map(([itemId]) => itemId));
brandViCatalogSchema.parse({
	version: "brand-vi-catalog.v1",
	items: allSeeds.flatMap(([section, values]) => values.map((seed) => section.startsWith("A") ? foundationItem(section, seed) : applicationItem(section, seed)))
});
//#endregion
//#region src/coding-runtime/contracts.ts
var CODING_TASK_VERSION = "cutout.coding-task.v1";
var safeText$1 = string().min(1).max(1e5).refine((value) => !/(?:\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i.test(value), "Credential-shaped values are not accepted.");
var codingRelativePathSchema = string().min(1).max(500).refine((value) => {
	if (value.includes("\0") || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) return false;
	return value.replaceAll("\\", "/").split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}, "Expected a controlled relative path.").refine((value) => !/(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i.test(value), "Credential-shaped paths are not accepted.");
var codingTaskSchema = object({
	version: literal(CODING_TASK_VERSION),
	taskId: string().regex(/^coding:[a-z0-9:._-]+$/),
	kind: _enum([
		"execute",
		"review",
		"repair"
	]),
	goal: safeText$1.max(2e4),
	acceptanceCriteria: array(safeText$1.max(4e3)).min(1).max(100),
	repo: object({
		snapshotId: safeText$1.max(160),
		ref: safeText$1.max(300).optional()
	}).strict(),
	inputs: object({
		designDocumentRef: safeText$1.max(300),
		brandKitRefs: array(safeText$1.max(300)).max(100),
		designKitRefs: array(safeText$1.max(300)).max(100),
		prototypeRefs: array(safeText$1.max(300)).max(100),
		imageAssetRefs: array(safeText$1.max(300)).max(1e3)
	}).strict(),
	target: object({
		stack: _enum([
			"next-app-router",
			"vite-react",
			"existing-repository"
		]),
		packageManager: _enum([
			"pnpm",
			"npm",
			"yarn",
			"bun"
		])
	}).strict(),
	constraints: object({
		allowedPaths: array(codingRelativePathSchema).min(1).max(100),
		allowedCommands: array(_enum([
			"typecheck",
			"test",
			"build",
			"lint",
			"visual-test"
		])).max(5)
	}).strict(),
	expectedRevision: number().int().nonnegative(),
	budget: object({
		maxChangedFiles: number().int().min(1).max(2e3),
		maxBytes: number().int().min(1).max(2e7),
		maxDurationMs: number().int().min(1).max(36e5)
	}).strict()
}).strict();
var codingFilePatchSchema = object({
	path: codingRelativePathSchema,
	operation: _enum([
		"create",
		"replace",
		"delete"
	]),
	contents: string().max(2e6).optional(),
	previousSha256: string().regex(/^[a-f0-9]{64}$/).optional()
}).strict().superRefine((patch, context) => {
	if (patch.operation !== "delete" && patch.contents === void 0) context.addIssue({
		code: "custom",
		path: ["contents"],
		message: "File contents are required."
	});
	if (patch.operation === "delete" && patch.contents !== void 0) context.addIssue({
		code: "custom",
		path: ["contents"],
		message: "Delete patches cannot include contents."
	});
});
var codingPatchSchema = object({
	version: literal("cutout.coding-patch.v1"),
	taskId: string().min(1),
	baseSnapshotId: string().min(1),
	files: array(codingFilePatchSchema).min(1).max(2e3),
	rationale: safeText$1.max(2e4),
	provenance: object({
		backend: safeText$1.max(160),
		inputRefs: array(safeText$1.max(300)).max(2e3)
	}).strict()
}).strict();
var evidenceSchema = object({
	name: string().min(1),
	status: _enum([
		"passed",
		"failed",
		"skipped"
	]),
	detail: string().max(1e4).optional()
}).strict();
var codingReceiptSchema = object({
	version: literal("cutout.coding-receipt.v1"),
	receiptId: string().min(1),
	taskId: string().min(1),
	status: _enum([
		"previewed",
		"applied",
		"failed",
		"cancelled"
	]),
	baseSnapshotId: string().min(1),
	resultSnapshotId: string().min(1).optional(),
	changedFiles: array(object({
		path: codingRelativePathSchema,
		sha256: string().regex(/^[a-f0-9]{64}$/).optional(),
		operation: _enum([
			"create",
			"replace",
			"delete"
		])
	}).strict()),
	checks: array(evidenceSchema),
	screenshots: array(object({
		artifactRef: string().min(1),
		viewport: string().min(1),
		sha256: string().regex(/^[a-f0-9]{64}$/)
	}).strict()),
	provenance: object({
		backend: string().min(1),
		inputRefs: array(string()),
		patchSha256: string().regex(/^[a-f0-9]{64}$/)
	}).strict(),
	startedAt: number().int().nonnegative(),
	completedAt: number().int().nonnegative(),
	detail: string().optional()
}).strict();
//#endregion
//#region src/control-protocol/control-protocol.ts
/**
* The intentionally small, transport-neutral control surface for coding agents.
*
* This is a protocol boundary, not a bridge to the UI store. A host may map
* accepted operations to domain services, but this module never reads files,
* provider configuration, or credentials and never invokes a provider.
*/
var CONTROL_PROTOCOL_VERSION = "cutout.control.v1";
var SECRET_VALUE_PATTERN = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i;
var safeControlTextSchema = string().refine((value) => !SECRET_VALUE_PATTERN.test(value), "Credential-shaped values are not accepted by the control protocol.");
var opaqueControlIdSchema = safeControlTextSchema.min(1).max(160);
var relativeScanPathSchema = safeControlTextSchema.min(1).max(500).refine((value) => {
	if (value === ".") return true;
	if (value.includes("\0") || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) return false;
	return value.replaceAll("\\", "/").split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}, "Expected a controlled relative path.").refine((value) => !/(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i.test(value), "Credential-shaped paths are not accepted.");
var sourceCommonSchema = object({
	role: _enum([
		"requirement",
		"reference",
		"constraint",
		"implementation",
		"brand-asset",
		"evidence"
	]),
	license: discriminatedUnion("kind", [
		object({
			kind: literal("spdx"),
			identifier: safeControlTextSchema.min(1).max(200)
		}).strict(),
		object({
			kind: literal("proprietary"),
			holder: safeControlTextSchema.min(1).max(200)
		}).strict(),
		object({ kind: literal("public-domain") }).strict(),
		object({
			kind: literal("unknown"),
			rationale: safeControlTextSchema.min(1).max(1e3)
		}).strict()
	]),
	promptProvenance: safeControlTextSchema.min(1).max(2e4).optional()
}).strict();
/** Descriptors only. The host resolves scans below its controlled project root. */
var sourceIngestOperationSchema = object({
	type: literal("source.ingest"),
	input: discriminatedUnion("type", [
		sourceCommonSchema.extend({
			type: literal("inline-text"),
			sourceKind: _enum([
				"need",
				"story",
				"idea",
				"document",
				"code"
			]),
			title: safeControlTextSchema.min(1).max(200),
			text: safeControlTextSchema.min(1).max(1e6)
		}).strict(),
		sourceCommonSchema.extend({
			type: literal("url-descriptor"),
			url: safeControlTextSchema.min(1).max(4e3).refine((value) => {
				try {
					const url = new URL(value);
					const credentialParameter = [...url.searchParams.keys()].some((key) => /(?:api[-_]?key|secret|token|password|authorization)/i.test(key));
					return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !credentialParameter;
				} catch {
					return false;
				}
			}, "Expected a credential-free HTTP(S) URL."),
			title: safeControlTextSchema.min(1).max(200).optional(),
			capturedMediaType: safeControlTextSchema.min(1).max(200).optional()
		}).strict(),
		sourceCommonSchema.extend({
			type: literal("local-file-scan"),
			path: relativeScanPathSchema.refine((value) => value !== ".", "Expected a file path, not the project root."),
			sourceKind: _enum([
				"document",
				"code",
				"screenshot",
				"photo",
				"video"
			]),
			title: safeControlTextSchema.min(1).max(200).optional(),
			mediaType: safeControlTextSchema.min(1).max(200).optional()
		}).strict(),
		sourceCommonSchema.extend({
			type: literal("repository-scan"),
			root: relativeScanPathSchema.default("."),
			label: safeControlTextSchema.min(1).max(200).optional()
		}).strict()
	])
}).strict();
var materialKindSchema = _enum([
	"design-system",
	"prototype-page",
	"cutout-slice",
	"design-markdown"
]);
object({
	id: opaqueControlIdSchema,
	grantedAt: number().int().nonnegative()
}).strict();
var projectContextOperationSchema = object({
	type: literal("project.context"),
	include: array(_enum([
		"summary",
		"outcome",
		"run-events"
	])).max(3).optional()
}).strict();
var designPatchOperationSchema = object({
	type: literal("design.patch"),
	patches: array(object({
		op: _enum(["replace", "append"]),
		path: _enum(["/designMarkdown", "/project/name"]),
		value: safeControlTextSchema.min(1).max(2e5)
	}).strict()).min(1).max(100)
}).strict();
var tokensPatchOperationSchema = object({
	type: literal("tokens.patch"),
	changes: array(object({
		token: string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
		value: union([safeControlTextSchema.min(1).max(4e3), number().finite()])
	}).strict()).min(1).max(200)
}).strict();
var materialListOperationSchema = object({
	type: literal("material.list"),
	filter: object({
		kind: materialKindSchema.optional(),
		pageId: opaqueControlIdSchema.optional()
	}).strict().optional()
}).strict();
var runStartOperationSchema = object({
	type: literal("run.start"),
	runId: opaqueControlIdSchema,
	mode: _enum(["create", "repair"]),
	intent: safeControlTextSchema.min(1).max(2e4)
}).strict();
var runGetOperationSchema = object({
	type: literal("run.get"),
	runId: opaqueControlIdSchema
}).strict();
var runCancelOperationSchema = object({
	type: literal("run.cancel"),
	runId: opaqueControlIdSchema,
	reason: safeControlTextSchema.min(1).max(1e3).optional()
}).strict();
var runEventsOperationSchema = object({
	type: literal("run.events"),
	runId: opaqueControlIdSchema,
	afterEventId: opaqueControlIdSchema.optional(),
	limit: number().int().min(1).max(1e3).optional()
}).strict();
var validateOperationSchema = object({
	type: literal("validate"),
	scope: array(_enum([
		"design",
		"tokens",
		"materials",
		"outcome"
	])).min(1).max(4)
}).strict();
var exportDesignKitOperationSchema = object({
	type: literal("export.design-kit"),
	format: _enum([
		"directory",
		"json",
		"css"
	]),
	include: array(_enum([
		"design-markdown",
		"tokens",
		"assets"
	])).min(1).max(3).optional()
}).strict();
/**
* Brand facts are intentionally part of the request, rather than being
* inferred from a project name, pixels, or a model response. The runtime
* additionally proves that input.document is byte-equivalent to the current
* project DesignDocument before it writes anything.
*/
var exportBrandKitOperationSchema = object({
	type: literal("export.brand-kit"),
	input: brandKitInputSchema
}).strict();
/**
* The host compiles the StarterPlan from its verified Design IR. A caller may
* select a published framework, but never supplies an output directory,
* source files, shell command, package manager option, or arbitrary plan.
*/
var exportStarterOperationSchema = object({
	type: literal("export.starter"),
	framework: _enum([
		"next-app-router",
		"vite-react",
		"nuxt",
		"tanstack-start"
	])
}).strict();
var paidToolInvokeOperationSchema = object({
	type: literal("tool.invoke"),
	tool: paidToolRequestSchema
}).strict();
var codingOperation = (kind) => object({
	type: literal(`coding.${kind}`),
	task: codingTaskSchema
}).strict().superRefine((operation, context) => {
	if (operation.task.kind !== kind) context.addIssue({
		code: "custom",
		path: ["task", "kind"],
		message: `Expected task kind "${kind}".`
	});
});
var controlOperationSchema = discriminatedUnion("type", [
	projectContextOperationSchema,
	designPatchOperationSchema,
	tokensPatchOperationSchema,
	sourceIngestOperationSchema,
	materialListOperationSchema,
	runStartOperationSchema,
	runGetOperationSchema,
	runCancelOperationSchema,
	runEventsOperationSchema,
	validateOperationSchema,
	exportDesignKitOperationSchema,
	exportBrandKitOperationSchema,
	exportStarterOperationSchema,
	codingOperation("execute"),
	codingOperation("review"),
	codingOperation("repair"),
	paidToolInvokeOperationSchema
]);
var controlRequestSchema = object({
	protocol: literal(CONTROL_PROTOCOL_VERSION),
	requestId: opaqueControlIdSchema,
	expectedRevision: number().int().nonnegative(),
	mode: _enum(["dry-run", "apply"]),
	operation: controlOperationSchema
}).strict();
var controlResponseErrorSchema = object({
	code: _enum([
		"revision-conflict",
		"policy-denied",
		"approval-required",
		"invalid-request",
		"authorization-required",
		"capability-required",
		"budget-exceeded"
	]),
	message: string().min(1).max(4e3)
}).strict();
/** Schema for a serializable control response. `result` is host-owned data and
* must be passed through `redactControlValue` before it enters this envelope. */
var controlResponseSchema = object({
	protocol: literal(CONTROL_PROTOCOL_VERSION),
	requestId: opaqueControlIdSchema,
	status: _enum([
		"ok",
		"conflict",
		"denied",
		"invalid"
	]),
	revision: number().int().nonnegative(),
	dryRun: boolean(),
	idempotent: boolean(),
	result: unknown().optional(),
	error: controlResponseErrorSchema.optional()
}).strict();
/**
* Guard a host-declared side effect. The agent cannot make an action paid or
* external merely by adding fields to JSON: the host owns this declaration.
*/
function guardControlAction(authorization, options) {
	const { effects, policy } = options;
	if (effects.paid && !policy.allowPaid) return {
		allowed: false,
		reason: "paid-actions-disabled"
	};
	if (effects.external && !policy.allowExternal) return {
		allowed: false,
		reason: "external-actions-disabled"
	};
	if (effects.paid && policy.requireApprovalForPaid || effects.external && policy.requireApprovalForExternal) {
		if (!authorization.approval) return {
			allowed: false,
			reason: "approval-required"
		};
	}
	return { allowed: true };
}
/**
* Pure pre-dispatch gate for a parsed request. It handles optimistic revision
* checks, replay protection and conservative effect policy. A host dispatches
* only when `decision === 'dispatch'`; dry runs never enter the ledger.
*/
function applyControlRequest(ledger, request, options = {}) {
	const previous = ledger.completed[request.requestId];
	if (previous) return preparation("duplicate", ledger, {
		...previous,
		idempotent: true
	});
	if (request.expectedRevision !== ledger.revision) return preparation("conflict", ledger, response$1(request, ledger.revision, "conflict", {
		code: "revision-conflict",
		message: `Expected revision ${request.expectedRevision}, current revision is ${ledger.revision}.`
	}));
	const effects = mergeEffects(defaultEffectsFor(request.operation), options.effects);
	if (request.mode === "dry-run") return preparation("dry-run", ledger, {
		...response$1(request, ledger.revision, "ok"),
		dryRun: true,
		result: {
			operation: request.operation.type,
			effects
		}
	});
	const guard = guardControlAction(options.authorization ?? {}, {
		effects,
		policy: options.policy ?? defaultControlPolicy()
	});
	if (!guard.allowed) {
		const requiresApproval = guard.reason === "approval-required";
		return preparation("denied", ledger, response$1(request, ledger.revision, "denied", {
			code: requiresApproval ? "approval-required" : "policy-denied",
			message: requiresApproval ? "This action requires explicit approval." : "This action is not allowed by the current control policy."
		}));
	}
	return preparation("dispatch", ledger, response$1(request, ledger.revision, "ok"));
}
function preparation(decision, ledger, controlResponse) {
	return {
		decision,
		ledger,
		response: controlResponse,
		complete(result, nextRevision) {
			if (decision !== "dispatch") throw new Error(`Cannot complete a ${decision} control request.`);
			if (!Number.isInteger(nextRevision) || nextRevision < ledger.revision) throw new Error("Completed control request must not decrease the revision.");
			const safeResponse = {
				...controlResponse,
				revision: nextRevision,
				result: redactControlValue(result)
			};
			return {
				ledger: {
					revision: nextRevision,
					completed: {
						...ledger.completed,
						[controlResponse.requestId]: safeResponse
					}
				},
				response: safeResponse
			};
		}
	};
}
function response$1(request, revision, status, error) {
	return {
		protocol: CONTROL_PROTOCOL_VERSION,
		requestId: request.requestId,
		status,
		revision,
		dryRun: false,
		idempotent: false,
		...error ? { error } : {}
	};
}
function defaultEffectsFor(operation) {
	return {
		paid: operation.type === "tool.invoke",
		external: operation.type === "source.ingest" || operation.type === "export.design-kit" || operation.type === "export.brand-kit" || operation.type === "export.starter"
	};
}
function mergeEffects(base, override) {
	return {
		paid: base.paid || Boolean(override?.paid),
		external: base.external || Boolean(override?.external)
	};
}
function defaultControlPolicy() {
	return {
		allowPaid: false,
		allowExternal: false
	};
}
var SECRET_KEY = /(?:^|[_-])(api[_-]?key|secret|password|authorization|provider[_-]?key|access[_-]?token|refresh[_-]?token)(?:$|[_-])/i;
var SECRET_VALUE = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/gi;
/**
* Safe final boundary before caching or returning host results. Design tokens
* are ordinary domain data; only credential-shaped keys and values are hidden.
*/
function redactControlValue(value) {
	return redact(value, /* @__PURE__ */ new WeakSet());
}
function redact(value, seen) {
	if (typeof value === "string") return value.replace(SECRET_VALUE, "[REDACTED]");
	if (Array.isArray(value)) return value.map((item) => redact(item, seen));
	if (!value || typeof value !== "object") return value;
	if (seen.has(value)) return "[CIRCULAR]";
	seen.add(value);
	return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(nested, seen)]));
}
//#endregion
//#region src/headless/storage.ts
var controlLedgerSchema = object({
	revision: number().int().nonnegative(),
	completed: record(string(), controlResponseSchema)
}).strict();
/** Test/dev storage with cloning at every boundary, so previews cannot mutate it. */
function createInMemoryRuntimeStore(initial) {
	let state = clone(initial);
	return {
		async load() {
			return clone(state);
		},
		async save(next) {
			state = clone(next);
		}
	};
}
function ledgerFromState(state) {
	return state.ledger ?? {
		revision: 0,
		completed: {}
	};
}
function clone(value) {
	return structuredClone(value);
}
//#endregion
//#region src/headless/schema.ts
var HEADLESS_MANIFEST_VERSION = "cutout.manifest.v1";
var ARTIFACT_INDEX_VERSION = "cutout.artifacts.v1";
var HEADLESS_POLICY_VERSION = "cutout.policy.v1";
var sha256Schema$4 = string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest.");
var controlledFileNameSchema = string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Expected a safe .cutout file name.").refine((fileName) => !fileName.includes(".."), "Expected a safe .cutout file name.");
var runtimeFilesSchema = object({
	designIr: controlledFileNameSchema,
	designMarkdown: controlledFileNameSchema,
	artifactIndex: controlledFileNameSchema,
	policy: controlledFileNameSchema,
	controlLedger: controlledFileNameSchema
}).strict();
var headlessManifestSchema = object({
	version: literal(HEADLESS_MANIFEST_VERSION),
	project: object({
		id: string().min(1).max(160),
		name: string().min(1).max(200)
	}).strict(),
	files: runtimeFilesSchema
}).strict();
var artifactRecordSchema = object({
	sha256: sha256Schema$4,
	mediaType: string().min(1).max(200),
	byteLength: number().int().nonnegative()
}).strict();
/**
* Index only: binary objects deliberately live outside the JSON graph. Their
* address is the digest, never a caller-supplied filesystem path.
*/
var artifactIndexSchema = object({
	version: literal(ARTIFACT_INDEX_VERSION),
	artifacts: array(artifactRecordSchema).max(1e5)
}).strict().superRefine((index, context) => {
	const seen = /* @__PURE__ */ new Set();
	for (const [position, artifact] of index.artifacts.entries()) {
		if (seen.has(artifact.sha256)) context.addIssue({
			code: "custom",
			path: [
				"artifacts",
				position,
				"sha256"
			],
			message: `Duplicate artifact digest: ${artifact.sha256}`
		});
		seen.add(artifact.sha256);
	}
});
var headlessOperationSchema = _enum([
	"project.context",
	"material.list",
	"validate",
	"governance.preview",
	"governance.validate",
	"governance.report",
	"design.patch",
	"tokens.patch",
	"source.ingest",
	"run.start",
	"run.get",
	"run.cancel",
	"run.events",
	"export.design-kit",
	"export.brand-kit",
	"export.starter",
	"coding.execute",
	"coding.review",
	"coding.repair",
	"tool.invoke"
]);
/**
* The host owns every mutable permission. Export has no caller-controlled
* destination: when enabled it can only write below `.cutout/exports`.
*/
var headlessPolicySchema = object({
	version: literal(HEADLESS_POLICY_VERSION),
	allowApply: boolean(),
	allowedOperations: array(headlessOperationSchema).min(1).max(21),
	requireApprovalForExternal: boolean().optional().default(true)
}).strict().superRefine((policy, context) => {
	if (new Set(policy.allowedOperations).size !== policy.allowedOperations.length) context.addIssue({
		code: "custom",
		path: ["allowedOperations"],
		message: "Duplicate allowed operation."
	});
});
var headlessProjectStateSchema = object({
	manifest: headlessManifestSchema,
	design: designDocumentSchema,
	designMarkdown: string().max(5e5),
	artifactIndex: artifactIndexSchema,
	policy: headlessPolicySchema,
	ledger: controlLedgerSchema.optional(),
	runEvents: agentRunEventStoreSchema.optional()
}).strict().superRefine((state, context) => {
	if (state.manifest.project.id !== state.design.meta.id) context.addIssue({
		code: "custom",
		path: [
			"manifest",
			"project",
			"id"
		],
		message: "Manifest and Design IR project ids must match."
	});
});
//#endregion
//#region src/design-kit/compiler.ts
/**
* Deterministic, in-memory Design Kit v1 compiler.
*
* The Design IR intentionally does not claim confidence, token category details,
* or alias semantics. Callers must provide those facts through the explicit
* adapter below; this compiler never infers them from token names or values.
*/
var sha256Schema$3 = string().regex(/^[a-f0-9]{64}$/i);
var cssNameSchema = string().regex(/^[a-z][a-z0-9-]*$/, "Token CSS names must be lowercase kebab-case.");
var designKitTokenCategorySchema = _enum([
	"color",
	"spacing",
	"radius",
	"typography",
	"shadow",
	"breakpoint"
]);
var designKitTokenStatusSchema = _enum(["verified", "draft"]);
var designKitInputSchema = object({
	document: designDocumentSchema,
	tokens: array(object({
		tokenId: string().min(1),
		status: designKitTokenStatusSchema,
		category: designKitTokenCategorySchema,
		cssName: cssNameSchema,
		aliasOf: string().min(1).optional()
	}).strict())
}).strict();
var designKitFileSchema = object({
	path: _enum([
		"tokens.json",
		"tokens.css",
		"tailwind.css",
		"theme.ts",
		"DESIGN.md",
		"manifest.json",
		"design-system.html",
		"demo.html"
	]),
	content: string(),
	sha256: sha256Schema$3,
	sourceFingerprint: sha256Schema$3,
	provenance: object({
		compiler: literal("cutout.design-kit.v1"),
		documentId: string().min(1),
		revisionId: string().min(1),
		tokenIds: array(string().min(1)),
		provenanceIds: array(string().min(1))
	}).strict()
}).strict();
var designKitSchema = object({
	version: literal("design-kit.v1"),
	source: object({
		documentId: string().min(1),
		revisionId: string().min(1),
		documentFingerprint: sha256Schema$3,
		adapterFingerprint: sha256Schema$3
	}).strict(),
	files: array(designKitFileSchema)
}).strict();
var compatibleKinds = {
	color: ["color"],
	spacing: ["spacing"],
	radius: ["radius"],
	typography: ["typography"],
	shadow: ["shadow"],
	breakpoint: ["other"]
};
/**
* Compile a portable kit without writing files or invoking a provider. The
* function is async solely because Web Crypto is the portable SHA-256 primitive.
*/
async function compileDesignKit(input) {
	const parsed = designKitInputSchema.parse(input);
	const documentValidation = validateDesignDocument(parsed.document);
	if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`);
	const tokens = resolveTokens(parsed.document, parsed.tokens);
	const documentFingerprint = await fingerprint(parsed.document);
	const adapterFingerprint = await fingerprint(tokens.map(adapterFingerprintEntry));
	const source = {
		documentId: parsed.document.meta.id,
		revisionId: parsed.document.revision.id,
		documentFingerprint,
		adapterFingerprint
	};
	const tokenIds = tokens.map((token) => token.tokenId);
	const provenanceIds = uniqueSorted$1(tokens.flatMap((token) => token.provenanceId ? [token.provenanceId] : []));
	const provenance = {
		compiler: "cutout.design-kit.v1",
		documentId: parsed.document.meta.id,
		revisionId: parsed.document.revision.id,
		tokenIds,
		provenanceIds
	};
	const sourceFiles = [
		["tokens.json", renderTokensJson(tokens)],
		["tokens.css", renderTokensCss(tokens)],
		["tailwind.css", renderTailwindCss(tokens)],
		["theme.ts", renderThemeTs(tokens)],
		["DESIGN.md", renderDesignMarkdown(parsed.document, tokens, source)],
		["design-system.html", renderDesignSystemHtml(parsed.document, tokens, source)],
		["demo.html", renderDemoHtml(parsed.document, tokens, source)]
	];
	const filesWithoutManifest = await Promise.all(sourceFiles.map(async ([path, content]) => ({
		path,
		content,
		sha256: await sha256Text$2(content),
		sourceFingerprint: documentFingerprint,
		provenance
	})));
	const manifestContent = renderManifest(source, filesWithoutManifest);
	const manifest = {
		path: "manifest.json",
		content: manifestContent,
		sha256: await sha256Text$2(manifestContent),
		sourceFingerprint: documentFingerprint,
		provenance
	};
	return designKitSchema.parse({
		version: "design-kit.v1",
		source,
		files: [...filesWithoutManifest, manifest].sort((left, right) => compareText$2(left.path, right.path))
	});
}
function resolveTokens(document, adapters) {
	const documentTokens = new Map(document.tokens.map((token) => [token.id, token]));
	const adapterById = /* @__PURE__ */ new Map();
	const names = /* @__PURE__ */ new Set();
	for (const adapter of adapters) {
		if (adapterById.has(adapter.tokenId)) throw new Error(`Design Kit adapter declares token "${adapter.tokenId}" more than once.`);
		if (names.has(`${adapter.category}:${adapter.cssName}`)) throw new Error(`Design Kit adapter declares duplicate ${adapter.category} CSS name "${adapter.cssName}".`);
		const token = documentTokens.get(adapter.tokenId);
		if (!token) throw new Error(`Design Kit adapter token "${adapter.tokenId}" does not exist in the DesignDocument.`);
		if (!compatibleKinds[adapter.category].includes(token.kind)) throw new Error(`Design Kit category "${adapter.category}" is incompatible with IR token "${adapter.tokenId}" of kind "${token.kind}".`);
		if (!isSafeCssValue(token.value)) throw new Error(`Design Kit token "${adapter.tokenId}" has an unsafe CSS value.`);
		adapterById.set(adapter.tokenId, adapter);
		names.add(`${adapter.category}:${adapter.cssName}`);
	}
	for (const adapter of adapters) {
		if (!adapter.aliasOf) continue;
		const target = adapterById.get(adapter.aliasOf);
		if (!target) {
			if (!documentTokens.has(adapter.aliasOf)) throw new Error(`Design Kit alias "${adapter.tokenId}" references unknown token "${adapter.aliasOf}".`);
			throw new Error(`Design Kit alias "${adapter.tokenId}" references token "${adapter.aliasOf}" which is not included in this kit.`);
		}
		if (target.category !== adapter.category) throw new Error(`Design Kit alias "${adapter.tokenId}" must target the same token category.`);
	}
	assertAcyclicAliases(adapterById);
	return [...adapters].map((adapter) => {
		const token = documentTokens.get(adapter.tokenId);
		if (!token) throw new Error(`Missing DesignDocument token "${adapter.tokenId}".`);
		return {
			...adapter,
			value: token.value,
			provenanceId: token.provenanceId,
			...token.tier ? { irTier: token.tier } : {},
			...token.aliasOf ? { irAliasOf: token.aliasOf } : {}
		};
	}).sort(compareTokens);
}
function assertAcyclicAliases(adapters) {
	const visiting = /* @__PURE__ */ new Set();
	const visited = /* @__PURE__ */ new Set();
	const visit = (tokenId) => {
		if (visited.has(tokenId)) return;
		if (visiting.has(tokenId)) throw new Error(`Design Kit semantic alias cycle detected at token "${tokenId}".`);
		visiting.add(tokenId);
		const alias = adapters.get(tokenId)?.aliasOf;
		if (alias) visit(alias);
		visiting.delete(tokenId);
		visited.add(tokenId);
	};
	for (const tokenId of adapters.keys()) visit(tokenId);
}
function renderTokensJson(tokens) {
	const categories = {};
	for (const token of tokens) {
		const category = categories[token.category] ??= {};
		category[token.cssName] = {
			"$type": token.category,
			"$value": token.aliasOf ? `{${jsonTokenPath(findToken(tokens, token.aliasOf))}}` : token.value,
			"$status": token.status,
			"$extensions": {
				"cutout.tokenId": token.tokenId,
				...token.provenanceId ? { "cutout.provenanceId": token.provenanceId } : {}
			}
		};
	}
	return `${JSON.stringify(sortJson(categories), null, 2)}\n`;
}
function renderTokensCss(tokens) {
	return `:root {\n${tokens.map((token) => `  ${cssVariable$1(token)}: ${token.aliasOf ? `var(${cssVariable$1(findToken(tokens, token.aliasOf))})` : token.value};`).join("\n")}\n}\n`;
}
function renderTailwindCss(tokens) {
	return `@import "tailwindcss";\n\n@theme inline {\n${tokens.map((token) => `  ${tailwindVariable(token)}: var(${cssVariable$1(token)});`).join("\n")}\n}\n`;
}
function renderThemeTs(tokens) {
	const categories = {};
	for (const token of tokens) {
		const category = categories[token.category] ??= {};
		category[token.cssName] = `var(${cssVariable$1(token)})`;
	}
	return [
		"/** Generated by cutout.design-kit.v1. Do not edit by hand. */",
		`export const theme = ${JSON.stringify(sortJson(categories), null, 2)} as const`,
		"",
		"export type Theme = typeof theme",
		""
	].join("\n");
}
function renderDesignMarkdown(document, tokens, source) {
	const rows = tokens.map((token) => {
		const path = `${token.category}.${token.cssName}`;
		const value = token.aliasOf ? `alias of \`${jsonTokenPath(findToken(tokens, token.aliasOf))}\`` : `\`${escapeMarkdown$1(token.value)}\``;
		return `| \`${path}\` | ${token.status} | ${value} |`;
	});
	return [
		`# ${escapeMarkdown$1(document.meta.title)} Design Kit`,
		"",
		`Source: \`${document.meta.id}\` revision \`${document.revision.id}\`.`,
		`Document fingerprint: \`${source.documentFingerprint}\`.`,
		`Adapter fingerprint: \`${source.adapterFingerprint}\`.`,
		"",
		"## Tokens",
		"",
		"| Token | Status | Value |",
		"| --- | --- | --- |",
		...rows,
		""
	].join("\n");
}
/**
* A self-contained specimen sheet: a visual palette/type/spacing spec on the
* left, the other five compiled files browsable (and copyable) on the right.
* No fetch, no build step — every source's text is inlined at compile time,
* the same way the reference bundle that inspired this baked its explorer data.
*/
function renderDesignSystemHtml(document, tokens, source) {
	const byCategory = groupBy(tokens, (token) => token.category);
	const colorTokens = byCategory.color ?? [];
	const swatchHtml = (token) => `
        <div class="swatch">
          <div class="swatch-fill" style="background:${cssAttrValue(token)}"></div>
          <div class="swatch-meta">
            <code>${escapeHtml(jsonTokenPath(token))}</code>
            <span>${escapeHtml(token.value)}</span>
            ${token.irAliasOf ? `<span class="swatch-alias">alias of ${escapeHtml(tokens.find((entry) => entry.tokenId === token.irAliasOf)?.cssName ?? token.irAliasOf)}</span>` : ""}
          </div>
        </div>`;
	const hasTiers = colorTokens.some((token) => token.irTier);
	const TIER_LABEL = {
		primitive: "Primitive",
		semantic: "Semantic",
		alias: "Alias"
	};
	const flatSwatchesHtml = colorTokens.map(swatchHtml).join("");
	const tieredSwatchesHtml = [...[
		"primitive",
		"semantic",
		"alias"
	].map((tier) => ({
		tier,
		items: colorTokens.filter((token) => token.irTier === tier)
	})), {
		tier: "ungrouped",
		items: colorTokens.filter((token) => !token.irTier)
	}].filter((group) => group.items.length > 0).map((group) => `
      <h3 class="tier-label">${group.tier === "ungrouped" ? "Ungrouped" : TIER_LABEL[group.tier]}</h3>
      <div class="swatch-grid">${group.items.map(swatchHtml).join("")}</div>`).join("");
	const typeHtml = (byCategory.typography ?? []).map((token) => `
        <div class="type-row">
          <span class="type-sample" style="font:${cssAttrValue(token)}">${escapeHtml(document.meta.title)}</span>
          <code>${escapeHtml(jsonTokenPath(token))}</code>
        </div>`).join("");
	const spacingHtml = (byCategory.spacing ?? []).map((token) => `
        <div class="ramp-row">
          <div class="ramp-bar" style="width:${cssAttrValue(token)}"></div>
          <code>${escapeHtml(jsonTokenPath(token))} · ${escapeHtml(token.value)}</code>
        </div>`).join("");
	const radiusHtml = (byCategory.radius ?? []).map((token) => `
        <div class="radius-chip" style="border-radius:${cssAttrValue(token)}">
          <code>${escapeHtml(jsonTokenPath(token))}</code>
        </div>`).join("");
	const files = [
		["DESIGN.md", renderDesignMarkdown(document, tokens, source)],
		["tokens.json", renderTokensJson(tokens)],
		["tokens.css", renderTokensCss(tokens)],
		["tailwind.css", renderTailwindCss(tokens)],
		["theme.ts", renderThemeTs(tokens)]
	];
	const tabsHtml = files.map(([name], index) => `<button type="button" class="tab${index === 0 ? " active" : ""}" data-tab="${index}">${escapeHtml(name)}</button>`).join("");
	const panelsHtml = files.map(([, content], index) => `<pre class="panel${index === 0 ? " active" : ""}" data-panel="${index}">${escapeHtml(content)}</pre>`).join("");
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.meta.title)} — Design system</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f6f2; color: #1b1d22; }
  .topbar { position: sticky; top: 0; z-index: 2; display: flex; min-height: 60px; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 24px; border-bottom: 1px solid #dfdcd3; background: #fff; }
  .topbar p { margin: 0; color: #5b5f6b; font: 11px/1.4 ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
  .topbar strong { display: block; margin-top: 2px; font-size: 14px; }
  .app { display: grid; grid-template-columns: minmax(0,58fr) minmax(380px,42fr); min-height: calc(100vh - 60px); }
  .specimen, .source { overflow: auto; }
  .specimen { padding: 44px 48px 96px; }
  .source { border-left: 1px solid #dfdcd3; background: #fff; }
  .intro { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 44px; }
  h1 { max-width: 14ch; font: 500 clamp(36px,5vw,68px)/.96 ui-serif, Georgia, serif; letter-spacing: 0; margin: 0; }
  .subtitle { max-width: 52ch; color: #5b5f6b; font-size: 15px; line-height: 1.55; margin: 14px 0 0; }
  h2 { font: 600 11px/1.4 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; color: #5b5f6b; margin: 42px 0 14px; }
  .swatch-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: 14px; }
  .swatch { border: 1px solid #dfdcd3; border-radius: 12px; overflow: hidden; background: #fff; transition: transform .15s ease, border-color .15s ease; }
  .swatch:hover { transform: translateY(-2px); border-color: #1b1d22; }
  .swatch-fill { height: 88px; }
  .swatch-meta { padding: 10px; font-size: 11px; display: flex; flex-direction: column; gap: 3px; }
  .swatch-alias { color: #8b8e98; }
  .tier-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8b8e98; margin: 16px 0 8px; }
  .tier-label:first-of-type { margin-top: 0; }
  .type-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid #dfdcd3; }
  .type-sample { font-size: 20px; }
  .ramp-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
  .ramp-bar { height: 10px; background: #3a4ea6; border-radius: 3px; }
  .radius-chip { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: #e7e9f6; margin: 0 8px 8px 0; }
  code { font-family: ui-monospace, monospace; font-size: 11px; color: #5b5f6b; }
  .source-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 24px 12px; border-bottom: 1px solid #dfdcd3; }
  .source-head strong { font-size: 14px; }
  .tabs { display: flex; gap: 16px; overflow-x: auto; padding: 0 24px; border-bottom: 1px solid #dfdcd3; }
  .tab { height: 44px; flex: none; font-size: 12px; padding: 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #5b5f6b; cursor: pointer; }
  .tab.active { color: #1b1d22; border-color: #1b1d22; font-weight: 700; }
  .panel { display: none; margin: 0; white-space: pre-wrap; word-break: break-word; font: 12px/1.7 ui-monospace, monospace; color: #31343c; background: #fff; padding: 24px; height: calc(100vh - 176px); overflow: auto; }
  .panel.active { display: block; }
  .copy { font-size: 12px; padding: 7px 10px; border: 1px solid #dfdcd3; border-radius: 7px; background: #fff; cursor: pointer; }
  @media (max-width: 900px) { .app { display: block; } .source { border-left: 0; border-top: 1px solid #dfdcd3; min-height: 620px; } .specimen { padding: 28px 20px 64px; } }
</style>
</head>
<body>
  <header class="topbar"><div><p>Design system explorer</p><strong>${escapeHtml(document.meta.title)}</strong></div><button type="button" class="copy" data-copy>Copy current file</button></header>
  <div class="app">
    <section class="specimen">
      <div class="intro"><div><h1>${escapeHtml(document.meta.title)}</h1><p class="subtitle">Revision ${escapeHtml(document.revision.id)} · generated from the current Design IR.</p></div></div>
      <h2>Color</h2>
      ${hasTiers ? tieredSwatchesHtml : `<div class="swatch-grid">${flatSwatchesHtml || "<p>No color tokens in this kit.</p>"}</div>`}
      <h2>Typography</h2>
      <div>${typeHtml || "<p>No typography tokens in this kit.</p>"}</div>
      <h2>Spacing</h2>
      <div>${spacingHtml || "<p>No spacing tokens in this kit.</p>"}</div>
      <h2>Radius</h2>
      <div>${radiusHtml || "<p>No radius tokens in this kit.</p>"}</div>
      <h2>Demo</h2>
      <iframe class="demo-frame" src="demo.html" style="width:100%;height:480px;border:1px solid #dfdcd3;border-radius:10px;background:#fff" title="demo"></iframe>
      <p><a href="demo.html" target="_blank" rel="noopener">Open full-page demo →</a></p>
    </section>
    <section class="source">
      <div class="source-head"><strong>Implementation source</strong><span>Generated</span></div>
      <div class="tabs">${tabsHtml}</div>
      ${panelsHtml}
    </section>
  </div>
  <script>
    var tabs = document.querySelectorAll('.tab');
    var panels = document.querySelectorAll('.panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelector('.panel[data-panel="' + tab.dataset.tab + '"]').classList.add('active');
      });
    });
    document.querySelector('[data-copy]').addEventListener('click', function () {
      var active = document.querySelector('.panel.active');
      if (active && navigator.clipboard) navigator.clipboard.writeText(active.textContent || '');
    });
  <\/script>
</body>
</html>
`;
}
/**
* A realistic mockup screen styled only with the compiled CSS custom
* properties — proof the tokens survive contact with a real layout, not just
* isolated swatches. Deterministic v1: role assignment is positional (first
* color token = accent, second = surface, ...), not semantic — a
* coding-agent pass can compose something more deliberate later without
* changing this file's contract.
*/
function renderDemoHtml(document, tokens, _source) {
	const colors = tokens.filter((token) => token.category === "color");
	const spacing = tokens.filter((token) => token.category === "spacing");
	const radii = tokens.filter((token) => token.category === "radius");
	const shadows = tokens.filter((token) => token.category === "shadow");
	const typography = tokens.filter((token) => token.category === "typography");
	const pick = (list, index, fallback) => list.length ? list[index % list.length] : fallback;
	const accent = pick(colors, 0, void 0);
	const surface = pick(colors, 1, accent);
	const ink = pick(colors, 2, accent);
	const gap = pick(spacing, 2, void 0);
	const radius = pick(radii, 0, void 0);
	const shadow = pick(shadows, 0, void 0);
	const font = pick(typography, 0, void 0);
	const css = renderTokensCss(tokens);
	const varOr = (token, fallback) => token ? `var(${cssVariable$1(token)})` : fallback;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.meta.title)} — Demo</title>
<style>
${css}
  * { box-sizing: border-box; }
  body { margin: 0; font: ${font ? varOr(font, "") : "14px/1.5 ui-sans-serif, system-ui, sans-serif"}; background: ${varOr(surface, "#f7f6f2")}; color: ${varOr(ink, "#1b1d22")}; }
  .shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
  .nav { background: ${varOr(surface, "#fff")}; border-right: 1px solid rgba(0,0,0,.08); padding: ${varOr(gap, "16px")}; }
  .nav .brand { font-weight: 700; margin-bottom: ${varOr(gap, "16px")}; }
  .nav a { display: block; padding: 8px 10px; border-radius: ${varOr(radius, "6px")}; color: inherit; text-decoration: none; opacity: .75; font-size: 13px; }
  .nav a.active { background: ${varOr(accent, "#3a4ea6")}; color: #fff; opacity: 1; }
  main { padding: ${varOr(gap, "24px")}; }
  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: ${varOr(gap, "20px")}; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: ${varOr(gap, "14px")}; margin-bottom: ${varOr(gap, "24px")}; }
  .card { background: #fff; border-radius: ${varOr(radius, "10px")}; padding: 16px; box-shadow: ${shadow ? varOr(shadow, "") : "0 1px 2px rgba(0,0,0,.06)"}; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
  .card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: ${varOr(radius, "10px")}; overflow: hidden; box-shadow: ${shadow ? varOr(shadow, "") : "0 1px 2px rgba(0,0,0,.06)"}; }
  th, td { text-align: left; padding: 10px 14px; font-size: 13px; border-bottom: 1px solid rgba(0,0,0,.06); }
  th { opacity: .6; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; }
  .btn { display: inline-block; background: ${varOr(accent, "#3a4ea6")}; color: #fff; border: none; border-radius: ${varOr(radius, "8px")}; padding: 8px 14px; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <div class="shell">
    <nav class="nav">
      <div class="brand">${escapeHtml(document.meta.title)}</div>
      <a class="active" href="#">Overview</a>
      <a href="#">Sources</a>
      <a href="#">Components</a>
      <a href="#">Settings</a>
    </nav>
    <main>
      <div class="topbar">
        <h1 style="font-size:18px;margin:0">Overview</h1>
        <button class="btn" type="button" onclick="alert('This demo is a visual reference — it renders no real actions.')">New run</button>
      </div>
      <div class="cards">
        <div class="card"><div class="label">Tokens</div><div class="value">${tokens.length}</div></div>
        <div class="card"><div class="label">Colors</div><div class="value">${colors.length}</div></div>
        <div class="card"><div class="label">Components</div><div class="value">${document.components.length}</div></div>
        <div class="card"><div class="label">Sources</div><div class="value">${document.sources.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Token</th><th>Category</th><th>Value</th></tr></thead>
        <tbody>
          ${tokens.slice(0, 8).map((token) => `<tr><td>${escapeHtml(token.cssName)}</td><td>${escapeHtml(token.category)}</td><td>${escapeHtml(token.value)}</td></tr>`).join("")}
        </tbody>
      </table>
    </main>
  </div>
</body>
</html>
`;
}
function renderManifest(source, files) {
	return `${JSON.stringify({
		version: "design-kit.v1",
		source,
		files: [...files].sort((left, right) => compareText$2(left.path, right.path)).map((file) => ({
			path: file.path,
			sha256: file.sha256,
			sourceFingerprint: file.sourceFingerprint,
			provenance: file.provenance
		}))
	}, null, 2)}\n`;
}
function cssVariable$1(token) {
	return `--cutout-${token.category}-${token.cssName}`;
}
function tailwindVariable(token) {
	return `--${{
		color: "color",
		spacing: "spacing",
		radius: "radius",
		typography: "font",
		shadow: "shadow",
		breakpoint: "breakpoint"
	}[token.category]}-${token.cssName}`;
}
function jsonTokenPath(token) {
	return `${token.category}.${token.cssName}`;
}
function findToken(tokens, tokenId) {
	const token = tokens.find((entry) => entry.tokenId === tokenId);
	if (!token) throw new Error(`Missing resolved token "${tokenId}".`);
	return token;
}
function compareTokens(left, right) {
	return compareText$2(`${left.category}\u0000${left.cssName}\u0000${left.tokenId}`, `${right.category}\u0000${right.cssName}\u0000${right.tokenId}`);
}
function adapterFingerprintEntry(token) {
	return {
		tokenId: token.tokenId,
		category: token.category,
		cssName: token.cssName,
		status: token.status,
		...token.aliasOf ? { aliasOf: token.aliasOf } : {}
	};
}
function uniqueSorted$1(values) {
	return [...new Set(values)].sort(compareText$2);
}
function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText$2(left, right)).map(([key, entry]) => [key, sortJson(entry)]));
	return value;
}
function escapeMarkdown$1(value) {
	return value.replaceAll("`", "\\`").replaceAll("|", "\\|").replaceAll("\n", " ");
}
function escapeHtml(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
/** Safe to place inside a double-quoted HTML style attribute; isSafeCssValue already ruled out CSS injection. */
function cssAttrValue(token) {
	return escapeHtml(token.value);
}
function groupBy(items, key) {
	const result = {};
	for (const item of items) {
		const bucket = key(item);
		(result[bucket] ??= []).push(item);
	}
	return result;
}
function isSafeCssValue(value) {
	return value.length > 0 && !/[;{}\r\n]|\/\*|\*\//.test(value);
}
function compareText$2(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
async function sha256Text$2(value) {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region src/design-kit/headless.ts
/**
* Explicit host adapter for the repo-native Design IR. The generic compiler
* intentionally does not infer categories or verification. This boundary does
* only two conservative things that the IR itself proves: maps its closed
* token kinds to kit categories, and marks every token `draft` because v1 IR
* has no verification field. CSS names are opaque, deterministic IDs rather
* than a guess about a token's semantic name.
*/
async function compileHeadlessDesignKit(document) {
	return compileDesignKit({
		document,
		tokens: [...headlessTokenAdapters(document.tokens)]
	});
}
function headlessTokenAdapters(tokens) {
	const occurrences = /* @__PURE__ */ new Map();
	return [...tokens].sort((left, right) => left.id.localeCompare(right.id)).map((token) => {
		const category = categoryFor(token);
		const base = `token-${slug$1(token.id)}`;
		const key = `${category}:${base}`;
		const occurrence = occurrences.get(key) ?? 0;
		occurrences.set(key, occurrence + 1);
		return {
			tokenId: token.id,
			status: "draft",
			category,
			cssName: occurrence === 0 ? base : `${base}-${occurrence + 1}`
		};
	});
}
function categoryFor(token) {
	switch (token.kind) {
		case "color": return "color";
		case "spacing": return "spacing";
		case "radius": return "radius";
		case "typography": return "typography";
		case "shadow": return "shadow";
		case "other": return "breakpoint";
		case "motion": throw new Error(`Design Kit v1 cannot export motion token "${token.id}". Add a motion adapter before exporting this revision.`);
	}
}
function slug$1(value) {
	const result = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return result && /^[a-z]/.test(result) ? result.slice(0, 100) : `id-${result.slice(0, 96) || "token"}`;
}
//#endregion
//#region src/design-kit/system-kit.ts
var designSystemArtifactStageSchema = _enum([
	"foundation",
	"semantic",
	"primitive",
	"component",
	"pattern",
	"template",
	"binding",
	"documentation",
	"quality",
	"package"
]);
var designSystemProductionModeSchema = _enum([
	"deterministic",
	"multimodal-analysis",
	"image-generation",
	"image-edit"
]);
var designSystemExecutorSchema = _enum([
	"compiler",
	"coding-agent",
	"visual-generation",
	"figma-adapter"
]);
var designSystemQualityGateSchema = _enum([
	"schema",
	"provenance",
	"token-reference",
	"contrast",
	"keyboard",
	"screen-reader",
	"responsive",
	"visual-regression",
	"interaction-contract",
	"motion-reduction",
	"duration",
	"bounds",
	"blank-frames",
	"web-render-screenshot",
	"code-connect",
	"package-consumer",
	"license"
]);
object({
	id: string().regex(/^ds\.[a-z0-9.-]+$/),
	title: string().min(1),
	stage: designSystemArtifactStageSchema,
	description: string().min(1),
	dependsOn: array(string()).default([]),
	modes: array(designSystemProductionModeSchema).min(1),
	executors: array(designSystemExecutorSchema).min(1),
	gates: array(designSystemQualityGateSchema).min(1),
	outputs: array(string().min(1)).min(1),
	rebuildKeys: array(string().min(1)).min(1)
}).strict();
var foundation = (id, title, outputs, gates = [
	"schema",
	"provenance",
	"token-reference"
], modes = ["deterministic"]) => ({
	id: `ds.foundation.${id}`,
	title,
	stage: "foundation",
	description: `${title} source tokens, usage rules, examples, and machine-readable contracts.`,
	dependsOn: [],
	modes,
	executors: modes.some((mode) => mode === "image-generation" || mode === "image-edit" || mode === "multimodal-analysis") ? ["compiler", "visual-generation"] : ["compiler"],
	gates,
	outputs,
	rebuildKeys: [`tokens.${id}`, `sources.${id}`]
});
foundation("color", "Color", ["tokens/color.dtcg.json", "docs/foundations/color.mdx"], [
	"schema",
	"provenance",
	"token-reference",
	"contrast"
]), foundation("typography", "Typography", ["tokens/typography.dtcg.json", "docs/foundations/typography.mdx"]), foundation("spacing", "Spacing", ["tokens/spacing.dtcg.json", "docs/foundations/spacing.mdx"]), foundation("grid", "Grid and breakpoints", ["tokens/layout.dtcg.json", "docs/foundations/grid.mdx"], [
	"schema",
	"provenance",
	"responsive"
]), foundation("radius", "Radius", ["tokens/radius.dtcg.json", "docs/foundations/radius.mdx"]), foundation("elevation", "Elevation", ["tokens/elevation.dtcg.json", "docs/foundations/elevation.mdx"]), foundation("motion", "Motion", [
	"tokens/motion.dtcg.json",
	"motion/motion-ir.schema.json",
	"motion/components.json",
	"docs/foundations/motion.mdx"
], [
	"schema",
	"provenance",
	"duration",
	"bounds",
	"blank-frames",
	"motion-reduction",
	"web-render-screenshot"
]), foundation("iconography", "Iconography", ["assets/icons/manifest.json", "docs/foundations/iconography.mdx"], [
	"schema",
	"provenance",
	"license"
], ["deterministic", "multimodal-analysis"]), foundation("imagery", "Imagery", ["assets/imagery/manifest.json", "docs/foundations/imagery.mdx"], [
	"schema",
	"provenance",
	"license",
	"visual-regression"
], [
	"multimodal-analysis",
	"image-generation",
	"image-edit"
]), foundation("accessibility", "Accessibility", ["contracts/accessibility.json", "docs/foundations/accessibility.mdx"], [
	"schema",
	"contrast",
	"keyboard",
	"screen-reader",
	"motion-reduction"
]), foundation("content", "Content design", ["contracts/content.json", "docs/foundations/content.mdx"]);
_enum([
	"foundation",
	"product",
	"complete"
]);
//#endregion
//#region src/design-kit/astryx.ts
var cssVariable = string().regex(/^--[a-z][a-z0-9-]*$/);
object({
	document: designDocumentSchema,
	themeName: string().regex(/^[a-z][a-z0-9-]*$/),
	extends: _enum(["neutral"]).default("neutral"),
	tokens: array(object({
		astryxVariable: cssVariable,
		lightTokenId: string().min(1),
		darkTokenId: string().min(1).optional()
	}).strict()).min(1),
	components: array(object({
		designComponentId: string().min(1),
		astryxComponent: string().regex(/^[A-Z][A-Za-z0-9]*$/)
	}).strict()).default([])
}).strict();
//#endregion
//#region src/components-compiler/compiler.ts
/**
* Explicit component candidate compiler.
*
* This module deliberately does not inspect screenshots, DOM, or generated
* pages to invent components. A caller must declare each candidate and its
* public API. The compiler only proves that those declarations agree with the
* canonical Design IR and produces portable manifests.
*/
var idSchema = string().min(1).max(160);
var sha256Schema$2 = string().regex(/^[a-f0-9]{64}$/i);
var apiNameSchema = string().regex(/^[A-Za-z][A-Za-z0-9]*$/, "Component API names must be ASCII identifiers.");
var componentCandidateKindSchema = _enum([
	"primitive",
	"composite",
	"layout",
	"pattern"
]);
var componentCandidateStatusSchema = _enum([
	"draft",
	"ready",
	"deprecated"
]);
var componentPropSchema = discriminatedUnion("type", [
	object({
		name: apiNameSchema,
		type: literal("string"),
		required: boolean().default(false),
		defaultValue: string().optional()
	}).strict(),
	object({
		name: apiNameSchema,
		type: literal("boolean"),
		required: boolean().default(false),
		defaultValue: boolean().optional()
	}).strict(),
	object({
		name: apiNameSchema,
		type: literal("number"),
		required: boolean().default(false),
		defaultValue: number().finite().optional()
	}).strict(),
	object({
		name: apiNameSchema,
		type: literal("enum"),
		required: boolean().default(false),
		values: array(string().min(1)).min(1),
		defaultValue: string().optional()
	}).strict()
]);
var componentEvidenceSchema = object({
	materialId: idSchema,
	revisionId: idSchema,
	pageId: idSchema,
	bounds: object({
		x: number().nonnegative(),
		y: number().nonnegative(),
		width: number().positive(),
		height: number().positive()
	}).strict(),
	selectedBy: string().min(1),
	selectedAt: string().datetime()
}).strict();
var componentConstraintsSchema = object({
	horizontal: _enum([
		"fixed",
		"fill",
		"hug"
	]),
	vertical: _enum([
		"fixed",
		"fill",
		"hug"
	]),
	minWidth: number().nonnegative().optional(),
	maxWidth: number().positive().optional(),
	minHeight: number().nonnegative().optional(),
	maxHeight: number().positive().optional(),
	aspectRatio: number().positive().optional()
}).strict();
var componentCandidateSchema = object({
	id: idSchema,
	name: string().min(1),
	kind: componentCandidateKindSchema,
	sourcePageIds: array(idSchema).min(1),
	tokenRefs: array(idSchema).default([]),
	props: array(componentPropSchema).default([]),
	variants: array(object({
		name: apiNameSchema,
		values: array(string().min(1)).min(1)
	}).strict()).default([]),
	slots: array(object({
		name: apiNameSchema,
		required: boolean().default(false)
	}).strict()).default([]),
	states: array(object({
		name: apiNameSchema,
		description: string().min(1),
		props: record(string(), union([
			string(),
			number(),
			boolean()
		])).default({})
	}).strict()).optional(),
	stories: array(object({
		name: apiNameSchema,
		state: apiNameSchema.optional(),
		variant: record(string(), string()).default({}),
		viewport: _enum([
			"mobile",
			"tablet",
			"desktop"
		]).default("desktop")
	}).strict()).optional(),
	evidence: componentEvidenceSchema.optional(),
	confidence: number().min(0).max(1).optional(),
	constraints: componentConstraintsSchema.optional(),
	responsive: array(object({
		breakpoint: string().min(1),
		changes: object({
			horizontal: _enum([
				"fixed",
				"fill",
				"hug"
			]).optional(),
			vertical: _enum([
				"fixed",
				"fill",
				"hug"
			]).optional(),
			hidden: boolean().optional()
		}).strict()
	}).strict()).optional(),
	tokenBindings: array(object({
		property: string().min(1),
		tokenId: idSchema
	}).strict()).optional(),
	status: componentCandidateStatusSchema
}).strict();
var componentCandidateInputSchema = object({
	document: designDocumentSchema,
	candidates: array(componentCandidateSchema)
}).strict();
var componentManifestCandidateSchema = componentCandidateSchema;
var componentManifestSchema = object({
	version: literal("components.manifest.v1"),
	source: object({
		documentId: idSchema,
		revisionId: idSchema,
		documentFingerprint: sha256Schema$2,
		declarationFingerprint: sha256Schema$2
	}).strict(),
	candidates: array(componentManifestCandidateSchema)
}).strict();
var shadcnAdapterPlanSchema = object({
	version: literal("shadcn.adapter-plan.v1"),
	source: object({
		documentId: idSchema,
		revisionId: idSchema,
		documentFingerprint: sha256Schema$2,
		declarationFingerprint: sha256Schema$2
	}).strict(),
	generation: object({
		generatesShadcnSource: literal(false),
		forksShadcnSource: literal(false),
		implementation: literal("manual")
	}).strict(),
	config: object({
		tokenStrategy: literal("css-variables"),
		componentStrategy: literal("user-owned")
	}).strict(),
	tokenMappings: array(object({
		tokenId: idSchema,
		cssVariable: string().regex(/^--cutout-token-[a-z0-9-]+$/),
		value: string().min(1),
		kind: string().min(1)
	}).strict()),
	components: array(object({
		candidateId: idSchema,
		registryName: string().min(1),
		status: componentCandidateStatusSchema,
		implementation: literal("manual")
	}).strict())
}).strict();
var componentCompilerFileSchema = object({
	path: _enum(["components.manifest.json", "shadcn.adapter-plan.json"]),
	content: string(),
	sha256: sha256Schema$2,
	sourceFingerprint: sha256Schema$2
}).strict();
var componentCompilerOutputSchema = object({
	version: literal("components.compiler.v1"),
	source: componentManifestSchema.shape.source,
	files: array(componentCompilerFileSchema).length(2)
}).strict();
/** Compile a deterministic, write-free manifest and shadcn mapping plan. */
async function compileComponentCandidates(input) {
	const parsed = componentCandidateInputSchema.parse(input);
	const documentValidation = validateDesignDocument(parsed.document);
	if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`);
	const candidates = normalizeAndValidateCandidates(parsed.document, parsed.candidates);
	const documentFingerprint = await fingerprint(parsed.document);
	const declarationFingerprint = await fingerprint(candidates);
	const source = {
		documentId: parsed.document.meta.id,
		revisionId: parsed.document.revision.id,
		documentFingerprint,
		declarationFingerprint
	};
	const manifest = componentManifestSchema.parse({
		version: "components.manifest.v1",
		source,
		candidates
	});
	const plan = shadcnAdapterPlanSchema.parse({
		version: "shadcn.adapter-plan.v1",
		source,
		generation: {
			generatesShadcnSource: false,
			forksShadcnSource: false,
			implementation: "manual"
		},
		config: {
			tokenStrategy: "css-variables",
			componentStrategy: "user-owned"
		},
		tokenMappings: resolveTokenMappings(parsed.document, candidates),
		components: candidates.map((candidate) => ({
			candidateId: candidate.id,
			registryName: candidate.name,
			status: candidate.status,
			implementation: "manual"
		}))
	});
	const manifestContent = jsonFile(manifest);
	const planContent = jsonFile(plan);
	return componentCompilerOutputSchema.parse({
		version: "components.compiler.v1",
		source,
		files: (await Promise.all([file("components.manifest.json", manifestContent, documentFingerprint), file("shadcn.adapter-plan.json", planContent, documentFingerprint)])).sort((left, right) => compareText$1(left.path, right.path))
	});
}
/**
* Re-proves a persisted manifest against its Design IR. Consumers such as a
* Starter compiler must call this rather than trusting a self-consistent JSON
* fingerprint: a caller can always recompute a fingerprint for invalid refs.
*/
async function validateComponentManifest(document, manifestInput) {
	const documentValidation = validateDesignDocument(document);
	if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`);
	const manifest = componentManifestSchema.parse(manifestInput);
	const documentFingerprint = await fingerprint(document);
	if (manifest.source.documentId !== document.meta.id || manifest.source.revisionId !== document.revision.id) throw new Error("Component Candidate Manifest does not belong to this DesignDocument revision.");
	if (manifest.source.documentFingerprint !== documentFingerprint) throw new Error("Component Candidate Manifest document fingerprint does not match this DesignDocument.");
	const candidates = normalizeAndValidateCandidates(document, manifest.candidates);
	const declarationFingerprint = await fingerprint(candidates);
	if (manifest.source.declarationFingerprint !== declarationFingerprint) throw new Error("Component Candidate Manifest declaration fingerprint does not match its candidates.");
	return componentManifestSchema.parse({
		...manifest,
		candidates
	});
}
function normalizeAndValidateCandidates(document, declarations) {
	const candidateIds = /* @__PURE__ */ new Set();
	const pageIds = new Set(document.prototype?.plan.pages.map((page) => page.id) ?? []);
	const tokens = new Map(document.tokens.map((token) => [token.id, token]));
	const irComponents = new Map(document.components.map((component) => [component.id, component]));
	return declarations.map((candidate) => {
		if (candidateIds.has(candidate.id)) throw new Error(`Component candidate declares duplicate id "${candidate.id}".`);
		candidateIds.add(candidate.id);
		if (!document.prototype) throw new Error(`Component candidate "${candidate.id}" requires a prototype to validate sourcePageIds.`);
		assertUnique(candidate.sourcePageIds, `Component candidate "${candidate.id}" has duplicate sourcePageId`);
		assertUnique(candidate.tokenRefs, `Component candidate "${candidate.id}" has duplicate tokenRef`);
		for (const pageId of candidate.sourcePageIds) if (!pageIds.has(pageId)) throw new Error(`Component candidate "${candidate.id}" references unknown prototype page "${pageId}".`);
		for (const tokenId of candidate.tokenRefs) if (!tokens.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references unknown Design IR token "${tokenId}".`);
		for (const binding of candidate.tokenBindings ?? []) if (!candidate.tokenRefs.includes(binding.tokenId)) throw new Error(`Component candidate "${candidate.id}" token binding must reference a declared tokenRef.`);
		assertCandidateApi(candidate);
		assertIrComponentAndRelations(document, candidate, irComponents);
		return normalizeCandidate(candidate);
	}).sort((left, right) => compareText$1(left.id, right.id));
}
function assertCandidateApi(candidate) {
	const props = /* @__PURE__ */ new Set();
	for (const prop of candidate.props) {
		if (props.has(prop.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate prop "${prop.name}".`);
		props.add(prop.name);
		if (prop.type === "enum") {
			assertUnique(prop.values, `Component candidate "${candidate.id}" prop "${prop.name}" has duplicate enum value`);
			if (prop.defaultValue !== void 0 && !prop.values.includes(prop.defaultValue)) throw new Error(`Component candidate "${candidate.id}" prop "${prop.name}" defaultValue is not an enum value.`);
		}
	}
	const variants = /* @__PURE__ */ new Set();
	for (const variant of candidate.variants) {
		if (variants.has(variant.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate variant "${variant.name}".`);
		if (props.has(variant.name)) throw new Error(`Component candidate "${candidate.id}" variant "${variant.name}" conflicts with prop "${variant.name}".`);
		assertUnique(variant.values, `Component candidate "${candidate.id}" variant "${variant.name}" has duplicate value`);
		variants.add(variant.name);
	}
	const slots = /* @__PURE__ */ new Set();
	for (const slot of candidate.slots) {
		if (slots.has(slot.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate slot "${slot.name}".`);
		if (props.has(slot.name) || variants.has(slot.name)) throw new Error(`Component candidate "${candidate.id}" slot "${slot.name}" conflicts with an existing component API member.`);
		slots.add(slot.name);
	}
	const states = new Set((candidate.states ?? []).map(({ name }) => name));
	if (states.size !== (candidate.states ?? []).length) throw new Error(`Component candidate "${candidate.id}" has duplicate state names.`);
	const stories = /* @__PURE__ */ new Set();
	for (const story of candidate.stories ?? []) {
		if (stories.has(story.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate story "${story.name}".`);
		stories.add(story.name);
		if (story.state && !states.has(story.state)) throw new Error(`Component candidate "${candidate.id}" story "${story.name}" references unknown state "${story.state}".`);
		for (const [variant, value] of Object.entries(story.variant)) if (!candidate.variants.find(({ name }) => name === variant)?.values.includes(value)) throw new Error(`Component candidate "${candidate.id}" story "${story.name}" has an invalid variant value.`);
	}
}
function assertIrComponentAndRelations(document, candidate, irComponents) {
	const component = irComponents.get(candidate.id);
	if (!component) return;
	if (component.name !== candidate.name || component.status !== candidate.status || !sameSet(component.tokenIds, candidate.tokenRefs)) throw new Error(`Component candidate "${candidate.id}" does not match the matching Design IR component declaration.`);
	if (!sameSet(document.relations.filter((relation) => relation.kind === "component-uses-token" && relation.from.id === candidate.id).map((relation) => relation.to.id), candidate.tokenRefs)) throw new Error(`Component token relations for "${candidate.id}" do not exactly match candidate tokenRefs.`);
	const prototypeRelations = document.relations.filter((relation) => relation.kind === "prototype-uses-component" && relation.to.id === candidate.id);
	for (const relation of prototypeRelations) if (relation.from.id !== document.prototype?.id) throw new Error(`Component relation "${relation.id}" references an unsupported prototype for candidate "${candidate.id}".`);
}
function normalizeCandidate(candidate) {
	return {
		...candidate,
		sourcePageIds: uniqueSorted(candidate.sourcePageIds),
		tokenRefs: uniqueSorted(candidate.tokenRefs),
		props: [...candidate.props].map((prop) => prop.type === "enum" ? {
			...prop,
			values: uniqueSorted(prop.values)
		} : prop).sort((left, right) => compareText$1(left.name, right.name)),
		variants: [...candidate.variants].map((variant) => ({
			...variant,
			values: uniqueSorted(variant.values)
		})).sort((left, right) => compareText$1(left.name, right.name)),
		slots: [...candidate.slots].sort((left, right) => compareText$1(left.name, right.name)),
		...candidate.states ? { states: [...candidate.states].sort((left, right) => compareText$1(left.name, right.name)) } : {},
		...candidate.stories ? { stories: [...candidate.stories].sort((left, right) => compareText$1(left.name, right.name)) } : {},
		...candidate.responsive ? { responsive: [...candidate.responsive].sort((left, right) => compareText$1(left.breakpoint, right.breakpoint)) } : {},
		...candidate.tokenBindings ? { tokenBindings: [...candidate.tokenBindings].sort((left, right) => compareText$1(`${left.property}:${left.tokenId}`, `${right.property}:${right.tokenId}`)) } : {}
	};
}
function resolveTokenMappings(document, candidates) {
	const tokens = new Map(document.tokens.map((token) => [token.id, token]));
	const mappings = uniqueSorted(candidates.flatMap((candidate) => candidate.tokenRefs)).map((tokenId) => {
		const token = tokens.get(tokenId);
		if (!token) throw new Error(`Missing Design IR token "${tokenId}".`);
		return tokenMapping(token);
	});
	const cssVariables = /* @__PURE__ */ new Set();
	for (const mapping of mappings) {
		if (cssVariables.has(mapping.cssVariable)) throw new Error(`Component adapter token mapping collision at CSS variable "${mapping.cssVariable}".`);
		cssVariables.add(mapping.cssVariable);
	}
	return mappings;
}
function tokenMapping(token) {
	return {
		tokenId: token.id,
		cssVariable: `--cutout-token-${toKebab(token.id.replace(/^token:/, ""))}`,
		value: token.value,
		kind: token.kind
	};
}
async function file(path, content, sourceFingerprint) {
	return {
		path,
		content,
		sha256: await sha256Text$1(content),
		sourceFingerprint
	};
}
function jsonFile(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}
async function sha256Text$1(value) {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function toKebab(value) {
	return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/^-+|-+$/g, "");
}
function uniqueSorted(values) {
	return [...new Set(values)].sort(compareText$1);
}
function assertUnique(values, prefix) {
	if (new Set(values).size !== values.length) throw new Error(`${prefix}.`);
}
function sameSet(left, right) {
	return left.length === right.length && new Set(left).size === left.length && new Set(left).size === new Set(right).size && left.every((entry) => new Set(right).has(entry));
}
function compareText$1(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
//#endregion
//#region src/ingestion/everything-inbox.ts
var MAX_LOCAL_FILE_BYTES = 100 * 1024 * 1024;
var MAX_INLINE_TEXT_BYTES = 1 * 1024 * 1024;
var MAX_REPOSITORY_ENTRIES$1 = 1e4;
var CREDENTIAL_PATTERN = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i;
var SECRET_PATH_PATTERN = /(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i;
var SKIPPED_REPOSITORY_DIRECTORY = /^(?:node_modules|\.git|dist|build|coverage|\.next|\.nuxt)(?:\/|$)/i;
var ALLOWLISTED_CONFIG$1 = /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(?:\.[^/]+)?\.json|vite\.config\.[^/]+|next\.config\.[^/]+|nuxt\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|components\.json|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.prettierrc(?:\.[^/]+)?|README(?:\.[^/]+)?|DESIGN\.md)$/i;
var SOURCE_FILE$1 = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|sass|less|html|mdx?|json|ya?ml)$/i;
/**
* Build an additive Design IR patch. Duplicate detection is content-addressed
* where bytes exist, and descriptor-addressed for URL/repository imports.
*/
async function ingestEverything(input, options = {}) {
	const capturedAt = options.capturedAt ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!isIsoDate(capturedAt)) return err("capturedAt must be an ISO-8601 UTC timestamp.");
	const actorId = options.actorId ?? "system:everything-inbox";
	if (!isSafeId(actorId)) return err("actorId must be a non-empty safe identifier.");
	const source = await sourceFromInput(input, capturedAt);
	if (!source.ok) return source;
	if (isDuplicate(source.data, options.existingSources ?? [])) return ok$1({
		patch: {
			sources: [],
			provenance: []
		},
		skipped: [{ reason: "duplicate-content" }]
	});
	const record = {
		id: `provenance:ingest:${stableSuffix(source.data.id)}`,
		operation: "import",
		sourceIds: [source.data.id],
		actor: {
			kind: actorKindFor(actorId),
			id: actorId
		},
		recordedAt: capturedAt,
		tool: "cutout.everything-inbox.v1"
	};
	return ok$1({
		patch: {
			sources: [source.data],
			provenance: [record]
		},
		skipped: []
	});
}
/**
* Apply a previously reviewed SourcePatch. The patch only appends sources and
* matching provenance records; it does not mutate any other Design IR entity.
*/
function applySourcePatch(document, patch, revision) {
	const existing = new Map(document.sources.map((source) => [source.id, source]));
	const appendedSources = [];
	for (const source of patch.sources) {
		const previous = existing.get(source.id);
		if (previous && JSON.stringify(previous) !== JSON.stringify(source)) return err(`Source patch conflicts with existing source id "${source.id}".`);
		if (!previous && !isDuplicate(source, [...existing.values()])) {
			existing.set(source.id, source);
			appendedSources.push(source);
		}
	}
	const sourceIds = new Set(existing.keys());
	const provenance = [...document.provenance];
	const provenanceById = new Map(provenance.map((record) => [record.id, record]));
	for (const record of patch.provenance) {
		if (!record.sourceIds.every((sourceId) => sourceIds.has(sourceId))) return err(`Provenance "${record.id}" references a source outside this patch/document.`);
		const previous = provenanceById.get(record.id);
		if (previous && JSON.stringify(previous) !== JSON.stringify(record)) return err(`Source patch conflicts with existing provenance id "${record.id}".`);
		if (!previous) {
			provenance.push(record);
			provenanceById.set(record.id, record);
		}
	}
	if (appendedSources.length === 0 && provenance.length === document.provenance.length) return ok$1(document);
	const validation = validateDesignDocument({
		...document,
		meta: {
			...document.meta,
			updatedAt: revision.createdAt
		},
		revision: {
			...document.revision,
			id: revision.id,
			number: document.revision.number + 1,
			createdAt: revision.createdAt,
			author: revision.actor
		},
		sources: [...document.sources, ...appendedSources],
		provenance
	});
	return validation.ok ? ok$1(validation.data.document) : validation;
}
async function sourceFromInput(input, capturedAt) {
	switch (input.type) {
		case "local-file": return sourceFromLocalFile(input, capturedAt);
		case "inline-text": return sourceFromInlineText(input, capturedAt);
		case "url-descriptor": return sourceFromUrlDescriptor(input, capturedAt);
		case "repository-snapshot": return sourceFromRepositorySnapshot(input, capturedAt);
	}
}
async function sourceFromLocalFile(input, capturedAt) {
	const path = safeRelativePath(input.path);
	if (!path.ok) return path;
	if (input.isSymbolicLink) return err("symbolic links are not accepted for local-file ingestion.");
	if (SECRET_PATH_PATTERN.test(path.data)) return err("Credential-shaped local-file paths are not accepted for ingestion.");
	if (input.bytes.byteLength > MAX_LOCAL_FILE_BYTES) return err(`Local files over ${MAX_LOCAL_FILE_BYTES} bytes are not accepted.`);
	if (!safePrompt(input.promptProvenance)) return err("Prompt provenance contains a credential-shaped value or is too large.");
	if (input.sourceKind === "document" || input.sourceKind === "code") {
		const text = decodeUtf8(input.bytes);
		if (!text.ok) return text;
		if (input.bytes.byteLength > MAX_INLINE_TEXT_BYTES) return err(`Text files over ${MAX_INLINE_TEXT_BYTES} bytes are not accepted.`);
	}
	const digest = await sha256$2(input.bytes);
	const mediaType = input.mediaType ?? mediaTypeFor$1(path.data, input.sourceKind);
	const id = `source:${input.sourceKind}:${digest}`;
	const title = safeTitle(input.title ?? basename$1(path.data));
	if (!title) return err("Local file title is invalid.");
	return ok$1({
		id,
		kind: input.sourceKind,
		role: input.role,
		title,
		license: input.license,
		content: [{
			id: `content:${digest}`,
			uri: `cutout://ingestion/sha256/${digest}`,
			mediaType,
			sha256: digest
		}],
		ingestion: {
			origin: "local-file",
			capturedAt,
			relativePath: path.data,
			mediaType,
			bytes: input.bytes.byteLength,
			...input.promptProvenance ? { prompt: input.promptProvenance } : {}
		}
	});
}
async function sourceFromInlineText(input, capturedAt) {
	if (!safeTitle(input.title)) return err("Inline text title is invalid.");
	if (!safePrompt(input.text) || !safePrompt(input.promptProvenance)) return err("Inline text or prompt provenance contains a credential-shaped value or is too large.");
	const bytes = new TextEncoder().encode(input.text);
	if (bytes.byteLength > MAX_INLINE_TEXT_BYTES) return err(`Inline text over ${MAX_INLINE_TEXT_BYTES} bytes is not accepted.`);
	const digest = await sha256$2(bytes);
	return ok$1({
		id: `source:${input.sourceKind}:${digest}`,
		kind: input.sourceKind,
		role: input.role,
		title: input.title.trim(),
		license: input.license,
		content: [{
			id: `content:${digest}`,
			uri: `cutout://ingestion/sha256/${digest}`,
			mediaType: "text/plain;charset=utf-8",
			sha256: digest
		}],
		ingestion: {
			origin: "inline-text",
			capturedAt,
			mediaType: "text/plain;charset=utf-8",
			bytes: bytes.byteLength,
			...input.promptProvenance ? { prompt: input.promptProvenance } : {}
		}
	});
}
async function sourceFromUrlDescriptor(input, capturedAt) {
	const parsed = safeHttpUrl(input.url);
	if (!parsed.ok) return parsed;
	if (!safePrompt(input.promptProvenance)) return err("Prompt provenance contains a credential-shaped value or is too large.");
	const title = input.title ? safeTitle(input.title) : parsed.data.hostname;
	if (!title) return err("URL descriptor title is invalid.");
	const digest = await sha256$2(new TextEncoder().encode(parsed.data.toString()));
	return ok$1({
		id: `source:url:${digest}`,
		kind: "url",
		role: input.role,
		title,
		license: input.license,
		content: [{
			id: `content:${digest}`,
			uri: parsed.data.toString(),
			mediaType: input.capturedMediaType,
			sha256: digest
		}],
		ingestion: {
			origin: "url-descriptor",
			capturedAt,
			url: parsed.data.toString(),
			mediaType: input.capturedMediaType,
			descriptor: {
				kind: "url",
				url: parsed.data.toString(),
				...input.title ? { title } : {},
				...input.capturedMediaType ? { capturedMediaType: input.capturedMediaType } : {}
			},
			...input.promptProvenance ? { prompt: input.promptProvenance } : {}
		}
	});
}
async function sourceFromRepositorySnapshot(input, capturedAt) {
	if (!safeTitle(input.label)) return err("Repository snapshot label is invalid.");
	if (!safePrompt(input.promptProvenance)) return err("Prompt provenance contains a credential-shaped value or is too large.");
	if (input.entries.length > MAX_REPOSITORY_ENTRIES$1) return err(`Repository inventories over ${MAX_REPOSITORY_ENTRIES$1} entries are not accepted.`);
	const included = [];
	const safeEntries = [];
	let excludedCount = 0;
	for (const entry of input.entries) {
		const path = safeRelativePath(entry.path);
		if (!path.ok || entry.isSymbolicLink || entry.bytes < 0 || !Number.isSafeInteger(entry.bytes)) {
			excludedCount += 1;
			continue;
		}
		if (SECRET_PATH_PATTERN.test(path.data) || SKIPPED_REPOSITORY_DIRECTORY.test(path.data) || !isRepositoryEntryAllowed(path.data, entry.mediaType) || entry.sha256 !== void 0 && !isSha256(entry.sha256)) {
			excludedCount += 1;
			continue;
		}
		included.push(path.data);
		safeEntries.push({
			path: path.data,
			bytes: entry.bytes,
			...entry.mediaType ? { mediaType: entry.mediaType } : {},
			...entry.sha256 ? { sha256: entry.sha256.toLowerCase() } : {}
		});
	}
	included.sort();
	safeEntries.sort((left, right) => left.path.localeCompare(right.path));
	const descriptor = JSON.stringify({
		label: input.label.trim(),
		entries: safeEntries,
		excludedCount
	});
	const digest = await sha256$2(new TextEncoder().encode(descriptor));
	return ok$1({
		id: `source:repository:${digest}`,
		kind: "repository",
		role: input.role,
		title: `Repository snapshot: ${input.label.trim()}`,
		license: input.license,
		content: [{
			id: `content:${digest}`,
			uri: `cutout://repository-snapshot/${digest}`,
			mediaType: "application/vnd.cutout.repository-inventory+json",
			sha256: digest
		}],
		ingestion: {
			origin: "repository-snapshot",
			capturedAt,
			descriptor: {
				kind: "repository",
				label: input.label.trim(),
				includedPaths: included,
				excludedCount,
				...safeEntries.some((entry) => entry.sha256) ? { entries: safeEntries } : {}
			},
			...input.promptProvenance ? { prompt: input.promptProvenance } : {}
		}
	});
}
function isDuplicate(candidate, existing) {
	const candidateRefs = new Set(candidate.content.map((ref) => ref.sha256 ?? ref.uri));
	return existing.some((source) => source.content.some((ref) => candidateRefs.has(ref.sha256 ?? ref.uri)));
}
function safeRelativePath(value) {
	if (!value || value.includes("\0") || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) return err("Only non-empty relative paths are accepted.");
	const parts = value.replaceAll("\\", "/").split("/");
	if (parts.some((part) => !part || part === "." || part === "..")) return err("Path traversal is not accepted.");
	return ok$1(parts.join("/"));
}
function safeHttpUrl(value) {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") return err("Only HTTP(S) URL descriptors are accepted.");
		if (url.username || url.password) return err("URL descriptors cannot contain credentials.");
		return ok$1(url);
	} catch {
		return err("Invalid URL descriptor.");
	}
}
function decodeUtf8(bytes) {
	try {
		return ok$1(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return err("Document/code input must be valid UTF-8.");
	}
}
function safePrompt(value) {
	return value === void 0 || value.length > 0 && value.length <= 2e4 && !value.includes("\0") && !CREDENTIAL_PATTERN.test(value);
}
function safeTitle(value) {
	const title = value.trim();
	return title.length > 0 && title.length <= 200 && !title.includes("\0") ? title : null;
}
function basename$1(path) {
	return path.split("/").at(-1) ?? path;
}
function stableSuffix(id) {
	return id.replace(/^source:/, "").slice(0, 130);
}
function isSafeId(id) {
	return id.length > 0 && id.length <= 160 && !id.includes("\0");
}
function isSha256(value) {
	return /^[a-f0-9]{64}$/i.test(value);
}
function actorKindFor(id) {
	if (id.startsWith("system:")) return "system";
	if (id.startsWith("agent:")) return "agent";
	return "human";
}
function isIsoDate(value) {
	return Number.isFinite(Date.parse(value)) && /Z$/.test(value);
}
function isRepositoryEntryAllowed(path, mediaType) {
	return !mediaType?.startsWith("image/") && !mediaType?.startsWith("video/") && (ALLOWLISTED_CONFIG$1.test(path) || SOURCE_FILE$1.test(path));
}
function mediaTypeFor$1(path, kind) {
	return {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		webp: "image/webp",
		gif: "image/gif",
		svg: "image/svg+xml",
		mp4: "video/mp4",
		webm: "video/webm",
		mov: "video/quicktime",
		md: "text/markdown;charset=utf-8",
		txt: "text/plain;charset=utf-8",
		ts: "text/typescript;charset=utf-8",
		tsx: "text/typescript;charset=utf-8",
		js: "text/javascript;charset=utf-8",
		jsx: "text/javascript;charset=utf-8"
	}[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? (kind === "video" ? "video/*" : kind === "screenshot" || kind === "photo" ? "image/*" : "application/octet-stream");
}
async function sha256$2(bytes) {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region src/starter-compiler/compiler.ts
/**
* Starter Compiler v1 turns verified design facts into a deterministic export
* plan. It never executes candidate code, accesses the filesystem, or fetches
* assets. A host can later apply the plan through StarterExportAdapter.
*/
var sha256Schema$1 = string().regex(/^[a-f0-9]{64}$/i);
var safeRelativePathSchema = string().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Expected a safe relative path.").refine((path) => !path.split("/").some((segment) => segment === "." || segment === ".." || segment.length === 0), "Expected a safe relative path.").refine((path) => !path.startsWith("/"), "Expected a safe relative path.");
var starterFrameworkSchema = _enum([
	"next-app-router",
	"vite-react",
	"nuxt",
	"tanstack-start"
]);
var starterMergePolicySchema = literal("fail");
var starterAssetBindingSchema = object({
	candidateId: string().min(1).max(160),
	materialId: string().min(1).max(160),
	revisionId: string().min(1).max(160),
	/** Relative to `public/`; a compiler host controls actual copying. */
	outputPath: safeRelativePathSchema
}).strict();
var starterCompilerInputSchema = object({
	framework: starterFrameworkSchema,
	document: unknown(),
	kit: designKitSchema,
	/** Canonical public manifest emitted by components-compiler. */
	candidates: componentManifestSchema,
	assetBindings: array(starterAssetBindingSchema).max(1e4).default([]),
	/** v1 deliberately refuses all collision merging. */
	mergePolicy: starterMergePolicySchema,
	/** Existing target paths are declarative collision checks, never read from disk. */
	existingPaths: array(safeRelativePathSchema).max(1e4).default([])
}).strict();
var starterFileSchema = object({
	path: safeRelativePathSchema,
	content: string(),
	sha256: sha256Schema$1
}).strict();
var starterAssetSchema = object({
	outputPath: safeRelativePathSchema,
	candidateId: string().min(1),
	materialId: string().min(1),
	revisionId: string().min(1),
	contentId: string().min(1),
	sourceUri: string().min(1),
	sha256: sha256Schema$1.optional(),
	mediaType: string().min(1).optional()
}).strict();
var starterPlanSchema = object({
	version: literal("starter-plan.v1"),
	framework: starterFrameworkSchema,
	mergePolicy: starterMergePolicySchema,
	source: object({
		documentId: string().min(1),
		revisionId: string().min(1),
		documentFingerprint: sha256Schema$1,
		designKitFingerprint: sha256Schema$1,
		candidateManifestFingerprint: sha256Schema$1
	}).strict(),
	files: array(starterFileSchema),
	assets: array(starterAssetSchema)
}).strict();
/** Compile an auditable in-memory plan. No arbitrary source code is accepted. */
async function compileStarter(input) {
	const parsed = starterCompilerInputSchema.parse(input);
	const documentValidation = validateDesignDocument(parsed.document);
	if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`);
	const document = documentValidation.data.document;
	assertSafeCssTokens(document);
	const documentFingerprint = await fingerprint(document);
	await validateDesignKit$1(document, parsed.kit, documentFingerprint);
	const manifest = await validateComponentManifest(document, parsed.candidates);
	const candidates = resolveCandidates(document, manifest);
	const assets = resolveAssets(document, candidates, parsed.assetBindings);
	const fileContent = [
		...renderKitFiles(parsed.kit),
		...parsed.framework === "nuxt" ? renderNuxtSharedFiles(document, manifest, candidates, assets) : renderSharedFiles(document, manifest, candidates, assets),
		...parsed.framework === "next-app-router" ? renderNextFiles(document, candidates) : parsed.framework === "vite-react" ? renderViteFiles(document, candidates) : parsed.framework === "nuxt" ? renderNuxtFiles(document, candidates) : renderTanStackFiles(document, candidates)
	];
	const files = await Promise.all(fileContent.map(async (entry) => ({
		...entry,
		sha256: await sha256Text(entry.content)
	})));
	assertNoCollisions(files, assets, parsed.existingPaths);
	const plan = {
		version: "starter-plan.v1",
		framework: parsed.framework,
		mergePolicy: parsed.mergePolicy,
		source: {
			documentId: document.meta.id,
			revisionId: document.revision.id,
			documentFingerprint,
			designKitFingerprint: await fingerprint(parsed.kit),
			candidateManifestFingerprint: await fingerprint(normalizeManifest(manifest))
		},
		files: files.sort(comparePath),
		assets: [...assets].sort((left, right) => compareText(left.outputPath, right.outputPath))
	};
	const validated = starterPlanSchema.parse(plan);
	validateStarterPlanStructure(validated);
	return validated;
}
/** Offline equivalent to a framework build when consumer packages are absent. */
function validateStarterPlanStructure(planInput) {
	const plan = starterPlanSchema.parse(planInput);
	const files = new Map(plan.files.map((file) => [file.path, file.content]));
	for (const required of [
		"package.json",
		"README.md",
		"AGENTS.md",
		"components.manifest.json",
		"design-kit/tokens.css"
	]) if (!files.has(required)) throw new Error(`Starter is missing required file "${required}".`);
	const pkg = JSON.parse(files.get("package.json"));
	if (pkg.private !== true || !pkg.scripts?.dev || !pkg.scripts?.build) throw new Error("Starter package must be private and declare dev/build scripts.");
	if (plan.framework === "nuxt") {
		for (const required of [
			"nuxt.config.ts",
			"app.vue",
			"cutout.registry.json"
		]) if (!files.has(required)) throw new Error(`Nuxt starter is missing "${required}".`);
		if (![...files.keys()].some((path) => path.startsWith("pages/") && path.endsWith(".vue"))) throw new Error("Nuxt starter has no file-based page.");
		if (![...files.keys()].some((path) => path.startsWith("components/generated/") && path.endsWith(".vue"))) throw new Error("Nuxt starter has no native Vue component.");
	}
	if (plan.framework === "tanstack-start") {
		for (const required of [
			"src/main.tsx",
			"src/router.tsx",
			"vite.config.ts",
			"index.html",
			"cutout.registry.json"
		]) if (!files.has(required)) throw new Error(`TanStack starter is missing "${required}".`);
		const router = files.get("src/router.tsx");
		if (!router.includes("createRouter({ routeTree })") || !router.includes("createRoute(")) throw new Error("TanStack starter has no explicit route tree.");
	}
	if (plan.files.some((file) => /\b(?:TODO|placeholder)\b/i.test(file.content))) throw new Error("Starter contains placeholder implementation content.");
}
async function validateDesignKit$1(document, kit, documentFingerprint) {
	if (kit.source.documentId !== document.meta.id || kit.source.revisionId !== document.revision.id) throw new Error("Design Kit does not belong to this DesignDocument revision.");
	if (kit.source.documentFingerprint !== documentFingerprint) throw new Error("Design Kit document fingerprint does not match this DesignDocument.");
	const paths = /* @__PURE__ */ new Set();
	for (const file of kit.files) {
		if (paths.has(file.path)) throw new Error(`Design Kit contains duplicate file "${file.path}".`);
		paths.add(file.path);
		if (file.sourceFingerprint !== documentFingerprint) throw new Error(`Design Kit file "${file.path}" does not match this DesignDocument fingerprint.`);
		if (file.provenance.documentId !== document.meta.id || file.provenance.revisionId !== document.revision.id) throw new Error(`Design Kit file "${file.path}" has mismatched provenance.`);
		if (await sha256Text(file.content) !== file.sha256) throw new Error(`Design Kit file "${file.path}" has an invalid content digest.`);
	}
}
function resolveCandidates(document, manifest) {
	const componentById = new Map(document.components.map((component) => [component.id, component]));
	const tokenIds = new Set(document.tokens.map((token) => token.id));
	const candidateIds = /* @__PURE__ */ new Set();
	const exports = /* @__PURE__ */ new Set();
	const resolved = [];
	for (const candidate of manifest.candidates) {
		if (candidateIds.has(candidate.id)) throw new Error(`Component candidate "${candidate.id}" is declared more than once.`);
		candidateIds.add(candidate.id);
		const exportName = toExportName(candidate.name, candidate.id);
		if (exports.has(exportName)) throw new Error(`Component candidates use duplicate export "${exportName}".`);
		exports.add(exportName);
		if (candidate.status !== "ready") throw new Error(`Component candidate "${candidate.id}" is not ready for starter export.`);
		const component = componentById.get(candidate.id);
		if (!component) throw new Error(`Component candidate "${candidate.id}" references unknown component "${candidate.id}".`);
		if (component.status !== "ready") throw new Error(`Component "${component.id}" is not ready for starter export.`);
		const declaredTokens = new Set(component.tokenIds);
		const candidateTokenIds = /* @__PURE__ */ new Set();
		for (const tokenId of candidate.tokenRefs) {
			if (candidateTokenIds.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references token "${tokenId}" more than once.`);
			candidateTokenIds.add(tokenId);
			if (!tokenIds.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references unknown token "${tokenId}".`);
			if (!declaredTokens.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references token "${tokenId}" not declared by component "${component.id}".`);
		}
		resolved.push({
			id: candidate.id,
			componentId: component.id,
			exportName,
			name: component.name,
			...component.description ? { description: component.description } : {},
			tokenIds: [...candidateTokenIds].sort(compareText),
			props: candidate.props,
			variants: candidate.variants,
			slots: candidate.slots,
			sourcePageIds: candidate.sourcePageIds
		});
	}
	return resolved.sort((left, right) => compareText(left.exportName, right.exportName));
}
function resolveAssets(document, candidates, bindings) {
	const revisions = /* @__PURE__ */ new Map();
	for (const material of document.materials) for (const revision of material.revisions) revisions.set(`${material.id}\u0000${revision.id}`, {
		materialId: material.id,
		revisionId: revision.id,
		content: revision.content
	});
	const outputPaths = /* @__PURE__ */ new Set();
	const assets = [];
	const candidateIds = new Set(candidates.map((candidate) => candidate.id));
	const bindingIds = /* @__PURE__ */ new Set();
	for (const assetRef of bindings) {
		if (!candidateIds.has(assetRef.candidateId)) throw new Error(`Starter asset binding references unknown ready candidate "${assetRef.candidateId}".`);
		const bindingKey = `${assetRef.candidateId}\u0000${assetRef.materialId}\u0000${assetRef.revisionId}\u0000${assetRef.outputPath}`;
		if (bindingIds.has(bindingKey)) throw new Error(`Starter asset binding is declared more than once for "${assetRef.outputPath}".`);
		bindingIds.add(bindingKey);
		const source = revisions.get(`${assetRef.materialId}\u0000${assetRef.revisionId}`);
		if (!source) throw new Error(`Starter asset binding references unknown material revision "${assetRef.materialId}/${assetRef.revisionId}".`);
		const outputPath = `public/${assetRef.outputPath}`;
		if (outputPaths.has(outputPath)) throw new Error(`Starter asset output path collides: "${outputPath}".`);
		outputPaths.add(outputPath);
		assets.push({
			outputPath,
			candidateId: assetRef.candidateId,
			materialId: source.materialId,
			revisionId: source.revisionId,
			contentId: source.content.id,
			sourceUri: source.content.uri,
			...source.content.sha256 ? { sha256: source.content.sha256 } : {},
			...source.content.mediaType ? { mediaType: source.content.mediaType } : {}
		});
	}
	return assets;
}
function renderKitFiles(kit) {
	return kit.files.map((file) => ({
		path: `design-kit/${file.path}`,
		content: file.content
	}));
}
function renderSharedFiles(document, manifest, candidates, assets) {
	return [
		{
			path: "components.manifest.json",
			content: `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`
		},
		{
			path: "src/theme.ts",
			content: [
				"/** Generated Design Kit bridge. */",
				"export { theme } from '../design-kit/theme'",
				"export type { Theme } from '../design-kit/theme'",
				""
			].join("\n")
		},
		{
			path: "src/env.d.ts",
			content: "declare module '*.css'\n"
		},
		...candidates.map((candidate) => ({
			path: `src/components/${candidate.exportName}.tsx`,
			content: renderComponent(document, candidate, assets)
		})),
		{
			path: "src/components/generated.css",
			content: renderComponentCss(document, candidates)
		}
	];
}
function renderNextFiles(document, candidates) {
	const pages = document.prototype?.plan.pages ?? [];
	return [
		{
			path: "package.json",
			content: renderPackageJson("next-app-router", document.meta.title)
		},
		{
			path: "tsconfig.json",
			content: `${JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					lib: [
						"dom",
						"dom.iterable",
						"es2022"
					],
					strict: true,
					noEmit: true,
					jsx: "preserve",
					module: "esnext",
					moduleResolution: "bundler",
					resolveJsonModule: true,
					isolatedModules: true
				},
				include: [
					"**/*.ts",
					"**/*.tsx",
					".next/types/**/*.ts"
				]
			}, null, 2)}\n`
		},
		{
			path: "app/globals.css",
			content: "@import \"../design-kit/tailwind.css\";\n@import \"../design-kit/tokens.css\";\n@import \"../src/components/generated.css\";\n\n:root { color-scheme: light; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: var(--cutout-typography-sans, system-ui, sans-serif); }\n"
		},
		{
			path: "app/layout.tsx",
			content: `import type { ReactNode } from 'react'\nimport './globals.css'\n\nexport default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {\n  return <html lang="en"><body>{children}</body></html>\n}\n`
		},
		...pages.map((page) => ({
			path: nextPagePath(page.route),
			content: renderPage(document, page, candidates, nextImportPrefix(page.route))
		})),
		{
			path: "README.md",
			content: renderReadme(document, "Next.js App Router")
		},
		{
			path: "AGENTS.md",
			content: renderAgents("Next.js App Router")
		}
	];
}
function renderViteFiles(document, candidates) {
	return [
		{
			path: "package.json",
			content: renderPackageJson("vite-react", document.meta.title)
		},
		{
			path: "tsconfig.json",
			content: `${JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					useDefineForClassFields: true,
					lib: [
						"dom",
						"dom.iterable",
						"es2022"
					],
					strict: true,
					noEmit: true,
					jsx: "react-jsx",
					module: "esnext",
					moduleResolution: "bundler",
					resolveJsonModule: true,
					isolatedModules: true
				},
				include: ["src"]
			}, null, 2)}\n`
		},
		{
			path: "index.html",
			content: "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" /><title>Cutout starter</title></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"><\/script></body></html>\n"
		},
		{
			path: "vite.config.ts",
			content: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n"
		},
		{
			path: "src/styles.css",
			content: "@import \"../design-kit/tailwind.css\";\n@import \"../design-kit/tokens.css\";\n@import \"./components/generated.css\";\n\n:root { color-scheme: light; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: var(--cutout-typography-sans, system-ui, sans-serif); }\n"
		},
		{
			path: "src/main.tsx",
			content: "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './styles.css'\nimport { App } from './App'\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)\n"
		},
		{
			path: "src/App.tsx",
			content: renderViteRouter(document, candidates)
		},
		{
			path: "README.md",
			content: renderReadme(document, "Vite + React")
		},
		{
			path: "AGENTS.md",
			content: renderAgents("Vite + React")
		}
	];
}
function renderNuxtSharedFiles(document, manifest, candidates, assets) {
	return [
		{
			path: "components.manifest.json",
			content: `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`
		},
		...candidates.map((candidate) => ({
			path: `components/generated/${candidate.exportName}.vue`,
			content: renderVueComponent(candidate, assets)
		})),
		{
			path: "assets/css/generated.css",
			content: renderComponentCss(document, candidates)
		}
	];
}
function renderNuxtFiles(document, candidates) {
	const pages = document.prototype?.plan.pages ?? [];
	return [
		{
			path: "package.json",
			content: renderPackageJson("nuxt", document.meta.title)
		},
		{
			path: "nuxt.config.ts",
			content: "export default defineNuxtConfig({ css: ['~/design-kit/tailwind.css', '~/design-kit/tokens.css', '~/assets/css/generated.css'], devtools: { enabled: true }, typescript: { strict: true } })\n"
		},
		{
			path: "tsconfig.json",
			content: `${JSON.stringify({ extends: "./.nuxt/tsconfig.json" }, null, 2)}\n`
		},
		{
			path: "app.vue",
			content: "<template><NuxtPage /></template>\n"
		},
		...pages.map((page) => ({
			path: nuxtPagePath(page.route),
			content: renderNuxtPage(document, page, candidates)
		})),
		{
			path: "README.md",
			content: renderReadme(document, "Nuxt")
		},
		{
			path: "AGENTS.md",
			content: renderAgents("Nuxt")
		},
		{
			path: "cutout.registry.json",
			content: registryMetadata("nuxt", document, pages.map((page) => page.route), candidates)
		}
	];
}
function renderTanStackFiles(document, candidates) {
	const pages = document.prototype?.plan.pages ?? [];
	return [
		{
			path: "package.json",
			content: renderPackageJson("tanstack-start", document.meta.title)
		},
		{
			path: "tsconfig.json",
			content: `${JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					lib: [
						"dom",
						"dom.iterable",
						"es2022"
					],
					strict: true,
					noEmit: true,
					jsx: "react-jsx",
					module: "esnext",
					moduleResolution: "bundler",
					isolatedModules: true
				},
				include: ["src"]
			}, null, 2)}\n`
		},
		{
			path: "vite.config.ts",
			content: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n"
		},
		{
			path: "index.html",
			content: "<!doctype html><html><head><meta charset=\"UTF-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"><\/script></body></html>\n"
		},
		{
			path: "src/styles.css",
			content: "@import \"../design-kit/tailwind.css\";\n@import \"../design-kit/tokens.css\";\n@import \"./components/generated.css\";\n"
		},
		{
			path: "src/main.tsx",
			content: "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { RouterProvider } from '@tanstack/react-router'\nimport { router } from './router'\nimport './styles.css'\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)\n"
		},
		{
			path: "src/router.tsx",
			content: renderTanStackRouter(pages, candidates)
		},
		{
			path: "README.md",
			content: renderReadme(document, "TanStack Start")
		},
		{
			path: "AGENTS.md",
			content: renderAgents("TanStack Start")
		},
		{
			path: "cutout.registry.json",
			content: registryMetadata("tanstack-start", document, pages.map((page) => page.route), candidates)
		}
	];
}
function renderVueComponent(candidate, assets) {
	const asset = assets.find((item) => item.candidateId === candidate.id);
	return `<script setup lang="ts">\ninterface Props { eyebrow?: string }\nwithDefaults(defineProps<Props>(), { eyebrow: '' })\n<\/script>\n\n<template>\n  <section class="cutout-component cutout-${slug(candidate.name)}" data-cutout-component="${escapeHtmlAttribute(candidate.componentId)}">\n    <div class="cutout-component__content"><h2>${escapeJsxText(candidate.name)}</h2><p>${escapeJsxText(candidate.description ?? candidate.name)}</p><p v-if="eyebrow">{{ eyebrow }}</p><slot name="actions" /></div>\n${asset ? `    <img class="cutout-component__asset" src="/${escapeHtmlAttribute(asset.outputPath.replace(/^public\//, ""))}" alt="" data-material-id="${escapeHtmlAttribute(asset.materialId)}" />\n` : ""}  </section>\n</template>\n`;
}
function renderNuxtPage(document, page, candidates) {
	const names = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id)).map((candidate) => candidate.exportName);
	return `<template>\n  <main class="cutout-page" data-cutout-page="${escapeHtmlAttribute(page.id)}">\n    <header class="cutout-page__header"><p class="cutout-page__purpose">${escapeJsxText(page.purpose)}</p><h1>${escapeJsxText(page.name)}</h1><p>${escapeJsxText(document.needs[0]?.statement ?? document.prototype?.plan.product.summary ?? "")}</p></header>\n${names.map((name) => `    <Generated${name} />`).join("\n")}\n  </main>\n</template>\n`;
}
function renderTanStackRouter(pages, candidates) {
	const imports = candidates.map((candidate) => `import { ${candidate.exportName} } from './components/${candidate.exportName}'`);
	const routes = pages.map((page, index) => {
		const components = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id)).map((candidate) => `<${candidate.exportName} />`).join("");
		return `const route${index} = createRoute({ getParentRoute: () => rootRoute, path: ${JSON.stringify(page.route)}, component: () => <main className="cutout-page" data-cutout-page=${JSON.stringify(page.id)}><header className="cutout-page__header"><p>${escapeJsxText(page.purpose)}</p><h1>${escapeJsxText(page.name)}</h1></header>${components}</main> })`;
	});
	return [
		`import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'`,
		...imports,
		"",
		"const rootRoute = createRootRoute()",
		...routes,
		`const routeTree = rootRoute.addChildren([${pages.map((_, index) => `route${index}`).join(", ")}])`,
		"export const router = createRouter({ routeTree })",
		"declare module '@tanstack/react-router' { interface Register { router: typeof router } }",
		""
	].join("\n");
}
function nuxtPagePath(route) {
	const normalized = route.replace(/^\/+|\/+$/g, "");
	if (!normalized) return "pages/index.vue";
	if (!normalized.split("/").every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) throw new Error(`Prototype route "${route}" cannot be represented as a safe Nuxt path.`);
	return `pages/${normalized}.vue`;
}
function registryMetadata(framework, document, routes, candidates) {
	return `${JSON.stringify({
		version: "cutout.starter-registry.v1",
		framework,
		source: {
			documentId: document.meta.id,
			revisionId: document.revision.id
		},
		routes,
		components: candidates.map(({ id, exportName, tokenIds }) => ({
			id,
			exportName,
			tokenIds
		}))
	}, null, 2)}\n`;
}
function renderComponent(document, candidate, assets) {
	const region = (document.prototype?.plan.pages.filter((page) => candidate.sourcePageIds.includes(page.id)) ?? []).flatMap((page) => page.regions).find((entry) => regionMatchesCandidate(candidate.name, entry));
	const props = [...candidate.props, ...candidate.variants.map((variant) => ({
		name: variant.name,
		type: "enum",
		required: false,
		values: variant.values
	}))];
	const api = [...props.map(renderPropType), ...candidate.slots.map((slot) => `${slot.name}${slot.required ? "" : "?"}: ReactNode`)];
	const destructured = [...props.map(renderPropDefault).filter(Boolean), ...candidate.slots.map((slot) => slot.name)].join(", ");
	const candidateAssets = assets.filter((asset) => assetForCandidate(document, candidate.id, asset));
	const tag = semanticTag(region?.role ?? candidate.name);
	const slotMarkup = candidate.slots.map((slot) => `      {${slot.name} ? <div data-cutout-slot=${JSON.stringify(slot.name)}>{${slot.name}}</div> : null}`);
	const propMarkup = props.filter((prop) => prop.type === "string").map((prop) => `      {${prop.name} ? <p data-cutout-prop=${JSON.stringify(prop.name)}>{${prop.name}}</p> : null}`);
	return [
		"import type { ReactNode } from 'react'",
		"",
		`export interface ${candidate.exportName}Props {`,
		...api.map((line) => `  ${line}`),
		"}",
		"",
		`export function ${candidate.exportName}({ ${destructured} }: ${candidate.exportName}Props) {`,
		`  return <${tag} className=${JSON.stringify(`cutout-component cutout-${slug(candidate.name)}`)} data-cutout-component=${JSON.stringify(candidate.componentId)}${region ? ` data-cutout-region=${JSON.stringify(region.id)}` : ""}>`,
		`    <div className="cutout-component__content">`,
		`      <h2>${escapeJsxText(region?.name ?? candidate.name)}</h2>`,
		`      <p>${escapeJsxText(candidate.description ?? region?.summary ?? candidate.name)}</p>`,
		...propMarkup,
		...slotMarkup,
		"    </div>",
		...candidateAssets.map((asset) => `    <img className="cutout-component__asset" src=${JSON.stringify(`/${asset.outputPath.replace(/^public\//, "")}`)} alt="" data-material-id=${JSON.stringify(asset.materialId)} />`),
		`  </${tag}>`,
		"}",
		""
	].join("\n");
}
function renderPage(document, page, candidates, importPrefix, named = false) {
	const pageCandidates = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id));
	const imports = pageCandidates.map((candidate) => `import { ${candidate.exportName} } from '${importPrefix}${candidate.exportName}'`);
	const matched = page.regions.flatMap((region) => pageCandidates.filter((candidate) => candidateForRegion(candidate, region, page)));
	const components = [...matched, ...pageCandidates.filter((candidate) => !matched.includes(candidate))].map((candidate) => `      <${candidate.exportName} />`);
	const needs = document.needs.map((need) => need.statement);
	return [
		...imports,
		imports.length > 0 ? "" : void 0,
		`${named ? "export function App" : "export default function Page"}() {`,
		`  return <main className="cutout-page" data-cutout-page=${JSON.stringify(page.id)}>`,
		"    <header className=\"cutout-page__header\">",
		`      <p className="cutout-page__purpose">${escapeJsxText(page.purpose)}</p>`,
		`      <h1>${escapeJsxText(page.name)}</h1>`,
		`      <p>${escapeJsxText(needs[0] ?? document.prototype?.plan.product.summary ?? "")}</p>`,
		"    </header>",
		...components,
		"  </main>",
		"}",
		""
	].filter((line) => line !== void 0).join("\n");
}
function renderViteRouter(document, candidates) {
	const pages = document.prototype?.plan.pages ?? [];
	const imports = candidates.map((candidate) => `import { ${candidate.exportName} } from './components/${candidate.exportName}'`);
	const cases = pages.map((page) => {
		const children = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id)).map((candidate) => `        <${candidate.exportName} />`);
		return [
			`    case ${JSON.stringify(page.route)}:`,
			`      return <main className="cutout-page" data-cutout-page=${JSON.stringify(page.id)}>`,
			`        <header className="cutout-page__header"><p className="cutout-page__purpose">${escapeJsxText(page.purpose)}</p><h1>${escapeJsxText(page.name)}</h1><p>${escapeJsxText(document.needs[0]?.statement ?? document.prototype?.plan.product.summary ?? "")}</p></header>`,
			...children,
			"      </main>"
		].join("\n");
	});
	return [
		...imports,
		"",
		"export function App() {",
		"  const route = window.location.pathname.replace(/\\/$/, '') || '/'",
		"  switch (route) {",
		...cases,
		"    default:",
		"      return <main className=\"cutout-page\"><h1>Page not found</h1></main>",
		"  }",
		"}",
		""
	].join("\n");
}
function renderComponentCss(document, candidates) {
	const color = document.tokens.find((token) => token.kind === "color" && candidates.some((candidate) => candidate.tokenIds.includes(token.id)));
	const radius = document.tokens.find((token) => token.kind === "radius" && candidates.some((candidate) => candidate.tokenIds.includes(token.id)));
	return `.cutout-page { min-height: 100vh; padding: clamp(1.5rem, 4vw, 4rem); background: #fff; color: #111827; }\n.cutout-page__header { max-width: 72rem; margin: 0 auto 2rem; }\n.cutout-page__purpose { color: ${color ? `var(--cutout-token-${slug(color.name)})` : "#4b5563"}; font-weight: 600; }\n.cutout-component { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: center; max-width: 72rem; margin: 0 auto 1rem; padding: clamp(1.5rem, 4vw, 3rem); border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: ${radius ? `var(--cutout-token-${slug(radius.name)})` : "0.5rem"}; }\n.cutout-component__content { max-width: 44rem; }\n.cutout-component__asset { display: block; max-width: min(20rem, 35vw); height: auto; }\n@media (max-width: 640px) { .cutout-component { grid-template-columns: 1fr; } .cutout-component__asset { max-width: 100%; } }\n`;
}
function renderPackageJson(framework, title) {
	const packageJson = framework === "next-app-router" ? {
		name: packageName(title),
		private: true,
		scripts: {
			dev: "next dev",
			build: "next build",
			start: "next start",
			lint: "next lint"
		},
		dependencies: {
			next: "^16.0.0",
			react: "^19.0.0",
			"react-dom": "^19.0.0"
		},
		devDependencies: {
			typescript: "^5.0.0",
			"@types/node": "^22.0.0",
			"@types/react": "^19.0.0",
			"@types/react-dom": "^19.0.0"
		}
	} : framework === "vite-react" ? {
		name: packageName(title),
		private: true,
		scripts: {
			dev: "vite",
			build: "tsc -b && vite build",
			preview: "vite preview"
		},
		dependencies: {
			react: "^19.0.0",
			"react-dom": "^19.0.0"
		},
		devDependencies: {
			"@vitejs/plugin-react": "^5.0.0",
			typescript: "^5.0.0",
			vite: "^7.0.0",
			"@types/react": "^19.0.0",
			"@types/react-dom": "^19.0.0"
		}
	} : framework === "nuxt" ? {
		name: packageName(title),
		private: true,
		scripts: {
			dev: "nuxt dev",
			build: "nuxt build",
			preview: "nuxt preview",
			typecheck: "nuxt typecheck"
		},
		dependencies: {
			nuxt: "^4.0.0",
			vue: "^3.5.0",
			"vue-router": "^4.5.0"
		},
		devDependencies: {
			typescript: "^5.0.0",
			"vue-tsc": "^3.0.0"
		}
	} : {
		name: packageName(title),
		private: true,
		scripts: {
			dev: "vite",
			build: "tsc -b && vite build",
			preview: "vite preview"
		},
		dependencies: {
			"@tanstack/react-router": "^1.0.0",
			react: "^19.0.0",
			"react-dom": "^19.0.0"
		},
		devDependencies: {
			"@vitejs/plugin-react": "^5.0.0",
			typescript: "^5.0.0",
			vite: "^7.0.0",
			"@types/react": "^19.0.0",
			"@types/react-dom": "^19.0.0"
		}
	};
	return `${JSON.stringify(packageJson, null, 2)}\n`;
}
function renderPropType(prop) {
	const optional = prop.required ? "" : "?";
	const type = prop.type === "enum" ? prop.values.map((value) => JSON.stringify(value)).join(" | ") : prop.type;
	return `${prop.name}${optional}: ${type}`;
}
function renderPropDefault(prop) {
	if ("defaultValue" in prop && prop.defaultValue !== void 0) return `${prop.name} = ${JSON.stringify(prop.defaultValue)}`;
	return prop.name;
}
function semanticTag(role) {
	const normalized = role.toLowerCase();
	if (normalized.includes("nav")) return "nav";
	if (normalized.includes("header") || normalized.includes("hero")) return "header";
	if (normalized.includes("footer")) return "footer";
	if (normalized.includes("aside") || normalized.includes("sidebar")) return "aside";
	return "section";
}
function candidateForRegion(candidate, region, page) {
	return candidate.sourcePageIds.includes(page.id) && regionMatchesCandidate(candidate.name, region);
}
function regionMatchesCandidate(candidateName, region) {
	const name = slug(candidateName);
	return name === slug(region.name) || name === slug(region.role);
}
function assetForCandidate(_document, candidateId, asset) {
	return asset.candidateId === candidateId;
}
function nextPagePath(route) {
	const normalized = route.replace(/^\/+|\/+$/g, "");
	if (!normalized) return "app/page.tsx";
	if (!normalized.split("/").every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) throw new Error(`Prototype route "${route}" cannot be represented as a safe Next App Router path.`);
	return `app/${normalized}/page.tsx`;
}
function nextImportPrefix(route) {
	const depth = route.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).length;
	return `${"../".repeat(depth + 1)}src/components/`;
}
function escapeJsxText(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/{/g, "&#123;").replace(/}/g, "&#125;");
}
function escapeHtmlAttribute(value) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function assertSafeCssTokens(document) {
	for (const token of document.tokens) if (/[{};@<>\r\n]/.test(token.value) || /(?:url|expression)\s*\(/i.test(token.value)) throw new Error(`Design token "${token.id}" contains an unsafe CSS value.`);
}
function slug(value) {
	return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}
function renderReadme(document, framework) {
	return `# ${escapeMarkdown(document.meta.title)}\n\nGenerated by Cutout Starter Compiler v1 for ${framework}.\n\n- Design tokens live in \`design-kit/\`.\n- Component provenance lives in \`components.manifest.json\`.\n- Assets are listed in the Starter Plan and must be copied by a trusted export host.\n- Do not edit generated Design Kit artifacts by hand; update the Design IR and recompile.\n`;
}
function renderAgents(framework) {
	return `# Agent Instructions\n\nThis is a ${framework} starter generated from a Cutout Design IR revision.\n\n- Treat \`design-kit/\` and \`components.manifest.json\` as generated, reviewable inputs.\n- Use Design IR / token changes rather than mutating generated token artifacts.\n- Do not fetch, execute, or trust asset URIs directly; a trusted export host resolves plan assets.\n- Preserve component provenance when changing generated component internals.\n`;
}
function normalizeManifest(manifest) {
	return {
		version: manifest.version,
		source: manifest.source,
		candidates: normalizeCandidates(manifest.candidates)
	};
}
function normalizeCandidates(candidates) {
	return [...candidates].map((candidate) => ({
		...candidate,
		sourcePageIds: [...candidate.sourcePageIds].sort(compareText),
		tokenRefs: [...candidate.tokenRefs].sort(compareText),
		props: [...candidate.props].map((prop) => prop.type === "enum" ? {
			...prop,
			values: [...prop.values].sort(compareText)
		} : prop).sort((left, right) => compareText(left.name, right.name)),
		variants: [...candidate.variants].map((variant) => ({
			...variant,
			values: [...variant.values].sort(compareText)
		})).sort((left, right) => compareText(left.name, right.name)),
		slots: [...candidate.slots].sort((left, right) => compareText(left.name, right.name))
	})).sort((left, right) => compareText(left.id, right.id));
}
function assertNoCollisions(files, assets, existingPaths) {
	const generated = /* @__PURE__ */ new Set();
	for (const file of files) {
		if (generated.has(file.path)) throw new Error(`Starter file path collides: "${file.path}".`);
		generated.add(file.path);
	}
	for (const asset of assets) {
		if (generated.has(asset.outputPath)) throw new Error(`Starter path collides: "${asset.outputPath}".`);
		generated.add(asset.outputPath);
	}
	for (const existingPath of existingPaths) if (generated.has(existingPath)) throw new Error(`Starter output collides with existing path "${existingPath}"; merge policy is fail.`);
}
async function sha256Text(content) {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function comparePath(left, right) {
	return compareText(left.path, right.path);
}
function compareText(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
function escapeMarkdown(value) {
	return value.replaceAll("`", "\\`").replaceAll("|", "\\|").replaceAll("\n", " ");
}
function packageName(title) {
	const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return normalized.length > 0 ? normalized.slice(0, 80) : "cutout-starter";
}
function toExportName(name, id) {
	const stem = name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("");
	if (stem.length > 0 && /^[A-Z]/.test(stem)) return stem.slice(0, 80);
	let hash = 2166136261;
	for (const character of id) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return `Component${(hash >>> 0).toString(36)}`;
}
//#endregion
//#region src/starter-compiler/consumer-matrix.ts
var frameworkSchema = _enum([
	"next-app-router",
	"vite-react",
	"nuxt",
	"tanstack-start"
]);
object({
	protocol: literal("cutout.consumer-receipt.v1"),
	framework: frameworkSchema,
	status: _enum([
		"passed",
		"failed",
		"capability-required"
	]),
	workspaceId: string().min(1),
	checks: array(object({
		name: _enum([
			"install",
			"typecheck",
			"build",
			"browser",
			"visual-regression"
		]),
		status: _enum([
			"passed",
			"failed",
			"capability-required"
		]),
		durationMs: number().nonnegative(),
		evidence: array(string())
	}).strict()),
	completedAt: string().datetime()
}).strict();
//#endregion
//#region src/headless/source-scanner.ts
var MAX_FILE_BYTES = 100 * 1024 * 1024;
var MAX_REPOSITORY_ENTRIES = 1e4;
var MAX_REPOSITORY_DEPTH = 64;
var IGNORED_DIRECTORY = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".nuxt"
]);
var SECRET_PATH = /(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i;
var ALLOWLISTED_CONFIG = /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(?:\.[^/]+)?\.json|vite\.config\.[^/]+|next\.config\.[^/]+|nuxt\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|components\.json|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.prettierrc(?:\.[^/]+)?|README(?:\.[^/]+)?|DESIGN\.md)$/i;
var SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|sass|less|html|mdx?|json|ya?ml)$/i;
/**
* Resolve scan requests only below a canonical, caller-owned project root.
* The protocol has already rejected absolute/traversal paths; these checks
* defend against symlink pivots and time-of-check surprises at the host edge.
*/
async function scanSourceInput(projectRoot, operation) {
	const rootMetadata = await lstat(projectRoot);
	if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) throw new Error("Source scan root must be a regular, non-symbolic-link directory.");
	const root = await realpath(projectRoot);
	const input = operation.input;
	switch (input.type) {
		case "inline-text": {
			const bytes = new TextEncoder().encode(input.text);
			return {
				input: { ...input },
				artifacts: [{
					bytes,
					mediaType: "text/plain;charset=utf-8"
				}]
			};
		}
		case "url-descriptor": return {
			input: { ...input },
			artifacts: []
		};
		case "local-file-scan": {
			const bytes = await readStableRegularFile(await controlledPath(root, input.path), MAX_FILE_BYTES, "Source file");
			return {
				input: {
					type: "local-file",
					path: input.path,
					bytes,
					sourceKind: input.sourceKind,
					role: input.role,
					license: input.license,
					...input.title ? { title: input.title } : {},
					...input.mediaType ? { mediaType: input.mediaType } : {},
					...input.promptProvenance ? { promptProvenance: input.promptProvenance } : {}
				},
				artifacts: [{
					bytes,
					mediaType: input.mediaType ?? mediaTypeFor(input.path, input.sourceKind)
				}]
			};
		}
		case "repository-scan": {
			const directory = await controlledPath(root, input.root);
			const stat = await lstat(directory);
			if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Repository scans require a regular, non-symbolic-link directory.");
			const entries = await inventory(directory, root);
			return {
				input: {
					type: "repository-snapshot",
					label: input.label ?? basename(input.root === "." ? root : input.root),
					entries,
					role: input.role,
					license: input.license,
					...input.promptProvenance ? { promptProvenance: input.promptProvenance } : {}
				},
				artifacts: []
			};
		}
	}
}
async function inventory(directory, root) {
	const entries = [];
	const visit = async (current, depth) => {
		if (depth > MAX_REPOSITORY_DEPTH) throw new Error(`Repository scan depth exceeds ${MAX_REPOSITORY_DEPTH}.`);
		await assertStableDirectory$1(root, current);
		const names = await readdir(current);
		for (const name of names.sort((left, right) => left.localeCompare(right))) {
			if (entries.length >= MAX_REPOSITORY_ENTRIES) throw new Error(`Repository inventories over ${MAX_REPOSITORY_ENTRIES} entries are not accepted.`);
			const target = resolve(current, name);
			const stat = await lstat(target);
			if (stat.isSymbolicLink()) continue;
			if (stat.isDirectory()) {
				if (!IGNORED_DIRECTORY.has(name)) await visit(target, depth + 1);
				continue;
			}
			if (!stat.isFile()) continue;
			const path = relative(root, target).split(sep).join("/");
			if (!allowedRepositoryEntry(path)) continue;
			const digest = await digestFile(target);
			entries.push({
				path,
				bytes: digest.bytes,
				sha256: digest.sha256
			});
		}
	};
	await visit(directory, 0);
	return entries;
}
function allowedRepositoryEntry(path) {
	return !SECRET_PATH.test(path) && (ALLOWLISTED_CONFIG.test(path) || SOURCE_FILE.test(path));
}
async function digestFile(path) {
	const bytes = await readStableRegularFile(path, MAX_FILE_BYTES, "Repository file");
	return {
		bytes: bytes.byteLength,
		sha256: createHash("sha256").update(bytes).digest("hex")
	};
}
async function readStableRegularFile(path, maxBytes, label) {
	let handle;
	try {
		handle = await open(path, constants.O_RDONLY | noFollowFlag());
		const before = await handle.stat();
		if (!before.isFile()) throw new Error(`${label} must be a regular file.`);
		if (before.size > maxBytes) throw new Error(`${label}s over ${maxBytes} bytes are not accepted.`);
		const bytes = new Uint8Array(await handle.readFile());
		const after = await handle.stat();
		const pathMetadata = await lstat(path);
		if (pathMetadata.isSymbolicLink() || !sameIdentity(before, after) || !sameIdentity(after, pathMetadata) || bytes.byteLength !== after.size) throw new Error(`${label} changed while it was being read.`);
		return bytes;
	} catch (error) {
		if (error.code === "ELOOP") throw new Error(`${label} must not be a symbolic link.`);
		throw error;
	} finally {
		await handle?.close();
	}
}
async function assertStableDirectory$1(root, directory) {
	const metadata = await lstat(directory);
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Repository scan encountered a non-directory or symbolic-link component.");
	const canonical = await realpath(directory);
	assertInside(root, canonical);
	if (canonical !== directory) throw new Error("Repository scan encountered a non-canonical directory.");
}
function sameIdentity(left, right) {
	return left.dev === right.dev && left.ino === right.ino;
}
function noFollowFlag() {
	return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}
async function controlledPath(root, relativePath) {
	const requested = relativePath === "." ? root : resolve(root, relativePath);
	assertInside(root, requested);
	const canonical = await realpath(requested);
	assertInside(root, canonical);
	return canonical;
}
function assertInside(root, candidate) {
	const path = relative(root, candidate);
	if (path === "" || !path.startsWith(`..${sep}`) && path !== ".." && !path.includes(`..${sep}`)) return;
	throw new Error("Source scan path escapes the controlled project root.");
}
function mediaTypeFor(path, kind) {
	return {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		webp: "image/webp",
		gif: "image/gif",
		svg: "image/svg+xml",
		mp4: "video/mp4",
		webm: "video/webm",
		mov: "video/quicktime",
		md: "text/markdown;charset=utf-8",
		txt: "text/plain;charset=utf-8",
		ts: "text/typescript;charset=utf-8",
		tsx: "text/typescript;charset=utf-8",
		js: "text/javascript;charset=utf-8",
		jsx: "text/javascript;charset=utf-8"
	}[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? (kind === "video" ? "video/*" : kind === "screenshot" || kind === "photo" ? "image/*" : "application/octet-stream");
}
//#endregion
//#region src/headless/node-fs.ts
var CUTOUT_DIRECTORY = ".cutout";
var MANIFEST_FILE = "manifest.json";
var RUN_EVENTS_FILE = "run-events.json";
var OBJECTS_DIRECTORY = "objects";
var EXPORTS_DIRECTORY = "exports";
var DESIGN_KIT_DIRECTORY = "design-kit";
var BRAND_KIT_DIRECTORY = "brand-kit";
var STARTER_DIRECTORY = "starter";
var STARTER_MANIFEST_FILE = "cutout.starter-export.json";
var JOURNAL_FILE = ".transaction.json";
var TEMPORARY_PREFIX = ".cutout-tmp-";
var queues = /* @__PURE__ */ new Map();
/**
* Node-only persistence adapter.
*
* State changes use a rollback journal. A process dying between file renames is
* recovered to the previous complete revision on the next access. Binary
* objects are content addressed and independently verified after writing.
*/
function createNodeFsRuntimeStore(projectRoot) {
	const requestedRoot = resolve(projectRoot);
	let initialized;
	const paths = () => initialized ??= initializeRoot(requestedRoot);
	return {
		async prepareSourceIngestion(operation) {
			const { root } = await paths();
			return scanSourceInput(root, operation);
		},
		async load() {
			const { directory } = await paths();
			return serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				await cleanupTemporaryFiles(directory);
				const manifest = await readJson$1(await managedPath(directory, MANIFEST_FILE));
				const files = manifest.files;
				if (!files || typeof files !== "object") throw new Error("Invalid .cutout manifest files.");
				const readNamed = async (name) => readJson$1(await managedPath(directory, files[name]));
				const markdown = await readFile(await managedPath(directory, files.designMarkdown), "utf8");
				const ledger = await readOptionalJson(await managedPath(directory, files.controlLedger));
				const runEvents = await readOptionalJson(await managedPath(directory, RUN_EVENTS_FILE));
				const state = {
					manifest,
					design: await readNamed("designIr"),
					designMarkdown: markdown,
					artifactIndex: await readNamed("artifactIndex"),
					policy: await readNamed("policy"),
					...ledger === void 0 ? {} : { ledger },
					...runEvents === void 0 ? {} : { runEvents }
				};
				return headlessProjectStateSchema.parse(state);
			});
		},
		async save(input) {
			const state = headlessProjectStateSchema.parse(input);
			const { directory } = await paths();
			await serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				await cleanupTemporaryFiles(directory);
				const { files } = state.manifest;
				await transactionalWrite(directory, [
					{
						name: files.designIr,
						value: json(state.design)
					},
					{
						name: files.designMarkdown,
						value: state.designMarkdown
					},
					{
						name: files.artifactIndex,
						value: json(state.artifactIndex)
					},
					{
						name: files.policy,
						value: json(state.policy)
					},
					{
						name: files.controlLedger,
						value: state.ledger ? json(state.ledger) : null
					},
					{
						name: RUN_EVENTS_FILE,
						value: state.runEvents ? json(state.runEvents) : null
					},
					{
						name: MANIFEST_FILE,
						value: json(state.manifest)
					}
				]);
			});
		},
		async writeArtifact(input) {
			const { directory, objects } = await paths();
			return serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				await cleanupTemporaryFiles(objects);
				const bytes = new Uint8Array(input.bytes);
				const sha256 = digest$1(bytes);
				if (input.sha256 && normalizeDigest(input.sha256) !== sha256) throw new Error("Artifact SHA-256 does not match the supplied bytes.");
				if (typeof input.mediaType !== "string" || input.mediaType.length === 0 || input.mediaType.length > 200) throw new Error("Expected an artifact media type.");
				const target = await managedPath(objects, sha256);
				try {
					const existing = new Uint8Array(await readFile(target));
					if (digest$1(existing) !== sha256) throw new Error("Stored artifact SHA-256 does not match its address.");
					return artifactRecordSchema.parse({
						sha256,
						mediaType: input.mediaType,
						byteLength: existing.byteLength
					});
				} catch (error) {
					if (!isMissingFile(error)) throw error;
				}
				const temporary = temporaryPath(target);
				try {
					await writeFile(temporary, bytes, { flag: "wx" });
					if (digest$1(new Uint8Array(await readFile(temporary))) !== sha256) throw new Error("Artifact bytes changed before commit.");
					await rename(temporary, target);
				} finally {
					await rm(temporary, { force: true });
				}
				const persisted = new Uint8Array(await readFile(target));
				if (digest$1(persisted) !== sha256) throw new Error("Stored artifact SHA-256 does not match its address.");
				return artifactRecordSchema.parse({
					sha256,
					mediaType: input.mediaType,
					byteLength: persisted.byteLength
				});
			});
		},
		async readArtifact(sha256) {
			const { directory, objects } = await paths();
			return serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				await cleanupTemporaryFiles(objects);
				const normalized = normalizeDigest(sha256);
				const bytes = new Uint8Array(await readFile(await managedPath(objects, normalized)));
				if (digest$1(bytes) !== normalized) throw new Error("Stored artifact SHA-256 does not match its address.");
				return bytes;
			});
		},
		async writeDesignKit(kit) {
			const { directory, designKitExports } = await paths();
			return serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				await cleanupTemporaryFiles(designKitExports);
				const normalized = validateDesignKit(kit);
				const kitId = designKitId(normalized);
				const target = await managedExportDirectory(designKitExports, kitId);
				const existing = await readExistingKit(target, normalized, kitId);
				if (existing) return existing;
				const staging = await stagingExportDirectory(designKitExports);
				try {
					await writeKitDirectory(staging, normalized);
					await rename(staging, target);
				} catch (error) {
					if (isAlreadyExists(error)) {
						const concurrent = await readExistingKit(target, normalized, kitId);
						if (concurrent) return concurrent;
					}
					throw error;
				} finally {
					await rm(staging, {
						recursive: true,
						force: true
					});
				}
				const receipt = await readExistingKit(target, normalized, kitId);
				if (!receipt) throw new Error("Design Kit export did not become readable after commit.");
				return {
					...receipt,
					idempotent: false
				};
			});
		},
		async writeBrandKit(kit) {
			const { directory, brandKitExports } = await paths();
			return serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				await cleanupTemporaryFiles(brandKitExports);
				const normalized = validateBrandKit(kit);
				const brandKitId = brandKitExportId(normalized);
				const target = await managedExportDirectory(brandKitExports, brandKitId);
				const existing = await readExistingBrandKit(target, normalized, brandKitId);
				if (existing) return existing;
				const staging = await stagingExportDirectory(brandKitExports);
				try {
					await writeBrandKitDirectory(staging, normalized);
					await rename(staging, target);
				} catch (error) {
					if (isAlreadyExists(error)) {
						const concurrent = await readExistingBrandKit(target, normalized, brandKitId);
						if (concurrent) return concurrent;
					}
					throw error;
				} finally {
					await rm(staging, {
						recursive: true,
						force: true
					});
				}
				const receipt = await readExistingBrandKit(target, normalized, brandKitId);
				if (!receipt) throw new Error("Brand Kit export did not become readable after commit.");
				return {
					...receipt,
					idempotent: false
				};
			});
		},
		async writeStarter(plan) {
			const { directory, objects, starterExports } = await paths();
			return serialized(directory, async () => {
				await recoverInterruptedTransaction(directory);
				const normalized = await validateStarterPlan(plan);
				const starterId = starterExportId(normalized);
				const target = await managedExportDirectory(starterExports, starterId);
				const expected = await starterExportExpected(normalized, async (sha256) => {
					const bytes = new Uint8Array(await readFile(await managedPath(objects, sha256)));
					if (digest$1(bytes) !== sha256) throw new Error("Stored artifact SHA-256 does not match its address.");
					return bytes;
				});
				const existing = await readExistingStarter(target, expected, normalized, starterId);
				if (existing) return existing;
				const staging = await stagingExportDirectory(starterExports);
				try {
					await writeStarterDirectory(staging, expected);
					await rename(staging, target);
				} catch (error) {
					if (isAlreadyExists(error)) {
						const concurrent = await readExistingStarter(target, expected, normalized, starterId);
						if (concurrent) return concurrent;
					}
					throw error;
				} finally {
					await rm(staging, {
						recursive: true,
						force: true
					});
				}
				const receipt = await readExistingStarter(target, expected, normalized, starterId);
				if (!receipt) throw new Error("Starter export did not become readable after commit.");
				return {
					...receipt,
					idempotent: false
				};
			});
		}
	};
}
async function initializeRoot(requestedRoot) {
	await mkdir(requestedRoot, { recursive: true });
	await assertNotSymlink(requestedRoot);
	const root = await realpath(requestedRoot);
	const requestedDirectory = resolve(root, CUTOUT_DIRECTORY);
	await assertDirectChild(root, requestedDirectory);
	await assertNotSymlink(requestedDirectory, true);
	await mkdir(requestedDirectory, { recursive: true });
	await assertNotSymlink(requestedDirectory);
	const directory = await realpath(requestedDirectory);
	await assertDirectChild(root, directory);
	const requestedObjects = resolve(directory, OBJECTS_DIRECTORY);
	await assertDirectChild(directory, requestedObjects);
	await assertNotSymlink(requestedObjects, true);
	await mkdir(requestedObjects, { recursive: true });
	await assertNotSymlink(requestedObjects);
	const objects = await realpath(requestedObjects);
	await assertDirectChild(directory, objects);
	const requestedExports = resolve(directory, EXPORTS_DIRECTORY);
	await assertDirectChild(directory, requestedExports);
	await assertNotSymlink(requestedExports, true);
	await mkdir(requestedExports, { recursive: true });
	await assertNotSymlink(requestedExports);
	const exports = await realpath(requestedExports);
	await assertDirectChild(directory, exports);
	const requestedDesignKitExports = resolve(exports, DESIGN_KIT_DIRECTORY);
	await assertDirectChild(exports, requestedDesignKitExports);
	await assertNotSymlink(requestedDesignKitExports, true);
	await mkdir(requestedDesignKitExports, { recursive: true });
	await assertNotSymlink(requestedDesignKitExports);
	const designKitExports = await realpath(requestedDesignKitExports);
	await assertDirectChild(exports, designKitExports);
	const requestedBrandKitExports = resolve(exports, BRAND_KIT_DIRECTORY);
	await assertDirectChild(exports, requestedBrandKitExports);
	await assertNotSymlink(requestedBrandKitExports, true);
	await mkdir(requestedBrandKitExports, { recursive: true });
	await assertNotSymlink(requestedBrandKitExports);
	const brandKitExports = await realpath(requestedBrandKitExports);
	await assertDirectChild(exports, brandKitExports);
	const requestedStarterExports = resolve(exports, STARTER_DIRECTORY);
	await assertDirectChild(exports, requestedStarterExports);
	await assertNotSymlink(requestedStarterExports, true);
	await mkdir(requestedStarterExports, { recursive: true });
	await assertNotSymlink(requestedStarterExports);
	const starterExports = await realpath(requestedStarterExports);
	await assertDirectChild(exports, starterExports);
	return {
		root,
		directory,
		objects,
		designKitExports,
		brandKitExports,
		starterExports
	};
}
function validateDesignKit(input) {
	const seen = /* @__PURE__ */ new Set();
	for (const file of input.files) {
		if (!validFileName(file.path) || seen.has(file.path)) throw new Error("Design Kit contains an unsafe or duplicate file name.");
		seen.add(file.path);
		if (digest$1(new TextEncoder().encode(file.content)) !== file.sha256.toLowerCase()) throw new Error(`Design Kit file hash does not match content: ${file.path}`);
	}
	if (!seen.has("manifest.json")) throw new Error("Design Kit is missing its hash manifest.");
	return input;
}
function designKitId(kit) {
	return `${safeSegment(kit.source.documentId)}--${safeSegment(kit.source.revisionId)}--${kit.source.documentFingerprint.slice(0, 16).toLowerCase()}`;
}
function validateBrandKit(input) {
	const kit = brandKitSchema.parse(input);
	const seen = /* @__PURE__ */ new Set();
	for (const file of kit.files) {
		if (!validFileName(file.path) || seen.has(file.path)) throw new Error("Brand Kit contains an unsafe or duplicate file name.");
		seen.add(file.path);
		if (digest$1(new TextEncoder().encode(file.content)) !== file.sha256.toLowerCase()) throw new Error(`Brand Kit file hash does not match content: ${file.path}`);
	}
	if (!seen.has("brand.manifest.json")) throw new Error("Brand Kit is missing its hash manifest.");
	return kit;
}
function brandKitExportId(kit) {
	return `${safeSegment(kit.source.documentId)}--${safeSegment(kit.source.revisionId)}--${safeSegment(kit.source.brandId)}--${kit.source.documentFingerprint.slice(0, 16).toLowerCase()}--${kit.source.definitionFingerprint.slice(0, 16).toLowerCase()}`;
}
function safeSegment(value) {
	const segment = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
	if (!segment) throw new Error("Design Kit source has no safe project/revision identifier.");
	return segment;
}
async function managedExportDirectory(parent, kitId) {
	if (!validFileName(kitId)) throw new Error("Expected a safe Design Kit identifier.");
	await assertStableDirectory(parent);
	const target = resolve(parent, kitId);
	await assertDirectChild(parent, target);
	await assertNotSymlink(target, true);
	return target;
}
async function stagingExportDirectory(parent) {
	await assertStableDirectory(parent);
	const staging = resolve(parent, `cutout-export-tmp-${randomUUID()}`);
	await assertDirectChild(parent, staging);
	await mkdir(staging);
	await assertNotSymlink(staging);
	return staging;
}
async function writeKitDirectory(directory, kit) {
	await assertStableDirectory(directory);
	for (const file of kit.files) await atomicText(await managedPath(directory, file.path), file.content);
}
async function writeBrandKitDirectory(directory, kit) {
	await assertStableDirectory(directory);
	for (const file of kit.files) await atomicText(await managedPath(directory, file.path), file.content);
}
async function readExistingKit(directory, kit, kitId) {
	try {
		await assertNotSymlink(directory);
		if (!(await lstat(directory)).isDirectory()) throw new Error("Design Kit export target is not a directory.");
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
	if (await realpath(directory) !== directory) throw new Error("Refusing a non-canonical Design Kit export directory.");
	const expected = new Map(kit.files.map((file) => [file.path, file]));
	const names = await readdir(directory);
	if (names.length !== expected.size || names.some((name) => !expected.has(name))) throw new Error("A Design Kit export already exists with different files; refusing to overwrite it.");
	const files = [];
	for (const [path, file] of expected) {
		const target = await managedPath(directory, path);
		const bytes = new Uint8Array(await readFile(target));
		const sha256 = digest$1(bytes);
		if (sha256 !== file.sha256.toLowerCase()) throw new Error(`A Design Kit export already exists with a different hash for ${path}; refusing to overwrite it.`);
		files.push({
			path,
			sha256,
			byteLength: bytes.byteLength
		});
	}
	return {
		kitId,
		revisionId: kit.source.revisionId,
		documentFingerprint: kit.source.documentFingerprint,
		directory: `.cutout/exports/design-kit/${kitId}`,
		files: files.sort((left, right) => left.path.localeCompare(right.path)),
		idempotent: true
	};
}
async function readExistingBrandKit(directory, kit, brandKitId) {
	try {
		await assertNotSymlink(directory);
		if (!(await lstat(directory)).isDirectory()) throw new Error("Brand Kit export target is not a directory.");
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
	if (await realpath(directory) !== directory) throw new Error("Refusing a non-canonical Brand Kit export directory.");
	const expected = new Map(kit.files.map((file) => [file.path, file]));
	const names = await readdir(directory);
	if (names.length !== expected.size || names.some((name) => !expected.has(name))) throw new Error("A Brand Kit export already exists with different files; refusing to overwrite it.");
	const files = [];
	for (const [path, file] of expected) {
		const target = await managedPath(directory, path);
		const bytes = new Uint8Array(await readFile(target));
		const sha256 = digest$1(bytes);
		if (sha256 !== file.sha256.toLowerCase()) throw new Error(`A Brand Kit export already exists with a different hash for ${path}; refusing to overwrite it.`);
		files.push({
			path,
			sha256,
			byteLength: bytes.byteLength
		});
	}
	return {
		brandKitId,
		revisionId: kit.source.revisionId,
		brandId: kit.source.brandId,
		documentFingerprint: kit.source.documentFingerprint,
		definitionFingerprint: kit.source.definitionFingerprint,
		directory: `.cutout/exports/brand-kit/${brandKitId}`,
		files: files.sort((left, right) => left.path.localeCompare(right.path)),
		idempotent: true
	};
}
/** Re-validate every byte supplied by the pure Starter Compiler boundary. */
async function validateStarterPlan(input) {
	const plan = starterPlanSchema.parse(input);
	const paths = /* @__PURE__ */ new Set();
	for (const file of plan.files) {
		if (!validRelativeExportPath(file.path) || file.path === STARTER_MANIFEST_FILE || paths.has(file.path)) throw new Error("Starter Plan contains an unsafe or duplicate output path.");
		paths.add(file.path);
		if (digest$1(new TextEncoder().encode(file.content)) !== file.sha256.toLowerCase()) throw new Error(`Starter Plan file hash does not match content: ${file.path}`);
	}
	for (const asset of plan.assets) {
		if (!validRelativeExportPath(asset.outputPath) || asset.outputPath === STARTER_MANIFEST_FILE || paths.has(asset.outputPath)) throw new Error("Starter Plan contains an unsafe or duplicate output path.");
		paths.add(asset.outputPath);
		const sourceSha256 = sourceDigest(asset.sourceUri);
		if (asset.sha256 && asset.sha256.toLowerCase() !== sourceSha256) throw new Error(`Starter Plan asset digest does not match its content-addressed source: ${asset.outputPath}`);
	}
	return plan;
}
function starterPlanFingerprint(plan) {
	return digest$1(new TextEncoder().encode(canonicalJson(plan)));
}
function starterExportId(plan) {
	return `${safeSegment(plan.source.documentId)}--${safeSegment(plan.source.revisionId)}--${safeSegment(plan.framework)}--${plan.source.documentFingerprint.slice(0, 16).toLowerCase()}--${starterPlanFingerprint(plan).slice(0, 16)}`;
}
async function starterExportExpected(plan, readObject) {
	const planSha256 = starterPlanFingerprint(plan);
	const files = plan.files.map((file) => ({
		path: file.path,
		bytes: new TextEncoder().encode(file.content),
		sha256: file.sha256.toLowerCase()
	}));
	for (const asset of plan.assets) {
		const sha256 = sourceDigest(asset.sourceUri);
		const bytes = await readObject(sha256);
		if (digest$1(bytes) !== sha256) throw new Error(`Starter asset bytes do not match source digest: ${asset.outputPath}`);
		files.push({
			path: asset.outputPath,
			bytes,
			sha256
		});
	}
	const source = plan.source;
	const manifest = {
		version: "cutout.starter-export.v1",
		starterId: starterExportId(plan),
		framework: plan.framework,
		source,
		planSha256,
		files: files.map((file) => ({
			path: file.path,
			sha256: file.sha256,
			byteLength: file.bytes.byteLength
		})).sort((left, right) => left.path.localeCompare(right.path))
	};
	const manifestBytes = new TextEncoder().encode(json(manifest));
	files.push({
		path: STARTER_MANIFEST_FILE,
		bytes: manifestBytes,
		sha256: digest$1(manifestBytes)
	});
	return {
		planSha256,
		files: files.sort((left, right) => left.path.localeCompare(right.path))
	};
}
function sourceDigest(sourceUri) {
	const match = /^sha256:([a-f0-9]{64})$/i.exec(sourceUri);
	if (!match) throw new Error("Starter assets must use a local content-addressed sha256: URI.");
	return match[1].toLowerCase();
}
async function writeStarterDirectory(directory, expected) {
	await assertStableDirectory(directory);
	for (const file of expected.files) await atomicBytes(await managedRelativePath(directory, file.path, true), file.bytes);
}
async function readExistingStarter(directory, expected, plan, starterId) {
	try {
		await assertNotSymlink(directory);
		if (!(await lstat(directory)).isDirectory()) throw new Error("Starter export target is not a directory.");
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
	if (await realpath(directory) !== directory) throw new Error("Refusing a non-canonical Starter export directory.");
	const expectedPaths = new Set(expected.files.map((file) => file.path));
	const actualPaths = await listRelativeFiles(directory);
	if (actualPaths.length !== expectedPaths.size || actualPaths.some((path) => !expectedPaths.has(path))) throw new Error("A Starter export already exists with different files; refusing to overwrite it.");
	const files = [];
	for (const file of expected.files) {
		const target = await managedRelativePath(directory, file.path, false);
		const bytes = new Uint8Array(await readFile(target));
		const sha256 = digest$1(bytes);
		if (sha256 !== file.sha256) throw new Error(`A Starter export already exists with a different hash for ${file.path}; refusing to overwrite it.`);
		files.push({
			path: file.path,
			sha256,
			byteLength: bytes.byteLength
		});
	}
	return {
		starterId,
		framework: plan.framework,
		revisionId: plan.source.revisionId,
		documentFingerprint: plan.source.documentFingerprint,
		planSha256: expected.planSha256,
		directory: `.cutout/exports/starter/${starterId}`,
		files: files.sort((left, right) => left.path.localeCompare(right.path)),
		idempotent: true
	};
}
async function managedRelativePath(directory, value, createParents) {
	if (!validRelativeExportPath(value)) throw new Error("Expected a safe relative export path.");
	await assertStableDirectory(directory);
	const target = resolve(directory, value);
	if (!containedBy(directory, target)) throw new Error("Expected a path contained by the controlled export directory.");
	const relativeSegments = value.split("/");
	let current = directory;
	for (const segment of relativeSegments.slice(0, -1)) {
		const next = resolve(current, segment);
		await assertDirectChild(current, next);
		await assertNotSymlink(next, true);
		if (createParents) try {
			await mkdir(next);
		} catch (error) {
			if (!isAlreadyExists(error)) throw error;
		}
		await assertNotSymlink(next);
		if (!(await lstat(next)).isDirectory()) throw new Error("Starter export path has a non-directory ancestor.");
		if (await realpath(next) !== next) throw new Error("Refusing a non-canonical Starter export ancestor.");
		current = next;
	}
	await assertNotSymlink(target, true);
	return target;
}
async function listRelativeFiles(directory, prefix = "") {
	await assertStableDirectory(directory);
	const entries = await readdir(directory, { withFileTypes: true });
	const paths = [];
	for (const entry of entries) {
		const target = resolve(directory, entry.name);
		await assertDirectChild(directory, target);
		if (entry.isSymbolicLink()) throw new Error("Refusing symbolic links in a Starter export.");
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) paths.push(...await listRelativeFiles(target, relativePath));
		else if (entry.isFile()) paths.push(relativePath);
		else throw new Error("Starter export contains an unsupported filesystem entry.");
	}
	return paths.sort((left, right) => left.localeCompare(right));
}
async function transactionalWrite(directory, files) {
	const unique = /* @__PURE__ */ new Map();
	for (const file of files) {
		if (unique.has(file.name)) throw new Error(`Duplicate transaction file: ${file.name}`);
		unique.set(file.name, file.value);
	}
	const journalPath = await managedPath(directory, JOURNAL_FILE);
	const previous = [];
	for (const name of unique.keys()) {
		const path = await managedPath(directory, name);
		previous.push({
			name,
			contents: await readOptionalText(path) ?? null
		});
	}
	await atomicText(journalPath, json({
		version: 1,
		id: randomUUID(),
		files: previous
	}));
	for (const [name, value] of unique) {
		const path = await managedPath(directory, name);
		if (value === null) await rm(path, { force: true });
		else await atomicText(path, value);
	}
	await unlink(journalPath);
}
async function recoverInterruptedTransaction(directory) {
	const journalPath = await managedPath(directory, JOURNAL_FILE);
	const raw = await readOptionalText(journalPath);
	if (raw === void 0) return;
	const journal = transactionJournal(JSON.parse(raw));
	for (const entry of journal.files) {
		const path = await managedPath(directory, entry.name);
		if (entry.contents === null) await rm(path, { force: true });
		else await atomicText(path, entry.contents);
	}
	await unlink(journalPath);
}
async function cleanupTemporaryFiles(directory) {
	await assertStableDirectory(directory);
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (!entry.name.includes(TEMPORARY_PREFIX) || entry.isDirectory()) continue;
		await rm(resolve(directory, entry.name), { force: true });
	}
}
function transactionJournal(value) {
	if (!value || typeof value !== "object") throw new Error("Invalid .cutout transaction journal.");
	const candidate = value;
	if (candidate.version !== 1 || typeof candidate.id !== "string" || !Array.isArray(candidate.files)) throw new Error("Invalid .cutout transaction journal.");
	const seen = /* @__PURE__ */ new Set();
	const files = candidate.files.map((entry) => {
		if (!entry || typeof entry !== "object") throw new Error("Invalid .cutout transaction journal.");
		const item = entry;
		if (typeof item.name !== "string" || !validFileName(item.name) || seen.has(item.name) || item.contents !== null && typeof item.contents !== "string") throw new Error("Invalid .cutout transaction journal.");
		seen.add(item.name);
		return {
			name: item.name,
			contents: item.contents
		};
	});
	return {
		version: 1,
		id: candidate.id,
		files
	};
}
async function managedPath(directory, value) {
	if (typeof value !== "string" || !validManagedName(value)) throw new Error("Expected a safe .cutout file name.");
	await assertStableDirectory(directory);
	const path = resolve(directory, value);
	await assertDirectChild(directory, path);
	await assertNotSymlink(path, true);
	return path;
}
async function assertStableDirectory(directory) {
	await assertNotSymlink(directory);
	if (await realpath(directory) !== directory) throw new Error("Refusing a non-canonical .cutout directory.");
}
function validFileName(value) {
	return basename(value) === value && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes("..");
}
function validManagedName(value) {
	return value === JOURNAL_FILE || validFileName(value);
}
function validRelativeExportPath(value) {
	return value.length > 0 && value.length <= 240 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.startsWith("/") && !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..");
}
function containedBy(parent, child) {
	return child.startsWith(`${parent}${sep}`);
}
async function assertDirectChild(parent, child) {
	if (!child.startsWith(`${parent}${sep}`)) throw new Error("Expected a path contained by the .cutout directory.");
}
async function assertNotSymlink(path, missingAllowed = false) {
	try {
		if ((await lstat(path)).isSymbolicLink()) throw new Error("Refusing symbolic links in the .cutout directory.");
	} catch (error) {
		if (missingAllowed && isMissingFile(error)) return;
		throw error;
	}
}
async function readJson$1(path) {
	return JSON.parse(await readFile(path, "utf8"));
}
async function readOptionalJson(path) {
	const raw = await readOptionalText(path);
	return raw === void 0 ? void 0 : JSON.parse(raw);
}
async function readOptionalText(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return void 0;
		throw error;
	}
}
async function atomicText(path, value) {
	await atomicBytes(path, new TextEncoder().encode(value));
}
async function atomicBytes(path, value) {
	const temporary = temporaryPath(path);
	try {
		await writeFile(temporary, value, { flag: "wx" });
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}
function temporaryPath(path) {
	return `${path}${TEMPORARY_PREFIX}${randomUUID()}`;
}
function digest$1(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}
function normalizeDigest(value) {
	const normalized = value.toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("Expected a SHA-256 hex digest.");
	return normalized;
}
async function serialized(key, operation) {
	const previous = queues.get(key) ?? Promise.resolve();
	let release;
	const current = new Promise((resolve) => {
		release = resolve;
	});
	const queued = previous.then(() => current);
	queues.set(key, queued);
	await previous;
	try {
		return await operation();
	} finally {
		release();
		if (queues.get(key) === queued) queues.delete(key);
	}
}
function json(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}
function isMissingFile(error) {
	return Boolean(error && typeof error === "object" && error.code === "ENOENT");
}
function isAlreadyExists(error) {
	return Boolean(error && typeof error === "object" && error.code === "EEXIST");
}
//#endregion
//#region src/coding-runtime/runtime.ts
async function executeCodingTask(input, options) {
	const task = codingTaskSchema.parse(input);
	if (!options.backend || !options.workspace) throw new Error("capability-required: A controlled coding backend and workspace are required.");
	const startedAt = (options.now ?? Date.now)();
	if (options.signal?.aborted) return cancelled(task, options.backend.id, startedAt, options.now);
	const snapshotId = await options.workspace.snapshotId();
	if (snapshotId !== task.repo.snapshotId) throw new Error("revision-conflict: Repository snapshot does not match CodingTask.repo.snapshotId.");
	const context = await options.workspace.readAllowed(task.constraints.allowedPaths);
	const patch = codingPatchSchema.parse(await options.backend.propose(task, context, options.signal));
	enforceTimeBudget(task, startedAt, options.now);
	if (patch.taskId !== task.taskId || patch.baseSnapshotId !== snapshotId) throw new Error("revision-conflict: Coding patch targets a different task or repository snapshot.");
	enforceBudgetAndPaths(task, patch);
	const patchSha256 = digest(JSON.stringify(patch));
	const changedFiles = await options.workspace.preview(task, patch);
	if (!options.apply) return codingReceiptSchema.parse({
		version: "cutout.coding-receipt.v1",
		receiptId: `coding-receipt:${patchSha256.slice(0, 24)}`,
		taskId: task.taskId,
		status: "previewed",
		baseSnapshotId: snapshotId,
		changedFiles,
		checks: [],
		screenshots: [],
		provenance: {
			backend: options.backend.id,
			inputRefs: inputRefs(task),
			patchSha256
		},
		startedAt,
		completedAt: (options.now ?? Date.now)()
	});
	if (options.signal?.aborted) return cancelled(task, options.backend.id, startedAt, options.now, patchSha256);
	const stage = await options.workspace.stage(task, patch);
	try {
		if (options.signal?.aborted) return cancelled(task, options.backend.id, startedAt, options.now, patchSha256);
		const checks = await options.workspace.runChecks(task.constraints.allowedCommands, options.signal, stage.id);
		enforceTimeBudget(task, startedAt, options.now);
		if (options.signal?.aborted) return cancelled(task, options.backend.id, startedAt, options.now, patchSha256);
		if (checks.some((check) => check.status !== "passed")) return codingReceiptSchema.parse({
			version: "cutout.coding-receipt.v1",
			receiptId: `coding-receipt:${patchSha256.slice(0, 24)}`,
			taskId: task.taskId,
			status: "failed",
			baseSnapshotId: snapshotId,
			changedFiles: stage.changedFiles,
			checks,
			screenshots: [],
			provenance: {
				backend: options.backend.id,
				inputRefs: inputRefs(task),
				patchSha256
			},
			startedAt,
			completedAt: (options.now ?? Date.now)(),
			detail: "Staged changes were rolled back because one or more controlled quality checks did not pass."
		});
		if (await options.workspace.snapshotId() !== snapshotId) throw new Error("revision-conflict: Repository changed before staged promotion.");
		const applied = await options.workspace.promote(task, patch, stage.id, snapshotId);
		return codingReceiptSchema.parse({
			version: "cutout.coding-receipt.v1",
			receiptId: `coding-receipt:${patchSha256.slice(0, 24)}`,
			taskId: task.taskId,
			status: "applied",
			baseSnapshotId: snapshotId,
			resultSnapshotId: applied.snapshotId,
			changedFiles: applied.changedFiles,
			checks,
			screenshots: [],
			provenance: {
				backend: options.backend.id,
				inputRefs: inputRefs(task),
				patchSha256
			},
			startedAt,
			completedAt: (options.now ?? Date.now)()
		});
	} finally {
		await options.workspace.rollback(stage.id);
	}
}
function enforceBudgetAndPaths(task, patch) {
	if (patch.files.length > task.budget.maxChangedFiles) throw new Error("budget-exceeded: Coding patch changes too many files.");
	if (patch.files.reduce((sum, file) => sum + Buffer.byteLength(file.contents ?? ""), 0) > task.budget.maxBytes) throw new Error("budget-exceeded: Coding patch exceeds the byte budget.");
	const allowed = task.constraints.allowedPaths.map((path) => path.replace(/\/$/, ""));
	for (const file of patch.files) if (!allowed.some((root) => file.path === root || file.path.startsWith(`${root}/`))) throw new Error(`policy-denied: Patch path is outside CodingTask.constraints.allowedPaths: ${file.path}`);
}
function enforceTimeBudget(task, startedAt, now = Date.now) {
	if (now() - startedAt > task.budget.maxDurationMs) throw new Error("budget-exceeded: Coding task exceeded its time budget.");
}
function inputRefs(task) {
	return [
		task.inputs.designDocumentRef,
		...task.inputs.brandKitRefs,
		...task.inputs.designKitRefs,
		...task.inputs.prototypeRefs,
		...task.inputs.imageAssetRefs
	];
}
function digest(value) {
	return createHash("sha256").update(value).digest("hex");
}
function cancelled(task, backend, startedAt, now = Date.now, patchSha256 = "0".repeat(64)) {
	return codingReceiptSchema.parse({
		version: "cutout.coding-receipt.v1",
		receiptId: `coding-receipt:cancelled:${task.taskId}`,
		taskId: task.taskId,
		status: "cancelled",
		baseSnapshotId: task.repo.snapshotId,
		changedFiles: [],
		checks: [],
		screenshots: [],
		provenance: {
			backend,
			inputRefs: inputRefs(task),
			patchSha256
		},
		startedAt,
		completedAt: now()
	});
}
//#endregion
//#region src/headless/runtime.ts
/**
* A local, auditable host for the protocol. It deliberately has no provider,
* GUI, network, secret, or process capability. The only apply effect currently
* available is an approval-gated, directory-sandboxed Design Kit export.
*/
function createHeadlessRuntime(store, coding = {}) {
	return { async execute(input, authorization = {}) {
		const parsedRequest = controlRequestSchema.safeParse(input);
		if (!parsedRequest.success) return invalidResponse(input, parsedRequest.error.issues[0]?.message ?? "Invalid control request.");
		const state = await store.load();
		const parsedState = headlessProjectStateSchema.safeParse(state);
		if (!parsedState.success) return response(parsedRequest.data, 0, "invalid", false, false, void 0, {
			code: "invalid-request",
			message: `Invalid .cutout state: ${parsedState.error.issues[0]?.message ?? "unknown error"}`
		});
		const request = parsedRequest.data;
		const ledger = ledgerFromState(state);
		const preparation = applyControlRequest(ledger, request, {
			policy: {
				allowPaid: request.operation.type === "tool.invoke",
				allowExternal: state.policy.allowApply,
				requireApprovalForExternal: state.policy.requireApprovalForExternal
			},
			authorization
		});
		if (preparation.decision === "duplicate" || preparation.decision === "conflict" || preparation.decision === "denied") return preparation.response;
		if (request.mode === "apply" && !state.policy.allowedOperations.some((operation) => operation === request.operation.type)) return response(request, ledger.revision, "denied", false, false, void 0, {
			code: "policy-denied",
			message: `Operation "${request.operation.type}" is disabled by .cutout policy.`
		});
		if (isPatch(request) && request.mode !== "dry-run") return response(request, ledger.revision, "denied", false, false, void 0, {
			code: "policy-denied",
			message: "This headless runtime supports patches only in dry-run mode."
		});
		const dispatched = await dispatch(store, state, request, coding, authorization);
		if (!dispatched.ok) return response(request, ledger.revision, dispatched.code ? "denied" : "invalid", request.mode === "dry-run", false, void 0, {
			code: dispatched.code ?? "invalid-request",
			message: dispatched.message
		});
		if (preparation.decision === "dry-run") return response(request, ledger.revision, "ok", true, false, dispatched.result);
		const nextRevision = request.operation.type === "export.design-kit" || request.operation.type === "export.brand-kit" || request.operation.type === "export.starter" || request.operation.type === "source.ingest" || request.operation.type === "coding.execute" || request.operation.type === "coding.review" || request.operation.type === "coding.repair" || request.operation.type === "run.start" && Boolean(dispatched.nextState) || request.operation.type === "run.cancel" && Boolean(dispatched.nextState) ? ledger.revision + 1 : ledger.revision;
		const completed = preparation.complete(dispatched.result, nextRevision);
		await store.save({
			...dispatched.nextState ?? state,
			ledger: completed.ledger
		});
		return completed.response;
	} };
}
async function dispatch(store, state, request, coding, authorization) {
	switch (request.operation.type) {
		case "project.context": return ok(projectContext(state, request.operation.include));
		case "material.list": return ok(materialList(state, request.operation.filter));
		case "validate": return ok(validate(state, request.operation.scope));
		case "design.patch": return previewDesignPatch(state, request.operation.patches);
		case "tokens.patch": return previewTokensPatch(state, request.operation.changes);
		case "source.ingest": return sourceIngest(store, state, request);
		case "run.start": return startRun(state, request);
		case "run.get": return getRun(state, request.operation.runId);
		case "run.events": return getRunEvents(state, request.operation);
		case "run.cancel": return cancelRun(state, request);
		case "export.design-kit": return exportDesignKit(store, state, request);
		case "export.brand-kit": return exportBrandKit(store, state, request);
		case "export.starter": return exportStarter(store, state, request);
		case "coding.execute":
		case "coding.review":
		case "coding.repair": try {
			if (request.operation.task.expectedRevision !== request.expectedRevision) return fail("CodingTask.expectedRevision must match the control request expectedRevision.");
			const receipt = await executeCodingTask(request.operation.task, {
				...coding,
				apply: request.mode === "apply"
			});
			return ok({
				operation: request.operation.type,
				receipt
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Controlled coding operation failed.";
			if (message.startsWith("capability-required:")) return {
				ok: false,
				code: "capability-required",
				message: message.slice(20).trim()
			};
			if (message.startsWith("budget-exceeded:")) return {
				ok: false,
				code: "budget-exceeded",
				message: message.slice(16).trim()
			};
			if (message.startsWith("policy-denied:")) return {
				ok: false,
				code: "authorization-required",
				message: message.slice(14).trim()
			};
			return fail(message);
		}
		case "tool.invoke": {
			const plan = planPaidTool(request.operation.tool, void 0, { allowPaid: true }, Boolean(authorization.approval));
			if (request.mode === "dry-run") return ok({
				operation: "tool.invoke",
				plan
			});
			return {
				ok: false,
				code: "capability-required",
				message: plan.reason ?? "No paid tool executor is available."
			};
		}
	}
}
function startRun(state, request) {
	const current = state.runEvents ?? createRunEventStore();
	if (current.events.some((event) => event.runId === request.operation.runId)) return fail(`Run "${request.operation.runId}" already exists.`);
	const started = createRunEvent(request.operation.runId, {
		type: "run-started",
		mode: request.operation.mode
	}, {
		eventId: `event:${request.requestId}:started`,
		at: Date.now()
	});
	const intent = createRunEvent(request.operation.runId, {
		type: "intent-recorded",
		intent: request.operation.intent
	}, {
		eventId: `event:${request.requestId}:intent`,
		at: started.at
	});
	const runEvents = appendRunEvent(appendRunEvent(current, started), intent);
	return ok({
		run: runEvents.activeRun,
		events: [started, intent]
	}, {
		...state,
		runEvents
	});
}
function getRun(state, runId) {
	const events = (state.runEvents?.events ?? []).filter((event) => event.runId === runId);
	if (events.length === 0) return fail(`Run "${runId}" was not found.`);
	return ok({ run: replayRunEvents(events).activeRun });
}
function getRunEvents(state, operation) {
	const all = (state.runEvents?.events ?? []).filter((event) => event.runId === operation.runId);
	if (all.length === 0) return fail(`Run "${operation.runId}" was not found.`);
	const cursor = operation.afterEventId ? all.findIndex((event) => event.eventId === operation.afterEventId) : -1;
	if (operation.afterEventId && cursor < 0) return fail(`Event cursor "${operation.afterEventId}" was not found in run "${operation.runId}".`);
	const limit = operation.limit ?? 200;
	const events = all.slice(cursor + 1, cursor + 1 + limit);
	return ok({
		runId: operation.runId,
		events,
		nextEventId: events.at(-1)?.eventId ?? operation.afterEventId ?? null,
		hasMore: cursor + 1 + events.length < all.length
	});
}
function cancelRun(state, request) {
	const events = (state.runEvents?.events ?? []).filter((event) => event.runId === request.operation.runId);
	if (events.length === 0) return fail(`Run "${request.operation.runId}" was not found.`);
	const projection = replayRunEvents(events).activeRun;
	if (!projection) return fail(`Run "${request.operation.runId}" could not be replayed.`);
	if (projection.status === "cancelled") return ok({
		run: projection,
		cancelled: false
	});
	if (projection.status !== "running") return fail(`Run "${request.operation.runId}" is already ${projection.status}.`);
	const cancelled = createRunEvent(request.operation.runId, {
		type: "run-cancelled",
		reason: request.operation.reason ?? "Cancelled by control client."
	}, {
		eventId: `event:${request.requestId}:cancelled`,
		at: Date.now()
	});
	const runEvents = appendRunEvent(state.runEvents ?? createRunEventStore(), cancelled);
	return ok({
		run: replayRunEvents([...events, cancelled]).activeRun,
		cancelled: true
	}, {
		...state,
		runEvents
	});
}
async function sourceIngest(store, state, request) {
	const prepared = await prepareSourceIngestion(store, request.operation);
	if (!prepared.ok) return prepared;
	const ingested = await ingestEverything(prepared.data.input, {
		capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
		actorId: "agent:cutout-control",
		existingSources: state.design.sources
	});
	if (!ingested.ok) return fail(ingested.error);
	const impact = sourceIngestImpact(ingested.data, prepared.data.artifacts);
	const result = {
		operation: "source.ingest",
		patch: ingested.data.patch,
		impact
	};
	if (request.mode === "dry-run") return ok(result);
	const records = await persistSourceArtifacts(store, prepared.data.artifacts);
	if (!records.ok) return records;
	const applied = applySourcePatch(state.design, ingested.data.patch, {
		id: `revision:source-ingest:${request.requestId}`,
		createdAt: (/* @__PURE__ */ new Date()).toISOString(),
		actor: {
			kind: "agent",
			id: "agent:cutout-control"
		}
	});
	if (!applied.ok) return fail(applied.error);
	const knownArtifacts = new Map(state.artifactIndex.artifacts.map((artifact) => [artifact.sha256, artifact]));
	for (const artifact of records.data) knownArtifacts.set(artifact.sha256, artifact);
	return {
		ok: true,
		result: {
			...result,
			impact: {
				...impact,
				artifactRecords: records.data.map(({ sha256, mediaType, byteLength }) => ({
					sha256,
					mediaType,
					byteLength
				}))
			}
		},
		nextState: {
			...state,
			design: applied.data,
			artifactIndex: {
				...state.artifactIndex,
				artifacts: [...knownArtifacts.values()].sort((left, right) => left.sha256.localeCompare(right.sha256))
			}
		}
	};
}
async function prepareSourceIngestion(store, operation) {
	if (!isSourceIngestionStore(store)) return {
		ok: false,
		message: "This runtime store does not support controlled source ingestion."
	};
	try {
		return {
			ok: true,
			data: await store.prepareSourceIngestion(operation)
		};
	} catch (error) {
		return {
			ok: false,
			message: sanitizeHostError(error)
		};
	}
}
async function persistSourceArtifacts(store, artifacts) {
	if (!isArtifactWriteStore(store)) return {
		ok: true,
		data: []
	};
	try {
		return {
			ok: true,
			data: await Promise.all(artifacts.map((artifact) => store.writeArtifact(artifact)))
		};
	} catch (error) {
		return {
			ok: false,
			message: sanitizeHostError(error)
		};
	}
}
function sourceIngestImpact(ingestion, artifacts) {
	return {
		sourcesAdded: ingestion.patch.sources.map(({ id, kind, title }) => ({
			id,
			kind,
			title
		})),
		provenanceAdded: ingestion.patch.provenance.map(({ id, sourceIds }) => ({
			id,
			sourceIds
		})),
		skipped: ingestion.skipped,
		artifactPlan: artifacts.map(({ bytes, mediaType }) => ({
			mediaType,
			byteLength: bytes.byteLength
		}))
	};
}
function isSourceIngestionStore(store) {
	return typeof store.prepareSourceIngestion === "function";
}
function isArtifactWriteStore(store) {
	return typeof store.writeArtifact === "function";
}
async function exportBrandKit(store, state, request) {
	let kit;
	try {
		const [requestFingerprint, stateFingerprint] = await Promise.all([fingerprint(request.operation.input.document), fingerprint(state.design)]);
		if (requestFingerprint !== stateFingerprint) return fail("Brand Kit input document does not match the current project DesignDocument.");
		kit = await compileBrandKit({
			document: state.design,
			brand: request.operation.input.brand
		});
	} catch (error) {
		return fail(error instanceof Error ? error.message : "Unable to compile the Brand Kit.");
	}
	const plan = brandKitPlan(kit);
	if (request.mode === "dry-run") return ok({
		...plan,
		apply: { requiresApproval: state.policy.requireApprovalForExternal }
	});
	if (!isBrandKitExportStore(store)) return fail("This runtime store does not support Brand Kit file export.");
	try {
		return ok(await store.writeBrandKit(kit));
	} catch (error) {
		return fail(sanitizeHostError(error));
	}
}
async function exportStarter(store, state, request) {
	let plan;
	try {
		plan = await compileHeadlessStarter(state, request.operation.framework);
	} catch (error) {
		return fail(error instanceof Error ? error.message : "Unable to compile the Starter Plan.");
	}
	if (request.mode === "dry-run") return ok(starterPlanSummary(plan, state.policy.requireApprovalForExternal));
	if (!isStarterExportStore(store)) return fail("This runtime store does not support Starter file export.");
	try {
		return ok(await store.writeStarter(plan));
	} catch (error) {
		return fail(sanitizeHostError(error));
	}
}
/**
* v1 uses only facts already represented in Design IR. It intentionally does
* not infer UI components from pixels or source code: an empty, validated
* component manifest is preferable to exporting invented executable code.
*/
async function compileHeadlessStarter(state, framework) {
	const kit = await compileHeadlessDesignKit(state.design);
	const manifestFile = (await compileComponentCandidates({
		document: state.design,
		candidates: []
	})).files.find((file) => file.path === "components.manifest.json");
	if (!manifestFile) throw new Error("Component compiler did not emit a component manifest.");
	const candidates = JSON.parse(manifestFile.content);
	return compileStarter({
		framework,
		document: state.design,
		kit,
		candidates,
		assetBindings: [],
		mergePolicy: "fail"
	});
}
function starterPlanSummary(plan, requiresApproval) {
	const starterId = starterExportId(plan);
	return {
		starterId,
		framework: plan.framework,
		revisionId: plan.source.revisionId,
		documentFingerprint: plan.source.documentFingerprint,
		planSha256: starterPlanFingerprint(plan),
		directory: `.cutout/exports/starter/${starterId}`,
		mergePolicy: plan.mergePolicy,
		files: plan.files.map((file) => ({
			path: file.path,
			sha256: file.sha256,
			byteLength: new TextEncoder().encode(file.content).byteLength
		})),
		assets: plan.assets.map((asset) => ({
			outputPath: asset.outputPath,
			sha256: asset.sha256 ?? null,
			mediaType: asset.mediaType ?? null
		})),
		apply: { requiresApproval }
	};
}
async function exportDesignKit(store, state, request) {
	if (request.operation.format !== "directory") return fail("Headless Design Kit v1 supports only the directory format.");
	let kit;
	try {
		kit = await compileHeadlessDesignKit(state.design);
	} catch (error) {
		return fail(error instanceof Error ? error.message : "Unable to compile the Design Kit.");
	}
	const plan = designKitPlan(kit);
	if (request.mode === "dry-run") return ok({
		...plan,
		apply: { requiresApproval: state.policy.requireApprovalForExternal }
	});
	if (!isDesignKitExportStore(store)) return fail("This runtime store does not support Design Kit file export.");
	try {
		return ok(await store.writeDesignKit(kit));
	} catch (error) {
		return fail(sanitizeHostError(error));
	}
}
function sanitizeHostError(error) {
	return (error instanceof Error ? error.message : "Unable to write the Design Kit.").replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, "<local-path>").replace(/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+)/gi, "<redacted>").slice(0, 1200);
}
function designKitPlan(kit) {
	const kitId = safeKitId(kit.source.documentId, kit.source.revisionId, kit.source.documentFingerprint);
	return {
		kitId,
		revisionId: kit.source.revisionId,
		documentFingerprint: kit.source.documentFingerprint,
		directory: `.cutout/exports/design-kit/${kitId}`,
		files: kit.files.map((file) => ({
			path: file.path,
			sha256: file.sha256,
			byteLength: new TextEncoder().encode(file.content).byteLength
		}))
	};
}
function brandKitPlan(kit) {
	const brandKitId = safeBrandKitId(kit);
	return {
		brandKitId,
		revisionId: kit.source.revisionId,
		brandId: kit.source.brandId,
		documentFingerprint: kit.source.documentFingerprint,
		definitionFingerprint: kit.source.definitionFingerprint,
		directory: `.cutout/exports/brand-kit/${brandKitId}`,
		files: kit.files.map((file) => ({
			path: file.path,
			sha256: file.sha256,
			byteLength: new TextEncoder().encode(file.content).byteLength
		}))
	};
}
function safeKitId(documentId, revisionId, fingerprint) {
	const segment = (value) => {
		const result = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
		if (!result) throw new Error("Design Kit source has no safe project/revision identifier.");
		return result;
	};
	return `${segment(documentId)}--${segment(revisionId)}--${fingerprint.slice(0, 16).toLowerCase()}`;
}
function safeBrandKitId(kit) {
	const segment = (value) => {
		const result = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
		if (!result) throw new Error("Brand Kit source has no safe project, revision, or brand identifier.");
		return result;
	};
	return `${segment(kit.source.documentId)}--${segment(kit.source.revisionId)}--${segment(kit.source.brandId)}--${kit.source.documentFingerprint.slice(0, 16).toLowerCase()}--${kit.source.definitionFingerprint.slice(0, 16).toLowerCase()}`;
}
function isDesignKitExportStore(store) {
	return typeof store.writeDesignKit === "function";
}
function isBrandKitExportStore(store) {
	return typeof store.writeBrandKit === "function";
}
function isStarterExportStore(store) {
	return typeof store.writeStarter === "function";
}
function projectContext(state, include) {
	const result = {
		project: { ...state.manifest.project },
		design: {
			version: state.design.version,
			revision: state.design.revision.number,
			title: state.design.meta.title
		}
	};
	if (!include || include.includes("summary")) result.summary = {
		needs: state.design.needs.length,
		sources: state.design.sources.length,
		tokens: state.design.tokens.length,
		components: state.design.components.length,
		materials: state.design.materials.length
	};
	return result;
}
function materialList(state, filter) {
	const artifacts = new Map(state.artifactIndex.artifacts.map((artifact) => [artifact.sha256, artifact]));
	return { materials: state.design.materials.filter((material) => !filter?.kind || material.kind === filter.kind).filter((material) => !filter?.pageId || material.id === filter.pageId).map((material) => {
		const revision = material.revisions.find(({ id }) => id === material.currentRevisionId);
		if (!revision?.content.sha256) return {
			id: material.id,
			kind: material.kind,
			name: material.name,
			revisionId: material.currentRevisionId,
			artifact: null
		};
		return {
			id: material.id,
			kind: material.kind,
			name: material.name,
			revisionId: revision.id,
			artifact: artifacts.get(revision.content.sha256) ?? null
		};
	}) };
}
function validate(state, scopes) {
	const checks = scopes.map((scope) => {
		switch (scope) {
			case "design": {
				const result = validateDesignDocument(state.design);
				return result.ok ? {
					scope,
					valid: true
				} : {
					scope,
					valid: false,
					message: result.error
				};
			}
			case "tokens": return validateTokens(state);
			case "materials": return validateMaterials(state);
			case "outcome": return {
				scope,
				valid: true,
				message: "Outcome runtime is not persisted by this headless v1 host."
			};
		}
	});
	return {
		valid: checks.every((check) => check.valid),
		checks
	};
}
function validateTokens(state) {
	const names = /* @__PURE__ */ new Set();
	for (const token of state.design.tokens) {
		if (names.has(token.name)) return {
			scope: "tokens",
			valid: false,
			message: `Duplicate token name: ${token.name}`
		};
		names.add(token.name);
	}
	return {
		scope: "tokens",
		valid: true
	};
}
function validateMaterials(state) {
	const known = new Set(state.artifactIndex.artifacts.map(({ sha256 }) => sha256));
	for (const material of state.design.materials) for (const revision of material.revisions) {
		const digest = revision.content.sha256;
		if (digest && !known.has(digest)) return {
			scope: "materials",
			valid: false,
			message: `Missing artifact index entry: ${digest}`
		};
	}
	return {
		scope: "materials",
		valid: true
	};
}
function previewDesignPatch(state, patches) {
	let markdown = state.designMarkdown;
	let projectName = state.manifest.project.name;
	const changes = [];
	for (const patch of patches) {
		const before = patch.path === "/designMarkdown" ? markdown : projectName;
		const after = patch.op === "append" ? `${before}${patch.value}` : patch.value;
		if (patch.path === "/designMarkdown") markdown = after;
		else projectName = after;
		changes.push({
			path: patch.path,
			before,
			after
		});
	}
	return ok({
		operation: "design.patch",
		changes
	});
}
function previewTokensPatch(state, changes) {
	const byName = new Map(state.design.tokens.map((token) => [token.name, token]));
	const preview = [];
	for (const change of changes) {
		const token = byName.get(change.token);
		if (!token) return fail(`Unknown Design IR token: ${change.token}`);
		preview.push({
			token: change.token,
			before: token.value,
			after: change.value
		});
	}
	return ok({
		operation: "tokens.patch",
		changes: preview
	});
}
function isPatch(request) {
	return request.operation.type === "design.patch" || request.operation.type === "tokens.patch";
}
function response(request, revision, status, dryRun, idempotent, result, error) {
	return {
		protocol: "cutout.control.v1",
		requestId: request.requestId,
		status,
		revision,
		dryRun,
		idempotent,
		...result === void 0 ? {} : { result: redactControlValue(result) },
		...error ? { error } : {}
	};
}
function invalidResponse(input, message) {
	const candidate = input && typeof input === "object" && typeof input.requestId === "string" ? input.requestId : null;
	return {
		protocol: "cutout.control.v1",
		requestId: candidate && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(candidate) && !/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+)/i.test(candidate) ? candidate : "invalid-request",
		status: "invalid",
		revision: 0,
		dryRun: false,
		idempotent: false,
		error: {
			code: "invalid-request",
			message
		}
	};
}
function ok(result, nextState) {
	return {
		ok: true,
		result,
		...nextState ? { nextState } : {}
	};
}
function fail(message) {
	return {
		ok: false,
		message
	};
}
/** Guard used by filesystem adapters and tests when inspecting foreign indexes. */
function validateArtifactIndex(input) {
	return artifactIndexSchema.parse(input).artifacts;
}
//#endregion
//#region src/agent-runtime/tool-durability.ts
var durableToolStatusSchema = _enum([
	"planned",
	"in-flight",
	"reconciling",
	"succeeded",
	"failed",
	"cancelled"
]);
var safeText = string().max(1e3).refine((value) => !/(?:\bBearer\s+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b)/i.test(value));
var durableAttemptSchema = object({
	attemptId: string().min(1).max(160),
	startedAt: number().nonnegative(),
	completedAt: number().nonnegative().optional(),
	status: _enum([
		"in-flight",
		"succeeded",
		"failed",
		"cancelled",
		"reconciling"
	]),
	receipt: unknown().optional(),
	error: safeText.optional()
}).strict();
var durableToolRequestSchema = object({
	requestId: string().min(1).max(160),
	runId: string().min(1).max(160),
	toolCallId: string().min(1).max(160),
	capability: string().min(1).max(160),
	status: durableToolStatusSchema,
	createdAt: number().nonnegative(),
	updatedAt: number().nonnegative(),
	attempts: array(durableAttemptSchema)
}).strict();
var durableToolLedgerSchema = object({
	version: literal("cutout.tool-ledger.v1"),
	revision: number().int().nonnegative(),
	requests: array(durableToolRequestSchema)
}).strict();
var durableEventOutboxSchema = object({
	version: literal("cutout.tool-outbox.v1"),
	events: array(object({
		id: string().min(1),
		requestId: string().min(1),
		event: unknown()
	}).strict())
}).strict();
function recoverLedger(input) {
	return {
		...input,
		revision: input.revision + 1,
		requests: input.requests.map((request) => request.status === "in-flight" ? {
			...request,
			status: "reconciling",
			updatedAt: Date.now(),
			attempts: request.attempts.map((attempt) => attempt.status === "in-flight" ? {
				...attempt,
				status: "reconciling"
			} : attempt)
		} : request)
	};
}
function sanitize(value) {
	return value.replace(/(?:\bBearer\s+\S+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b)/gi, "<redacted>").replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, "<local-path>").slice(0, 1e3);
}
function sanitizeValue(value) {
	if (typeof value === "string") return sanitize(value);
	if (Array.isArray(value)) return value.map(sanitizeValue);
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(?:secret|credential|api[-_]?key|authorization)/i.test(key) ? "<redacted>" : sanitizeValue(item)]));
	return value;
}
//#endregion
//#region src/agent-runtime/tool-durability.node.ts
function createNodeToolDurabilityStore(projectRoot) {
	const directory = resolve(projectRoot, ".cutout"), statePath = join(directory, "tool-runtime.json"), ledgerPath = join(directory, "tool-requests.json"), outboxPath = join(directory, "tool-event-outbox.json"), lockPath = join(directory, ".tool-ledger.lock");
	const transaction = async (action) => {
		await mkdir(directory, { recursive: true });
		await acquire(lockPath);
		try {
			const stored = await readJson(statePath, null);
			const result = await action(durableToolLedgerSchema.parse(stored?.ledger ?? await readJson(ledgerPath, {
				version: "cutout.tool-ledger.v1",
				revision: 0,
				requests: []
			})), durableEventOutboxSchema.parse(stored?.outbox ?? await readJson(outboxPath, {
				version: "cutout.tool-outbox.v1",
				events: []
			})));
			await atomic(statePath, {
				version: "cutout.tool-runtime.v1",
				ledger: result.ledger,
				outbox: result.outbox
			});
			await Promise.allSettled([atomic(ledgerPath, result.ledger), atomic(outboxPath, result.outbox)]);
			return result.value;
		} finally {
			await rm(lockPath, {
				recursive: true,
				force: true
			});
		}
	};
	const mutate = (id, fn) => transaction(async (ledger, outbox) => {
		let value;
		const requests = ledger.requests.map((request) => request.requestId === id ? value = durableToolRequestSchema.parse(fn(request)) : request);
		if (!value) throw new Error(`Unknown durable tool request: ${id}`);
		return {
			ledger: {
				...ledger,
				revision: ledger.revision + 1,
				requests
			},
			outbox,
			value
		};
	});
	return {
		recover: () => transaction(async (ledger, outbox) => ({
			ledger: recoverLedger(ledger),
			outbox,
			value: void 0
		})),
		get: (id) => transaction(async (ledger, outbox) => ({
			ledger,
			outbox,
			value: ledger.requests.find((request) => request.requestId === id) ?? null
		})),
		plan: (input) => transaction(async (ledger, outbox) => {
			const existing = ledger.requests.find((request) => request.requestId === input.requestId);
			if (existing) return {
				ledger,
				outbox,
				value: {
					duplicate: true,
					request: existing
				}
			};
			const { at, ...identity } = input;
			const request = durableToolRequestSchema.parse({
				...identity,
				status: "planned",
				createdAt: at,
				updatedAt: at,
				attempts: []
			});
			return {
				ledger: {
					...ledger,
					revision: ledger.revision + 1,
					requests: [...ledger.requests, request]
				},
				outbox,
				value: {
					duplicate: false,
					request
				}
			};
		}),
		begin: (id, attemptId, at) => mutate(id, (request) => ({
			...request,
			status: "in-flight",
			updatedAt: at,
			attempts: [...request.attempts, {
				attemptId,
				startedAt: at,
				status: "in-flight"
			}]
		})),
		settle: (id, attemptId, outcome, events) => transaction(async (ledger, outbox) => {
			let value;
			const requests = ledger.requests.map((request) => request.requestId !== id ? request : value = durableToolRequestSchema.parse({
				...request,
				status: outcome.status,
				updatedAt: outcome.at,
				attempts: request.attempts.map((attempt) => attempt.attemptId === attemptId ? {
					...attempt,
					status: outcome.status,
					completedAt: outcome.at,
					...outcome.receipt ? { receipt: outcome.receipt } : {},
					...outcome.error ? { error: sanitize(outcome.error) } : {}
				} : attempt)
			}));
			if (!value) throw new Error(`Unknown durable tool request: ${id}`);
			return {
				ledger: {
					...ledger,
					revision: ledger.revision + 1,
					requests
				},
				outbox: {
					...outbox,
					events: [...outbox.events, ...events.map((event) => ({
						id: event.eventId,
						requestId: id,
						event: sanitizeValue(event)
					}))]
				},
				value
			};
		}),
		drainEvents: (deliver) => transaction(async (ledger, outbox) => {
			const events = outbox.events.map(({ event }) => event);
			if (events.length) deliver(events);
			return {
				ledger,
				outbox: {
					...outbox,
					events: []
				},
				value: events.length
			};
		})
	};
}
async function acquire(path) {
	const deadline = Date.now() + 1e4;
	while (true) try {
		await mkdir(path);
		return;
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		const info = await stat(path).catch(() => null);
		if (info && Date.now() - info.mtimeMs > 3e4) await rm(path, {
			recursive: true,
			force: true
		});
		if (Date.now() > deadline) throw new Error("Tool ledger is busy.");
		await new Promise((r) => setTimeout(r, 20));
	}
}
async function readJson(path, fallback) {
	return JSON.parse(await readFile(path, "utf8").catch((error) => error.code === "ENOENT" ? JSON.stringify(fallback) : Promise.reject(error)));
}
async function atomic(path, value) {
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 384 });
	await rename(temp, path);
}
//#endregion
//#region src/design-governance/contracts.ts
var governanceModeSchema = _enum([
	"light",
	"dark",
	"high-contrast"
]);
var governanceStateSchema = _enum([
	"default",
	"hover",
	"focus",
	"disabled",
	"selected"
]);
var governanceKindSchema = _enum([
	"text",
	"ui-boundary",
	"focus-indicator",
	"color-only"
]);
_enum([
	"brand-kit",
	"design-system-kit",
	"component",
	"starter",
	"figma",
	"delivery"
]);
object({
	id: string().min(1),
	selector: string().min(1),
	componentId: string().optional(),
	foregroundTokenId: string().min(1),
	backgroundTokenId: string().min(1),
	kind: governanceKindSchema,
	modes: array(governanceModeSchema).min(1),
	states: array(governanceStateSchema).min(1),
	lockedTokenIds: array(string()).default([])
}).strict().omit({
	modes: true,
	states: true
}).extend({
	scenarioId: string().min(1),
	mode: governanceModeSchema,
	state: governanceStateSchema
}).strict();
var nonColorCueEvidenceSchema = object({
	evidenceId: string().min(1),
	state: governanceStateSchema,
	kind: _enum([
		"text",
		"icon",
		"shape",
		"pattern",
		"position"
	]),
	source: _enum([
		"design-ir",
		"human-review",
		"dom-contract"
	])
}).strict();
object({
	scenarioId: string().min(1),
	viewport: string().min(1),
	foreground: string().min(1),
	backgroundLayers: array(string().min(1)).min(1),
	fontSizePx: number().nonnegative(),
	fontWeight: number().int().nonnegative(),
	borderColor: string().optional(),
	outlineColor: string().optional(),
	outlineWidthPx: number().nonnegative().default(0),
	nonColorCueEvidence: array(nonColorCueEvidenceSchema).default([]),
	axeViolations: array(object({
		id: string(),
		impact: _enum([
			"minor",
			"moderate",
			"serious",
			"critical"
		]).nullable()
	}).strict()).default([])
}).strict();
var governanceFindingSchema = object({
	id: string(),
	scenarioId: string(),
	rule: string(),
	severity: _enum(["hard", "advisory"]),
	status: _enum(["passed", "failed"]),
	summary: string(),
	evidence: record(string(), unknown()).default({})
}).strict();
object({
	version: literal("cutout.design-governance-receipt.v1"),
	receiptId: string(),
	createdAt: number().int().nonnegative(),
	status: _enum([
		"passed",
		"advisory",
		"blocked"
	]),
	findings: array(governanceFindingSchema),
	evidenceHash: string().regex(/^[a-f0-9]{64}$/)
}).strict();
object({
	version: literal("cutout.design-governance-repair.v1"),
	taskId: string(),
	receiptId: string(),
	failedFindingIds: array(string()).min(1),
	scenarioIds: array(string()).min(1),
	touchesBrandLock: boolean(),
	requiresHumanApproval: boolean(),
	approvalId: string().optional()
}).strict().superRefine((value, ctx) => {
	if (value.touchesBrandLock && !value.requiresHumanApproval) ctx.addIssue({
		code: "custom",
		message: "Brand-lock repairs require human approval."
	});
});
var locationSchema = object({
	entityId: string(),
	path: string()
}).strict();
object({
	id: string(),
	name: string(),
	type: _enum([
		"color",
		"dimension",
		"number",
		"fontFamily",
		"fontWeight",
		"duration",
		"cubicBezier",
		"shadow",
		"border",
		"gradient",
		"typography"
	]),
	tier: _enum([
		"primitive",
		"semantic",
		"component"
	]),
	value: unknown().optional(),
	alias: string().optional(),
	mode: string(),
	brandLock: object({
		approvedValue: unknown(),
		approvalId: string()
	}).strict().optional(),
	location: locationSchema
}).strict();
var governancePolicySchema = object({
	version: literal("design-governance-policy.v1"),
	id: string(),
	standards: object({
		wcag: string(),
		dtcg: string(),
		cssColor: string()
	}).strict(),
	severity: record(string(), _enum([
		"error",
		"warning",
		"advisory"
	])),
	thresholds: object({
		perceptualDeltaE: number(),
		spacingBase: number().positive(),
		maxMotionMs: number().nonnegative(),
		minFocusArea: number().nonnegative()
	}).strict()
}).strict();
var legacyFindingSchema = object({
	id: string(),
	ruleId: string(),
	standard: string(),
	policyVersion: string(),
	severity: _enum([
		"error",
		"warning",
		"advisory"
	]),
	blocking: boolean(),
	applicability: string(),
	message: string(),
	measurements: record(string(), union([
		string(),
		number(),
		boolean()
	])),
	locations: array(locationSchema),
	evidence: array(object({
		kind: string(),
		value: string()
	}).strict()),
	repairSuggestions: array(string())
}).strict();
object({
	protocol: literal("design-governance-report.v1"),
	id: string(),
	documentId: string(),
	revisionId: string(),
	policy: governancePolicySchema,
	summary: object({
		errors: number(),
		warnings: number(),
		advisories: number(),
		blocking: boolean()
	}).strict(),
	findings: array(legacyFindingSchema),
	measurements: object({
		evaluatedRules: number(),
		evaluatedLocations: number()
	}).strict(),
	completedAt: string().datetime()
}).strict();
//#endregion
//#region src/design-governance/color.ts
function parseCssColor(input) {
	const value = input.trim().toLowerCase();
	if (/^#[0-9a-f]{3,8}$/.test(value)) return hex(value);
	const rgb = value.match(/^rgba?\(\s*([\d.]+)%?[, ]+([\d.]+)%?[, ]+([\d.]+)%?(?:\s*[/,]\s*([\d.]+)%?)?\s*\)$/);
	if (rgb) {
		const percent = value.includes("%");
		return color(clamp(+rgb[1] / (percent ? 100 : 255)), clamp(+rgb[2] / (percent ? 100 : 255)), clamp(+rgb[3] / (percent ? 100 : 255)), alpha(rgb[4], value), "srgb");
	}
	const p3 = value.match(/^color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%?)?\)$/);
	if (p3) {
		const [x, y, z] = p3ToSrgb(+p3[1], +p3[2], +p3[3]);
		return color(x, y, z, alpha(p3[4], value), "display-p3");
	}
	const ok = value.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+(-?[\d.]+)(deg|grad|rad|turn)?(?:\s*\/\s*([\d.]+)%?)?\s*\)$/);
	if (ok) {
		const l = +ok[1] / (/^oklch\(\s*[\d.]+%/.test(value) ? 100 : 1), c = +ok[2], h = angleRadians(+ok[3], ok[4]);
		const [r, g, b] = oklabToSrgb(l, c * Math.cos(h), c * Math.sin(h));
		return color(r, g, b, alpha(ok[5], value), "oklch");
	}
	throw new Error(`Unsupported CSS Color 4 value: ${input}`);
}
function composite(foreground, background) {
	const a = foreground.a + background.a * (1 - foreground.a);
	if (a === 0) return color(0, 0, 0, 0, "srgb");
	return color((foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / a, (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / a, (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / a, a, "srgb");
}
function contrastRatio(a, b) {
	const x = opaque(a, b), y = opaque(b, color(1, 1, 1, 1, "srgb"));
	const l1 = luminance(x), l2 = luminance(y);
	return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
}
function deltaE(a, b) {
	const x = srgbToOklab(a), y = srgbToOklab(b);
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}
function simulateColorVision(c, kind) {
	return color(...(kind === "protanopia" ? [
		[
			.152,
			.853,
			-.005
		],
		[
			.115,
			.786,
			.099
		],
		[
			-.004,
			-.048,
			1.052
		]
	] : kind === "deuteranopia" ? [
		[
			.367,
			.861,
			-.228
		],
		[
			.28,
			.673,
			.047
		],
		[
			-.012,
			.043,
			.969
		]
	] : [
		[
			1.256,
			-.077,
			-.179
		],
		[
			-.078,
			.931,
			.148
		],
		[
			.005,
			.691,
			.304
		]
	]).map((row) => clamp(row[0] * c.r + row[1] * c.g + row[2] * c.b)), c.a, "srgb");
}
function hex(v) {
	let s = v.slice(1);
	if (s.length === 3 || s.length === 4) s = [...s].map((x) => x + x).join("");
	return color(parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255, s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1, "srgb");
}
function alpha(v, source) {
	if (!v) return 1;
	return clamp(+v / (source.match(/\/\s*[\d.]+%/) ? 100 : 1));
}
function color(r, g, b, a, source) {
	return {
		r,
		g,
		b,
		a,
		source
	};
}
function clamp(v) {
	return Math.min(1, Math.max(0, v));
}
function lin(v) {
	return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
}
function gam(v) {
	return v <= .0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - .055;
}
function luminance(c) {
	return .2126 * lin(c.r) + .7152 * lin(c.g) + .0722 * lin(c.b);
}
function opaque(a, b) {
	return a.a < 1 ? composite(a, b) : a;
}
function p3ToSrgb(r, g, b) {
	const lr = lin(r), lg = lin(g), lb = lin(b), x = .4865709 * lr + .2656677 * lg + .1982173 * lb, y = .2289746 * lr + .6917385 * lg + .0792869 * lb, z = .0451134 * lg + 1.0439444 * lb;
	return [
		gam(3.2406 * x - 1.5372 * y - .4986 * z),
		gam(-.9689 * x + 1.8758 * y + .0415 * z),
		gam(.0557 * x - .204 * y + 1.057 * z)
	];
}
function angleRadians(value, unit) {
	if (unit === "rad") return value;
	if (unit === "turn") return value * Math.PI * 2;
	if (unit === "grad") return value * Math.PI / 200;
	return value * Math.PI / 180;
}
function oklabToSrgb(L, a, b) {
	const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
	return [
		gam(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s),
		gam(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s),
		gam(-.0041960863 * l - .7034186147 * m + 1.707614701 * s)
	];
}
function srgbToOklab(c) {
	const r = lin(c.r), g = lin(c.g), b = lin(c.b), l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
	return [
		.2104542553 * l + .793617785 * m - .0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
		.0259040371 * l + .7827717662 * m - .808675766 * s
	];
}
/**
* [js-sha256]{@link https://github.com/emn178/js-sha256}
*
* @version 0.10.1
* @author Chen, Yi-Cyuan [emn178@gmail.com]
* @copyright Chen, Yi-Cyuan 2014-2023
* @license MIT
*/
(/* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function() {
		"use strict";
		var ERROR = "input is invalid type";
		var WINDOW = typeof window === "object";
		var root = WINDOW ? window : {};
		if (root.JS_SHA256_NO_WINDOW) WINDOW = false;
		var WEB_WORKER = !WINDOW && typeof self === "object";
		var NODE_JS = !root.JS_SHA256_NO_NODE_JS && typeof process === "object" && process.versions && process.versions.node;
		if (NODE_JS) root = global;
		else if (WEB_WORKER) root = self;
		var COMMON_JS = !root.JS_SHA256_NO_COMMON_JS && typeof module === "object" && module.exports;
		var AMD = typeof define === "function" && define.amd;
		var ARRAY_BUFFER = !root.JS_SHA256_NO_ARRAY_BUFFER && typeof ArrayBuffer !== "undefined";
		var HEX_CHARS = "0123456789abcdef".split("");
		var EXTRA = [
			-2147483648,
			8388608,
			32768,
			128
		];
		var SHIFT = [
			24,
			16,
			8,
			0
		];
		var K = [
			1116352408,
			1899447441,
			3049323471,
			3921009573,
			961987163,
			1508970993,
			2453635748,
			2870763221,
			3624381080,
			310598401,
			607225278,
			1426881987,
			1925078388,
			2162078206,
			2614888103,
			3248222580,
			3835390401,
			4022224774,
			264347078,
			604807628,
			770255983,
			1249150122,
			1555081692,
			1996064986,
			2554220882,
			2821834349,
			2952996808,
			3210313671,
			3336571891,
			3584528711,
			113926993,
			338241895,
			666307205,
			773529912,
			1294757372,
			1396182291,
			1695183700,
			1986661051,
			2177026350,
			2456956037,
			2730485921,
			2820302411,
			3259730800,
			3345764771,
			3516065817,
			3600352804,
			4094571909,
			275423344,
			430227734,
			506948616,
			659060556,
			883997877,
			958139571,
			1322822218,
			1537002063,
			1747873779,
			1955562222,
			2024104815,
			2227730452,
			2361852424,
			2428436474,
			2756734187,
			3204031479,
			3329325298
		];
		var OUTPUT_TYPES = [
			"hex",
			"array",
			"digest",
			"arrayBuffer"
		];
		var blocks = [];
		if (root.JS_SHA256_NO_NODE_JS || !Array.isArray) Array.isArray = function(obj) {
			return Object.prototype.toString.call(obj) === "[object Array]";
		};
		if (ARRAY_BUFFER && (root.JS_SHA256_NO_ARRAY_BUFFER_IS_VIEW || !ArrayBuffer.isView)) ArrayBuffer.isView = function(obj) {
			return typeof obj === "object" && obj.buffer && obj.buffer.constructor === ArrayBuffer;
		};
		var createOutputMethod = function(outputType, is224) {
			return function(message) {
				return new Sha256(is224, true).update(message)[outputType]();
			};
		};
		var createMethod = function(is224) {
			var method = createOutputMethod("hex", is224);
			if (NODE_JS) method = nodeWrap(method, is224);
			method.create = function() {
				return new Sha256(is224);
			};
			method.update = function(message) {
				return method.create().update(message);
			};
			for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
				var type = OUTPUT_TYPES[i];
				method[type] = createOutputMethod(type, is224);
			}
			return method;
		};
		var nodeWrap = function(method, is224) {
			var crypto = __require("crypto");
			var Buffer = __require("buffer").Buffer;
			var algorithm = is224 ? "sha224" : "sha256";
			var bufferFrom;
			if (Buffer.from && !root.JS_SHA256_NO_BUFFER_FROM) bufferFrom = Buffer.from;
			else bufferFrom = function(message) {
				return new Buffer(message);
			};
			var nodeMethod = function(message) {
				if (typeof message === "string") return crypto.createHash(algorithm).update(message, "utf8").digest("hex");
				else if (message === null || message === void 0) throw new Error(ERROR);
				else if (message.constructor === ArrayBuffer) message = new Uint8Array(message);
				if (Array.isArray(message) || ArrayBuffer.isView(message) || message.constructor === Buffer) return crypto.createHash(algorithm).update(bufferFrom(message)).digest("hex");
				else return method(message);
			};
			return nodeMethod;
		};
		var createHmacOutputMethod = function(outputType, is224) {
			return function(key, message) {
				return new HmacSha256(key, is224, true).update(message)[outputType]();
			};
		};
		var createHmacMethod = function(is224) {
			var method = createHmacOutputMethod("hex", is224);
			method.create = function(key) {
				return new HmacSha256(key, is224);
			};
			method.update = function(key, message) {
				return method.create(key).update(message);
			};
			for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
				var type = OUTPUT_TYPES[i];
				method[type] = createHmacOutputMethod(type, is224);
			}
			return method;
		};
		function Sha256(is224, sharedMemory) {
			if (sharedMemory) {
				blocks[0] = blocks[16] = blocks[1] = blocks[2] = blocks[3] = blocks[4] = blocks[5] = blocks[6] = blocks[7] = blocks[8] = blocks[9] = blocks[10] = blocks[11] = blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
				this.blocks = blocks;
			} else this.blocks = [
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0
			];
			if (is224) {
				this.h0 = 3238371032;
				this.h1 = 914150663;
				this.h2 = 812702999;
				this.h3 = 4144912697;
				this.h4 = 4290775857;
				this.h5 = 1750603025;
				this.h6 = 1694076839;
				this.h7 = 3204075428;
			} else {
				this.h0 = 1779033703;
				this.h1 = 3144134277;
				this.h2 = 1013904242;
				this.h3 = 2773480762;
				this.h4 = 1359893119;
				this.h5 = 2600822924;
				this.h6 = 528734635;
				this.h7 = 1541459225;
			}
			this.block = this.start = this.bytes = this.hBytes = 0;
			this.finalized = this.hashed = false;
			this.first = true;
			this.is224 = is224;
		}
		Sha256.prototype.update = function(message) {
			if (this.finalized) return;
			var notString, type = typeof message;
			if (type !== "string") {
				if (type === "object") {
					if (message === null) throw new Error(ERROR);
					else if (ARRAY_BUFFER && message.constructor === ArrayBuffer) message = new Uint8Array(message);
					else if (!Array.isArray(message)) {
						if (!ARRAY_BUFFER || !ArrayBuffer.isView(message)) throw new Error(ERROR);
					}
				} else throw new Error(ERROR);
				notString = true;
			}
			var code, index = 0, i, length = message.length, blocks = this.blocks;
			while (index < length) {
				if (this.hashed) {
					this.hashed = false;
					blocks[0] = this.block;
					blocks[16] = blocks[1] = blocks[2] = blocks[3] = blocks[4] = blocks[5] = blocks[6] = blocks[7] = blocks[8] = blocks[9] = blocks[10] = blocks[11] = blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
				}
				if (notString) for (i = this.start; index < length && i < 64; ++index) blocks[i >> 2] |= message[index] << SHIFT[i++ & 3];
				else for (i = this.start; index < length && i < 64; ++index) {
					code = message.charCodeAt(index);
					if (code < 128) blocks[i >> 2] |= code << SHIFT[i++ & 3];
					else if (code < 2048) {
						blocks[i >> 2] |= (192 | code >> 6) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | code & 63) << SHIFT[i++ & 3];
					} else if (code < 55296 || code >= 57344) {
						blocks[i >> 2] |= (224 | code >> 12) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | code >> 6 & 63) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | code & 63) << SHIFT[i++ & 3];
					} else {
						code = 65536 + ((code & 1023) << 10 | message.charCodeAt(++index) & 1023);
						blocks[i >> 2] |= (240 | code >> 18) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | code >> 12 & 63) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | code >> 6 & 63) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | code & 63) << SHIFT[i++ & 3];
					}
				}
				this.lastByteIndex = i;
				this.bytes += i - this.start;
				if (i >= 64) {
					this.block = blocks[16];
					this.start = i - 64;
					this.hash();
					this.hashed = true;
				} else this.start = i;
			}
			if (this.bytes > 4294967295) {
				this.hBytes += this.bytes / 4294967296 << 0;
				this.bytes = this.bytes % 4294967296;
			}
			return this;
		};
		Sha256.prototype.finalize = function() {
			if (this.finalized) return;
			this.finalized = true;
			var blocks = this.blocks, i = this.lastByteIndex;
			blocks[16] = this.block;
			blocks[i >> 2] |= EXTRA[i & 3];
			this.block = blocks[16];
			if (i >= 56) {
				if (!this.hashed) this.hash();
				blocks[0] = this.block;
				blocks[16] = blocks[1] = blocks[2] = blocks[3] = blocks[4] = blocks[5] = blocks[6] = blocks[7] = blocks[8] = blocks[9] = blocks[10] = blocks[11] = blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
			}
			blocks[14] = this.hBytes << 3 | this.bytes >>> 29;
			blocks[15] = this.bytes << 3;
			this.hash();
		};
		Sha256.prototype.hash = function() {
			var a = this.h0, b = this.h1, c = this.h2, d = this.h3, e = this.h4, f = this.h5, g = this.h6, h = this.h7, blocks = this.blocks, j, s0, s1, maj, t1, t2, ch, ab, da, cd, bc;
			for (j = 16; j < 64; ++j) {
				t1 = blocks[j - 15];
				s0 = (t1 >>> 7 | t1 << 25) ^ (t1 >>> 18 | t1 << 14) ^ t1 >>> 3;
				t1 = blocks[j - 2];
				s1 = (t1 >>> 17 | t1 << 15) ^ (t1 >>> 19 | t1 << 13) ^ t1 >>> 10;
				blocks[j] = blocks[j - 16] + s0 + blocks[j - 7] + s1 << 0;
			}
			bc = b & c;
			for (j = 0; j < 64; j += 4) {
				if (this.first) {
					if (this.is224) {
						ab = 300032;
						t1 = blocks[0] - 1413257819;
						h = t1 - 150054599 << 0;
						d = t1 + 24177077 << 0;
					} else {
						ab = 704751109;
						t1 = blocks[0] - 210244248;
						h = t1 - 1521486534 << 0;
						d = t1 + 143694565 << 0;
					}
					this.first = false;
				} else {
					s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
					s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
					ab = a & b;
					maj = ab ^ a & c ^ bc;
					ch = e & f ^ ~e & g;
					t1 = h + s1 + ch + K[j] + blocks[j];
					t2 = s0 + maj;
					h = d + t1 << 0;
					d = t1 + t2 << 0;
				}
				s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
				s1 = (h >>> 6 | h << 26) ^ (h >>> 11 | h << 21) ^ (h >>> 25 | h << 7);
				da = d & a;
				maj = da ^ d & b ^ ab;
				ch = h & e ^ ~h & f;
				t1 = g + s1 + ch + K[j + 1] + blocks[j + 1];
				t2 = s0 + maj;
				g = c + t1 << 0;
				c = t1 + t2 << 0;
				s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
				s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
				cd = c & d;
				maj = cd ^ c & a ^ da;
				ch = g & h ^ ~g & e;
				t1 = f + s1 + ch + K[j + 2] + blocks[j + 2];
				t2 = s0 + maj;
				f = b + t1 << 0;
				b = t1 + t2 << 0;
				s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
				s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
				bc = b & c;
				maj = bc ^ b & d ^ cd;
				ch = f & g ^ ~f & h;
				t1 = e + s1 + ch + K[j + 3] + blocks[j + 3];
				t2 = s0 + maj;
				e = a + t1 << 0;
				a = t1 + t2 << 0;
				this.chromeBugWorkAround = true;
			}
			this.h0 = this.h0 + a << 0;
			this.h1 = this.h1 + b << 0;
			this.h2 = this.h2 + c << 0;
			this.h3 = this.h3 + d << 0;
			this.h4 = this.h4 + e << 0;
			this.h5 = this.h5 + f << 0;
			this.h6 = this.h6 + g << 0;
			this.h7 = this.h7 + h << 0;
		};
		Sha256.prototype.hex = function() {
			this.finalize();
			var h0 = this.h0, h1 = this.h1, h2 = this.h2, h3 = this.h3, h4 = this.h4, h5 = this.h5, h6 = this.h6, h7 = this.h7;
			var hex = HEX_CHARS[h0 >> 28 & 15] + HEX_CHARS[h0 >> 24 & 15] + HEX_CHARS[h0 >> 20 & 15] + HEX_CHARS[h0 >> 16 & 15] + HEX_CHARS[h0 >> 12 & 15] + HEX_CHARS[h0 >> 8 & 15] + HEX_CHARS[h0 >> 4 & 15] + HEX_CHARS[h0 & 15] + HEX_CHARS[h1 >> 28 & 15] + HEX_CHARS[h1 >> 24 & 15] + HEX_CHARS[h1 >> 20 & 15] + HEX_CHARS[h1 >> 16 & 15] + HEX_CHARS[h1 >> 12 & 15] + HEX_CHARS[h1 >> 8 & 15] + HEX_CHARS[h1 >> 4 & 15] + HEX_CHARS[h1 & 15] + HEX_CHARS[h2 >> 28 & 15] + HEX_CHARS[h2 >> 24 & 15] + HEX_CHARS[h2 >> 20 & 15] + HEX_CHARS[h2 >> 16 & 15] + HEX_CHARS[h2 >> 12 & 15] + HEX_CHARS[h2 >> 8 & 15] + HEX_CHARS[h2 >> 4 & 15] + HEX_CHARS[h2 & 15] + HEX_CHARS[h3 >> 28 & 15] + HEX_CHARS[h3 >> 24 & 15] + HEX_CHARS[h3 >> 20 & 15] + HEX_CHARS[h3 >> 16 & 15] + HEX_CHARS[h3 >> 12 & 15] + HEX_CHARS[h3 >> 8 & 15] + HEX_CHARS[h3 >> 4 & 15] + HEX_CHARS[h3 & 15] + HEX_CHARS[h4 >> 28 & 15] + HEX_CHARS[h4 >> 24 & 15] + HEX_CHARS[h4 >> 20 & 15] + HEX_CHARS[h4 >> 16 & 15] + HEX_CHARS[h4 >> 12 & 15] + HEX_CHARS[h4 >> 8 & 15] + HEX_CHARS[h4 >> 4 & 15] + HEX_CHARS[h4 & 15] + HEX_CHARS[h5 >> 28 & 15] + HEX_CHARS[h5 >> 24 & 15] + HEX_CHARS[h5 >> 20 & 15] + HEX_CHARS[h5 >> 16 & 15] + HEX_CHARS[h5 >> 12 & 15] + HEX_CHARS[h5 >> 8 & 15] + HEX_CHARS[h5 >> 4 & 15] + HEX_CHARS[h5 & 15] + HEX_CHARS[h6 >> 28 & 15] + HEX_CHARS[h6 >> 24 & 15] + HEX_CHARS[h6 >> 20 & 15] + HEX_CHARS[h6 >> 16 & 15] + HEX_CHARS[h6 >> 12 & 15] + HEX_CHARS[h6 >> 8 & 15] + HEX_CHARS[h6 >> 4 & 15] + HEX_CHARS[h6 & 15];
			if (!this.is224) hex += HEX_CHARS[h7 >> 28 & 15] + HEX_CHARS[h7 >> 24 & 15] + HEX_CHARS[h7 >> 20 & 15] + HEX_CHARS[h7 >> 16 & 15] + HEX_CHARS[h7 >> 12 & 15] + HEX_CHARS[h7 >> 8 & 15] + HEX_CHARS[h7 >> 4 & 15] + HEX_CHARS[h7 & 15];
			return hex;
		};
		Sha256.prototype.toString = Sha256.prototype.hex;
		Sha256.prototype.digest = function() {
			this.finalize();
			var h0 = this.h0, h1 = this.h1, h2 = this.h2, h3 = this.h3, h4 = this.h4, h5 = this.h5, h6 = this.h6, h7 = this.h7;
			var arr = [
				h0 >> 24 & 255,
				h0 >> 16 & 255,
				h0 >> 8 & 255,
				h0 & 255,
				h1 >> 24 & 255,
				h1 >> 16 & 255,
				h1 >> 8 & 255,
				h1 & 255,
				h2 >> 24 & 255,
				h2 >> 16 & 255,
				h2 >> 8 & 255,
				h2 & 255,
				h3 >> 24 & 255,
				h3 >> 16 & 255,
				h3 >> 8 & 255,
				h3 & 255,
				h4 >> 24 & 255,
				h4 >> 16 & 255,
				h4 >> 8 & 255,
				h4 & 255,
				h5 >> 24 & 255,
				h5 >> 16 & 255,
				h5 >> 8 & 255,
				h5 & 255,
				h6 >> 24 & 255,
				h6 >> 16 & 255,
				h6 >> 8 & 255,
				h6 & 255
			];
			if (!this.is224) arr.push(h7 >> 24 & 255, h7 >> 16 & 255, h7 >> 8 & 255, h7 & 255);
			return arr;
		};
		Sha256.prototype.array = Sha256.prototype.digest;
		Sha256.prototype.arrayBuffer = function() {
			this.finalize();
			var buffer = /* @__PURE__ */ new ArrayBuffer(this.is224 ? 28 : 32);
			var dataView = new DataView(buffer);
			dataView.setUint32(0, this.h0);
			dataView.setUint32(4, this.h1);
			dataView.setUint32(8, this.h2);
			dataView.setUint32(12, this.h3);
			dataView.setUint32(16, this.h4);
			dataView.setUint32(20, this.h5);
			dataView.setUint32(24, this.h6);
			if (!this.is224) dataView.setUint32(28, this.h7);
			return buffer;
		};
		function HmacSha256(key, is224, sharedMemory) {
			var i, type = typeof key;
			if (type === "string") {
				var bytes = [], length = key.length, index = 0, code;
				for (i = 0; i < length; ++i) {
					code = key.charCodeAt(i);
					if (code < 128) bytes[index++] = code;
					else if (code < 2048) {
						bytes[index++] = 192 | code >> 6;
						bytes[index++] = 128 | code & 63;
					} else if (code < 55296 || code >= 57344) {
						bytes[index++] = 224 | code >> 12;
						bytes[index++] = 128 | code >> 6 & 63;
						bytes[index++] = 128 | code & 63;
					} else {
						code = 65536 + ((code & 1023) << 10 | key.charCodeAt(++i) & 1023);
						bytes[index++] = 240 | code >> 18;
						bytes[index++] = 128 | code >> 12 & 63;
						bytes[index++] = 128 | code >> 6 & 63;
						bytes[index++] = 128 | code & 63;
					}
				}
				key = bytes;
			} else if (type === "object") {
				if (key === null) throw new Error(ERROR);
				else if (ARRAY_BUFFER && key.constructor === ArrayBuffer) key = new Uint8Array(key);
				else if (!Array.isArray(key)) {
					if (!ARRAY_BUFFER || !ArrayBuffer.isView(key)) throw new Error(ERROR);
				}
			} else throw new Error(ERROR);
			if (key.length > 64) key = new Sha256(is224, true).update(key).array();
			var oKeyPad = [], iKeyPad = [];
			for (i = 0; i < 64; ++i) {
				var b = key[i] || 0;
				oKeyPad[i] = 92 ^ b;
				iKeyPad[i] = 54 ^ b;
			}
			Sha256.call(this, is224, sharedMemory);
			this.update(iKeyPad);
			this.oKeyPad = oKeyPad;
			this.inner = true;
			this.sharedMemory = sharedMemory;
		}
		HmacSha256.prototype = new Sha256();
		HmacSha256.prototype.finalize = function() {
			Sha256.prototype.finalize.call(this);
			if (this.inner) {
				this.inner = false;
				var innerHash = this.array();
				Sha256.call(this, this.is224, this.sharedMemory);
				this.update(this.oKeyPad);
				this.update(innerHash);
				Sha256.prototype.finalize.call(this);
			}
		};
		var exports$1 = createMethod();
		exports$1.sha256 = exports$1;
		exports$1.sha224 = createMethod(true);
		exports$1.sha256.hmac = createHmacMethod();
		exports$1.sha224.hmac = createHmacMethod(true);
		if (COMMON_JS) module.exports = exports$1;
		else {
			root.sha256 = exports$1.sha256;
			root.sha224 = exports$1.sha224;
			if (AMD) define(function() {
				return exports$1;
			});
		}
	})();
})))();
//#endregion
//#region src/design-governance/standards-contracts.ts
var id = string().min(1), location = object({
	entityId: id,
	path: string().min(1),
	surface: string().optional()
}).strict();
var standardGovernanceTokenSchema = object({
	id,
	name: string().min(1),
	type: _enum([
		"color",
		"dimension",
		"font-family",
		"font-weight",
		"duration",
		"cubic-bezier",
		"number"
	]),
	tier: _enum([
		"primitive",
		"semantic",
		"component"
	]),
	value: union([string(), number()]).optional(),
	alias: string().optional(),
	mode: string().min(1).default("default"),
	brandLock: object({
		approvedValue: union([string(), number()]),
		approvalId: id
	}).strict().optional(),
	location
}).strict();
var standardGovernancePolicySchema = object({
	version: literal("design-governance-policy.v1"),
	id,
	standards: object({
		wcag: literal("2.2"),
		dtcg: string().min(1),
		cssColor: literal("4")
	}),
	severity: record(string(), _enum([
		"error",
		"warning",
		"advisory"
	])),
	thresholds: object({
		perceptualDeltaE: number().positive(),
		spacingBase: number().positive(),
		maxMotionMs: number().positive(),
		minFocusArea: number().positive()
	}).strict()
}).strict();
var standardGovernanceFindingSchema = object({
	id,
	ruleId: id,
	standard: string().min(1),
	policyVersion: id,
	severity: _enum([
		"error",
		"warning",
		"advisory"
	]),
	blocking: boolean(),
	applicability: string().min(1),
	message: string().min(1),
	measurements: record(string(), union([
		string(),
		number(),
		boolean()
	])),
	locations: array(location).min(1),
	evidence: array(object({
		kind: string(),
		value: string()
	}).strict()),
	repairSuggestions: array(string().min(1))
}).strict().superRefine((v, c) => {
	if (v.severity === "advisory" && v.blocking) c.addIssue({
		code: "custom",
		message: "Advisory findings cannot block delivery."
	});
});
var designGovernanceReportSchema = object({
	protocol: literal("design-governance-report.v1"),
	id,
	documentId: id,
	revisionId: id,
	policy: standardGovernancePolicySchema,
	summary: object({
		errors: number().int().nonnegative(),
		warnings: number().int().nonnegative(),
		advisories: number().int().nonnegative(),
		blocking: boolean()
	}).strict(),
	findings: array(standardGovernanceFindingSchema),
	measurements: object({
		evaluatedRules: number().int().nonnegative(),
		evaluatedLocations: number().int().nonnegative()
	}).strict(),
	completedAt: string().datetime()
}).strict();
//#endregion
//#region src/design-governance/harness.ts
function runDesignGovernance(input, policyInput) {
	const policy = standardGovernancePolicySchema.parse(policyInput), tokens = input.tokens.map((t) => standardGovernanceTokenSchema.parse(t)), findings = [...tokenFindings(tokens, policy), ...input.samples.flatMap((s) => sampleFindings(s, policy))];
	const errors = findings.filter((f) => f.severity === "error").length, warnings = findings.filter((f) => f.severity === "warning").length, advisories = findings.filter((f) => f.severity === "advisory").length;
	return designGovernanceReportSchema.parse({
		protocol: "design-governance-report.v1",
		id: `governance:${input.revisionId}`,
		documentId: input.documentId,
		revisionId: input.revisionId,
		policy,
		summary: {
			errors,
			warnings,
			advisories,
			blocking: findings.some((f) => f.blocking)
		},
		findings,
		measurements: {
			evaluatedRules: 12,
			evaluatedLocations: tokens.length + input.samples.length
		},
		completedAt: input.completedAt
	});
}
function tokenFindings(tokens, policy) {
	const findings = [], byId = new Map(tokens.map((t) => [t.id, t])), rank = {
		primitive: 0,
		semantic: 1,
		component: 2
	};
	for (const token of tokens) {
		if (token.alias) {
			const target = byId.get(token.alias);
			if (!target) findings.push(finding("dtcg.alias.missing", "DTCG", policy, "error", true, `Token alias ${token.alias} does not exist.`, token.location, { alias: token.alias }, ["Reference a declared lower-tier token."]));
			else if (rank[target.tier] >= rank[token.tier]) findings.push(finding("dtcg.alias.direction", "DTCG", policy, "error", true, "Token aliases must flow primitive to semantic to component.", token.location, {
				sourceTier: token.tier,
				targetTier: target.tier
			}, ["Move the value to a lower tier or reverse the dependency."]));
		}
		if (token.brandLock && token.value !== void 0 && token.value !== token.brandLock.approvedValue) findings.push(finding("brand.approved-lock", "Brand policy", policy, "error", true, "Token deviates from its approved brand lock.", token.location, {
			actual: String(token.value),
			approved: String(token.brandLock.approvedValue)
		}, ["Restore the approved value or obtain a new explicit brand approval."]));
	}
	for (const token of tokens) {
		const seen = /* @__PURE__ */ new Set();
		let current = token;
		while (current?.alias) {
			if (seen.has(current.id)) {
				findings.push(finding("dtcg.alias.cycle", "DTCG", policy, "error", true, "Token graph contains an alias cycle.", token.location, { tokenId: token.id }, ["Break the alias cycle with one concrete primitive value."]));
				break;
			}
			seen.add(current.id);
			current = byId.get(current.alias);
		}
	}
	return dedupe(findings);
}
function sampleFindings(s, p) {
	if (s.kind === "text") {
		const ratio = contrastRatio(parseCssColor(s.foreground), parseCssColor(s.background)), large = s.fontSizePx >= 24 || s.fontSizePx >= 18.66 && s.fontWeight >= 700, required = large ? 3 : 4.5;
		return ratio < required ? [finding(large ? "wcag.text.large" : "wcag.text.normal", "WCAG 2.2 1.4.3", p, "error", true, `Text contrast ${ratio.toFixed(2)}:1 is below ${required}:1.`, s.location, {
			ratio,
			required,
			fontSizePx: s.fontSizePx,
			fontWeight: s.fontWeight
		}, ["Choose foreground/background tokens that meet the measured ratio."])] : [];
	}
	if (s.kind === "non-text") {
		const ratio = contrastRatio(parseCssColor(s.foreground), parseCssColor(s.adjacent));
		return ratio < 3 ? [finding("wcag.non-text", "WCAG 2.2 1.4.11", p, "error", true, "Non-text component contrast is below 3:1.", s.location, {
			ratio,
			required: 3
		}, ["Increase the component boundary or state contrast."])] : [];
	}
	if (s.kind === "focus") {
		const ratio = contrastRatio(parseCssColor(s.indicator), parseCssColor(s.adjacent)), area = s.thicknessPx * s.perimeterPx;
		const result = [];
		if (ratio < 3) result.push(finding("wcag.focus.contrast", "WCAG 2.2 2.4.11", p, "error", true, "Focus indicator contrast is below 3:1.", s.location, {
			ratio,
			required: 3
		}, ["Use a higher-contrast focus token."]));
		if (area < p.thresholds.minFocusArea) result.push(finding("wcag.focus.area", "WCAG 2.2 2.4.11", p, "error", true, "Focus indicator area is insufficient.", s.location, {
			area,
			required: p.thresholds.minFocusArea
		}, ["Increase focus indicator thickness or perimeter coverage."]));
		return result;
	}
	if (s.kind === "color-only") {
		if (s.hasSecondaryCue) return [];
		let minimum = Infinity;
		for (let i = 0; i < s.colors.length; i++) for (let j = i + 1; j < s.colors.length; j++) for (const vision of [
			"protanopia",
			"deuteranopia",
			"tritanopia"
		]) minimum = Math.min(minimum, deltaE(simulateColorVision(parseCssColor(s.colors[i]), vision), simulateColorVision(parseCssColor(s.colors[j]), vision)));
		return [finding("wcag.color-only", "WCAG 2.2 1.4.1", p, "error", true, "Meaning is communicated by color alone.", s.location, { minimumSimulatedDeltaE: minimum }, ["Add text, shape, icon, pattern, or position as a secondary cue."]), ...minimum < p.thresholds.perceptualDeltaE ? [finding("color.perceptual-distinguishability", "Perceptual advisory", p, "advisory", false, "Colors may be difficult to distinguish for some color-vision conditions.", s.location, {
			minimumSimulatedDeltaE: minimum,
			threshold: p.thresholds.perceptualDeltaE
		}, ["Increase perceptual separation while preserving a non-color cue."])] : []];
	}
	if (s.kind === "typography") {
		const ratio = s.lineHeightPx / s.fontSizePx;
		return [...ratio < 1.2 || ratio > 1.8 ? [finding("typography.line-height", "Design system policy", p, "warning", false, "Line height falls outside the configured readable range.", s.location, {
			ratio,
			min: 1.2,
			max: 1.8
		}, ["Use a line-height token between 1.2 and 1.8 for this text role."])] : [], ...s.lineLengthChars > 90 ? [finding("typography.line-length", "Design system policy", p, "warning", false, "Line length exceeds 90 characters.", s.location, {
			characters: s.lineLengthChars,
			max: 90
		}, ["Constrain the reading measure."])] : []];
	}
	if (s.kind === "spacing") {
		const remainder = s.valuePx % p.thresholds.spacingBase;
		return remainder !== 0 ? [finding("spacing.rhythm", "Design system policy", p, "warning", false, "Spacing is off the configured rhythm.", s.location, {
			valuePx: s.valuePx,
			base: p.thresholds.spacingBase,
			remainder
		}, ["Use the nearest approved spacing token."])] : [];
	}
	if (s.kind === "layout") return s.overlaps || s.contentWidth > s.viewportWidth ? [finding("layout.overflow", "Design system policy", p, "error", true, "Layout overlaps or exceeds its viewport.", s.location, {
		viewportWidth: s.viewportWidth,
		contentWidth: s.contentWidth,
		overlaps: s.overlaps
	}, ["Use bounded tracks, wrapping, or responsive constraints."])] : [];
	if (s.kind === "motion") return [...s.durationMs > p.thresholds.maxMotionMs ? [finding("motion.duration", "Design system policy", p, "warning", false, "Motion duration exceeds the configured bound.", s.location, {
		durationMs: s.durationMs,
		max: p.thresholds.maxMotionMs
	}, ["Use a shorter motion duration token."])] : [], ...!s.essential && !s.reducedMotionAlternative ? [finding("wcag.motion-reduction", "WCAG 2.2 2.3.3", p, "error", true, "Non-essential motion lacks a reduced-motion alternative.", s.location, {
		essential: s.essential,
		reducedMotionAlternative: s.reducedMotionAlternative
	}, ["Disable or simplify motion under prefers-reduced-motion."])] : []];
	return [finding("aesthetic.harmony", "Aesthetic advisory", p, "advisory", false, s.rationale, s.location, { score: s.score }, ["Review with a human designer; do not block delivery solely on this score."])];
}
function finding(ruleId, standard, p, severity, blocking, message, location, measurements, repairSuggestions) {
	return {
		id: `${ruleId}:${location.entityId}:${location.path}`,
		ruleId,
		standard,
		policyVersion: p.version,
		severity: p.severity[ruleId] ?? severity,
		blocking: severity === "advisory" ? false : blocking,
		applicability: `Measured at ${location.entityId}${location.path}.`,
		message,
		measurements,
		locations: [location],
		evidence: Object.entries(measurements).map(([kind, value]) => ({
			kind,
			value: String(value)
		})),
		repairSuggestions
	};
}
function dedupe(values) {
	return [...new Map(values.map((v) => [v.id, v])).values()];
}
//#endregion
//#region src/headless/governance.ts
function runHeadlessGovernance(input, policy, mode) {
	const report = runDesignGovernance(input, policy);
	const base = {
		protocol: "cutout.governance-harness.v1",
		mode,
		documentId: report.documentId,
		revisionId: report.revisionId,
		reportId: report.id,
		summary: report.summary,
		measurements: report.measurements
	};
	if (mode === "preview") return {
		...base,
		ruleIds: [...new Set(report.findings.map((finding) => finding.ruleId))].sort()
	};
	if (mode === "validate") return {
		...base,
		findings: report.findings.map(({ evidence: _evidence, repairSuggestions: _repairs, ...finding }) => finding)
	};
	return {
		...base,
		report
	};
}
//#endregion
//#region src/headless/index.ts
var headless_exports = /* @__PURE__ */ __exportAll({
	ARTIFACT_INDEX_VERSION: () => ARTIFACT_INDEX_VERSION,
	HEADLESS_MANIFEST_VERSION: () => HEADLESS_MANIFEST_VERSION,
	HEADLESS_POLICY_VERSION: () => HEADLESS_POLICY_VERSION,
	artifactIndexSchema: () => artifactIndexSchema,
	artifactRecordSchema: () => artifactRecordSchema,
	brandKitExportId: () => brandKitExportId,
	controlLedgerSchema: () => controlLedgerSchema,
	createHeadlessRuntime: () => createHeadlessRuntime,
	createInMemoryRuntimeStore: () => createInMemoryRuntimeStore,
	createNodeFsRuntimeStore: () => createNodeFsRuntimeStore,
	createNodeToolDurabilityStore: () => createNodeToolDurabilityStore,
	headlessManifestSchema: () => headlessManifestSchema,
	headlessPolicySchema: () => headlessPolicySchema,
	headlessProjectStateSchema: () => headlessProjectStateSchema,
	ledgerFromState: () => ledgerFromState,
	runHeadlessGovernance: () => runHeadlessGovernance,
	runtimeFilesSchema: () => runtimeFilesSchema,
	starterExportId: () => starterExportId,
	starterPlanFingerprint: () => starterPlanFingerprint,
	validateArtifactIndex: () => validateArtifactIndex
});
//#endregion
//#region src/registry/contracts.ts
var REGISTRY_ITEM_VERSION = "cutout.registry-item.v1";
var identifierSchema = string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._-]*$/);
var sha256Schema = string().regex(/^[a-f0-9]{64}$/);
var safePathSchema = string().min(1).max(512).refine((path) => {
	if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
	return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "Registry paths must be normalized relative paths without traversal.");
function uniqueBy(values, key) {
	return new Set(values.map(key)).size === values.length;
}
var RegistryItemKindSchema = _enum([
	"component",
	"pattern",
	"template",
	"starter",
	"skill",
	"integration-adapter"
]);
var RegistryFileSchema = object({
	path: safePathSchema,
	mediaType: string().min(1).max(160),
	size: number().int().nonnegative(),
	sha256: sha256Schema,
	role: _enum([
		"source",
		"asset",
		"contract",
		"documentation",
		"configuration",
		"test"
	]),
	executable: boolean().optional()
}).strict();
var RegistryDependencySchema = object({
	id: identifierSchema,
	version: string().min(1).max(80),
	kind: RegistryItemKindSchema.optional(),
	optional: boolean().default(false)
}).strict();
var RegistryFrameworkSchema = object({
	id: identifierSchema,
	version: string().min(1).max(80).optional(),
	role: _enum([
		"runtime",
		"peer",
		"development",
		"target"
	])
}).strict();
var RegistryProvenanceSchema = object({
	id: identifierSchema,
	source: _enum([
		"bundled",
		"local",
		"integration",
		"generated",
		"imported"
	]),
	sourceUri: string().url().optional(),
	capturedAt: string().datetime(),
	actor: _enum([
		"user",
		"agent",
		"system",
		"external"
	]),
	contentSha256: sha256Schema.optional()
}).strict();
var RegistryLicenseSchema = discriminatedUnion("kind", [
	object({
		kind: literal("spdx"),
		identifier: string().min(1),
		holder: string().min(1).optional()
	}).strict(),
	object({
		kind: literal("proprietary"),
		holder: string().min(1),
		rationale: string().min(1).optional()
	}).strict(),
	object({
		kind: literal("public-domain"),
		rationale: string().min(1).optional()
	}).strict(),
	object({
		kind: literal("unknown"),
		rationale: string().min(1)
	}).strict()
]);
var RegistryQualityReceiptSchema = object({
	gate: _enum([
		"schema",
		"typecheck",
		"lint",
		"unit-test",
		"integration-test",
		"build",
		"accessibility",
		"visual-regression",
		"responsive",
		"package-consumer",
		"provenance",
		"license",
		"security"
	]),
	status: _enum([
		"passed",
		"failed",
		"skipped"
	]),
	checkedAt: string().datetime(),
	tool: string().min(1).max(160).optional(),
	evidence: array(object({
		sha256: sha256Schema,
		path: safePathSchema.optional(),
		mediaType: string().min(1).optional()
	}).strict()).default([]),
	summary: string().min(1).max(1e3).optional()
}).strict();
var RegistryPreviewAssetSchema = object({
	path: safePathSchema,
	mediaType: string().regex(/^(image|video)\//),
	sha256: sha256Schema,
	width: number().int().positive().optional(),
	height: number().int().positive().optional(),
	alt: string().min(1).max(500)
}).strict();
var RegistryItemSchema = object({
	schemaVersion: literal(REGISTRY_ITEM_VERSION),
	id: identifierSchema,
	version: string().min(1).max(80),
	kind: RegistryItemKindSchema,
	metadata: object({
		name: string().min(1).max(160),
		description: string().min(1).max(2e3),
		tags: array(identifierSchema).max(40).default([]),
		homepage: string().url().optional(),
		deprecated: boolean().optional()
	}).strict(),
	files: array(RegistryFileSchema).min(1).max(2e3),
	designIrRefs: array(string().min(1).max(240)).max(1e3).default([]),
	tokenRefs: array(string().min(1).max(240)).max(5e3).default([]),
	dependencies: array(RegistryDependencySchema).max(500).default([]),
	frameworks: array(RegistryFrameworkSchema).max(100).default([]),
	provenance: array(RegistryProvenanceSchema).min(1).max(100),
	license: RegistryLicenseSchema,
	qualityReceipts: array(RegistryQualityReceiptSchema).max(100).default([]),
	previewAssets: array(RegistryPreviewAssetSchema).max(100).default([])
}).strict().superRefine((item, context) => {
	if (!uniqueBy(item.files, (file) => file.path)) context.addIssue({
		code: "custom",
		path: ["files"],
		message: "Registry file paths must be unique."
	});
	if (!uniqueBy(item.dependencies, (dependency) => dependency.id)) context.addIssue({
		code: "custom",
		path: ["dependencies"],
		message: "Registry dependencies must be unique."
	});
	if (!uniqueBy(item.frameworks, (framework) => `${framework.id}:${framework.role}`)) context.addIssue({
		code: "custom",
		path: ["frameworks"],
		message: "Registry framework roles must be unique."
	});
	if (!uniqueBy(item.previewAssets, (asset) => asset.path)) context.addIssue({
		code: "custom",
		path: ["previewAssets"],
		message: "Registry preview paths must be unique."
	});
});
//#endregion
//#region src/registry/installer.ts
var RegistryOpenCodeInstaller = class {
	#plans = /* @__PURE__ */ new Map();
	#receipts = /* @__PURE__ */ new Map();
	host;
	now;
	constructor(host, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
		this.host = host;
		this.now = now;
	}
	async plan(input, targetFramework) {
		const { item } = input;
		if (!item.frameworks.some((entry) => entry.id === targetFramework && entry.role === "target")) throw new Error(`Registry item does not support ${targetFramework}.`);
		const bytesByPath = new Map(input.files.map((file) => [file.path, file.bytes]));
		const origin = (await this.host.readLedger()).items.find((entry) => entry.itemId === item.id);
		const baseByPath = new Map(origin?.files.map((file) => [file.path, file.baseHash]));
		const files = [];
		for (const file of item.files) {
			const path = safeTargetPath(file.path);
			const bytes = bytesByPath.get(file.path);
			if (!bytes || bytes.byteLength !== file.size) throw new Error(`Registry file bytes are missing or have the wrong size: ${path}.`);
			const declared = normalizeHash(file.sha256);
			const afterHash = await sha256(bytes);
			if (afterHash !== declared) throw new Error(`Registry file hash mismatch: ${path}.`);
			const current = await this.host.read(path);
			const beforeHash = current ? await sha256(current) : void 0;
			const baseHash = baseByPath.get(path);
			const status = !beforeHash ? "create" : beforeHash === afterHash ? "unchanged" : baseHash && beforeHash === baseHash ? "update" : "three-way-conflict";
			files.push({
				path,
				status,
				...beforeHash ? { beforeHash } : {},
				...baseHash ? { baseHash } : {},
				afterHash
			});
		}
		const conflicts = files.filter((file) => file.status === "three-way-conflict").map((file) => file.path);
		const plan = {
			protocol: "cutout.registry-install-plan.v1",
			id: `install:${await sha256(new TextEncoder().encode(JSON.stringify({
				item: item.id,
				version: item.version,
				targetFramework,
				files
			})))}`,
			itemId: item.id,
			itemVersion: item.version,
			targetFramework,
			files,
			conflicts,
			requiresApproval: true
		};
		this.#plans.set(plan.id, {
			plan,
			input
		});
		return plan;
	}
	async apply(planId, approvalId) {
		if (!approvalId.trim() || approvalId.length > 160) throw new Error("An opaque approval id is required.");
		const previous = this.#receipts.get(planId);
		if (previous) return previous;
		const prepared = this.#plans.get(planId);
		if (!prepared) throw new Error("Install plan is missing or expired.");
		if (prepared.plan.conflicts.length) throw new Error(`Install has unresolved three-way conflicts: ${prepared.plan.conflicts.join(", ")}.`);
		const checked = await this.plan(prepared.input, prepared.plan.targetFramework);
		if (!sameDiff(prepared.plan.files, checked.files)) throw new Error("Install target changed after preview; create and approve a new plan.");
		const bytesByPath = new Map(prepared.input.files.map((file) => [file.path, file.bytes]));
		const writable = prepared.input.item.files.filter((file) => prepared.plan.files.find((diff) => diff.path === file.path)?.status !== "unchanged").map((file) => ({
			path: safeTargetPath(file.path),
			bytes: bytesByPath.get(file.path)
		}));
		if (writable.length) await this.host.writeTransaction(writable);
		const fileHashes = prepared.plan.files.map((file) => ({
			path: file.path,
			baseHash: file.afterHash
		}));
		const ledger = await this.host.readLedger();
		await this.host.writeLedger({
			version: "cutout.registry-installed.v1",
			items: [...ledger.items.filter((entry) => entry.itemId !== prepared.input.item.id), {
				itemId: prepared.input.item.id,
				version: prepared.input.item.version,
				installedAt: this.now(),
				files: fileHashes
			}]
		});
		const receipt = {
			protocol: "cutout.registry-install-receipt.v1",
			planId,
			itemId: prepared.input.item.id,
			itemVersion: prepared.input.item.version,
			status: writable.length ? "succeeded" : "no-op",
			fileHashes,
			approvalId,
			completedAt: this.now()
		};
		this.#receipts.set(planId, receipt);
		return receipt;
	}
	receipt(planId) {
		return this.#receipts.get(planId);
	}
};
function safeTargetPath(input) {
	const path = input.replaceAll("\\", "/");
	if (!path || path.startsWith("/") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Registry files require safe project-relative paths.");
	if (path === ".cutout" || path.startsWith(".cutout/")) throw new Error("Registry items cannot write Cutout control state.");
	return path;
}
function normalizeHash(value) {
	const hash = value.toLowerCase().replace(/^sha256:/, "");
	if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Registry file requires a SHA-256 digest.");
	return hash;
}
async function sha256(bytes) {
	const copied = Uint8Array.from(bytes);
	const digest = await crypto.subtle.digest("SHA-256", copied.buffer);
	return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function sameDiff(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}
//#endregion
//#region src/registry/node-host.ts
var LEDGER = ".cutout/registry/installed.json";
function createNodeRegistryInstallHost(projectRoot) {
	const root = resolve(projectRoot);
	return {
		async read(path) {
			const target = await controlled(root, path, false);
			try {
				return new Uint8Array(await readFile(target));
			} catch (error) {
				if (error.code === "ENOENT") return void 0;
				throw error;
			}
		},
		async writeTransaction(files) {
			const staging = resolve(root, ".cutout", "registry", `.staging-${randomUUID()}`);
			await mkdir(staging, { recursive: true });
			try {
				for (const file of files) {
					const target = await controlled(root, file.path, true);
					const staged = resolve(staging, file.path);
					await mkdir(dirname(staged), { recursive: true });
					await writeFile(staged, file.bytes);
					await mkdir(dirname(target), { recursive: true });
					const temporary = `${target}.cutout-${randomUUID()}`;
					await writeFile(temporary, await readFile(staged), { flag: "wx" });
					await rename(temporary, target);
				}
			} finally {
				await rm(staging, {
					recursive: true,
					force: true
				});
			}
		},
		async readLedger() {
			try {
				return parseLedger(JSON.parse(await readFile(resolve(root, LEDGER), "utf8")));
			} catch (error) {
				if (error.code === "ENOENT") return {
					version: "cutout.registry-installed.v1",
					items: []
				};
				throw error;
			}
		},
		async writeLedger(ledger) {
			const target = resolve(root, LEDGER);
			await mkdir(dirname(target), { recursive: true });
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" });
			await rename(temporary, target);
		}
	};
}
async function controlled(root, relative, writing) {
	if (!relative || relative.startsWith("/") || relative.includes("\0") || relative.replaceAll("\\", "/").split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Registry target must be a safe relative path.");
	const target = resolve(root, relative);
	if (!target.startsWith(`${root}${sep}`) || target.startsWith(resolve(root, ".cutout") + sep)) throw new Error("Registry target escapes the controlled source root.");
	let cursor = writing ? dirname(target) : target;
	while (cursor.startsWith(root) && cursor !== root) {
		try {
			if ((await lstat(cursor)).isSymbolicLink()) throw new Error("Registry target traverses a symbolic link.");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		cursor = dirname(cursor);
	}
	const actualRoot = await realpath(root);
	return actualRoot === root ? target : resolve(actualRoot, relative);
}
function parseLedger(value) {
	if (!value || typeof value !== "object" || value.version !== "cutout.registry-installed.v1" || !Array.isArray(value.items)) throw new Error("Invalid registry installed-origin ledger.");
	return value;
}
//#endregion
//#region src/registry/node-service.ts
function createNodeRegistryService(projectRoot) {
	const root = resolve(projectRoot);
	const catalog = resolve(root, ".cutout", "registry", "items");
	const receipts = resolve(root, ".cutout", "registry", "receipts");
	return {
		async currentRevision() {
			return (await createNodeFsRuntimeStore(root).load()).ledger?.revision ?? 0;
		},
		async publishBundled(input) {
			const item = RegistryItemSchema.parse(input.item);
			const bytes = new Map(input.files.map((file) => [file.path, file.bytes]));
			for (const file of item.files) if (!bytes.has(file.path)) throw new Error(`Bundled registry file is missing: ${file.path}.`);
			await mkdir(catalog, { recursive: true });
			const base = resolve(catalog, `${safeName(`${item.id}@${item.version}`)}.files`);
			for (const file of item.files) {
				const target = resolve(base, file.path);
				await mkdir(dirnameSafe(target), { recursive: true });
				await writeFile(target, bytes.get(file.path), { flag: "wx" }).catch(async (error) => {
					if (error.code !== "EEXIST") throw error;
					if (!equalBytes(new Uint8Array(await readFile(target)), bytes.get(file.path))) throw new Error(`Bundled registry file conflicts: ${file.path}.`);
				});
			}
			const manifest = resolve(catalog, `${safeName(`${item.id}@${item.version}`)}.json`);
			await writeFile(manifest, `${JSON.stringify(item, null, 2)}\n`, { flag: "wx" }).catch(async (error) => {
				if (error.code !== "EEXIST") throw error;
				const existing = RegistryItemSchema.parse(JSON.parse(await readFile(manifest, "utf8")));
				if (JSON.stringify(existing) !== JSON.stringify(item)) throw new Error(`Bundled registry item conflicts: ${item.id}.`);
			});
			return summary(item);
		},
		async list(query = {}) {
			return filter(await readCatalog(catalog), query).map(summary);
		},
		async get(id, version) {
			return select(await readCatalog(catalog), id, version);
		},
		async planInstall(id, framework, version) {
			const item = select(await readCatalog(catalog), id, version);
			const files = await readItemFiles(catalog, item);
			return new RegistryOpenCodeInstaller(createNodeRegistryInstallHost(root)).plan({
				item,
				files
			}, framework);
		},
		async applyInstall(id, framework, planId, approvalId, version) {
			const item = select(await readCatalog(catalog), id, version);
			const files = await readItemFiles(catalog, item);
			const installer = new RegistryOpenCodeInstaller(createNodeRegistryInstallHost(root));
			const plan = await installer.plan({
				item,
				files
			}, framework);
			if (plan.id !== planId) throw new Error("Registry install plan changed; preview and approve a new plan.");
			const receipt = await installer.apply(plan.id, approvalId);
			await mkdir(receipts, { recursive: true });
			await writeFile(resolve(receipts, `${safeName(plan.id)}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" }).catch(async (error) => {
				if (error.code !== "EEXIST") throw error;
			});
			return receipt;
		},
		async receipt(planId) {
			try {
				return JSON.parse(await readFile(resolve(receipts, `${safeName(planId)}.json`), "utf8"));
			} catch (error) {
				if (error.code === "ENOENT") return void 0;
				throw error;
			}
		}
	};
}
async function readCatalog(directory) {
	let names;
	try {
		names = await readdir(directory);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	if (names.length > 2e3) throw new Error("Registry catalog exceeds the safe item limit.");
	const items = [];
	for (const name of names.sort()) {
		if (!/^[a-z0-9._-]+\.json$/.test(name)) continue;
		const parsed = RegistryItemSchema.safeParse(JSON.parse(await readFile(resolve(directory, name), "utf8")));
		if (!parsed.success) throw new Error(`Invalid registry item ${name}: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
		items.push(parsed.data);
	}
	return items;
}
async function readItemFiles(catalog, item) {
	const base = resolve(catalog, `${safeName(`${item.id}@${item.version}`)}.files`);
	return Promise.all(item.files.map(async (file) => ({
		path: file.path,
		bytes: new Uint8Array(await readFile(resolve(base, file.path)))
	})));
}
function filter(items, query) {
	const text = query.query?.trim().toLowerCase();
	return items.filter((item) => (!query.kind || item.kind === query.kind) && (!query.framework || item.frameworks.some((f) => f.id === query.framework && f.role === "target")) && (!text || `${item.id} ${item.metadata.name} ${item.metadata.description} ${item.metadata.tags.join(" ")}`.toLowerCase().includes(text)));
}
function select(items, id, version) {
	const matches = items.filter((item) => item.id === id && (!version || item.version === version));
	if (!matches.length) throw new Error(`Registry item not found: ${id}${version ? `@${version}` : ""}.`);
	return matches.sort((a, b) => b.version.localeCompare(a.version))[0];
}
function summary(item) {
	return {
		id: item.id,
		version: item.version,
		kind: item.kind,
		name: item.metadata.name,
		description: item.metadata.description,
		tags: item.metadata.tags,
		frameworks: item.frameworks.filter((f) => f.role === "target").map((f) => f.id),
		license: item.license,
		quality: item.qualityReceipts.map((r) => ({
			gate: r.gate,
			status: r.status
		}))
	};
}
function safeName(value) {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function dirnameSafe(path) {
	return path.slice(0, path.lastIndexOf("/"));
}
function equalBytes(a, b) {
	return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
}
//#endregion
//#region scripts/cutout-external-control.mjs
var defaultRoot = resolve(import.meta.dirname, "..");
function createExternalControl(root = defaultRoot) {
	const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
	return {
		async discoveryHandshake(projectRoot, client = {}) {
			const [capabilities, skills] = await Promise.all([readJson("cutout.agent-capabilities.json"), readJson("skills/index.json")]);
			return {
				protocol: "cutout.external-controller.v1",
				controller: {
					kind: "external-coding-agent",
					clientName: clean(client.name, "unknown-client"),
					clientVersion: clean(client.version, "unknown"),
					sessionId: randomUUID()
				},
				binding: {
					kind: "local-project",
					id: createHash("sha256").update(resolve(projectRoot)).digest("hex").slice(0, 24),
					rootOwnedByHost: true
				},
				product: capabilities.product,
				controlProtocol: capabilities.protocol.control,
				defaultMode: capabilities.policy.defaultMode,
				workflows: [
					"discover",
					"bind",
					"submit-outcome",
					"reference-materials",
					"preview",
					"approve",
					"apply",
					"observe",
					"cancel",
					"read-deliverables"
				],
				skills: {
					catalogVersion: skills.version,
					count: skills.skills.length,
					listTool: "cutout_skills_list",
					readTool: "cutout_skill_read"
				},
				boundaries: {
					controllerOwnsCodingSandbox: true,
					cutoutOwnsProjectState: true,
					approvalIdsAreUserGranted: true,
					integrationsAreSeparate: true,
					arbitraryPaths: false,
					credentialsInRequests: false
				}
			};
		},
		async listSkills() {
			const catalog = await readJson("skills/index.json");
			return {
				version: catalog.version,
				skills: catalog.skills.map(({ id, status, operations, mcpTools }) => ({
					id,
					status,
					operations,
					mcpTools
				}))
			};
		},
		async readSkill(skillId, section = "workflow") {
			if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillId)) throw new Error("Invalid skill id.");
			const skill = (await readJson("skills/index.json")).skills.find(({ id }) => id === skillId);
			if (!skill) return {
				ok: false,
				error: {
					code: "capability-required",
					message: `Unknown Cutout skill: ${skillId}`
				}
			};
			const path = section === "reference" ? skill.reference : `${skill.path}/SKILL.md`;
			return {
				ok: true,
				skill: {
					id: skill.id,
					status: skill.status,
					section,
					content: await readFile(resolve(root, path), "utf8")
				}
			};
		},
		async capabilityStatus() {
			const manifest = await readJson("cutout.agent-capabilities.json");
			return {
				version: manifest.version,
				externalControllers: manifest.externalControllers,
				integrations: manifest.integrations,
				operations: manifest.operations,
				limitations: manifest.limitations
			};
		}
	};
}
var { capabilityStatus: capabilityStatus$1, discoveryHandshake: discoveryHandshake$1, listSkills: listSkills$1, readSkill: readSkill$1 } = createExternalControl();
function clean(value, fallback) {
	if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/.test(value)) return fallback;
	if (/(?:\bBearer\s+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|secret|credential|api[-_ ]?key|password|token)/i.test(value)) return fallback;
	return value;
}
//#endregion
//#region scripts/cutout-approval-leases.mjs
var PROTOCOL$1 = "cutout.approval-lease.v1";
var FILE = "approval-leases.json";
var KEY_FILE = join(homedir(), ".cutout", "approval-lease.key");
async function reserveApprovalLease(projectRoot, leaseId, operation, expectedRevision, now = Date.now(), key) {
	if (typeof leaseId !== "string" || !leaseId.trim()) throw new Error("A host-issued approval lease id is required.");
	const hostKey = await approvalKey(key);
	const catalog = await load(projectRoot, hostKey);
	const index = catalog.leases.findIndex((entry) => entry.leaseId === leaseId);
	if (index < 0) throw new Error("Approval lease was not issued by this Cutout host.");
	const lease = catalog.leases[index];
	validateLease(lease);
	if (lease.state !== "issued") throw new Error("Approval lease has already been consumed or reserved.");
	if (now >= lease.expiresAt) throw new Error("Approval lease has expired.");
	if (lease.expectedRevision !== expectedRevision) throw new Error("Approval lease is bound to a different project revision.");
	if (lease.requestDigest !== requestDigest(operation, expectedRevision)) throw new Error("Approval lease is bound to a different request.");
	const reservationId = randomUUID();
	const reserved = signLeaseRecord({
		...lease,
		state: "reserved",
		reservationId,
		reservedAt: now
	}, hostKey);
	const leases = catalog.leases.slice();
	leases[index] = reserved;
	await save(projectRoot, {
		protocol: PROTOCOL$1,
		leases
	});
	return {
		reservationId,
		approval: {
			id: lease.approvalId,
			grantedAt: lease.issuedAt
		}
	};
}
async function completeApprovalLease(projectRoot, leaseId, reservationId, response, now = Date.now(), key) {
	const hostKey = await approvalKey(key);
	const catalog = await load(projectRoot, hostKey);
	const index = catalog.leases.findIndex((entry) => entry.leaseId === leaseId);
	if (index < 0) throw new Error("Approval lease reservation was not found.");
	const lease = catalog.leases[index];
	if (lease.state !== "reserved" || lease.reservationId !== reservationId) throw new Error("Approval lease reservation does not match.");
	const leases = catalog.leases.slice();
	leases[index] = signLeaseRecord({
		...lease,
		state: "consumed",
		consumedAt: now,
		response: {
			requestId: response.requestId,
			status: response.status,
			revision: response.revision
		}
	}, hostKey);
	await save(projectRoot, {
		protocol: PROTOCOL$1,
		leases
	});
}
function requestDigest(operation, expectedRevision) {
	return createHash("sha256").update(canonical({
		expectedRevision,
		operation
	})).digest("hex");
}
async function load(projectRoot, suppliedKey) {
	try {
		const parsed = JSON.parse(await readFile(resolve(projectRoot, ".cutout", FILE), "utf8"));
		if (parsed?.protocol !== PROTOCOL$1 || !Array.isArray(parsed.leases)) throw new Error("Invalid approval lease catalog.");
		const key = await approvalKey(suppliedKey);
		parsed.leases.forEach((lease) => {
			validateLease(lease);
			verifyLease(lease, key);
		});
		return parsed;
	} catch (error) {
		if (error?.code === "ENOENT") return {
			protocol: PROTOCOL$1,
			leases: []
		};
		throw error;
	}
}
async function save(projectRoot, catalog) {
	const path = resolve(projectRoot, ".cutout", FILE);
	const temporary = `${path}.tmp-${randomUUID()}`;
	await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384,
		flag: "wx"
	});
	await rename(temporary, path);
}
function validateLease(lease) {
	if (!lease || lease.protocol !== PROTOCOL$1) throw new Error("Invalid approval lease protocol.");
	for (const field of [
		"leaseId",
		"approvalId",
		"subject",
		"requestDigest"
	]) if (typeof lease[field] !== "string" || !lease[field].trim()) throw new Error(`Invalid approval lease ${field}.`);
	if (!Number.isInteger(lease.expectedRevision) || lease.expectedRevision < 0) throw new Error("Invalid approval lease revision.");
	if (!Number.isInteger(lease.issuedAt) || !Number.isInteger(lease.expiresAt) || lease.expiresAt <= lease.issuedAt) throw new Error("Invalid approval lease lifetime.");
	if (![
		"issued",
		"reserved",
		"consumed"
	].includes(lease.state)) throw new Error("Invalid approval lease state.");
	if (typeof lease.signature !== "string" || !/^[a-f0-9]{64}$/.test(lease.signature)) throw new Error("Invalid approval lease signature.");
}
function signedLeaseFields(lease) {
	return {
		protocol: lease.protocol,
		leaseId: lease.leaseId,
		approvalId: lease.approvalId,
		subject: lease.subject,
		requestDigest: lease.requestDigest,
		expectedRevision: lease.expectedRevision,
		issuedAt: lease.issuedAt,
		expiresAt: lease.expiresAt,
		state: lease.state,
		reservationId: lease.reservationId ?? null,
		reservedAt: lease.reservedAt ?? null,
		consumedAt: lease.consumedAt ?? null,
		response: lease.response ?? null
	};
}
function signLease(lease, key) {
	return createHmac("sha256", key).update(canonical(signedLeaseFields(lease))).digest("hex");
}
function signLeaseRecord(lease, key) {
	const { signature: _discarded, ...record } = lease;
	return {
		...record,
		signature: signLease(record, key)
	};
}
function verifyLease(lease, key) {
	const actual = Buffer.from(lease.signature, "hex");
	const expected = Buffer.from(signLease(lease, key), "hex");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Approval lease signature is invalid.");
}
async function approvalKey(supplied) {
	if (supplied) {
		const key = Buffer.from(supplied);
		if (key.length < 32) throw new Error("Approval lease host key must contain at least 32 bytes.");
		return key;
	}
	const encoded = process.env.CUTOUT_APPROVAL_LEASE_KEY;
	if (encoded) {
		const key = Buffer.from(encoded, "base64");
		if (key.length < 32) throw new Error("CUTOUT_APPROVAL_LEASE_KEY must decode to at least 32 bytes.");
		return key;
	}
	await mkdir(resolve(KEY_FILE, ".."), {
		recursive: true,
		mode: 448
	});
	try {
		await writeFile(KEY_FILE, randomBytes(32), {
			mode: 384,
			flag: "wx"
		});
	} catch (error) {
		if (error?.code !== "EEXIST") throw error;
	}
	const noFollow = constants.O_NOFOLLOW ?? 0;
	const handle = await open(KEY_FILE, constants.O_RDONLY | noFollow);
	try {
		const stat = await handle.stat();
		if (!stat.isFile()) throw new Error("Approval lease host key must be a regular file.");
		if (process.platform !== "win32" && (stat.mode & 63) !== 0) throw new Error("Approval lease host key permissions must be owner-only.");
		const key = await handle.readFile();
		if (key.length < 32) throw new Error("Approval lease host key is invalid.");
		return key;
	} finally {
		await handle.close();
	}
}
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
//#endregion
//#region scripts/cutout-headless-adapter.mjs
var PROTOCOL = "cutout.control.v1";
var SAFE_OPERATIONS = /* @__PURE__ */ new Set([
	"project.context",
	"material.list",
	"validate",
	"design.patch",
	"tokens.patch",
	"source.ingest",
	"run.start",
	"run.get",
	"run.events",
	"run.cancel",
	"export.design-kit",
	"export.brand-kit",
	"export.starter",
	"coding.execute",
	"coding.review",
	"coding.repair"
]);
var APPROVAL_LEASE_OPERATIONS = /* @__PURE__ */ new Set([
	"source.ingest",
	"export.design-kit",
	"export.brand-kit",
	"export.starter",
	"coding.execute",
	"coding.review",
	"coding.repair"
]);
function createHeadlessAdapter(loadRuntime) {
	return {
		async executeControl(projectRoot, operation, { mode = "apply", requestId = randomUUID(), approvalLeaseId } = {}) {
			if (!SAFE_OPERATIONS.has(operation?.type)) return unsupported(`Operation "${String(operation?.type ?? "unknown")}"`);
			try {
				return await withProjectControlLock(projectRoot, async () => {
					const runtime = await loadRuntime();
					const store = runtime.createNodeFsRuntimeStore(resolve(projectRoot));
					const expectedRevision = (await store.load()).ledger?.revision ?? 0;
					const reservation = mode === "apply" && APPROVAL_LEASE_OPERATIONS.has(operation.type) ? await reserveApprovalLease(projectRoot, approvalLeaseId, operation, expectedRevision) : void 0;
					const response = await runtime.createHeadlessRuntime(store).execute({
						protocol: PROTOCOL,
						requestId,
						expectedRevision,
						mode,
						operation
					}, reservation ? { approval: reservation.approval } : void 0);
					if (reservation) await completeApprovalLease(projectRoot, approvalLeaseId, reservation.reservationId, response);
					return {
						ok: response.status === "ok",
						response
					};
				});
			} catch (error) {
				return adapterError("runtime-unavailable", sanitizeMessage(error instanceof Error ? error.message : "The headless runtime could not load the project state."));
			}
		},
		async executeGovernance(projectRoot, input, policy, mode = "validate") {
			if (![
				"preview",
				"validate",
				"report"
			].includes(mode)) return adapterError("invalid-governance-mode", "Governance mode must be preview, validate, or report.");
			try {
				const runtime = await loadRuntime();
				const state = await runtime.createNodeFsRuntimeStore(resolve(projectRoot)).load();
				if (!input || typeof input !== "object" || Array.isArray(input) || !policy || typeof policy !== "object" || Array.isArray(policy)) return adapterError("invalid-governance-input", "Governance input and policy must be structured objects.");
				if (input.documentId !== state.design.meta.id || input.revisionId !== state.design.revision.id) return adapterError("stale-governance-input", "Governance evidence must match the bound Design IR document and revision.");
				return {
					ok: true,
					response: await runtime.runHeadlessGovernance(input, policy, mode)
				};
			} catch (error) {
				return adapterError("governance-invalid", sanitizeMessage(error instanceof Error ? error.message : "The governance harness rejected the evidence."));
			}
		}
	};
}
function adapterError(code, message) {
	return {
		ok: false,
		error: {
			code,
			message
		}
	};
}
function unsupported(operation) {
	return adapterError("unsupported-operation", `${operation} is not available in the headless v1 runtime. It has not performed any file, network, provider, or paid action.`);
}
async function withProjectControlLock(projectRoot, action) {
	const lock = resolve(projectRoot, ".cutout", ".external-control.lock");
	const deadline = Date.now() + 1e4;
	while (true) try {
		await mkdir(lock);
		break;
	} catch (error) {
		if (error?.code !== "EEXIST") throw error;
		const info = await stat(lock).catch(() => null);
		if (info && Date.now() - info.mtimeMs > 3e4) await rmdir(lock).catch(() => void 0);
		if (Date.now() >= deadline) throw new Error("Cutout project is busy; retry the control operation.");
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
	}
	try {
		return await action();
	} finally {
		await rmdir(lock).catch(() => void 0);
	}
}
function sanitizeMessage(message) {
	return message.replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, "<local-path>").replace(/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+)/gi, "<redacted>").slice(0, 1200);
}
//#endregion
//#region scripts/cutout-mcp-server.mjs
var SERVER_INFO;
var PROJECT_ROOT;
var closeHeadlessRuntime;
var executeControl;
var executeGovernance;
var capabilityStatus;
var discoveryHandshake;
var listSkills;
var readSkill;
var closeRegistryRuntime;
var registryApplyInstall;
var registryGet;
var registryList;
var registryPlanInstall;
var registryReceipt;
var workflowCompatibility$1;
var workflowGet$1;
var workflowList$1;
var MCP_TOOLS = [
	{
		name: "cutout_controller_handshake",
		description: "Discover Cutout and bind this MCP process to its host-owned project. The calling Coding Agent remains external and owns its coding sandbox.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				clientName: {
					type: "string",
					maxLength: 80
				},
				clientVersion: {
					type: "string",
					maxLength: 80
				}
			}
		}
	},
	{
		name: "cutout_capabilities_status",
		description: "Read authoritative controller, operation, integration, approval, and limitation status.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {}
		}
	},
	{
		name: "cutout_skills_list",
		description: "List Cutout product Skills using progressive disclosure.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {}
		}
	},
	{
		name: "cutout_skill_read",
		description: "Read one selected Cutout Skill workflow or deeper reference contract.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["skillId"],
			properties: {
				skillId: {
					type: "string",
					pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
				},
				section: {
					type: "string",
					enum: ["workflow", "reference"]
				}
			}
		}
	},
	{
		name: "cutout_outcome_submit",
		description: "Submit a user outcome to a durable Cutout run. Attachments are existing material/source ids, never bytes or host paths.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["runId", "intent"],
			properties: {
				runId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				mode: {
					type: "string",
					enum: ["create", "repair"]
				},
				intent: {
					type: "string",
					minLength: 1,
					maxLength: 2e4
				},
				materialRefs: {
					type: "array",
					maxItems: 100,
					items: {
						type: "string",
						minLength: 1,
						maxLength: 160
					}
				},
				sourceRefs: {
					type: "array",
					maxItems: 100,
					items: {
						type: "string",
						minLength: 1,
						maxLength: 160
					}
				}
			}
		}
	},
	{
		name: "cutout_deliverables_read",
		description: "Read verified deliverable metadata and hashes without binary payloads or arbitrary files.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				kind: {
					type: "string",
					enum: [
						"design-system",
						"prototype-page",
						"cutout-slice",
						"design-markdown"
					]
				},
				pageId: {
					type: "string",
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_run_start",
		description: "Start and durably persist a provider-free Cutout run lifecycle. This records intent and observable events but does not execute a model or paid tool.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: [
				"runId",
				"mode",
				"intent"
			],
			properties: {
				runId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				mode: {
					type: "string",
					enum: ["create", "repair"]
				},
				intent: {
					type: "string",
					minLength: 1,
					maxLength: 2e4
				}
			}
		}
	},
	{
		name: "cutout_run_get",
		description: "Replay and return the authoritative projection for a durable Cutout run.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["runId"],
			properties: { runId: {
				type: "string",
				minLength: 1,
				maxLength: 160
			} }
		}
	},
	{
		name: "cutout_run_events",
		description: "Read observable run events with a stable event cursor. Hidden reasoning and credentials are never included.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["runId"],
			properties: {
				runId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				afterEventId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				limit: {
					type: "integer",
					minimum: 1,
					maximum: 1e3
				}
			}
		}
	},
	{
		name: "cutout_run_cancel",
		description: "Cooperatively cancel a running Cutout lifecycle and durably record the cancellation.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["runId"],
			properties: {
				runId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				reason: {
					type: "string",
					minLength: 1,
					maxLength: 1e3
				}
			}
		}
	},
	{
		name: "cutout_project_context",
		description: "Read the sanitized Cutout Design IR summary. This tool never reads arbitrary files, secrets, provider configuration, or the GUI store.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: { include: {
				type: "array",
				items: {
					type: "string",
					enum: [
						"summary",
						"outcome",
						"run-events"
					]
				},
				maxItems: 3
			} }
		}
	},
	{
		name: "cutout_list_materials",
		description: "List durable design materials and content-addressed artifact metadata without returning binary bytes.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				kind: {
					type: "string",
					enum: [
						"design-system",
						"prototype-page",
						"cutout-slice",
						"design-markdown"
					]
				},
				pageId: {
					type: "string",
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_validate",
		description: "Validate Design IR, tokens, material references, and the currently supported outcome checks.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: { scope: {
				type: "array",
				items: {
					type: "string",
					enum: [
						"design",
						"tokens",
						"materials",
						"outcome"
					]
				},
				minItems: 1,
				maxItems: 4
			} }
		}
	},
	{
		name: "cutout_governance_preview",
		description: "Preview deterministic Design Governance coverage and blocking counts for evidence bound to the current Design IR revision.",
		inputSchema: governanceInputSchema()
	},
	{
		name: "cutout_governance_validate",
		description: "Validate project-bound Design Governance evidence and return structured findings without verbose evidence payloads.",
		inputSchema: governanceInputSchema()
	},
	{
		name: "cutout_governance_report",
		description: "Return the full deterministic Design Governance report, measured evidence, and repair suggestions. This is read-only.",
		inputSchema: governanceInputSchema()
	},
	{
		name: "cutout_dry_run_patch",
		description: "Preview a safe Design IR markdown, project name, or existing token change. This never writes project state.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["operation"],
			properties: { operation: {
				type: "object",
				additionalProperties: false,
				required: ["type"],
				properties: {
					type: {
						type: "string",
						enum: ["design.patch", "tokens.patch"]
					},
					patches: {
						type: "array",
						maxItems: 100
					},
					changes: {
						type: "array",
						maxItems: 200
					}
				}
			} }
		}
	},
	{
		name: "cutout_plan_source_ingest",
		description: "Preview a controlled Everything Inbox import. Accepts only inline text, a credential-free HTTP(S) URL descriptor, or a relative file/repository scan below the configured project root. It never accepts bytes, absolute paths, commands, or secrets and never writes state.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["input"],
			properties: { input: {
				type: "object",
				additionalProperties: true,
				description: "A source.ingest descriptor: inline-text, url-descriptor, local-file-scan, or repository-scan. Include role and license. Scan paths must be relative to the Cutout project root."
			} }
		}
	},
	{
		name: "cutout_apply_source_ingest",
		description: "Apply a previously reviewed controlled source import after host-issued approval lease. The host resolves scans below its project root, records source/provenance, and never receives arbitrary file bytes or absolute paths.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["input", "approvalLeaseId"],
			properties: {
				input: {
					type: "object",
					additionalProperties: true
				},
				approvalLeaseId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_plan_design_kit_export",
		description: "Compile a complete, hash-addressed Design Kit file plan. This is dry-run only and never writes files.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {}
		}
	},
	{
		name: "cutout_export_design_kit",
		description: "Write the planned Design Kit only to .cutout/exports/design-kit after host-issued approval lease. No destination path is accepted.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["approvalLeaseId"],
			properties: { approvalLeaseId: {
				type: "string",
				minLength: 1,
				maxLength: 160
			} }
		}
	},
	{
		name: "cutout_plan_brand_kit_export",
		description: "Compile a Brand/VI Kit only from an explicit BrandKitInput whose DesignDocument exactly matches this project. This dry run never writes files or infers brand facts.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["input"],
			properties: { input: {
				type: "object",
				description: "Complete BrandKitInput: { document, brand }. The document must match the current project DesignDocument."
			} }
		}
	},
	{
		name: "cutout_export_brand_kit",
		description: "Write the planned Brand/VI Kit only to .cutout/exports/brand-kit after host-issued approval lease. It accepts no destination and rejects inferred or mismatched evidence.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["input", "approvalLeaseId"],
			properties: {
				input: {
					type: "object",
					description: "Complete BrandKitInput: { document, brand }."
				},
				approvalLeaseId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_plan_starter_export",
		description: "Compile a hash-addressed StarterPlan from verified Design IR. This dry run never writes files or runs package tools.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["framework"],
			properties: { framework: {
				type: "string",
				enum: [
					"next-app-router",
					"vite-react",
					"nuxt",
					"tanstack-start"
				]
			} }
		}
	},
	{
		name: "cutout_export_starter",
		description: "Write a hash-verified StarterPlan only to .cutout/exports/starter after host-issued approval lease. No destination or command is accepted.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["framework", "approvalLeaseId"],
			properties: {
				framework: {
					type: "string",
					enum: [
						"next-app-router",
						"vite-react",
						"nuxt",
						"tanstack-start"
					]
				},
				approvalLeaseId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_plan_coding_task",
		description: "Preview a versioned, path-scoped CodingTask through an injected controlled coding backend. The bundled provider-free host returns capability-required instead of simulating code generation.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["operation", "task"],
			properties: {
				operation: {
					type: "string",
					enum: [
						"coding.execute",
						"coding.review",
						"coding.repair"
					]
				},
				task: { type: "object" }
			}
		}
	},
	{
		name: "cutout_apply_coding_task",
		description: "Apply a reviewed CodingTask after host-issued approval lease. Only an injected controlled workspace/backend may write allowlisted paths or run named checks.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: [
				"operation",
				"task",
				"approvalLeaseId"
			],
			properties: {
				operation: {
					type: "string",
					enum: [
						"coding.execute",
						"coding.review",
						"coding.repair"
					]
				},
				task: { type: "object" },
				approvalLeaseId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_registry_list",
		description: "List verified project registry items without reading arbitrary paths or contacting the network.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				kind: {
					type: "string",
					enum: [
						"component",
						"pattern",
						"template",
						"starter",
						"skill",
						"integration-adapter"
					]
				},
				framework: {
					type: "string",
					maxLength: 80
				}
			}
		}
	},
	{
		name: "cutout_registry_search",
		description: "Search verified project registry metadata by text and exact filters.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["query"],
			properties: {
				query: {
					type: "string",
					minLength: 1,
					maxLength: 200
				},
				kind: {
					type: "string",
					enum: [
						"component",
						"pattern",
						"template",
						"starter",
						"skill",
						"integration-adapter"
					]
				},
				framework: {
					type: "string",
					maxLength: 80
				}
			}
		}
	},
	{
		name: "cutout_registry_get",
		description: "Read one verified registry item manifest; file bytes and credentials are not returned.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["itemId"],
			properties: {
				itemId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				version: {
					type: "string",
					maxLength: 80
				}
			}
		}
	},
	{
		name: "cutout_registry_plan_install",
		description: "Resolve and preview an open-code install diff, including three-way conflicts. This does not write.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["itemId", "framework"],
			properties: {
				itemId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				version: {
					type: "string",
					maxLength: 80
				},
				framework: {
					type: "string",
					minLength: 1,
					maxLength: 80
				}
			}
		}
	},
	{
		name: "cutout_registry_apply_install",
		description: "Re-resolve and apply a previewed conflict-free install after a host-issued approval lease bound to its plan and project revision.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: [
				"itemId",
				"framework",
				"planId",
				"approvalLeaseId"
			],
			properties: {
				itemId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				version: {
					type: "string",
					maxLength: 80
				},
				framework: {
					type: "string",
					minLength: 1,
					maxLength: 80
				},
				planId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				approvalLeaseId: {
					type: "string",
					minLength: 1,
					maxLength: 160
				}
			}
		}
	},
	{
		name: "cutout_registry_install_receipt",
		description: "Read a durable install receipt by its opaque plan id.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["planId"],
			properties: { planId: {
				type: "string",
				minLength: 1,
				maxLength: 160
			} }
		}
	},
	{
		name: "cutout_workflow_pack_list",
		description: "List repo-native workflow packs without network access.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {}
		}
	},
	{
		name: "cutout_workflow_pack_get",
		description: "Read one versioned repo-native workflow pack.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["id"],
			properties: {
				id: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				version: {
					type: "string",
					maxLength: 80
				}
			}
		}
	},
	{
		name: "cutout_workflow_pack_compatibility",
		description: "Check a workflow pack against Cutout version and supplied capabilities.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: [
				"id",
				"cutoutVersion",
				"capabilities"
			],
			properties: {
				id: {
					type: "string",
					minLength: 1,
					maxLength: 160
				},
				version: {
					type: "string",
					maxLength: 80
				},
				cutoutVersion: { type: "string" },
				capabilities: {
					type: "array",
					items: { type: "string" },
					maxItems: 200
				}
			}
		}
	}
];
async function handle(method, params) {
	switch (method) {
		case "initialize": return {
			protocolVersion: "2024-11-05",
			capabilities: { tools: {} },
			serverInfo: SERVER_INFO
		};
		case "notifications/initialized": return null;
		case "tools/list": return { tools: MCP_TOOLS };
		case "tools/call": return callTool(params);
		default: throw rpcError(-32601, `Unsupported MCP method: ${method}`);
	}
}
async function callTool(params) {
	if (!params || typeof params !== "object" || typeof params.name !== "string") throw rpcError(-32602, "tools/call requires a tool name.");
	const input = params.arguments ?? {};
	if (!input || typeof input !== "object" || Array.isArray(input)) throw rpcError(-32602, "Tool arguments must be an object.");
	if (!PROJECT_ROOT && ![
		"cutout_capabilities_status",
		"cutout_skills_list",
		"cutout_skill_read"
	].includes(params.name)) return toolResult({
		ok: false,
		error: {
			code: "project-binding-required",
			message: "Cutout local MCP requires a host-owned CUTOUT_PROJECT_ROOT. Configure it to the intended project before starting a new Codex session."
		}
	});
	let result;
	switch (params.name) {
		case "cutout_controller_handshake":
			result = {
				ok: true,
				response: await discoveryHandshake(PROJECT_ROOT, {
					name: input.clientName,
					version: input.clientVersion
				})
			};
			break;
		case "cutout_capabilities_status":
			result = {
				ok: true,
				response: await capabilityStatus()
			};
			break;
		case "cutout_skills_list":
			result = {
				ok: true,
				response: await listSkills()
			};
			break;
		case "cutout_skill_read":
			result = await readSkill(input.skillId, input.section ?? "workflow");
			break;
		case "cutout_outcome_submit": {
			const refs = [...(input.materialRefs ?? []).map((id) => `material:${id}`), ...(input.sourceRefs ?? []).map((id) => `source:${id}`)];
			const intent = refs.length ? `${input.intent}\n\nReferenced Cutout evidence: ${refs.join(", ")}` : input.intent;
			result = await executeControl(PROJECT_ROOT, {
				type: "run.start",
				runId: input.runId,
				mode: input.mode ?? "create",
				intent
			});
			break;
		}
		case "cutout_deliverables_read":
			result = await executeControl(PROJECT_ROOT, {
				type: "material.list",
				filter: materialFilter(input)
			});
			break;
		case "cutout_run_start":
			result = await executeControl(PROJECT_ROOT, {
				type: "run.start",
				runId: input.runId,
				mode: input.mode,
				intent: input.intent
			});
			break;
		case "cutout_run_get":
			result = await executeControl(PROJECT_ROOT, {
				type: "run.get",
				runId: input.runId
			});
			break;
		case "cutout_run_events":
			result = await executeControl(PROJECT_ROOT, {
				type: "run.events",
				runId: input.runId,
				...input.afterEventId ? { afterEventId: input.afterEventId } : {},
				...input.limit ? { limit: input.limit } : {}
			});
			break;
		case "cutout_run_cancel":
			result = await executeControl(PROJECT_ROOT, {
				type: "run.cancel",
				runId: input.runId,
				...input.reason ? { reason: input.reason } : {}
			});
			break;
		case "cutout_project_context":
			result = await executeControl(PROJECT_ROOT, {
				type: "project.context",
				include: input.include ?? ["summary"]
			});
			break;
		case "cutout_list_materials":
			result = await executeControl(PROJECT_ROOT, {
				type: "material.list",
				filter: materialFilter(input)
			});
			break;
		case "cutout_validate":
			result = await executeControl(PROJECT_ROOT, {
				type: "validate",
				scope: input.scope ?? [
					"design",
					"tokens",
					"materials",
					"outcome"
				]
			});
			break;
		case "cutout_governance_preview":
		case "cutout_governance_validate":
		case "cutout_governance_report":
			result = await executeGovernance(PROJECT_ROOT, input.input, input.policy, params.name.slice(18));
			break;
		case "cutout_dry_run_patch":
			result = await executeControl(PROJECT_ROOT, input.operation, { mode: "dry-run" });
			break;
		case "cutout_plan_source_ingest":
			assertSourceDescriptor(input.input);
			result = await executeControl(PROJECT_ROOT, {
				type: "source.ingest",
				input: input.input
			}, { mode: "dry-run" });
			break;
		case "cutout_apply_source_ingest":
			assertSourceDescriptor(input.input);
			if (typeof input.approvalLeaseId !== "string" || input.approvalLeaseId.length === 0 || input.approvalLeaseId.length > 160) throw rpcError(-32602, "approvalLeaseId is required.");
			result = await executeControl(PROJECT_ROOT, {
				type: "source.ingest",
				input: input.input
			}, {
				mode: "apply",
				approvalLeaseId: input.approvalLeaseId
			});
			break;
		case "cutout_plan_design_kit_export":
			result = await executeControl(PROJECT_ROOT, {
				type: "export.design-kit",
				format: "directory"
			}, { mode: "dry-run" });
			break;
		case "cutout_export_design_kit":
			if (typeof input.approvalLeaseId !== "string" || input.approvalLeaseId.length === 0 || input.approvalLeaseId.length > 160) throw rpcError(-32602, "approvalLeaseId is required.");
			result = await executeControl(PROJECT_ROOT, {
				type: "export.design-kit",
				format: "directory"
			}, {
				mode: "apply",
				approvalLeaseId: input.approvalLeaseId
			});
			break;
		case "cutout_plan_brand_kit_export":
			if (!input.input || typeof input.input !== "object" || Array.isArray(input.input)) throw rpcError(-32602, "input must be a BrandKitInput object.");
			result = await executeControl(PROJECT_ROOT, {
				type: "export.brand-kit",
				input: input.input
			}, { mode: "dry-run" });
			break;
		case "cutout_export_brand_kit":
			if (!input.input || typeof input.input !== "object" || Array.isArray(input.input)) throw rpcError(-32602, "input must be a BrandKitInput object.");
			if (typeof input.approvalLeaseId !== "string" || input.approvalLeaseId.length === 0 || input.approvalLeaseId.length > 160) throw rpcError(-32602, "approvalLeaseId is required.");
			result = await executeControl(PROJECT_ROOT, {
				type: "export.brand-kit",
				input: input.input
			}, {
				mode: "apply",
				approvalLeaseId: input.approvalLeaseId
			});
			break;
		case "cutout_plan_starter_export":
			if (!validStarterFramework(input.framework)) throw rpcError(-32602, "framework must be next-app-router, vite-react, nuxt, or tanstack-start.");
			result = await executeControl(PROJECT_ROOT, {
				type: "export.starter",
				framework: input.framework
			}, { mode: "dry-run" });
			break;
		case "cutout_export_starter":
			if (!validStarterFramework(input.framework)) throw rpcError(-32602, "framework must be next-app-router, vite-react, nuxt, or tanstack-start.");
			if (typeof input.approvalLeaseId !== "string" || input.approvalLeaseId.length === 0 || input.approvalLeaseId.length > 160) throw rpcError(-32602, "approvalLeaseId is required.");
			result = await executeControl(PROJECT_ROOT, {
				type: "export.starter",
				framework: input.framework
			}, {
				mode: "apply",
				approvalLeaseId: input.approvalLeaseId
			});
			break;
		case "cutout_plan_coding_task":
			assertCodingInput(input);
			result = await executeControl(PROJECT_ROOT, {
				type: input.operation,
				task: input.task
			}, { mode: "dry-run" });
			break;
		case "cutout_apply_coding_task":
			assertCodingInput(input);
			if (typeof input.approvalLeaseId !== "string" || input.approvalLeaseId.length === 0 || input.approvalLeaseId.length > 160) throw rpcError(-32602, "approvalLeaseId is required.");
			result = await executeControl(PROJECT_ROOT, {
				type: input.operation,
				task: input.task
			}, {
				mode: "apply",
				approvalLeaseId: input.approvalLeaseId
			});
			break;
		case "cutout_registry_list":
			result = {
				ok: true,
				response: { items: await registryList(PROJECT_ROOT, {
					kind: input.kind,
					framework: input.framework
				}) }
			};
			break;
		case "cutout_registry_search":
			result = {
				ok: true,
				response: { items: await registryList(PROJECT_ROOT, {
					query: input.query,
					kind: input.kind,
					framework: input.framework
				}) }
			};
			break;
		case "cutout_registry_get":
			result = {
				ok: true,
				response: await registryGet(PROJECT_ROOT, input.itemId, input.version)
			};
			break;
		case "cutout_registry_plan_install":
			result = {
				ok: true,
				response: await registryPlanInstall(PROJECT_ROOT, input.itemId, input.framework, input.version)
			};
			break;
		case "cutout_registry_apply_install":
			result = {
				ok: true,
				response: await registryApplyInstall(PROJECT_ROOT, input.itemId, input.framework, input.planId, input.approvalLeaseId, input.version)
			};
			break;
		case "cutout_registry_install_receipt": {
			const receipt = await registryReceipt(PROJECT_ROOT, input.planId);
			result = receipt ? {
				ok: true,
				response: receipt
			} : {
				ok: false,
				error: {
					code: "not-found",
					message: "Registry install receipt was not found."
				}
			};
			break;
		}
		case "cutout_workflow_pack_list":
			result = {
				ok: true,
				response: { packs: await workflowList$1(PROJECT_ROOT) }
			};
			break;
		case "cutout_workflow_pack_get":
			result = {
				ok: true,
				response: await workflowGet$1(PROJECT_ROOT, input.id, input.version)
			};
			break;
		case "cutout_workflow_pack_compatibility": {
			const pack = await workflowGet$1(PROJECT_ROOT, input.id, input.version);
			result = {
				ok: true,
				response: workflowCompatibility$1(pack, {
					cutoutVersion: input.cutoutVersion,
					capabilities: input.capabilities
				})
			};
			break;
		}
		default: throw rpcError(-32602, `Unknown Cutout tool: ${params.name}`);
	}
	return toolResult(result);
}
function toolResult(result) {
	return {
		content: [{
			type: "text",
			text: JSON.stringify(result)
		}],
		structuredContent: result,
		isError: !result.ok
	};
}
function assertCodingInput(input) {
	if (![
		"coding.execute",
		"coding.review",
		"coding.repair"
	].includes(input.operation)) throw rpcError(-32602, "operation must be coding.execute, coding.review, or coding.repair.");
	if (!input.task || typeof input.task !== "object" || Array.isArray(input.task)) throw rpcError(-32602, "task must be a CodingTask object.");
}
function governanceInputSchema() {
	return {
		type: "object",
		additionalProperties: false,
		required: ["input", "policy"],
		properties: {
			input: {
				type: "object",
				description: "GovernanceInput with explicit tokens and measured samples for the bound document/revision."
			},
			policy: {
				type: "object",
				description: "Versioned design-governance-policy.v1."
			}
		}
	};
}
function assertSourceDescriptor(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw rpcError(-32602, "input must be a source descriptor object.");
	if ("bytes" in value || "content" in value || "file" in value || "absolutePath" in value || "command" in value) throw rpcError(-32602, "Source ingestion accepts descriptors and controlled relative scan paths only.");
}
function validStarterFramework(value) {
	return value === "next-app-router" || value === "vite-react" || value === "nuxt" || value === "tanstack-start";
}
function materialFilter(input) {
	if ("kind" in input && "pageId" in input) throw rpcError(-32602, "Use either kind or pageId, not both.");
	if (typeof input.kind === "string") return { kind: input.kind };
	if (typeof input.pageId === "string") return { pageId: input.pageId };
}
function rpcError(code, message) {
	const error = new Error(message);
	error.rpcCode = code;
	return error;
}
function send(message) {
	process$1.stdout.write(`${JSON.stringify(message)}\n`);
}
var buffer = "";
function runMcpServer(options) {
	if (typeof options.serverVersion !== "string" || !options.serverVersion.trim()) throw new Error("runMcpServer requires the authoritative product version");
	SERVER_INFO = {
		name: "cutout-headless",
		version: options.serverVersion
	};
	PROJECT_ROOT = options.projectRoot;
	closeHeadlessRuntime = options.closeHeadlessRuntime ?? (async () => void 0);
	executeControl = options.executeControl;
	executeGovernance = options.executeGovernance;
	capabilityStatus = options.capabilityStatus;
	discoveryHandshake = options.discoveryHandshake;
	listSkills = options.listSkills;
	readSkill = options.readSkill;
	closeRegistryRuntime = options.closeRegistryRuntime ?? (async () => void 0);
	registryApplyInstall = options.registryApplyInstall;
	registryGet = options.registryGet;
	registryList = options.registryList;
	registryPlanInstall = options.registryPlanInstall;
	registryReceipt = options.registryReceipt;
	workflowCompatibility$1 = options.workflowCompatibility;
	workflowGet$1 = options.workflowGet;
	workflowList$1 = options.workflowList;
	process$1.stdin.setEncoding("utf8");
	process$1.stdin.on("data", (chunk) => {
		buffer += chunk;
		let newline;
		while ((newline = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line) receive(line);
		}
	});
	process$1.stdin.on("end", async () => {
		await closeHeadlessRuntime();
		await closeRegistryRuntime();
	});
}
async function receive(line) {
	let request;
	try {
		request = JSON.parse(line);
	} catch {
		send({
			jsonrpc: "2.0",
			id: null,
			error: {
				code: -32700,
				message: "Invalid JSON-RPC input."
			}
		});
		return;
	}
	if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
		send({
			jsonrpc: "2.0",
			id: request?.id ?? null,
			error: {
				code: -32600,
				message: "Invalid JSON-RPC request."
			}
		});
		return;
	}
	try {
		const result = await handle(request.method, request.params);
		if ("id" in request) send({
			jsonrpc: "2.0",
			id: request.id,
			result: result ?? {}
		});
	} catch (error) {
		if ("id" in request) send({
			jsonrpc: "2.0",
			id: request.id,
			error: {
				code: typeof error?.rpcCode === "number" ? error.rpcCode : -32603,
				message: error instanceof Error ? error.message.slice(0, 1200) : "Internal MCP error."
			}
		});
	}
}
//#endregion
//#region scripts/cutout-registry-adapter.mjs
function createRegistryAdapter(loadService) {
	return {
		registryList: async (root, query) => (await loadService(root)).list(query),
		registryGet: async (root, id, version) => (await loadService(root)).get(id, version),
		registryPlanInstall: async (root, id, framework, version) => (await loadService(root)).planInstall(id, framework, version),
		registryApplyInstall: async (root, id, framework, planId, approvalLeaseId, version) => withProjectControlLock(root, async () => {
			const service = await loadService(root);
			const plan = await service.planInstall(id, framework, version);
			if (plan.id !== planId) throw new Error("Registry install plan changed; preview and approve a new plan.");
			const expectedRevision = await service.currentRevision();
			const reservation = await reserveApprovalLease(root, approvalLeaseId, {
				type: "registry.install",
				planId,
				itemId: plan.itemId,
				itemVersion: plan.itemVersion,
				targetFramework: plan.targetFramework
			}, expectedRevision);
			const receipt = await service.applyInstall(id, framework, planId, reservation.approval.id, version);
			await completeApprovalLease(root, approvalLeaseId, reservation.reservationId, {
				requestId: planId,
				status: "ok",
				revision: expectedRevision
			});
			return receipt;
		}),
		registryReceipt: async (root, planId) => (await loadService(root)).receipt(planId)
	};
}
//#endregion
//#region scripts/cutout-workflows.mjs
async function workflowList(root) {
	return (await all(root)).map(({ id, version, title, description, cutoutRange, capabilities, evalCard }) => ({
		id,
		version,
		title,
		description,
		cutoutRange,
		capabilities,
		evalCard
	}));
}
async function workflowGet(root, id, version) {
	const selected = (await all(root)).filter((pack) => pack.id === id && (!version || pack.version === version)).sort((a, b) => b.version.localeCompare(a.version))[0];
	if (!selected) throw new Error(`Workflow pack not found: ${id}${version ? `@${version}` : ""}.`);
	return selected;
}
function workflowCompatibility(pack, input) {
	const required = Number(String(pack.cutoutRange).match(/\d+/)?.[0]), actual = Number(String(input.cutoutVersion).split(".")[0]), missing = pack.capabilities.filter((cap) => !input.capabilities.includes(cap));
	return {
		compatible: required === actual && !missing.length,
		missingCapabilities: missing,
		reason: required !== actual ? "Cutout major version is outside the pack range." : missing.length ? "Required capabilities are unavailable." : void 0
	};
}
async function all(root) {
	const dir = resolve(root, ".cutout", "workflows"), names = await readdir(dir).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error)), packs = [];
	for (const name of names.filter((name) => name.endsWith(".json")).sort()) {
		const pack = JSON.parse(await readFile(resolve(dir, name), "utf8"));
		if (pack?.protocol !== "cutout.workflow-pack.v1" || typeof pack.id !== "string" || !Array.isArray(pack.capabilities) || !Array.isArray(pack.steps)) throw new Error(`Invalid Cutout workflow pack: ${name}.`);
		packs.push(pack);
	}
	return packs;
}
//#endregion
//#region scripts/cutout-mcp-bundle-entry.mjs
var dataRoot = resolve(import.meta.dirname, "..", "runtime-data");
var serverVersion = JSON.parse(readFileSync(resolve(dataRoot, "cutout.agent-capabilities.json"), "utf8")).product.packageVersion;
var externalControl = createExternalControl(dataRoot);
var headless = createHeadlessAdapter(async () => headless_exports);
var registry = createRegistryAdapter(async (projectRoot) => createNodeRegistryService(projectRoot));
runMcpServer({
	serverVersion,
	projectRoot: process$1.env.CUTOUT_PROJECT_ROOT,
	closeHeadlessRuntime: async () => void 0,
	executeControl: headless.executeControl,
	executeGovernance: headless.executeGovernance,
	capabilityStatus: externalControl.capabilityStatus,
	discoveryHandshake: externalControl.discoveryHandshake,
	listSkills: externalControl.listSkills,
	readSkill: externalControl.readSkill,
	closeRegistryRuntime: async () => void 0,
	registryApplyInstall: registry.registryApplyInstall,
	registryGet: registry.registryGet,
	registryList: registry.registryList,
	registryPlanInstall: registry.registryPlanInstall,
	registryReceipt: registry.registryReceipt,
	workflowCompatibility,
	workflowGet,
	workflowList
});
//#endregion
export {};
