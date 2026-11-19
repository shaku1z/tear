export declare const DEVELOPER_ONLY_ROLE: string;
export declare function sourcePathOfModule(id: string): string | undefined;
export declare function loadDeveloperOnlyMatcher(rolesFile?: URL | string): (file: string) => boolean;
export declare function developerModulesInBundle(
  modules: Iterable<readonly [id: string, renderedLength: number]>,
  isDeveloperOnly: (file: string) => boolean,
): string[];
