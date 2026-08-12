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
        dark: '#0a0b0c',
        surface: '#121416',
        'surface-elevated': '#181a1d',
        'light-dark': '#1a1c1e',
        'semi-dark': '#232629',
        'kinetic-blue': {
          DEFAULT: '#1873d3',
          hover: '#1462b8',
          light: '#3b8ded',
          dark: '#0f529a'
        },
        'kinetic-gray': '#686a6b',
        'kinetic-light': '#e6e8e9'
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'SF Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px'
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.3)',
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
        'soft-md': '0 6px 12px -10px rgba(0, 0, 0, 0.4)'
      },
      maxWidth: {
        'container': '1400px',
        'wide': '1700px'
      },
      spacing: {
        '60': '15rem', // 240px sidebar
        '14': '3.5rem' // 56px header
      }
    }
  },
  plugins: []
};
