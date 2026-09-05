export const MAX_PARSE_BYTES = 512_000;

export type GrammarName = "javascript" | "tsx" | "typescript";


const GRAMMAR_BY_LANGUAGE: Readonly<Record<string, GrammarName>> = {
  javascript: "javascript",
  jsx       : "javascript",
  tsx       : "tsx",
  typescript: "typescript",
};

export const grammarFor = (language: string): GrammarName | undefined => {
  return GRAMMAR_BY_LANGUAGE[language];
};
