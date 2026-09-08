import fs from 'node:fs/promises';
import path from 'node:path';
export async function ensureDir(p){await fs.mkdir(p,{recursive:true});}
export async function readJson(p){return JSON.parse(await fs.readFile(p,'utf8'));}
export async function writeJson(p,v){await ensureDir(path.dirname(p));await fs.writeFile(p,JSON.stringify(v,null,2));}
export async function appendJsonl(p,v){await ensureDir(path.dirname(p));await fs.appendFile(p,JSON.stringify(v)+'\n');}
export function slug(s){return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);}
export async function exists(p){try{await fs.access(p);return true}catch{return false}}
