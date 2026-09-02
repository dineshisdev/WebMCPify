import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "bridge/dist/**",
    "public/bridge.js",
    "worker/public/bridge.js",
    ".wrangler/**",
    "worker/.wrangler/**",
    ".data/**",
    "analyzer/samples/**",
  ]),
]);

export default eslintConfig;
