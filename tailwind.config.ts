import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // Pristine Light palette
                pristine: {
                    bg: '#FAFAFA',
                    'bg-secondary': '#F3F4F6',
                    card: '#FFFFFF',
                },
                // Typography
                ink: {
                    primary: '#111827',
                    secondary: '#4B5563',
                    muted: '#9CA3AF',
                },
                // Borders
                border: {
                    subtle: '#E5E7EB',
                    hover: '#D1D5DB',
                },
                // Accents
                accent: {
                    blue: '#2563EB',
                    'blue-glow': 'rgba(37, 99, 235, 0.1)',
                    green: '#0D9488',
                    amber: '#D97706',
                    purple: '#7C3AED',
                },
                // Risk spectrum
                risk: {
                    baseline: '#2563EB',
                    medium: '#D97706',
                    high: '#F59E0B',
                    catastrophic: '#D90429', // Crimson for corruption signals
                },
            },
            fontFamily: {
                header: ['Outfit', 'Inter', 'sans-serif'],
                body: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
                hindi: ['Noto Sans Devanagari', 'sans-serif'],
            },
            boxShadow: {
                // Minimal shadows — rely on typography and spacing
                subtle: '0 4px 6px -1px rgba(0,0,0,.05), 0 2px 4px -1px rgba(0,0,0,.03)',
                hover: '0 10px 15px -3px rgba(0,0,0,.08), 0 4px 6px -2px rgba(0,0,0,.04)',
            },
            borderRadius: {
                panel: '16px',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease forwards',
                'fade-in-delay-1': 'fadeIn 0.5s ease forwards 0.1s',
                'fade-in-delay-2': 'fadeIn 0.5s ease forwards 0.2s',
                'fade-in-delay-3': 'fadeIn 0.5s ease forwards 0.3s',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};

export default config;