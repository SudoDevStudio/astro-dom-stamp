export interface RequestScope {
  skip: boolean;
}

let provider: (() => RequestScope | undefined) | null = null;

/**
 * Installed by the generated middleware on the server. Left unset in the
 * browser and in a build with no `excludeUrls`, where reading it costs one
 * null check.
 */
export function setScopeProvider(next: (() => RequestScope | undefined) | null): void {
  provider = next;
}

export function currentScope(): RequestScope | undefined {
  return provider === null ? undefined : provider();
}
