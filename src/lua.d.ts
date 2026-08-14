declare module "*.lua?raw" {
  const source: string;
  export default source;
}

declare module "fengari" {
  export const lua: any;
  export const lauxlib: any;
  export const lualib: any;
  export const to_luastring: (value: string) => Uint8Array;
  export const to_jsstring: (value: Uint8Array) => string;
}
