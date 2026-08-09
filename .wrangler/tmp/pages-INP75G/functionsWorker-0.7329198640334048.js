var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/watchmode.js
var MATCH_TTL_SECONDS = 60 * 60 * 24 * 30;
var PROVIDER_TTL_SECONDS = 60 * 60 * 24 * 7;
var REVIEW_TTL_SECONDS = 60 * 60 * 24;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff"
};
function json(payload, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl
    }
  });
}
__name(json, "json");
function fold(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(fold, "fold");
function numericYear(value) {
  const match2 = String(value || "").match(/(?:19|20)\d{2}/);
  return match2 ? Number(match2[0]) : null;
}
__name(numericYear, "numericYear");
function candidateYear(candidate = {}) {
  return numericYear(candidate.year || candidate.release_date || candidate.first_air_date);
}
__name(candidateYear, "candidateYear");
function requestedTypeFamily(value = "") {
  const type = fold(value);
  if (!type) return [];
  if (/movie|film/.test(type)) return ["movie", "tv_movie", "short_film"];
  if (/special/.test(type)) return ["tv_special"];
  if (/ova|ona/.test(type)) return ["tv_series", "tv_special", "tv_miniseries"];
  if (/tv|series/.test(type)) return ["tv_series", "tv_miniseries"];
  return [];
}
__name(requestedTypeFamily, "requestedTypeFamily");
function scoreCandidate(candidate, identity) {
  const name = fold(candidate.name || candidate.title);
  const exactName = identity.names.includes(name);
  const requestedYear = identity.year;
  const year = candidateYear(candidate);
  const yearDifference = requestedYear && year ? Math.abs(requestedYear - year) : null;
  const type = String(candidate.type || candidate.tmdb_type || "").toLowerCase();
  const typeExpected = identity.types.length > 0;
  const typeExact = !typeExpected || identity.types.includes(type);
  let score = exactName ? 60 : 0;
  if (!exactName && identity.names.some((alias) => alias.includes(name) || name.includes(alias))) score += 30;
  if (requestedYear && year) {
    if (yearDifference === 0) score += 25;
    else if (yearDifference === 1) score += 10;
    else score -= 45;
  } else if (!requestedYear) {
    score += 5;
  }
  if (typeExpected) score += typeExact ? 15 : -25;
  return {
    id: Number(candidate.id),
    name: String(candidate.name || candidate.title || "").trim(),
    year,
    type,
    score,
    exactName,
    yearExact: Boolean(requestedYear && year && requestedYear === year),
    typeExact
  };
}
__name(scoreCandidate, "scoreCandidate");
function publicCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    year: candidate.year,
    type: candidate.type,
    confidence: Math.max(0, Math.min(100, candidate.score))
  };
}
__name(publicCandidate, "publicCandidate");
async function cacheKey(kind, values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => params.set(key, String(value || "")));
  const input = new TextEncoder().encode(`${kind}:${params.toString()}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `watchmode:v1:${kind}:${hash}`;
}
__name(cacheKey, "cacheKey");
function edgeCacheRequest(key) {
  return new Request(`https://joeanimedb-watchmode-cache.invalid/${key}`, { method: "GET" });
}
__name(edgeCacheRequest, "edgeCacheRequest");
async function readCache(context, key) {
  const namespace = context.env.WATCHMODE_CACHE;
  if (namespace?.get) {
    try {
      const payload = await namespace.get(key, { type: "json", cacheTtl: 60 });
      if (payload) return { payload, source: "KV" };
    } catch (error) {
      console.warn("Watchmode KV read failed; trying the edge cache.", error);
    }
  }
  if (typeof caches !== "undefined" && caches.default) {
    try {
      const response = await caches.default.match(edgeCacheRequest(key));
      if (response) return { payload: await response.json(), source: "EDGE" };
    } catch (error) {
      console.warn("Watchmode edge cache read failed.", error);
    }
  }
  return null;
}
__name(readCache, "readCache");
async function writeCache(context, key, payload, ttl) {
  const writes = [];
  const namespace = context.env.WATCHMODE_CACHE;
  if (namespace?.put) {
    writes.push(namespace.put(key, JSON.stringify(payload), { expirationTtl: ttl }));
  }
  if (typeof caches !== "undefined" && caches.default) {
    const response = json(payload, 200, `public, max-age=${ttl}`);
    writes.push(caches.default.put(edgeCacheRequest(key), response));
  }
  if (!writes.length) return;
  const operation = Promise.allSettled(writes);
  if (context.waitUntil) context.waitUntil(operation);
  else await operation;
}
__name(writeCache, "writeCache");
async function watchmodeJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Watchmode request failed with status ${response.status}.`);
  return response.json();
}
__name(watchmodeJson, "watchmodeJson");
async function findTitleMatch(context, identity, apiKey, forceReview = false) {
  const key = await cacheKey("match", {
    title: identity.names[0],
    aliases: identity.names.slice(1).join("|"),
    year: identity.year || "",
    type: identity.types.join(",")
  });
  if (!forceReview) {
    const cached = await readCache(context, key);
    if (cached) return { payload: cached.payload, cache: cached.source };
  }
  const url = new URL("https://api.watchmode.com/v1/search/");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("search_field", "name");
  url.searchParams.set("search_value", identity.searchTitle);
  const result = await watchmodeJson(url);
  const candidates = (Array.isArray(result.title_results) ? result.title_results : []).map((candidate) => scoreCandidate(candidate, identity)).filter((candidate) => Number.isInteger(candidate.id) && candidate.id > 0 && candidate.name).sort((left, right) => right.score - left.score).slice(0, 5);
  const best = candidates[0];
  const runnerUp = candidates[1];
  const highConfidence = Boolean(
    best && best.exactName && best.yearExact && best.typeExact && best.score >= 90 && (!runnerUp || best.score - runnerUp.score >= 12)
  );
  const payload = highConfidence && !forceReview ? { status: "matched", match: publicCandidate(best) } : candidates.length ? { status: "needs_review", candidates: candidates.slice(0, 3).map(publicCandidate) } : { status: "not_found", candidates: [] };
  if (forceReview) {
    const reviewPayload = candidates.length ? { status: "needs_review", candidates: candidates.slice(0, 3).map(publicCandidate) } : { status: "not_found", candidates: [] };
    return { payload: reviewPayload, cache: "BYPASS" };
  }
  const ttl = highConfidence ? MATCH_TTL_SECONDS : REVIEW_TTL_SECONDS;
  await writeCache(context, key, payload, ttl);
  return { payload, cache: "MISS" };
}
__name(findTitleMatch, "findTitleMatch");
async function fetchProviders(context, watchmodeId, region, apiKey) {
  const key = await cacheKey("providers", { watchmodeId, region });
  const cached = await readCache(context, key);
  if (cached) return { providers: cached.payload.providers || [], cache: cached.source };
  const url = new URL(`https://api.watchmode.com/v1/title/${watchmodeId}/sources/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);
  const sources = await watchmodeJson(url);
  const seen = /* @__PURE__ */ new Set();
  const providers = (Array.isArray(sources) ? sources : []).filter((source) => source.type === "sub").map((source) => ({
    name: String(source.name || "").trim(),
    url: String(source.web_url || "").trim(),
    format: String(source.format || "").trim(),
    region
  })).filter((source) => source.name && /^https:\/\//i.test(source.url)).filter((source) => {
    const identity = source.name.toLowerCase();
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).sort((left, right) => left.name.localeCompare(right.name));
  await writeCache(context, key, { providers }, PROVIDER_TTL_SECONDS);
  return { providers, cache: "MISS" };
}
__name(fetchProviders, "fetchProviders");
function allowedRegions(env) {
  return String(env.WATCHMODE_REGIONS || "US,CA,GB").split(",").map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value)).slice(0, 3);
}
__name(allowedRegions, "allowedRegions");
async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
__name(onRequestOptions, "onRequestOptions");
async function onRequestGet(context) {
  try {
    const apiKey = String(context.env.WATCHMODE_API_KEY || "").trim();
    if (!apiKey) return json({ error: "Where to Watch is not configured." }, 503);
    const requestUrl = new URL(context.request.url);
    const title = String(requestUrl.searchParams.get("title") || "").trim().slice(0, 180);
    const region = String(requestUrl.searchParams.get("region") || "").toUpperCase();
    const regions = allowedRegions(context.env);
    if (!title) return json({ error: "A title is required." }, 400);
    if (!regions.includes(region)) return json({ error: "That streaming region is not supported." }, 400);
    const requestedId = Number(requestUrl.searchParams.get("watchmodeId"));
    const forceReview = requestUrl.searchParams.get("forceReview") === "1";
    const year = numericYear(requestUrl.searchParams.get("year"));
    const requestedType = String(requestUrl.searchParams.get("type") || "").slice(0, 40);
    const aliases = String(requestUrl.searchParams.get("aliases") || "").split("|").map((value) => fold(value)).filter(Boolean).slice(0, 6);
    const primaryName = fold(title);
    const identity = {
      searchTitle: title,
      names: [.../* @__PURE__ */ new Set([primaryName, ...aliases])],
      year,
      types: requestedTypeFamily(requestedType)
    };
    let match2;
    let matchCache;
    if (Number.isInteger(requestedId) && requestedId > 0) {
      match2 = { id: requestedId, name: title, year, type: requestedType, confirmed: true };
      matchCache = "CONFIRMED";
    } else {
      const result = await findTitleMatch(context, identity, apiKey, forceReview);
      if (result.payload.status !== "matched") {
        return json({
          ...result.payload,
          cache: { match: result.cache }
        });
      }
      match2 = result.payload.match;
      matchCache = result.cache;
    }
    const providerResult = await fetchProviders(context, match2.id, region, apiKey);
    return json({
      status: "ready",
      match: match2,
      region,
      providers: providerResult.providers,
      cache: {
        match: matchCache,
        providers: providerResult.cache
      }
    });
  } catch (error) {
    console.error("Watchmode proxy failed:", error);
    return json({ error: "Where to Watch is temporarily unavailable." }, 502);
  }
}
__name(onRequestGet, "onRequestGet");

// ../.wrangler/tmp/pages-INP75G/functionsRoutes-0.6362052633927902.mjs
var routes = [
  {
    routePath: "/api/watchmode",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/watchmode",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  }
];

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
