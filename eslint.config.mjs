import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The render loop is deliberately imperative.
    //
    // React Three Fiber's whole contract is that `useFrame` mutates three.js
    // objects in place — the camera, materials, object transforms — sixty
    // times a second, precisely so React never re-renders for them. The
    // React-Compiler hook rules read that as illegal mutation of hook values,
    // which for a game loop is exactly the code we want.
    files: ["components/game/**/*.tsx", "components/ui/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      // Cinematic overlays (the arrival card, the reveal flash) start a timed
      // sequence when the game phase changes. That is an effect synchronising
      // with wall-clock time, not derived state.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
