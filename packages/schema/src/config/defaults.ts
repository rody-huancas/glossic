export const DEFAULT_EXCLUDE: readonly string[] = [
  "**/.gradle/**",
  "**/.ipynb_checkpoints/**",
  "**/.mypy_cache/**",
  "**/.next/**",
  "**/.nox/**",
  "**/.nuxt/**",
  "**/.pytest_cache/**",
  "**/.ruff_cache/**",
  "**/.svelte-kit/**",
  "**/.tox/**",
  "**/.turbo/**",
  "**/.vs/**",
  "**/TestResults/**",
  "**/*.egg-info/**",
  "**/.eggs/**",
  "**/__pycache__/**",
  "**/bootstrap/cache/**",
  "**/build/**",
  "**/coverage/**",
  "**/dist/**",
  "**/htmlcov/**",
  "**/obj/**",
  "**/out/**",
  "**/public/assets/**",
  "**/public/build/**",
  "**/public/packs/**",
  "**/storage/framework/**",
  "**/target/**",
  "**/tmp/**",
];


export const DEFAULT_IGNORE_UNITS: readonly string[] = [
  "*.config.ts",
  "*.config.mts",
  "*.config.cts",
  "*.config.js",
  "*.config.mjs",
  "*.config.cjs",
  "*.config.json",
  "tsconfig*.json",
  "package.json",
  ".*",

  "**/bin/**",
  "**/gen/**",
  "**/generated-sources/**",
  "**/__generated__/**",
  "**/generated/**",
  "**/*.generated.*",

  "**/migrations/**",
  "**/migration/**",
  "**/db/migrate/**",
  "**/alembic/versions/**",
  "**/seeders/**",
  "**/seeds/**",
  "**/factories/**",
  "**/schema.rb",
  "**/seeds.rb",

  "**/*.designer.cs",
  "**/*.g.cs",
  "**/*.g.i.cs",
  "**/assemblyinfo.cs",
  "**/globalusings.g.cs",

  "**/*_pb2.py",
  "**/*_pb2_grpc.py",
  "**/setup.py",
  "**/manage.py",
  "**/wsgi.py",
  "**/asgi.py",
  "**/conftest.py",

  "**/*.pb.go",
  "**/*.pb.gw.go",
  "**/*_gen.go",
  "**/*.gen.go",
  "**/zz_generated.*",
  "**/wire_gen.go",
  "**/*_string.go",
  "**/testdata/**",
  "**/__fixtures__/**",
  "**/mocks/**",

  "**/r.java",
  "**/buildconfig.java",
  "**/dagger*.java",
  "**/*_factory.java",
  "**/*_membersinjector.java",

  "**/_ide_helper*.php",

  "**/bindings.rs",
  "**/*.gen.rs",
  "**/benches/**",
];


export const DEFAULT_EXCLUDE_FROM_CONTENT: readonly string[] = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/spec/**",
  "**/*_test.go",
  "**/*_test.py",
  "**/test_*.py",
  "**/*_test.rs",
  "**/*_spec.rb",
];


export const LIST_DEFAULTS = {
  exclude           : DEFAULT_EXCLUDE,
  ignoreUnits       : DEFAULT_IGNORE_UNITS,
  excludeFromContent: DEFAULT_EXCLUDE_FROM_CONTENT,
} as const;

export const ADDITIVE_LIST_KEYS = ["exclude", "ignoreUnits", "excludeFromContent"] as const;

export type AdditiveListKey = (typeof ADDITIVE_LIST_KEYS)[number];
