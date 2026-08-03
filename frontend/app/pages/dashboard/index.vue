<script setup lang="ts">
type HealthResponse = {
  status: "ok"
  service: string
  environment: string
}

type DatabaseHealthResponse = {
  status: "ok" | "not_configured" | "unavailable"
  detail: string
}

type ModuleStatus = {
  key: string
  label: string
  state: "foundation" | "pending" | "in_progress" | "completed"
  order: number
}

type MigrationResponse = {
  strategy: string
  database_strategy: string
  modules: ModuleStatus[]
}

const apiBase = useApiBase()

const { data: health, error: healthError } = await useFetch<HealthResponse>("/health", {
  baseURL: apiBase,
  server: false,
})

const { data: database } = await useFetch<DatabaseHealthResponse>("/health/database", {
  baseURL: apiBase,
  server: false,
})

const { data: migration, error: migrationError } = await useFetch<MigrationResponse>(
  "/migration/modules",
  {
    baseURL: apiBase,
    server: false,
  },
)

function stateLabel(state: ModuleStatus["state"]): string {
  const labels = {
    foundation: "Base criada",
    pending: "Pendente",
    in_progress: "Em migração",
    completed: "Concluído",
  }
  return labels[state]
}
</script>

<template>
  <section class="dashboard-grid">
    <article class="hero-card">
      <div>
        <p class="eyebrow">Estratégia</p>
        <h2>Executar a nova stack ao lado da aplicação atual</h2>
        <p>
          O Next.js continua operacional enquanto as rotas, regras de negócio e telas são
          migradas e comparadas módulo por módulo.
        </p>
      </div>
      <div class="status-stack">
        <span :class="['status-pill', health?.status === 'ok' ? 'success' : 'neutral']">
          API: {{ health?.status === "ok" ? "online" : "aguardando" }}
        </span>
        <span :class="['status-pill', database?.status === 'ok' ? 'success' : 'neutral']">
          Banco: {{ database?.status ?? "aguardando" }}
        </span>
      </div>
    </article>

    <article v-if="healthError || migrationError" class="warning-card">
      <strong>Backend ainda não acessível.</strong>
      <p>Inicie o FastAPI na porta 8000 e confirme o valor de NUXT_PUBLIC_API_BASE.</p>
    </article>

    <article class="info-card">
      <p class="eyebrow">Banco de dados</p>
      <h3>Schema preservado</h3>
      <p>{{ migration?.database_strategy ?? "Carregando estratégia..." }}</p>
      <small v-if="database">Diagnóstico: {{ database.detail }}</small>
    </article>

    <article class="info-card">
      <p class="eyebrow">Backend</p>
      <h3>{{ health?.service ?? "Central de Indicadores API" }}</h3>
      <p>FastAPI com SQLAlchemy assíncrono, PostgreSQL e documentação OpenAPI.</p>
      <small>Ambiente: {{ health?.environment ?? "development" }}</small>
    </article>

    <article class="module-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Ordem recomendada</p>
          <h3>Módulos da migração</h3>
        </div>
        <span>{{ migration?.modules.length ?? 0 }} etapas</span>
      </div>

      <ol class="module-list">
        <li v-for="module in migration?.modules ?? []" :key="module.key">
          <span class="module-order">{{ module.order }}</span>
          <div>
            <strong>{{ module.label }}</strong>
            <small>{{ module.key }}</small>
          </div>
          <span :class="['state-badge', module.state]">{{ stateLabel(module.state) }}</span>
        </li>
      </ol>
    </article>
  </section>
</template>
