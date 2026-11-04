# Piloto v3: correções aplicadas e glossário congelado

**Configuração final de produção:** `config/translations-v5.json`, com
`promptVersion=4` e `config/translation-glossary-v3.json` (18 entradas, esquema
1/revisão 3). O lote completo atual é `data/translations/full-v5/`, preparado e
não iniciado. As revisões anteriores do glossário e os workspaces full-v3/full-v4
foram preservados. A revisão 3 acrescenta instruções de uso para a construção
impessoal em português e bloqueia o calque ela não se pode confiar.

**Atualização da geração:** o teste de geração com o primeiro glossário ainda
produziu calques no caso regulatório, embora o Qwen os tenha aprovado. Foi criada
a revisão 2 do glossário em `config/translation-glossary-v2.json` (18 entradas),
congelada por `config/translations-v4.json` (`promptVersion=3`). O lote completo
naquele teste era `full-v4`; foi substituído pelo `full-v5` após o ajuste final de sintaxe. O piloto v3
continua contendo os 26 textos corrigidos, revalidados com o glossário inicial.
Todos os seus 60 textos também são conferidos localmente contra o glossário final.

O workspace `data/translations/pilot-v3/` mantém os mesmos 30 originais do v2.
Foram aplicadas as 26 propostas registradas em `pilot-v2/ai-review-v1.jsonl`.
Cada proposta foi conferida contra os hashes da tradução e do original.
As outras 34 traduções foram copiadas sem mudança, com o parecer anterior
identificado por `inheritedFrom` e nova checagem local do glossário.
Somente os 26 textos alterados exigem nova chamada ao Qwen neste piloto.

Os arquivos do v2 permanecem intactos. `revision.json` no v3 registra hashes,
origem, número de correções e contagens **no momento da importação**; para o
estado atual, consulte `translations:stats`. Os textos corrigidos identificam
seu revisor/autor da alteração e o hash da tradução anterior.

## Glossário

`config/translation-glossary-v1.json` define 15 entradas contextuais. Exemplos:

- edge computing: computação de borda / computación de borde;
- SDGs: ODS, distinto de ODM;
- held-out likelihood: verossimilhança/verosimilitud em dados reservados;
- time-varying: variável no tempo, sem confundir com variância;
- morphing, pixel-flipping e siglas científicas preservados;
- eletrolisador, comprimento/longitud de deriva e ressalvas como most/up to.

O tradutor e o revisor recebem somente as entradas pertinentes ao original.
Termos proibidos e siglas exigidas também são conferidos localmente, campo a
campo. Preferências não são substituições cegas: o sentido e as qualificações
devem continuar iguais ao original. Números, código, URLs e fórmulas mantêm a
proteção literal. Regras conservadoras podem gerar falsos positivos e precisam
de inspeção; não demonstram, sozinhas, equivalência semântica.

`config/translations-v3.json` inclui `promptVersion=2` e o caminho do glossário.
Na preparação, o conteúdo completo é copiado para o manifesto e participa do
fingerprint. Editar o arquivo externo depois não altera um workspace preparado;
use nova configuração e outro diretório para uma nova versão.

## Comandos

A revisão já foi importada com:

```bash
npm run translations:revise -- \
  --from data/translations/pilot-v2 \
  --out data/translations/pilot-v3 \
  --config config/translations-v3.json
```

Repetir esse comando não apaga checks posteriores. Alterações nos dados de
origem/revisão exigem outro destino. Propostas não são aplicadas sobre o v2.
A importação não herda aprovações científicas dos originais.

Revalidar os textos corrigidos e acompanhar:

```bash
npm run translations:check -- --out data/translations/pilot-v3
npm run translations:stats -- --out data/translations/pilot-v3
tail -f data/logs/translations-pilot-v3.log
```

A checagem foi iniciada pelo assistente com redirecionamento para esse log.
O `stats` separa `inheritedChecks` de `freshChecks`, com `freshAccepted`,
`freshRejected` e `freshCheckMeanSeconds`. A projeção das checagens restantes
usa a média nova assim que houver medições. `inheritedGenerationTimings` indica
que os tempos de geração copiados pertencem ao v2; não são medições de geração
com o glossário. `freshTranslationMeanSeconds` fica nulo até haver geração nova.
Não execute outra checagem simultânea: há um lock de escrita por workspace.
Após concluir, traduções ainda rejeitadas exigem inspeção; não se deve forçar o
veredito nem baixar a nota mínima de 0,9. Novos pareceres incluem o hash do
protocolo de revisão; pareceres herdados identificam explicitamente a origem.

