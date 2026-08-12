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
        dark: '#0D1117',
        surface: '#161B22',
        'surface-elevated': '#21262D',
        'light-dark': '#21262D',
        'semi-dark': '#21262D',
        border: '#30363D',
        'kinetic-blue': {
          DEFAULT: '#2F81F7',
          hover: '#58A6FF',
          light: '#79C0FF',
          dark: '#1F6FEB'
        },
        'kinetic-gray': '#8B949E',
        'kinetic-light': '#F0F6FC',
        success: '#3FB950',
        error: '#F85149'
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
