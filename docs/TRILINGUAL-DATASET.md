# Dataset trilíngue para fine-tuning

O fluxo atual com glossário e correções versionadas está descrito em
[Piloto v3](TRANSLATION-PILOT-V3.md). Use explicitamente os diretórios `pilot-v3`
e `full-v5` para a configuração final do glossário; os exemplos históricos abaixo foram preservados.

Este fluxo usa somente pares já presentes em `data/datasets/validated.jsonl`.
Preserva o original e cria duas traduções diretas, sem traduzir a partir de outra
tradução. Com 1.392 originais, o teto é 4.176 exemplos em três idiomas, mas são
1.392 conteúdos distintos. Rejeições e revisões podem reduzir esse número.
Os 14 candidatos pendentes da validação original não entram neste snapshot.

## Preparação e piloto

O snapshot corrigido e os workspaces `pilot-v2` e `full-v2` já foram preparados.
Consulte [auditoria de idiomas e comandos atuais](LANGUAGE-AUDIT.md). Os comandos
sem `--out` abaixo continuam apontando para o piloto histórico; use explicitamente
`--out data/translations/pilot-v2` para o novo piloto.

**Atualização após inspeção do primeiro piloto:** foram encontrados rótulos pt/es
em originais com perguntas em inglês. Não escalar usando esses rótulos sem uma
auditoria de idioma em nova entrada. Ver [inspeção do piloto](TRANSLATION-PILOT-REVIEW.md).
O bloqueio conservador novo pode impedir a preparação com o catálogo histórico;
isso preserva os dados e exige corrigir a origem antes de produzir o dataset.

```bash
cd /home/roberto/projects/maia-dataset-forge
npm run translations:prepare
```

O padrão seleciona deterministicamente dez originais de cada idioma, buscando
artigos e temas diferentes: 30 originais e 60 traduções solicitadas. O diretório
é `data/translations/pilot`. A preparação não faz inferência. Snapshot, configuração
congelada, hashes e checkpoint ficam separados dos arquivos históricos. Executar
novamente não apaga resultados; mudanças na entrada/configuração exigem outro
`--out`. Os scripts usam o endereço e modelo de `config/translations.json`,
não as variáveis `TEACHER_MODEL`/`GENERATOR_MODEL` do fluxo anterior.

```bash
npm run translations:generate
npm run translations:check
npm run translations:review
npm run translations:stats
```

Os comandos acima executam em primeiro plano. Para logs persistentes:

```bash
npm run translations:generate >> data/logs/translations-pilot.log 2>&1
npm run translations:check >> data/logs/translations-pilot.log 2>&1
```

Há checkpoint atômico após cada tradução/checagem. Uma interrupção não exige
refazer itens salvos. Use `-- --limit 6` para limitar uma execução a seis tarefas.
Erros técnicos ficam pendentes; conexão interrompida encerra a execução na primeira
ocorrência. Reexecute o mesmo comando para retomar. Uma tradução já salva e
rejeitada pode ser refeita com `generate --retry-rejected`; depois execute `check`
novamente. `check --retry-rejected` apenas solicita outra revisão automática,
sem regenerar o texto. A resposta original de cada tentativa é preservada.

Exemplo com os aliases npm:

```bash
npm run translations:generate -- --retry-rejected
npm run translations:check
```

Somente um escritor pode usar cada diretório (`running.lock` registra PID).
Após encerramento abrupto, verifique se esse PID pertence ao processo original
antes de remover um lock antigo. Execute apenas uma carga de inferência por vez,
incluindo validação antiga, piloto e produção. O CLI mantém a proteção térmica
com cancelamento a 95 °C e resfriamento antes de repetir a chamada; o histórico
fica em `data/logs/translations-thermal-*`. Confirme GPU com `ollama ps`.

## Qualidade e revisão

O modelo padrão é `qwen2.5:14b`, temperatura zero, duas threads auxiliares,
contexto 8.192, saída 2.048 e prazo de 30 minutos. Alterar a configuração não
modifica um diretório preparado: use nova preparação em outro `--out`.
O prompt pede fidelidade, sem responder novamente, corrigir fatos ou expandir a
resposta. A evidência científica permanece no idioma original.

A checagem local exige números e notação decimal idênticos, além de preservar
blocos de código, LaTeX delimitado e URLs. É uma regra conservadora: uma mudança
meramente tipográfica pode exigir retrabalho. Não detecta todos os erros de
unidade, fórmulas sem delimitadores ou significado. Em uma chamada separada,
o modelo avalia idioma, fidelidade e fluência; exige notas >=0,9, dois indicadores
verdadeiros e `accept`. O mesmo modelo traduz e revisa, portanto esta avaliação
não é independente e pode repetir erros. Também não recertifica a resposta
científica original. A indicação de idioma é verificada pelo revisor, não por
um detector linguístico independente.

`translations:review` produz:

- `review.jsonl`: original, evidência, traduções e pareceres automáticos juntos.
- `review-template.json`: decisões pendentes com hashes de cada item.
- `review-decisions.json`: decisões editoriais efetivamente aplicadas; não é
  sobrescrito ao recriar o pacote de revisão.

