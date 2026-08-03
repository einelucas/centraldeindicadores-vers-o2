<script setup lang="ts">
const route = useRoute()

const navigation = [
  { label: "Migração", to: "/dashboard" },
]

const futureModules = [
  "Scorecard 2026",
  "Aprovação de RDO",
  "IDP — Cronograma",
  "RNC",
  "5S",
  "Taxa de acidentes",
]
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">CI</span>
        <div>
          <strong>Central de Indicadores</strong>
          <small>Nuxt + FastAPI</small>
        </div>
      </div>

      <nav class="navigation" aria-label="Navegação principal">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          :class="{ active: route.path === item.to }"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="future-modules">
        <span>Próximos módulos</span>
        <ul>
          <li v-for="module in futureModules" :key="module">{{ module }}</li>
        </ul>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <p class="eyebrow">Migração incremental</p>
          <h1>Nova arquitetura</h1>
        </div>
        <span class="environment-badge">Fase 1</span>
      </header>

      <slot />
    </main>
  </div>
</template>
