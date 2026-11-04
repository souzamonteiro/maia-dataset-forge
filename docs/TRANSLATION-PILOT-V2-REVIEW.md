# Revisão por IA do piloto trilíngue v2

Foram inspecionadas as 11 rejeições e, ampliando a amostra solicitada, também
as 49 aprovações: 60 traduções ao todo. A comparação avaliou significado,
qualificações, números, termos e fluência diante do original. Não foi uma nova
validação científica contra os artigos e não é auditoria humana.

## Resultado

| Medida | Quantidade |
|---|---:|
| Aceites do filtro Qwen | 49 |
| Rejeições do filtro Qwen | 11 |
| Traduções mantidas após inspeção linguística por IA | 34 |
| Traduções com propostas de correção | 26 |
| Aceites do Qwen sinalizados para correção | 15 |
| Conteúdos com as duas traduções mantidas | 12 |
| Conteúdos com aprovação editorial completa do original e das traduções | 0 |

Os 15 casos sinalizados entre os aceites incluem padronização terminológica,
falhas de fluência e erros de significado; não são 15 alucinações comprovadas.
A amostra foi selecionada por diversidade, portanto essas proporções não devem
ser interpretadas como estimativa estatística de erro do conjunto completo.

## As 11 rejeições

| Tipo | Casos | Avaliação |
|---|---:|---|
| Ponto/vírgula decimal | 6 | Valor aparentemente equivalente, mas diferente da política literal. Nos dois casos de detector há também terminologia a corrigir. |
| 3D / tridimensional | 2 | Equivalência de sentido, mas reprovação da preservação literal. Espanhol também precisa corrigir o plural hidrogel/hidrogeles. |
| Mudança de significado | 2 | time-varying virou variância temporal; morphing virou morfología. |
| Gramática | 1 | as neurônios. O filtro identificou problema, mas sua justificativa de singular/plural e fidelidade zero é confusa e excessiva. |

Não foi removida globalmente a proteção de números. As propostas preservam a
notação original para evitar confusões entre casas decimais, milhares e códigos.

## Problemas entre os aprovados

Alguns exemplos materiais:

- `W4285105424-q15::pt`: edge computing virou computação em bordo. A proposta
  usa computação de borda, coerente com a [documentação técnica da IBM](https://www.ibm.com/br-pt/think/topics/edge-computing).
- `W4386619339-q02::es`: SDGs virou ODM; a proposta usa ODS. A [ONU distingue
  explicitamente ODS de ODM](https://www.un.org/sustainabledevelopment/es/development-agenda/).
- `W2223092947-q13::{es,pt}`: held-out likelihood virou verosimilitud mantenida /
  verossimilhança removida. A proposta explicita dados reservados. O significado
  da operação é descrito na [documentação original do pacote stm](https://search.r-project.org/CRAN/refmans/stm/html/make.heldout.html).
- `W2953154703-q03::pt`: a pergunta perdeu a qualificação most (na maioria).
- `W3007472167-q15::pt`: eletróliseiro em vez de eletrolisador.
- `W3138649916-q12::pt`: o análise em vez de a análise.
- Ondas de calor marinhas, siglas de modelos, pixel-flipping e resistência a
  ataques quânticos também receberam propostas de padronização ou correção.

As sugestões são propostas editoriais por IA, não foram aplicadas aos checkpoints
nem aprovadas por uma nova rodada do Qwen. Passaram pela checagem local de números,
URLs, código e fórmulas, que não substitui revisão semântica.

## Arquivos gravados

Em `data/translations/pilot-v2/`:

- `ai-review-v1.jsonl`: 60 registros com ID, hashes do texto e do original,
  decisão, categoria, justificativa, escopo e proposta de texto quando necessária.
- `ai-review-summary.json`: contagens resumidas desta inspeção.
- `review-decisions.json`: decisões de tradução vinculadas ao hash. Revisor
  explicitamente identificado como Codex/IA. Não foram adicionadas aprovações
  científicas dos originais.

Os arquivos `originals.jsonl`, `translations.jsonl` e `checks.jsonl` foram
preservados e tiveram sua integridade conferida após a gravação da revisão.
O exportador respeita as rejeições atuais também em modo automatic; não basta
uma tradução ter sido aceita anteriormente pelo Qwen.

## Como interpretar stats

```bash
npm run translations:stats -- --out data/translations/pilot-v2
```

- `accepted=49` e `rejected=11`: resultados históricos do Qwen, preservados.
- `reviewedTranslationApprovals=34` / `reviewedTranslationRejections=26`:
  decisões correntes da revisão, cujo autor consta nos registros (neste caso IA).
- `completeAutomaticTriplets=23`: resultado histórico do filtro automático.
- `completeTranslationReviewedTriplets=12`: ambos os textos traduzidos passaram
  no filtro e na revisão de tradução; não significa aprovação científica do original.
- `completeEditorialTriplets=0`: nenhum original recebeu aprovação editorial
  completa nesta inspeção exclusivamente linguística.

## Recomendação para avançar

Corrigir os 26 casos em uma nova versão, mantendo a linhagem; incorporar um
glossário técnico ao tradutor e ao revisor; avaliar novamente as correções antes
de iniciar as 2.784 traduções. Não baixar indiscriminadamente os limiares para
recuperar itens. Os originais que apenas apontam para tabelas ou não respondem
integralmente à pergunta também precisam de revisão científica/editorial separada.
A execução do lote completo não foi iniciada nesta revisão.
