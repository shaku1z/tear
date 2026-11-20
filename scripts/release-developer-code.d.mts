export declare const DEVELOPER_ONLY_ROLE: string;
export declare const MOBILE_ONLY_ROLE: string;
export declare function sourcePathOfModule(id: string): string | undefined;
export declare function loadRoleMatcher(role: string, rolesFile?: URL | string): (file: string) => boolean;
export declare function loadDeveloperOnlyMatcher(rolesFile?: URL | string): (file: string) => boolean;
export declare function roleModulesInBundle(
  modules: Iterable<readonly [id: string, renderedLength: number]>,
  inRole: (file: string) => boolean,
): string[];
export declare function developerModulesInBundle(
  modules: Iterable<readonly [id: string, renderedLength: number]>,
  isDeveloperOnly: (file: string) => boolean,
): string[];
