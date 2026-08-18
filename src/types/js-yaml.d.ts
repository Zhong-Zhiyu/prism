declare module 'js-yaml' {
  export interface LoadOptions {
    json?: boolean;
  }

  export function load(input: string, options?: LoadOptions): unknown;
  const yaml: { load: typeof load };
  export default yaml;
}
