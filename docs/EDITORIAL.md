# Diretrizes editoriais

## Brief de geração

Para escrever um artigo novo, comece pelo compositor seletivo descrito em `generation/README.md`. Ele combina o contrato autoral compacto, uma task e as lentes de análise relevantes. Não carregue todos os módulos nem replique estas diretrizes em prompts específicos.

Esta documentação continua sendo a referência humana para escopo, pesquisa e revisão. O conteúdo que exige decisão do modelo durante a escrita fica em `generation/editorial/AUTHORING.md`; invariantes objetivas pertencem ao lint e aos testes.

## Escopo

Publicação em `pt-BR` para **Editorial** com foco em **Seu assunto**.
Tags editoriais ativas: `fundamentos` (Fundamentos), `arquitetura` (Arquitetura), `confiabilidade` (Confiabilidade), `resiliencia` (Resiliência).

## Escolha do assunto

Antes de escolher o tema:

1. consulte o catálogo compacto de títulos, slugs e resumos emitido por `node scripts/compose-article-brief.mjs --list`;
2. leia o conteúdo completo apenas dos artigos com possível sobreposição ao tema candidato;
3. compare títulos, resumos e, nos casos ambíguos, o conteúdo; evite sinônimos, equivalentes semânticos e variações superficiais;
4. se houver um assunto fornecido para a execução, utilize-o apenas se ainda não tiver sido coberto.

O catálogo reduz a leitura inicial, mas não substitui o julgamento editorial.

## Pesquisa e rigor

Pesquise fontes atuais e confiáveis antes de escrever. Priorize:

- documentação oficial e especificações técnicas ou padrões reconhecidos;
- artigos acadêmicos e estudos primários;
- livros de referência e publicações técnicas ou históricas verificáveis.

Diferencie claramente fatos documentados, definições formais, interpretações e exemplos ilustrativos. Não invente autores, datas, citações, fontes, números ou resultados. Inclua links de referência próximos às afirmações que sustentam e uma seção final de fontes.

## Profundidade e estrutura

O artigo deve ser didático e rigoroso, começando do zero e avançando até nível intermediário ou avançado conforme o tema.

Inclua, quando aplicável:

- motivação e problema resolvido;
- origem e contexto histórico;
- princípios fundamentais e mecanismo passo a passo;
- exemplos concretos, quantificados quando útil;
- cenários de falha, trade-offs, limitações e quando evitar;
- relações com conceitos correlatos e referências recomendadas.

Termine com:

- um resumo mental do conceito;
- perguntas de revisão;
- dois ou três exercícios práticos ou mentais verificáveis.

Não prometa arquivos, simuladores, gráficos, exemplos ou recursos que não existam.

## Primeiro parágrafo obrigatório: diálogo-metáfora

Todo artigo novo deve começar o corpo com um único parágrafo introdutório em formato de diálogo-metáfora:

- apresente uma situação cotidiana, física e observável que funcione como alegoria para o conceito do artigo;
- escreva como uma conversa curta, com pergunta, reação ou contraponto incorporado à prosa, sem aspas, travessão nem rótulos de falantes;
- conecte a cena ao conceito do artigo e antecipe o problema explicado;
- mantenha a abertura em um único elemento `<p>` após o preâmbulo (título H1, dek e capa `./cover.jpg`), antes de `## Neste artigo`;
- faça a rolagem horizontal acontecer apenas dentro de tabelas, código ou diagramas largos, nunca na página inteira.

A metáfora deve ser específica o suficiente para gerar a capa em `./cover.jpg`. Se a cena não puder virar uma cena visual em aquarela, reescreva a abertura antes de criar a capa.

## Composição visual e diagramas

Planeje os visuais junto com o texto quando eles esclarecerem relações difíceis em prosa.

- Use `node scripts/compose-cover-brief.mjs` e [VISUAL_STYLE.md](VISUAL_STYLE.md) para criar a capa `articles/<slug>/cover.jpg` em pintura em aquarela editorial sobre papel texturizado (nunca vetor flat ou SVG).
- Use Mermaid com tema semântico para diagramas (`<!-- site:mermaid {"label":"..."} -->` ou contexto textual adjacente com legenda e `<details class="mermaid-fallback">`). Não crie SVG técnico para diagramas.

## Regras automatizadas

As regras objetivas são aplicadas por `scripts/lint-articles.mjs` e `scripts/validate-site.mjs` (slug e pasta consistentes, campos e `publishedAt` válidos, capa `./cover.jpg` presente, assets locais válidos, HTML seguro sem `<script>`, abertura única em `<p>`, sumário `## Neste artigo`, tabelas em regiões roláveis, Mermaid com fallback e tokens semânticos válidos).

Rigor factual, originalidade semântica, qualidade da metáfora e fidelidade pictórica da aquarela continuam exigindo revisão humana.
