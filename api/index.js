var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/hono/dist/compose.js
var compose;
var init_compose = __esm({
  "node_modules/hono/dist/compose.js"() {
    compose = (middleware, onError, onNotFound) => {
      return (context, next) => {
        let index = -1;
        return dispatch(0);
        async function dispatch(i) {
          if (i <= index) {
            throw new Error("next() called multiple times");
          }
          index = i;
          let res;
          let isError = false;
          let handler2;
          if (middleware[i]) {
            handler2 = middleware[i][0][0];
            context.req.routeIndex = i;
          } else {
            handler2 = i === middleware.length && next || void 0;
          }
          if (handler2) {
            try {
              res = await handler2(context, () => dispatch(i + 1));
            } catch (err) {
              if (err instanceof Error && onError) {
                context.error = err;
                res = await onError(err, context);
                isError = true;
              } else {
                throw err;
              }
            }
          } else {
            if (context.finalized === false && onNotFound) {
              res = await onNotFound(context);
            }
          }
          if (res && (context.finalized === false || isError)) {
            context.res = res;
          }
          return context;
        }
      };
    };
  }
});

// node_modules/hono/dist/http-exception.js
var init_http_exception = __esm({
  "node_modules/hono/dist/http-exception.js"() {
  }
});

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT;
var init_constants = __esm({
  "node_modules/hono/dist/request/constants.js"() {
    GET_MATCH_RESULT = /* @__PURE__ */ Symbol();
  }
});

// node_modules/hono/dist/utils/body.js
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var parseBody, handleParsingAllValues, handleParsingNestedValues;
var init_body = __esm({
  "node_modules/hono/dist/utils/body.js"() {
    init_request();
    parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
      const { all = false, dot = false } = options;
      const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
      const contentType = headers.get("Content-Type");
      if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
        return parseFormData(request, { all, dot });
      }
      return {};
    };
    handleParsingAllValues = (form, key, value) => {
      if (form[key] !== void 0) {
        if (Array.isArray(form[key])) {
          ;
          form[key].push(value);
        } else {
          form[key] = [form[key], value];
        }
      } else {
        if (!key.endsWith("[]")) {
          form[key] = value;
        } else {
          form[key] = [value];
        }
      }
    };
    handleParsingNestedValues = (form, key, value) => {
      if (/(?:^|\.)__proto__\./.test(key)) {
        return;
      }
      let nestedForm = form;
      const keys = key.split(".");
      keys.forEach((key2, index) => {
        if (index === keys.length - 1) {
          nestedForm[key2] = value;
        } else {
          if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
            nestedForm[key2] = /* @__PURE__ */ Object.create(null);
          }
          nestedForm = nestedForm[key2];
        }
      });
    };
  }
});

// node_modules/hono/dist/utils/url.js
var splitPath, splitRoutingPath, extractGroupsFromPath, replaceGroupMarks, patternCache, getPattern, tryDecode, tryDecodeURI, getPath, getPathNoStrict, mergePath, checkOptionalParameter, _decodeURI, _getQueryParam, getQueryParam, getQueryParams, decodeURIComponent_;
var init_url = __esm({
  "node_modules/hono/dist/utils/url.js"() {
    splitPath = (path) => {
      const paths = path.split("/");
      if (paths[0] === "") {
        paths.shift();
      }
      return paths;
    };
    splitRoutingPath = (routePath) => {
      const { groups, path } = extractGroupsFromPath(routePath);
      const paths = splitPath(path);
      return replaceGroupMarks(paths, groups);
    };
    extractGroupsFromPath = (path) => {
      const groups = [];
      path = path.replace(/\{[^}]+\}/g, (match2, index) => {
        const mark = `@${index}`;
        groups.push([mark, match2]);
        return mark;
      });
      return { groups, path };
    };
    replaceGroupMarks = (paths, groups) => {
      for (let i = groups.length - 1; i >= 0; i--) {
        const [mark] = groups[i];
        for (let j = paths.length - 1; j >= 0; j--) {
          if (paths[j].includes(mark)) {
            paths[j] = paths[j].replace(mark, groups[i][1]);
            break;
          }
        }
      }
      return paths;
    };
    patternCache = {};
    getPattern = (label, next) => {
      if (label === "*") {
        return "*";
      }
      const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      if (match2) {
        const cacheKey = `${label}#${next}`;
        if (!patternCache[cacheKey]) {
          if (match2[2]) {
            patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
          } else {
            patternCache[cacheKey] = [label, match2[1], true];
          }
        }
        return patternCache[cacheKey];
      }
      return null;
    };
    tryDecode = (str, decoder) => {
      try {
        return decoder(str);
      } catch {
        return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
          try {
            return decoder(match2);
          } catch {
            return match2;
          }
        });
      }
    };
    tryDecodeURI = (str) => tryDecode(str, decodeURI);
    getPath = (request) => {
      const url = request.url;
      const start = url.indexOf("/", url.indexOf(":") + 4);
      let i = start;
      for (; i < url.length; i++) {
        const charCode = url.charCodeAt(i);
        if (charCode === 37) {
          const queryIndex = url.indexOf("?", i);
          const hashIndex = url.indexOf("#", i);
          const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
          const path = url.slice(start, end);
          return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
        } else if (charCode === 63 || charCode === 35) {
          break;
        }
      }
      return url.slice(start, i);
    };
    getPathNoStrict = (request) => {
      const result = getPath(request);
      return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
    };
    mergePath = (base, sub, ...rest) => {
      if (rest.length) {
        sub = mergePath(sub, ...rest);
      }
      return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
    };
    checkOptionalParameter = (path) => {
      if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
        return null;
      }
      const segments = path.split("/");
      const results = [];
      let basePath = "";
      segments.forEach((segment) => {
        if (segment !== "" && !/\:/.test(segment)) {
          basePath += "/" + segment;
        } else if (/\:/.test(segment)) {
          if (/\?/.test(segment)) {
            if (results.length === 0 && basePath === "") {
              results.push("/");
            } else {
              results.push(basePath);
            }
            const optionalSegment = segment.replace("?", "");
            basePath += "/" + optionalSegment;
            results.push(basePath);
          } else {
            basePath += "/" + segment;
          }
        }
      });
      return results.filter((v, i, a) => a.indexOf(v) === i);
    };
    _decodeURI = (value) => {
      if (!/[%+]/.test(value)) {
        return value;
      }
      if (value.indexOf("+") !== -1) {
        value = value.replace(/\+/g, " ");
      }
      return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
    };
    _getQueryParam = (url, key, multiple) => {
      let encoded;
      if (!multiple && key && !/[%+]/.test(key)) {
        let keyIndex2 = url.indexOf("?", 8);
        if (keyIndex2 === -1) {
          return void 0;
        }
        if (!url.startsWith(key, keyIndex2 + 1)) {
          keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
        }
        while (keyIndex2 !== -1) {
          const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
          if (trailingKeyCode === 61) {
            const valueIndex = keyIndex2 + key.length + 2;
            const endIndex = url.indexOf("&", valueIndex);
            return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
          } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
            return "";
          }
          keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
        }
        encoded = /[%+]/.test(url);
        if (!encoded) {
          return void 0;
        }
      }
      const results = {};
      encoded ??= /[%+]/.test(url);
      let keyIndex = url.indexOf("?", 8);
      while (keyIndex !== -1) {
        const nextKeyIndex = url.indexOf("&", keyIndex + 1);
        let valueIndex = url.indexOf("=", keyIndex);
        if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
          valueIndex = -1;
        }
        let name = url.slice(
          keyIndex + 1,
          valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
        );
        if (encoded) {
          name = _decodeURI(name);
        }
        keyIndex = nextKeyIndex;
        if (name === "") {
          continue;
        }
        let value;
        if (valueIndex === -1) {
          value = "";
        } else {
          value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
          if (encoded) {
            value = _decodeURI(value);
          }
        }
        if (multiple) {
          if (!(results[name] && Array.isArray(results[name]))) {
            results[name] = [];
          }
          ;
          results[name].push(value);
        } else {
          results[name] ??= value;
        }
      }
      return key ? results[key] : results;
    };
    getQueryParam = _getQueryParam;
    getQueryParams = (url, key) => {
      return _getQueryParam(url, key, true);
    };
    decodeURIComponent_ = decodeURIComponent;
  }
});

// node_modules/hono/dist/request.js
var tryDecodeURIComponent, HonoRequest;
var init_request = __esm({
  "node_modules/hono/dist/request.js"() {
    init_http_exception();
    init_constants();
    init_body();
    init_url();
    tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
    HonoRequest = class {
      /**
       * `.raw` can get the raw Request object.
       *
       * @see {@link https://hono.dev/docs/api/request#raw}
       *
       * @example
       * ```ts
       * // For Cloudflare Workers
       * app.post('/', async (c) => {
       *   const metadata = c.req.raw.cf?.hostMetadata?
       *   ...
       * })
       * ```
       */
      raw;
      #validatedData;
      // Short name of validatedData
      #matchResult;
      routeIndex = 0;
      /**
       * `.path` can get the pathname of the request.
       *
       * @see {@link https://hono.dev/docs/api/request#path}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const pathname = c.req.path // `/about/me`
       * })
       * ```
       */
      path;
      bodyCache = {};
      constructor(request, path = "/", matchResult = [[]]) {
        this.raw = request;
        this.path = path;
        this.#matchResult = matchResult;
        this.#validatedData = {};
      }
      param(key) {
        return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
      }
      #getDecodedParam(key) {
        const paramKey = this.#matchResult[0][this.routeIndex][1][key];
        const param = this.#getParamValue(paramKey);
        return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
      }
      #getAllDecodedParams() {
        const decoded = {};
        const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
        for (const key of keys) {
          const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
          if (value !== void 0) {
            decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
          }
        }
        return decoded;
      }
      #getParamValue(paramKey) {
        return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
      }
      query(key) {
        return getQueryParam(this.url, key);
      }
      queries(key) {
        return getQueryParams(this.url, key);
      }
      header(name) {
        if (name) {
          return this.raw.headers.get(name) ?? void 0;
        }
        const headerData = {};
        this.raw.headers.forEach((value, key) => {
          headerData[key] = value;
        });
        return headerData;
      }
      async parseBody(options) {
        return parseBody(this, options);
      }
      #cachedBody = (key) => {
        const { bodyCache, raw: raw2 } = this;
        const cachedBody = bodyCache[key];
        if (cachedBody) {
          return cachedBody;
        }
        const anyCachedKey = Object.keys(bodyCache)[0];
        if (anyCachedKey) {
          return bodyCache[anyCachedKey].then((body) => {
            if (anyCachedKey === "json") {
              body = JSON.stringify(body);
            }
            return new Response(body)[key]();
          });
        }
        return bodyCache[key] = raw2[key]();
      };
      /**
       * `.json()` can parse Request body of type `application/json`
       *
       * @see {@link https://hono.dev/docs/api/request#json}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.json()
       * })
       * ```
       */
      json() {
        return this.#cachedBody("text").then((text) => JSON.parse(text));
      }
      /**
       * `.text()` can parse Request body of type `text/plain`
       *
       * @see {@link https://hono.dev/docs/api/request#text}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.text()
       * })
       * ```
       */
      text() {
        return this.#cachedBody("text");
      }
      /**
       * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
       *
       * @see {@link https://hono.dev/docs/api/request#arraybuffer}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.arrayBuffer()
       * })
       * ```
       */
      arrayBuffer() {
        return this.#cachedBody("arrayBuffer");
      }
      /**
       * `.bytes()` parses the request body as a `Uint8Array`.
       *
       * @see {@link https://hono.dev/docs/api/request#bytes}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.bytes()
       * })
       * ```
       */
      bytes() {
        return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
      }
      /**
       * Parses the request body as a `Blob`.
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.blob();
       * });
       * ```
       * @see https://hono.dev/docs/api/request#blob
       */
      blob() {
        return this.#cachedBody("blob");
      }
      /**
       * Parses the request body as `FormData`.
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.formData();
       * });
       * ```
       * @see https://hono.dev/docs/api/request#formdata
       */
      formData() {
        return this.#cachedBody("formData");
      }
      /**
       * Adds validated data to the request.
       *
       * @param target - The target of the validation.
       * @param data - The validated data to add.
       */
      addValidatedData(target, data) {
        this.#validatedData[target] = data;
      }
      valid(target) {
        return this.#validatedData[target];
      }
      /**
       * `.url()` can get the request url strings.
       *
       * @see {@link https://hono.dev/docs/api/request#url}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const url = c.req.url // `http://localhost:8787/about/me`
       *   ...
       * })
       * ```
       */
      get url() {
        return this.raw.url;
      }
      /**
       * `.method()` can get the method name of the request.
       *
       * @see {@link https://hono.dev/docs/api/request#method}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const method = c.req.method // `GET`
       * })
       * ```
       */
      get method() {
        return this.raw.method;
      }
      get [GET_MATCH_RESULT]() {
        return this.#matchResult;
      }
      /**
       * `.matchedRoutes()` can return a matched route in the handler
       *
       * @deprecated
       *
       * Use matchedRoutes helper defined in "hono/route" instead.
       *
       * @see {@link https://hono.dev/docs/api/request#matchedroutes}
       *
       * @example
       * ```ts
       * app.use('*', async function logger(c, next) {
       *   await next()
       *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
       *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
       *     console.log(
       *       method,
       *       ' ',
       *       path,
       *       ' '.repeat(Math.max(10 - path.length, 0)),
       *       name,
       *       i === c.req.routeIndex ? '<- respond from here' : ''
       *     )
       *   })
       * })
       * ```
       */
      get matchedRoutes() {
        return this.#matchResult[0].map(([[, route]]) => route);
      }
      /**
       * `routePath()` can retrieve the path registered within the handler
       *
       * @deprecated
       *
       * Use routePath helper defined in "hono/route" instead.
       *
       * @see {@link https://hono.dev/docs/api/request#routepath}
       *
       * @example
       * ```ts
       * app.get('/posts/:id', (c) => {
       *   return c.json({ path: c.req.routePath })
       * })
       * ```
       */
      get routePath() {
        return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
      }
    };
  }
});

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase, raw, resolveCallback;
var init_html = __esm({
  "node_modules/hono/dist/utils/html.js"() {
    HtmlEscapedCallbackPhase = {
      Stringify: 1,
      BeforeStream: 2,
      Stream: 3
    };
    raw = (value, callbacks) => {
      const escapedString = new String(value);
      escapedString.isEscaped = true;
      escapedString.callbacks = callbacks;
      return escapedString;
    };
    resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
      if (typeof str === "object" && !(str instanceof String)) {
        if (!(str instanceof Promise)) {
          str = str.toString();
        }
        if (str instanceof Promise) {
          str = await str;
        }
      }
      const callbacks = str.callbacks;
      if (!callbacks?.length) {
        return Promise.resolve(str);
      }
      if (buffer) {
        buffer[0] += str;
      } else {
        buffer = [str];
      }
      const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
        (res) => Promise.all(
          res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
        ).then(() => buffer[0])
      );
      if (preserveCallbacks) {
        return raw(await resStr, callbacks);
      } else {
        return resStr;
      }
    };
  }
});

// node_modules/hono/dist/context.js
var TEXT_PLAIN, setDefaultContentType, createResponseInstance, Context;
var init_context = __esm({
  "node_modules/hono/dist/context.js"() {
    init_request();
    init_html();
    TEXT_PLAIN = "text/plain; charset=UTF-8";
    setDefaultContentType = (contentType, headers) => {
      return {
        "Content-Type": contentType,
        ...headers
      };
    };
    createResponseInstance = (body, init) => new Response(body, init);
    Context = class {
      #rawRequest;
      #req;
      /**
       * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
       *
       * @see {@link https://hono.dev/docs/api/context#env}
       *
       * @example
       * ```ts
       * // Environment object for Cloudflare Workers
       * app.get('*', async c => {
       *   const counter = c.env.COUNTER
       * })
       * ```
       */
      env = {};
      #var;
      finalized = false;
      /**
       * `.error` can get the error object from the middleware if the Handler throws an error.
       *
       * @see {@link https://hono.dev/docs/api/context#error}
       *
       * @example
       * ```ts
       * app.use('*', async (c, next) => {
       *   await next()
       *   if (c.error) {
       *     // do something...
       *   }
       * })
       * ```
       */
      error;
      #status;
      #executionCtx;
      #res;
      #layout;
      #renderer;
      #notFoundHandler;
      #preparedHeaders;
      #matchResult;
      #path;
      /**
       * Creates an instance of the Context class.
       *
       * @param req - The Request object.
       * @param options - Optional configuration options for the context.
       */
      constructor(req, options) {
        this.#rawRequest = req;
        if (options) {
          this.#executionCtx = options.executionCtx;
          this.env = options.env;
          this.#notFoundHandler = options.notFoundHandler;
          this.#path = options.path;
          this.#matchResult = options.matchResult;
        }
      }
      /**
       * `.req` is the instance of {@link HonoRequest}.
       */
      get req() {
        this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
        return this.#req;
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#event}
       * The FetchEvent associated with the current request.
       *
       * @throws Will throw an error if the context does not have a FetchEvent.
       */
      get event() {
        if (this.#executionCtx && "respondWith" in this.#executionCtx) {
          return this.#executionCtx;
        } else {
          throw Error("This context has no FetchEvent");
        }
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#executionctx}
       * The ExecutionContext associated with the current request.
       *
       * @throws Will throw an error if the context does not have an ExecutionContext.
       */
      get executionCtx() {
        if (this.#executionCtx) {
          return this.#executionCtx;
        } else {
          throw Error("This context has no ExecutionContext");
        }
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#res}
       * The Response object for the current request.
       */
      get res() {
        return this.#res ||= createResponseInstance(null, {
          headers: this.#preparedHeaders ??= new Headers()
        });
      }
      /**
       * Sets the Response object for the current request.
       *
       * @param _res - The Response object to set.
       */
      set res(_res) {
        if (this.#res && _res) {
          _res = createResponseInstance(_res.body, _res);
          for (const [k, v] of this.#res.headers.entries()) {
            if (k === "content-type") {
              continue;
            }
            if (k === "set-cookie") {
              const cookies = this.#res.headers.getSetCookie();
              _res.headers.delete("set-cookie");
              for (const cookie of cookies) {
                _res.headers.append("set-cookie", cookie);
              }
            } else {
              _res.headers.set(k, v);
            }
          }
        }
        this.#res = _res;
        this.finalized = true;
      }
      /**
       * `.render()` can create a response within a layout.
       *
       * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
       *
       * @example
       * ```ts
       * app.get('/', (c) => {
       *   return c.render('Hello!')
       * })
       * ```
       */
      render = (...args) => {
        this.#renderer ??= (content) => this.html(content);
        return this.#renderer(...args);
      };
      /**
       * Sets the layout for the response.
       *
       * @param layout - The layout to set.
       * @returns The layout function.
       */
      setLayout = (layout) => this.#layout = layout;
      /**
       * Gets the current layout for the response.
       *
       * @returns The current layout function.
       */
      getLayout = () => this.#layout;
      /**
       * `.setRenderer()` can set the layout in the custom middleware.
       *
       * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
       *
       * @example
       * ```tsx
       * app.use('*', async (c, next) => {
       *   c.setRenderer((content) => {
       *     return c.html(
       *       <html>
       *         <body>
       *           <p>{content}</p>
       *         </body>
       *       </html>
       *     )
       *   })
       *   await next()
       * })
       * ```
       */
      setRenderer = (renderer) => {
        this.#renderer = renderer;
      };
      /**
       * `.header()` can set headers.
       *
       * @see {@link https://hono.dev/docs/api/context#header}
       *
       * @example
       * ```ts
       * app.get('/welcome', (c) => {
       *   // Set headers
       *   c.header('X-Message', 'Hello!')
       *   c.header('Content-Type', 'text/plain')
       *
       *   return c.body('Thank you for coming')
       * })
       * ```
       */
      header = (name, value, options) => {
        if (this.finalized) {
          this.#res = createResponseInstance(this.#res.body, this.#res);
        }
        const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
        if (value === void 0) {
          headers.delete(name);
        } else if (options?.append) {
          headers.append(name, value);
        } else {
          headers.set(name, value);
        }
      };
      status = (status) => {
        this.#status = status;
      };
      /**
       * `.set()` can set the value specified by the key.
       *
       * @see {@link https://hono.dev/docs/api/context#set-get}
       *
       * @example
       * ```ts
       * app.use('*', async (c, next) => {
       *   c.set('message', 'Hono is hot!!')
       *   await next()
       * })
       * ```
       */
      set = (key, value) => {
        this.#var ??= /* @__PURE__ */ new Map();
        this.#var.set(key, value);
      };
      /**
       * `.get()` can use the value specified by the key.
       *
       * @see {@link https://hono.dev/docs/api/context#set-get}
       *
       * @example
       * ```ts
       * app.get('/', (c) => {
       *   const message = c.get('message')
       *   return c.text(`The message is "${message}"`)
       * })
       * ```
       */
      get = (key) => {
        return this.#var ? this.#var.get(key) : void 0;
      };
      /**
       * `.var` can access the value of a variable.
       *
       * @see {@link https://hono.dev/docs/api/context#var}
       *
       * @example
       * ```ts
       * const result = c.var.client.oneMethod()
       * ```
       */
      // c.var.propName is a read-only
      get var() {
        if (!this.#var) {
          return {};
        }
        return Object.fromEntries(this.#var);
      }
      #newResponse(data, arg, headers) {
        const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
        if (typeof arg === "object" && "headers" in arg) {
          const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
          for (const [key, value] of argHeaders) {
            if (key.toLowerCase() === "set-cookie") {
              responseHeaders.append(key, value);
            } else {
              responseHeaders.set(key, value);
            }
          }
        }
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            if (typeof v === "string") {
              responseHeaders.set(k, v);
            } else {
              responseHeaders.delete(k);
              for (const v2 of v) {
                responseHeaders.append(k, v2);
              }
            }
          }
        }
        const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
        return createResponseInstance(data, { status, headers: responseHeaders });
      }
      newResponse = (...args) => this.#newResponse(...args);
      /**
       * `.body()` can return the HTTP response.
       * You can set headers with `.header()` and set HTTP status code with `.status`.
       * This can also be set in `.text()`, `.json()` and so on.
       *
       * @see {@link https://hono.dev/docs/api/context#body}
       *
       * @example
       * ```ts
       * app.get('/welcome', (c) => {
       *   // Set headers
       *   c.header('X-Message', 'Hello!')
       *   c.header('Content-Type', 'text/plain')
       *   // Set HTTP status code
       *   c.status(201)
       *
       *   // Return the response body
       *   return c.body('Thank you for coming')
       * })
       * ```
       */
      body = (data, arg, headers) => this.#newResponse(data, arg, headers);
      /**
       * `.text()` can render text as `Content-Type:text/plain`.
       *
       * @see {@link https://hono.dev/docs/api/context#text}
       *
       * @example
       * ```ts
       * app.get('/say', (c) => {
       *   return c.text('Hello!')
       * })
       * ```
       */
      text = (text, arg, headers) => {
        return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
          text,
          arg,
          setDefaultContentType(TEXT_PLAIN, headers)
        );
      };
      /**
       * `.json()` can render JSON as `Content-Type:application/json`.
       *
       * @see {@link https://hono.dev/docs/api/context#json}
       *
       * @example
       * ```ts
       * app.get('/api', (c) => {
       *   return c.json({ message: 'Hello!' })
       * })
       * ```
       */
      json = (object, arg, headers) => {
        return this.#newResponse(
          JSON.stringify(object),
          arg,
          setDefaultContentType("application/json", headers)
        );
      };
      html = (html, arg, headers) => {
        const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
        return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
      };
      /**
       * `.redirect()` can Redirect, default status code is 302.
       *
       * @see {@link https://hono.dev/docs/api/context#redirect}
       *
       * @example
       * ```ts
       * app.get('/redirect', (c) => {
       *   return c.redirect('/')
       * })
       * app.get('/redirect-permanently', (c) => {
       *   return c.redirect('/', 301)
       * })
       * ```
       */
      redirect = (location, status) => {
        const locationString = String(location);
        this.header(
          "Location",
          // Multibyes should be encoded
          // eslint-disable-next-line no-control-regex
          !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
        );
        return this.newResponse(null, status ?? 302);
      };
      /**
       * `.notFound()` can return the Not Found Response.
       *
       * @see {@link https://hono.dev/docs/api/context#notfound}
       *
       * @example
       * ```ts
       * app.get('/notfound', (c) => {
       *   return c.notFound()
       * })
       * ```
       */
      notFound = () => {
        this.#notFoundHandler ??= () => createResponseInstance();
        return this.#notFoundHandler(this);
      };
    };
  }
});

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL, METHOD_NAME_ALL_LOWERCASE, METHODS, MESSAGE_MATCHER_IS_ALREADY_BUILT, UnsupportedPathError;
var init_router = __esm({
  "node_modules/hono/dist/router.js"() {
    METHOD_NAME_ALL = "ALL";
    METHOD_NAME_ALL_LOWERCASE = "all";
    METHODS = ["get", "post", "put", "delete", "options", "patch"];
    MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
    UnsupportedPathError = class extends Error {
    };
  }
});

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER;
var init_constants2 = __esm({
  "node_modules/hono/dist/utils/constants.js"() {
    COMPOSED_HANDLER = "__COMPOSED_HANDLER";
  }
});