`generate --retry-rejected` foi ampliado para considerar também rejeições
editoriais correntes vinculadas ao hash, além das rejeições do filtro. Isso
permite regenerar itens sinalizados por revisão, sem alterar aprovados.
Uma nova tradução invalida a decisão editorial do texto anterior pelo hash.

## Lote completo

`data/translations/full-v5/` está preparado com os 1.392 originais corrigidos,
2.784 traduções previstas e o glossário novo. A geração em massa não foi iniciada.
Os workspaces full/full-v2 e os pilotos anteriores permanecem preservados.
Se o piloto revisado for considerado adequado, os comandos para o lote completo são:

```bash
npm run translations:generate -- --out data/translations/full-v5
npm run translations:check -- --out data/translations/full-v5
npm run translations:review -- --out data/translations/full-v5
npm run translations:stats -- --out data/translations/full-v5
```

Use explicitamente `--out`: os aliases sem essa opção continuam apontando para
o piloto histórico. O tempo estimado de aproximadamente 40 horas do piloto v2
não deve ser tratado como medição do protocolo novo, cujo glossário pode alterar
o custo das chamadas. Estatísticas novas atualizarão a projeção.

A revisão continua sendo feita por IA, comparando a tradução com o original;
o mesmo Qwen é usado como tradutor e revisor automático. Não é uma certificação
humana dos textos, dos artigos ou da correção científica. Nenhum treinamento
foi iniciado; a exportação editorial continua exigindo decisões válidas dos
originais e de suas duas traduções.

## Testes de geração nova

`pilot-v3-generator-smoke` gerou quatro traduções de dois originais reais,
sem fornecer propostas de tradução como entrada. O primeiro glossário acertou
borda/borde e ODS, mas ainda deixou previsivas/prevenientes e o calque confiada a
operar. O Qwen aceitou os quatro; a inspeção por IA marcou as duas traduções
regulatórias como rejeitadas em `review-decisions.json`.

O teste foi repetido em `pilot-v4-generator-smoke`, com o glossário final e os
mesmos originais, para conferir a regressão. Os textos do primeiro teste foram
preservados. Trata-se de um teste pequeno de regressão em casos conhecidos, não
de medição independente da qualidade geral do conjunto completo.

O teste v4 corrigiu preventivas, mas a saída regulatória em português ainda
trazia ela não se pode confiar; o revisor Qwen também a aprovou. A inspeção por
IA marcou esse caso para correção e a revisão 3 do glossário passou a bloqueá-lo.

`pilot-final-generator-smoke` reusou as outras três saídas somente após verificar
que os prompts de geração **e** revisão eram byte a byte idênticos entre as
configurações: as novas instruções só afetam a construção regulatória em português.
Esse único texto foi regenerado e recebe novo check. Os três pareceres herdados
registram origem e a verificação de identidade dos prompts. As propostas manuais
do piloto não foram fornecidas ao tradutor nesses testes de geração.

## Resultado concluído em 17/10/2026

As 26 correções do piloto v3 receberam novos pareceres positivos do Qwen, sem
rejeições, com média de 32,9 segundos por checagem. Junto das 34 traduções
inalteradas, são 60 aceites e 30 conteúdos trilíngues completos. As decisões de
revisão linguística por IA foram atualizadas para os hashes novos, sem aprovar
cientificamente os originais. Os 60 textos passaram pelas regras locais do
glossário final. Ver `pilot-v3/quality-comparison.json` para a comparação completa.

O teste final de geração também terminou com quatro saídas aprovadas pelo Qwen
e inspecionadas por IA. Três mantiveram prompts idênticos ao teste anterior; a
quarta foi regenerada, corrigindo a construção impessoal em português. Este é
um teste de regressão pequeno, não garantia de qualidade em todos os artigos.
Os 53 testes JavaScript passaram. A geração de 2.784 traduções no `full-v5`
permanece não iniciada.
