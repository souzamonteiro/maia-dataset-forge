# Maia Dataset Forge — resumo técnico

## Objetivo e ambiente

Meta: construir perguntas e respostas sustentadas por artigos científicos, visando
10 mil itens a partir de mil artigos. Ambiente informado: Ryzen 7 5700G, 32 GB de
RAM compartilhada com GPU integrada, reserva de 8 GB para vídeo. Modelos locais
até aproximadamente 14B; execução sequencial, quatro threads, Ollama com Vulkan.
PDFs e textos devem ser preservados para reutilização no Maia RAG.

## Evolução e resultados registrados

A preparação incluiu revisão de identidade dos artigos e seleção de blocos de
texto. A geração foi separada da validação; introduzimos persistência e retomada,
verificação de evidência literal e liberação de modelos antes da troca para evitar
sobreposição de memória. Respostas incompletas passaram a ter recuperação e
registro; IDs de validação são conferidos estritamente, sem associação por posição.

Na comparação inicial de três geradores, a revisão por IA identificou 12 itens
prontos do Qwen 14B, 18 do Llama 8B e 13 do Gemma 3 12B. Custos registrados por item:
350, 118 e 196 segundos, respectivamente. Falhas e mudanças durante as execuções
limitam a comparação. Isso motivou Llama 8B como gerador, Qwen 14B como validador.

No piloto de dez artigos: 81 aprovações automáticas, 109,55 minutos e pico térmico
amostrado de 79 °C. A revisão separou 17 itens sem edição, 48 para edição (17 apenas
marcadores internos), 13 duplicatas e 3 rejeitados, excluindo duplicatas.

No piloto editorial v3 de três artigos: 28 aprovações automáticas em 23,16 minutos;
13 aproveitáveis após revisão, 12 para edição e 3 rejeitados. No v4, com 15 candidatas
iniciais e validação em lotes de cinco: 28 selecionadas em 31,49 minutos, 17
aproveitáveis, 7 para edição, 3 rejeitadas e 1 duplicata. Custos por item revisado:
107 s e 111 s. Mais candidatas aumentaram o rendimento, sem vantagem conclusiva de
custo; várias condições mudaram simultaneamente.

## Temperatura e recuperação

Primeiros testes em CPU apresentaram temperaturas altas. A configuração atual
começa cada ciclo a <=60 °C, permitindo geração e validação consecutivas. Antes
de uma chamada, leitura >=85 °C exige retorno a <=60 °C. O monitor registra
picos durante a chamada, sem cancelamento térmico dessa chamada. Sensores
indisponíveis interrompem a execução. No piloto v4, pico amostrado: 81,75 °C;
resfriamento acumulado: 2,49 minutos. Isso não garante o mesmo comportamento
em outros modelos ou cargas.

## Qualidade e limites

Foram detectados intervalos numéricos incorretos, percentuais interpretados como
frequências, comparações sem suporte, perda de ressalvas, contexto temporal ausente,
perguntas redundantes e respostas superficiais. Copiar blocos originais elimina
falhas de transcrição, mas não garante que o bloco sustente a afirmação.

O validador Qwen 14B foi testado em 24 casos fixos: 12 positivos e 12 negativos
editoriais. Aceitou 11 positivos e 8 negativos; rejeitou 1 positivo e 4 negativos.
Os negativos incluem problemas reparáveis, não apenas alucinações. Uma hipótese
corretamente qualificada na pergunta foi rejeitada. O primeiro lote falhou por IDs;
a recuperação agora salva respostas brutas e tenta itens individuais, preservando
checkpoints. O tempo registrado do Qwen foi 10,53 minutos, incluindo a interrupção.

Os rótulos são provisórios, produzidos por revisão por IA. Não há certificação
humana de toda a amostra, nem de profundidade de pós-graduação. Os testes usam
blocos selecionados, não todo o conteúdo dos PDFs. As projeções lineares para 10 mil
itens não incluem aquisição, auditoria humana ou edição e não são prazos garantidos.

## Artefatos

Resultados em `data/benchmarks/`: `generator-comparison`,
`batch-llama8b-qwen14b-editorial-v2-10`, `editorial-regression-v3`,
`editorial-cycles-v4` e `validator-regression-v1`. Subpastas `editorial-review`
preservam decisões e subconjuntos; resultados originais não foram substituídos.
