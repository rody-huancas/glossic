const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  c     : "c",
  cc    : "cpp",
  cjs   : "javascript",
  clj   : "clojure",
  cpp   : "cpp",
  cs    : "csharp",
  cts   : "typescript",
  cxx   : "cpp",
  dart  : "dart",
  erl   : "erlang",
  ex    : "elixir",
  exs   : "elixir",
  go    : "go",
  h     : "c",
  hpp   : "cpp",
  hs    : "haskell",
  java  : "java",
  js    : "javascript",
  jsx   : "jsx",
  kt    : "kotlin",
  kts   : "kotlin",
  lua   : "lua",
  mjs   : "javascript",
  mts   : "typescript",
  php   : "php",
  pl    : "perl",
  py    : "python",
  rb    : "ruby",
  rs    : "rust",
  scala : "scala",
  sh    : "shell",
  sql   : "sql",
  svelte: "svelte",
  swift : "swift",
  ts    : "typescript",
  tsx   : "tsx",
  vue   : "vue",
  zig   : "zig",
};


export const inferLanguage = (filePath: string): string | undefined => {
  const base = filePath.slice(filePath.lastIndexOf("/") + 1);
  const dot  = base.lastIndexOf(".");

  if (dot <= 0) {
    return undefined;
  }
  
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1).toLowerCase()];
};

export const isSourceFile = (filePath: string): boolean => inferLanguage(filePath) !== undefined;
