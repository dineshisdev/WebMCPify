export function normText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function abortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function setNativeValue(el: Element, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value') ?? Object.getOwnPropertyDescriptor(el, 'value');
  if (desc && typeof desc.set === 'function') desc.set.call(el, value);
  else (el as HTMLInputElement).value = value;
}

export function setNativeChecked(el: Element, checked: boolean): void {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, 'checked');
  if (desc && typeof desc.set === 'function') desc.set.call(el, checked);
  else (el as HTMLInputElement).checked = checked;
}

export function fireInput(el: Element, data?: string): void {
  let ev: Event;
  try {
    ev = new InputEvent('input', { bubbles: true, cancelable: false, data: data ?? null, inputType: 'insertText' });
  } catch {
    ev = new Event('input', { bubbles: true });
  }
  el.dispatchEvent(ev);
}

export function fireChange(el: Element): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const KEYS: Record<string, { code: string; keyCode: number }> = {
  Enter: { code: 'Enter', keyCode: 13 },
  Escape: { code: 'Escape', keyCode: 27 },
  Tab: { code: 'Tab', keyCode: 9 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  Backspace: { code: 'Backspace', keyCode: 8 },
};

export function keyEvent(type: string, key: string): KeyboardEvent {
  const meta = KEYS[key];
  const code = meta ? meta.code : key.length === 1 ? (/[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : '') : key;
  const keyCode = meta ? meta.keyCode : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const init: KeyboardEventInit & { keyCode?: number; charCode?: number; which?: number } = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    keyCode,
    which: keyCode,
    charCode: type === 'keypress' ? keyCode : 0,
  };
  const ev = new KeyboardEvent(type, init);
  try {
    Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
    Object.defineProperty(ev, 'which', { get: () => keyCode });
  } catch {}
  return ev;
}

export function pressKey(el: Element, key: string): boolean {
  const down = keyEvent('keydown', key);
  const downOk = el.dispatchEvent(down);
  const pressOk = el.dispatchEvent(keyEvent('keypress', key));
  el.dispatchEvent(keyEvent('keyup', key));
  return !downOk || !pressOk;
}

export function focusEl(el: Element): void {
  if (typeof (el as HTMLElement).focus === 'function') {
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {}
  }
}

export function scrollCenter(el: Element): void {
  try {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {}
}

export function waitForDomIdle(quietMs = 300, timeoutMs = 4000, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const root = document.documentElement;
    if (!root || typeof MutationObserver === 'undefined') {
      setTimeout(resolve, Math.min(quietMs, timeoutMs));
      return;
    }
    let quiet: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (quiet !== undefined) clearTimeout(quiet);
      clearTimeout(hard);
      mo.disconnect();
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const arm = () => {
      if (quiet !== undefined) clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    };
    const mo = new MutationObserver(arm);
    mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    const hard = setTimeout(finish, timeoutMs);
    signal?.addEventListener('abort', finish, { once: true });
    arm();
  });
}

export function pollUntil(check: () => boolean, timeoutMs: number, signal?: AbortSignal, intervalMs = 100): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ok: boolean, err?: Error) => {
      if (done) return;
      done = true;
      clearInterval(iv);
      clearTimeout(hard);
      mo?.disconnect();
      signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(ok);
    };
    const tick = () => {
      try {
        if (check()) finish(true);
      } catch (e) {
        finish(false, e instanceof Error ? e : new Error(String(e)));
      }
    };
    const onAbort = () => finish(false, abortError());
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const iv = setInterval(tick, intervalMs);
    const hard = setTimeout(() => finish(false), timeoutMs);
    let mo: MutationObserver | undefined;
    const root = document.documentElement;
    if (root && typeof MutationObserver !== 'undefined') {
      let kick: ReturnType<typeof setTimeout> | undefined;
      mo = new MutationObserver(() => {
        if (kick !== undefined) return;
        kick = setTimeout(() => {
          kick = undefined;
          tick();
        }, 20);
      });
      mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    tick();
  });
}
