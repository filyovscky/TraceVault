import js from '@eslint/js';
import globals from 'globals';
export default [js.configs.recommended,{files:['**/*.js','**/*.mjs'],languageOptions:{ecmaVersion:2024,sourceType:'module',globals:{...globals.browser,...globals.node,chrome:'readonly',showDirectoryPicker:'readonly',Highlight:'readonly'}},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_'}],'no-empty':['error',{allowEmptyCatch:true}]}}];
