# SistemaHotel

Sistema web de gestão hoteleira em português, adaptado ao computador e ao telemóvel. Valores em MZN e datas operacionais no fuso Africa/Maputo.

## Funcionalidades

- Painel de ocupação actual, quartos prontos, chegadas e saídas de hoje.
- Cadastro e edição de quartos, categoria, capacidade, diária e preparação (disponível, limpeza ou manutenção).
- Cadastro e edição de hóspedes e contactos.
- Reservas com disponibilidade por intervalo de datas, capacidade validada e valor calculado no servidor.
- Check-in durante a estadia, check-out e envio automático do quarto para limpeza.
- Cancelamento com controlo de valores já recebidos.
- Registo manual do total recebido, saldo pendente, pesquisa, filtros e exportação CSV.
- Base de dados persistente D1; não usa localStorage para guardar registos.
- Acesso privado por ChatGPT; registos isolados por utilizador em todas as consultas e mutações.

O sistema inicia vazio. Adicione um quarto, um hóspede e a primeira reserva. Não há dados de demonstração nem dados pessoais no repositório.

## Tecnologia

React 19, TypeScript, Vinext (API compatível com Next.js), Cloudflare Workers, D1/SQLite e Drizzle. O starter Sites fornece as integrações de compilação e autenticação. A identidade e a configuração do Site estão em `.openai/hosting.json`; não contém segredos.

## Desenvolvimento local

Requer Node.js >= 22.13 e pnpm 11.25.0 (versão declarada no package.json).

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Antes da primeira utilização local, aplique as migrações, uma única vez por base de dados, pela ordem indicada:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_common_thunderbird.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_reservation_guards.sql
pnpm dev
```

No perfil portátil, abra o endereço local indicado e use `/signin-with-chatgpt?return_to=/` para a identidade de desenvolvimento. A simulação só funciona em loopback e não é incluída em produção. O perfil gerido do ChatGPT não simula autenticação. Bases locais e publicadas são separadas.

## Publicação

A implantação inicial usa Sites, com acesso privado, Worker e D1 provisionados pela plataforma. O processo sincroniza o código, compila, aplica as migrações e publica a versão. O repositório GitHub guarda o código para revisão; push ou merge no GitHub não publica automaticamente. A origem de publicação de Sites é separada.

Para outro fornecedor de alojamento, é necessário adaptar os bindings e a autenticação. **Não publique esta aplicação directamente num Worker público que confie em cabeçalhos de identidade fornecidos pelo cliente.** No alojamento Sites, os cabeçalhos são injectados pelo proxy autenticado. Isto não é uma exportação estática para GitHub Pages nem uma configuração de deploy Vercel.

## Regras e limites desta versão

- Intervalos de reserva são [chegada, saída); a saída de uma reserva pode coincidir com a chegada da seguinte. Inserções condicionais atómicas impedem sobreposições mesmo com pedidos concorrentes.
- Check-in exige quarto disponível e impede dois hóspedes hospedados no mesmo quarto. Checkout e alteração para limpeza são atómicos.
- Quartos em manutenção não aceitam novas reservas; a limpeza só bloqueia check-in, não reservas futuras.
- Uma reserva preserva o preço total do momento da criação. Para alterar as datas ou o quarto, cancele a reserva e crie outra; valores recebidos devem ser ajustados após devolução.
- Recebimentos são um total acumulado editável, não um livro de caixa com histórico de transacções. Não efectua cobranças, M-Pesa, facturação fiscal ou reembolsos bancários.
- O painel mostra valores acumulados de todas as reservas, não receita contabilística por período. Check-out permite saldo em aberto, mediante confirmação.
- Versão para um gestor: não implementa equipas, papéis, auditoria ou partilha da base entre contas. Mantenha o Site privado.
- Não inclui remoção de quartos/hóspedes, anexos de documentos ou confirmação por WhatsApp.

## Validação

`pnpm test` executa testes de domínio e testes do handler real da API com SQLite em memória, aplicando as migrações reais. Abrange autenticação ausente, origem dos pedidos, isolamento de utilizadores, capacidade, datas, valores, disponibilidade, transições e limpeza atómica. O ambiente de teste substitui apenas a identidade da plataforma e o adaptador D1; os dados de teste não são publicados.

Verificação inicial: 17 testes aprovados, TypeScript sem erros e compilação de produção concluída. O navegador de QA não estava disponível; o aspecto visual e o fluxo de autenticação hospedado ainda precisam de revisão manual.
