#!/usr/bin/env node
import fs from 'node:fs';
if(fs.existsSync('.env')){for(const l of fs.readFileSync('.env','utf8').split(/\r?\n/)){const m=l.match(/^([^#=]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2]}}
const cmd=process.argv[2]||'help';
const map={discover:()=>import('./pipeline/discover.js').then(m=>m.discover()),download:()=>import('./pipeline/download.js').then(m=>m.downloadPapers()),extract:()=>import('./pipeline/extract.js').then(m=>m.extract()),generate:()=>import('./pipeline/generate.js').then(m=>m.generate()),validate:()=>import('./pipeline/validate.js').then(m=>m.validate()),export:()=>import('./pipeline/export.js').then(m=>m.exportDataset())};
if(cmd==='pipeline'){for(const x of ['discover','download','extract','generate','validate','export'])await map[x]();}else if(map[cmd])await map[cmd]();else console.log('Usage: node src/cli.js <discover|download|extract|generate|validate|export|pipeline>');
