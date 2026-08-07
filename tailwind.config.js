/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/js/**/*.js",
    "./src/**/*.ts"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: '#101213',
        'light-dark': '#1a1c1e',
        'semi-dark': '#2b2f32',
        'kinetic-blue': {
          DEFAULT: '#1873d3',
          hover: '#1462b8',
          light: '#3b8ded',
          glow: 'rgba(24, 115, 211, 0.25)'
        },
        'kinetic-gray': '#686a6b',
        'kinetic-light': '#e6e8e9'
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Code', 'SF Mono', 'monospace']
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px'
      },
      boxShadow: {
        'soft-md': '0 6px 12px -10px rgba(0, 0, 0, 0.4)',
        'soft-lg': '0 8px 18px -14px rgba(0, 0, 0, 0.5)',
        'soft-2xl': '0 18px 44px -28px rgba(0, 0, 0, 0.6)',
        'blue-glow': '0 0 20px rgba(24, 115, 211, 0.2)'
      },
      maxWidth: {
        'container': '1400px'
      },
      spacing: {
        '56': '14rem', // 224px sidebar
        '16': '4rem'   // 64px navbar
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '350ms'
      }
    }
  },
  plugins: []
};
