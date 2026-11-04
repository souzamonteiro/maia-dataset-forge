# Validação dos 3.593 candidatos — 12/10/2026

A geração foi encerrada por decisão do usuário; a meta anterior de 15 mil
candidatos e 10 mil aproveitados deixa de ser requisito deste lote.
O projeto de implantação `maia-edge-apps-deployment` não contém o pipeline;
os comandos abaixo pertencem a `maia-dataset-forge`.

A conferência inicial encontrou 3.593 IDs únicos de 901 artigos. Todos os
candidatos passaram pelas verificações locais de hash do texto e presença
literal da evidência (com normalização de espaços). Isso não certifica a
correção das respostas nem a identidade editorial de todos os artigos.
Não havia processo de geração em execução ao iniciar a validação.

## Processo iniciado

Foi iniciado somente `npm run validate`, com bloqueio exclusivo
`data/logs/validation.lock`. O modelo é `qwen2.5:14b`, quatro threads,
temperatura de validação zero e nota mínima 0,75 em cada dimensão:
grounding, correctness, clarity e usefulness. Também é obrigatório o
veredito `accept`. O controle térmico existente aguarda temperatura de
até 60 °C antes de cada chamada.

Após uma reinicialização no mesmo dia, os 3.593 candidatos continuavam
intactos e não havia decisões salvas. O último log registrava 95 °C,
sem comprovar a causa da reinicialização. A retomada passou a usar o
`createThermalGuard` existente: cancela a requisição ao atingir 95 °C,
aguarda retorno à temperatura inicial registrada e tenta novamente.
Estado e eventos ficam em `data/logs/validation-thermal-state.json` e
`data/logs/validation-thermal-events.jsonl`. Essa proteção foi aplicada
à etapa de validação no CLI; a configuração do modelo foi preservada.

Uma resposta incompleta na retomada motivou uma segunda correção: a validação
agora usa streaming e exige o marcador final `done:true`, com duas threads e
`num_batch=128` para reduzir a carga térmica. A configuração do gerador e os
critérios de aprovação foram mantidos. Ainda não havia decisões salvas ao
alterar o fingerprint da validação para a versão 3. Falhas são registradas em
`data/logs/validation-errors.jsonl`, incluindo resposta parcial quando disponível;
cada decisão concluída também aparece no log com ID, veredito e progresso.

As falhas de conexão subsequentes repetiam-se após cinco minutos, com o
Ollama ainda processando o prompt. O cliente HTTP foi corrigido para usar
somente o prazo total configurado (`timeoutMs=600000`), removendo os limites
internos de cabeçalhos/corpo do fetch de 300 segundos nas chamadas de inferência.
A dependência `undici` foi adicionada. Falhas de conexão agora encerram a
execução na primeira ocorrência, preservando o candidato pendente e registrando
o código e a mensagem da causa. Retomar com o comando acima após corrigir a
falha; o processo não rejeita questões por falhas técnicas.

Confirmação com execução real: às 14:01 de 12/10/2026 (America/Bahia),
`W4385245566-q01` foi aprovado automaticamente com média 0,900 e salvo em
`validated.jsonl`. O Ollama respondeu HTTP 200 após 7 minutos e 49 segundos,
ultrapassando o limite anterior de cinco minutos. A execução prosseguiu
para o próximo candidato. Os 46 testes do projeto passaram.

Após 24 decisões (12 aprovações e 12 rejeições), `W2888532099-q01` atingiu
o prazo total de dez minutos: o log do Ollama mostrava a fonte quase toda
processada. O prazo operacional da validação foi ampliado para no mínimo
30 minutos por chamada. `config/model.json`, o fingerprint e as decisões
anteriores foram preservados, pois o prazo de transporte não altera o modelo,
o prompt ou os critérios. Novas decisões registram `validationTimeoutMs`.
O log mostra `VALIDATING` com o ID antes da chamada. Mantêm-se a interrupção
térmica e a parada na primeira falha de conexão; não há espera ilimitada.

## Tempo por questão e projeção

Com Vulkan e todas as 49 camadas na GPU, as duas primeiras chamadas concluídas
levaram 2min15s e 1min22s segundo o journal do Ollama. Esses tempos arredondados
foram associados aos respectivos IDs, com `timingSource=ollama-journal-rounded`.
Não são tempos de execução em CPU. A média inicial de 108,5 segundos projetava
cerca de 107,5 horas para os 3.567 pendentes, aproximadamente 4,5 dias contínuos;
essa amostra de dois itens é preliminar, não uma garantia de prazo.

As novas decisões salvam `validationTiming`, incluindo duração real da tentativa
(com leitura local, espera térmica e eventuais repetições térmicas), processador
observado no inventário do Ollama e métricas de inferência. O log mostra
`elapsed=...s; processor=gpu` ao concluir cada questão. Registrar tempos não
altera o fingerprint ou os critérios. Erros também registram a duração.

```bash
npm run validation:timings
```

O comando resume médias, medianas, extremos e projeção do restante, separando
GPU, CPU, execução mista e processador desconhecido. Salva
`data/reports/validation-timings-latest.json`. Resultados históricos sem medição
não entram na média. Projeções pressupõem execução contínua e não incluem
futuras falhas, paradas do computador nem revisão editorial. Avaliar novamente
com uma amostra maior de fontes diferentes antes de decidir pelo prazo total.

- Candidatos preservados: `data/datasets/raw.jsonl`.
- Aprovações automáticas: `data/datasets/validated.jsonl`.
- Rejeições e justificativas: `data/rejected/rejected.jsonl`.
- Log: `data/logs/validation.log`.
- PID da sessão de execução: `data/logs/validation.pid`.

## Acompanhamento e retomada

```bash
cd /home/roberto/projects/maia-dataset-forge
tail -f data/logs/validation.log
wc -l data/datasets/raw.jsonl data/datasets/validated.jsonl data/rejected/rejected.jsonl
ps -p "$(cat data/logs/validation.pid)" -o pid,etime,args
```

Os arquivos de aprovação/rejeição surgem quando houver a primeira decisão
correspondente. A diferença entre candidatos e decisões salvas é o número
pendente. Erros de transporte, formato ou fonte permanecem pendentes para
nova tentativa; não são contados como rejeições de qualidade.

Se o processo terminar ou o computador reiniciar, retomar com:

```bash
flock -n data/logs/validation.lock npm run validate >> data/logs/validation.log 2>&1
```

A retomada ignora os IDs já decididos. Manter a configuração e as variáveis
do modelo: mudanças no fingerprint são bloqueadas pelo pipeline. Não executar
`generate` ou `pipeline` durante este trabalho.

## Seleção e exportação

A aprovação do Qwen é uma triagem automática. Os benchmarks registrados em
`docs/technical-summary.md` mostram aceites indevidos; revisar editorialmente
os aprovados antes de tratá-los como dataset final, incluindo suporte de todas
as afirmações, contexto, números e duplicação semântica. O fluxo legado
`validate` não faz deduplicação semântica nem aplica a auditoria editorial dos
pilotos.

Quando não houver pendências, `npm run export` exporta todas as aprovações
automáticas, com divisão determinística por artigo em treino/validação/teste.
Essa exportação não aplica decisões editoriais adicionais. Não foi iniciada
exportação nem treinamento nesta etapa.
