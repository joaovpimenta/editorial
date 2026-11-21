# Sistema de geração

Esta pasta contém somente conhecimento que precisa entrar no contexto do modelo ao escrever um artigo.

- `tasks/`: define a intenção e a estrutura cognitiva da entrega;
- `frameworks/`: adiciona lentes analíticas selecionadas conforme o tema;
- `editorial/AUTHORING.md`: reúne decisões editoriais subjetivas que a validação automática não consegue garantir;
- `registry.json`: é a allowlist versionada dos módulos disponíveis.

Não concatene a pasta inteira. Liste tasks, frameworks e os resumos dos artigos publicados com `node scripts/compose-article-brief.mjs --list`. Leia um artigo completo só quando houver possível sobreposição. Depois gere um brief mínimo com:

```sh
node scripts/compose-article-brief.mjs \
  --topic "Seu tema" \
  --task explain-concept \
  --framework fundamentals \
  --framework tradeoffs-and-risks \
  --depth advanced
```

O comando escreve o brief em stdout. Ele não chama um provedor de LLM, não cria arquivos e não persiste o prompt composto. A geração do texto é uma etapa externa, feita pelo modelo/redator que recebe o brief; este repositório não escolhe o modelo, envia prompts a uma API nem orquestra essa etapa. Grave artigos novos em `articles/<slug>/article.md` e a capa em `articles/<slug>/cover.jpg`, usando `generation/templates/article.md`; o compilador do site consome essa fonte autocontida diretamente.

Para o formato-fonte, template, taxonomia e validação dos artigos, siga [o contrato autoral](editorial/AUTHORING.md).

Após finalizar a abertura, use `node scripts/compose-cover-brief.mjs` para extrair de `docs/VISUAL_STYLE.md` apenas as instruções necessárias para criar e revisar a capa.

## Onde cada regra deve ficar

- Decisão que exige julgamento durante a escrita: `editorial/AUTHORING.md` (inclusive fala de código inline e significado contextual de setas).
- Lente analítica reutilizável: `frameworks/`.
- Forma de organizar um tipo de entrega: `tasks/`.
- Invariante objetiva: script de lint ou teste, com explicação humana em `docs/`.
- Direção detalhada para gerar e revisar a capa: `docs/VISUAL_STYLE.md`.

Evite copiar uma regra entre essas camadas. O brief aponta para a validação final, mas não repete a implementação do lint.