Copie somente decisões realmente verificadas do template para `review-decisions.json`.
Para cada original e tradução aprovados, mantenha `inputHash` e registre:

```json
{"inputHash":"hash do template","status":"approved","reviewer":"nome do revisor","notes":"Descrição da conferência realizada"}
```

Os objetos de decisão ficam dentro de `originals` e `translations`, por ID.
Use `status: "rejected"` para rejeitar. A nota deve ter pelo menos dez caracteres.
Não marque todo o template como aprovado sem revisão. Se o conteúdo mudar,
a aprovação antiga deixa de valer. Rejeições editoriais atuais são respeitadas
inclusive no modo de exportação automática. Os scripts não oferecem uma tela de
edição: para corrigir textos em vez de regenerar, prepare uma nova entrada/versão;
não edite manualmente os JSONL com hashes/checkpoints.

## Exportação utilizável em treino

```bash
npm run translations:export
```

O padrão `editorial` exige aprovação editorial do original e de suas duas
traduções, além da checagem automática das traduções. Grupos incompletos são
excluídos por inteiro, mantendo o equilíbrio entre idiomas. Se nenhum grupo
for elegível, o comando falha e escreve os motivos em `excluded.json`.

Para um experimento assumidamente baseado apenas no filtro automático:

```bash
npm run translations:export -- --policy automatic
```

Esse modo usa a validação automática já feita nos originais e as checagens
novas das traduções; não constitui revisão humana. Os artefatos ficam separados
por política, sem misturar níveis de aprovação:

```text
data/translations/pilot/exports/editorial/   # ou automatic/
  train.jsonl                 # somente messages: system/user/assistant
  validation.jsonl
  test.jsonl
  train-pairs.jsonl           # question/answer + IDs, idioma e artigo
  validation-pairs.jsonl
  test-pairs.jsonl
  en/{train,validation,test}.jsonl
  es/{train,validation,test}.jsonl
  pt/{train,validation,test}.jsonl
  audit.jsonl                 # linhagem, idioma original, evidência e hashes
  manifest.json               # contagens, política e checksums dos arquivos
  excluded.json               # grupos excluídos e justificativas
```

Toda questão e tradução de um mesmo artigo usa o split determinístico existente
(por `paperId`, aproximadamente 80/10/10). Não faça nova divisão aleatória por linha.
O piloto pode ter splits vazios; isso não é um dataset final de avaliação.
Nenhum arquivo combinado é oferecido como entrada de treino. Exports com conteúdo
ou decisões diferentes não sobrescrevem uma exportação concluída: use
`--export-dir data/translations/pilot/exports/editorial-v2` para uma nova versão.

Valide os arquivos antes de usar:

```bash
python3 scripts/check-sft-export.py data/translations/pilot/exports/editorial
```

O verificador usa apenas a biblioteca padrão do Python e confere checksums,
contagens, grupos trilíngues, alinhamento das mensagens e ausência de artigos em
splits diferentes. A auditoria e o snapshot guardam a linhagem; não devem virar
texto de entrada do modelo inadvertidamente.

Os JSONL podem ser carregados diretamente em Python:

```python
import json
from pathlib import Path
root = Path('data/translations/pilot/exports/editorial')
with (root / 'train-pairs.jsonl').open(encoding='utf-8') as stream:
    pairs = [json.loads(line) for line in stream if line.strip()]
# pairs[i]['question'] / pairs[i]['answer']
```

A tokenização depende do modelo alvo. Para um modelo com chat template,
use o template do seu tokenizer sobre `messages`; para o modelo próprio de
335M, defina o formato conversacional e tokens especiais no código de treino.
Não assuma que o template do Qwen é compatível com esse modelo. Se escolher
loss apenas na resposta, mascare instrução/pergunta e padding; preserve EOS e
confira truncamento no comprimento real de tokens. Use `validation` para escolhas
de treinamento e mantenha `test` reservado para a avaliação final, por idioma.
Este pacote prepara os dados; não inicia treinamento ou seleciona hiperparâmetros.

## Escalar após o piloto

Depois de conferir a qualidade e o custo medidos, crie um workspace separado:

```bash
npm run translations:prepare -- --all --out data/translations/full
npm run translations:generate -- --out data/translations/full
npm run translations:check -- --out data/translations/full
npm run translations:review -- --out data/translations/full
npm run translations:stats -- --out data/translations/full
npm run translations:export -- --out data/translations/full
```

A produção é separada do piloto e não importa suas aprovações automaticamente.
O relatório mostra tempos médios de tradução e checagem. O comando de
estatísticas também salva `summary.json`, com os tempos e a projeção
do trabalho restante quando ambas as etapas já possuem medições. Essa projeção
não inclui futuras falhas, regenerações ou revisão editorial.

A decisão de gerar novas questões continua para depois da avaliação dos conteúdos aproveitáveis;
esse fluxo somente traduz os originais existentes.
