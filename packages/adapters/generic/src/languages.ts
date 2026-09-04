const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  astro  : "astro",
  bash   : "shell",
  c      : "c",
  cc     : "cpp",
  cjs    : "javascript",
  clj    : "clojure",
  cpp    : "cpp",
  cs     : "csharp",
  cshtml : "razor",
  csx    : "csharp",
  cts    : "typescript",
  cxx    : "cpp",
  dart   : "dart",
  erl    : "erlang",
  ex     : "elixir",
  exs    : "elixir",
  fs     : "fsharp",
  fsi    : "fsharp",
  fsx    : "fsharp",
  go     : "go",
  gql    : "graphql",
  graphql: "graphql",
  groovy : "groovy",
  h      : "c",
  hh     : "cpp",
  hpp    : "cpp",
  hs     : "haskell",
  hxx    : "cpp",
  java   : "java",
  js     : "javascript",
  jsp    : "jsp",
  jsx    : "jsx",
  kt     : "kotlin",
  kts    : "kotlin",
  lua    : "lua",
  m      : "objective-c",
  mjs    : "javascript",
  mm     : "objective-cpp",
  mts    : "typescript",
  php    : "php",
  phtml  : "php",
  pl     : "perl",
  proto  : "protobuf",
  ps1    : "powershell",
  psm1   : "powershell",
  py     : "python",
  pyi    : "python",
  pyw    : "python",
  pyx    : "cython",
  rake   : "ruby",
  rb     : "ruby",
  razor  : "razor",
  rs     : "rust",
  sc     : "scala",
  scala  : "scala",
  sh     : "shell",
  sql    : "sql",
  svelte : "svelte",
  swift  : "swift",
  ts     : "typescript",
  tsx    : "tsx",
  vb     : "vbnet",
  vbhtml : "razor",
  vue    : "vue",
  zig    : "zig",
  zsh    : "shell",
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