// node_modules/hono/dist/hono-base.js
var notFoundHandler, errorHandler, Hono;
var init_hono_base = __esm({
  "node_modules/hono/dist/hono-base.js"() {
    init_compose();
    init_context();
    init_router();
    init_constants2();
    init_url();
    notFoundHandler = (c) => {
      return c.text("404 Not Found", 404);
    };
    errorHandler = (err, c) => {
      if ("getResponse" in err) {
        const res = err.getResponse();
        return c.newResponse(res.body, res);
      }
      console.error(err);
      return c.text("Internal Server Error", 500);
    };
    Hono = class _Hono {
      get;
      post;
      put;
      delete;
      options;
      patch;
      all;
      on;
      use;
      /*
        This class is like an abstract class and does not have a router.
        To use it, inherit the class and implement router in the constructor.
      */
      router;
      getPath;
      // Cannot use `#` because it requires visibility at JavaScript runtime.
      _basePath = "/";
      #path = "/";
      routes = [];
      constructor(options = {}) {
        const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
        allMethods.forEach((method) => {
          this[method] = (args1, ...args) => {
            if (typeof args1 === "string") {
              this.#path = args1;
            } else {
              this.#addRoute(method, this.#path, args1);
            }
            args.forEach((handler2) => {
              this.#addRoute(method, this.#path, handler2);
            });
            return this;
          };
        });
        this.on = (method, path, ...handlers) => {
          for (const p of [path].flat()) {
            this.#path = p;
            for (const m of [method].flat()) {
              handlers.map((handler2) => {
                this.#addRoute(m.toUpperCase(), this.#path, handler2);
              });
            }
          }
          return this;
        };
        this.use = (arg1, ...handlers) => {
          if (typeof arg1 === "string") {
            this.#path = arg1;
          } else {
            this.#path = "*";
            handlers.unshift(arg1);
          }
          handlers.forEach((handler2) => {
            this.#addRoute(METHOD_NAME_ALL, this.#path, handler2);
          });
          return this;
        };
        const { strict, ...optionsWithoutStrict } = options;
        Object.assign(this, optionsWithoutStrict);
        this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
      }
      #clone() {
        const clone = new _Hono({
          router: this.router,
          getPath: this.getPath
        });
        clone.errorHandler = this.errorHandler;
        clone.#notFoundHandler = this.#notFoundHandler;
        clone.routes = this.routes;
        return clone;
      }
      #notFoundHandler = notFoundHandler;
      // Cannot use `#` because it requires visibility at JavaScript runtime.
      errorHandler = errorHandler;
      /**
       * `.route()` allows grouping other Hono instance in routes.
       *
       * @see {@link https://hono.dev/docs/api/routing#grouping}
       *
       * @param {string} path - base Path
       * @param {Hono} app - other Hono instance
       * @returns {Hono} routed Hono instance
       *
       * @example
       * ```ts
       * const app = new Hono()
       * const app2 = new Hono()
       *
       * app2.get("/user", (c) => c.text("user"))
       * app.route("/api", app2) // GET /api/user
       * ```
       */
      route(path, app3) {
        const subApp = this.basePath(path);
        app3.routes.map((r) => {
          let handler2;
          if (app3.errorHandler === errorHandler) {
            handler2 = r.handler;
          } else {
            handler2 = async (c, next) => (await compose([], app3.errorHandler)(c, () => r.handler(c, next))).res;
            handler2[COMPOSED_HANDLER] = r.handler;
          }
          subApp.#addRoute(r.method, r.path, handler2, r.basePath);
        });
        return this;
      }
      /**
       * `.basePath()` allows base paths to be specified.
       *
       * @see {@link https://hono.dev/docs/api/routing#base-path}
       *
       * @param {string} path - base Path
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * const api = new Hono().basePath('/api')
       * ```
       */
      basePath(path) {
        const subApp = this.#clone();
        subApp._basePath = mergePath(this._basePath, path);
        return subApp;
      }
      /**
       * `.onError()` handles an error and returns a customized Response.
       *
       * @see {@link https://hono.dev/docs/api/hono#error-handling}
       *
       * @param {ErrorHandler} handler - request Handler for error
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * app.onError((err, c) => {
       *   console.error(`${err}`)
       *   return c.text('Custom Error Message', 500)
       * })
       * ```
       */
      onError = (handler2) => {
        this.errorHandler = handler2;
        return this;
      };
      /**
       * `.notFound()` allows you to customize a Not Found Response.
       *
       * @see {@link https://hono.dev/docs/api/hono#not-found}
       *
       * @param {NotFoundHandler} handler - request handler for not-found
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * app.notFound((c) => {
       *   return c.text('Custom 404 Message', 404)
       * })
       * ```
       */
      notFound = (handler2) => {
        this.#notFoundHandler = handler2;
        return this;
      };
      /**
       * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
       *
       * @see {@link https://hono.dev/docs/api/hono#mount}
       *
       * @param {string} path - base Path
       * @param {Function} applicationHandler - other Request Handler
       * @param {MountOptions} [options] - options of `.mount()`
       * @returns {Hono} mounted Hono instance
       *
       * @example
       * ```ts
       * import { Router as IttyRouter } from 'itty-router'
       * import { Hono } from 'hono'
       * // Create itty-router application
       * const ittyRouter = IttyRouter()
       * // GET /itty-router/hello
       * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
       *
       * const app = new Hono()
       * app.mount('/itty-router', ittyRouter.handle)
       * ```
       *
       * @example
       * ```ts
       * const app = new Hono()
       * // Send the request to another application without modification.
       * app.mount('/app', anotherApp, {
       *   replaceRequest: (req) => req,
       * })
       * ```
       */
      mount(path, applicationHandler, options) {
        let replaceRequest;
        let optionHandler;
        if (options) {
          if (typeof options === "function") {
            optionHandler = options;
          } else {
            optionHandler = options.optionHandler;
            if (options.replaceRequest === false) {
              replaceRequest = (request) => request;
            } else {
              replaceRequest = options.replaceRequest;
            }
          }
        }
        const getOptions = optionHandler ? (c) => {
          const options2 = optionHandler(c);
          return Array.isArray(options2) ? options2 : [options2];
        } : (c) => {
          let executionContext = void 0;
          try {
            executionContext = c.executionCtx;
          } catch {
          }
          return [c.env, executionContext];
        };
        replaceRequest ||= (() => {
          const mergedPath = mergePath(this._basePath, path);
          const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
          return (request) => {
            const url = new URL(request.url);
            url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
            return new Request(url, request);
          };
        })();
        const handler2 = async (c, next) => {
          const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
          if (res) {
            return res;
          }
          await next();
        };
        this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler2);
        return this;
      }
      #addRoute(method, path, handler2, baseRoutePath) {
        method = method.toUpperCase();
        path = mergePath(this._basePath, path);
        const r = {
          basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
          path,
          method,
          handler: handler2
        };
        this.router.add(method, path, [handler2, r]);
        this.routes.push(r);
      }
      #handleError(err, c) {
        if (err instanceof Error) {
          return this.errorHandler(err, c);
        }
        throw err;
      }
      #dispatch(request, executionCtx, env, method) {
        if (method === "HEAD") {
          return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
        }
        const path = this.getPath(request, { env });
        const matchResult = this.router.match(method, path);
        const c = new Context(request, {
          path,
          matchResult,
          env,
          executionCtx,
          notFoundHandler: this.#notFoundHandler
        });
        if (matchResult[0].length === 1) {
          let res;
          try {
            res = matchResult[0][0][0][0](c, async () => {
              c.res = await this.#notFoundHandler(c);
            });
          } catch (err) {
            return this.#handleError(err, c);
          }
          return res instanceof Promise ? res.then(
            (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
          ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
        }
        const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
        return (async () => {
          try {
            const context = await composed(c);
            if (!context.finalized) {
              throw new Error(
                "Context is not finalized. Did you forget to return a Response object or `await next()`?"
              );
            }
            return context.res;
          } catch (err) {
            return this.#handleError(err, c);
          }
        })();
      }
      /**
       * `.fetch()` will be entry point of your app.
       *
       * @see {@link https://hono.dev/docs/api/hono#fetch}
       *
       * @param {Request} request - request Object of request
       * @param {Env} Env - env Object
       * @param {ExecutionContext} - context of execution
       * @returns {Response | Promise<Response>} response of request
       *
       */
      fetch = (request, ...rest) => {
        return this.#dispatch(request, rest[1], rest[0], request.method);
      };
      /**
       * `.request()` is a useful method for testing.
       * You can pass a URL or pathname to send a GET request.
       * app will return a Response object.
       * ```ts
       * test('GET /hello is ok', async () => {
       *   const res = await app.request('/hello')
       *   expect(res.status).toBe(200)
       * })
       * ```
       * @see https://hono.dev/docs/api/hono#request
       */
      request = (input, requestInit, Env, executionCtx) => {
        if (input instanceof Request) {
          return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
        }
        input = input.toString();
        return this.fetch(
          new Request(
            /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
            requestInit
          ),
          Env,
          executionCtx
        );
      };
      /**
       * `.fire()` automatically adds a global fetch event listener.
       * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
       * @deprecated
       * Use `fire` from `hono/service-worker` instead.
       * ```ts
       * import { Hono } from 'hono'
       * import { fire } from 'hono/service-worker'
       *
       * const app = new Hono()
       * // ...
       * fire(app)
       * ```
       * @see https://hono.dev/docs/api/hono#fire
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
       * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
       */
      fire = () => {
        addEventListener("fetch", (event) => {
          event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
        });
      };
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/matcher.js
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = (method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  };
  this.match = match2;
  return match2(method, path);
}
var emptyParam;
var init_matcher = __esm({
  "node_modules/hono/dist/router/reg-exp-router/matcher.js"() {
    init_router();
    emptyParam = [];
  }
});

