import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.e2e.mjs',workers:1,timeout:90000,reporter:[['list'],['json',{outputFile:'output/playwright/results.json'}]],use:{trace:'retain-on-failure'},outputDir:'output/playwright/test-results'});
