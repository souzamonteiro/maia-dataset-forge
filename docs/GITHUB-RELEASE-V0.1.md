# Publicação da v0.1 no GitHub

**Atualização de 04/11/2026:** candidato retirado após reprovação na amostra.
As três lacunas de licença foram esclarecidas, mas existem erros materiais e
associação incorreta de texto com metadados. Não publicar o texto proposto abaixo
sem substituir o candidato. Consulte [a auditoria](RELEASE-V0.1-AUDIT.md).

Destino identificado no remote origin:
https://github.com/souzamonteiro/maia-dataset-forge

Preparado em 04/11/2026. Pacote candidato local:
`data/release-assets/maia-trilingual-v0.1-candidate.tar.gz`, acompanhado de
`SHA256SUMS`. O pacote contém o snapshot completo, manifesto, atribuições,
exclusões, amostra para revisão e README. Não inclui PDFs, .env, logs ou modelos.

A distribuição proposta é um asset de GitHub Release, com o código e a
documentação no repositório. A release deve ser marcada como pré-lançamento
experimental, e a tag deve apontar para um commit que inclua o exportador e
verificador usados. Nenhum commit, push, tag ou release foi criado nesta etapa.

Antes da publicação pública, concluir a inspeção dos 50 conjuntos da amostra
e esclarecer as três permissões indicadas em `release-readiness.json`, ou criar
uma nova exportação excluindo os grupos afetados. Registrar o resultado real da
inspeção; não converter o template em aprovações sem revisão.

## Texto proposto para a release

Maia Trilingual v0.1 — experimental

Dataset sintético acadêmico trilíngue, filtrado automaticamente. O candidato
atual contém 1.122 conteúdos distintos e 3.366 exemplos em inglês, espanhol e
português. Treino: 2.712; validação: 258; teste: 396. A divisão agrupa artigos,
preservando traduções no mesmo split. A contagem final depende da revisão e
do esclarecimento das licenças.

Inclui mensagens para SFT, pares identificados, atribuições, linhagem e
checksums. A aprovação por modelos não certifica correção científica. O dataset
destina-se a experimentos iniciais de fine-tuning; nenhum resultado de treino
é apresentado. Consulte o README do pacote para limitações e termos das fontes.
