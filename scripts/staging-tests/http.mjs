import { TestFailure, invariant } from "./errors.mjs";

export class AmbiguousMutation extends Error {
  constructor(code = "MUTATION_OUTCOME_AMBIGUOUS") { super(code); this.code = code; }
}

function setCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,=]+=[^;,]*)/) : [];
}

export class CookieJar {
  #cookies = new Map();
  constructor(initial = {}) { for (const [name, value] of Object.entries(initial)) this.#cookies.set(name, value); }
  absorb(values) {
    for (const value of values) {
      const [pair, ...attributes] = value.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      const deleted = attributes.some(attribute => /^\s*max-age\s*=\s*0\s*$/i.test(attribute));
      if (deleted || cookieValue === "") this.#cookies.delete(name); else this.#cookies.set(name, cookieValue);
    }
  }
  names() { return [...this.#cookies.keys()].sort(); }
  header() { return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
  serialize() { return Object.fromEntries(this.#cookies); }
}

/**
 * Build a same-origin API transport with durable cookie callbacks.
 * @param {{origin: string, fetchImpl?: (url: URL, init: RequestInit) => Promise<Response>, jar?: CookieJar, timeoutMs?: number, onCookies?: (data: Record<string, string>) => void | Promise<void>, beforeDispatch?: (request: {pathname: string, method: string, mutation: boolean}) => void | Promise<void>}} options
 */
export function createApi({ origin, fetchImpl = fetch, jar = new CookieJar(), timeoutMs = 15_000, onCookies, beforeDispatch }) {
  const safeOrigin = new URL(origin).origin;
  return {
    jar,
    async request(path, options = {}) {
      const url = new URL(path, `${safeOrigin}/`);
      invariant(url.origin === safeOrigin, "CROSS_ORIGIN_REQUEST_FORBIDDEN");
      if (beforeDispatch) await beforeDispatch({ pathname: url.pathname,
        method: (options.method ?? "GET").toUpperCase(), mutation: options.mutation === true });
      const headers = new Headers({ accept: "application/json", ...(options.headers ?? {}) });
      if (jar.header()) headers.set("cookie", jar.header());
      const init = {
        method: options.method ?? "GET", headers, redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? timeoutMs),
      };
      if (options.body !== undefined) {
        headers.set("content-type", "application/json");
        init.body = JSON.stringify(options.body);
      }
      let response;
      try { response = await fetchImpl(url, init); }
      catch (error) {
        if (options.mutation) throw new AmbiguousMutation();
        throw new TestFailure("READ_REQUEST_FAILED", error instanceof Error ? error.message : "Read request failed");
      }
      let text;
      try {
        jar.absorb(setCookieValues(response.headers));
        await onCookies?.(jar.serialize());
        text = await response.text();
      } catch {
        if (options.mutation) throw new AmbiguousMutation("MUTATION_RESPONSE_LOST_AMBIGUOUS");
        throw new TestFailure("READ_RESPONSE_FAILED");
      }
      if (options.mutation && response.status >= 500) throw new AmbiguousMutation("MUTATION_SERVER_ERROR_AMBIGUOUS");
      let body = null;
      try { body = text ? JSON.parse(text) : null; }
      catch {
        if (options.mutation) throw new AmbiguousMutation("MUTATION_INVALID_RESPONSE_AMBIGUOUS");
        throw new TestFailure("INVALID_JSON_RESPONSE");
      }
      return { status: response.status, ok: response.ok, body, headers: response.headers };
    },
  };
}
