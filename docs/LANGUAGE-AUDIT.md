# Snapshot com idiomas corrigidos

Após a auditoria de idioma, o piloto recebeu correções terminológicas e um
glossário na versão [v3](TRANSLATION-PILOT-V3.md). Os arquivos auditados abaixo
continuam sendo a origem dos workspaces novos `pilot-v3` e `full-v3`.

A auditoria dos 1.392 originais produziu um novo snapshot com 1.391 pares em inglês
e um em português; nenhum par foi identificado como originalmente espanhol.
Foram corrigidos 827 rótulos. Perguntas, respostas, evidências, IDs, artigo e split
foram preservados. `data/datasets/validated.jsonl` não foi alterado.

Este resultado é uma identificação automática com revisão por IA, não certificação
humana de idioma ou de conteúdo científico. A validade científica dos originais
continua sendo a do filtro anterior, sujeita à revisão editorial.

## Arquivos e rastreabilidade

Diretório: `data/translations/language-audit-v2/`.

- `originals-input.jsonl`: cópia dos registros históricos.
- `language-audit.jsonl`: identificação separada da pergunta e da resposta,
  escores, método, idioma declarado e idioma decidido.
- `resolutions.jsonl`: decisões por IA dos 193 casos ambíguos do detector,
  vinculadas ao hash do texto original; 43 respostas são identificadores,
  fórmulas ou expressões neutras. Não são traduções nem aprovações científicas.
- `originals-language-corrected.jsonl`: os 1.392 pares prontos para tradução,
  com `languageBeforeAudit`, `language` corrigido e metadados de proveniência.
- `pending.jsonl`: vazio ao final desta auditoria; incertezas futuras não devem
  ser forçadas para um dos idiomas.
- `manifest.json` / `summary.json`: origem, checksum e contagens.

O detector local Lingua 2.1.1 compara en/es/pt e também fr/de/it para reduzir
classificações forçadas entre apenas três idiomas. São usados limiar 0,9/margem
0,25, regras explícitas de sintaxe inglesa e vocábulos inequívocos para alguns
casos. Esses escores não são probabilidades calibradas. Respostas numéricas ou
LaTeX sem prosa podem ser neutras. Casos curtos, mistos ou inconclusivos ficam
pendentes; não se infere o idioma de uma resposta apenas pelo idioma da pergunta.

Os 193 casos pendentes da primeira passagem da versão 2 foram inspecionados pelo
Codex e receberam decisões de idioma em `resolutions.jsonl`. `confidence=0.99`
nessas decisões expressa julgamento subjetivo do revisor de IA, não uma medição
estatística nem um resultado obtido executando o Qwen. Nenhuma chamada ao Qwen
foi necessária para essa preparação.

Para reproduzir, com os mesmos arquivos e resoluções:

```bash
python3 -m venv .venv-language-audit
.venv-language-audit/bin/pip install -r config/language-audit-requirements.txt
npm run translations:audit-languages
```

O auditador usa lock e escrita atômica, recusa resoluções de texto alterado e
exige outro diretório se entrada ou configuração da auditoria mudar. Os IDs e
textos corrigidos são conferidos novamente na preparação das traduções.

## Novo piloto: 30 originais, 60 traduções

Está preparado em `data/translations/pilot-v2/`: 29 originais em inglês e o único
original em português, com diversidade de artigos e temas. Não se exigem dez
originais por idioma, pois os idiomas reais não têm essa distribuição.
O novo seletor usa `--sample-size 30`; as duas traduções de cada original são
somente para os idiomas que realmente faltam. O piloto histórico foi preservado
em `data/translations/pilot/` e não é reutilizado para exportar variantes erradas.

Para executar o novo piloto:

```bash
npm run translations:generate -- --out data/translations/pilot-v2
npm run translations:check -- --out data/translations/pilot-v2
npm run translations:review -- --out data/translations/pilot-v2
npm run translations:stats -- --out data/translations/pilot-v2
```

A preparação já feita pode ser reproduzida sem apagar resultados:

```bash
npm run translations:prepare -- \
  --input data/translations/language-audit-v2/originals-language-corrected.jsonl \
  --sample-size 30 --out data/translations/pilot-v2
```

A preservação literal de números, notação e código continua ativa. O problema
3D/tridimensional ou ponto/vírgula decimal pode ainda exigir regeneração ou revisão;
não foi liberada arbitrariamente a mudança de números. Glossário e termos técnicos
ainda precisam ser conferidos no novo piloto.

## Lote completo preparado: 1.392 originais, 2.784 traduções

O workspace `data/translations/full-v2/` já contém o manifesto e o snapshot
corrigido completo, mas a geração em massa não foi iniciada. Após avaliar o piloto:

```bash
npm run translations:generate -- --out data/translations/full-v2
npm run translations:check -- --out data/translations/full-v2
npm run translations:review -- --out data/translations/full-v2
npm run translations:stats -- --out data/translations/full-v2
```

Para exportar após revisar, use `translations:export -- --out data/translations/full-v2`.
O padrão editorial, a política automática opcional e a separação por artigo continuam
os mesmos do [fluxo trilíngue](TRILINGUAL-DATASET.md). O teto permanece 4.176 exemplos
trilíngues e 1.392 conteúdos distintos, antes de eventuais exclusões de qualidade.