// node_modules/hono/dist/router/reg-exp-router/node.js
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var LABEL_REG_EXP_STR, ONLY_WILDCARD_REG_EXP_STR, TAIL_WILDCARD_REG_EXP_STR, PATH_ERROR, regExpMetaChars, Node;
var init_node = __esm({
  "node_modules/hono/dist/router/reg-exp-router/node.js"() {
    LABEL_REG_EXP_STR = "[^/]+";
    ONLY_WILDCARD_REG_EXP_STR = ".*";
    TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
    PATH_ERROR = /* @__PURE__ */ Symbol();
    regExpMetaChars = new Set(".\\+*[^]$()");
    Node = class _Node {
      #index;
      #varIndex;
      #children = /* @__PURE__ */ Object.create(null);
      insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
        if (tokens.length === 0) {
          if (this.#index !== void 0) {
            throw PATH_ERROR;
          }
          if (pathErrorCheckOnly) {
            return;
          }
          this.#index = index;
          return;
        }
        const [token, ...restTokens] = tokens;
        const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
        let node;
        if (pattern) {
          const name = pattern[1];
          let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
          if (name && pattern[2]) {
            if (regexpStr === ".*") {
              throw PATH_ERROR;
            }
            regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
            if (/\((?!\?:)/.test(regexpStr)) {
              throw PATH_ERROR;
            }
          }
          node = this.#children[regexpStr];
          if (!node) {
            if (Object.keys(this.#children).some(
              (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
            )) {
              throw PATH_ERROR;
            }
            if (pathErrorCheckOnly) {
              return;
            }
            node = this.#children[regexpStr] = new _Node();
            if (name !== "") {
              node.#varIndex = context.varIndex++;
            }
          }
          if (!pathErrorCheckOnly && name !== "") {
            paramMap.push([name, node.#varIndex]);
          }
        } else {
          node = this.#children[token];
          if (!node) {
            if (Object.keys(this.#children).some(
              (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
            )) {
              throw PATH_ERROR;
            }
            if (pathErrorCheckOnly) {
              return;
            }
            node = this.#children[token] = new _Node();
          }
        }
        node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
      }
      buildRegExpStr() {
        const childKeys = Object.keys(this.#children).sort(compareKey);
        const strList = childKeys.map((k) => {
          const c = this.#children[k];
          return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
        });
        if (typeof this.#index === "number") {
          strList.unshift(`#${this.#index}`);
        }
        if (strList.length === 0) {
          return "";
        }
        if (strList.length === 1) {
          return strList[0];
        }
        return "(?:" + strList.join("|") + ")";
      }
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie;
var init_trie = __esm({
  "node_modules/hono/dist/router/reg-exp-router/trie.js"() {
    init_node();
    Trie = class {
      #context = { varIndex: 0 };
      #root = new Node();
      insert(path, index, pathErrorCheckOnly) {
        const paramAssoc = [];
        const groups = [];
        for (let i = 0; ; ) {
          let replaced = false;
          path = path.replace(/\{[^}]+\}/g, (m) => {
            const mark = `@\\${i}`;
            groups[i] = [mark, m];
            i++;
            replaced = true;
            return mark;
          });
          if (!replaced) {
            break;
          }
        }
        const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
        for (let i = groups.length - 1; i >= 0; i--) {
          const [mark] = groups[i];
          for (let j = tokens.length - 1; j >= 0; j--) {
            if (tokens[j].indexOf(mark) !== -1) {
              tokens[j] = tokens[j].replace(mark, groups[i][1]);
              break;
            }
          }
        }
        this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
        return paramAssoc;
      }
      buildRegExp() {
        let regexp = this.#root.buildRegExpStr();
        if (regexp === "") {
          return [/^$/, [], []];
        }
        let captureIndex = 0;
        const indexReplacementMap = [];
        const paramReplacementMap = [];
        regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
          if (handlerIndex !== void 0) {
            indexReplacementMap[++captureIndex] = Number(handlerIndex);
            return "$()";
          }
          if (paramIndex !== void 0) {
            paramReplacementMap[Number(paramIndex)] = ++captureIndex;
            return "";
          }
          return "";
        });
        return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
      }
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/router.js
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var nullMatcher, wildcardRegExpCache, RegExpRouter;
var init_router2 = __esm({
  "node_modules/hono/dist/router/reg-exp-router/router.js"() {
    init_router();
    init_url();
    init_matcher();
    init_node();
    init_trie();
    nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
    wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
    RegExpRouter = class {
      name = "RegExpRouter";
      #middleware;
      #routes;
      constructor() {
        this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
        this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
      }
      add(method, path, handler2) {
        const middleware = this.#middleware;
        const routes = this.#routes;
        if (!middleware || !routes) {
          throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
        }
        if (!middleware[method]) {
          ;
          [middleware, routes].forEach((handlerMap) => {
            handlerMap[method] = /* @__PURE__ */ Object.create(null);
            Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
              handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
            });
          });
        }
        if (path === "/*") {
          path = "*";
        }
        const paramCount = (path.match(/\/:/g) || []).length;
        if (/\*$/.test(path)) {
          const re = buildWildcardRegExp(path);
          if (method === METHOD_NAME_ALL) {
            Object.keys(middleware).forEach((m) => {
              middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
            });
          } else {
            middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
          }
          Object.keys(middleware).forEach((m) => {
            if (method === METHOD_NAME_ALL || method === m) {
              Object.keys(middleware[m]).forEach((p) => {
                re.test(p) && middleware[m][p].push([handler2, paramCount]);
              });
            }
          });
          Object.keys(routes).forEach((m) => {
            if (method === METHOD_NAME_ALL || method === m) {
              Object.keys(routes[m]).forEach(
                (p) => re.test(p) && routes[m][p].push([handler2, paramCount])
              );
            }
          });
          return;
        }
        const paths = checkOptionalParameter(path) || [path];
        for (let i = 0, len = paths.length; i < len; i++) {
          const path2 = paths[i];
          Object.keys(routes).forEach((m) => {
            if (method === METHOD_NAME_ALL || method === m) {
              routes[m][path2] ||= [
                ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
              ];
              routes[m][path2].push([handler2, paramCount - len + i + 1]);
            }
          });
        }
      }
      match = match;
      buildAllMatchers() {
        const matchers = /* @__PURE__ */ Object.create(null);
        Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
          matchers[method] ||= this.#buildMatcher(method);
        });
        this.#middleware = this.#routes = void 0;
        clearWildcardRegExpCache();
        return matchers;
      }
      #buildMatcher(method) {
        const routes = [];
        let hasOwnRoute = method === METHOD_NAME_ALL;
        [this.#middleware, this.#routes].forEach((r) => {
          const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
          if (ownRoute.length !== 0) {
            hasOwnRoute ||= true;
            routes.push(...ownRoute);
          } else if (method !== METHOD_NAME_ALL) {
            routes.push(
              ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
            );
          }
        });
        if (!hasOwnRoute) {
          return null;
        } else {
          return buildMatcherFromPreprocessedRoutes(routes);
        }
      }
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/prepared-router.js
var init_prepared_router = __esm({
  "node_modules/hono/dist/router/reg-exp-router/prepared-router.js"() {
    init_router();
    init_matcher();
    init_router2();
  }
});

// node_modules/hono/dist/router/reg-exp-router/index.js
var init_reg_exp_router = __esm({
  "node_modules/hono/dist/router/reg-exp-router/index.js"() {
    init_router2();
    init_prepared_router();
  }
});

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter;
var init_router3 = __esm({
  "node_modules/hono/dist/router/smart-router/router.js"() {
    init_router();
    SmartRouter = class {
      name = "SmartRouter";
      #routers = [];
      #routes = [];
      constructor(init) {
        this.#routers = init.routers;
      }
      add(method, path, handler2) {
        if (!this.#routes) {
          throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
        }
        this.#routes.push([method, path, handler2]);
      }
      match(method, path) {
        if (!this.#routes) {
          throw new Error("Fatal error");
        }
        const routers = this.#routers;
        const routes = this.#routes;
        const len = routers.length;
        let i = 0;
        let res;
        for (; i < len; i++) {
          const router = routers[i];
          try {
            for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
              router.add(...routes[i2]);
            }
            res = router.match(method, path);
          } catch (e) {
            if (e instanceof UnsupportedPathError) {
              continue;
            }
            throw e;
          }
          this.match = router.match.bind(router);
          this.#routers = [router];
          this.#routes = void 0;
          break;
        }
        if (i === len) {
          throw new Error("Fatal error");
        }
        this.name = `SmartRouter + ${this.activeRouter.name}`;
        return res;
      }
      get activeRouter() {
        if (this.#routes || this.#routers.length !== 1) {
          throw new Error("No active router has been determined yet.");
        }
        return this.#routers[0];
      }
    };
  }
});

// node_modules/hono/dist/router/smart-router/index.js
var init_smart_router = __esm({
  "node_modules/hono/dist/router/smart-router/index.js"() {
    init_router3();
  }
});

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams, hasChildren, Node2;
var init_node2 = __esm({
  "node_modules/hono/dist/router/trie-router/node.js"() {
    init_router();
    init_url();
    emptyParams = /* @__PURE__ */ Object.create(null);
    hasChildren = (children) => {
      for (const _ in children) {
        return true;
      }
      return false;
    };
    Node2 = class _Node2 {
      #methods;
      #children;
      #patterns;
      #order = 0;
      #params = emptyParams;
      constructor(method, handler2, children) {
        this.#children = children || /* @__PURE__ */ Object.create(null);
        this.#methods = [];
        if (method && handler2) {
          const m = /* @__PURE__ */ Object.create(null);
          m[method] = { handler: handler2, possibleKeys: [], score: 0 };
          this.#methods = [m];
        }
        this.#patterns = [];
      }
      insert(method, path, handler2) {
        this.#order = ++this.#order;
        let curNode = this;
        const parts = splitRoutingPath(path);
        const possibleKeys = [];
        for (let i = 0, len = parts.length; i < len; i++) {
          const p = parts[i];
          const nextP = parts[i + 1];
          const pattern = getPattern(p, nextP);
          const key = Array.isArray(pattern) ? pattern[0] : p;
          if (key in curNode.#children) {
            curNode = curNode.#children[key];
            if (pattern) {
              possibleKeys.push(pattern[1]);
            }
            continue;
          }
          curNode.#children[key] = new _Node2();
          if (pattern) {
            curNode.#patterns.push(pattern);
            possibleKeys.push(pattern[1]);
          }
          curNode = curNode.#children[key];
        }
        curNode.#methods.push({
          [method]: {
            handler: handler2,
            possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
            score: this.#order
          }
        });
        return curNode;
      }
      #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
        for (let i = 0, len = node.#methods.length; i < len; i++) {
          const m = node.#methods[i];
          const handlerSet = m[method] || m[METHOD_NAME_ALL];
          const processedSet = {};
          if (handlerSet !== void 0) {
            handlerSet.params = /* @__PURE__ */ Object.create(null);
            handlerSets.push(handlerSet);
            if (nodeParams !== emptyParams || params && params !== emptyParams) {
              for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
                const key = handlerSet.possibleKeys[i2];
                const processed = processedSet[handlerSet.score];
                handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
                processedSet[handlerSet.score] = true;
              }
            }
          }
        }
      }
      search(method, path) {
        const handlerSets = [];
        this.#params = emptyParams;
        const curNode = this;
        let curNodes = [curNode];
        const parts = splitPath(path);
        const curNodesQueue = [];
        const len = parts.length;
        let partOffsets = null;
        for (let i = 0; i < len; i++) {
          const part = parts[i];
          const isLast = i === len - 1;
          const tempNodes = [];
          for (let j = 0, len2 = curNodes.length; j < len2; j++) {
            const node = curNodes[j];
            const nextNode = node.#children[part];
            if (nextNode) {
              nextNode.#params = node.#params;
              if (isLast) {
                if (nextNode.#children["*"]) {
                  this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
                }
                this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
              } else {
                tempNodes.push(nextNode);
              }
            }
            for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
              const pattern = node.#patterns[k];
              const params = node.#params === emptyParams ? {} : { ...node.#params };
              if (pattern === "*") {
                const astNode = node.#children["*"];
                if (astNode) {
                  this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
                  astNode.#params = params;
                  tempNodes.push(astNode);
                }
                continue;
              }
              const [key, name, matcher] = pattern;
              if (!part && !(matcher instanceof RegExp)) {
                continue;
              }
              const child = node.#children[key];
              if (matcher instanceof RegExp) {
                if (partOffsets === null) {
                  partOffsets = new Array(len);
                  let offset = path[0] === "/" ? 1 : 0;
                  for (let p = 0; p < len; p++) {
                    partOffsets[p] = offset;
                    offset += parts[p].length + 1;
                  }
                }
                const restPathString = path.substring(partOffsets[i]);
                const m = matcher.exec(restPathString);
                if (m) {
                  params[name] = m[0];
                  this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
                  if (hasChildren(child.#children)) {
                    child.#params = params;
                    const componentCount = m[0].match(/\//)?.length ?? 0;
                    const targetCurNodes = curNodesQueue[componentCount] ||= [];
                    targetCurNodes.push(child);
                  }
                  continue;
                }
              }
              if (matcher === true || matcher.test(part)) {
                params[name] = part;
                if (isLast) {
                  this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
                  if (child.#children["*"]) {
                    this.#pushHandlerSets(
                      handlerSets,
                      child.#children["*"],
                      method,
                      params,
                      node.#params
                    );
                  }
                } else {
                  child.#params = params;
                  tempNodes.push(child);
                }
              }
            }
          }
          const shifted = curNodesQueue.shift();
          curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
        }
        if (handlerSets.length > 1) {
          handlerSets.sort((a, b) => {
            return a.score - b.score;
          });
        }
        return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
      }
    };
  }
});

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter;
var init_router4 = __esm({
  "node_modules/hono/dist/router/trie-router/router.js"() {
    init_url();
    init_node2();
    TrieRouter = class {
      name = "TrieRouter";
      #node;
      constructor() {
        this.#node = new Node2();
      }
      add(method, path, handler2) {
        const results = checkOptionalParameter(path);
        if (results) {
          for (let i = 0, len = results.length; i < len; i++) {
            this.#node.insert(method, results[i], handler2);
          }
          return;
        }
        this.#node.insert(method, path, handler2);
      }
      match(method, path) {
        return this.#node.search(method, path);
      }
    };
  }
});

// node_modules/hono/dist/router/trie-router/index.js
var init_trie_router = __esm({
  "node_modules/hono/dist/router/trie-router/index.js"() {
    init_router4();
  }
});

// node_modules/hono/dist/hono.js
var Hono2;
var init_hono = __esm({
  "node_modules/hono/dist/hono.js"() {
    init_hono_base();
    init_reg_exp_router();
    init_smart_router();
    init_trie_router();
    Hono2 = class extends Hono {
      /**
       * Creates an instance of the Hono class.
       *
       * @param options - Optional configuration options for the Hono instance.
       */
      constructor(options = {}) {
        super(options);
        this.router = options.router ?? new SmartRouter({
          routers: [new RegExpRouter(), new TrieRouter()]
        });
      }
    };
  }
});

// node_modules/hono/dist/index.js
var init_dist = __esm({
  "node_modules/hono/dist/index.js"() {
    init_hono();
    init_context();
  }
});

// src/parsers/yaml-parser.ts
import yaml from "js-yaml";
function parseClashYaml(content) {
  if (content.length > 2 * 1024 * 1024) {
    throw new Error("\u8BA2\u9605\u914D\u7F6E\u8FC7\u5927");
  }
  let parsed;
  try {
    parsed = yaml.load(content, { json: false });
  } catch {
    throw new Error("\u8BA2\u9605\u4E0D\u662F\u6709\u6548\u7684 YAML \u914D\u7F6E");
  }
  if (!isRecord(parsed)) {
    throw new Error("\u8BA2\u9605\u914D\u7F6E\u5FC5\u987B\u662F YAML \u5BF9\u8C61");
  }
  const proxies = parseProxies(parsed.proxies);
  if (proxies.length === 0) {
    throw new Error("\u8BA2\u9605\u4E2D\u672A\u627E\u5230\u6709\u6548\u4EE3\u7406\u8282\u70B9");
  }
  const result = { ...parsed, proxies };
  if (parsed["proxy-groups"] !== void 0) {
    result["proxy-groups"] = parseProxyGroups(parsed["proxy-groups"]);
  }
  if (parsed.rules !== void 0) {
    if (!Array.isArray(parsed.rules) || !parsed.rules.every((value) => typeof value === "string")) {
      throw new Error("\u8BA2\u9605 rules \u5B57\u6BB5\u683C\u5F0F\u65E0\u6548");
    }
    result.rules = parsed.rules;
  }
  return result;
}
function parseProxies(value) {
  if (!Array.isArray(value)) return [];
  const proxies = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = item.name;
    const type = item.type;
    const server = item.server;
    const port = item.port;
    if (typeof name !== "string" || !name.trim() || typeof type !== "string" || !SUPPORTED_PROXY_TYPES.has(type.toLowerCase()) || typeof server !== "string" || !server.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      continue;
    }
    proxies.push({ ...item, name, type: type.toLowerCase(), server, port });
  }
  return proxies;
}
function parseProxyGroups(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    if (typeof item.name !== "string" || !item.name.trim() || typeof item.type !== "string") return [];
    const proxies = Array.isArray(item.proxies) ? item.proxies.filter((proxy) => typeof proxy === "string") : [];
    return [{ ...item, name: item.name, type: item.type, proxies }];
  });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var SUPPORTED_PROXY_TYPES;
var init_yaml_parser = __esm({
  "src/parsers/yaml-parser.ts"() {
    "use strict";
    SUPPORTED_PROXY_TYPES = /* @__PURE__ */ new Set([
      "ss",
      "ssr",
      "vmess",
      "vless",
      "trojan",
      "hysteria2",
      "http",
      "socks5",
      "snell",
      "tuic"
    ]);
  }
});

// src/parsers/ini-parser.ts
function parseIniConfig(content) {
  const lines = content.split("\n").map((line) => line.trim());
  const rulesetEntries = [];
  const customProxyGroups = [];
  let enableRuleGenerator = false;
  let overwriteOriginalRules = false;
  for (const line of lines) {
    if (!line || line.startsWith(";") || line.startsWith("#") || line.startsWith("//")) {
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      continue;
    }
    if (line.startsWith("ruleset=")) {
      const value = line.substring("ruleset=".length);
      const parsed = parseRulesetValue(value);
      if (parsed) {
        rulesetEntries.push(parsed);
      }
      continue;
    }
    if (line.startsWith("custom_proxy_group=")) {
      const value = line.substring("custom_proxy_group=".length);
      const parsed = parseCustomProxyGroup(value);
      if (parsed) {
        customProxyGroups.push(parsed);
      }
      continue;
    }
    if (line.startsWith("enable_rule_generator=")) {
      enableRuleGenerator = line.substring("enable_rule_generator=".length).toLowerCase() === "true";
      continue;
    }
    if (line.startsWith("overwrite_original_rules=")) {
      overwriteOriginalRules = line.substring("overwrite_original_rules=".length).toLowerCase() === "true";
      continue;
    }
  }
  return {
    rulesetEntries,
    customProxyGroups,
    enableRuleGenerator,
    overwriteOriginalRules
  };
}
function parseRulesetValue(value) {
  const firstComma = value.indexOf(",");
  if (firstComma === -1) return null;
  const groupName = value.substring(0, firstComma).trim();
  const rest = value.substring(firstComma + 1).trim();
  if (rest.startsWith("[]")) {
    const specialPart = rest.substring(2);
    if (specialPart === "FINAL") {
      return {
        groupName,
        url: rest,
        isSpecial: true,
        specialType: "FINAL"
      };
    }
    if (specialPart.startsWith("GEOIP,")) {
      return {
        groupName,
        url: rest,
        isSpecial: true,
        specialType: "GEOIP",
        specialValue: specialPart.substring("GEOIP,".length)
      };
    }
  }
  return {
    groupName,
    url: rest
    // 远程规则集 URL
  };
}
function parseCustomProxyGroup(value) {
  const parts = value.split("`");
  if (parts.length < 3) return null;
  const name = parts[0].trim();
  const groupType = parts[1].trim().toLowerCase();
  const proxies = [];
  let url;
  let interval;
  for (let i = 2; i < parts.length; i++) {
    const token = parts[i].trim();
    if (!token) continue;
    if (/^\d+$/.test(token) && i === parts.length - 1) {
      interval = parseInt(token, 10);
      continue;
    }
    if (token.includes("://") || /^https?:/i.test(token)) {
      url = token;
      continue;
    }
    if (token.startsWith("[]")) {
      proxies.push(token.substring(2));
    } else if (token === ".*" || token.startsWith(".*")) {
      proxies.push(token);
    } else if (token === "DIRECT" || token === "REJECT" || token === "REJECT-TLS") {
      proxies.push(token);
    } else {
      proxies.push(token);
    }
  }
  return {
    name,
    groupType,
    proxies,
    url: url || void 0,
    interval
  };
}
function expandPlaceholderProxies(groups, allProxyNames) {
  return groups.map((group) => {
    const seen = /* @__PURE__ */ new Set();
    const expanded = [];
    for (const proxy of group.proxies) {
      if (proxy === ".*" || proxy.startsWith(".*")) {
        for (const name of allProxyNames) {
          if (!seen.has(name)) {
            expanded.push(name);
            seen.add(name);
          }
        }
      } else if (/^\(.+\)$/.test(proxy)) {
        let pattern = proxy.slice(1, -1);
        let flags = "";
        pattern = pattern.replace(/^\(\?([ims]+)\)/, function(_, f) {
          flags = f.replace("s", "");
          return "";
        });
        try {
          const regex = new RegExp(pattern, flags);
          for (const name of allProxyNames) {
            if (!seen.has(name) && regex.test(name)) {
              expanded.push(name);
              seen.add(name);
            }
          }
        } catch {
          expanded.push(proxy);
        }
      } else {
        expanded.push(proxy);
      }
    }
    return { ...group, proxies: expanded };
  });
}
var init_ini_parser = __esm({
  "src/parsers/ini-parser.ts"() {
    "use strict";
  }
});

// src/utils/node-utils.ts
function prepareNodes(nodes, params) {
  let filtered = [...nodes];
  if (params.include) {
    const regex = new RegExp(params.include);
    filtered = filtered.filter((node) => regex.test(node.name));
  }
  if (params.exclude) {
    const regex = new RegExp(params.exclude);
    filtered = filtered.filter((node) => !regex.test(node.name));
  }
  if (params.sort) filtered.sort((a, b) => a.name.localeCompare(b.name));
  const renameRules = parseRenameRules(params.rename);
  const displayNames = /* @__PURE__ */ new Map();
  const renamed = [];
  const seen = /* @__PURE__ */ new Set();
  for (const original of filtered) {
    if (seen.has(original.name)) continue;
    seen.add(original.name);
    let name = original.name;
    for (const rule of renameRules) {
      name = name.replace(rule.pattern, rule.replacement);
    }
    const renamedNode = name === original.name ? original : { ...original, name };
    const displayName = getDisplayName(renamedNode, params);
    displayNames.set(original.name, displayName);
    renamed.push({ ...renamedNode, name: displayName });
  }
  return { nodes: renamed, displayNames, allNames: [...displayNames.values()] };
}
function getDisplayName(node, params) {
  let name = node.name;
  if (params.emoji === false) name = name.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").trim();
  if (params.append_type) name = `[${node.type.toUpperCase()}] ${name}`;
  return name;
}
function mapNodeReference(name, displayNames) {
  return displayNames.get(name) || name;
}
function parseClashRule(rule) {
  const parts = rule.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase();
  const noResolve = parts[parts.length - 1].toLowerCase() === "no-resolve";
  const body = noResolve ? parts.slice(0, -1) : parts;
  const hasTarget = body.length >= 3;
  const target = hasTarget ? body[body.length - 1] : "DIRECT";
  const valueParts = hasTarget ? body.slice(1, -1) : body.slice(1);
  return { type, value: valueParts.join(",").trim(), target, noResolve };
}
function parseRenameRules(value) {
  if (!value) return [];
  const rawRules = value.split(/\r?\n/).map((rule) => rule.trim()).filter(Boolean);
  const rules = rawRules.length > 1 ? rawRules : value.split("|").map((rule) => rule.trim()).filter(Boolean);
  return rules.flatMap((rule) => {
    const index = rule.lastIndexOf("@");
    if (index <= 0) return [];
    try {
      return [{ pattern: new RegExp(rule.slice(0, index)), replacement: rule.slice(index + 1) }];
    } catch {
      return [];
    }
  });
}
var init_node_utils = __esm({
  "src/utils/node-utils.ts"() {
    "use strict";
  }
});

// src/generators/clash.ts
function generateClashConfig(sourceConfig, iniConfig, params, ruleContents) {
  const lines = [];
  lines.push("# ====================================");
  lines.push("# Prism - \u8BA2\u9605\u8F6C\u6362\u5DE5\u5177");
  lines.push("# ====================================");
  lines.push("");
  const prepared = prepareNodes(sourceConfig.proxies, params);
  const allNodes = prepared.nodes;
  const allNodeNames = prepared.allNames;
  const nodeNameMap = prepared.displayNames;
  const RESERVED_KEYS = /* @__PURE__ */ new Set(["proxies", "proxy-groups", "rules", "dns", "hosts"]);
  for (const [key, value] of Object.entries(sourceConfig)) {
    if (value === void 0 || value === null) continue;
    if (!RESERVED_KEYS.has(key)) {
      emitYamlKeyValue(lines, key, value, 0);
      continue;
    }
    if (key === "proxies") {
      lines.push("proxies:");
      for (const node of allNodes) {
        lines.push(formatClashProxy(node, params));
      }
      lines.push(`# \u5171 ${allNodes.length} \u4E2A\u4EE3\u7406\u8282\u70B9`);
      continue;
    }
    if (key === "proxy-groups") {
      if (params.config) {
        lines.push("proxy-groups:");
        const groups = expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames);
        for (const g of groups) {
          writeProxyGroup(
            lines,
            g.groupType || "select",
            g.name,
            g.proxies,
            g.url,
            g.interval,
            allNodeNames,
            iniConfig.customProxyGroups.map((og) => og.name),
            nodeNameMap
          );
        }
      } else if (Array.isArray(value) && value.length > 0) {
        lines.push("proxy-groups:");
        const groups = value;
        for (const g of groups) {
          writeProxyGroup(
            lines,
            g.type || "select",
            g.name,
            g.proxies,
            g.url,
            g.interval,
            allNodeNames,
            groups.map((og) => og.name),
            nodeNameMap
          );
        }
      }
      continue;
    }
    if (key === "rules") {
      if (iniConfig.rulesetEntries.length > 0) {
        if (params.expand !== false) {
          lines.push("rules:");
          if (!iniConfig.overwriteOriginalRules && Array.isArray(value)) {
            for (const rule of value) lines.push(`  - ${formatRule(rule)}`);
          }
          for (const entry of iniConfig.rulesetEntries) {
            if (entry.isSpecial) {
              if (entry.specialType === "GEOIP") {
                lines.push(`  - GEOIP,${entry.specialValue},${entry.groupName}`);
              } else if (entry.specialType === "FINAL") {
                lines.push(`  - MATCH,${entry.groupName}`);
              }
            } else {
              const content = ruleContents[entry.url];
              if (content && content.length > 0) {
                for (const rule of content) {
                  if (!rule || rule.startsWith("#")) continue;
                  if (rule.startsWith("URL-REGEX")) continue;
                  const parts = rule.split(",");
                  const last = parts[parts.length - 1]?.trim();
                  if (last === "no-resolve" && parts.length >= 3) {
                    const base = parts.slice(0, -1).join(",");
                    lines.push(`  - ${formatRule(`${base},${entry.groupName},no-resolve`)}`);
                  } else {
                    lines.push(`  - ${formatRule(`${rule},${entry.groupName}`)}`);
                  }
                }
              } else {
                lines.push(`  # \u26A0 \u89C4\u5219\u96C6\u4E0B\u8F7D\u5931\u8D25: ${entry.groupName}`);
              }
            }
          }
        } else {
          lines.push("rule-providers:");
          for (const entry of iniConfig.rulesetEntries) {
            if (!entry.isSpecial && entry.url) {
              const pn = sanitizeProviderName(entry.groupName);
              lines.push(`  ${pn}:`);
              lines.push(`    type: http`);
              lines.push(`    behavior: domain`);
              lines.push(`    url: "${esc(entry.url)}"`);
              lines.push(`    interval: 86400`);
            }
          }
          lines.push("rules:");
          for (const entry of iniConfig.rulesetEntries) {
            if (entry.isSpecial) {
              if (entry.specialType === "GEOIP") {
                lines.push(`  - GEOIP,${entry.specialValue},${entry.groupName}`);
              } else if (entry.specialType === "FINAL") {
                lines.push(`  - MATCH,${entry.groupName}`);
              }
            } else {
              const pn = sanitizeProviderName(entry.groupName);
              lines.push(`  - RULE-SET,${pn},${entry.groupName}`);
            }
          }
        }
      } else if (Array.isArray(value) && value.length > 0) {
        lines.push("rules:");
        for (const rule of value) {
          lines.push(`  - ${formatRule(rule)}`);
        }
      }
      continue;
    }
    if (key === "dns") {
      if (typeof value === "object" && value !== null && Object.keys(value).length > 0) {
        lines.push("dns:");
        for (const [dk, dv] of Object.entries(value)) {
          emitYamlKeyValue(lines, dk, dv, 2);
        }
      }
      continue;
    }
    if (key === "hosts") {
      const hosts = value;
      if (hosts && Object.keys(hosts).length > 0) {
        lines.push("hosts:");
        for (const [domain, ip] of Object.entries(hosts)) {
          if (typeof ip === "string") {
            lines.push(`  '${domain.replace(/'/g, "''")}': "${esc(ip)}"`);
          } else {
            emitYamlKeyValue(lines, `'${domain}'`, ip, 2);
          }
        }
      }
      continue;
    }
  }
  return lines.join("\n");
}
function getNodeDisplayName(node, _params) {
  return node.name;
}
function formatClashProxy(node, params) {
  const kv = [];
  const name = getNodeDisplayName(node, params);
  kv.push(`name: "${esc(name)}"`);
  kv.push(`type: ${node.type}`);
  kv.push(`server: "${esc(node.server)}"`);
  kv.push(`port: ${node.port}`);
  if (node.cipher) kv.push(`cipher: ${node.cipher}`);
  if (node.password) kv.push(`password: "${esc(node.password)}"`);
  if (node.uuid) kv.push(`uuid: "${esc(String(node.uuid))}"`);
  if (node.plugin) {
    kv.push(`plugin: ${node.plugin}`);
    if (node["plugin-opts"]) {
      const opts = Object.entries(node["plugin-opts"]).map(([k, v]) => `${safeKey(k)}: "${esc(String(v))}"`).join(", ");
      kv.push(`plugin-opts: {${opts}}`);
    }
  }
  if (node.udp) kv.push("udp: true");
  if (node.tfo || params.tfo) kv.push("tfo: true");
  if (params.udp && !node.udp) kv.push("udp: true");
  if (node["skip-cert-verify"] || params.scv) kv.push("skip-cert-verify: true");
  if (node.sni) kv.push(`sni: "${esc(node.sni)}"`);
  if (node.alpn) {
    const arr = Array.isArray(node.alpn) ? node.alpn : String(node.alpn).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    kv.push(`alpn: [${arr.map((a) => `"${esc(a)}"`).join(", ")}]`);
  }
  if (params.tls13) kv.push("client-fingerprint: chrome");
  const skip = /* @__PURE__ */ new Set(["name", "type", "server", "port", "cipher", "password", "uuid", "plugin", "plugin-opts", "udp", "tfo", "skip-cert-verify", "sni", "alpn"]);
  if (params.tls13) skip.add("client-fingerprint");
  for (const [k, v] of Object.entries(node)) {
    if (skip.has(k)) continue;
    if (typeof v === "boolean") kv.push(`${safeKey(k)}: ${v}`);
    else if (typeof v === "number") kv.push(`${safeKey(k)}: ${v}`);
    else if (typeof v === "string") kv.push(`${safeKey(k)}: "${esc(v)}"`);
  }
  return `  - { ${kv.join(", ")} }`;
}
function sanitizeProviderName(name) {
  return name.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "_") || "provider";
}
function writeProxyGroup(lines, groupType, name, proxies, url, interval, allNodeNames, groupNames, nodeNameMap) {
  let filtered = proxies.filter(
    (p) => p === "DIRECT" || p === "REJECT" || p === "REJECT-TLS" || allNodeNames.includes(p) || groupNames.includes(p) || nodeNameMap && nodeNameMap.has(p)
  );
  if (filtered.length === 0) filtered = ["DIRECT"];
  if (nodeNameMap) filtered = filtered.map((p) => nodeNameMap.get(p) || p);
  const parts = [];
  parts.push(`name: "${esc(name)}"`);
  parts.push(`type: ${groupType}`);
  parts.push(`proxies: [${filtered.map((p) => `"${esc(p)}"`).join(", ")}]`);
  if ((groupType === "url-test" || groupType === "fallback") && url) {
    parts.push(`url: "${esc(url)}"`);
    parts.push(`interval: ${interval || 300}`);
  }
  lines.push(`  - { ${parts.join(", ")} }`);
}
function esc(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}
function formatRule(rule) {
  if (/:\s|\s#|[\n\r\t]/.test(rule)) {
    return `"${esc(rule)}"`;
  }
  return rule;
}
function safeKey(key) {
  if (/^[*&!{}[\]>|%@`"'?#-]/.test(key) || /[:#\s]/.test(key)) {
    return `"${esc(key)}"`;
  }
  return key;
}
function emitYamlKeyValue(lines, key, value, indent) {
  const pad = " ".repeat(indent);
  const safe = safeKey(key);
  if (typeof value === "string") {
    lines.push(`${pad}${safe}: "${esc(value)}"`);
  } else if (typeof value === "boolean") {
    lines.push(`${pad}${safe}: ${value}`);
  } else if (typeof value === "number") {
    lines.push(`${pad}${safe}: ${value}`);
  } else if (Array.isArray(value)) {
    lines.push(`${pad}${safe}:`);
    for (const item of value) {
      if (typeof item === "string") {
        lines.push(`${pad}  - "${esc(item)}"`);
      } else if (typeof item === "object" && item !== null) {
        const entries = Object.entries(item);
        if (entries.length > 0) {
          const [fk, fv] = entries[0];
          emitYamlKeyValue(lines, `- ${safeKey(fk)}`, fv, indent);
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i];
            emitYamlKeyValue(lines, `  ${safeKey(k)}`, v, indent);
          }
        }
      } else {
        lines.push(`${pad}  - ${item}`);
      }
    }
  } else if (typeof value === "object" && value !== null) {
    lines.push(`${pad}${safe}:`);
    for (const [k, v] of Object.entries(value)) {
      emitYamlKeyValue(lines, k, v, indent + 2);
    }
  } else {
    lines.push(`${pad}${safe}: ${value}`);
  }
}
var init_clash = __esm({
  "src/generators/clash.ts"() {
    "use strict";
    init_ini_parser();
    init_node_utils();
  }
});

// src/generators/singbox.ts
function generateSingboxConfig(sourceConfig, iniConfig, params, ruleContents) {
  const config = {
    log: { level: "info" },
    dns: convertSingboxDns(sourceConfig)
  };
  const inPort = sourceConfig.port || sourceConfig["mixed-port"] || 2080;
  config.inbounds = [
    {
      type: "mixed",
      tag: "mixed-in",
      listen: "127.0.0.1",
      listen_port: inPort
    }
  ];
  const prepared = prepareNodes(sourceConfig.proxies, params);
  const allNodes = prepared.nodes;
  const allNodeNames = prepared.allNames;
  const nodeNameMap = prepared.displayNames;
  const outbounds = [];
  outbounds.push({ type: "direct", tag: "DIRECT" });
  outbounds.push({ type: "block", tag: "REJECT" });
  for (const node of allNodes) {
    const outbound = convertNodeToSingboxOutbound(node, params);
    if (outbound) {
      outbounds.push(outbound);
    }
  }
  config.outbounds = outbounds;
  const rules = [];
  if (params.config && iniConfig.rulesetEntries.length > 0) {
    const expandedGroups = expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames);
    for (const group of expandedGroups) {
      const members = group.proxies.filter((p) => allNodeNames.includes(p) || nodeNameMap.has(p) || ["DIRECT", "REJECT"].includes(p)).map((p) => mapNodeReference(p, nodeNameMap));
      if (members.length === 0) continue;
      const tag = group.name;
      if (group.groupType === "url-test") {
        outbounds.push({
          type: "urltest",
          tag,
          outbounds: members,
          url: group.url || "http://www.gstatic.com/generate_204",
          interval: group.interval ? `${group.interval}s` : "300s"
        });
      } else {
        outbounds.push({
          type: "selector",
          tag,
          outbounds: members.length > 1 ? members : [...members, "DIRECT"],
          default: members[0]
        });
      }
    }
    for (const entry of iniConfig.rulesetEntries) {
      if (entry.isSpecial && entry.specialType === "FINAL") {
        rules.push({ outbound: entry.groupName });
        continue;
      }
      if (entry.isSpecial && entry.specialType === "GEOIP") {
        rules.push({ geoip: entry.specialValue?.toLowerCase(), outbound: entry.groupName });
        continue;
      }
      const content = ruleContents[entry.url];
      if (content && content.length > 0) {
        for (const rule of content) {
          const singboxRule = convertRuleToSingbox(rule);
          if (singboxRule) {
            rules.push({ ...singboxRule, outbound: entry.groupName });
          }
        }
      }
    }
  } else {
    for (const rule of sourceConfig.rules || []) {
      const singboxRule = convertRuleToSingbox(rule);
      if (singboxRule) {
        const parsedRule = parseClashRule(rule);
        const target = parsedRule?.target || "DIRECT";
        rules.push({ ...singboxRule, outbound: mapNodeReference(target, nodeNameMap) });
      }
    }
  }
  if (rules.length > 0) {
    config.route = { rules, auto_detect_interface: true };
  }
  return JSON.stringify(config, null, 2);
}
function convertNodeToSingboxOutbound(node, params) {
  const singboxType = SINGBOX_TYPE_MAP[node.type];
  if (!singboxType) return null;
  const displayName = node.name;
  const outbound = {
    type: singboxType,
    tag: displayName,
    server: node.server,
    server_port: node.port
  };
  switch (node.type) {
    case "ss":
      outbound.method = node.cipher || "aes-128-gcm";
      outbound.password = node.password || "";
      if (node.plugin === "obfs" && node["plugin-opts"]) {
        const opts = node["plugin-opts"];
        outbound.plugin = "obfs-local";
        outbound.plugin_opts = `${opts.mode || "http"};obfs-host=${opts.host || ""}`;
      }
      break;
    case "trojan":
      outbound.password = node.password || "";
      break;
    case "vmess":
    case "vless":
      outbound.uuid = node.uuid || "";
      break;
  }
  if (params.scv || node["skip-cert-verify"]) {
    (outbound.tls || (outbound.tls = {}))["insecure"] = true;
  }
  if (node.sni) {
    (outbound.tls || (outbound.tls = {}))["server_name"] = node.sni;
  }
  return outbound;
}
function convertRuleToSingbox(rule) {
  const parsed = parseClashRule(rule);
  if (!parsed) return null;
  const ruleType = parsed.type;
  const value = parsed.value;
  switch (ruleType) {
    case "DOMAIN-SUFFIX":
      return { domain_suffix: value };
    case "DOMAIN":
      return { domain: value };
    case "DOMAIN-KEYWORD":
      return { domain_keyword: value };
    case "DOMAIN-REGEX":
      return { domain_regex: value };
    case "IP-CIDR":
      return { ip_cidr: value };
    case "IP-CIDR6":
      return { ip_cidr: value };
    case "GEOIP":
      return { geoip: value.toLowerCase() };
    case "PROCESS-NAME":
      return { process_name: value };
    default:
      return null;
  }
}
function convertSingboxDns(config) {
  if (config.dns) return config.dns;
  return {
    servers: [
      { tag: "remote", address: "tls://1.1.1.1/dns-query" },
      { tag: "remote-backup", address: "tls://dns.google/dns-query" }
    ],
    rules: [
      { outbound: "any", server: "remote" }
    ]
  };
}
var SINGBOX_TYPE_MAP;
var init_singbox = __esm({
  "src/generators/singbox.ts"() {
    "use strict";
    init_ini_parser();
    init_node_utils();
    SINGBOX_TYPE_MAP = {
      ss: "shadowsocks",
      ssr: "shadowsocksr",
      vmess: "vmess",
      vless: "vless",
      trojan: "trojan",
      hysteria2: "hysteria2",
      http: "http",
      socks5: "socks",
      snell: "snell",
      tuic: "tuic"
    };
  }
});

// src/generators/surge.ts
function generateSurgeConfig(sourceConfig, iniConfig, params, ruleContents) {
  const lines = [];
  lines.push("# ====================================");
  lines.push("# Prism - \u8BA2\u9605\u8F6C\u6362\u5DE5\u5177 (Surge)");
  lines.push("# ====================================");
  lines.push("");
  lines.push("[General]");
  if (sourceConfig["log-level"]) {
    lines.push(`loglevel = ${sourceConfig["log-level"]}`);
  }
  if (sourceConfig["external-controller"]) {
    lines.push(`external-controller-access = ${sourceConfig["external-controller"]}`);
  }
  lines.push("");
  lines.push("[Proxy]");
  const prepared = prepareNodes(sourceConfig.proxies, params);
  const allNodes = prepared.nodes;
  const nodeNameMap = prepared.displayNames;
  for (const node of allNodes) {
    const surgeProxy = convertNodeToSurgeProxy(node, params);
    if (surgeProxy) {
      lines.push(surgeProxy);
    }
  }
  lines.push("");
  const allNodeNames = prepared.allNames;
  if (params.config && iniConfig.customProxyGroups.length > 0) {
    const groups = expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames);
    lines.push("[Proxy Group]");
    for (const group of groups) {
      const groupType = mapSurgeGroupType(group.groupType);
      const validProxies = group.proxies.filter((p) => p === "DIRECT" || p === "REJECT" || p === "REJECT-TLS" || allNodeNames.includes(p) || nodeNameMap.has(p) || groups.some((g) => g.name === p)).map((p) => mapNodeReference(p, nodeNameMap));
      const proxyStr = validProxies.join(", ");
      if ((group.groupType === "url-test" || group.groupType === "fallback") && group.url) {
        lines.push(`${group.name} = ${groupType}, ${proxyStr}, url = ${group.url}, interval = ${group.interval || 300}`);
      } else {
        lines.push(`${group.name} = ${groupType}, ${proxyStr}`);
      }
    }
    lines.push("");
  } else if (sourceConfig["proxy-groups"] && sourceConfig["proxy-groups"].length > 0) {
    lines.push("[Proxy Group]");
    for (const group of sourceConfig["proxy-groups"]) {
      const groupType = mapSurgeGroupType(group.type || "select");
      const proxies = (group.proxies || []).map((proxy) => mapNodeReference(proxy, nodeNameMap)).join(", ");
      if (!proxies) continue;
      lines.push(`${group.name} = ${groupType}, ${proxies}`);
    }
    lines.push("");
  }
  if (params.config && iniConfig.rulesetEntries.length > 0) {
    lines.push("[Rule]");
    for (const entry of iniConfig.rulesetEntries) {
      if (entry.isSpecial) {
        if (entry.specialType === "GEOIP" && entry.specialValue) {
          lines.push(`GEOIP,${entry.specialValue},${entry.groupName}`);
        } else if (entry.specialType === "FINAL") {
          lines.push(`FINAL,${entry.groupName}`);
        }
      } else {
        const content = ruleContents[entry.url];
        if (content) {
          for (const rule of content) {
            if (!rule || rule.startsWith("#")) continue;
            const converted = convertRuleToSurge(rule);
            if (converted) {
              lines.push(`${converted},${entry.groupName}`);
            }
          }
        }
      }
    }
    lines.push("");
  } else if (sourceConfig.rules && sourceConfig.rules.length > 0) {
    lines.push("[Rule]");
    for (const rule of sourceConfig.rules) {
      if (!rule || rule.startsWith("#")) continue;
      const converted = convertRuleToSurge(rule);
      if (converted) {
        const parsedRule = parseClashRule(rule);
        const target = parsedRule?.target || "DIRECT";
        lines.push(`${converted},${mapNodeReference(target, nodeNameMap)}`);
      }
    }
    lines.push("");
  }
  lines.push("[URL Rewrite]");
  lines.push("# \u65E0\u7279\u5B9A\u7684 URL Rewrite \u89C4\u5219");
  lines.push("");
  lines.push("[MITM]");
  lines.push("# \u672A\u542F\u7528 MITM");
  lines.push("");
  return lines.join("\n");
}
function convertNodeToSurgeProxy(node, params) {
  const safeName = node.name.replace(/[,=]/g, "\\$&");
  switch (node.type) {
    case "ss": {
      const obfs = node.plugin === "obfs" && node["plugin-opts"] ? `, obfs=${node["plugin-opts"].mode || "http"}, obfs-host=${node["plugin-opts"].host || ""}` : "";
      let extra = "";
      if (params.tfo) extra += ", tfo=true";
      if (params.udp || node.udp) extra += ", udp-relay=true";
      return `${safeName} = ss, ${node.server}, ${node.port}, encrypt-method=${node.cipher || "aes-128-gcm"}, password=${node.password || ""}${obfs}${extra}`;
    }
    case "trojan": {
      let extra = "";
      if (node.sni) extra += `, sni=${node.sni}`;
      if (params.scv || node["skip-cert-verify"]) extra += ", skip-cert-verify=true";
      if (params.tfo) extra += ", tfo=true";
      if (params.udp || node.udp) extra += ", udp-relay=true";
      return `${safeName} = trojan, ${node.server}, ${node.port}, password=${node.password || ""}${extra}`;
    }
    case "vmess": {
      let extra = "";
      if (node.network === "ws") {
        extra += ", ws=true";
        if (node["ws-opts"]?.path) extra += `, ws-path=${node["ws-opts"].path}`;
        if (node["ws-opts"]?.headers && node["ws-opts"].headers["Host"]) extra += `, sni=${node["ws-opts"].headers["Host"]}`;
      } else if (node.network === "grpc") {
        extra += ", tls=true";
      } else if (node.network === "h2") {
        extra += ", tls=true";
      }
      if (node.tls && node.network !== "ws") extra += ", tls=true";
      if (params.tfo) extra += ", tfo=true";
      if (params.udp || node.udp) extra += ", udp-relay=true";
      return `${safeName} = vmess, ${node.server}, ${node.port}, username=${node.uuid || ""}${extra}`;
    }
    case "vless": {
      let extra = "";
      if (params.tfo) extra += ", tfo=true";
      if (params.udp || node.udp) extra += ", udp-relay=true";
      return `${safeName} = vless, ${node.server}, ${node.port}, username=${node.uuid || ""}${extra}`;
    }
    case "http":
      return `${safeName} = http, ${node.server}, ${node.port}${node.username ? `, username=${node.username}` : ""}${node.password ? `, password=${node.password}` : ""}`;
    case "socks5":
      return `${safeName} = socks5, ${node.server}, ${node.port}${node.username ? `, username=${node.username}` : ""}${node.password ? `, password=${node.password}` : ""}`;
    default:
      console.warn(`[Surge] \u4E0D\u652F\u6301\u7684\u8282\u70B9\u7C7B\u578B: ${node.type} (${node.name})\uFF0C\u5DF2\u8DF3\u8FC7`);
      return null;
  }
}
function mapSurgeGroupType(groupType) {
  switch (groupType) {
    case "url-test":
      return "url-test";
    case "fallback":
      return "fallback";
    case "load-balance":
      return "load-balance";
    default:
      return "select";
  }
}
function convertRuleToSurge(rule) {
  const parsed = parseClashRule(rule);
  if (!parsed) return null;
  const ruleType = parsed.type;
  const value = parsed.value;
  switch (ruleType) {
    case "DOMAIN-SUFFIX":
      return `DOMAIN-SUFFIX,${value}`;
    case "DOMAIN":
      return `DOMAIN,${value}`;
    case "DOMAIN-KEYWORD":
      return `DOMAIN-KEYWORD,${value}`;
    case "IP-CIDR":
      return `IP-CIDR,${value}`;
    case "IP-CIDR6":
      return `IP-CIDR6,${value}`;
    case "GEOIP":
      return `GEOIP,${value}`;
    case "PROCESS-NAME":
      return `PROCESS-NAME,${value}`;
    case "USER-AGENT":
      return `USER-AGENT,${value}`;
    default:
      return null;
  }
}
var init_surge = __esm({
  "src/generators/surge.ts"() {
    "use strict";
    init_ini_parser();
    init_node_utils();
  }
});

// src/utils/types.ts
var DEFAULT_PARAMS;
var init_types = __esm({
  "src/utils/types.ts"() {
    "use strict";
    DEFAULT_PARAMS = {
      target: "clash",
      url: "",
      emoji: true,
      append_type: false,
      tfo: false,
      udp: false,
      sort: false,
      scv: false,
      expand: true,
      tls13: false
    };
  }
});

// src/frontend/css.ts
var HEAD;
var init_css = __esm({
  "src/frontend/css.ts"() {
    "use strict";
    HEAD = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prism - \u4EE3\u7406\u8BA2\u9605\u8F6C\u6362</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2064%2064%27%3E%0A%20%20%3Cstyle%3E%0A%20%20%20%20polygon%20%7B%20fill%3A%20%23e5e5e5%3B%20stroke%3A%20%23737373%3B%20stroke-width%3A%202%3B%20%7D%0A%20%20%20%20%40media%20%28prefers-color-scheme%3A%20light%29%20%7B%0A%20%20%20%20%20%20polygon%20%7B%20fill%3A%20%23171717%3B%20stroke%3A%20%23a3a3a3%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%3C%2Fstyle%3E%0A%20%20%3Cpolygon%20points%3D%2732%2C4%2060%2C32%2032%2C60%204%2C32%27%2F%3E%0A%3C%2Fsvg%3E" type="image/svg+xml">
<script>
(function(){
  try {
    var t = localStorage.getItem('prism-theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch(e) {}
})();
</script>
<style>
  :root {
    --bg: #0a0a0a;
    --card-bg: #1a1a1a;
    --border: #2e2e2e;
    --text: #e5e5e5;
    --text-secondary: #737373;
    --accent: #e5e5e5;
    --accent-hover: #ffffff;
    --accent-light: #a3a3a3;
    --input-bg: #0a0a0a;
    --success: #737373;
    --radius: 4px;
    --shadow: 0 1px 3px rgba(0,0,0,0.6);
  }
  :root[data-theme="light"] {
    --bg: #fafafa;
    --card-bg: #ffffff;
    --border: #e5e5e5;
    --text: #171717;
    --text-secondary: #737373;
    --accent: #171717;
    --accent-hover: #404040;
    --accent-light: #525252;
    --input-bg: #ffffff;
    --success: #737373;
    --shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  html { scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  @font-face {
    font-family: 'HarmonyOS Sans SC';
    src: url(data:font/woff2;base64,d09GMgABAAAAAAO4AA8AAAAABzAAAANhAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhYbgVQcKgZgAFwKg0CCdwE2AiQDIAsSAAQgBYMWByAXJBgSG8wFUZQvyoUwPxJjGzVbyMVWFhqpaRz5Kpzjeeow39/dqyWhVvA4XipYCAJYhQMS42T8xM7A7/IniwJMfWBFb/FMf1EMz/N/w/v+T6tOQElkcYBRViY7g+lAoOn+xLl8UTjwFhr5hGYVVOcbj3bTphR6/nuw8SdF+WsKvOCT0Zs3iJhi4cjtTfrLCsaAIqquCIYuBOK21OxiWNwNvbrAQoMdQ5BL6tEFRgiiKfqqsSOZiDMCYizSvivmgH0uiI6IoiCiKxqqqig2BFxLxOsAwO4jgCEgqqajKzqKKCK6qoKmiWDoiuxRqNM5ALT6V0cR9ct3KQe8kCU5EBgVMASowOd63CsyCEXX4wL9f4K2xBKBPNwhcIJHQcUaL1gTPIKpvqLrRL52nfVcjzMGDqDHN9gjtoMtYHPZzNsJCBB9xpye8w5+ATQARRHdpx+M29ksEzr2J167hmFXr5qYwESsmHiDDL+uHh5cJukrphMvYdhFk5pAwvTHNZxJLJpwFWDS9pY738izr+nPmTen7Is3uOWtYj+5asfXA8sWn8uQN5ZkDqQev36ZDL+x9vMq3mEyYR2G7Q85du0Sqlql5vw71WOj07tmZaV3JftV177dePdbXWyONjwsVxeTdRHNUf0CZG0y//EBAbJzQdRKcSUe2tT07By45E+cR0aAf0BW8telk/T3lz20OCk5WF9WH5QbkqRv74BxNiMfxA78SkNiyrKerRSnW3XpnK3V4XTWoPLG4oFpXXonHz4uc75oZbvaIjfZ3UUbGpXbJIsq7JrysnfC+TinFZa2I9/FpHnGBKrEoHcfgNg4CAfnsXt1Y/TPiK9b4B/6e7L336f/9v3/ZJAnUERPAaF+mxndTxhj4aMgfyk1+jHIQHlJjxN17YGonBSV28S6NRhBP6cUgMCynle8dAO8gUHFRh+qmPqhqns7mi2J6tj3895dm1i40VU3/fXQrlWbXqhAOoH0qHS9NehL0o5KJumjXRMJLb2BhgqVrZdmGlSCTjqhCttpPc0pSU+SHvqQUk9J16CHzrrqor88RagiDbroSaeTUIk6adCkY4OwVW9Hmz2KQ6r06rCn9pJFUHoaOndec7QOrBPUhXgQ3e1GoHQm5Plvxm9l7raRrRBSP1dJUC4cPPRRkjhXGgAAAA==) format('woff2');
    font-weight: 900;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: url(data:font/woff2;base64,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) format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex; flex-direction: column; align-items: center;
    padding: 20px;
    transition: background-color 0.3s, color 0.3s;
  }
  .container { width: 100%; max-width: 720px; margin-top: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .header-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
  .header-btn {
    height: 36px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card-bg); color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; gap: 6px; font-size: 0.82rem;
    text-decoration: none; white-space: nowrap;
    transition: background-color 0.3s, border-color 0.3s, color 0.3s;
    line-height: 1.3;
  }
  .header-btn:hover { border-color: var(--accent); color: var(--text); }
  .lang-trigger { min-width: 110px; height: 36px; padding: 0 28px 0 10px; font-size: 0.82rem; line-height: 1.3; display: flex; align-items: center; gap: 6px; }
  .brand { margin-bottom: 0; flex-shrink: 0; padding-inline-start: 24px; }
  .brand h1 {
    font-family: 'HarmonyOS Sans SC', sans-serif;
    font-size: 2.2rem; font-weight: 900; color: var(--text);
    user-select: none; -webkit-user-select: none;
  }
  .brand p { color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px; line-height: 1.3; }
  .card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 24px; margin-top: 20px;
    transition: background-color 0.3s, border-color 0.3s, color 0.3s;
  }
  .card-title {
    font-size: 1rem; font-weight: 600; margin-bottom: 16px;
    color: var(--text); display: flex; align-items: center; gap: 8px; line-height: 1.3;
  }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px; font-weight: 500; line-height: 1.3; }
  .url-row { display: flex; gap: 6px; margin-bottom: 6px; }
  .url-row input { flex: 1; }
  .url-row-del { align-self: stretch; min-width: 38px; padding: 0 12px; background: none; border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; justify-content: center; transition: border-color 0.2s, color 0.2s; }
  .url-row-del:hover { border-color: var(--accent); color: var(--text); }
  .btn-add-url { margin-top: 2px; padding: 6px 12px; background: none; border: 1px dashed var(--border); border-radius: var(--radius); color: var(--text-secondary); cursor: pointer; font-size: 0.82rem; line-height: 1.3; transition: border-color 0.2s, color 0.2s; }
  .btn-add-url:hover { border-color: var(--accent); color: var(--text); }
  .form-group input, .form-group select {
    width: 100%; padding: 10px 12px; background: var(--input-bg);
    border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text); font-size: 0.9rem; line-height: 1.4; outline: none;
    transition: border-color 0.2s, background-color 0.3s, color 0.3s;
  }
  .form-group input:focus, .form-group select:focus { border-color: var(--accent); }
  #config-custom-group {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    margin-bottom: 0;
    transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.3s ease,
                margin-bottom 0.3s ease;
  }
  #config-custom-group.show {
    max-height: 80px;
    opacity: 1;
    margin-bottom: 14px;
  }
  .form-row { display: flex; gap: 12px; }
  .form-row .form-group { flex: 1; }
  .mode-toggle {
    display: flex; gap: 4px; background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 3px; margin-bottom: 16px;
    position: relative;
    transition: background-color 0.3s, border-color 0.3s;
  }
  .mode-indicator {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 5px);
    height: calc(100% - 6px);
    background: var(--accent);
    border-radius: 3px;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }
  .mode-toggle.advanced .mode-indicator {
    transform: translateX(calc(100% + 4px));
  }
  [dir="rtl"] .mode-indicator {
    transform: translateX(calc(100% + 4px));
  }
  [dir="rtl"] .mode-toggle.advanced .mode-indicator {
    transform: none;
  }
  .mode-btn {
    flex: 1; padding: 8px 12px; border: none; border-radius: 3px;
    cursor: pointer; font-size: 0.85rem; font-weight: 500;
    background: transparent; color: var(--text-secondary); white-space: nowrap;
    line-height: 1.3;
    transition: color 0.3s;
    position: relative; z-index: 1;
  }
  .mode-btn.active { color: var(--bg); }
  /* Custom select dropdown */
  .custom-select {
    position: relative;
    width: 100%;
    user-select: none;
  }
  .custom-select select {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .custom-select-trigger {
    width: 100%;
    padding: 10px 32px 10px 12px;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.4;
    cursor: pointer;
    position: relative;
    transition: border-color 0.2s, border-radius 0.15s, background-color 0.3s, color 0.3s;
    outline: none;
  }
  .custom-select-trigger:focus {
    border-color: var(--accent);
  }
  .custom-select.active .custom-select-trigger {
    border-color: var(--accent);
    border-radius: var(--radius) var(--radius) 0 0;
    border-bottom-color: transparent;
  }
  .custom-select-trigger-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .custom-select-arrow {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    transition: transform 0.15s ease;
    color: var(--text-secondary);
    pointer-events: none;
  }
  .custom-select.active .custom-select-arrow {
    transform: translateY(-50%) rotate(180deg);
  }
  .custom-select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--card-bg);
    border: 1px solid var(--accent);
    border-top: 1px solid var(--border);
    border-radius: 0 0 6px 6px;
    box-shadow: var(--shadow);
    overflow: hidden;
    z-index: 100;
    transform: scaleY(0);
    opacity: 0;
    transform-origin: top center;
    transition: transform 0.15s ease, opacity 0.15s ease;
    pointer-events: none;
  }
  .custom-select.active .custom-select-dropdown {
    transform: scaleY(1);
    opacity: 1;
    pointer-events: auto;
  }
  .custom-select-option {
    padding: 10px 12px;
    cursor: pointer;
    color: var(--text);
    font-size: 0.9rem; line-height: 1.3;
    border-bottom: 1px solid var(--border);
    transition: background-color 0.1s;
  }
  .custom-select-option:last-child {
    border-bottom: none;
  }
  .custom-select-option:hover {
    background: var(--bg);
  }
  .custom-select-option.selected {
    color: var(--accent-light);
    font-weight: 700;
  }
  .custom-select-option.highlighted {
    background: var(--bg);
  }
  /* Drop-up variant for near-bottom overflow */
  .custom-select.drop-up .custom-select-trigger {
    border-radius: 0 0 var(--radius) var(--radius);
    border-top-color: transparent;
    border-bottom-color: var(--accent);
  }
  .custom-select.drop-up .custom-select-dropdown {
    top: auto;
    bottom: 100%;
    border-radius: 6px 6px 0 0;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--accent);
    transform-origin: bottom center;
  }
  .btn-primary {
    width: 100%; padding: 12px; background: var(--accent);
    border: none; border-radius: var(--radius); color: var(--bg);
    font-size: 0.95rem; font-weight: 600; cursor: pointer; line-height: 1.3;
    transition: background 0.2s; margin-top: 4px;
  }
  .btn-primary:hover { background: var(--accent-hover); }
  .result { margin-top: 20px; }
  .result-url {
    width: 100%; padding: 8px 12px; background: var(--input-bg);
    border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--accent-light); font-size: 0.8rem; line-height: 1.25;
    word-break: break-all; font-family: 'JetBrains Mono', monospace;
    min-height: 48px; resize: vertical;
  }
  .result-actions { display: flex; gap: 8px; margin-top: 10px; }
  .btn-sm {
    padding: 8px 16px; border: 1px solid var(--border);
    border-radius: var(--radius); cursor: pointer;
    font-size: 0.82rem; background: var(--card-bg); color: var(--text);
    line-height: 1.3; transition: all 0.2s;
  }
  .btn-sm:hover { border-color: var(--accent); color: var(--accent-light); }
  .btn-sm.download { background: var(--accent); border-color: var(--accent); color: var(--bg); }
  .btn-sm.download:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
  .status { font-size: 0.82rem; margin-top: 8px; color: var(--text-secondary); min-height: 20px; line-height: 1.3; }
  footer { margin-top: 0; padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.78rem; line-height: 1.3; }
  #advanced {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.3s ease;
  }
  #advanced.show {
    max-height: 1200px;
    opacity: 1;
  }
  .toggle-params {
    margin-top: 12px; margin-bottom: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .toggle-item { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--text-secondary); cursor: pointer; line-height: 1.3; }
  .toggle-item input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  @media (max-width: 480px) {
    body { padding: 12px; }
    .container { margin-top: 20px; }
    .card { padding: 16px; }
    .form-row { flex-direction: column; gap: 0; }
    .toggle-params { grid-template-columns: 1fr; }
    .header { flex-direction: column; align-items: center; gap: 12px; }
    .header-actions { width: 100%; justify-content: center; }
    .brand { text-align: center; padding-inline-start: 0; }
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  [dir="rtl"] .custom-select-trigger { padding: 10px 12px 10px 32px; }
  [dir="rtl"] .lang-trigger { padding: 0 10px 0 28px; }
  [dir="rtl"] .custom-select-arrow { right: auto; left: 12px; }
  [dir="rtl"] input, [dir="rtl"] textarea { direction: rtl; text-align: right; }
  [dir="rtl"] .url-input, [dir="rtl"] #config-custom, [dir="rtl"] #result-url,
  [dir="rtl"] #ua, [dir="rtl"] #include, [dir="rtl"] #exclude, [dir="rtl"] #rename {
    direction: ltr; text-align: left; unicode-bidi: plaintext;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
  }
</style>
</head>
`;
  }
});

