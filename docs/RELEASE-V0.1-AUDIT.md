# Inspeção do candidato v0.1 — 04/11/2026

O candidato de 1.122 conteúdos/3.366 exemplos foi retirado da publicação após
inspeção por IA dos 50 conjuntos da amostra. Dados e hashes originais preservados.
Não houve publicação, push, tag ou treinamento. O teste de GPU (`--preflight`)
continua disponível, mas o script de treino bloqueia este candidato retirado.

| Resultado por conjunto | Quantidade |
| --- | ---: |
| Sem defeito material identificado na inspeção limitada | 22 |
| Erro material confirmado | 13 |
| Necessita ajuste | 7 |
| Mais evidência/revisão especializada necessária | 8 |

Todos os três idiomas foram lidos junto com a evidência salva. Para casos
explicitamente indicados no relatório, consultou-se também o contexto do texto
local extraído, normalizando espaços para localizar a evidência. Inspeção por
IA não equivale a revisão humana nem certificação científica. As categorias são
por conjunto; não são uma taxa estimada de erro por exemplo do corpus inteiro.
Não se inferiu que uma resposta é falsa apenas por a evidência ser insuficiente.

Decisões individuais e notas estão em
`data/reports/release-v0.1-audit/sample-reviews.jsonl`, vinculadas aos hashes
das variantes e do texto local. Não foram convertidas em aprovações editoriais
de produção. O resumo está em `summary.json` no mesmo diretório.

## Exemplos confirmados

- `W4214731444-q03`: liposomes virou lisosomas/lisossomas nas duas traduções.
- `W2791002084-q03`: fórmula de profundidade perdeu elementos presentes na
  equação 5 do texto local (alfa e radical); o PDF precisa ser conferido
  visualmente antes de reconstruir a expressão.
- `W2888532099-q03`: resposta confunde a licença CC BY do artigo com a licença
  BSD-3-Clause do software, confirmada na
  [documentação oficial do Astropy](https://docs.astropy.org/en/stable/license.html).
- `W2979653715-q10`: reservatórios de carbono viraram represas/embalses, e a
  resposta afirma mudanças em todos os anos apesar de a tabela prever anos vazios.
- `W4387242094-q01`: metadados do artigo médico *Accuracy and Reliability of
  Chatbot Responses to Physician Questions*, DOI 10.1001/jamanetworkopen.2023.36483,
  associados ao texto local *Deep Reinforcement Learning from Human Preferences*,
  arXiv:1706.03741. O arquivo local confirma a divergência no cabeçalho.

## Licenças

As três lacunas de metadados foram esclarecidas, sem alterar snapshots:

- Dois conteúdos do artigo IntCal20: CC BY 4.0 no aviso do texto local e na
  [página da Cambridge](https://www.cambridge.org/core/journals/radiocarbon/article/intcal20-northern-hemisphereradiocarbon-age-calibration-curve-055-cal-kbp/83257B63DC3AF9CFA6243F59D7503EFF).
- Um conteúdo de Bell, Fairbrother e Jones: CC BY 4.0 na seção de permissões da
  [Springer](https://link.springer.com/article/10.1007/s11135-018-0802-x).

As fontes e IDs constam de `license-resolutions.json`. Isso resolve as três
lacunas apontadas, não constitui auditoria completa das 533 fontes.

## Consequência para a versão

Não basta retirar os 13 conjuntos reprovados da amostra: os padrões encontrados
podem ocorrer fora dela, em especial o vínculo entre texto e artigo. Antes de
produzir um candidato novo, verificar esse vínculo nas fontes elegíveis,
ampliar a triagem terminológica e de evidência, e excluir ou corrigir os casos
sinalizados em um workspace separado com novos hashes e pareceres.

O pacote candidato foi atualizado com aviso explícito e os relatórios de
inspeção. Ele serve para auditoria; não deve ser publicado como release pronta.
