import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#304F7E", // Azul principal
          dark: "#213758", // Azul escuro
          light: "#007CC5", // Azul claro
        },
        accent: "#EAA239", // Laranja
        neutralbrand: "#BDBFC1", // Cinza
        success: "#609346", // Verde
        danger: "#C0392B", // Vermelho
        canvas: "#F4F5F7", // Background
      },
      fontFamily: {
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
