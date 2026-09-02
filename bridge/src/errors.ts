import type { RecipeErrorCode } from '../../lib/manifest';

export class RecipeError extends Error {
  code: RecipeErrorCode;
  hint?: string;
  step?: number;
  op?: string;

  constructor(code: RecipeErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'RecipeError';
    this.code = code;
    this.hint = hint;
  }
}

export function isRecipeError(e: unknown): e is RecipeError {
  return e instanceof RecipeError || (typeof e === 'object' && e !== null && (e as RecipeError).name === 'RecipeError');
}

export function toRecipeError(e: unknown): RecipeError {
  if (isRecipeError(e)) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && e.name === 'AbortError') return new RecipeError('ABORTED', msg || 'Aborted');
  return new RecipeError('INTERNAL', msg || 'Unknown error');
}

export function defaultHint(code: RecipeErrorCode, path: string): string {
  switch (code) {
    case 'VALIDATION':
      return 'Fix the input and call the tool again.';
    case 'TARGET_NOT_FOUND':
      return `The target is not on the current page (${path}). Open the right page first (e.g. call the matching get_/open_ tool) or check the id.`;
    case 'TIMEOUT':
      return 'The page did not update in time; retry once or narrow the query.';
    case 'PRECONDITION':
      return '';
    case 'DECLINED':
      return 'The user declined. Do not retry without new instructions.';
    case 'NAVIGATION_REQUIRED':
      return 'Call the matching open_* tool then retry.';
    case 'NETWORK':
      return 'The request failed; retry once, then report the problem to the user.';
    case 'BUSY':
      return 'Wait for the running tool to finish.';
    case 'ABORTED':
      return 'The call was cancelled.';
    default:
      return 'Unexpected bridge error; retry once and report it if it persists.';
  }
}

export function formatError(e: RecipeError, path: string): string {
  const where = e.step ? ` at step ${e.step} (${e.op ?? '?'})` : '';
  const msg = e.message.replace(/[.\s]+$/, '');
  const hint = e.hint !== undefined ? e.hint : defaultHint(e.code, path);
  return `ERROR ${e.code}${where}: ${msg}.${hint ? ' ' + hint : ''}`;
}
