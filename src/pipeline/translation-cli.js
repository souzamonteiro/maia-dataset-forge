import { parseArgs } from 'node:util';
import * as pipeline from './translations.js';
import { reviseTranslations } from './translation-revision.js';
export async function translationCli(args=process.argv.slice(3)) {
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{
    out:{type:'string'},input:{type:'string'},config:{type:'string'},all:{type:'boolean',default:false},
    'per-language':{type:'string',default:'10'},limit:{type:'string'},'retry-rejected':{type:'boolean',default:false},
    'sample-size':{type:'string'},
    from:{type:'string'},reviews:{type:'string'},
    policy:{type:'string',default:'editorial'},'export-dir':{type:'string'},
  }});
  const command=positionals[0];
  if(positionals.length!==1)throw new Error('Usage: translations prepare|generate|check|review|stats|export [--out directory]');
  const o={out:values.out??(values.all?'data/translations/full':'data/translations/pilot'),input:values.input,config:values.config,all:values.all,perLanguage:Number(values['per-language']),limit:values.limit===undefined?undefined:Number(values.limit),retryRejected:values['retry-rejected'],policy:values.policy,exportDir:values['export-dir']};
  o.from=values.from;o.reviews=values.reviews;
  if(o.limit!==undefined&&(!Number.isInteger(o.limit)||o.limit<1))throw new Error('limit must be a positive integer');
  if(values['sample-size']!==undefined) {
    o.sampleSize=Number(values['sample-size']);
    if(!Number.isInteger(o.sampleSize)||o.sampleSize<1||o.all)throw new Error('sample-size must be a positive integer and cannot be combined with all');
  }
  const commands={prepare:pipeline.prepareTranslations,revise:reviseTranslations,generate:pipeline.generateTranslations,check:pipeline.checkTranslations,review:pipeline.translationReview,stats:pipeline.translationStats,export:pipeline.exportTranslations};
  if(!commands[command])throw new Error('Unknown translations command');
  await commands[command](o);
}
