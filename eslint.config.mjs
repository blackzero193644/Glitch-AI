import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'dist-standalone/**/*', 'node_modules/**/*', 'src/**/*', 'server/**/*', 'netlify/**/*', 'server.ts'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
