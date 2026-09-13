# Páginas da Wiki

Esta pasta é a fonte das páginas da Wiki do GitHub. Fica versionada aqui para
a documentação evoluir junto com o código, com revisão no mesmo fluxo; a Wiki
publicada é uma cópia.

Os nomes dos arquivos seguem a convenção do GitHub Wiki: o nome do arquivo é o
título da página com espaços trocados por hífen, e os links entre páginas usam
`[[Título]]`. `_Sidebar.md` e `_Footer.md` são a barra lateral e o rodapé.

## Publicar

A Wiki do GitHub é um repositório Git próprio, mas **só existe depois que a
primeira página é criada pela interface web**: abra a aba Wiki do repositório
e crie a Home uma vez (qualquer conteúdo; será substituído). Depois:

```bash
git clone https://github.com/lucasmm13/Cuidaihospitalmonitoringinterface.wiki.git /tmp/medsignal-wiki
cp docs/wiki/*.md /tmp/medsignal-wiki/
rm /tmp/medsignal-wiki/README.md
cd /tmp/medsignal-wiki && git add -A && git commit -m "docs: paginas da wiki" && git push
```

Se o `git clone` falhar com "repository not found", a Home ainda não foi criada
pela interface.

## Regras do conteúdo

- Não duplicar o que está no código: a Wiki explica **por quê**, o código mostra **como**.
- Onde não há número, dizer que não há. Nenhuma métrica de IA foi medida ainda.
- Citar a seção da RFC em cada decisão que vem dela.
- Os links para o código apontam para a branch `qa`.
