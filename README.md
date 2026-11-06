# Distributed Wagering Processor

Serviço financeiro de apostas construído com NestJS + Bun + PostgreSQL + SQS (LocalStack).

## Decisões de arquitetura

| Problema | Solução |
|---|---|
| Precisão monetária | `Decimal.js` como Value Object — nunca `number`/`float` |
| Concorrência | `SELECT FOR UPDATE` pessimista na wallet — serializa todos os débitos |
| Idempotência duplicada | `ON CONFLICT DO NOTHING` no inbox + unique constraint no `idempotency_key` |
| Race condition de idempotência | Captura `UniqueConstraintViolationException` e retorna replay do vencedor |
| Mensagens fora de ordem | Status `PENDING_REFERENCE` + worker com backoff exponencial (2s×2ⁿ, max 5min) |
| Consistência event-driven | Outbox transacional — evento é commitado na mesma transação do débito |
| FK ordering no MikroORM | `flush()` escalonado: wallet → transaction → ledger entry |

---

## Pré-requisitos

- [Bun](https://bun.sh) >= 1.3
- Docker + Docker Compose

---

## Quick Start

```bash
# 1. Instala dependências
bun install

# 2. Sobe infra (Postgres + LocalStack com filas SQS FIFO criadas)
docker compose up -d

# 3. Roda em modo dev (hot reload)
bun run start:dev
```

A aplicação sobe em **http://localhost:3000**.

### Variáveis de ambiente

Crie um `.env` na raiz (ou exporte) se quiser sobrescrever os defaults:

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `DB_HOST` | `localhost` | Host do PostgreSQL |
| `DB_PORT` | `5432` | Porta do PostgreSQL |
| `DB_NAME` | `wagering` | Nome do banco |
| `DB_USER` | `wagering` | Usuário |
| `DB_PASSWORD` | `wagering` | Senha |
| `AWS_REGION` | `us-east-1` | Região AWS/LocalStack |
| `AWS_ENDPOINT_URL` | `http://localhost:4566` | Endpoint SQS |
| `AWS_ACCESS_KEY_ID` | `test` | Chave (LocalStack aceita qualquer valor) |
| `AWS_SECRET_ACCESS_KEY` | `test` | Secret |
| `SQS_WAGERING_QUEUE_URL` | `http://localhost:4566/000000000000/wager-transactions.fifo` | Fila principal |
| `SQS_WAGERING_DLQ_URL` | `http://localhost:4566/000000000000/wager-transactions-dlq.fifo` | Dead-letter queue |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | Intervalo do publisher do outbox |
| `PENDING_REFERENCE_POLL_INTERVAL_MS` | `5000` | Intervalo do worker de pendentes |
| `SQS_CONSUMER_CONCURRENCY` | `3` | Workers SQS paralelos |

---

## Testes

Os testes de integração e concorrência precisam dos containers rodando.

```bash
# Sobe containers de teste (Postgres na 5433, LocalStack na 4567)
docker compose -f docker-compose.test.yml up -d

# Roda tudo (90 testes)
bun run test

# Por camada
bun run test:unit          # 65 testes — domínio puro, sem I/O
bun run test:integration   # 21 testes — real DB + SQS
bun run test:concurrency   # 4 testes — pessimistic lock, 50 requests simultâneos

# Com cobertura
bun run test:coverage

# Reset do banco de testes (necessário ao mudar migrations)
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
bun run test
```

---

## API Reference

### Health

#### `GET /health/live`
Liveness probe.

```
200 OK  { "status": "ok" }
```

#### `GET /health/ready`
Readiness probe (verifica conexão com DB e SQS).

```
200 OK  { "status": "ok" }
```

---

### Wallets

#### `POST /wallets` — Criar carteira

```http
POST /wallets
Content-Type: application/json

{
  "playerId": "player-123",
  "initialBalance": {
    "amount": "1000.00",
    "currency": "BRL"
  }
}
```

**Resposta 201:**
```json
{
  "id": "uuid",
  "playerId": "player-123",
  "balance": { "amount": "1000.00", "currency": "BRL" },
  "version": 1
}
```

**Erros:** `409` se já existe carteira para o mesmo `playerId` + `currency`.

---

#### `GET /wallets/:walletId` — Consultar carteira

```http
GET /wallets/550e8400-e29b-41d4-a716-446655440000
```

**Resposta 200:**
```json
{
  "id": "uuid",
  "playerId": "player-123",
  "balance": { "amount": "900.00", "currency": "BRL" },
  "version": 3,
  "createdAt": "2026-11-05T19:00:00.000Z",
  "updatedAt": "2026-11-05T19:01:00.000Z"
}
```

---

#### `GET /wallets/:walletId/ledger` — Extrato (cursor-based)

```http
GET /wallets/550e8400.../ledger?limit=20
GET /wallets/550e8400.../ledger?cursor=eyJjcmVhdGVkQXQi...&limit=20
```

**Resposta 200:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "walletId": "uuid",
      "transactionId": "uuid",
      "direction": "DEBIT",
      "money": { "amount": "100.00", "currency": "BRL" },
      "balanceBefore": { "amount": "1000.00", "currency": "BRL" },
      "balanceAfter": { "amount": "900.00", "currency": "BRL" },
      "createdAt": "2026-11-05T19:01:00.000Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkQXQi...",
  "total": 42
}
```

---

#### `POST /wallets/:walletId/reconciliation` — Reconciliar

Reconstrói o saldo somando todos os lançamentos do ledger e compara com o saldo armazenado.

```http
POST /wallets/550e8400.../reconciliation
```

**Resposta 200:**
```json
{
  "walletId": "uuid",
  "storedBalance": { "amount": "900.00", "currency": "BRL" },
  "calculatedBalance": { "amount": "900.00", "currency": "BRL" },
  "difference": { "amount": "0.00", "currency": "BRL" },
  "consistent": true,
  "checkedEntries": 42
}
```

---

### Wagering

#### `POST /wagering/transactions` — Submeter transação

O header `Idempotency-Key` é **obrigatório**. Formato sugerido: `{providerId}:{externalTransactionId}`.

```http
POST /wagering/transactions
Content-Type: application/json
Idempotency-Key: provider-a:tx-external-001

