declare module 'js-yaml' {
  export interface LoadOptions {
    json?: boolean;
  }

  export interface DumpOptions {
    indent?: number;
    lineWidth?: number;
    noRefs?: boolean;
    sortKeys?: boolean;
    flowLevel?: number;
    skipInvalid?: boolean;
  }

  export function load(input: string, options?: LoadOptions): unknown;
  export function dump(input: unknown, options?: DumpOptions): string;
  const yaml: { load: typeof load; dump: typeof dump };
  export default yaml;
}
