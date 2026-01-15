import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
//import logoImage from 'figma:asset/2834f4ebc0639f27caf30154ca4ffe1fb709a28c.png';
//import sideImage from 'figma:asset/d48c20bfc841277fc03408a46fc17800a0da1847.png';
//import backgroundPattern from 'figma:asset/b601272a25414cb3deada5f16dd1157a53062d5c.png';

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(username, password);

    if (!result.success) {
      setError(result.error || 'Erro ao fazer login');
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-8 bg-gray-100"
      style={{
        backgroundImage: `url(${backgroundPattern})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      
      {/* Main Container - Two Columns */}
      <div className="w-full max-w-6xl flex rounded-3xl overflow-hidden shadow-2xl">
        
        {/* LEFT COLUMN - Institutional Image (60%) */}
        <div className="hidden lg:flex lg:w-[60%] bg-[#E8F4F8] items-center justify-center p-0">
          <img 
            src={sideImage} 
            alt="CuidAI - Monitore Inteligentemente o seu Hospital" 
            className="w-full h-full object-cover"
          />
        </div>

        {/* RIGHT COLUMN - Login Form (40%) */}
        <div className="w-full lg:w-[40%] bg-white flex items-center justify-center p-12">
          <div className="w-full max-w-md">
            
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <img 
                src={logoImage} 
                alt="CuidAI" 
                className="h-16 w-auto mb-3"
              />
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">CuidAI</h2>
                <p className="text-xs text-gray-500">Sistema Hospitalar Inteligente</p>
              </div>
            </div>

            {/* Step Indicator */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-[#0EA5E9] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">2</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900">
                  Login e senha
                </h1>
              </div>
              <p className="text-sm text-gray-600 ml-11">
                Insira seu login e senha abaixo
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Username Field */}
              <div>
                <label 
                  htmlFor="username" 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Nome do usuário
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Password Field */}
              <div>
                <label 
                  htmlFor="password" 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0EA5E9] hover:bg-[#0284C7] text-white py-3.5 px-4 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <span>Entrar</span>
                )}
              </button>

              {/* Forgot Password Link */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  className="text-sm text-[#0EA5E9] hover:text-[#0284C7] font-medium transition-colors"
                >
                  Esqueceu a sua senha?
                </button>
              </div>
            </form>

            {/* Demo Info */}
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center mb-2">
                Acesso de demonstração
              </p>
              <div className="text-center text-xs text-gray-600">
                <span className="font-medium">Usuário: </span>
                <span className="text-[#0EA5E9] font-semibold">admin</span>
                <span className="mx-2 text-gray-300">|</span>
                <span className="font-medium">Senha: </span>
                <span className="text-[#0EA5E9] font-semibold">admin</span>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
