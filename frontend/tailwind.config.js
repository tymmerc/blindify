/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: "#22d3ee",
          purple: "#8b5cf6",
          dark: "#0a0a0f",
        },
      },
      backgroundImage: {
        "gradient-main": "linear-gradient(135deg, #09090f 0%, #111122 50%, #1a1a2e 100%)",
        "gradient-accent": "linear-gradient(90deg, #22d3ee, #8b5cf6)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(139,92,246,0.4), 0 0 40px rgba(34,211,238,0.2)",
      },
      borderRadius: {
        xl2: "1.5rem",
      },
    },
  },
  plugins: [],
};