// src/frontend/body.ts
var BODY;
var init_body2 = __esm({
  "src/frontend/body.ts"() {
    "use strict";
    BODY = `<body>
<div class="container">
  <div class="header">
    <div class="brand">
      <h1>\u25C6 Prism</h1>
      <p data-i18n="tagline">\u4EE3\u7406\u8BA2\u9605\u8F6C\u6362\u5DE5\u5177 \xB7 \u591A\u683C\u5F0F\u652F\u6301</p>
    </div>
    <div class="header-actions">
      <button class="header-btn" id="theme-toggle" title="\u5207\u6362\u4E3B\u9898">
        <span id="theme-icon" style="display:flex;align-items:center;justify-content:center"></span>
      </button>
      <a class="header-btn" href="https://github.com/Zhong-Zhiyu/prism" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
      </a>
      <div class="custom-select" id="lang-select-wrapper" style="width:auto">
        <div class="custom-select-trigger lang-trigger" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="lang-select-listbox" aria-activedescendant="lang-option-zh-Hans">
          <span class="custom-select-trigger-text">\u7B80\u4F53\u4E2D\u6587</span>
          <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="custom-select-dropdown" id="lang-select-listbox" role="listbox">
          <div class="custom-select-option selected" id="lang-option-zh-Hans" data-value="zh-Hans" role="option" aria-selected="true">\u7B80\u4F53\u4E2D\u6587</div>
          <div class="custom-select-option" id="lang-option-zh-Hant" data-value="zh-Hant" role="option" aria-selected="false">\u7E41\u9AD4\u4E2D\u6587</div>
          <div class="custom-select-option" id="lang-option-en" data-value="en" role="option" aria-selected="false">English</div>
          <div class="custom-select-option" id="lang-option-ja" data-value="ja" role="option" aria-selected="false">\u65E5\u672C\u8A9E</div>
          <div class="custom-select-option" id="lang-option-ko" data-value="ko" role="option" aria-selected="false">\uD55C\uAD6D\uC5B4</div>
          <div class="custom-select-option" id="lang-option-ru" data-value="ru" role="option" aria-selected="false">\u0420\u0443\u0441\u0441\u043A\u0438\u0439</div>
          <div class="custom-select-option" id="lang-option-vi" data-value="vi" role="option" aria-selected="false">Ti\u1EBFng Vi\u1EC7t</div>
          <div class="custom-select-option" id="lang-option-ar" data-value="ar" role="option" aria-selected="false">\u0627\u0644\u0639\u0631\u0628\u064A\u0629</div>
          <div class="custom-select-option" id="lang-option-fa" data-value="fa" role="option" aria-selected="false">\u0641\u0627\u0631\u0633\u06CC</div>
        </div>
        <select onchange="applyLanguage(this.value)" style="display:none">
          <option value="zh-Hans">\u7B80\u4F53\u4E2D\u6587</option>
          <option value="zh-Hant">\u7E41\u9AD4\u4E2D\u6587</option>
          <option value="en">English</option>
          <option value="ja">\u65E5\u672C\u8A9E</option>
          <option value="ko">\uD55C\uAD6D\uC5B4</option>
          <option value="ru">\u0420\u0443\u0441\u0441\u043A\u0438\u0439</option>
          <option value="vi">Ti\u1EBFng Vi\u1EC7t</option>
          <option value="ar">\u0627\u0644\u0639\u0631\u0628\u064A\u0629</option>
          <option value="fa">\u0641\u0627\u0631\u0633\u06CC</option>
        </select>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="mode-toggle" id="mode-toggle">
      <div class="mode-indicator"></div>
      <button class="mode-btn active" onclick="setMode('basic')" id="mode-basic" data-i18n="modeBasic">\u57FA\u7840\u6A21\u5F0F</button>
      <button class="mode-btn" onclick="setMode('advanced')" id="mode-advanced" data-i18n="modeAdvanced">\u8FDB\u9636\u6A21\u5F0F</button>
    </div>

    <div class="form-group">
      <label for="url-0" data-i18n="labelUrl">\u539F\u59CB\u8BA2\u9605\u94FE\u63A5</label>
      <div id="url-rows">
        <div class="url-row">
          <input type="url" id="url-0" class="url-input" required autocomplete="url">
          <button class="url-row-del" onclick="removeUrlRow(this)" title="\u5220\u9664" aria-label="\u5220\u9664\u8BA2\u9605\u94FE\u63A5" style="display:none">\xD7</button>
        </div>
      </div>
      <button class="btn-add-url" onclick="addUrlRow()" data-i18n="btnAddUrl">\u6DFB\u52A0\u8BA2\u9605\u94FE\u63A5</button>
    </div>

    <div class="form-group">
      <label data-i18n="labelConfig">\u89C4\u5219\u914D\u7F6E</label>
      <div class="custom-select" id="config-select-wrapper">
        <div class="custom-select-trigger" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="config-select-listbox">
          <span class="custom-select-trigger-text" data-i18n="optDefault">\u9ED8\u8BA4\uFF08\u4E0D\u66F4\u6539\u89C4\u5219\u914D\u7F6E\uFF09</span>
          <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="custom-select-dropdown" id="config-select-listbox" role="listbox">
          <div class="custom-select-option selected" data-value="" role="option" aria-selected="true" data-i18n="optDefault">\u9ED8\u8BA4\uFF08\u4E0D\u66F4\u6539\u89C4\u5219\u914D\u7F6E\uFF09</div>
          <div class="custom-select-option" data-value="https://gist.githubusercontent.com/Zhong-Zhiyu/7aa9bf8aeb5b849c13301659881bfb65/raw/GFW-bypass-rules.ini" role="option" aria-selected="false" data-i18n="optPreset">Prism \u9884\u8BBE\u89C4\u5219</div>
          <div class="custom-select-option" data-value="__custom__" role="option" aria-selected="false" data-i18n="optCustom">\u81EA\u5B9A\u4E49</div>
        </div>
        <select id="config-select" onchange="onConfigChange()">
          <option value="" data-i18n="optDefault">\u9ED8\u8BA4\uFF08\u4E0D\u66F4\u6539\u89C4\u5219\u914D\u7F6E\uFF09</option>
          <option value="https://gist.githubusercontent.com/Zhong-Zhiyu/7aa9bf8aeb5b849c13301659881bfb65/raw/GFW-bypass-rules.ini" data-i18n="optPreset">Prism \u9884\u8BBE\u89C4\u5219</option>
          <option value="__custom__" data-i18n="optCustom">\u81EA\u5B9A\u4E49</option>
        </select>
      </div>
    </div>
    <div class="form-group" id="config-custom-group">
      <label data-i18n="labelCustomConfig">\u81EA\u5B9A\u4E49\u89C4\u5219\u914D\u7F6E\u94FE\u63A5</label>
      <input type="url" id="config-custom">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label data-i18n="labelTarget">\u8F93\u51FA\u683C\u5F0F</label>
        <div class="custom-select" id="target-wrapper">
          <div class="custom-select-trigger" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="target-listbox">
            <span class="custom-select-trigger-text" data-i18n="optClash">Clash / Mihomo (YAML)</span>
            <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="custom-select-dropdown" id="target-listbox" role="listbox">
            <div class="custom-select-option selected" data-value="clash" role="option" aria-selected="true" data-i18n="optClash">Clash / Mihomo (YAML)</div>
            <div class="custom-select-option" data-value="singbox" role="option" aria-selected="false" data-i18n="optSingbox">sing-box (JSON)</div>
            <div class="custom-select-option" data-value="surge" role="option" aria-selected="false" data-i18n="optSurge">Surge (INI)</div>
          </div>
          <select id="target">
            <option value="clash" data-i18n="optClash">Clash / Mihomo (YAML)</option>
            <option value="singbox" data-i18n="optSingbox">sing-box (JSON)</option>
            <option value="surge" data-i18n="optSurge">Surge (INI)</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label data-i18n="labelFilename">\u8F93\u51FA\u6587\u4EF6\u540D\uFF08\u53EF\u9009\uFF09</label>
        <input type="text" id="filename" data-i18n-placeholder="placeholderFilename" placeholder="\u7559\u7A7A\u5219\u9ED8\u8BA4\u4E3A Prism">
      </div>
    </div>

    <div id="advanced">
      <div class="card-title" data-i18n="advancedParams">\u8FDB\u9636\u53C2\u6570</div>
      <div class="toggle-params">
        <label class="toggle-item" data-i18n="toggleEmoji"><input type="checkbox" id="emoji" checked> \u4FDD\u7559 Emoji</label>
        <label class="toggle-item" data-i18n="toggleTFO"><input type="checkbox" id="tfo"> TCP Fast Open</label>
        <label class="toggle-item" data-i18n="toggleUDP"><input type="checkbox" id="udp"> UDP \u5F3A\u5236\u5F00\u542F</label>
        <label class="toggle-item" data-i18n="toggleSCV"><input type="checkbox" id="scv"> \u8DF3\u8FC7\u8BC1\u4E66\u9A8C\u8BC1</label>
        <label class="toggle-item" data-i18n="toggleSort"><input type="checkbox" id="sort"> \u8282\u70B9\u6392\u5E8F</label>
        <label class="toggle-item" data-i18n="toggleExpand"><input type="checkbox" id="expand" checked> \u5C55\u5F00\u89C4\u5219\u5168\u6587</label>
        <label class="toggle-item" data-i18n="toggleAppendType"><input type="checkbox" id="append_type"> \u8282\u70B9\u540D\u52A0\u7C7B\u578B\u6807\u8BB0</label>
        <label class="toggle-item" data-i18n="toggleTLS13"><input type="checkbox" id="tls13"> TLS 1.3</label>
      </div>
      <div class="form-group">
        <label data-i18n="labelRename">\u8282\u70B9\u91CD\u547D\u540D\uFF08\u53EF\u9009\uFF09</label>
        <input type="text" id="rename" data-i18n-placeholder="placeholderRename" placeholder="\u5982 \u9999\u6E2F@HK|\u65E5\u672C@JP">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label data-i18n="labelInclude">\u5305\u542B\u8282\u70B9\uFF08\u6B63\u5219\uFF09</label>
          <input type="text" id="include" data-i18n-placeholder="placeholderInclude" placeholder="\u5982 HK|JP|TW">
        </div>
        <div class="form-group">
          <label data-i18n="labelExclude">\u6392\u9664\u8282\u70B9\uFF08\u6B63\u5219\uFF09</label>
          <input type="text" id="exclude" data-i18n-placeholder="placeholderExclude" placeholder="\u5982 \u5269\u4F59|\u5B98\u7F51|\u5230\u671F">
        </div>
      </div>      <div class="form-group">
        <label data-i18n="labelUa">\u81EA\u5B9A\u4E49 User-Agent\uFF08\u53EF\u9009\uFF09</label>
        <input type="text" id="ua" data-i18n-placeholder="placeholderUa" placeholder="\u9ED8\u8BA4 clash-verge/<\u6700\u65B0\u7248\u672C>">
      </div>
    </div>

    <button class="btn-primary" onclick="generateSubscription()" data-i18n="btnGenerate">\u751F\u6210\u8BA2\u9605\u94FE\u63A5</button>

    <div class="result" id="result-section" style="display:none;">
      <label style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;" data-i18n="labelResult">\u751F\u6210\u7684\u8BA2\u9605\u94FE\u63A5\uFF1A</label>
      <textarea class="result-url" id="result-url" readonly rows="3"></textarea>
      <div class="result-actions">
        <button class="btn-sm" id="btn-copy" onclick="copyUrl()" data-i18n="btnCopy" disabled>\u590D\u5236\u94FE\u63A5</button>
        <button class="btn-sm download" id="btn-download" onclick="downloadConfig()" data-i18n="btnDownload" disabled>\u4E0B\u8F7D\u914D\u7F6E</button>
      </div>
      <div class="status" id="status" role="status" aria-live="polite"></div>
    </div>
  </div>
</div>

<footer>
  <p dir="ltr">\xA9 2026<span id="year-range"></span> Zhong Zhiyu. All rights reserved.</p>
</footer>

`;
  }
});