{
  "providerId": "provider-a",
  "externalTransactionId": "tx-external-001",
  "playerId": "player-123",
  "walletId": "550e8400-e29b-41d4-a716-446655440000",
  "roundId": "round-99",
  "gameId": "slots-megaways",
  "kind": "BET",
  "money": { "amount": "50.00", "currency": "BRL" }
}
```

**`kind` aceito:** `BET` | `WIN` | `LOSS` | `REFUND` | `ROLLBACK`

Para `REFUND` e `ROLLBACK`, o campo `referenceExternalTransactionId` é obrigatório:

```json
{
  "kind": "REFUND",
  "referenceExternalTransactionId": "tx-external-001",
  ...
}
```

**Resposta 200:**
```json
{
  "transactionId": "uuid",
  "status": "PROCESSED",
  "balance": { "amount": "950.00", "currency": "BRL" },
  "idempotentReplay": false
}
```

**`status` possível:** `PROCESSED` | `REJECTED` | `PENDING_REFERENCE`

**`failureCode`** (presente quando `REJECTED`):

| Código | Significado |
|---|---|
| `INSUFFICIENT_FUNDS` | Saldo insuficiente para débito |
| `REFERENCE_NOT_FOUND` | Transação referenciada não existe |
| `REFERENCE_ALREADY_REVERSED` | Já existe um REFUND/ROLLBACK para essa referência |
| `INVALID_REFERENCE_KIND` | Tipo inválido de referência |
| `CURRENCY_MISMATCH` | Moedas diferentes |
| `AMOUNT_MISMATCH` | Valores diferentes entre transação e referência |
| `REFERENCE_EXHAUSTED` | Máximo de retentativas PENDING_REFERENCE atingido |
| `WALLET_NOT_FOUND` | Wallet não encontrada |

**Erros HTTP:** `422` sem Idempotency-Key · `409` mesma key com payload diferente

---

#### `GET /wagering/transactions/:transactionId` — Buscar por ID interno

```http
GET /wagering/transactions/550e8400-e29b-41d4-a716-446655440001
```

---

#### `GET /providers/:providerId/wagering/transactions/:externalTransactionId` — Buscar por ID externo

```http
GET /providers/provider-a/wagering/transactions/tx-external-001
```

**Resposta 200:**
```json
{
  "transactionId": "uuid",
  "status": "PROCESSED",
  "kind": "BET",
  "providerId": "provider-a",
  "externalTransactionId": "tx-external-001",
  "walletId": "uuid",
  "playerId": "player-123",
  "roundId": "round-99",
  "money": { "amount": "50.00", "currency": "BRL" },
  "failureCode": null,
  "processedAt": "2026-11-05T19:01:00.000Z",
  "createdAt": "2026-11-05T19:01:00.000Z"
}
```

---

## Coleções HTTP

As coleções ficam em [`docs/`](./docs/).

### Postman

1. Abra o Postman → **Import** → selecione `docs/postman-collection.json`
2. As variáveis de collection já estão pré-configuradas (`baseUrl`, `playerId`, etc.)
3. Rode **Create Wallet** primeiro — o script de teste salva o `walletId` automaticamente nas variáveis

### Insomnia

1. Abra o Insomnia → **Import** → selecione `docs/insomnia-collection.json`
2. Selecione o environment **Local** (canto superior direito)
3. Rode **Create Wallet** primeiro — o `afterResponseScript` salva `wallet_id` e `player_id` automaticamente

**Ordem sugerida:** Create Wallet → BET → WIN → REFUND → Reconcile

---

## Estrutura do projeto

```
src/
├── domain/                     # Regras de negócio puras (sem I/O)
│   ├── value-objects/money.vo  # Money imutável com Decimal.js
│   ├── wallet/                 # Aggregate root — debit/credit com lock semântico
│   ├── wager-transaction/      # Entidade com state machine
│   ├── wallet-ledger-entry/    # Imutável — validação aritmética no create()
│   └── messaging/              # Outbox + Inbox entities
├── application/
│   ├── wagering/               # Orquestração — idempotência, lock, ledger, outbox
│   └── wallet/                 # CRUD de carteira + reconciliação
├── infrastructure/
│   ├── persistence/
│   │   ├── migrations/         # 5 migrations versionadas
│   │   ├── entities/           # ORM entities (MikroORM v6)
│   │   └── repositories/       # Acesso a dados + pessimistic lock
│   └── messaging/
│       ├── sqs-consumer        # Long-poll, inbox dedup, ack só após commit
│       ├── outbox-publisher    # FOR UPDATE SKIP LOCKED, retry com backoff
│       └── pending-reference-worker
└── presentation/http/          # Controllers, DTOs, filtro de exceções
```
