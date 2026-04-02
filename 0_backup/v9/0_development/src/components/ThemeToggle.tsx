import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
    className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className={`
                relative flex items-center justify-center
                w-8 h-8 rounded-lg
                bg-th-card border border-th-edge
                text-th-secondary hover:text-th-primary
                hover:bg-th-input
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-indigo-500
                ${className}
            `}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {theme === 'dark' ? (
                <Sun size={16} className="text-amber-400" />
            ) : (
                <Moon size={16} className="text-indigo-500" />
            )}
        </button>
    );
};