// src/frontend/script.ts
var SCRIPT;
var init_script = __esm({
  "src/frontend/script.ts"() {
    "use strict";
    SCRIPT = `<script>
// ========== \u4E3B\u9898\u7BA1\u7406\u5668 ==========
(function() {
  var THEME_KEY = 'prism-theme';
  var themeToggle = document.getElementById('theme-toggle');
  var themeIcon = document.getElementById('theme-icon');
  var currentTheme;

  try {
    currentTheme = localStorage.getItem(THEME_KEY) || 'auto';
  } catch(e) {
    currentTheme = 'auto';
  }

  var mql = window.matchMedia('(prefers-color-scheme: light)');

  function getEffectiveTheme() {
    if (currentTheme === 'auto') {
      return mql.matches ? 'light' : 'dark';
    }
    return currentTheme;
  }

  var ICONS = {
    auto: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
    light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    dark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  };
  function updateIcon() {
    themeIcon.innerHTML = ICONS[currentTheme];
  }

  function setThemeCookie(effective) {
    try {
      var maxAge = 31536000; // 1 \u5E74
      document.cookie = 'prism-theme=' + effective + '; path=/; SameSite=Lax; max-age=' + maxAge;
    } catch(e) {}
  }

  function applyTheme() {
    var effective = getEffectiveTheme();
    if (effective === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    setThemeCookie(effective);
    updateIcon();
  }

  function cycleTheme() {
    if (currentTheme === 'auto') {
      currentTheme = 'light';
    } else if (currentTheme === 'light') {
      currentTheme = 'dark';
    } else {
      currentTheme = 'auto';
    }
    try {
      localStorage.setItem(THEME_KEY, currentTheme);
    } catch(e) {}
    applyTheme();
  }

  themeToggle.addEventListener('click', cycleTheme);

  mql.addEventListener('change', function() {
    if (currentTheme === 'auto') {
      applyTheme();
    }
  });

  applyTheme();
})();

// ========== \u5E74\u4EFD\u8303\u56F4 ==========
(function() {
  var currentYear = new Date().getFullYear();
  var el = document.getElementById('year-range');
  if (currentYear > 2026 && el) el.textContent = '~' + currentYear;
})();

// ========== \u81EA\u5B9A\u4E49\u4E0B\u62C9\u6846 ==========
(function() {
  function initCustomSelect(wrapper) {
    var select = wrapper.querySelector('select');
    var trigger = wrapper.querySelector('.custom-select-trigger');
    var dropdown = wrapper.querySelector('.custom-select-dropdown');
    var options = wrapper.querySelectorAll('.custom-select-option');
    var triggerText = wrapper.querySelector('.custom-select-trigger-text');

    function syncFromNative() {
      var val = select.value;
      options.forEach(function(opt) {
        var isSel = opt.getAttribute('data-value') === val;
        opt.classList.toggle('selected', isSel);
        opt.setAttribute('aria-selected', String(isSel));
        if (isSel) triggerText.textContent = opt.textContent;
      });
    }

    function closeAll() {
      document.querySelectorAll('.custom-select.active').forEach(function(w) {
        w.classList.remove('active');
        w.classList.remove('drop-up');
        w.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'false');
      });
    }

    function openDropdown() {
      closeAll();
      wrapper.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      var sel = dropdown.querySelector('.custom-select-option.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
      requestAnimationFrame(function() {
        var rect = dropdown.getBoundingClientRect();
        if (rect.bottom > window.innerHeight && rect.top > window.innerHeight / 2) {
          wrapper.classList.add('drop-up');
        }
      });
    }

    function closeDropdown() {
      wrapper.classList.remove('active');
      wrapper.classList.remove('drop-up');
      trigger.setAttribute('aria-expanded', 'false');
      options.forEach(function(o) { o.classList.remove('highlighted'); });
    }

    function selectOption(optionEl) {
      var val = optionEl.getAttribute('data-value');
      select.value = val;
      syncFromNative();
      closeDropdown();
      if (select.onchange) select.onchange.call(select);
    }

    function highlightOption(optionEl) {
      options.forEach(function(o) { o.classList.remove('highlighted'); });
      if (optionEl) {
        optionEl.classList.add('highlighted');
        trigger.setAttribute('aria-activedescendant', optionEl.id || '');
        optionEl.scrollIntoView({ block: 'nearest' });
      }
    }

    function getHighlightedIndex() {
      var found = -1;
      options.forEach(function(o, i) {
        if (o.classList.contains('highlighted')) found = i;
      });
      return found;
    }

    function getSelectedIndex() {
      var found = 0;
      options.forEach(function(o, i) {
        if (o.classList.contains('selected')) found = i;
      });
      return found;
    }

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      if (wrapper.classList.contains('active')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    options.forEach(function(opt) {
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        selectOption(opt);
      });
    });

    trigger.addEventListener('keydown', function(e) {
      var isOpen = wrapper.classList.contains('active');
      var opts = Array.from(options);
      var hlIdx = getHighlightedIndex();
      var key = e.key;

      switch (key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (isOpen && hlIdx >= 0) {
            selectOption(opts[hlIdx]);
          } else if (isOpen) {
            selectOption(opts[getSelectedIndex()]);
          } else {
            openDropdown();
            highlightOption(opts[getSelectedIndex()]);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            openDropdown();
            highlightOption(opts[getSelectedIndex()]);
          } else {
            var nextIdx = hlIdx < opts.length - 1 ? hlIdx + 1 : hlIdx;
            highlightOption(opts[nextIdx]);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) {
            openDropdown();
            highlightOption(opts[getSelectedIndex()]);
          } else {
            var prevIdx = hlIdx > 0 ? hlIdx - 1 : 0;
            highlightOption(opts[prevIdx]);
          }
          break;
        case 'Escape':
          closeDropdown();
          trigger.focus();
          break;
        case 'Tab':
          closeDropdown();
          break;
        default:
          if (key.length === 1 && /[a-zA-Z\u4E00-\u9FFF]/.test(key)) {
            var ch = key.toLowerCase();
            var match = opts.find(function(o) {
              return o.textContent.trim().toLowerCase().indexOf(ch) === 0;
            });
            if (match) highlightOption(match);
          }
      }
    });

    syncFromNative();
  }

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-select')) {
      document.querySelectorAll('.custom-select.active').forEach(function(w) {
        w.classList.remove('active');
        w.classList.remove('drop-up');
        w.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'false');
      });
    }
  });

  document.querySelectorAll('.custom-select').forEach(initCustomSelect);
})();


// ========== \u591A\u8BED\u8A00\u652F\u6301 ==========
var I18N = {
  'zh-Hans': {
    title: 'Prism - \u4EE3\u7406\u8BA2\u9605\u8F6C\u6362',
    tagline: '\u4EE3\u7406\u8BA2\u9605\u8F6C\u6362\u5DE5\u5177 \xB7 \u591A\u683C\u5F0F\u652F\u6301',
    modeBasic: '\u57FA\u7840\u6A21\u5F0F', modeAdvanced: '\u8FDB\u9636\u6A21\u5F0F',
    labelUrl: '\u539F\u59CB\u8BA2\u9605\u94FE\u63A5', labelConfig: '\u89C4\u5219\u914D\u7F6E', labelCustomConfig: '\u81EA\u5B9A\u4E49\u89C4\u5219\u914D\u7F6E\u94FE\u63A5',
    optDefault: '\u9ED8\u8BA4\uFF08\u4E0D\u66F4\u6539\u89C4\u5219\u914D\u7F6E\uFF09', optPreset: 'Prism \u9884\u8BBE\u89C4\u5219', optCustom: '\u81EA\u5B9A\u4E49',
    labelTarget: '\u8F93\u51FA\u683C\u5F0F', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\u8F93\u51FA\u6587\u4EF6\u540D\uFF08\u53EF\u9009\uFF09', placeholderFilename: '\u7559\u7A7A\u5219\u9ED8\u8BA4\u4E3A Prism',
    advancedParams: '\u8FDB\u9636\u53C2\u6570',
    toggleEmoji: '\u4FDD\u7559 Emoji', toggleTFO: 'TCP Fast Open', toggleUDP: 'UDP \u5F3A\u5236\u5F00\u542F',
    toggleSCV: '\u8DF3\u8FC7\u8BC1\u4E66\u9A8C\u8BC1', toggleSort: '\u8282\u70B9\u6392\u5E8F', toggleExpand: '\u5C55\u5F00\u89C4\u5219\u5168\u6587',
    toggleAppendType: '\u8282\u70B9\u540D\u52A0\u7C7B\u578B\u6807\u8BB0', toggleTLS13: 'TLS 1.3',
    labelInclude: '\u5305\u542B\u8282\u70B9\uFF08\u6B63\u5219\uFF09', placeholderInclude: '\u5982 HK|JP|TW',
    labelExclude: '\u6392\u9664\u8282\u70B9\uFF08\u6B63\u5219\uFF09', placeholderExclude: '\u5982 \u5269\u4F59|\u5B98\u7F51|\u5230\u671F',
    btnGenerate: '\u751F\u6210\u8BA2\u9605\u94FE\u63A5', labelResult: '\u751F\u6210\u7684\u8BA2\u9605\u94FE\u63A5\uFF1A',
    btnCopy: '\u590D\u5236\u94FE\u63A5', btnDownload: '\u4E0B\u8F7D\u914D\u7F6E',
    msgEnterUrl: '\u8BF7\u8F93\u5165\u8BA2\u9605\u94FE\u63A5', msgGenerated: '\u8BA2\u9605\u94FE\u63A5\u5DF2\u751F\u6210',
    labelRename: '\u8282\u70B9\u91CD\u547D\u540D\uFF08\u53EF\u9009\uFF09', placeholderRename: '\u5982 \u9999\u6E2F@HK|\u65E5\u672C@JP', btnAddUrl: '\u6DFB\u52A0\u8BA2\u9605\u94FE\u63A5', labelUa: '\u81EA\u5B9A\u4E49 User-Agent\uFF08\u53EF\u9009\uFF09', placeholderUa: '\u9ED8\u8BA4 clash-verge/<\u6700\u65B0\u7248\u672C>',
    msgCopied: '\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F', msgDownloadStarted: '\u4E0B\u8F7D\u5DF2\u5F00\u59CB', msgDownloadFailed: '\u4E0B\u8F7D\u5931\u8D25',
  },
  'en': {
    title: 'Prism - Proxy Subscription Converter', tagline: 'Cross-format proxy subscription converter',
    modeBasic: 'Basic', modeAdvanced: 'Advanced',
    labelUrl: 'Subscription URL', labelConfig: 'Rule Configuration', labelCustomConfig: 'Custom Rule Config URL',
    optDefault: 'Default (keep original rules)', optPreset: 'Prism Preset Rules', optCustom: 'Custom',
    labelTarget: 'Output Format', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: 'Output Filename (optional)', placeholderFilename: 'Empty for default: Prism',
    advancedParams: 'Advanced Parameters',
    toggleEmoji: 'Keep Emoji', toggleTFO: 'TCP Fast Open', toggleUDP: 'Force UDP',
    toggleSCV: 'Skip Certificate Verification', toggleSort: 'Sort Nodes', toggleExpand: 'Expand Rules',
    toggleAppendType: 'Append Type Tag to Node Name', toggleTLS13: 'TLS 1.3',
    labelInclude: 'Include Nodes (regex)', placeholderInclude: 'e.g. HK|JP|TW',
    labelExclude: 'Exclude Nodes (regex)', placeholderExclude: 'e.g. remaining|official|expired',
    btnGenerate: 'Generate Subscription', labelResult: 'Subscription URL:',
    btnCopy: 'Copy URL', btnDownload: 'Download Config',
    msgEnterUrl: 'Please enter a subscription URL', msgGenerated: 'Subscription URL generated',
    labelRename: 'Rename Nodes (optional)', placeholderRename: 'e.g. HK@HongKong|JP@Japan', btnAddUrl: 'Add Subscription', labelUa: 'Custom User-Agent (optional)', placeholderUa: 'Default: clash-verge/<latest>',
    msgCopied: 'Copied to clipboard', msgDownloadStarted: 'Download started', msgDownloadFailed: 'Download failed',
  },
  'ar': {
    title: 'Prism - \u0645\u062D\u0648\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0628\u0631\u0648\u0643\u0633\u064A',
    tagline: '\u0645\u062D\u0648\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0628\u0631\u0648\u0643\u0633\u064A \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0635\u064A\u063A',
    modeBasic: '\u0623\u0633\u0627\u0633\u064A', modeAdvanced: '\u0645\u062A\u0642\u062F\u0645',
    labelUrl: '\u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643', labelConfig: '\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0642\u0648\u0627\u0639\u062F', labelCustomConfig: '\u0631\u0627\u0628\u0637 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0645\u062E\u0635\u0635',
    optDefault: '\u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A', optPreset: '\u0642\u0648\u0627\u0639\u062F Prism \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0645\u0633\u0628\u0642\u064B\u0627', optCustom: '\u0645\u062E\u0635\u0635',
    labelTarget: '\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u0625\u062E\u0631\u0627\u062C', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\u0627\u0633\u0645 \u0645\u0644\u0641 \u0627\u0644\u0625\u062E\u0631\u0627\u062C (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)', placeholderFilename: '\u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u064B\u0627 \u0644\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A: Prism',
    advancedParams: '\u0627\u0644\u0645\u0639\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u0629',
    toggleEmoji: '\u0627\u0644\u0627\u062D\u062A\u0641\u0627\u0638 \u0628\u0627\u0644\u0631\u0645\u0648\u0632 \u0627\u0644\u062A\u0639\u0628\u064A\u0631\u064A\u0629', toggleTFO: 'TCP Fast Open', toggleUDP: '\u0625\u062C\u0628\u0627\u0631 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 UDP',
    toggleSCV: '\u062A\u062E\u0637\u064A \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0634\u0647\u0627\u062F\u0629', toggleSort: '\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u062E\u0648\u0627\u062F\u0645', toggleExpand: '\u062A\u0648\u0633\u064A\u0639 \u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0642\u0648\u0627\u0639\u062F',
    toggleAppendType: '\u0625\u0636\u0627\u0641\u0629 \u0648\u0633\u0645 \u0627\u0644\u0646\u0648\u0639', toggleTLS13: 'TLS 1.3',
    labelInclude: '\u062A\u0636\u0645\u064A\u0646 \u0627\u0644\u062E\u0648\u0627\u062F\u0645 (\u062A\u0639\u0628\u064A\u0631 \u0646\u0645\u0637\u064A)', placeholderInclude: '\u0645\u062B\u0627\u0644 HK|JP|TW',
    labelExclude: '\u0627\u0633\u062A\u0628\u0639\u0627\u062F \u0627\u0644\u062E\u0648\u0627\u062F\u0645 (\u062A\u0639\u0628\u064A\u0631 \u0646\u0645\u0637\u064A)', placeholderExclude: '\u0645\u062B\u0627\u0644 remaining|official|expired',
    btnGenerate: '\u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643', labelResult: '\u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643:',
    btnCopy: '\u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637', btnDownload: '\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u062A\u0643\u0648\u064A\u0646',
    msgEnterUrl: '\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643', msgGenerated: '\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643',
    labelRename: '\u0625\u0639\u0627\u062F\u0629 \u062A\u0633\u0645\u064A\u0629 \u0627\u0644\u0639\u0642\u062F (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)', placeholderRename: '\u0645\u062B\u0627\u0644: HK@HongKong|JP@Japan', btnAddUrl: '\u0625\u0636\u0627\u0641\u0629 \u0627\u0634\u062A\u0631\u0627\u0643', labelUa: 'User-Agent \u0645\u062E\u0635\u0635 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)', placeholderUa: '\u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A: clash-verge/<\u0627\u0644\u0623\u062D\u062F\u062B>',
    msgCopied: '\u062A\u0645 \u0627\u0644\u0646\u0633\u062E \u0625\u0644\u0649 \u0627\u0644\u062D\u0627\u0641\u0638\u0629', msgDownloadStarted: '\u0628\u062F\u0623 \u0627\u0644\u062A\u0646\u0632\u064A\u0644', msgDownloadFailed: '\u0641\u0634\u0644 \u0627\u0644\u062A\u0646\u0632\u064A\u0644',
  },
  'zh-Hant': {
    title: 'Prism - \u4EE3\u7406\u8A02\u95B1\u8F49\u63DB', tagline: '\u4EE3\u7406\u8A02\u95B1\u8F49\u63DB\u5DE5\u5177 \xB7 \u591A\u683C\u5F0F\u652F\u63F4',
    modeBasic: '\u57FA\u790E\u6A21\u5F0F', modeAdvanced: '\u9032\u968E\u6A21\u5F0F',
    labelUrl: '\u539F\u59CB\u8A02\u95B1\u9023\u7D50', labelConfig: '\u898F\u5247\u8A2D\u5B9A', labelCustomConfig: '\u81EA\u8A02\u898F\u5247\u8A2D\u5B9A\u9023\u7D50',
    optDefault: '\u9810\u8A2D\uFF08\u4E0D\u66F4\u6539\u898F\u5247\u8A2D\u5B9A\uFF09', optPreset: 'Prism \u9810\u8A2D\u898F\u5247', optCustom: '\u81EA\u8A02',
    labelTarget: '\u8F38\u51FA\u683C\u5F0F', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\u8F38\u51FA\u6A94\u6848\u540D\u7A31\uFF08\u53EF\u9078\uFF09', placeholderFilename: '\u7559\u7A7A\u5247\u9810\u8A2D\u70BA Prism',
    advancedParams: '\u9032\u968E\u53C3\u6578',
    toggleEmoji: '\u4FDD\u7559 Emoji', toggleTFO: 'TCP Fast Open', toggleUDP: 'UDP \u5F37\u5236\u958B\u555F',
    toggleSCV: '\u8DF3\u904E\u8B49\u66F8\u9A57\u8B49', toggleSort: '\u7BC0\u9EDE\u6392\u5E8F', toggleExpand: '\u5C55\u958B\u898F\u5247\u5168\u6587',
    toggleAppendType: '\u7BC0\u9EDE\u540D\u7A31\u52A0\u985E\u578B\u6A19\u8A18', toggleTLS13: 'TLS 1.3',
    labelInclude: '\u5305\u542B\u7BC0\u9EDE\uFF08\u6B63\u898F\uFF09', placeholderInclude: '\u5982 HK|JP|TW',
    labelExclude: '\u6392\u9664\u7BC0\u9EDE\uFF08\u6B63\u898F\uFF09', placeholderExclude: '\u5982 \u5269\u9918|\u5B98\u7DB2|\u5230\u671F',
    btnGenerate: '\u751F\u6210\u8A02\u95B1\u9023\u7D50', labelResult: '\u751F\u6210\u7684\u8A02\u95B1\u9023\u7D50\uFF1A',
    btnCopy: '\u8907\u88FD\u9023\u7D50', btnDownload: '\u4E0B\u8F09\u8A2D\u5B9A\u6A94',
    msgEnterUrl: '\u8ACB\u8F38\u5165\u8A02\u95B1\u9023\u7D50', msgGenerated: '\u8A02\u95B1\u9023\u7D50\u5DF2\u751F\u6210',
    labelRename: '\u7BC0\u9EDE\u91CD\u547D\u540D\uFF08\u53EF\u9078\uFF09', placeholderRename: '\u5982 HK@HongKong|JP@Japan', btnAddUrl: '\u65B0\u589E\u8A02\u95B1\u9023\u7D50', labelUa: '\u81EA\u8A02 User-Agent\uFF08\u53EF\u9078\uFF09', placeholderUa: '\u9810\u8A2D clash-verge/<\u6700\u65B0\u7248\u672C>',
    msgCopied: '\u5DF2\u8907\u88FD\u5230\u526A\u8CBC\u7C3F', msgDownloadStarted: '\u4E0B\u8F09\u5DF2\u958B\u59CB', msgDownloadFailed: '\u4E0B\u8F09\u5931\u6557',
  },
  'ja': {
    title: 'Prism - \u30D7\u30ED\u30AD\u30B7\u30B5\u30D6\u30B9\u30AF\u30EA\u30D7\u30B7\u30E7\u30F3\u5909\u63DB', tagline: '\u30DE\u30EB\u30C1\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u5BFE\u5FDC \u30D7\u30ED\u30AD\u30B7\u5909\u63DB\u30C4\u30FC\u30EB',
    modeBasic: '\u57FA\u672C', modeAdvanced: '\u8A73\u7D30',
    labelUrl: '\u30B5\u30D6\u30B9\u30AF\u30EA\u30D7\u30B7\u30E7\u30F3 URL', labelConfig: '\u30EB\u30FC\u30EB\u8A2D\u5B9A', labelCustomConfig: '\u30AB\u30B9\u30BF\u30E0\u30EB\u30FC\u30EB\u8A2D\u5B9A URL',
    optDefault: '\u30C7\u30D5\u30A9\u30EB\u30C8\uFF08\u30EB\u30FC\u30EB\u8A2D\u5B9A\u3092\u5909\u66F4\u3057\u306A\u3044\uFF09', optPreset: 'Prism \u30D7\u30EA\u30BB\u30C3\u30C8\u30EB\u30FC\u30EB', optCustom: '\u30AB\u30B9\u30BF\u30E0',
    labelTarget: '\u51FA\u529B\u5F62\u5F0F', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\u51FA\u529B\u30D5\u30A1\u30A4\u30EB\u540D\uFF08\u4EFB\u610F\uFF09', placeholderFilename: '\u672A\u5165\u529B\u6642\u306F Prism',
    advancedParams: '\u8A73\u7D30\u30D1\u30E9\u30E1\u30FC\u30BF',
    toggleEmoji: '\u7D75\u6587\u5B57\u3092\u4FDD\u6301', toggleTFO: 'TCP Fast Open', toggleUDP: 'UDP \u3092\u5F37\u5236',
    toggleSCV: '\u8A3C\u660E\u66F8\u691C\u8A3C\u3092\u30B9\u30AD\u30C3\u30D7', toggleSort: '\u30CE\u30FC\u30C9\u3092\u4E26\u3079\u66FF\u3048', toggleExpand: '\u30EB\u30FC\u30EB\u3092\u5C55\u958B',
    toggleAppendType: '\u30CE\u30FC\u30C9\u540D\u306B\u30BF\u30A4\u30D7\u30BF\u30B0\u3092\u8FFD\u52A0', toggleTLS13: 'TLS 1.3',
    labelInclude: '\u542B\u3081\u308B\u30CE\u30FC\u30C9\uFF08\u6B63\u898F\u8868\u73FE\uFF09', placeholderInclude: '\u4F8B: HK|JP|TW',
    labelExclude: '\u9664\u5916\u3059\u308B\u30CE\u30FC\u30C9\uFF08\u6B63\u898F\u8868\u73FE\uFF09', placeholderExclude: '\u4F8B: \u6B8B\u91CF|\u516C\u5F0F\u30B5\u30A4\u30C8|\u671F\u9650\u5207\u308C',
    btnGenerate: '\u30B5\u30D6\u30B9\u30AF\u30EA\u30D7\u30B7\u30E7\u30F3 URL \u3092\u751F\u6210', labelResult: '\u751F\u6210\u3055\u308C\u305F URL:',
    btnCopy: 'URL \u3092\u30B3\u30D4\u30FC', btnDownload: '\u8A2D\u5B9A\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9',
    msgEnterUrl: '\u30B5\u30D6\u30B9\u30AF\u30EA\u30D7\u30B7\u30E7\u30F3 URL \u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044', msgGenerated: 'URL \u304C\u751F\u6210\u3055\u308C\u307E\u3057\u305F',
    labelRename: '\u30CE\u30FC\u30C9\u540D\u5909\u66F4\uFF08\u4EFB\u610F\uFF09', placeholderRename: '\u4F8B: HK@HongKong|JP@Japan', btnAddUrl: '\u30B5\u30D6\u30B9\u30AF\u30EA\u30D7\u30B7\u30E7\u30F3\u3092\u8FFD\u52A0', labelUa: '\u30AB\u30B9\u30BF\u30E0 User-Agent\uFF08\u4EFB\u610F\uFF09', placeholderUa: '\u30C7\u30D5\u30A9\u30EB\u30C8: clash-verge/<\u6700\u65B0\u7248>',
    msgCopied: '\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F', msgDownloadStarted: '\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u958B\u59CB\u3057\u307E\u3057\u305F', msgDownloadFailed: '\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u5931\u6557\u3057\u307E\u3057\u305F',
  },
  'ko': {
    title: 'Prism - \uD504\uB85D\uC2DC \uAD6C\uB3C5 \uBCC0\uD658', tagline: '\uBA40\uD2F0 \uD3EC\uB9F7 \uD504\uB85D\uC2DC \uAD6C\uB3C5 \uBCC0\uD658 \uB3C4\uAD6C',
    modeBasic: '\uAE30\uBCF8', modeAdvanced: '\uACE0\uAE09',
    labelUrl: '\uAD6C\uB3C5 URL', labelConfig: '\uADDC\uCE59 \uC124\uC815', labelCustomConfig: '\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uADDC\uCE59 \uC124\uC815 URL',
    optDefault: '\uAE30\uBCF8\uAC12 (\uADDC\uCE59 \uC124\uC815\uC744 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC74C)', optPreset: 'Prism \uC0AC\uC804 \uC124\uC815 \uADDC\uCE59', optCustom: '\uC0AC\uC6A9\uC790 \uC9C0\uC815',
    labelTarget: '\uCD9C\uB825 \uD615\uC2DD', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\uCD9C\uB825 \uD30C\uC77C\uBA85 (\uC120\uD0DD\uC0AC\uD56D)', placeholderFilename: '\uBE44\uC6CC\uB450\uBA74 \uAE30\uBCF8\uAC12: Prism',
    advancedParams: '\uACE0\uAE09 \uB9E4\uAC1C\uBCC0\uC218',
    toggleEmoji: '\uC774\uBAA8\uC9C0 \uC720\uC9C0', toggleTFO: 'TCP Fast Open', toggleUDP: 'UDP \uAC15\uC81C',
    toggleSCV: '\uC778\uC99D\uC11C \uAC80\uC99D \uAC74\uB108\uB6F0\uAE30', toggleSort: '\uB178\uB4DC \uC815\uB82C', toggleExpand: '\uADDC\uCE59 \uD655\uC7A5',
    toggleAppendType: '\uB178\uB4DC\uBA85\uC5D0 \uC720\uD615 \uD0DC\uADF8 \uCD94\uAC00', toggleTLS13: 'TLS 1.3',
    labelInclude: '\uD3EC\uD568\uD560 \uB178\uB4DC (\uC815\uADDC\uC2DD)', placeholderInclude: '\uC608: HK|JP|TW',
    labelExclude: '\uC81C\uC678\uD560 \uB178\uB4DC (\uC815\uADDC\uC2DD)', placeholderExclude: '\uC608: remaining|official|expired',
    btnGenerate: '\uAD6C\uB3C5 \uB9C1\uD06C \uC0DD\uC131', labelResult: '\uC0DD\uC131\uB41C \uAD6C\uB3C5 URL:',
    btnCopy: 'URL \uBCF5\uC0AC', btnDownload: '\uC124\uC815 \uB2E4\uC6B4\uB85C\uB4DC',
    msgEnterUrl: '\uAD6C\uB3C5 URL\uC744 \uC785\uB825\uD558\uC138\uC694', msgGenerated: '\uAD6C\uB3C5 URL\uC774 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4',
    labelRename: '\uB178\uB4DC \uC774\uB984 \uBCC0\uACBD (\uC120\uD0DD\uC0AC\uD56D)', placeholderRename: '\uC608: HK@HongKong|JP@Japan', btnAddUrl: '\uAD6C\uB3C5 \uCD94\uAC00', labelUa: '\uC0AC\uC6A9\uC790 \uC9C0\uC815 User-Agent (\uC120\uD0DD\uC0AC\uD56D)', placeholderUa: '\uAE30\uBCF8\uAC12: clash-verge/<\uCD5C\uC2E0>',
    msgCopied: '\uD074\uB9BD\uBCF4\uB4DC\uC5D0 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4', msgDownloadStarted: '\uB2E4\uC6B4\uB85C\uB4DC\uAC00 \uC2DC\uC791\uB418\uC5C8\uC2B5\uB2C8\uB2E4', msgDownloadFailed: '\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328',
  },
  'ru': {
    title: 'Prism - \u041A\u043E\u043D\u0432\u0435\u0440\u0442\u0435\u0440 \u043F\u0440\u043E\u043A\u0441\u0438-\u043F\u043E\u0434\u043F\u0438\u0441\u043E\u043A', tagline: '\u041A\u043E\u043D\u0432\u0435\u0440\u0442\u0435\u0440 \u043F\u0440\u043E\u043A\u0441\u0438-\u043F\u043E\u0434\u043F\u0438\u0441\u043E\u043A \u0441 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u043E\u0439 \u0440\u0430\u0437\u043D\u044B\u0445 \u0444\u043E\u0440\u043C\u0430\u0442\u043E\u0432',
    modeBasic: '\u0411\u0430\u0437\u043E\u0432\u044B\u0439', modeAdvanced: '\u041F\u0440\u043E\u0434\u0432\u0438\u043D\u0443\u0442\u044B\u0439',
    labelUrl: 'URL \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438', labelConfig: '\u041A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044F \u043F\u0440\u0430\u0432\u0438\u043B', labelCustomConfig: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 URL \u043F\u0440\u0430\u0432\u0438\u043B',
    optDefault: '\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E (\u043D\u0435 \u043C\u0435\u043D\u044F\u0442\u044C \u043F\u0440\u0430\u0432\u0438\u043B\u0430)', optPreset: '\u041F\u0440\u0435\u0434\u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 Prism', optCustom: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439',
    labelTarget: '\u0424\u043E\u0440\u043C\u0430\u0442 \u0432\u044B\u0432\u043E\u0434\u0430', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\u0418\u043C\u044F \u0432\u044B\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)', placeholderFilename: '\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E: Prism',
    advancedParams: '\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B',
    toggleEmoji: '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u044D\u043C\u043E\u0434\u0437\u0438', toggleTFO: 'TCP Fast Open', toggleUDP: '\u041F\u0440\u0438\u043D\u0443\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 UDP',
    toggleSCV: '\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u0430', toggleSort: '\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0443\u0437\u043B\u044B', toggleExpand: '\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0440\u0430\u0432\u0438\u043B\u0430',
    toggleAppendType: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0435\u0442\u043A\u0443 \u0442\u0438\u043F\u0430 \u043A \u0438\u043C\u0435\u043D\u0438 \u0443\u0437\u043B\u0430', toggleTLS13: 'TLS 1.3',
    labelInclude: '\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0443\u0437\u043B\u044B (\u0440\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u043E\u0435 \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435)', placeholderInclude: '\u043D\u0430\u043F\u0440. HK|JP|TW',
    labelExclude: '\u0418\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0443\u0437\u043B\u044B (\u0440\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u043E\u0435 \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435)', placeholderExclude: '\u043D\u0430\u043F\u0440. remaining|official|expired',
    btnGenerate: '\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443', labelResult: '\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 URL \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438:',
    btnCopy: '\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C URL', btnDownload: '\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044E',
    msgEnterUrl: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 URL \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438', msgGenerated: '\u0421\u0441\u044B\u043B\u043A\u0430 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0430',
    labelRename: '\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0443\u0437\u043B\u044B (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)', placeholderRename: '\u043D\u0430\u043F\u0440. HK@HongKong|JP@Japan', btnAddUrl: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443', labelUa: '\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 User-Agent (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)', placeholderUa: '\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E: clash-verge/<\u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F>',
    msgCopied: '\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430', msgDownloadStarted: '\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043D\u0430\u0447\u0430\u043B\u0430\u0441\u044C', msgDownloadFailed: '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438',
  },
  'vi': {
    title: 'Prism - Chuy\u1EC3n \u0111\u1ED5i \u0111\u0103ng k\xFD proxy', tagline: 'C\xF4ng c\u1EE5 chuy\u1EC3n \u0111\u1ED5i \u0111\u0103ng k\xFD proxy \u0111a \u0111\u1ECBnh d\u1EA1ng',
    modeBasic: 'C\u01A1 b\u1EA3n', modeAdvanced: 'N\xE2ng cao',
    labelUrl: 'URL \u0111\u0103ng k\xFD', labelConfig: 'C\u1EA5u h\xECnh quy t\u1EAFc', labelCustomConfig: 'URL c\u1EA5u h\xECnh quy t\u1EAFc t\xF9y ch\u1EC9nh',
    optDefault: 'M\u1EB7c \u0111\u1ECBnh (kh\xF4ng thay \u0111\u1ED5i quy t\u1EAFc)', optPreset: 'Quy t\u1EAFc c\xE0i s\u1EB5n Prism', optCustom: 'T\xF9y ch\u1EC9nh',
    labelTarget: '\u0110\u1ECBnh d\u1EA1ng \u0111\u1EA7u ra', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: 'T\xEAn t\u1EC7p \u0111\u1EA7u ra (t\xF9y ch\u1ECDn)', placeholderFilename: 'M\u1EB7c \u0111\u1ECBnh n\u1EBFu \u0111\u1EC3 tr\u1ED1ng: Prism',
    advancedParams: 'Tham s\u1ED1 n\xE2ng cao',
    toggleEmoji: 'Gi\u1EEF Emoji', toggleTFO: 'TCP Fast Open', toggleUDP: 'Bu\u1ED9c UDP',
    toggleSCV: 'B\u1ECF qua x\xE1c minh ch\u1EE9ng ch\u1EC9', toggleSort: 'S\u1EAFp x\u1EBFp n\xFAt', toggleExpand: 'M\u1EDF r\u1ED9ng n\u1ED9i dung quy t\u1EAFc',
    toggleAppendType: 'Th\xEAm th\u1EBB lo\u1EA1i v\xE0o t\xEAn n\xFAt', toggleTLS13: 'TLS 1.3',
    labelInclude: 'Bao g\u1ED3m n\xFAt (regex)', placeholderInclude: 'vd: HK|JP|TW',
    labelExclude: 'Lo\u1EA1i tr\u1EEB n\xFAt (regex)', placeholderExclude: 'vd: remaining|official|expired',
    btnGenerate: 'T\u1EA1o li\xEAn k\u1EBFt \u0111\u0103ng k\xFD', labelResult: 'URL \u0111\u0103ng k\xFD \u0111\xE3 t\u1EA1o:',
    btnCopy: 'Sao ch\xE9p URL', btnDownload: 'T\u1EA3i v\u1EC1 c\u1EA5u h\xECnh',
    msgEnterUrl: 'Vui l\xF2ng nh\u1EADp URL \u0111\u0103ng k\xFD', msgGenerated: '\u0110\xE3 t\u1EA1o URL \u0111\u0103ng k\xFD',
    labelRename: '\u0110\u1ED5i t\xEAn n\xFAt (t\xF9y ch\u1ECDn)', placeholderRename: 'vd: HK@HongKong|JP@Japan', btnAddUrl: 'Th\xEAm \u0111\u0103ng k\xFD', labelUa: 'User-Agent t\xF9y ch\u1EC9nh (t\xF9y ch\u1ECDn)', placeholderUa: 'M\u1EB7c \u0111\u1ECBnh: clash-verge/<m\u1EDBi nh\u1EA5t>',
    msgCopied: '\u0110\xE3 sao ch\xE9p v\xE0o clipboard', msgDownloadStarted: 'B\u1EAFt \u0111\u1EA7u t\u1EA3i xu\u1ED1ng', msgDownloadFailed: 'T\u1EA3i xu\u1ED1ng th\u1EA5t b\u1EA1i',
  },
  'fa': {
    title: 'Prism - \u0645\u0628\u062F\u0644 \u0627\u0634\u062A\u0631\u0627\u06A9 \u067E\u0631\u0648\u06A9\u0633\u06CC', tagline: '\u0627\u0628\u0632\u0627\u0631 \u062A\u0628\u062F\u06CC\u0644 \u0627\u0634\u062A\u0631\u0627\u06A9 \u067E\u0631\u0648\u06A9\u0633\u06CC \u0686\u0646\u062F \u0641\u0631\u0645\u062A\u06CC',
    modeBasic: '\u067E\u0627\u06CC\u0647', modeAdvanced: '\u067E\u06CC\u0634\u0631\u0641\u062A\u0647',
    labelUrl: 'URL \u0627\u0634\u062A\u0631\u0627\u06A9', labelConfig: '\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0642\u0648\u0627\u0646\u06CC\u0646', labelCustomConfig: 'URL \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0642\u0648\u0627\u0646\u06CC\u0646 \u0633\u0641\u0627\u0631\u0634\u06CC',
    optDefault: '\u067E\u06CC\u0634\u200C\u0641\u0631\u0636 (\u0628\u062F\u0648\u0646 \u062A\u063A\u06CC\u06CC\u0631 \u0642\u0648\u0627\u0646\u06CC\u0646)', optPreset: '\u0642\u0648\u0627\u0646\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0641\u0631\u0636 Prism', optCustom: '\u0633\u0641\u0627\u0631\u0634\u06CC',
    labelTarget: '\u0641\u0631\u0645\u062A \u062E\u0631\u0648\u062C\u06CC', optClash: 'Clash / Mihomo (YAML)', optSingbox: 'sing-box (JSON)', optSurge: 'Surge (INI)',
    labelFilename: '\u0646\u0627\u0645 \u0641\u0627\u06CC\u0644 \u062E\u0631\u0648\u062C\u06CC (\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC)', placeholderFilename: '\u067E\u06CC\u0634\u200C\u0641\u0631\u0636: Prism',
    advancedParams: '\u067E\u0627\u0631\u0627\u0645\u062A\u0631\u0647\u0627\u06CC \u067E\u06CC\u0634\u0631\u0641\u062A\u0647',
    toggleEmoji: '\u062D\u0641\u0638 \u0627\u06CC\u0645\u0648\u062C\u06CC', toggleTFO: 'TCP Fast Open', toggleUDP: '\u0627\u062C\u0628\u0627\u0631 UDP',
    toggleSCV: '\u0631\u062F \u0634\u062F\u0646 \u0627\u0632 \u062A\u0623\u06CC\u06CC\u062F \u06AF\u0648\u0627\u0647\u06CC', toggleSort: '\u0645\u0631\u062A\u0628\u200C\u0633\u0627\u0632\u06CC \u0633\u0631\u0648\u0631\u0647\u0627', toggleExpand: '\u06AF\u0633\u062A\u0631\u0634 \u0645\u062D\u062A\u0648\u0627\u06CC \u0642\u0648\u0627\u0646\u06CC\u0646',
    toggleAppendType: '\u0627\u0641\u0632\u0648\u062F\u0646 \u0628\u0631\u0686\u0633\u0628 \u0646\u0648\u0639 \u0628\u0647 \u0646\u0627\u0645 \u0633\u0631\u0648\u0631', toggleTLS13: 'TLS 1.3',
    labelInclude: '\u0634\u0627\u0645\u0644 \u0633\u0631\u0648\u0631\u0647\u0627 (\u0639\u0628\u0627\u0631\u062A \u0645\u0646\u0638\u0645)', placeholderInclude: '\u0645\u062B\u0627\u0644: HK|JP|TW',
    labelExclude: '\u062D\u0630\u0641 \u0633\u0631\u0648\u0631\u0647\u0627 (\u0639\u0628\u0627\u0631\u062A \u0645\u0646\u0638\u0645)', placeholderExclude: '\u0645\u062B\u0627\u0644: remaining|official|expired',
    btnGenerate: '\u0627\u06CC\u062C\u0627\u062F \u0644\u06CC\u0646\u06A9 \u0627\u0634\u062A\u0631\u0627\u06A9', labelResult: '\u0644\u06CC\u0646\u06A9 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F\u0647:',
    btnCopy: '\u06A9\u067E\u06CC URL', btnDownload: '\u062F\u0627\u0646\u0644\u0648\u062F \u067E\u06CC\u06A9\u0631\u0628\u0646\u062F\u06CC',
    msgEnterUrl: '\u0644\u0637\u0641\u0627\u064B URL \u0627\u0634\u062A\u0631\u0627\u06A9 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F', msgGenerated: '\u0644\u06CC\u0646\u06A9 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F',
    labelRename: '\u062A\u063A\u06CC\u06CC\u0631 \u0646\u0627\u0645 \u0633\u0631\u0648\u0631 (\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC)', placeholderRename: '\u0645\u062B\u0627\u0644: HK@HongKong|JP@Japan', btnAddUrl: '\u0627\u0641\u0632\u0648\u062F\u0646 \u0627\u0634\u062A\u0631\u0627\u06A9', labelUa: 'User-Agent \u0633\u0641\u0627\u0631\u0634\u06CC (\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC)', placeholderUa: '\u067E\u06CC\u0634\u200C\u0641\u0631\u0636: clash-verge/<\u0622\u062E\u0631\u06CC\u0646>',
    msgCopied: '\u062F\u0631 \u06A9\u0644\u06CC\u067E\u200C\u0628\u0648\u0631\u062F \u06A9\u067E\u06CC \u0634\u062F', msgDownloadStarted: '\u062F\u0627\u0646\u0644\u0648\u062F \u0622\u063A\u0627\u0632 \u0634\u062F', msgDownloadFailed: '\u062F\u0627\u0646\u0644\u0648\u062F \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F',
  },

};

var LANG_KEY = 'prism-lang';
var currentLang;

function detectLanguage() {
  var stored;
  try { stored = localStorage.getItem(LANG_KEY); } catch(e) {}
  if (stored && I18N[stored]) return stored;
  var nav = navigator.language || '';
  if (nav.startsWith('zh')) return (nav.includes('Hant')||nav.includes('TW')||nav.includes('HK'))?'zh-Hant':'zh-Hans';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('ru')) return 'ru';
  if (nav.startsWith('vi')) return 'vi';
  if (nav.startsWith('ar')) return 'ar';
  if (nav.startsWith('fa')) return 'fa';
  if (nav.startsWith('en')) return 'en';
  return 'zh-Hans';
}

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N['zh-Hans'][key]) || key;
}

var _measureEl;
function measureTextWidth(text, font) {
  if (!_measureEl) {
    _measureEl = document.createElement('span');
    _measureEl.style.position = 'absolute';
    _measureEl.style.visibility = 'hidden';
    _measureEl.style.whiteSpace = 'nowrap';
    document.body.appendChild(_measureEl);
  }
  _measureEl.style.font = font;
  _measureEl.textContent = text;
  return _measureEl.getBoundingClientRect().width;
}

var FLIP_SEL = '.brand, .brand h1, .brand p, .header-actions, .header-btn, label, .card-title, .form-group, .form-row, input, textarea, .btn-add-url, .btn-primary, .btn-sm, .mode-btn, .toggle-item, .url-row, .url-row-del, .custom-select-trigger, .custom-select-trigger-text, .custom-select-arrow, .custom-select, .result-actions, .status, #advanced, #config-custom-group';

var TEXT_SEL = 'label:not(.toggle-item), .card-title, .custom-select-trigger, .brand h1, .brand p, .status, input[type="text"], input:not([type]), textarea';

function doApplyLanguage(lang, newDir) {
  currentLang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch(e) {}

  document.documentElement.lang = lang;
  document.documentElement.dir = newDir;
  document.title = I18N[lang].title;
  var langSelect = document.querySelector('#lang-select-wrapper select');
  if (langSelect) langSelect.value = lang;

  [].forEach.call(document.querySelectorAll('[data-i18n]'), function(el) {
    var k = el.getAttribute('data-i18n');
    if (!I18N[lang] || !I18N[lang][k]) return;
    var cn = el.childNodes;
    for (var i = cn.length - 1; i >= 0; i--) {
      if (cn[i].nodeType === 3) { cn[i].textContent = ' ' + I18N[lang][k]; break; }
    }
  });

  [].forEach.call(document.querySelectorAll('[data-i18n-placeholder]'), function(el) {
    var k = el.getAttribute('data-i18n-placeholder');
    if (I18N[lang] && I18N[lang][k]) el.placeholder = I18N[lang][k];
  });

  var optSets = {config: ['optDefault','optPreset','optCustom'], target: ['optClash','optSingbox','optSurge']};
  for (var sid in optSets) {
    var s = document.getElementById(sid === 'config' ? 'config-select' : 'target');
    var keys = optSets[sid];
    if (s) for (var j = 0; j < keys.length; j++) {
      if (s.options[j]) s.options[j].textContent = I18N[lang][keys[j]];
    }
  }

  [].forEach.call(document.querySelectorAll('.custom-select'), function(w) {
    var sel = w.querySelector('select');
    if (!sel) return;
    var tt = w.querySelector('.custom-select-trigger-text');
    var val = sel.value;
    [].forEach.call(w.querySelectorAll('.custom-select-option'), function(o) {
      if (o.getAttribute('data-value') === val && tt) tt.textContent = o.textContent;
    });
    if (w.id === 'lang-select-wrapper' && tt) {
      tt.textContent = {'zh-Hans':'\u7B80\u4F53\u4E2D\u6587','zh-Hant':'\u7E41\u9AD4\u4E2D\u6587','en':'English','ja':'\u65E5\u672C\u8A9E','ko':'\uD55C\uAD6D\uC5B4','ru':'\u0420\u0443\u0441\u0441\u043A\u0438\u0439','vi':'Ti\u1EBFng Vi\u1EC7t','ar':'\u0627\u0644\u0639\u0631\u0628\u064A\u0629','fa':'\u0641\u0627\u0631\u0633\u06CC'}[lang] || '\u7B80\u4F53\u4E2D\u6587';
      [].forEach.call(w.querySelectorAll('.custom-select-option'), function(option) {
        var selected = option.getAttribute('data-value') === lang;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-selected', String(selected));
        if (selected) w.querySelector('.custom-select-trigger').setAttribute('aria-activedescendant', option.id || '');
      });
    }
  });

  var st = document.getElementById('status');
  var sk = st && st.getAttribute('data-i18n-status');
  if (sk) st.textContent = t(sk);
}

function applyLanguage(lang) {
  var prevDir = document.documentElement.dir;
  var newDir = (lang === 'ar' || lang === 'fa') ? 'rtl' : 'ltr';
  var dirChanged = prevDir && prevDir !== newDir;

  if (!dirChanged) {
    doApplyLanguage(lang, newDir);
    return;
  }

  var DURATION = 350;
  var EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

  var flipEls = document.querySelectorAll(FLIP_SEL);
  var flips = [];
  for (var i = 0; i < flipEls.length; i++) {
    flips.push({ el: flipEls[i], rect: flipEls[i].getBoundingClientRect() });
  }

  var tEls = document.querySelectorAll(TEXT_SEL);
  var textAnims = [];
  for (var i = 0; i < tEls.length; i++) {
    var el = tEls[i];
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.matches('#url, #config-custom, #result-url')) continue;
      if (!el.value || !el.value.trim()) continue;
    } else {
      var txt = (el.textContent || '').trim();
      if (!txt) continue;
    }
    var st = getComputedStyle(el);
    var val = (el.value || el.textContent || '').trim();
    var tw = measureTextWidth(val, st.font);
    if (tw <= 0) continue;
    textAnims.push({
      el: el,
      oldTW: tw,
      oldPL: parseFloat(st.paddingLeft) || 0,
      oldPR: parseFloat(st.paddingRight) || 0,
      oldCW: el.clientWidth
    });
  }

  doApplyLanguage(lang, newDir);

  for (var i = 0; i < textAnims.length; i++) {
    var ta = textAnims[i];
    var val = (ta.el.value || ta.el.textContent || '').trim();
    if (!val) continue;
    var st = getComputedStyle(ta.el);
    var newTW = measureTextWidth(val, st.font);
    var pl = parseFloat(st.paddingLeft) || 0;
    var pr = parseFloat(st.paddingRight) || 0;
    var cw = ta.el.clientWidth;

    var beforeX = (prevDir === 'rtl') ? (ta.oldCW - ta.oldPR - ta.oldTW) : ta.oldPL;
    var afterX = (newDir === 'rtl') ? (cw - pr - newTW) : pl;
    var delta = afterX - beforeX;
    if (Math.abs(delta) < 1) continue;

    ta.indent = (newDir === 'rtl') ? delta : -delta;
    ta.el.style.whiteSpace = 'nowrap';
    ta.el.style.textIndent = ta.indent + 'px';
  }

  for (var i = 0; i < flips.length; i++) {
    var item = flips[i];
    var first = item.rect;
    var last = item.el.getBoundingClientRect();
    var dx = first.left - last.left;
    var dy = first.top - last.top;
    if (dx !== 0 || dy !== 0) {
      (function(el, x, y) {
        el.style.translate = x + 'px ' + y + 'px';
        var a = el.animate([
          { translate: x + 'px ' + y + 'px' },
          { translate: '0px 0px' }
        ], { duration: DURATION, easing: EASING, fill: 'forwards' });
        a.onfinish = function() { el.style.translate = ''; a.cancel(); };
      })(item.el, dx, dy);
    }
  }

  for (var i = 0; i < textAnims.length; i++) {
    var ta = textAnims[i];
    if (ta.indent === undefined) continue;
    (function(el, indent) {
      var a = el.animate([
        { textIndent: indent + 'px' },
        { textIndent: '0px' }
      ], { duration: DURATION, easing: EASING, fill: 'forwards' });
      a.onfinish = function() { el.style.textIndent = ''; el.style.whiteSpace = ''; a.cancel(); };
    })(ta.el, ta.indent);
  }
}

currentLang = detectLanguage();
applyLanguage(currentLang);
setMode('basic');
onConfigChange();

// ========== \u73B0\u6709\u4E1A\u52A1\u51FD\u6570 ==========
function onConfigChange() {
  var val = document.getElementById('config-select').value;
  var group = document.getElementById('config-custom-group');
  var visible = val === '__custom__';
  group.classList.toggle('show', visible);
  group.setAttribute('aria-hidden', String(!visible));
  [].forEach.call(group.querySelectorAll('input, select, textarea, button'), function(el) { el.disabled = !visible; });
}

function setMode(mode) {
  var advanced = document.getElementById('advanced');
  var isAdvanced = mode === 'advanced';
  advanced.classList.toggle('show', isAdvanced);
  advanced.setAttribute('aria-hidden', String(!isAdvanced));
  [].forEach.call(advanced.querySelectorAll('input, select, textarea, button'), function(el) { el.disabled = !isAdvanced; });
  document.getElementById('mode-toggle').classList.toggle('advanced', isAdvanced);
  document.getElementById('mode-basic').classList.toggle('active', !isAdvanced);
  document.getElementById('mode-advanced').classList.toggle('active', isAdvanced);
}

function generateSubscription() {
  var urlEls = document.querySelectorAll('.url-input');
  var urls = [];
  var invalid = false;
  urlEls.forEach(function(el) {
    var v = el.value.trim();
    if (!v) return;
    try {
      var parsed = new URL(v);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') invalid = true;
    } catch (e) { invalid = true; }
    urls.push(v);
  });
  if (urls.length === 0) {
    clearResult();
    showResult('msgEnterUrl');
    return;
  }
  if (invalid || urls.length > 5) {
    clearResult();
    showResult('msgEnterUrl');
    return;
  }

  var includeValue = document.getElementById('include').value.trim();
  var excludeValue = document.getElementById('exclude').value.trim();
  try {
    if (includeValue) new RegExp(includeValue);
    if (excludeValue) new RegExp(excludeValue);
  } catch (e) {
    clearResult();
    showResult('msgEnterUrl');
    return;
  }

  var params = new URLSearchParams();
  params.set('target', document.getElementById('target').value);
  urls.forEach(function(url) { params.append('url', url); });

  var configVal = document.getElementById('config-select').value.trim();
  if (configVal === '__custom__') {
    configVal = document.getElementById('config-custom').value.trim();
  }
  if (configVal) params.set('config', configVal);

  var filename = document.getElementById('filename').value.trim();
  if (!filename) filename = 'Prism';
  filename = filename.replace(/\\.(yaml|json|conf)$/i, '');
  params.set('filename', filename);

  var defaults = { emoji: true, tfo: false, udp: false, scv: false, sort: false, expand: true, append_type: false, tls13: false };
  var isAdvanced = document.getElementById('advanced').classList.contains('show');
  ['emoji','tfo','udp','scv','sort','expand','append_type','tls13'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      var val = el.checked;
      if (isAdvanced || val !== defaults[id]) params.set(id, val ? 'true' : 'false');
    }
  });

  var include = document.getElementById('include').value.trim();
  if (include) params.set('include', include);
  var exclude = document.getElementById('exclude').value.trim();
  if (exclude) params.set('exclude', exclude);
  var rename = document.getElementById('rename').value.trim();
  if (rename) params.set('rename', rename);
  var ua = document.getElementById('ua').value.trim();
  if (ua) params.set('ua', ua);

  var apiUrl = window.location.origin + '/sub?' + params.toString();

  generatedTarget = document.getElementById('target').value;
  generatedFilename = filename;
  document.getElementById('result-url').value = apiUrl;
  document.getElementById('result-section').style.display = 'block';
  document.getElementById('btn-copy').disabled = false;
  document.getElementById('btn-download').disabled = false;
  setStatus('msgGenerated');
}

function addUrlRow() {
  var container = document.getElementById('url-rows');
  var row = document.createElement('div');
  row.className = 'url-row';
  var index = document.querySelectorAll('.url-row').length;
  row.innerHTML = '<input type="url" id="url-' + index + '" class="url-input" required autocomplete="url"><button class="url-row-del" onclick="removeUrlRow(this)" title="\u5220\u9664" aria-label="\u5220\u9664\u8BA2\u9605\u94FE\u63A5">\xD7</button>';
  container.appendChild(row);
  updateUrlDelButtons();
}

function removeUrlRow(btn) {
  var row = btn.parentElement;
  row.remove();
  updateUrlDelButtons();
}

function updateUrlDelButtons() {
  var rows = document.querySelectorAll('.url-row');
  // \u4EC5\u5269\u4E00\u884C\u65F6\u9690\u85CF\u5220\u9664\u6309\u94AE
  rows.forEach(function(row, i) {
    var btn = row.querySelector('.url-row-del');
    if (btn) btn.style.display = rows.length <= 1 ? 'none' : '';
  });
}

function setStatus(key) {
  var el = document.getElementById('status');
  el.textContent = t(key);
  el.setAttribute('data-i18n-status', key);
}
function clearResult() {
  document.getElementById('result-url').value = '';
  document.getElementById('btn-copy').disabled = true;
  document.getElementById('btn-download').disabled = true;
  generatedTarget = null;
  generatedFilename = null;
}
function showResult(key) {
  setStatus(key);
  document.getElementById('result-section').style.display = 'block';
}

function copyUrl() {
  var el = document.getElementById('result-url');
  if (!el.value) return;
  el.select();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(el.value).then(function() {
      setStatus('msgCopied');
    }).catch(function() {
      setStatus('msgDownloadFailed');
    });
  } else {
    try {
      document.execCommand('copy');
      setStatus('msgCopied');
    } catch (e) {
      setStatus('msgDownloadFailed');
    }
  }
}

var generatedTarget = null;
var generatedFilename = null;

async function downloadConfig() {
  var apiUrl = document.getElementById('result-url').value;
  if (!apiUrl) { setStatus('msgDownloadFailed'); return; }
  var extMap = { clash: '.yaml', singbox: '.json', surge: '.conf' };
  var ext = extMap[generatedTarget || document.getElementById('target').value] || '.yaml';
  var name = generatedFilename || document.getElementById('filename').value.trim() || 'Prism';
  name = name.replace(/.(yaml|json|conf)$/i, '') + ext;
  try {
    var resp = await fetch(apiUrl, { referrerPolicy: 'no-referrer' });
    if (!resp.ok) throw new Error('download failed');
    var blob = await resp.blob();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 0);
    setStatus('msgDownloadStarted');
  } catch(e) {
    setStatus('msgDownloadFailed');
  }
}
</script>`;
  }
});

