# Teste local: Qwen2.5-0.5B-Instruct com LoRA

**Atualização:** o candidato de dataset abaixo foi retirado após inspeção da
amostra. O preflight de GPU continua disponível; o treino desse snapshot está
bloqueado. Consulte [a auditoria](RELEASE-V0.1-AUDIT.md) antes dos comandos de treino.

Preparado em 04/11/2026. O ambiente do agente não expõe a GPU e não tem PyTorch;
nenhum treinamento foi executado. Use o terminal do equipamento com ROCm.

## Dataset candidato v0.1

`data/releases/maia-trilingual-v0.1` contém 1.122 conteúdos em en/es/pt:
2.712 exemplos de treino, 258 de validação e 396 de teste, provenientes de 533
artigos. A divisão agrupa artigos e mantém as traduções juntas. O verificador
de exportação passou. O manifesto registra hashes e a auditoria registra fontes.

É um candidato experimental com filtro automático, não revisão científica humana.
Não foi publicado. `review-sample.jsonl` contém 50 conjuntos selecionados com
semente 42 para inspeção, ainda pendente. `release-readiness.json` registra três
conteúdos cuja licença herdada é `other-oa` ou ausente; é preciso esclarecer as
permissões antes da publicação e conferir atribuições das demais fontes.
Não atribua automaticamente a licença do código a todos os exemplos.

## Ambiente

Crie um ambiente separado, instale uma distribuição **PyTorch ROCm compatível
com seu host e gfx90c**, e só depois instale as dependências abaixo. A saída do
rocminfo não permite escolher com segurança uma versão do wheel PyTorch.
Não substitua seu ambiente ROCm existente por uma instalação genérica de torch.

```bash
cd /home/roberto/projects/maia-dataset-forge
python3 -m venv --system-site-packages .venv-lora
# Instale/valide aqui o PyTorch ROCm compatível, se não estiver no Python do host.
.venv-lora/bin/python scripts/train-lora.py --preflight
.venv-lora/bin/python -m pip install -r config/lora-requirements.txt
.venv-lora/bin/python scripts/train-lora.py
```

O preflight exige ROCm, GPU disponível, multiplicação de matrizes e backward.
Falha antes de baixar o modelo se esses requisitos não forem atendidos.
O treino baixa o modelo oficial do Hugging Face, usa FP32 inicialmente, LoRA rank
8 em q_proj/v_proj, lote 1, acumulação 16, 30 passos e contexto 512.
Não usa quantização ou FlashAttention. Verifique temperatura e estabilidade no
host durante o teste; o script Python não integra o controle térmico do CLI Node.

O template conversacional vem do tokenizer. A loss só inclui a resposta e o
terminador; prompts e padding são mascarados. Exemplos maiores que o contexto
são excluídos e contados, nunca truncados silenciosamente. O relatório de
comprimentos deve orientar o contexto do treino completo; o subconjunto curto
não representa necessariamente todo o dataset.

O adapter e tokenizer ficam em `data/training/qwen05b-smoke/adapter`.
`run.json` registra versões, revisão resolvida do modelo, hash do dataset,
tempos e loss antes/depois em até 32 exemplos de validação retidos. Isso verifica
o pipeline, não demonstra qualidade científica ou melhora geral. O teste final
permanece reservado. Não repetir no mesmo diretório: use `--output` novo.

Após sucesso, compare gerações antes/depois por idioma e inspecione erros antes
de definir o treino completo. Use `--revision COMMIT` para repetir a mesma versão
do modelo. O teste inicial deve medir viabilidade, não decidir o melhor checkpoint.

Referências: [modelo](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct),
[PEFT](https://huggingface.co/docs/peft/guides/peft_model_config),
[templates](https://huggingface.co/docs/transformers/chat_templating).
