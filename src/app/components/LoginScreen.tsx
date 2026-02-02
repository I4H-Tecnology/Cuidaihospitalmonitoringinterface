import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSystemToast } from './ui/SystemToast';
import logoImage from "@/assets/logo.png";
import sideImage from "@/assets/login1.png";
import backgroundPattern from "@/assets/login2.png";

export function LoginScreen() {
  const { login } = useAuth();
  const { showToast } = useSystemToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ username: false, password: false });
  const tenant = localStorage.getItem('tenant');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const nextErrors = {
      username: !trimmedUsername,
      password: !password,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) {
      return;
    }
    setIsLoading(true);

    const result = await login(trimmedUsername, password);

    if (!result.success) {
      showToast({ message: result.error || 'Não foi possível entrar. Verifique seus dados.' });
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
      <div className="w-full max-w-6xl flex rounded-3xl overflow-hidden shadow-2xl">
        <div className="hidden lg:flex lg:w-[60%] bg-[#E8F4F8] items-center justify-center">
          <img
            src={sideImage}
            alt="MedSignal - Monitore Inteligentemente o seu Hospital"
            className="w-full h-auto object-contain"
          />
        </div>

        <div className="w-full lg:w-[40%] bg-white flex items-center justify-center p-12">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              <img
                src={logoImage}
                alt="MedSignal"
                className="h-16 w-auto mb-3"
              />
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">MedSignal</h2>
                <p className="text-xs text-gray-500">Sistema Hospitalar Inteligente</p>
              </div>
            </div>

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
              {tenant && (
                <p className="text-xs text-gray-500 ml-11 mt-2">
                  Tenant ativo: <span className="font-semibold text-gray-700">{tenant}</span>
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Nome do usuario
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username) {
                      setFieldErrors((prev) => ({ ...prev, username: false }));
                    }
                  }}
                  className={`block w-full px-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900 ${
                    fieldErrors.username ? 'border-[#EF4444]' : 'border-gray-300'
                  }`}
                  disabled={isLoading}
                />
              </div>

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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: false }));
                    }
                  }}
                  className={`block w-full px-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900 ${
                    fieldErrors.password ? 'border-[#EF4444]' : 'border-gray-300'
                  }`}
                  disabled={isLoading}
                />
              </div>

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

              <div className="text-center pt-2">
                <button
                  type="button"
                  className="text-sm text-[#0EA5E9] hover:text-[#0284C7] font-medium transition-colors"
                >
                  Esqueceu a sua senha?
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
