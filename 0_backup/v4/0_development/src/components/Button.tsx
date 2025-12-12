import React from 'react';
import { useI18n } from '../i18n';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'danger' | 'secondary' | 'ghost' | 'success' | 'warning';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    loadingText?: string;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading,
    loadingText,
    className = '',
    disabled,
    ...props
}) => {
    const { t } = useI18n();

    const baseStyle = "rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900";

    const variants = {
        primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 focus:ring-indigo-500",
        danger: "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30 focus:ring-red-500",
        secondary: "bg-slate-700 hover:bg-slate-600 text-slate-100 focus:ring-slate-500",
        ghost: "bg-transparent hover:bg-slate-800 text-slate-300 focus:ring-slate-500",
        success: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 focus:ring-emerald-500",
        warning: "bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/30 focus:ring-amber-500"
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-3 text-lg"
    };

    return (
        <button
            className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {loadingText || t('common.processing')}
                </>
            ) : children}
        </button>
    );
};
