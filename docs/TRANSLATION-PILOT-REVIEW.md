# Inspeção do primeiro piloto de tradução

O piloto gerou e checou 60 traduções: 35 aceites e 25 rejeições automáticas.
A inspeção identificou problemas de origem e de filtragem; a taxa bruta não
mede isoladamente a qualidade do tradutor.

## Idioma de origem incorreto

Os 30 originais do piloto têm perguntas em inglês. Vinte deles foram rotulados
como es/pt. Entre as 25 rejeições, 19 são textos inalterados na suposta tradução
para inglês de um original que já estava em inglês. Isso não demonstra falha de
tradução: demonstra uma premissa errada no idioma de origem. O vigésimo caso
rotulado es/pt foi ligeiramente parafraseado em inglês e passou no filtro.
Logo, também existem aceites automáticos que não criam uma variante no idioma
faltante. Não basta liberar as 19 cópias nem remover a regra de texto inalterado.

Uma triagem por início de pergunta no conjunto completo encontrou aberturas em
inglês em 412/416 registros marcados es e 408/412 marcados pt. É uma heurística,
não certificação do idioma das respostas ou dos demais registros. As contagens
anteriores por idioma eram de rótulos declarados, não de fluência verificada.

O código passa a bloquear novos snapshots com essa inconsistência evidente e
excluir esses originais da exportação, sem alterar rótulos ou arquivos históricos.
Esse bloqueio é conservador e não substitui identificação completa do idioma.
Antes de escalar, auditar pergunta e resposta de cada original, preservar o
rótulo anterior e a evidência da decisão, e criar uma nova entrada/workspace.

## Outras rejeições

Cinco rejeições locais decorrem de representação numérica: três casos de troca
de ponto por vírgula decimal (2874.4 / 2874,4 e 88.5% / 88,5%) e dois de 3D /
tridimensional. O conteúdo pode ser equivalente, mas viola a política conservadora
de preservação literal definida no piloto. Não liberar alterações numéricas
genericamente: milhares, decimais e identificadores podem ser ambíguos.

Uma rejeição semântica alegou ausência de "id number" na tradução do ITensor,
embora a resposta contenha "número de id". Essa justificativa parece improcedente;
a pergunta em português também precisa de revisão de naturalidade. Não se
registrou uma aprovação editorial automática para esse caso.

Há ainda termos questionáveis entre os aceitos, como "amplificação de recuperação"
para retrieval augmentation e "verossimilhança removida" para held-out likelihood.
Também aparece SDGs traduzido como ODM, exigindo revisão da sigla e do conceito.
Os aceites do modelo não substituem revisão terminológica.

## Próxima etapa

1. Corrigir a identificação real dos idiomas em novo snapshot, sem sobrescrever
   os 1.392 aprovados históricos ou os checkpoints do piloto.
2. Produzir as variantes que realmente faltam (en/es/pt), mantendo as três versões
   de cada artigo no mesmo split.
3. Repetir um piloto com idioma de origem conferido e revisar a terminologia.
4. Somente então escalar as traduções e formar os exports de fine-tuning.

Esta inspeção é revisão por IA, não auditoria humana do conteúdo científico.
Nenhuma decisão editorial foi marcada como aprovada automaticamente.
