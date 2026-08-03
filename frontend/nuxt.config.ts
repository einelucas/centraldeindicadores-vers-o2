export default defineNuxtConfig({
  compatibilityDate: "2026-08-01",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1",
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: "pt-BR" },
      title: "Central de Indicadores",
      meta: [
        {
          name: "description",
          content: "Central de Indicadores — migração Nuxt e FastAPI",
        },
      ],
    },
  },
})