// src/frontend/index.ts
var FRONTEND_HTML;
var init_frontend = __esm({
  "src/frontend/index.ts"() {
    "use strict";
    init_css();
    init_body2();
    init_script();
    FRONTEND_HTML = `${HEAD}${BODY}${SCRIPT}
</body>
</html>`;
  }
});

// src/worker.ts
var worker_exports = {};
__export(worker_exports, {
  default: () => worker_default,
  parseVergeTagFromLocation: () => parseVergeTagFromLocation
});
import { getCookie } from "hono/cookie";
function parseQueryParams(c) {
  const q = c.req.query();
  return {
    target: q.target || DEFAULT_PARAMS.target,
    url: q.url || DEFAULT_PARAMS.url,
    config: q.config || void 0,
    include: q.include || void 0,
    exclude: q.exclude || void 0,
    rename: q.rename || void 0,
    filename: q.filename || void 0,
    emoji: parseBool(q.emoji) ?? DEFAULT_PARAMS.emoji,
    append_type: parseBool(q.append_type) ?? DEFAULT_PARAMS.append_type,
    tfo: parseBool(q.tfo) ?? DEFAULT_PARAMS.tfo,
    udp: parseBool(q.udp) ?? DEFAULT_PARAMS.udp,
    sort: parseBool(q.sort) ?? DEFAULT_PARAMS.sort,
    scv: parseBool(q.scv) ?? DEFAULT_PARAMS.scv,
    expand: parseBool(q.expand) ?? DEFAULT_PARAMS.expand,
    tls13: parseBool(q.tls13) ?? DEFAULT_PARAMS.tls13,
    ua: q.ua || void 0
  };
}
function getSourceUrls(c) {
  const values = c.req.queries("url") || [];
  if (values.length > 1) return values.map((value) => value.trim()).filter(Boolean);
  if (values.length === 1) {
    const value = values[0].trim();
    if (!value.includes("|")) return [value];
    const legacy = value.split("|").map((part) => part.trim()).filter(Boolean);
    return legacy.length > 1 && legacy.every(isSafeUrl) ? legacy : [value];
  }
  return [];
}
async function buildUpstreamHeaders(c) {
  const q = c.req.query();
  const requested = (q.ua || "").trim();
  const ua = requested || await resolveDefaultUa();
  return { "User-Agent": ua };
}
async function resolveDefaultUa() {
  if (vergeVersionCache && vergeVersionCache.expires > Date.now()) return vergeVersionCache.ua;
  if (!vergeVersionInFlight) {
    vergeVersionInFlight = fetchLatestVergeTag().then((tag) => {
      vergeVersionCache = { ua: `clash-verge/${tag}`, expires: Date.now() + VERGE_VERSION_CACHE_TTL_MS };
      return vergeVersionCache.ua;
    }).catch((err) => {
      console.error("\u83B7\u53D6 Clash Verge \u6700\u65B0\u7248\u672C\u5931\u8D25\uFF0C\u4F7F\u7528\u56DE\u9000 UA:", err.message);
      vergeVersionCache = { ua: FALLBACK_UA, expires: Date.now() + VERGE_VERSION_FAILURE_TTL_MS };
      return FALLBACK_UA;
    }).finally(() => {
      vergeVersionInFlight = null;
    });
  }
  return vergeVersionInFlight;
}
async function fetchLatestVergeTag() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERGE_VERSION_TIMEOUT_MS);
  try {
    const response = await fetch(VERGE_LATEST_RELEASE_URL, {
      headers: { "User-Agent": FALLBACK_UA },
      redirect: "manual",
      signal: controller.signal
    });
    if (response.status < 300 || response.status >= 400) {
      throw new Error(`GitHub \u8FD4\u56DE\u610F\u5916\u72B6\u6001\u7801 ${response.status}`);
    }
    const tag = parseVergeTagFromLocation(response.headers.get("location") || "");
    if (!tag) throw new Error("\u65E0\u6CD5\u4ECE\u91CD\u5B9A\u5411\u5730\u5740\u89E3\u6790\u7248\u672C\u53F7");
    return tag;
  } finally {
    clearTimeout(timer);
  }
}
function parseVergeTagFromLocation(location) {
  const match2 = location.match(/\/tag\/(v\d+(?:\.\d+){0,3})$/);
  return match2 ? match2[1] : null;
}
function validateParams(params) {
  if (!["clash", "singbox", "surge"].includes(params.target)) return "\u9519\u8BEF\uFF1A\u4E0D\u652F\u6301\u7684 target \u7C7B\u578B";
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > MAX_PARAM_LENGTH) return `\u9519\u8BEF\uFF1A${name} \u53C2\u6570\u8FC7\u957F`;
  }
  if (params.config && !isSafeUrl(params.config)) return "\u9519\u8BEF\uFF1Aconfig \u5FC5\u987B\u662F\u5B89\u5168\u7684 HTTP(S) URL";
  if (params.ua && !/^[^\r\n]{1,256}$/.test(params.ua)) return "\u9519\u8BEF\uFF1AUser-Agent \u65E0\u6548";
  for (const pattern of [params.include, params.exclude]) {
    if (pattern) {
      try {
        new RegExp(pattern);
      } catch {
        return "\u9519\u8BEF\uFF1A\u8FC7\u6EE4\u6B63\u5219\u8868\u8FBE\u5F0F\u65E0\u6548";
      }
    }
  }
  return null;
}
function isSafeUrl(raw2) {
  if (!raw2 || raw2.length > MAX_URL_LENGTH || /[\r\n]/.test(raw2)) return false;
  let url;
  try {
    url = new URL(raw2);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "metadata.google.internal" || host === "169.254.169.254") return false;
  if (/^(127|10|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  const match2 = host.match(/^172\.(\d{1,3})\./);
  if (match2 && Number(match2[1]) >= 16 && Number(match2[1]) <= 31) return false;
  if (/^(::1|fc|fd|fe8|fe9|fea|feb)/i.test(host)) return false;
  return true;
}
async function fetchTextSafe(rawUrl, headers, maxBytes, redirects = 0) {
  if (!isSafeUrl(rawUrl)) throw new Error("\u76EE\u6807 URL \u4E0D\u88AB\u5141\u8BB8");
  if (redirects > MAX_REDIRECTS) throw new Error("\u91CD\u5B9A\u5411\u6B21\u6570\u8FC7\u591A");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(rawUrl, { headers, redirect: "manual", signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("\u4E0A\u6E38\u91CD\u5B9A\u5411\u7F3A\u5C11\u76EE\u6807");
    const next = new URL(location, rawUrl).toString();
    return fetchTextSafe(next, headers, maxBytes, redirects + 1);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("\u4E0A\u6E38\u54CD\u5E94\u8FC7\u5927");
  const text = await readBodyWithLimit(response, maxBytes, FETCH_TIMEOUT_MS);
  return { ok: response.ok, status: response.status, headers: response.headers, text };
}
async function readBodyWithLimit(response, maxBytes, timeoutMs) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("\u4E0A\u6E38\u54CD\u5E94\u8D85\u65F6")), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("\u4E0A\u6E38\u54CD\u5E94\u8FC7\u5927");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
function errorResponse(c, message, status) {
  return c.text(message, status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
}
function parseBool(value) {
  if (value === void 0 || value === null) return void 0;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  return void 0;
}
function mergeConfigs(configs) {
  const base = configs[0];
  const allProxies = configs.flatMap((config) => config.proxies || []);
  const seenProxies = /* @__PURE__ */ new Set();
  const proxies = allProxies.filter((proxy) => {
    if (seenProxies.has(proxy.name)) return false;
    seenProxies.add(proxy.name);
    return true;
  });
  const groupMap = /* @__PURE__ */ new Map();
  for (const config of configs) {
    for (const group of config["proxy-groups"] || []) {
      const current = groupMap.get(group.name);
      if (!current) {
        groupMap.set(group.name, { ...group, proxies: [...group.proxies || []] });
      } else {
        current.proxies = [.../* @__PURE__ */ new Set([...current.proxies || [], ...group.proxies || []])];
      }
    }
  }
  const rules = [...new Set(configs.flatMap((config) => config.rules || []))];
  const dns = Object.assign({}, ...configs.map((config) => config.dns || {}));
  const hosts = Object.assign({}, ...configs.map((config) => config.hosts || {}));
  const merged = { ...base, proxies };
  if (groupMap.size > 0) merged["proxy-groups"] = [...groupMap.values()];
  if (rules.length > 0) merged.rules = rules;
  if (Object.keys(dns).length > 0) merged.dns = dns;
  if (Object.keys(hosts).length > 0) merged.hosts = hosts;
  return merged;
}
function createDefaultIniConfig() {
  return {
    rulesetEntries: [],
    customProxyGroups: [{ name: "\u{1F680} \u8282\u70B9\u9009\u62E9", groupType: "select", proxies: [".*"] }],
    enableRuleGenerator: false,
    overwriteOriginalRules: false
  };
}
function sanitizeFilename(value) {
  return value.replace(/[\r\n\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 120) || "Prism";
}
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
var app, MAX_SOURCE_URLS, MAX_RULESET_URLS, MAX_URL_LENGTH, MAX_PARAM_LENGTH, MAX_SUBSCRIPTION_BYTES, MAX_CONFIG_BYTES, MAX_RULESET_BYTES, FETCH_TIMEOUT_MS, MAX_REDIRECTS, FALLBACK_UA, VERGE_LATEST_RELEASE_URL, VERGE_VERSION_CACHE_TTL_MS, VERGE_VERSION_FAILURE_TTL_MS, VERGE_VERSION_TIMEOUT_MS, vergeVersionCache, vergeVersionInFlight, worker_default;
var init_worker = __esm({
  "src/worker.ts"() {
    "use strict";
    init_dist();
    init_yaml_parser();
    init_ini_parser();
    init_clash();
    init_singbox();
    init_surge();
    init_types();
    init_frontend();
    app = new Hono2();
    MAX_SOURCE_URLS = 5;
    MAX_RULESET_URLS = 50;
    MAX_URL_LENGTH = 2048;
    MAX_PARAM_LENGTH = 4096;
    MAX_SUBSCRIPTION_BYTES = 2 * 1024 * 1024;
    MAX_CONFIG_BYTES = 512 * 1024;
    MAX_RULESET_BYTES = 1024 * 1024;
    FETCH_TIMEOUT_MS = 15e3;
    MAX_REDIRECTS = 3;
    FALLBACK_UA = "clash-verge/v2.5.2";
    VERGE_LATEST_RELEASE_URL = "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest";
    VERGE_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
    VERGE_VERSION_FAILURE_TTL_MS = 10 * 60 * 1e3;
    VERGE_VERSION_TIMEOUT_MS = 5e3;
    app.get("/", (c) => {
      const theme = getCookie(c, "prism-theme");
      if (theme === "light" || theme === "dark") {
        const html = FRONTEND_HTML.replace(
          '<html lang="zh-Hans">',
          `<html lang="zh-Hans" data-theme="${theme}">`
        );
        return c.html(html);
      }
      return c.html(FRONTEND_HTML);
    });
    app.get("/sub", async (c) => {
      try {
        const params = parseQueryParams(c);
        const validationError = validateParams(params);
        if (validationError) return errorResponse(c, validationError, 400);
        const urls = getSourceUrls(c);
        if (urls.length === 0) {
          return errorResponse(c, "\u9519\u8BEF\uFF1A\u7F3A\u5C11 url \u53C2\u6570\uFF08\u539F\u59CB\u8BA2\u9605\u94FE\u63A5\uFF09", 400);
        }
        if (urls.length > MAX_SOURCE_URLS) {
          return errorResponse(c, `\u9519\u8BEF\uFF1A\u6700\u591A\u652F\u6301 ${MAX_SOURCE_URLS} \u4E2A\u8BA2\u9605\u94FE\u63A5`, 400);
        }
        let sourceConfig;
        let upstreamUserInfo = null;
        try {
          const results = [];
          for (let index = 0; index < urls.length; index++) {
            const response = await fetchTextSafe(urls[index], await buildUpstreamHeaders(c), MAX_SUBSCRIPTION_BYTES);
            if (!response.ok) {
              throw new Error(`\u8BA2\u9605 ${index + 1} \u8FD4\u56DE HTTP ${response.status}`);
            }
            if (!upstreamUserInfo) upstreamUserInfo = response.headers.get("subscription-userinfo");
            results.push(parseClashYaml(response.text));
          }
          sourceConfig = mergeConfigs(results);
        } catch (err) {
          console.error("\u4E0B\u8F7D\u6216\u89E3\u6790\u8BA2\u9605\u5931\u8D25:", err.message);
          return errorResponse(c, "\u9519\u8BEF\uFF1A\u4E0B\u8F7D\u6216\u89E3\u6790\u8BA2\u9605\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u94FE\u63A5\u6216\u7A0D\u540E\u91CD\u8BD5", 502);
        }
        if (!sourceConfig.proxies || sourceConfig.proxies.length === 0) {
          return errorResponse(c, "\u9519\u8BEF\uFF1A\u8BA2\u9605\u4E2D\u672A\u627E\u5230\u6709\u6548\u4EE3\u7406\u8282\u70B9", 400);
        }
        let iniConfig = createDefaultIniConfig();
        const ruleContents = {};
        if (params.config) {
          try {
            const configResponse = await fetchTextSafe(params.config, await buildUpstreamHeaders(c), MAX_CONFIG_BYTES);
            if (!configResponse.ok) {
              return errorResponse(c, "\u9519\u8BEF\uFF1A\u65E0\u6CD5\u4E0B\u8F7D\u89C4\u5219\u914D\u7F6E", 502);
            }
            iniConfig = parseIniConfig(configResponse.text);
            const entries = iniConfig.rulesetEntries.filter((entry) => !entry.isSpecial && entry.url).slice(0, MAX_RULESET_URLS);
            const results = await mapWithConcurrency(entries, 3, async (entry) => {
              try {
                const ruleResponse = await fetchTextSafe(entry.url, await buildUpstreamHeaders(c), MAX_RULESET_BYTES);
                if (!ruleResponse.ok) return { url: entry.url, lines: [] };
                return {
                  url: entry.url,
                  lines: ruleResponse.text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith(";"))
                };
              } catch {
                return { url: entry.url, lines: [] };
              }
            });
            for (const { url, lines } of results) ruleContents[url] = lines;
          } catch (err) {
            console.error("\u4E0B\u8F7D\u89C4\u5219\u914D\u7F6E\u5931\u8D25:", err.message);
            return errorResponse(c, "\u9519\u8BEF\uFF1A\u65E0\u6CD5\u4E0B\u8F7D\u6216\u89E3\u6790\u89C4\u5219\u914D\u7F6E", 502);
          }
        }
        let output;
        let contentType;
        const cleanBase = sanitizeFilename(params.filename || "Prism");
        switch (params.target) {
          case "clash":
            output = generateClashConfig(sourceConfig, iniConfig, params, ruleContents);
            contentType = "text/yaml; charset=utf-8";
            break;
          case "singbox":
            output = generateSingboxConfig(sourceConfig, iniConfig, params, ruleContents);
            contentType = "application/json; charset=utf-8";
            break;
          case "surge":
            output = generateSurgeConfig(sourceConfig, iniConfig, params, ruleContents);
            contentType = "text/plain; charset=utf-8";
            break;
          default:
            return errorResponse(c, "\u9519\u8BEF\uFF1A\u4E0D\u652F\u6301\u7684 target \u7C7B\u578B", 400);
        }
        const userInfoHeader = upstreamUserInfo && upstreamUserInfo.trim() !== "" ? upstreamUserInfo : "upload=0; download=0; total=0; expire=0";
        const safeName = utf8ToBase64(cleanBase);
        return new Response(output, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(cleanBase)}`,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "subscription-userinfo": userInfoHeader,
            "profile-update-interval": "24",
            "profile-title": safeName
          }
        });
      } catch (err) {
        console.error("\u8F6C\u6362\u5F02\u5E38:", err.message);
        return errorResponse(c, "\u5185\u90E8\u9519\u8BEF\uFF1A\u8BA2\u9605\u8F6C\u6362\u5931\u8D25", 500);
      }
    });
    app.options("/sub", (c) => new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      }
    }));
    vergeVersionCache = null;
    vergeVersionInFlight = null;
    worker_default = app;
  }
});

// src/vercel.ts
var app2;
var MAX_BODY_BYTES = 1024 * 1024;
async function handler(req, res) {
  if (!app2) {
    try {
      app2 = (await Promise.resolve().then(() => (init_worker(), worker_exports))).default;
    } catch (err) {
      console.error("Vercel app import failed:", err?.message);
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Prism \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528");
      return;
    }
  }
  try {
    const url = new URL(req.url || "/", "http://localhost").toString();
    const headers = new Headers();
    for (const key of Object.keys(req.headers || {})) {
      const val = req.headers[key];
      if (val != null) headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
    }
    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentLength = Number(req.headers?.["content-length"] || 0);
      if (contentLength > MAX_BODY_BYTES) {
        res.statusCode = 413;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("\u8BF7\u6C42\u4F53\u8FC7\u5927");
        return;
      }
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on("data", (chunk) => {
          total += chunk.byteLength;
          if (total > MAX_BODY_BYTES) {
            reject(new Error("request body too large"));
            req.destroy?.();
            return;
          }
          chunks.push(chunk);
        });
        req.on("error", reject);
        req.on("end", () => {
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }
          resolve(merged);
        });
      });
    }
    const webReq = new Request(url, { method: req.method || "GET", headers, body });
    const webRes = await app2.fetch(webReq);
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    if (webRes.body) res.end(new Uint8Array(await webRes.arrayBuffer()));
    else res.end();
  } catch (err) {
    console.error("Vercel request failed:", err?.message);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Prism \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528");
  }
}
export {
  handler as default
};
